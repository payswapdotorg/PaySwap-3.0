/**
 * @payswap/merchant — the secret-boundary detector law suite (P5-W3,
 * lane R3-W3, Task 3-g).
 *
 * PORTING SOURCES (old repo @ 8a735bf, read-only):
 * - merchant-crypto/test/adversarial.test.ts probe 3 (L196-231): the old
 *   fs-walking probes "no secret-bearing field names in src" + "no
 *   credential literals in src" — REBASED onto the detector law itself:
 *   the detectors, the deep runtime scan and the fail-closed gate are
 *   exercised directly on runtime-assembled fixtures.
 * - merchant-checkout/test/adversarial.test.ts "secret-bearing values
 *   are rejected in evidence records" (L354-415): journey evidence scans
 *   clean, an apiKey field name is rejected at construction, a raw
 *   32-byte key shape cannot ride a neutral field — PORTED onto
 *   scanForSecretMaterial / assertNoSecretMaterial / SecretShapeError.
 * - ADAPTED from the accepted onchain-security kernel's byte-identical
 *   detector reference (raw-key + BIP-39 shapes, forbidden key vocabulary,
 *   derived-identifier exemptions). NET-NEW for this package: the Stripe
 *   sk_/rk_/whsec_ key-kind extension, the redaction policy, the
 *   cycle/depth bounds and the compile-time twin.
 *
 * THE SECRET-LITERAL LAW: no realistic secret literal appears anywhere
 * below — every credential-shaped fixture is STRUCTURE ONLY, assembled
 * at runtime from fragments (prefix + repeated filler, word arrays).
 */

import { describe, expect, it } from "vitest";
import {
  DERIVED_IDENTIFIER_KEY_FRAGMENTS,
  FORBIDDEN_SECRET_KEY_EXACT,
  FORBIDDEN_SECRET_KEY_SUBSTRINGS,
  REDACTION_MARKERS,
  assertNoSecretMaterial,
  isDerivedIdentifierKey,
  isForbiddenKeyName,
  isMnemonicShape,
  isProviderSecretKeyShape,
  isRawKeyShape,
  redactSecretShapedValues,
  scanForSecretMaterial,
  type SecretFree,
} from "../src/secrets.ts";
import { SecretShapeError } from "../src/errors.ts";
import type { SecretViolation } from "../src/errors.ts";

// ---------------------------------------------------------------------------
// Runtime-assembled, structure-only credential shapes (never literals)
// ---------------------------------------------------------------------------

const HEX_64 = "a".repeat(64);
const HEX_64_PREFIXED = "0x" + HEX_64;
const HEX_64_UPPER = "F".repeat(64);
const PUBLIC_ADDRESS_40 = "0x" + "b".repeat(40);
const NON_HEX_64 = "g".repeat(64);

const WORDS_12: readonly string[] = [
  "alfa",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliett",
  "kilo",
  "lima",
];
const MNEMONIC_12 = WORDS_12.join(" ");
const MNEMONIC_24 = [...WORDS_12, ...WORDS_12].join(" ");
const MNEMONIC_13 = [...WORDS_12, "mike"].join(" ");

const SK_LIVE_SHAPE = "sk_live_" + "A".repeat(24);
const SK_TEST_SHAPE = "sk_test_" + "a".repeat(16);
const RK_LIVE_SHAPE = "rk_live_" + "z".repeat(20);
const RK_TEST_SHAPE = "rk_test_" + "z".repeat(20);
const WHSEC_SHAPE = "whsec_" + "q".repeat(24);
const PK_LIVE_SHAPE = "pk_live_" + "p".repeat(24);
const PK_TEST_SHAPE = "pk_test_" + "p".repeat(24);
const SHORT_TAIL_SHAPE = "sk_live_" + "a".repeat(15);

function violationPaths(violations: readonly SecretViolation[]): readonly string[] {
  return violations.map((violation) => violation.path);
}

function violationKinds(violations: readonly SecretViolation[]): readonly string[] {
  return violations.map((violation) => violation.kind);
}

