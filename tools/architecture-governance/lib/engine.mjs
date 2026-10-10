// engine.mjs — ownership check engine (P0-W2).
//
// Builds the real import-edge graph over workspace packages (walking source
// trees with the vendored scanner + resolver) and evaluates every layer rule
// from MODULE-OWNERSHIP.yaml against it. Pure library module: no console
// output, no process.exit — the CLI owns presentation.

import fs from "node:fs";
import path from "node:path";
import { scanImports, isCodeFile } from "./scanner.mjs";
import { resolveSpecifier } from "./resolver.mjs";
import { discoverWorkspacePackages, walkCodeFiles, findOwningPackage } from "./workspace.mjs";
import { loadPolicy, matchesForbiddenTarget } from "./policy.mjs";

/**
 * @param {string} root absolute repo root
 * @param {{include?: string[]}} scope optional package-dir filter (tests)
 */
export function buildGraph(root, scope) {
  const packages = discoverWorkspacePackages(root);
  const inScope = scope ? packages.filter((pkg) => scope.includes(pkg.dir)) : packages;
  const inScopeDirs = new Set(inScope.map((pkg) => pkg.dir));

  // 1. Collect code files per package.
  const filesByPackage = new Map();
  const allFiles = [];
  for (const pkg of inScope) {
    const files = walkCodeFiles(pkg.absDir).filter(isCodeFile);
    filesByPackage.set(pkg.dir, files);
    allFiles.push(...files);
  }

  // 2. Extract occurrences per file.
  const occurrencesByFile = new Map();
  for (const file of allFiles) {
    const source = fs.readFileSync(file, "utf8");
    occurrencesByFile.set(file, scanImports(source));
  }

  // 3. Resolve each occurrence to package-level edges.
  /** @type {Map<string, {sourcePkg: string, targetPkg: string, specifier: string, file: string, line: number, kind: string, typeOnly: boolean, classification: string, targetFile: string|null, deepImport: boolean, deepImportReason: string|null, crossPackageRelative: boolean}[]>} */
  const edgeOccurrences = new Map();
  const unresolved = [];
  for (const file of allFiles) {
    const owner = findOwningPackage(file, packages);
    if (!owner || !inScopeDirs.has(owner.dir)) continue;
    for (const occurrence of occurrencesByFile.get(file) ?? []) {
      const resolved = resolveSpecifier(occurrence, file, packages, owner.absDir);
      if (resolved.classification === "external" || resolved.classification === "builtin") {
        if (resolved.classification === "external" && !isLikelyDependency(root, owner, resolved.specifier)) {
          unresolved.push({ file, specifier: resolved.specifier, line: resolved.line });
        }
        continue;
      }
      const targetPkgDir = targetPackageDir(resolved, owner, packages);
      if (!targetPkgDir || targetPkgDir === owner.dir) continue; // intra-package edge
      if (!inScopeDirs.has(targetPkgDir) && scope) continue; // out-of-scope target
      const key = `${owner.dir} -> ${targetPkgDir}`;
      const list = edgeOccurrences.get(key) ?? [];
      list.push({
        sourcePkg: owner.dir,
        targetPkg: targetPkgDir,
        specifier: resolved.specifier,
        file: path.relative(root, file),
        line: resolved.line,
        kind: resolved.kind,
        typeOnly: resolved.typeOnly,
        classification: resolved.classification,
        targetFile: resolved.targetFile ? path.relative(root, resolved.targetFile) : null,
        deepImport: resolved.deepImport,
        deepImportReason: resolved.deepImportReason,
        crossPackageRelative: resolved.crossPackageRelative,
      });
      edgeOccurrences.set(key, list);
    }
  }

  const edges = Array.from(edgeOccurrences.entries())
    .map(([key, occurrences]) => ({
      key,
      sourcePkg: occurrences[0].sourcePkg,
      targetPkg: occurrences[0].targetPkg,
      occurrences,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { packages, inScope, filesByPackage, edges, unresolved };
}

function targetPackageDir(resolved, owner, packages) {
  if (resolved.classification === "workspace") {
    return resolved.targetPackage ? resolved.targetPackage.dir : null;
  }
  // relative/alias edges that escaped the package boundary
  if (resolved.targetFile) {
    const target = findOwningPackage(resolved.targetFile, packages);
    return target ? target.dir : null;
  }
  return null;
}

function isLikelyDependency(root, owner, specifier) {
  // External specifiers that appear in the owner's dependency block (or any
  // workspace package's, as fallback) are legitimately installed externals.
  const name = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(owner.absDir, "package.json"), "utf8"));
    const deps = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    if (deps.has(name)) return true;
  } catch {
    // fall through to root manifest check
  }
  try {
    const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const rootDeps = new Set([
      ...Object.keys(rootManifest.dependencies ?? {}),
      ...Object.keys(rootManifest.devDependencies ?? {}),
      ...Object.keys(rootManifest.peerDependencies ?? {}),
    ]);
    if (rootDeps.has(name)) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Evaluate layer rules against the graph.
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {ReturnType<typeof loadPolicy>} policy
 * @param {string} root
 */
export function evaluateRules(graph, policy, root) {
  const declared = new Map();
  for (const pkg of graph.inScope) {
    const layer = policy.packageLayers[pkg.dir] ?? null;
    declared.set(pkg.dir, layer);
  }

  const packages_ = graph.inScope.map((pkg) => {
    const layer = declared.get(pkg.dir);
    const deps = graph.edges
      .filter((edge) => edge.sourcePkg === pkg.dir)
      .map((edge) => ({ target: edge.targetPkg, occurrences: edge.occurrences.length }));
    const dependents = graph.edges
      .filter((edge) => edge.targetPkg === pkg.dir)
      .map((edge) => ({ source: edge.sourcePkg, occurrences: edge.occurrences.length }));
    return {
      dir: pkg.dir,
      name: pkg.name,
      declaredLayer: layer,
      dependencies: deps,
      dependents,
    };
  });

  /** @type {{rule: string, severity: string, sourcePkg: string|null, targetPkg: string|null, detail: string, occurrences: object[]|null}[]} */
  const violations = [];

  // R1: unmapped package
  for (const pkg of packages_) {
    if (!pkg.declaredLayer) {
      violations.push({
        rule: "R1-unmapped-package",
        severity: "error",
        sourcePkg: pkg.dir,
        targetPkg: null,
        detail: `no package_layers annotation; layer cannot be determined`,
        occurrences: null,
      });
    }
  }

  // Per-edge layer rules (only when both ends are mapped).
  for (const edge of graph.edges) {
    const sourceLayer = declared.get(edge.sourcePkg);
    const targetLayer = declared.get(edge.targetPkg);
    if (!sourceLayer || !targetLayer) continue;
    const sourceRules = policy.layers[sourceLayer];

    // R2: must_not_depend_on
    for (const forbidden of sourceRules.mustNotDependOn) {
      if (matchesForbiddenTarget(forbidden, targetLayer, edge.targetPkg)) {
        violations.push({
          rule: "R2-must-not-depend-on",
          severity: "error",
          sourcePkg: edge.sourcePkg,
          targetPkg: edge.targetPkg,
          detail: `layer "${sourceLayer}" must_not_depend_on "${forbidden}" (target layer "${targetLayer}")`,
          occurrences: edge.occurrences,
        });
      }
    }

    // R3: dependency outside may_depend_on allow-list
    if (!sourceRules.mustNotDependOn.includes(targetLayer)) {
      if (!sourceRules.mayDependOn.includes(targetLayer)) {
        violations.push({
          rule: "R3-not-in-may-depend-on",
          severity: "error",
          sourcePkg: edge.sourcePkg,
          targetPkg: edge.targetPkg,
          detail: `layer "${sourceLayer}" -> layer "${targetLayer}" is not in may_depend_on [${sourceRules.mayDependOn.join(", ")}]`,
          occurrences: edge.occurrences,
        });
      }
    }
  }

  // R4: cycles between packages (forbid_cycles).
  if (policy.dependencyRules.forbid_cycles) {
    const adjacency = new Map();
    for (const pkg of packages_) adjacency.set(pkg.dir, new Set());
    for (const edge of graph.edges) {
      adjacency.get(edge.sourcePkg)?.add(edge.targetPkg);
    }
    const visited = new Set();
    const stack = [];
    const stackSet = new Set();
    /** @type {string[][]} */
    const cycles = [];
    const visit = (node) => {
      visited.add(node);
      stack.push(node);
      stackSet.add(node);
      for (const next of adjacency.get(node) ?? []) {
        if (stackSet.has(next)) {
          const cycleStart = stack.indexOf(next);
          cycles.push([...stack.slice(cycleStart), next]);
        } else if (!visited.has(next)) {
          visit(next);
        }
      }
      stack.pop();
      stackSet.delete(node);
    };
    for (const node of Array.from(adjacency.keys()).sort()) {
      if (!visited.has(node)) visit(node);
    }
    for (const cycle of dedupeCycles(cycles)) {
      violations.push({
        rule: "R4-cycle",
        severity: "error",
        sourcePkg: null,
        targetPkg: null,
        detail: `package dependency cycle: ${cycle.join(" -> ")}`,
        occurrences: null,
      });
    }
  }

  // R5: deep imports (forbid_deep_imports).
  if (policy.dependencyRules.forbid_deep_imports) {
    for (const edge of graph.edges) {
      const deep = edge.occurrences.filter((occ) => occ.deepImport);
      if (deep.length > 0) {
        violations.push({
          rule: "R5-deep-import",
          severity: "error",
          sourcePkg: edge.sourcePkg,
          targetPkg: edge.targetPkg,
          detail: `${deep.length} import(s) bypass the target's exports boundary (${deep[0].deepImportReason})`,
          occurrences: deep,
        });
      }
    }
  }

  // R6: cross-package relative imports (boundary bypass).
  for (const edge of graph.edges) {
    const cross = edge.occurrences.filter((occ) => occ.crossPackageRelative);
    if (cross.length > 0) {
      violations.push({
        rule: "R6-cross-package-relative",
        severity: "error",
        sourcePkg: edge.sourcePkg,
        targetPkg: edge.targetPkg,
        detail: `${cross.length} relative/alias import(s) cross the package boundary instead of using the package name`,
        occurrences: cross,
      });
    }
  }

  // R7: domain contracts must be framework-free
  // (dependency_rules.domain_contracts_framework_free).
  if (policy.dependencyRules.domain_contracts_framework_free) {
    violations.push(...checkFrameworkFree(graph, declared, root));
  }

  const rulesEvaluated = {
    layerRules: Object.keys(policy.layers).length,
    packageAnnotations: Object.keys(policy.packageLayers).length,
    edges: graph.edges.length,
    dependencyRules: Object.keys(policy.dependencyRules).length,
  };

  return { packages: packages_, violations, declared, rulesEvaluated };
}

// Framework/runtime packages that provider-neutral contracts must not
// import (UI frameworks, app runtimes, heavy client libs). Documented list;
// extension is a policy change, not a code hack.
const FRAMEWORK_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "vue",
  "svelte",
  "angular",
  "@angular/core",
  "electron",
  "next",
  "express",
  "@tanstack/react-query",
  "@tanstack/react-virtual",
  "tailwindcss",
  "d3",
  "zustand",
  "redux",
  "@reduxjs/toolkit",
  "electron/main",
  "electron/renderer",
  "electron/common",
]);

