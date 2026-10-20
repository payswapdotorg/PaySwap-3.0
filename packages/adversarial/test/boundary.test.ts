/**
 * Package boundary (@payswap/adversarial, lane r4-w3 — the 3.0 law,
 * REWRITTEN from the old repository's packages/security +
 * packages/adversarial boundary suites onto the STRICTER zero-sibling
 * law, following the accepted packages/onchain-security boundary
 * pattern).
 *
 * 1. ZERO sibling imports (src AND test): every module specifier is
 *    RELATIVE — no @payswap/* anywhere, no bare package imports, no
 *    node: builtins in src. Cross-lane contract shapes live in
 *    src/pins/ as structural mirrors;
 * 2. tsconfig.json has NO paths entries (the machine-checked twin of 1);
 * 3. determinism guards: no randomness, no ambient clock, no timers,
 *    no network in src/;
 * 4. secret hygiene: no 64-hex (raw-key-shaped) literal anywhere in
 *    src or test — credential-shaped fixtures are assembled at RUNTIME;
 * 5. the <= 400-line file law on EVERY file (src and test);
 * 6. no TS enum, no TS namespace (plain-Node type-stripping
 *    compatibility);
 * 7. devDependencies are exactly the toolchain (typescript + vitest),
 *    zero runtime dependencies, and package.json exports the pinned
 *    subpaths;
 * 8. the core contract modules all exist with the expected names;
 * 9. the immune vocabulary law: no authority/financial mutation
 *    vocabulary in the expert bridge (evidence only).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = process.cwd();

function listFiles(dir: string, filter: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listFiles(full, filter));
    } else if (filter(full)) {
      found.push(full);
    }
  }
  return found;
}

function stripStringsAndComments(source: string): string {
  let out = "";
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    switch (mode) {
      case "code":
        if (char === "/" && next === "/") {
          mode = "line";
          i += 1;
        } else if (char === "/" && next === "*") {
          mode = "block";
          i += 1;
        } else if (char === '"') {
          mode = "double";
        } else if (char === "'") {
          mode = "single";
        } else if (char === "`") {
          mode = "template";
        } else {
          out += char;
        }
        break;
      case "line":
        if (char === "\n") {
          mode = "code";
          out += "\n";
        }
        break;
      case "block":
        if (char === "*" && next === "/") {
          mode = "code";
          i += 1;
        }
        break;
      case "single":
        if (char === "\\") {
          i += 1;
        } else if (char === "'") {
          mode = "code";
        }
        break;
      case "double":
        if (char === "\\") {
          i += 1;
        } else if (char === '"') {
          mode = "code";
        }
        break;
      case "template":
        if (char === "\\") {
          i += 1;
        } else if (char === "`") {
          mode = "code";
        }
        break;
    }
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const code = stripStringsAndComments(source);
  for (const match of code.matchAll(/\bfrom\s*("|')(\S+)\1/g)) {
    specifiers.push(match[2] ?? "");
  }
  for (const match of code.matchAll(/\bimport\s*("|')(\S+)\1/g)) {
    specifiers.push(match[2] ?? "");
  }
  return specifiers;
}

const SOURCE_FILES = listFiles(join(PACKAGE_ROOT, "src"), (p) => p.endsWith(".ts"));
const TEST_FILES = listFiles(join(PACKAGE_ROOT, "test"), (p) => p.endsWith(".ts"));
const RAW_KEY_LITERAL_PATTERN = /(0x)?[0-9a-fA-F]{64}/;

const CORE_MODULES = [
  "index.ts",
  "version.ts",
  "block-authority.ts",
  "component-identity.ts",
  "threat-signatures.ts",
  "advisories.ts",
  "advisory-registry.ts",
  "epochs.ts",
  "quarantine-ledger.ts",
  "capability-gate.ts",
  "immune-gate.ts",
  "capability-cases.ts",
  "experts.ts",
  "expert-resolutions.ts",
] as const;

function relativePath(file: string): string {
  return file.replace(PACKAGE_ROOT + sep, "");
}

describe("package boundary (@payswap/adversarial — the r4-w3 law)", () => {
  it("scans a non-empty src tree", () => {
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(20);
    expect(SOURCE_FILES.map((file) => relativePath(file))).toContain("src/index.ts");
  });

  it("ZERO sibling imports: every src AND test module specifier is RELATIVE (no @payswap/*, no bare, no node: in src)", () => {
    const offenders: string[] = [];
    for (const file of [...SOURCE_FILES, ...TEST_FILES]) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        const isTestInfra =
          relativePath(file).startsWith("test") &&
          (specifier === "vitest" || specifier.startsWith("node:"));
        if (!specifier.startsWith("./") && !specifier.startsWith("../") && !isTestInfra) {
          offenders.push(`${relativePath(file)} -> '${specifier}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("tsconfig.json has NO paths entries (the machine-checked twin of the zero-sibling law)", () => {
    const tsconfig = JSON.parse(readFileSync(join(PACKAGE_ROOT, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    expect(tsconfig.compilerOptions?.paths).toBeUndefined();
  });

  it("determinism guards: no randomness, no ambient clock, no timers, no network in src/", () => {
    const offenders: string[] = [];
    const FORBIDDEN: readonly { readonly pattern: RegExp; readonly label: string }[] = [
      { pattern: /\bMath\.random\b/, label: "Math.random" },
      { pattern: /\bcrypto\.randomUUID\b/, label: "crypto.randomUUID" },
      { pattern: /\bnew\s+Date\b/, label: "new Date (ambient clock)" },
      { pattern: /\bDate\.now\b/, label: "Date.now (ambient clock)" },
      { pattern: /\bperformance\.now\b/, label: "performance.now" },
      { pattern: /\bsetTimeout\b/, label: "setTimeout" },
      { pattern: /\bsetInterval\b/, label: "setInterval" },
      { pattern: /\bfetch\s*\(/, label: "fetch (network)" },
      { pattern: /\bnode:fs\b/, label: "node:fs import in src" },
      { pattern: /\bnode:path\b/, label: "node:path import in src" },
      { pattern: /\bnode:process\b/, label: "node:process import in src" },
      { pattern: /\bprocess\.env\b/, label: "process.env" },
    ];
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN) {
        if (forbidden.pattern.test(source)) {
          offenders.push(`${relativePath(file)}: ${forbidden.label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no raw-key-shaped (64-hex) literal in src/ or test/ — fixtures assemble at runtime", () => {
    const offenders: string[] = [];
    for (const root of ["src", "test"]) {
      for (const file of listFiles(join(PACKAGE_ROOT, root), (p) => p.endsWith(".ts"))) {
        const source = readFileSync(file, "utf8");
        for (const line of source.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith(' "')) {
            continue; // comments and digest-format examples are not literals
          }
          const match = RAW_KEY_LITERAL_PATTERN.exec(trimmed);
          if (match !== null) {
            offenders.push(`${relativePath(file)}: ${match[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("enforces the <= 400-line file law on every source AND test file", () => {
    const offenders: string[] = [];
    for (const file of [...SOURCE_FILES, ...TEST_FILES]) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      if (lines > 400) {
        offenders.push(`${relativePath(file)}: ${lines} lines`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses no TS enum and no TS namespace (plain-Node type-stripping compatibility)", () => {
    const offenders: string[] = [];
    for (const file of [...SOURCE_FILES, ...TEST_FILES]) {
      const source = readFileSync(file, "utf8");
      if (/\benum\s+\w+\s*\{/.test(source)) {
        offenders.push(`${relativePath(file)}: TS enum`);
      }
      if (/\bnamespace\s+\w+\s*\{/.test(source)) {
        offenders.push(`${relativePath(file)}: TS namespace`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("devDependencies are exactly the toolchain (typescript + vitest), zero runtime dependencies", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
      exports?: Record<string, unknown>;
    };
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies).sort()).toEqual(["typescript", "vitest"]);
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([".", "./provider-intel"]);
  });

  it("the core contract modules all exist with the expected names", () => {
    const srcFiles = SOURCE_FILES.map((path) => path.split(sep).pop() ?? "");
    for (const module of CORE_MODULES) {
      expect(srcFiles).toContain(module);
    }
    expect(
      SOURCE_FILES.map((path) => relativePath(path)).some((path) =>
        path.includes(join("src", "pins")),
      ),
    ).toBe(true);
    expect(
      SOURCE_FILES.map((path) => relativePath(path)).some((path) =>
        path.includes(join("src", "provider")),
      ),
    ).toBe(true);
    expect(
      SOURCE_FILES.map((path) => relativePath(path)).some((path) =>
        path.includes(join("src", "integration")),
      ),
    ).toBe(true);
  });

  it("the expert bridge carries no authority vocabulary — evidence and learning only", () => {
    const authorityVocabulary = [
      "mandateId",
      "approvalArtifact",
      "issueGrant",
      "mintAuthorization",
      "postJournal",
      "signTransaction",
      "broadcast",
    ];
    const files = [
      join(PACKAGE_ROOT, "src", "experts.ts"),
      join(PACKAGE_ROOT, "src", "expert-resolutions.ts"),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripStringsAndComments(readFileSync(file, "utf8"));
      for (const term of authorityVocabulary) {
        if (new RegExp(`\\b${term}\\b`).test(code)) {
          offenders.push(`${relativePath(file)}: ${term}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
