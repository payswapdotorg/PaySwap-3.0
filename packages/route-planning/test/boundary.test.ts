import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard for @payswap/route-planning (the
 * zero-sibling leaf-in-flight law, ADR-0009 D2):
 *
 * - src contains ONLY relative imports: no @payswap/* sibling, no
 *   @zcode/* platform package, no vendor SDK, no node: builtin (every
 *   cross-package surface is a LOCAL STRUCTURAL PIN in src/pins/; every
 *   REAL engine is an injected fail-closed port);
 * - test imports are relative (the package itself, its fixtures, and the
 *   ESTABLISHED cross-package relative SOURCE imports that bind the real
 *   engines at the test tier), node builtins and vitest;
 * - the DETERMINISM LAW: no fetch, no Node globals (Buffer/process), no
 *   timers, no pseudo-randomness, no wall-clock reads, no float parsing
 *   in src;
 * - tsconfig.json carries EXACTLY ONE documented paths entry — the
 *   type-only `@payswap/trust` mapping that lets the test tier type-check
 *   the REAL capability source (whose own type-only @payswap/trust imports
 *   cannot resolve from this package) — mirroring the capability lane's
 *   tsconfig precedent VERBATIM (packages/capability/tsconfig.json carries
 *   the identical mapping for the identical reason); src itself never
 *   imports @payswap/trust (the pin-only law above);
 * - the manifest exposes the core barrel with devDependencies EXACTLY
 *   typescript + vitest;
 * - every file (src AND test) is <= 400 lines; no TS enum;
 * - the exact census pins below (18 src / 17 test-suite / 21 all-test
 *   .ts files): the route-planning core lane's own file set — canonical
 *   backbone, error taxonomy, four pin modules, fail-closed ports,
 *   search budget, rail snapshots, candidate enumeration, hard gates,
 *   ranking, barrel — PLUS the P16-D part-1 trio (trigger, manifest,
 *   lab-adapter) landed by the TL-delegated Lane D continuation (137-D1:
 *   the typed trigger + fail-closed manifest + stage-6 lab seam; ADR-0009
 *   D3 gave the trio to the TL lane, which delegated this part) PLUS the
 *   P21-C stage-7 family (conditional-stage + conditional-validation +
 *   pins/opportunities, the 400-line file-law split); the seventeen test
 *   suites (boundary, canonical, errors, pins-fidelity, ports,
 *   rail-snapshot, search-budget, candidates, hard-gates, ranking,
 *   determinism, pipeline, trigger, manifest, lab-adapter,
 *   routine-composition, conditional-stage) plus the four non-suite
 *   test-tier helpers (fixtures, compiler-evidence, no-route-fixtures,
 *   node.d.ts). Census re-pin = disclosed deviation per the ADR-0009 D9
 *   precedent (exact toBe pins kept).
 */

const packageRoot = process.cwd();
const srcDir = join(packageRoot, "src");
const testDir = join(packageRoot, "test");

function listTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files.sort();
}

const sourceFiles = listTypeScriptFiles(srcDir);
const testFiles = listTypeScriptFiles(testDir).filter((file) => file.endsWith(".test.ts"));
const allTestFiles = listTypeScriptFiles(testDir);

const MODULE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?<![.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

function looksLikeModuleSpecifier(specifier: string): boolean {
  return !/[\s${}]/.test(specifier);
}

function extractModuleSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of MODULE_SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined && looksLikeModuleSpecifier(specifier)) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

