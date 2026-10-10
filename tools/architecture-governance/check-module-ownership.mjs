#!/usr/bin/env node
// check-module-ownership.mjs — P0-W2 ownership validator CLI.
//
// Usage:
//   node tools/architecture-governance/check-module-ownership.mjs
//     [--root <repo>]                    default: process.cwd()
//     [--mode baseline|strict]           default: strict (gate semantics)
//     [--out <report.json>]              default: docs/architecture-governance/reports/module-ownership-report.json
//     [--json-stdout]                    print the full machine report to stdout
//     [--max-occurrences <n>]            cap per-violation occurrences in the report (default 20)
//     [--scope pkgDir,pkgDir]            restrict to specific package dirs (used by tests)
//     [--stamp]                          include a generated_at timestamp (off by default: deterministic reports)
//
// Exit codes: 0 = no error-severity violations; 1 = error-severity
// violations found (or any tool failure); 2 = usage error.
// A violation found is a DELIVERABLE, not a failure — exit 1 with a complete
// report is the honest baseline outcome for the inherited tree.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildGraph, evaluateRules, applyMode } from "./lib/engine.mjs";
import { loadPolicy, exampleHintsWithoutPackages } from "./lib/policy.mjs";

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    mode: "strict",
    out: undefined,
    jsonStdout: false,
    maxOccurrences: 20,
    scope: null,
    stamp: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--root":
        options.root = path.resolve(argv[++i]);
        break;
      case "--mode": {
        const value = argv[++i];
        if (value !== "baseline" && value !== "strict") {
          process.stderr.write(`usage: --mode must be baseline|strict\n`);
          process.exit(2);
        }
        options.mode = value;
        break;
      }
      case "--out": {
        const value = argv[++i];
        options.out = value === "-" ? "-" : path.resolve(options.root, value);
        break;
      }
      case "--json-stdout":
        options.jsonStdout = true;
        break;
      case "--max-occurrences":
        options.maxOccurrences = Number(argv[++i]);
        break;
      case "--scope":
        options.scope = argv[++i].split(",").map((item) => item.trim()).filter(Boolean);
        break;
      case "--stamp":
        options.stamp = true;
        break;
      default:
        process.stderr.write(`usage: unknown argument "${arg}"\n`);
        process.exit(2);
    }
  }
  return options;
}

function capOccurrences(violations, cap) {
  return violations.map((violation) => {
    if (!violation.occurrences) return { ...violation, occurrences_capped: false };
    if (violation.occurrences.length <= cap) {
      return { ...violation, occurrences_capped: false };
    }
    return {
      ...violation,
      occurrences: violation.occurrences.slice(0, cap),
      occurrences_total: violation.occurrences.length,
      occurrences_capped: true,
    };
  });
}