function checkFrameworkFree(graph, declared, root) {
  const violations = [];
  for (const pkg of graph.inScope) {
    const layer = declared.get(pkg.dir);
    if (layer !== "contracts") continue;
    const files = graph.filesByPackage.get(pkg.dir) ?? [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const occurrence of scanImports(source)) {
        const rootName = occurrence.specifier.startsWith("@")
          ? occurrence.specifier.split("/").slice(0, 2).join("/")
          : occurrence.specifier.split("/")[0];
        if (FRAMEWORK_PACKAGES.has(occurrence.specifier) || FRAMEWORK_PACKAGES.has(rootName)) {
          violations.push({
            rule: "R7-contracts-framework-import",
            severity: "error",
            sourcePkg: pkg.dir,
            targetPkg: null,
            detail: `contracts-layer package imports framework/runtime "${occurrence.specifier}" (domain_contracts_framework_free)`,
            occurrences: [
              {
                specifier: occurrence.specifier,
                file: path.relative(root, file),
                line: occurrence.line,
                kind: occurrence.kind,
                typeOnly: occurrence.typeOnly,
                classification: "external",
                targetFile: null,
                deepImport: false,
                deepImportReason: null,
                crossPackageRelative: false,
              },
            ],
          });
        }
      }
    }
  }
  return violations;
}

function dedupeCycles(cycles) {
  const seen = new Set();
  const unique = [];
  for (const cycle of cycles) {
    const nodes = Array.from(new Set(cycle)).sort().join("|");
    if (seen.has(nodes)) continue;
    seen.add(nodes);
    unique.push(cycle);
  }
  return unique;
}

/**
 * Attach a severity override matrix (baseline mode vs strict mode).
 * In BASELINE mode unmapped packages are "warn" (honest, expected); in
 * STRICT mode everything is an error.
 */
export function applyMode(violations, mode) {
  if (mode === "strict") return violations;
  return violations.map((violation) =>
    violation.rule === "R1-unmapped-package"
      ? { ...violation, severity: "warn" }
      : violation,
  );
}
