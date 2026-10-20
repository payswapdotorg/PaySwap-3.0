import { describe, expect, it } from "vitest";
import {
  PINNED_AMBIGUITY_REASONS,
  PINNED_EVENT_PROCESSING_OUTCOMES,
  PINNED_EXTERNAL_EFFECT_OUTCOMES,
  PINNED_IDEMPOTENCY_KEY_DERIVATIONS,
  PINNED_IDEMPOTENCY_REPLAY_BEHAVIORS,
  PINNED_PAYOUT_STAGE_ORDER,
  PINNED_QUOTE_SEMANTICS,
  PINNED_STAGE_STATUSES,
  PINNED_SURFACE_LATE_STAGES,
  pinnedAuthorizationLineageStale,
  pinnedDeriveIdempotencyKey,
  pinnedIsQuoteExpired,
  pinnedIsQuoteStale,
  pinnedRatioCrossMultiplies,
  type PinnedMoney,
  type PinnedAuthorizationLineage,
  type PinnedExactRatio,
  type PinnedOperationIdempotencyContract,
  type PinnedQuoteExpiryWindow,
  type PinnedQuoteFreshness,
} from "../src/index.ts";

/**
 * The sibling wire-shape pins: every pinned VALUE law mirrors its
 * authority byte-identically (asserted against hand-derived truth
 * tables), and every pinned STRUCTURE shape admits genuine authority
 * values (subset-typed assignability proofs). The TL verifies these
 * against the real imports at integration.
 */
describe("the sibling wire-shape pins", () => {
  it("route-compiler pin: the INCLUSIVE staleness bound (fresh at exactly maxAge, stale one ms later)", () => {
    const freshness: PinnedQuoteFreshness = { asOfMs: 1_000, maxAgeMs: 30_000 };
    expect(pinnedIsQuoteStale(freshness, 1_000)).toBe(false);
    expect(pinnedIsQuoteStale(freshness, 31_000)).toBe(false); // exactly maxAge of age
    expect(pinnedIsQuoteStale(freshness, 31_001)).toBe(true); // one ms later
    expect(() => pinnedIsQuoteStale(freshness, -1)).toThrow(/no ambient clock/);
    expect(PINNED_QUOTE_SEMANTICS).toEqual(["INDICATIVE", "EXECUTABLE"]);
  });

  it("merchant pin: a quote expires AT its boundary (the last usable instant is validUntil − 1)", () => {
    const window: PinnedQuoteExpiryWindow = { quotedAt: 100n, validUntil: 200n };
    expect(pinnedIsQuoteExpired(window, 199n)).toBe(false);
    expect(pinnedIsQuoteExpired(window, 200n)).toBe(true);
    expect(pinnedIsQuoteExpired(window, 201n)).toBe(true);
    expect(() => pinnedIsQuoteExpired(window, 42 as unknown as bigint)).toThrow(/bigint/);
  });

  it("merchant pin: the exact cross-multiplication ratio law (INV-2)", () => {
    const ratio: PinnedExactRatio = { numerator: 105n, denominator: 100n };
    expect(pinnedRatioCrossMultiplies(ratio, 10_500n, 10_000n)).toBe(true);
    expect(pinnedRatioCrossMultiplies(ratio, 10_501n, 10_000n)).toBe(false);
    expect(pinnedRatioCrossMultiplies(ratio, 21_000n, 20_000n)).toBe(true);
  });

  it("protocol pin: the three-value external-effect outcome + exact money shapes", () => {
    expect(PINNED_EXTERNAL_EFFECT_OUTCOMES).toEqual(["CONFIRMED", "UNKNOWN", "FAILED"]);
    const genuineMoney: PinnedMoney = { currency: "EUR", value: 10_000n };
    expect(genuineMoney.value).toBe(10_000n);
    expect(typeof genuineMoney.currency).toBe("string");
  });

  it("provider-runtime pin: the idempotency vocabularies + the namespaced derivation", () => {
    expect(PINNED_IDEMPOTENCY_KEY_DERIVATIONS).toEqual([
      "NAMESPACED_COMMAND_ID",
      "CALLER_SUPPLIED_PROVIDER_FIELD",
      "PROVIDER_ASSIGNED_ECHO",
    ]);
    expect(PINNED_IDEMPOTENCY_REPLAY_BEHAVIORS).toEqual([
      "REPLAYS_ORIGINAL_RESULT",
      "HARMLESS_NOOP_ACKNOWLEDGEMENT",
    ]);
    const contract: PinnedOperationIdempotencyContract = {
      operationId: "op:create-payout",
      keyScope: { connection: true, operation: true },
      keyDerivation: "NAMESPACED_COMMAND_ID",
      replayBehavior: "REPLAYS_ORIGINAL_RESULT",
      conflictReporting: "PROVIDER_CONFLICT_SIGNAL",
    };
    expect(pinnedDeriveIdempotencyKey(contract, "cmd:1")).toBe("payswap:cmd:1");
    expect(
      pinnedDeriveIdempotencyKey(
        { ...contract, keyDerivation: "CALLER_SUPPLIED_PROVIDER_FIELD", providerEvidenceField: "customerTransactionId" },
        "cmd:1",
      ),
    ).toBe("cmd:1");
    expect(() => pinnedDeriveIdempotencyKey(contract, "")).toThrow(/command id/);
  });

  it("provider-runtime pin: the ambiguity reasons + the event-processing outcomes", () => {
    expect(PINNED_AMBIGUITY_REASONS).toEqual([
      "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
      "MALFORMED_RESPONSE_AFTER_DISPATCH",
    ]);
    expect(PINNED_EVENT_PROCESSING_OUTCOMES).toEqual([
      "CANONICAL_ADVANCED",
      "SUPERSEDED_BY_NEWER_OBSERVATION",
      "RETAINED_WITHOUT_OBJECT_STATE",
      "DUPLICATE_IGNORED",
    ]);
  });

  it("surface pin: the late stages, the UNKNOWN-first-class statuses and the payout stage order", () => {
    expect(PINNED_SURFACE_LATE_STAGES).toEqual(["RETURNED", "REFUNDED", "CHARGED_BACK"]);
    expect(PINNED_STAGE_STATUSES).toContain("UNKNOWN");
    expect(PINNED_STAGE_STATUSES.length).toBe(6);
    expect(PINNED_PAYOUT_STAGE_ORDER).toEqual([
      "PAYOUT_INSTRUCTED",
      "PAYOUT_SUBMITTED",
      "PAYOUT_SENT",
      "BENEFICIARY_CREDITED",
    ]);
  });

  it("trust pin: the authorization lineage + the epoch-staleness law", () => {
    const lineage: PinnedAuthorizationLineage = {
      mandateRef: "mandate:1",
      grantRef: "grant:1",
      issuedAtEpoch: 7n,
    };
    expect(pinnedAuthorizationLineageStale(lineage, 7n)).toBe(false);
    expect(pinnedAuthorizationLineageStale(lineage, 8n)).toBe(true);
    expect(() => pinnedAuthorizationLineageStale(lineage, -1n)).toThrow(/non-negative/);
  });
});
