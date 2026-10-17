import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Threat-intel subpath boundary (R2-W2 — the 3.0 law, adapted from the
 * old repository's P4-W3-003 boundary test, re-homed into the merged
 * @payswap/onchain-security package).
 *
 * 1. threat-intel src/** NEVER references the security immune-system
 *    package (not even as a string): composition with the real machinery
 *    is a wiring/test-layer concern. This keeps BOTH boundary tests
 *    green;
 * 2. ZERO sibling imports: every module specifier in threat-intel src
 *    is RELATIVE (no @payswap/* anywhere — the kernel is imported
 *    relatively within the same package);
 * 3. threat-intel src/** contains NO venue vocabulary and NO execution/
 *    broadcast machinery: the adversarial agent detects threats, it
 *    never executes;
 * 4. no randomness / floating-point parsing / ambient clock in
 *    threat-intel src/** (exact integers, rationals, basis points only);
 * 5. fixtures in this test tree use obviously-synthetic addresses only.
 */

const PACKAGE_ROOT = process.cwd(); // vitest runs from packages/onchain-security
const THREAT_INTEL_SRC = join(PACKAGE_ROOT, "src", "threat-intel");

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

const SRC_FILES = listSourceFiles(THREAT_INTEL_SRC);

function rel(file: string): string {
  return relative(PACKAGE_ROOT, file).split(sep).join("/");
}

/** Execution/broadcast machinery this subpath must never own. */
const FORBIDDEN_EXECUTION_VOCABULARY: readonly string[] = [
  "broadcastTransaction",
  "BroadcastHandoff",
  "signTransaction",
  "sendTransaction",
  "postJournalEntry",
  "issueAuthorization",
  "grantAuthority",
  "SignedApprovalArtifact",
];

describe("threat-intel subpath boundary (the R2-W2 law)", () => {
  it("scans a non-empty threat-intel src tree", () => {
    expect(SRC_FILES.length).toBeGreaterThan(5);
  });

  it("threat-intel src/** never references the immune-system package (composition is wiring/test-layer)", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const source = readFileSync(file, "utf8");
      if (source.includes("@payswap/security")) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ZERO sibling imports: every threat-intel src module specifier is RELATIVE", () => {
    const offenders: { file: string; specifier: string }[] = [];
    for (const file of SRC_FILES) {
      let source = readFileSync(file, "utf8");
      // Strip template literals first: detector summaries legitimately
      // contain prose like "changed from 'X' to 'Y'" which would otherwise
      // false-positive the import-pattern scan.
      source = source.replace(/`[^`]*`/g, "``");
      const importSpecifiers = [
        ...source.matchAll(/from\s+["']([^"']+)["']/g),
        ...source.matchAll(/import\s+["']([^"']+)["']/g),
      ];
      for (const match of importSpecifiers) {
        const specifier = match[1] ?? "";
        if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
          offenders.push({ file: rel(file), specifier });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("threat-intel src/** contains no venue-specific vocabulary (the intel layer is venue-agnostic)", () => {
    const forbidden = [/uniswap/i, /sushi/i, /curve\/v/i, /1inch/i, /balancer/i, /cowswap/i];
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          offenders.push(`${rel(file)} matches ${String(pattern)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("threat-intel src/** owns no execution/broadcast machinery (detect, never execute)", () => {
    const offenders: { file: string; term: string }[] = [];
    for (const file of SRC_FILES) {
      const source = readFileSync(file, "utf8");
      for (const term of FORBIDDEN_EXECUTION_VOCABULARY) {
        if (source.includes(term)) {
          offenders.push({ file: rel(file), term });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no randomness or floating-point parsing anywhere in threat-intel src/**", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const source = readFileSync(file, "utf8");
      if (source.includes("Math.random")) {
        offenders.push(`${rel(file)}: Math.random`);
      }
      if (/parseFloat\(|Number\(\s*[a-zA-Z][^)]*\.\s*(replace|split|substring)/.test(source)) {
        offenders.push(`${rel(file)}: float parsing`);
      }
      if (/\bnew Date\(/.test(source)) {
        offenders.push(`${rel(file)}: ambient clock (new Date)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("test fixtures use obviously-synthetic addresses only (no real-world addresses)", () => {
    const testFiles = listSourceFiles(join(PACKAGE_ROOT, "test", "threat-intel"));
    const offenders: string[] = [];
    // Well-known real-world mainnet addresses (spot list), assembled at
    // RUNTIME from fragments so the literals never appear in source (the
    // repo's credential-shape discipline applied to address fixtures).
    const knownReal = [
      ["0xdAC17F958D2ee523a2206206994597", "C13D831ec7"],
      ["0xA0b86991c6218b36c1d19D4a2e9Eb0", "cE3606eB48"],
      ["0xC02aaA39b223FE8D0A0e5C4F27eAD9", "083C756Cc2"],
      ["0x514910771AF9Ca656af840dff83E8", "264EcF986CA"],
    ].map((parts) => parts.join(""));
    for (const file of testFiles) {
      const source = readFileSync(file, "utf8");
      for (const address of knownReal) {
        if (source.includes(address)) {
          offenders.push(`${rel(file)}: real-world address ${address.slice(0, 8)}…`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