function severityRank(severity) {
  return severity === "error" ? 0 : 1;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const policyPath = "spec/architecture/MODULE-OWNERSHIP.yaml";
  const policy = loadPolicy(options.root, policyPath);
  const graph = buildGraph(options.root, options.scope);

  // Fail closed on stale annotations: every package_layers target must be a
  // discovered workspace package in scope. A dangling annotation means the
  // policy file drifted from the tree and every mapped-layer guarantee is
  // suspect, so we stop and report instead of silently skipping.
  const scopeSet = new Set(graph.inScope.map((pkg) => pkg.dir));
  const staleAnnotations = Object.keys(policy.packageLayers).filter((dir) => !scopeSet.has(dir));
  if (staleAnnotations.length > 0) {
    process.stderr.write(
      `module-ownership validator: stale package_layers annotations (not workspace packages in scope): ${staleAnnotations.join(", ")}\n`,
    );
    process.exitCode = 1;
    return 1;
  }

  const evaluation = evaluateRules(graph, policy, options.root);
  const violations = applyMode(evaluation.violations, options.mode);

  const mapped = evaluation.packages.filter((pkg) => pkg.declaredLayer).length;
  const unmapped = evaluation.packages.length - mapped;
  const bySeverity = { error: 0, warn: 0 };
  const byRule = {};
  for (const violation of violations) {
    bySeverity[violation.severity] = (bySeverity[violation.severity] ?? 0) + 1;
    byRule[violation.rule] = (byRule[violation.rule] ?? 0) + 1;
  }

  const report = {
    schema: "payswap3.architecture-governance.module-ownership-report/1",
    validator: "tools/architecture-governance/check-module-ownership.mjs",
    policy_file: policyPath,
    mode: options.mode,
    root: path.basename(options.root),
    ...(options.stamp ? { generated_at: new Date().toISOString() } : {}),
    summary: {
      packages_checked: evaluation.packages.length,
      packages_mapped: mapped,
      packages_unmapped: unmapped,
      import_edges: graph.edges.length,
      layer_rules: evaluation.rulesEvaluated.layerRules,
      violations_total: violations.length,
      violations_by_severity: bySeverity,
      violations_by_rule: byRule,
      unresolved_external_specifiers: graph.unresolved.length,
    },
    packages: evaluation.packages.map((pkg) => ({
      dir: pkg.dir,
      name: pkg.name,
      declared_layer: pkg.declaredLayer,
      status: pkg.declaredLayer
        ? violations.some((v) => v.severity === "error" && (v.sourcePkg === pkg.dir || v.targetPkg === pkg.dir))
          ? "FAIL"
          : "PASS"
        : "UNMAPPED",
      dependencies: pkg.dependencies,
      dependents: pkg.dependents,
      dependency_layers: Array.from(
        new Set(
          pkg.dependencies
            .map((dep) => ({ dir: dep.target, layer: policy.packageLayers[dep.target] ?? null }))
            .filter((dep) => dep.layer)
            .map((dep) => dep.layer),
        ),
      ),
    })),
    violations: capOccurrences(
      [...violations].sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          a.rule.localeCompare(b.rule) ||
          (a.sourcePkg ?? "").localeCompare(b.sourcePkg ?? "") ||
          (a.targetPkg ?? "").localeCompare(b.targetPkg ?? ""),
      ),
      options.maxOccurrences,
    ),
    unresolved_specifiers: graph.unresolved.slice(0, 50),
    example_hints_without_packages: exampleHintsWithoutPackages(
      policy,
      graph.inScope.map((pkg) => pkg.dir),
    ),
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const finalOut =
    options.out === "-"
      ? null
      : options.out ?? path.join(
          options.root,
          "docs/architecture-governance/reports/module-ownership-report.json",
        );
  if (finalOut) {
    fs.mkdirSync(path.dirname(finalOut), { recursive: true });
    fs.writeFileSync(finalOut, json, "utf8");
  }
  if (options.jsonStdout) {
    process.stdout.write(json);
  } else {
    printSummary(report, policy);
  }

  const exitCode = bySeverity.error > 0 ? 1 : 0;
  process.exitCode = exitCode;
  return exitCode;
}

function printSummary(report, policy) {
  const out = [];
  out.push(`module-ownership validator (mode=${report.mode})`);
  out.push(
    `packages: ${report.summary.packages_checked} checked, ${report.summary.packages_mapped} mapped, ${report.summary.packages_unmapped} unmapped`,
  );
  out.push(
    `edges: ${report.summary.import_edges} package-level import edges; layer rules: ${report.summary.layer_rules}`,
  );
  out.push(
    `violations: ${report.summary.violations_total} total (${report.summary.violations_by_severity.error ?? 0} error / ${report.summary.violations_by_severity.warn ?? 0} warn)`,
  );
  for (const [rule, count] of Object.entries(report.summary.violations_by_rule)) {
    out.push(`  ${rule}: ${count}`);
  }
  out.push("");
  out.push("per-package (declared layer -> actual dependency layers, PASS/FAIL):");
  for (const pkg of report.packages) {
    const layers = pkg.dependency_layers.length > 0 ? pkg.dependency_layers.join("+") : "(none)";
    out.push(
      `  ${pkg.status.padEnd(8)} ${pkg.dir} [${pkg.declared_layer ?? "UNMAPPED"}] -> ${layers}`,
    );
  }
  out.push("");
  out.push("violations:");
  if (report.violations.length === 0) {
    out.push("  NONE");
  }
  for (const violation of report.violations) {
    const where = violation.sourcePkg
      ? `${violation.sourcePkg}${violation.targetPkg ? ` -> ${violation.targetPkg}` : ""}`
      : (violation.detail.match(/cycle: (.*)/)?.[1] ?? "");
    const sample = violation.occurrences?.[0];
    const sampleText = sample ? ` e.g. ${sample.file}:${sample.line} '${sample.specifier}'` : "";
    out.push(
      `  [${violation.severity.toUpperCase()}] ${violation.rule}: ${where} — ${violation.detail}${sampleText}`,
    );
  }
  process.stdout.write(`${out.join("\n")}\n`);
}

main();
