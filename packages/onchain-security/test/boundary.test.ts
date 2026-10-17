import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AgentSecurityFlag,
  ExpectedStateDiff,
  GateDecision,
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
  OnchainWriteRequest,
  RecheckObservation,
  SigningDelegation,
  SigningRequest,
  SimulationObservation,
  TrustedSurfaceSigner,
} from "../src/index.ts";
import type { FindForbiddenSecretKeys } from "../src/index.ts";

/**
 * Package boundary (@payswap/onchain-security, R2-W2 — the 3.0 law,
 * adapted from the post-fix packages/agents boundary pattern + the old
 * repository's P4-W1-002 boundary test).
 *
 * 1. ZERO sibling imports (the R2-W2 layer law): EVERY src module
 *    specifier is RELATIVE — no @payswap/* anywhere, no bare package
 *    imports, no node: builtins in src. Cross-lane contract shapes live
 *    in src/pins/ as structural mirrors;
 * 2. tsconfig.json has NO paths entries (the machine-checked twin of 1);
 * 3. EVM/EIP-712/ERC-1271 vocabulary lives ONLY in src/adapters/* — core
 *    contracts stay provider-neutral (INV-17);
 * 4. determinism guards: no randomness, no ambient clock, no timers, no
 *    network in src/;
 * 5. secret hygiene: no 64-hex (raw-key-shaped) literal anywhere in src
 *    or test — credential-shaped fixtures are assembled at RUNTIME;
 * 6. type-level proof: FindForbiddenSecretKeys resolves to never for
 *    every agent-facing contract (INV-19);
 * 7. the <= 400-line file law, no TS enum, no TS namespace;
 * 8. devDependencies are exactly the toolchain (typescript + vitest), no
 *    runtime dependencies, and package.json exports the pinned subpaths.
 */

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

const CORE_MODULES = [
  "types.ts",
  "digest.ts",
  "secrets.ts",
  "secrets-policy.ts",
  "write-intent.ts",
  "simulation.ts",
  "diff.ts",
  "gates-policy.ts",
  "gates.ts",
  "gates-simulation.ts",
  "block-law.ts",
  "delegation.ts",
  "authorization.ts",
  "authorization-verify.ts",
  "recheck.ts",
  "pipeline-machine.ts",
  "pipeline.ts",
  "signers.ts",
  "index.ts",
] as const;

const EVM_VOCABULARY = [
  "EIP-712",
  "EIP712",
  "eip712",
  "ERC-1271",
  "ERC1271",
  "erc1271",
  "chainId",
  "chainid",
  "secp256k1",
  "ethereum",
  "Ethereum",
  "EVM",
  "metamask",
] as const;

const RAW_KEY_LITERAL_PATTERN = /(0x)?[0-9a-fA-F]{64}/;

const SOURCE_FILES = listFiles(join(PACKAGE_ROOT, "src"), (p) => p.endsWith(".ts"));

describe("package boundary (@payswap/onchain-security — the R2-W2 law)", () => {
  it("scans a non-empty src tree", () => {
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(12);
    expect(SOURCE_FILES.map((file) => relativePath(file))).toContain("src/index.ts");
  });

  it("ZERO sibling imports: every src module specifier is RELATIVE (no @payswap/*, no bare, no node:)", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
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

  it("EVM signing vocabulary lives ONLY in src/adapters/* (core contracts stay provider-neutral, INV-17)", () => {
    const offenders: { file: string; term: string }[] = [];
    for (const file of SOURCE_FILES) {
      if (file.includes(join("src", "adapters"))) {
        continue; // adapters own the chain-family semantics by law
      }
      const code = stripStringsAndComments(readFileSync(file, "utf8"));
      for (const term of EVM_VOCABULARY) {
        if (code.includes(term)) {
          offenders.push({ file: relativePath(file), term });
        }
      }
    }
    expect(offenders).toEqual([]);
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

  it("type-level proof: every agent-facing contract is secret-free (FindForbiddenSecretKeys = never)", () => {
    expectTypeOf<FindForbiddenSecretKeys<OnchainWriteRequest>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<SimulationObservation>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<ExpectedStateDiff>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<GateDecision>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<AgentSecurityFlag>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<OnchainAuthorizationRequest>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<OnchainAuthorizationArtifact>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<RecheckObservation>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<SigningRequest>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<SigningDelegation>>().toBeNever();
    expectTypeOf<FindForbiddenSecretKeys<TrustedSurfaceSigner>>().toBeNever();
  });

  it("the core contract modules all exist with the expected names", () => {
    const srcFiles = SOURCE_FILES.map((path) => path.split(sep).pop() ?? "");
    for (const module of CORE_MODULES) {
      expect(srcFiles).toContain(module);
    }
  });

  it("enforces the <= 400-line file law on every source file", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      if (lines > 400) {
        offenders.push(`${relativePath(file)}: ${lines} lines`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses no TS enum and no TS namespace (plain-Node type-stripping compatibility)", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
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
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([
      ".",
      "./adapters/eip712",
      "./adapters/erc1271",
      "./threat-intel",
    ]);
  });
});

function relativePath(file: string): string {
  return file.replace(PACKAGE_ROOT + sep, "");
}
