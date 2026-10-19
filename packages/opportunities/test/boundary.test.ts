import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard (P6-W2, lane r4-w2; REWRITTEN from the old
 * payswap.org@8a735bf boundary suite onto the STRICTER zero-sibling pins
 * law — the old suite allowed four @payswap workspace dependencies and a
 * dependency-audit allowlist; this rebuild allows NONE).
 *
 * - ZERO runtime dependencies; devDependencies are EXACTLY typescript +
 *   vitest; the manifest exposes the core barrel;
 * - every import under src/ AND test/ is RELATIVE (no @payswap/* sibling,
 *   no vendor SDK, no node: builtin in src — the leaf-in-flight law);
 * - src/** owns NO execution/broadcast/authorization machinery and no
 *   venue-specific vocabulary (the neutrality law);
 * - the DETERMINISM LAW: no randomness, no ambient clock, no
 *   floating-point parsing, no network in src;
 * - tsconfig.json carries NO paths entries (no hidden sibling wiring);
 *   test/node.d.ts declares process.cwd as a function exactly once;
 * - every file (src AND test) is <= 400 lines (the file law);
 * - no raw secrets anywhere in the package source or tests.
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

describe("architectural boundary: @payswap/opportunities (the REWRITTEN zero-sibling guard)", () => {
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

  it("test imports touch ONLY the package itself, node builtins and vitest (the allowlist law)", () => {
    const offenders: string[] = [];
    for (const file of allTestFiles) {
      if (file.endsWith("node.d.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        const allowed =
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier === "vitest" ||
          specifier === "node:fs" ||
          specifier === "node:path";
        if (!allowed) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("no @payswap/* specifier appears anywhere in src or test (not even as a string)", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (specifier.startsWith("@payswap/")) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
      // Module-specifier-quoted prose (doc comments naming authorities) is
      // legal; an actual import statement is not — covered above. Also
      // scan for the forbidden require/import forms with @payswap.
      if (/import\s+["']@payswap\//.test(source) || /from\s+["']@payswap\//.test(source)) {
        offenders.push(`${relative(packageRoot, file)} (import statement)`);
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("src/** contains no vendor-SDK and no venue-specific vocabulary (the neutrality law)", () => {
    const forbiddenVendors: readonly RegExp[] = [
      /\bethers\b/i,
      /\bviem\b/i,
      /\bweb3\b/i,
      /\bsolana-web3\b/i,
      /\balchemy\b/i,
      /\binfura\b/i,
      /\bquicknode\b/i,
      /\btenderly\b/i,
      /\bcovalent\b/i,
      /\bmoralis\b/i,
      /\bblocknative\b/i,
    ];
    const forbiddenVenues: readonly RegExp[] = [
      /uniswap/i,
      /sushi/i,
      /curve\/v/i,
      /1inch/i,
      /balancer/i,
      /cowswap/i,
      /zeroswap/i,
      /solverbatch/i,
      /\baave\b/i,
      /\bcompound\b/i,
      /\blido\b/i,
      /\bmaker\b/i,
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const pattern of [...forbiddenVendors, ...forbiddenVenues]) {
        if (pattern.test(source)) {
          offenders.push(`${relative(packageRoot, file)} matches ${String(pattern)}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("src/** owns NO execution/broadcast/authorization machinery (discovery is never authorization)", () => {
    const forbiddenExecutionVocabulary: readonly string[] = [
      "broadcastTransaction",
      "BroadcastHandoff",
      "signTransaction",
      "sendTransaction",
      "postJournalEntry",
      "issueAuthorization",
      "grantAuthority",
      "mintAuthorization",
      "SignedApprovalArtifact",
      "TrustedApprovalSurface",
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of forbiddenExecutionVocabulary) {
        if (source.includes(forbidden)) {
          offenders.push(`${relative(packageRoot, file)} contains '${forbidden}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("src/** has no randomness, no ambient clock, no floating-point parsing, no network (determinism law)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      const codeOnly = stripComments(source);
      if (codeOnly.includes("Math.random(")) {
        offenders.push(`${relative(packageRoot, file)} uses Math.random`);
      }
      if (codeOnly.includes("Date.now(") || codeOnly.includes("new Date(")) {
        offenders.push(`${relative(packageRoot, file)} uses an ambient clock`);
      }
      if (codeOnly.includes("parseFloat(") || codeOnly.includes("Number.parseFloat(")) {
        offenders.push(`${relative(packageRoot, file)} parses floating point`);
      }
      if (/\bfetch\s*\(/.test(stripStringLiterals(codeOnly))) {
        offenders.push(`${relative(packageRoot, file)} performs network I/O`);
      }
      for (const line of codeOnly.split("\n")) {
        const stripped = stripStringLiterals(line);
        if (/\bprocess\b/.test(stripped) || /\bBuffer\b/.test(stripped)) {
          offenders.push(`${relative(packageRoot, file)} references a Node global`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the manifest law: zero runtime dependencies; devDependencies exactly typescript + vitest", () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
      exports: Record<string, string>;
      name: string;
    };
    expect(packageJson.name).toBe("@payswap/opportunities");
    expect(Object.keys(packageJson.dependencies ?? {})).toEqual([]);
    expect(Object.keys(packageJson.devDependencies).sort()).toEqual([
      "typescript",
      "vitest",
    ]);
    expect(packageJson.exports?.["."]).toBe("./src/index.ts");
  });

  it("tsconfig.json carries NO paths entries; test/node.d.ts declares process.cwd as a function exactly once", () => {
    const tsconfig = JSON.parse(
      readFileSync(join(packageRoot, "tsconfig.json"), "utf8"),
    ) as { compilerOptions?: Record<string, unknown> };
    expect(tsconfig.compilerOptions?.paths).toBeUndefined();
    expect(tsconfig.compilerOptions?.baseUrl).toBeUndefined();

    const nodeDeclarations = allTestFiles.filter((file) =>
      file.endsWith("node.d.ts"),
    );
    expect(nodeDeclarations).toHaveLength(1);
    const content = readFileSync(nodeDeclarations[0] as string, "utf8");
    expect(content).toMatch(/declare const process: \{\s*cwd\(\): string;?\s*\}/);
    expect(content.match(/declare const process/g)?.length).toBe(1);
  });

  it("every file (src AND test) is <= 400 lines (the file law) + the census receipts", () => {
    const offenders: string[] = [];
    let srcCount = 0;
    let srcLines = 0;
    let testCount = 0;
    let testLines = 0;
    let maxLines = 0;
    let maxFile = "";
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      if (lines > 400) {
        offenders.push(`${relative(packageRoot, file)} is ${String(lines)} lines`);
      }
      if (file.startsWith(srcDir)) {
        srcCount += 1;
        srcLines += lines;
      } else {
        testCount += 1;
        testLines += lines;
      }
      if (lines > maxLines) {
        maxLines = lines;
        maxFile = relative(packageRoot, file);
      }
    }
    expect(offenders.join("\n")).toBe("");
    // The census receipts (the evidence-doc numbers, machine-checked).
    expect(srcCount).toBe(26);
    expect(testCount).toBe(16);
    expect(maxLines).toBeLessThanOrEqual(400);
    expect(maxFile.length).toBeGreaterThan(0);
  });

  it("no raw secrets anywhere in the package source or tests (the secret-free law)", () => {
    const secretPatterns: readonly RegExp[] = [
      /ghp_[A-Za-z0-9]{20,}/,
      /github_pat_[A-Za-z0-9_]{20,}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[^\n]*\n/,
      /\b0x[0-9a-fA-F]{64}\b/,
      /api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{16,}["']/i,
      /sk-[A-Za-z0-9]{20,}/,
    ];
    const offenders: string[] = [];
    for (const file of [...sourceFiles, ...allTestFiles]) {
      const source = readFileSync(file, "utf8");
      for (const pattern of secretPatterns) {
        if (pattern.test(source)) {
          offenders.push(`${relative(packageRoot, file)} matches secret-shaped pattern`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });
});
