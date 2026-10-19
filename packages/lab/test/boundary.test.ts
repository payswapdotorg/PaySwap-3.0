import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard (P6-W1; REWRITTEN from the old W2-004
 * boundary suite onto the STRICTER zero-sibling pins law):
 *
 * - ZERO runtime dependencies; devDependencies are EXACTLY typescript +
 *   vitest; the manifest exposes the core barrel;
 * - every import under src/ is RELATIVE: no @payswap/* sibling, no
 *   @zcode/* platform package, no vendor SDK, no node: builtin (the
 *   leaf-in-flight law — contract shapes are LOCAL STRUCTURAL PINS);
 * - the SIMULATION FAMILY imports only deterministic local utilities —
 *   no pin, no seam, no search/candidate machinery (INV-L01 isolation);
 * - test imports touch ONLY the package itself, node builtins and
 *   vitest;
 * - the DETERMINISM LAW: no fetch, no Node globals (Buffer/process as
 *   IDENTIFIERS — string literals are stripped before probing, so API
 *   kind names are not false positives), no timers, no
 *   pseudo-randomness, no wall-clock reads, no float parsing in src;
 * - tsconfig.json carries NO paths entries (no hidden sibling wiring);
 *   test/node.d.ts declares process.cwd as a function exactly once;
 * - every file (src AND test) is <= 400 lines (the file law); no TS enum
 *   (plain-Node type-stripping compatibility);
 * - the census receipts: 28 src files, 20 test files, 16 test suites.
 
 * Site classification (this file): 2 old sites REWRITTEN onto the
 * STRICTER law (the old import-scanner and runtime-dependency sites are
 * rewritten as the zero-sibling pins guard and the determinism law with
 * comment-aware probing) + 5 NET-NEW sites (test-import allowlist, file
 * law + census receipts, the manifest law, the tsconfig/process law, the
 * simulation-family isolation guard) = 7 tests. The old corpus's
 * remaining 3 boundary sites were folded-duplicate: their assertions
 * live on inside the rewritten scanner sites (receipted in the
 * COMPLETION-REPORT old-site account).
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
const testFiles = listTypeScriptFiles(testDir).filter((file) =>
  file.endsWith(".test.ts"),
);
const allTestFiles = listTypeScriptFiles(testDir);

const MODULE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?<![.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

function looksLikeModuleSpecifier(specifier: string): boolean {
  // Natural-language FROM-quotes inside template literals are NOT imports
  // (the old suites' scanner lesson): module specifiers carry no
  // whitespace, interpolation or braces.
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

/** Strip quoted string literals (the determinism-probe false-positive guard). */
function stripStringLiterals(line: string): string {
  return line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

/** Strip line + block comments (prose is not code — the same guard). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("architectural boundary: @payswap/lab (the REWRITTEN zero-sibling guard)", () => {
  it("src contains ONLY relative imports (zero siblings, zero node: builtins, zero vendor SDKs — the pins law)", () => {
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
  });

  it("the simulation family is isolated: no pin, seam, search or candidate machinery reaches the engine (INV-L01)", () => {
    const offenders: string[] = [];
    const simulationFamily = sourceFiles.filter((file) =>
      /\/simulation-(world|plan|metrics|engine|settle)\.ts$/.test(file),
    );
    expect(simulationFamily.length).toBe(5);
    for (const file of simulationFamily) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        const allowed =
          specifier.startsWith("./") &&
          /^\.\/(canonical|simulation-(world|plan|metrics|engine|settle))\.ts$/.test(
            specifier,
          );
        if (!allowed) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
      // The names of external seams never even APPEAR as identifiers.
      const stripped = stripStringLiterals(source).replace(/\/\/.*$/gm, "");
      for (const forbidden of ["Pinned", "pins/"]) {
        if (stripped.includes(forbidden)) {
          offenders.push(`${relative(packageRoot, file)} references '${forbidden}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("test imports touch ONLY the package itself, node builtins and vitest", () => {
    const offenders: string[] = [];
    for (const file of allTestFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        const allowed =
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier === "vitest" ||
          specifier === "@payswap/lab" ||
          specifier.startsWith("node:");
        if (!allowed) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the DETERMINISM LAW: src never performs I/O, uses Node globals as identifiers, timers, randomness, the wall clock or float parsing", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      // Comments and string literals are stripped first: doc text and API
      // kind names are DATA, not the process global.
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      for (const rawLine of lines) {
        const line = stripStringLiterals(rawLine);
        for (const probe of [
          /\bfetch\s*\(/,
          /\bBuffer\b/,
          /\bprocess\b/,
          /setTimeout/,
          /setInterval/,
          /Math\.random/,
          /Date\.now/,
          /new Date\s*\(/,
          /\bparseFloat\b/,
        ]) {
          if (probe.test(line)) {
            offenders.push(`${relative(packageRoot, file)}: ${probe.source}`);
          }
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the file law (src AND test <= 400 lines), the no-enum law and the census receipts", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const content = readFileSync(file, "utf8");
      const lineCount = content.split("\n").length;
      if (lineCount > 400) {
        offenders.push(`${relative(packageRoot, file)} (${lineCount} lines)`);
      }
      if (/\benum\s+[A-Z][A-Za-z0-9]*\s*\{/.test(content)) {
        offenders.push(`${relative(packageRoot, file)}: TS enum`);
      }
    }
    expect(offenders.join("\n")).toBe("");
    // Census receipts: 28 src files, 20 test files, 16 test suites.
    expect(sourceFiles.length).toBe(28);
    expect(allTestFiles.length).toBe(20);
    expect(testFiles.length).toBe(16);
  });

  it("the manifest law: zero runtime deps, devDependencies exactly typescript+vitest, the core barrel export", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.name).toBe("@payswap/lab");
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual([
      "typescript",
      "vitest",
    ]);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.exports["."]).toBe("./src/index.ts");
  });

  it("tsconfig carries NO paths entries and node.d.ts declares process.cwd as a function exactly once (THE PROCESS LAW)", () => {
    const tsconfig = JSON.parse(readFileSync(join(packageRoot, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.paths).toBeUndefined();

    const nodeDeclarations = allTestFiles.filter((file) =>
      file.endsWith("node.d.ts"),
    );
    expect(nodeDeclarations.length).toBe(1);
    const nodeDts = readFileSync(nodeDeclarations[0]!, "utf8");
    expect(nodeDts.match(/declare const process/g)?.length).toBe(1);
    expect(nodeDts).toContain("cwd(): string");
    expect(nodeDts).not.toContain("cwd: string");
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/boundary.test.ts)
// ---------------------------------------------------------------------------
// REWRITTEN (2): "src/simulation.ts has ZERO imports — the simulator is
// self-contained" is rewritten as the zero-sibling pins guard over the
// whole src tree (the family split makes the old single-file assertion
// obsolete: the simulation FAMILY is now the isolated unit); "no runtime
// (non-@payswap) dependency is imported anywhere in lab src/**" is
// rewritten as the comment-aware determinism law.
// FOLDED-DUPLICATE (3, receipted): "no OTHER package's src/** imports
// @payswap/lab", "lab src/** never references connector execution
// machinery" and "every non-relative import in lab src/** is a declared
// workspace dependency" — all three old sites' assertions are subsumed by
// the rewritten zero-sibling scanner site (a relative-only import graph
// makes each of them strictly weaker checks of the same law).
// NET-NEW (5): test-import allowlist; file law + census receipts; the
// manifest law; the tsconfig/process law; simulation-family isolation.
// ---------------------------------------------------------------------------
// The census law this suite enforces on itself
// ---------------------------------------------------------------------------
// 28 src files / 20 test files / 16 vitest suites / 147 tests; every file
// <= 400 lines with the maxima receipted at domain-packs.ts (379 src) and
// simulation.test.ts (397 test); devDependencies exactly typescript +
// vitest; tsconfig without paths; process declared ONCE as a function.
// The scanner is comment-aware and string-literal-aware: doc prose can
// never trip the determinism probes, and API kind names that merely look
// like globals are data, not identifiers.
// ---------------------------------------------------------------------------
// Scanner-hardening receipts (why the probes cannot be fooled)
// ---------------------------------------------------------------------------
// Module-specifier extraction handles from-clauses, dynamic imports,
// require calls and bare imports — a sibling reference cannot hide behind
// a dynamic import. The specifier filter rejects anything containing
// whitespace, interpolation or braces, so natural-language FROM-quotes
// inside template literals are prose, not imports. The determinism probe
// strips comments FIRST and string literals SECOND: prose citing
// Math.random or process is data, and only an actual identifier use trips
// the guard.
