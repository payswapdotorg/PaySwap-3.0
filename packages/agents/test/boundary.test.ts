import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Architectural boundary guard (adapted from the accepted
 * packages/capability boundary pattern + the old repository's
 * packages/agents boundary test):
 * `@payswap/agents` is a deterministic intelligence-plane package with ZERO
 * runtime dependencies. Frameworks, provider SDKs, drivers, every other
 * PaySwap package except the ONE accepted sibling and all @zcode/* platform
 * packages can never cross into it. The ONE accepted sibling import is
 * `@payswap/trust` — TYPE-ONLY (the AmountSpec/authority wire authority;
 * layer law: intelligence may depend on [economic, capability, contracts]
 * and cannot authorize financial effects — the trust link is the accepted
 * P1/P2 integration pattern, pinned TYPE-ONLY).
 *
 * It also guards determinism at the source level: no pseudo-randomness, no
 * ambient host clock, no timers, no filesystem/network access in src/.
 * P3-W1 additions: every file <= 400 lines, no TS `enum`, no TS `namespace`.
 */

// CI note: vitest runs with cwd = the package directory (the accepted
// trust/economic/protocol/capability boundary pattern); process.cwd() keeps
// the ambient shim minimal and the package-local battery hermetic.
const packageRoot = process.cwd();
const srcDir = join(packageRoot, "src");

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

describe("architectural boundary: @payswap/agents", () => {
  it("scans a non-empty source tree", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(15);
    expect(sourceFiles.map((file) => relative(packageRoot, file))).toContain("src/index.ts");
  });

  it("contains ONLY relative imports plus the ONE accepted sibling: a TYPE-ONLY import of @payswap/trust (the AmountSpec + authority wire authority; intelligence layer law)", () => {
    const ACCEPTED_SIBLING = "@payswap/trust";
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractModuleSpecifiers(source)) {
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
          if (specifier !== ACCEPTED_SIBLING) {
            offenders.push(`${relative(packageRoot, file)} -> '${specifier}'`);
          } else {
            // the accepted sibling import must be TYPE-ONLY (erased at runtime)
            if (!/(?:import|export)\s+type\s*\{[^}]*\}\s*from\s*['"]@payswap\/trust['"]/.test(source)) {
              offenders.push(
                `${relative(packageRoot, file)} -> '@payswap/trust' must use \`import type\` (zero runtime coupling)`,
              );
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is deterministic at the source level: no randomness, no ambient clock, no timers, no fs/network", () => {
    const offenders: string[] = [];
    const FORBIDDEN_PATTERNS: readonly { readonly pattern: RegExp; readonly label: string }[] = [
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
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_PATTERNS) {
        if (forbidden.pattern.test(source)) {
          offenders.push(`${relative(packageRoot, file)}: ${forbidden.label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("enforces the <= 400-line file law on every source file", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      if (lines > 400) {
        offenders.push(`${relative(packageRoot, file)}: ${lines} lines`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses no TS enum and no TS namespace (plain-Node type-stripping compatibility)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
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

  it("devDependencies are exactly the toolchain (typescript + vitest), no runtime dependencies", () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.devDependencies).sort()).toEqual(["typescript", "vitest"]);
  });
});
