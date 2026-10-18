import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard (REWRITTEN from the old boundary suites
 * onto the STRICTER zero-sibling law + the NET-NEW metadata
 * venue-neutrality extensions, F-3):
 *
 * - ZERO runtime dependencies; devDependencies are EXACTLY typescript +
 *   vitest; the manifest exposes the core barrel;
 * - every import under src/ is RELATIVE: no @payswap/* sibling, no
 *   @zcode/* platform package, no vendor SDK, no node: builtin (the
 *   leaf-in-flight law — contract shapes are LOCAL STRUCTURAL PINS);
 * - test imports touch ONLY the package itself, node builtins and
 *   vitest;
 * - the DETERMINISM LAW: no fetch, no Node globals (Buffer/process), no
 *   timers, no pseudo-randomness, no wall-clock reads, no float parsing
 *   in src;
 * - tsconfig.json carries NO paths entries (no hidden sibling wiring);
 * - every file (src AND test) is <= 400 lines (the file law);
 * - no TS enum (plain-Node type-stripping compatibility);
 * - the METADATA venue-neutrality guard: no venue name appears in
 *   package.json, tsconfig.json or vitest.config.ts (F-3);
 * - no credential-gated live test tree exists (deterministic battery).
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
  // Natural-language FROM-quotes inside template literals are NOT
  // imports (the old suites' scanner lesson): module specifiers carry
  // no whitespace, interpolation or braces.
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

describe("architectural boundary: @payswap/route-compiler (the REWRITTEN zero-sibling guard)", () => {
  it("src contains ONLY relative imports (zero runtime deps, no siblings, no node: builtins, no vendor SDKs)", () => {
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
    expect(sourceFiles.length).toBe(56);
  });

  it("no @payswap/* or @zcode/* import appears ANYWHERE in src (the leaf-in-flight pins law)", () => {
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

  it("test imports touch ONLY the package itself, node builtins and vitest", () => {
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

  it("the file law (src AND test <= 400 lines) and the no-enum law (plain-Node type stripping)", () => {
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
    expect(testFiles.length).toBe(29);
    expect(allTestFiles.length).toBe(39);
  });

  it("the manifest law + tsconfig carries NO paths entries + node.d.ts declares process.cwd as a function exactly once", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.name).toBe("@payswap/route-compiler");
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual(["typescript", "vitest"]);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.exports["."]).toBe("./src/index.ts");
    const tsconfig = JSON.parse(readFileSync(join(packageRoot, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.paths).toBeUndefined();
    const nodeDecl = readFileSync(join(testDir, "node.d.ts"), "utf8");
    expect((nodeDecl.match(/declare const process/g) ?? []).length).toBe(1);
    expect(/cwd\s*\(\s*\)/.test(nodeDecl)).toBe(true);
    expect(/cwd\s*:\s*string/.test(nodeDecl)).toBe(false);
  });

  it("NET-NEW metadata venue-neutrality (F-3): no venue name in package.json, tsconfig.json or vitest.config.ts", () => {
    const venueNames = [
      "uniswap", "sushiswap", "curve", "balancer", "1inch", "cowswap", "matcha",
      "paraswap", "hashflow", "bancor", "kyber", "stargate", "lifi", "debridge",
      "zeroswap", "solverbatch", "lockport", "coinramp", "tidalpools", "meridian",
    ];
    const offenders: string[] = [];
    for (const metadataFile of ["package.json", "tsconfig.json", "vitest.config.ts"]) {
      const content = readFileSync(join(packageRoot, metadataFile), "utf8").toLowerCase();
      for (const venue of venueNames) {
        if (content.includes(venue)) {
          offenders.push(`${metadataFile}: ${venue}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
    expect(existsSync(join(testDir, "live"))).toBe(false);
    const vitestConfig = readFileSync(join(packageRoot, "vitest.config.ts"), "utf8");
    expect(vitestConfig.includes("test/**/*.test.ts")).toBe(true);
  });
});
