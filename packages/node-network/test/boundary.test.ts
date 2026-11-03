import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard for @payswap/node-network (P27-D, the
 * ADR-0009 D2 leaf-engine law + the ADR-0020 D12 intelligence law):
 *
 * - src contains ONLY relative imports — no @payswap/* sibling, no
 *   @zcode/* platform package, no vendor SDK. The ONE node builtin src
 *   may touch is node:crypto (the signed-offer/attestation machinery,
 *   ADR-0020 D5: signature verify, constant-time comparison) — every
 *   other cross-package surface is consumed as validated DATA, and the
 *   package itself is reached by siblings only through
 *   @payswap/route-planning's pins/ports (ADR-0009 D2);
 * - THE INTELLIGENCE LAW (MODULE-OWNERSHIP layer 'intelligence',
 *   cannot_authorize_financial_effects): src never imports a financial,
 *   rails or trust package (it cannot — zero sibling imports at all);
 * - the DETERMINISM LAW: no fetch, no Node globals (Buffer/process), no
 *   timers, no pseudo-randomness, no wall-clock reads, no float parsing
 *   in src (caller-supplied instants everywhere; crypto key generation
 *   appears ONLY in tests, never in src);
 * - the manifest exposes the core barrel with devDependencies EXACTLY
 *   typescript + vitest and zero runtime dependencies;
 * - every file (src AND test) is <= 400 lines; no TS enum; no TS
 *   namespace;
 * - the exact census pins below: the node-network lane's own file set.
 *   Census re-pin = disclosed deviation per the ADR-0009 D9 precedent
 *   (exact toBe pins kept, never loosened to ranges).
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

describe("architectural boundary: @payswap/node-network (the intelligence leaf law)", () => {
  it("src contains ONLY relative imports plus the ONE declared builtin node:crypto (ADR-0020 D5)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        const allowed =
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier === "node:crypto";
        if (!allowed) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("no @payswap/* or @zcode/* import appears ANYWHERE in src (the leaf-engine law)", () => {
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

  it("node:crypto appears ONLY in the signing modules, never elsewhere", () => {
    const allowedFiles = new Set([
      "src/offer.ts",
      "src/offer-verification.ts",
      "src/attestation.ts",
    ]);
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const rel = relative(packageRoot, file);
      const source = readFileSync(file, "utf8");
      const importsCrypto = extractModuleSpecifiers(source).some(
        (specifier) => specifier === "node:crypto",
      );
      if (importsCrypto && !allowedFiles.has(rel)) {
        offenders.push(rel);
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("test imports are relative, node builtins or vitest (hermetic; zero cross-package imports)", () => {
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
    // Buffer.from (deterministic utf8/base64 conversion for the crypto
    // interop) is allowed ONLY in the signing modules — the same set that
    // may import node:crypto; everywhere else the full determinism law
    // applies with no exemption.
    const signingModules = new Set([
      "src/offer.ts",
      "src/offer-verification.ts",
      "src/attestation.ts",
    ]);
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const rel = relative(packageRoot, file);
      const source = readFileSync(file, "utf8");
      for (const probe of [
        /\bfetch\s*\(/,
        /\bprocess\b/,
        /setTimeout/,
        /setInterval/,
        /Math\.random/,
        /crypto\.randomUUID/,
        /generateKeyPair/,
        /Date\.now/,
        /new Date\s*\(/,
        /\bparseFloat\b/,
        ...(signingModules.has(rel) ? [] : [/\bBuffer\b/]),
      ]) {
        if (probe.test(source)) {
          offenders.push(`${rel}: ${probe.source}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the file law (src AND test <= 400 lines) and the no-enum/no-namespace law", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const lineCount = readFileSync(file, "utf8").split("\n").length;
      if (lineCount > 400) {
        offenders.push(`${relative(packageRoot, file)} (${lineCount} lines)`);
      }
      if (/\benum\s+[A-Z][A-Za-z0-9]*\s*\{/.test(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(packageRoot, file)}: TS enum`);
      }
      if (/\bnamespace\s+\w+\s*\{/.test(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(packageRoot, file)}: TS namespace`);
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the manifest law: devDependencies exactly typescript + vitest, zero runtime deps, the core barrel export", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.name).toBe("@payswap/node-network");
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual(["typescript", "vitest"]);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.exports["."]).toBe("./src/index.ts");
  });

  it("the discovery law is structural: no live credential-gated test tree exists", () => {
    expect(existsSync(join(testDir, "live"))).toBe(false);
    const vitestConfig = readFileSync(join(packageRoot, "vitest.config.ts"), "utf8");
    expect(vitestConfig.includes("test/**/*.test.ts")).toBe(true);
  });

  it("the exact census (P27-D lane landing; re-pin = disclosed deviation, ADR-0009 D9)", () => {
    // CENSUS (P27-D second batch, 2026-11-03 — the core offer machinery):
    // 9 src modules (canonical, errors, classification, enrollment,
    // attestation, offer, offer-verification [the 400-line file-law split],
    // registry, index) and 6 test suites (boundary, classification,
    // enrollment, attestation, offer, registry) + the fixtures helper and
    // the node.d.ts shim (8 all-test .ts files).
    expect(sourceFiles.length).toBe(9);
    expect(testFiles.length).toBe(6);
    expect(allTestFiles.length).toBe(8);
  });
});
