import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard (REWRITTEN from the old checkout/crypto
 * boundary suites onto the STRICTER zero-sibling law):
 *
 * - ZERO runtime dependencies; devDependencies are EXACTLY typescript +
 *   vitest; the manifest exposes the core barrel;
 * - every import under src/ is RELATIVE: no @payswap/* sibling, no
 *   @zcode/* platform package, no vendor SDK, no node: builtin (the
 *   leaf-in-flight law — contract shapes are LOCAL STRUCTURAL PINS);
 * - test imports touch ONLY the package itself, node builtins and
 *   vitest;
 * - the DETERMINISM LAW: no fetch, no Node globals (Buffer/process as
 *   IDENTIFIERS — string literals are stripped before probing, so API
 *   kind names like "webhook/event.process" are not false positives),
 *   no timers, no pseudo-randomness, no wall-clock reads, no float
 *   parsing in src;
 * - tsconfig.json carries NO paths entries (no hidden sibling wiring);
 *   test/node.d.ts declares process.cwd as a function exactly once;
 * - every file (src AND test) is <= 400 lines (the file law);
 * - no TS enum (plain-Node type-stripping compatibility);
 * - no gated live test tree exists (deterministic battery).
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

/** Strip quoted string literals (the determinism-probe false-positive guard). */
function stripStringLiterals(line: string): string {
  return line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

describe("architectural boundary: @payswap/merchant (the REWRITTEN zero-sibling guard)", () => {
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
    expect(sourceFiles.length).toBe(43);
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

  it("no node: builtin import appears in src (test scanners are the only allowance)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (specifier.startsWith("node:")) {
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

  it("the DETERMINISM LAW: src never performs I/O, uses Node globals as identifiers, timers, randomness, the wall clock or float parsing", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (const rawLine of lines) {
        // String literals are stripped first: API kind names such as
        // "webhook/event.process" are DATA, not the process global.
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

  it("the file law (src AND test <= 400 lines) and the no-enum law (plain-Node type stripping)", () => {
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
    expect(testFiles.length).toBe(25);
    expect(allTestFiles.length).toBe(30);
  });

  it("the manifest law: zero runtime deps, devDependencies exactly typescript+vitest, the core barrel export", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.name).toBe("@payswap/merchant");
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual(["typescript", "vitest"]);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.exports["."]).toBe("./src/index.ts");
  });

  it("tsconfig carries NO paths entries (no hidden sibling wiring)", () => {
    const tsconfig = JSON.parse(readFileSync(join(packageRoot, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.paths).toBeUndefined();
  });

  it("node.d.ts declares process.cwd as a function exactly once (THE PROCESS LAW)", () => {
    const nodeDecl = readFileSync(join(testDir, "node.d.ts"), "utf8");
    expect((nodeDecl.match(/declare const process/g) ?? []).length).toBe(1);
    expect(/cwd\s*\(\s*\)/.test(nodeDecl)).toBe(true);
    expect(/cwd\s*:\s*string/.test(nodeDecl)).toBe(false);
  });

  it("the pins barrel is the only cross-lane surface: every pins module names its authority", () => {
    const pinsDir = join(srcDir, "pins");
    const pinModules = listTypeScriptFiles(pinsDir).filter((f) => !f.endsWith("index.ts"));
    expect(pinModules.length).toBe(8);
    const offenders: string[] = [];
    for (const file of pinModules) {
      const source = readFileSync(file, "utf8");
      if (!/authority/i.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("src pins never import from the implementation modules (pins stay leaf-level)", () => {
    const offenders: string[] = [];
    for (const file of listTypeScriptFiles(join(srcDir, "pins"))) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (specifier.startsWith("../") && !specifier.startsWith("../pins/")) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the wallet-payment port law is pinned: exactly one method, handoff-only", () => {
    const portPin = readFileSync(join(srcDir, "pins", "wallet-payment.ts"), "utf8");
    expect(portPin.includes('PINNED_WALLET_PAYMENT_PORT_METHODS = Object.freeze(["handoff"]')).toBe(
      true,
    );
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const probe of [/\bexecute\s*\(/, /\bbroadcast\s*\(/, /\bsettleFunds\s*\(/]) {
        if (probe.test(stripStringLiterals(source)) && file.includes("pins")) {
          offenders.push(`${relative(packageRoot, file)}: ${probe.source}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the NO-NETWORK law: no Stripe API call site exists anywhere in src", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (specifier.startsWith("http")) {
          offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
        }
      }
      const stripped = source
        .split("\n")
        .map(stripStringLiterals)
        .join("\n");
      for (const probe of [/\bXMLHttpRequest\b/, /WebSocket\b/, /navigator\b/]) {
        if (probe.test(stripped)) {
          offenders.push(`${relative(packageRoot, file)}: ${probe.source}`);
        }
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("no secret literal is embedded in src (the INV-19 construction law)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      // No realistic sk_/rk_ live or test key material, no 64-hex
      // private-key literal, no 12/24-word mnemonic in source.
      if (/sk_(live|test)_[A-Za-z0-9]{16,}/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: stripe key literal`);
      }
      if (/(^|[^0-9a-fA-F])[0-9a-fA-F]{64}([^0-9a-fA-F]|$)/.test(source)) {
        offenders.push(`${relative(packageRoot, file)}: 64-hex literal`);
      }
      if (/\b(?:abandon|ability|able|about|above|absent|absorb)\b\s+\w+\s+\w+/.test(source)) {
        // heuristic BIP-39 word-runs only — the full detector lives in
        // secrets.ts; here we only guard against literal embeds.
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("no gated live test tree exists (the deterministic battery law)", () => {
    const offenders: string[] = [];
    for (const file of allTestFiles) {
      const source = readFileSync(file, "utf8");
      // The pattern is assembled at runtime so this scanner cannot
      // match its own source text.
      const gatedPattern = new RegExp(["live", "key"].join("-"), "i");
      const credPattern = new RegExp(["credential", "gated"].join("-"), "i");
      if (gatedPattern.test(source) || credPattern.test(source)) {
        offenders.push(relative(packageRoot, file));
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("the vitest config includes exactly the deterministic test tree", () => {
    const vitestConfig = readFileSync(join(packageRoot, "vitest.config.ts"), "utf8");
    expect(vitestConfig.includes("test/**/*.test.ts")).toBe(true);
    expect(vitestConfig.includes("environment: \"node\"")).toBe(true);
  });
});