describe("architectural boundary: @payswap/route-planning (the zero-sibling guard)", () => {
  it("src contains ONLY relative imports (zero runtime deps, no siblings, no node: builtins)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
    // DISCLOSED RE-PIN (P22-C, ADR-0016 D5/D6/D11): +4 src modules (corridor-plan
    // + corridor-leg-laws + pins/corridor + pins/route-compiler-input) on top of
    // the P23-C 25 (exclusion-repair + exclusion-validation + hypothetical-views
    // + hypothesis-stage + lab-facts + pins/repairs + pins/hypotheses).
    // DISCLOSED RE-PIN (the P23 correctness patch, 2026-10-29): +1 src module
    // (bridge-proof — the typed deterministic bridge proof for the hypothesis
    // stage; the PLANNER_VERIFIED badge now requires the assumed element's
    // provable participation, never merely a real eligible route).
    expect(sourceFiles.length).toBe(30);
  });

  it("no @payswap/* or @zcode/* import appears ANYWHERE in src (the pin-only law)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (specifier.startsWith("@payswap/") || specifier.startsWith("@zcode/")) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("test imports are relative (package + cross-package source), node builtins or vitest", () => {
    const offenders: string[] = [];
    for (const file of allTestFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        const allowed =
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier === "vitest" ||
          specifier.startsWith("node:");
        if (!allowed) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the DETERMINISM LAW: src never performs I/O, uses Node globals, timers, randomness, the wall clock or float parsing", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const probe of [/\bfetch\s*\(/, /\bBuffer\b/, /\bprocess\b/, /setTimeout/, /setInterval/, /Math\.random/, /Date\.now/, /new Date\s*\(/, /\bparseFloat\b/]) {
        if (probe.test(source)) {
          offenders.push(`${relative(packageRoot, file)}: ${probe.source}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the file law (src AND test <= 400 lines) and the no-enum law", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const lineCount = readFileSync(file, "utf8").split("\n").length;
      if (lineCount > 400) {
        offenders.push(`${relative(packageRoot, file)} (${lineCount} lines)`);
      }
      if (/\benum\s+[A-Z][A-Za-z0-9]*\s*\{/.test(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(packageRoot, file)}: TS enum`);
      }
    }
    expect(offenders.join("\n")).toBe("");
    // DISCLOSED RE-PIN (P23-C, ADR-0015 D3/D5 — the general exclusion→repair
    // derivation + the hypothetical views + the hypothesis stage + the real-facts
    // stage-6 path): seven NEW src modules (exclusion-repair + its validation
    // split + hypothetical-views + hypothesis-stage + lab-facts + the two pins
    // splits pins/repairs + pins/hypotheses under the 400-line file law) and
    // five NEW test-tier files (the four batteries exclusion-repair /
    // hypothetical-views / hypothesis-stage / lab-facts + the catalogue
    // fixture), so the census moved 18 -> 25 src, 17 -> 23 test suites and
    // 21 -> 28 all-test .ts files (the fifth suite is the compat-gate battery
    // conditional-compat.test.ts, split from conditional-stage.test.ts under
    // the 400-line file law; the sixth is the TL's MERGE-TIME pin-fidelity
    // gate merge-fidelity.test.ts, which exists only on the merged tree —
    // it proves pin == the grown lane-A authority byte-identically per
    // ADR-0015 D11). The pins stay EXACT toBe (never loosened to ranges) —
    // the census law's strength is unchanged.
    // DISCLOSED RE-PIN (the P23 correctness patch, 2026-10-29): +1 src module
    // (bridge-proof.ts) +1 test suite (bridge-proof.test.ts) — the typed
    // deterministic bridge proof that closes the hypothesis-verification
    // compatibility defect (a valid real route + an unrelated assumed
    // element coexisting into a false PLANNER_VERIFIED).
    expect(sourceFiles.length).toBe(30);
    expect(testFiles.length).toBe(26);
    expect(allTestFiles.length).toBe(31);
  });

  it("the manifest law + tsconfig carries EXACTLY the one documented type-only paths mapping + a single node.d.ts process declaration", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.name).toBe("@payswap/route-planning");
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual(["typescript", "vitest"]);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.exports["."]).toBe("./src/index.ts");
    // The capability-lane precedent, mirrored VERBATIM: the test tier
    // imports the REAL capability source, whose own TYPE-ONLY
    // `@payswap/trust` imports (capability-definition.ts, corridor-types.ts,
    // restrictions.ts) cannot resolve from this package without the
    // mapping. src itself never imports @payswap/trust (asserted above by
    // the pin-only law); the mapping is compile-time only.
    const tsconfig = JSON.parse(readFileSync(join(packageRoot, "tsconfig.json"), "utf8"));
    expect(Object.keys(tsconfig.compilerOptions.paths ?? {})).toEqual(["@payswap/trust"]);
    expect(tsconfig.compilerOptions.paths["@payswap/trust"]).toEqual(["../trust/src/index.ts"]);
    const nodeDecl = readFileSync(join(testDir, "node.d.ts"), "utf8");
    expect((nodeDecl.match(/declare const process/g) ?? []).length).toBe(1);
    expect(/cwd\s*\(\s*\)/.test(nodeDecl)).toBe(true);
    expect(/cwd\s*:\s*string/.test(nodeDecl)).toBe(false);
  });

  it("the discovery law is structural: no live credential-gated test tree exists", () => {
    expect(existsSync(join(testDir, "live"))).toBe(false);
    const vitestConfig = readFileSync(join(packageRoot, "vitest.config.ts"), "utf8");
    expect(vitestConfig.includes("test/**/*.test.ts")).toBe(true);
  });
});