// ---------------------------------------------------------------------------
// The compile-time twin (type-level proofs; the consts below COMPILE iff
// the twin holds — the clean contract passes through untouched, and the
// violating contract resolves to the ["FORBIDDEN_SECRET_KEY", "apiKey"]
// tuple rather than to the contract itself)
// ---------------------------------------------------------------------------

type _check = SecretFree<{ orderId: string }>;
type CleanContract = {
  readonly orderId: string;
  readonly requestHash: string;
  readonly totals: readonly bigint[];
};
type CleanSecretFree = SecretFree<CleanContract>;
type ViolatingSecretFree = SecretFree<{ readonly apiKey: string; readonly note: string }>;
type ViolationHead = ViolatingSecretFree extends readonly [infer Head, ...unknown[]]
  ? Head
  : never;
type ViolationKey = ViolatingSecretFree extends readonly [string, infer Key] ? Key : never;

const cleanContract: CleanSecretFree = {
  orderId: "order-1",
  requestHash: "fnv1a64:1",
  totals: [1000n],
};
const violationHead: ViolationHead = "FORBIDDEN_SECRET_KEY";
const violationKey: ViolationKey = "apiKey";

describe("the secret-boundary detector law (INV-19)", () => {
  it("isRawKeyShape — the byte-identical kernel law: 64 hex with or without the 0x prefix; a 20-byte PUBLIC address is never flagged", () => {
    expect(isRawKeyShape(HEX_64)).toBe(true);
    expect(isRawKeyShape(HEX_64_PREFIXED)).toBe(true);
    expect(isRawKeyShape(HEX_64_UPPER)).toBe(true);
    expect(isRawKeyShape(PUBLIC_ADDRESS_40)).toBe(false);
    expect(isRawKeyShape("a".repeat(63))).toBe(false);
    expect(isRawKeyShape("a".repeat(65))).toBe(false);
    expect(isRawKeyShape("0x" + "a".repeat(63))).toBe(false);
    expect(isRawKeyShape(NON_HEX_64)).toBe(false);
    expect(isRawKeyShape("")).toBe(false);
  });

  it("isMnemonicShape — exactly 12 or 24 lowercase words pass; 11, 13 and 25 words fail", () => {
    expect(isMnemonicShape(MNEMONIC_12)).toBe(true);
    expect(isMnemonicShape(MNEMONIC_24)).toBe(true);
    expect(isMnemonicShape(MNEMONIC_13)).toBe(false);
    expect(isMnemonicShape(WORDS_12.slice(0, 11).join(" "))).toBe(false);
    expect(isMnemonicShape([...WORDS_12, ...WORDS_12, "mike"].join(" "))).toBe(false);
    expect(isMnemonicShape("")).toBe(false);
  });

  it("isMnemonicShape — word-shape laws: uppercase, digit-bearing, 2- and 9-letter words fail; surrounding whitespace is trimmed", () => {
    expect(isMnemonicShape("  " + MNEMONIC_12 + "   ")).toBe(true);
    // repeated interior whitespace collapses to one separator per token:
    expect(isMnemonicShape(MNEMONIC_12.replace(" ", "  "))).toBe(true);
    expect(isMnemonicShape(["Alfa", ...WORDS_12.slice(1)].join(" "))).toBe(false);
    expect(isMnemonicShape([...WORDS_12.slice(0, 11), "alfa1"].join(" "))).toBe(false);
    expect(isMnemonicShape(["ab", ...WORDS_12.slice(1)].join(" "))).toBe(false);
    expect(isMnemonicShape([...WORDS_12.slice(0, 11), "abcdefghi"].join(" "))).toBe(false);
    expect(isMnemonicShape(WORDS_12[0] ?? "alfa")).toBe(false);
  });

  it("isProviderSecretKeyShape — runtime-assembled Stripe key kinds: sk_ and rk_ (live + test) and whsec_ are flagged", () => {
    expect(isProviderSecretKeyShape(SK_LIVE_SHAPE)).toBe(true);
    expect(isProviderSecretKeyShape(SK_TEST_SHAPE)).toBe(true);
    expect(isProviderSecretKeyShape(RK_LIVE_SHAPE)).toBe(true);
    expect(isProviderSecretKeyShape(RK_TEST_SHAPE)).toBe(true);
    expect(isProviderSecretKeyShape(WHSEC_SHAPE)).toBe(true);
  });

  it("isProviderSecretKeyShape — publishable pk_ keys are PUBLIC by design and never flagged; plain ids and short tails are not key shapes", () => {
    expect(isProviderSecretKeyShape(PK_LIVE_SHAPE)).toBe(false);
    expect(isProviderSecretKeyShape(PK_TEST_SHAPE)).toBe(false);
    expect(isProviderSecretKeyShape(SHORT_TAIL_SHAPE)).toBe(false);
    expect(isProviderSecretKeyShape("acct_fixture_1")).toBe(false);
    expect(isProviderSecretKeyShape("pi_fixture_0001")).toBe(false);
    expect(isProviderSecretKeyShape("")).toBe(false);
  });

  it("isForbiddenKeyName — the forbidden substring vocabulary fires in every spelling (camel/snake/kebab, any case)", () => {
    for (const fragment of FORBIDDEN_SECRET_KEY_SUBSTRINGS) {
      expect(isForbiddenKeyName(fragment)).toBe(true);
    }
    expect(isForbiddenKeyName("privateKey")).toBe(true);
    expect(isForbiddenKeyName("private_key")).toBe(true);
    expect(isForbiddenKeyName("PRIVATE-KEY")).toBe(true);
    expect(isForbiddenKeyName("walletPassword")).toBe(true);
    expect(isForbiddenKeyName("provider-api-secret")).toBe(true);
    expect(isForbiddenKeyName("sessionToken")).toBe(true);
    expect(isForbiddenKeyName("browserCookie")).toBe(true);
    expect(isForbiddenKeyName("totpCode")).toBe(true);
    expect(isForbiddenKeyName("otpValue")).toBe(true);
  });

  it("isForbiddenKeyName — 'seed' is forbidden ONLY as an exact normalized key; the lawful opaque references stay clean", () => {
    expect(FORBIDDEN_SECRET_KEY_EXACT).toEqual(["seed"]);
    expect(isForbiddenKeyName("seed")).toBe(true);
    expect(isForbiddenKeyName("SEED")).toBe(true);
    expect(isForbiddenKeyName("seed-phrase")).toBe(true);
    expect(isForbiddenKeyName("seedPhrase")).toBe(true);
    expect(isForbiddenKeyName("seedling")).toBe(false);
    expect(isForbiddenKeyName("growthSeed")).toBe(false);
    expect(isForbiddenKeyName("seeds")).toBe(false);
    expect(isForbiddenKeyName("credentialRef")).toBe(false);
    expect(isForbiddenKeyName("vaultRef")).toBe(false);
    expect(isForbiddenKeyName("orderId")).toBe(false);
    expect(isForbiddenKeyName("merchantName")).toBe(false);
  });

  it("isDerivedIdentifierKey — derived public identifier names are value-scan-exempt by fragment", () => {
    for (const fragment of DERIVED_IDENTIFIER_KEY_FRAGMENTS) {
      expect(isDerivedIdentifierKey(fragment)).toBe(true);
    }
    expect(isDerivedIdentifierKey("requestHash")).toBe(true);
    expect(isDerivedIdentifierKey("txid")).toBe(true);
    expect(isDerivedIdentifierKey("txRef")).toBe(true);
    expect(isDerivedIdentifierKey("transactionId")).toBe(true);
    expect(isDerivedIdentifierKey("blockHash")).toBe(true);
    expect(isDerivedIdentifierKey("domainSeparator")).toBe(true);
    expect(isDerivedIdentifierKey("orderId")).toBe(false);
    expect(isDerivedIdentifierKey("credentialRef")).toBe(false);
    expect(isDerivedIdentifierKey("note")).toBe(false);
  });

  it("scanForSecretMaterial — deep detection through nested objects and arrays with exact dotted/indexed paths", () => {
    const record = {
      envelope: {
        events: [
          { traceId: "trace-1", payload: { note: HEX_64 } },
          { traceId: "trace-2", payload: { summary: MNEMONIC_12 } },
        ],
      },
      gateway: WHSEC_SHAPE,
    };
    const violations = scanForSecretMaterial(record);
    expect(violations.length).toBe(3);
    expect(violationPaths(violations)).toEqual([
      "$.envelope.events[0].payload.note",
      "$.envelope.events[1].payload.summary",
      "$.gateway",
    ]);
    expect(violationKinds(violations)).toEqual([
      "secret_shaped_value",
      "secret_shaped_value",
      "secret_shaped_value",
    ]);
    expect(violations[0]?.key).toBe("note");
  });

  it("scanForSecretMaterial — a forbidden KEY NAME is a violation by the name alone (its value is never rescanned)", () => {
    const named = scanForSecretMaterial({ apiKey: "plain-non-secret" });
    expect(named.length).toBe(1);
    expect(named[0]?.kind).toBe("forbidden_key");
    expect(named[0]?.key).toBe("apiKey");
    expect(named[0]?.path).toBe("$.apiKey");
    expect(named[0]?.reason).toMatch(/INV-19/);
    // the name alone is the violation — even when the value is ALSO
    // key-shaped, exactly one forbidden_key violation is reported:
    const double = scanForSecretMaterial({ apiKey: HEX_64 });
    expect(double.length).toBe(1);
    expect(double[0]?.kind).toBe("forbidden_key");
  });

  it("scanForSecretMaterial — raw-key, mnemonic and provider-key VALUES under non-derived keys are each reported with their shape", () => {
    const violations = scanForSecretMaterial({
      note: HEX_64,
      summary: MNEMONIC_12,
      gateway: SK_LIVE_SHAPE,
    });
    expect(violations.length).toBe(3);
    expect(violationKinds(violations)).toEqual([
      "secret_shaped_value",
      "secret_shaped_value",
      "secret_shaped_value",
    ]);
    expect(violations[0]?.reason).toMatch(/raw 32-byte/);
    expect(violations[1]?.reason).toMatch(/BIP-39/);
    expect(violations[2]?.reason).toMatch(/provider secret-key/);
    expect(violationPaths(violations)).toEqual(["$.note", "$.summary", "$.gateway"]);
  });

  it("scanForSecretMaterial — derived-identifier keys are exempt from VALUE scanning; a forbidden name still wins over the exemption", () => {
    const exempt = scanForSecretMaterial({
      requestHash: HEX_64,
      txid: HEX_64_PREFIXED,
      blockHash: HEX_64_UPPER,
      signature: HEX_64,
    });
    expect(exempt).toEqual([]);
    // the exemption protects VALUES, never NAMES — a key whose name is
    // forbidden is reported even though it also carries a hash fragment:
    const precedence = scanForSecretMaterial({ apiKeyHash: "plain" });
    expect(precedence.length).toBe(1);
    expect(precedence[0]?.kind).toBe("forbidden_key");
  });

  it("scanForSecretMaterial — cycles are cut by identity tracking and the scan terminates clean", () => {
    const selfRef: Record<string, unknown> = { trace: "fnv1a64:1" };
    selfRef.self = selfRef;
    const mutualA: Record<string, unknown> = {};
    const mutualB: Record<string, unknown> = { back: mutualA };
    mutualA.forth = mutualB;
    const loop: unknown[] = ["clean"];
    loop.push(loop);
    expect(scanForSecretMaterial(selfRef)).toEqual([]);
    expect(scanForSecretMaterial(mutualA)).toEqual([]);
    expect(scanForSecretMaterial(loop)).toEqual([]);
  });

  it("scanForSecretMaterial — the depth bound 8: the deepest scanned chain is 9 objects; a 10-deep chain is not scanned", () => {
    let atBound: Record<string, unknown> = { leaf: HEX_64 };
    for (let wrap = 0; wrap < 8; wrap += 1) {
      atBound = { level: atBound };
    }
    const within = scanForSecretMaterial(atBound);
    expect(within.length).toBe(1);
    expect(within[0]?.path).toBe("$" + ".level".repeat(8) + ".leaf");
    let overBound: Record<string, unknown> = { leaf: HEX_64 };
    for (let wrap = 0; wrap < 9; wrap += 1) {
      overBound = { level: overBound };
    }
    expect(scanForSecretMaterial(overBound)).toEqual([]);
  });

  it("assertNoSecretMaterial — throws SecretShapeError carrying the full violations list with verbatim paths and kinds", () => {
    let caught: unknown;
    try {
      assertNoSecretMaterial({ note: HEX_64, apiKey: "plain" }, "probe record");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SecretShapeError);
    const shapeError = caught as SecretShapeError;
    expect(shapeError.violations.length).toBe(2);
    expect(violationPaths(shapeError.violations)).toEqual(["$.note", "$.apiKey"]);
    expect(violationKinds(shapeError.violations)).toEqual([
      "secret_shaped_value",
      "forbidden_key",
    ]);
    expect(shapeError.code).toBe("SECRET_SHAPE");
    expect(shapeError.category).toBe("SECURITY");
    expect(shapeError.message).toMatch(/probe record/);
    expect(shapeError.message).toMatch(/\$\.note/);
  });

  it("assertNoSecretMaterial — clean records pass (derived hex64, public addresses, publishable refs, primitives)", () => {
    const clean = {
      orderId: "order-1",
      requestHash: HEX_64,
      txid: HEX_64_PREFIXED,
      blockHash: HEX_64_UPPER,
      publicAddress: PUBLIC_ADDRESS_40,
      publishableRef: PK_LIVE_SHAPE,
      rows: ["usdc", "eth"],
      totals: { netMinor: 10000n },
      evidence: [{ evidenceId: "ev-1", recordedAt: 1761628800000n }],
    };
    expect(scanForSecretMaterial(clean)).toEqual([]);
    expect(() => assertNoSecretMaterial(clean, "clean record")).not.toThrow();
    expect(() => assertNoSecretMaterial(null, "null")).not.toThrow();
    expect(() => assertNoSecretMaterial("plain descriptive text", "text")).not.toThrow();
    expect(() => assertNoSecretMaterial(1000n, "bigint")).not.toThrow();
  });

  it("redactSecretShapedValues — a deep copy with the three shape markers; the input is never mutated", () => {
    const original = {
      note: HEX_64,
      summary: MNEMONIC_12,
      gateway: SK_LIVE_SHAPE,
      keep: "verbatim",
      rows: [WHSEC_SHAPE, "plain"],
      deep: { leaf: HEX_64_PREFIXED },
    };
    const snapshot = JSON.stringify(original);
    const redacted = redactSecretShapedValues(original) as Record<string, unknown>;
    expect(redacted).not.toBe(original);
    expect(redacted.note).toBe(REDACTION_MARKERS.rawKey);
    expect(redacted.summary).toBe(REDACTION_MARKERS.mnemonic);
    expect(redacted.gateway).toBe(REDACTION_MARKERS.providerKey);
    expect(redacted.keep).toBe("verbatim");
    const rows = redacted.rows as readonly unknown[];
    expect(rows[0]).toBe(REDACTION_MARKERS.providerKey);
    expect(rows[1]).toBe("plain");
    const deep = redacted.deep as Record<string, unknown>;
    expect(deep.leaf).toBe(REDACTION_MARKERS.rawKey);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original.note).toBe(HEX_64);
    expect(original.gateway).toBe(SK_LIVE_SHAPE);
    expect(original.rows[0]).toBe(WHSEC_SHAPE);
    expect(redactSecretShapedValues(HEX_64)).toBe(REDACTION_MARKERS.rawKey);
    expect(redactSecretShapedValues("plain")).toBe("plain");
  });

  it("SecretFree — the compile-time twin: clean contracts pass through; a forbidden key resolves to the pinned error tuple", () => {
    expect(cleanContract.orderId).toBe("order-1");
    expect(violationHead).toBe("FORBIDDEN_SECRET_KEY");
    expect(violationKey).toBe("apiKey");
    // the runtime twin agrees with the compile-time proof:
    expect(isForbiddenKeyName("apiKey")).toBe(true);
    expect(isForbiddenKeyName("note")).toBe(false);
    expect(scanForSecretMaterial({ apiKey: "x" }).length).toBe(1);
  });
});
