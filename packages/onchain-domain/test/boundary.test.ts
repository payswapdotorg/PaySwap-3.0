import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Package boundary (@payswap/onchain-domain) — the v1 rails-layer law.
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `rails`):
 * this package is v1 hermetic —
 * 1. ZERO sibling imports: no @payswap/* anywhere in src OR test; tsconfig
 *    has NO paths entries;
 * 2. every src module specifier is RELATIVE only (no node:, no framework,
 *    no siblings);
 * 3. every test module specifier is relative, the test toolchain (vitest)
 *    or the node:fs/node:path scanner infrastructure (ambient-declared in
 *    test/node.d.ts) — nothing else;
 * 4. zero runtime dependencies; devDependencies exactly typescript +
 *    vitest;
 * 5. deterministic library code (no ambient clock/randomness/locale/
 *    environment) and every authored file <= 400 lines;
 * 6. no TS enum, no TS namespace (plain-Node type-stripping
 *    compatibility);
 * 7. test/node.d.ts declares process.cwd as a FUNCTION global exactly once
 *    (the twice-learned CI lesson).
 */

const packageRoot = process.cwd();
const srcDir = join(packageRoot, "src");
const testDir = join(packageRoot, "test");

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files.sort();
}

const srcFiles = listFiles(srcDir);
const testFiles = listFiles(testDir).filter((file) => !file.endsWith(".d.ts"));

const MODULE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

function extractModuleSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of MODULE_SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

describe("package boundary (@payswap/onchain-domain)", () => {
  it("scans a non-empty source tree", () => {
    expect(srcFiles.length).toBeGreaterThanOrEqual(18);
    expect(srcFiles.map((file) => relative(packageRoot, file))).toContain("src/index.ts");
    expect(testFiles.length).toBeGreaterThanOrEqual(12);
  });

  it("src/** imports are RELATIVE ONLY (no node:, no framework, no siblings, no @payswap/*)", () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("test/** module specifiers are relative, vitest or the scanner infra — ZERO @payswap/* anywhere", () => {
    const offenders: string[] = [];
    for (const file of testFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier === "vitest" ||
          specifier === "node:fs" ||
          specifier === "node:path"
        ) {
          continue;
        }
        offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("tsconfig.json declares NO paths entries (v1 hermetic — no sibling type links)", () => {
    const tsconfig = JSON.parse(
      readFileSync(join(packageRoot, "tsconfig.json"), "utf8"),
    ) as { compilerOptions?: { paths?: unknown } };
    expect(tsconfig.compilerOptions?.paths).toBeUndefined();
  });

  it("package.json declares ZERO runtime dependencies and exactly typescript+vitest devDependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(pkg["dependencies"]).toBeUndefined();
    expect(Object.keys(pkg["devDependencies"] as object).sort()).toEqual([
      "typescript",
      "vitest",
    ]);
    expect(pkg["exports"]).toEqual({ ".": "./src/index.ts" });
    expect(pkg["name"]).toBe("@payswap/onchain-domain");
  });

  it("src/** is deterministic: no ambient locale, clock, randomness or environment reads", () => {
    const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly label: string }> = [
      { pattern: /\bIntl\./, label: "ambient Intl" },
      { pattern: /\bDate\.now\s*\(/, label: "ambient clock (Date.now)" },
      { pattern: /new\s+Date\s*\(/, label: "ambient clock (new Date)" },
      { pattern: /\bMath\.random\s*\(/, label: "randomness" },
      { pattern: /\bprocess\.env\b/, label: "environment read" },
      { pattern: /\bperformance\.now\s*\(/, label: "ambient clock (performance.now)" },
      { pattern: /\bcrypto\./, label: "ambient crypto" },
      { pattern: /\bsetTimeout\b/, label: "setTimeout" },
      { pattern: /\bsetInterval\b/, label: "setInterval" },
      { pattern: /\bfetch\s*\(/, label: "fetch (network)" },
    ];
    for (const file of srcFiles) {
      const text = readFileSync(file, "utf8");
      for (const { pattern, label } of FORBIDDEN) {
        expect(
          pattern.test(text),
          `${relative(packageRoot, file)}: ${label} — library code takes these as EXPLICIT inputs`,
        ).toBe(false);
      }
    }
  });

  it("every authored .ts/.json file is <= 400 lines (node.d.ts is ambient-declaration infrastructure, exempt)", () => {
    const authored = [...srcFiles, ...testFiles].filter(
      (file) => !file.endsWith("node.d.ts"),
    );
    for (const file of authored) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      expect(lines, `${relative(packageRoot, file)} is ${lines} lines`).toBeLessThanOrEqual(400);
    }
    const configFiles = [
      join(packageRoot, "package.json"),
      join(packageRoot, "tsconfig.json"),
      join(packageRoot, "vitest.config.ts"),
    ];
    for (const file of configFiles) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      expect(lines, `${relative(packageRoot, file)} is ${lines} lines`).toBeLessThanOrEqual(400);
    }
  });

  it("uses no TS enum and no TS namespace (plain-Node type-stripping compatibility)", () => {
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const source = readFileSync(file, "utf8");
      if (/\benum\s+\w+\s*\{/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: TS enum`);
      }
      if (/\bnamespace\s+\w+\s*\{/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: TS namespace`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("test/node.d.ts declares process.cwd as a FUNCTION global exactly once", () => {
    const text = readFileSync(join(packageRoot, "test", "node.d.ts"), "utf8");
    expect(text).toContain("cwd(): string");
    expect((text.match(/declare const process/g) ?? []).length).toBe(1);
  });
});
