import { describe, expect, it } from "vitest";
import {
  PINNED_ADVISORY_ACTIONS,
  PINNED_ADVISORY_SEVERITIES,
  PINNED_ADVISORY_STATUSES,
  PINNED_AUTHORIZATION_CHANGE_KINDS,
  PINNED_AUTHORIZATION_STATUSES,
  PINNED_CAPABILITY_STATES,
  PINNED_DANGER_TONES,
  PINNED_DESIGN_TOKEN_VERSION,
  PINNED_ELIGIBILITY_OBSERVATIONS,
  PINNED_ENVIRONMENT_KINDS,
  PINNED_FORBIDDEN_SECRET_KEY_EXACT,
  PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS,
  PINNED_OUTCOME_ACTION_IDS,
  PINNED_OUTCOME_CHIP_STATES,
  PINNED_QUOTE_FRESHNESS_STATUSES,
  PINNED_RECHECK_DRIFT_REASONS,
  PINNED_REDACTED_MARKER_KINDS,
  PINNED_SESSION_LOOKUP_REASONS,
  PINNED_STAGE_STATUSES,
  PINNED_STATUS_TONES,
  PINNED_TEST_MARK_IS_INVERTED_STONE,
  PINNED_UNIVERSAL_AREA_IDS,
  PINNED_UNKNOWN_TONE,
  pinnedIsMnemonicShape,
  pinnedIsOpaqueCredentialRef,
  pinnedIsRawKeyShape,
  pinnedResolveEffectiveAvailability,
} from "../src/index.ts";
import {
  bareKeyFixture,
  mnemonic12Fixture,
  mnemonic24Fixture,
  rawKeyFixture,
} from "./fixtures.ts";

/**
 * The pin consistency suite (P8-W2; NET-NEW): every VALUE pin is
 * asserted against its authority's PUBLISHED law (the sibling sources
 * read at base f9392a3 — value pinning, never value imports). The
 * authorities: surface (P2-W3), adversarial (P6-W3), onchain-security
 * (R2-W2), capability (P2-W1), ui src/payswap (P7), command.
 */
describe("the pinned wire shapes are consistent with their authorities", () => {
  it("surface law: the five outcome actions, the eleven areas, the six stage statuses, the eight change kinds, the two freshness arms", () => {
    expect([...PINNED_OUTCOME_ACTION_IDS]).toEqual([
      "pay",
      "receive",
      "move",
      "convert",
      "checkout",
    ]);
    expect([...PINNED_UNIVERSAL_AREA_IDS]).toEqual([
      "overview",
      "payments",
      "accounts",
      "activity",
      "opportunities",
      "connections",
      "capabilities",
      "security",
      "reports",
      "developers",
      "settings",
    ]);
    expect(PINNED_UNIVERSAL_AREA_IDS).toHaveLength(11);
    expect([...PINNED_STAGE_STATUSES]).toEqual([
      "ACHIEVED",
      "IN_PROGRESS",
      "PENDING",
      "UNKNOWN",
      "FAILED",
      "NOT_APPLICABLE",
    ]);
    expect([...PINNED_AUTHORIZATION_CHANGE_KINDS]).toEqual([
      "QUOTE_EXPIRED",
      "QUOTE_TERMS_CHANGED",
      "RECIPIENT_CHANGED",
      "AMOUNT_CHANGED",
      "FUNDING_METHOD_CHANGED",
      "PROVIDER_OBSERVATION_CHANGED",
      "SECURITY_EPOCH_ADVANCED",
      "MANDATE_REVOKED",
    ]);
    expect([...PINNED_QUOTE_FRESHNESS_STATUSES]).toEqual([
      "VALID",
      "EXPIRED",
    ]);
  });

  it("adversarial law (INV-21 vocabulary): severities, actions, statuses — the halt/remediation anchors", () => {
    expect([...PINNED_ADVISORY_SEVERITIES]).toEqual([
      "low",
      "medium",
      "high",
      "critical",
    ]);
    expect([...PINNED_ADVISORY_ACTIONS]).toEqual([
      "restrict",
      "quarantine",
      "retire",
    ]);
    expect([...PINNED_ADVISORY_STATUSES]).toEqual(["active", "closed"]);
  });

  it("onchain-security law: forbidden key substrings, exact stems, redaction markers, drift reasons (all thirteen)", () => {
    expect(PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS).toContain("secret");
    expect(PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS).toContain("accesstoken");
    expect(PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS).toHaveLength(25);
    expect([...PINNED_FORBIDDEN_SECRET_KEY_EXACT]).toEqual(["seed"]);
    expect([...PINNED_REDACTED_MARKER_KINDS]).toEqual([
      "raw_key",
      "mnemonic",
      "forbidden_key",
    ]);
    expect([...PINNED_RECHECK_DRIFT_REASONS]).toEqual([
      "stale_observation",
      "authorization_expired",
      "stale_network_epoch",
      "chain_drift",
      "asset_drift",
      "amount_drift",
      "destination_drift",
      "approval_drift",
      "route_drift",
      "nonce_drift",
      "protocol_identity_drift",
      "settlement_instruction_drift",
      "write_payload_drift",
    ]);
  });

  it("onchain-security detectors (behaviour pins): raw-key and mnemonic shapes, on runtime-assembled fixtures", () => {
    expect(pinnedIsRawKeyShape(rawKeyFixture())).toBe(true);
    expect(pinnedIsRawKeyShape(bareKeyFixture())).toBe(true);
    expect(pinnedIsRawKeyShape("0x1234")).toBe(false);
    expect(pinnedIsRawKeyShape("not-a-key")).toBe(false);
    expect(pinnedIsMnemonicShape(mnemonic12Fixture())).toBe(true);
    expect(pinnedIsMnemonicShape(mnemonic24Fixture())).toBe(true);
    // 11 words / uppercase words / empty — not mnemonic shapes.
    expect(pinnedIsMnemonicShape(mnemonic12Fixture().split(" ").slice(0, 11).join(" "))).toBe(false);
    expect(pinnedIsMnemonicShape(mnemonic12Fixture().toUpperCase())).toBe(false);
    expect(pinnedIsMnemonicShape("")).toBe(false);
  });

  it("capability law: closed eligibility/authorization vocabularies + the two-axis availability matrix (all nine pairs)", () => {
    expect([...PINNED_ELIGIBILITY_OBSERVATIONS]).toEqual([
      "ELIGIBLE",
      "NOT_ELIGIBLE",
      "UNKNOWN",
    ]);
    expect([...PINNED_AUTHORIZATION_STATUSES]).toEqual([
      "ACTIVE",
      "PENDING",
      "REVOKED",
      "EXPIRED",
      "UNKNOWN",
    ]);
    expect([...PINNED_CAPABILITY_STATES]).toEqual([
      "AVAILABLE",
      "DEGRADED",
      "UNAVAILABLE",
    ]);
    for (const state of PINNED_CAPABILITY_STATES) {
      expect(pinnedResolveEffectiveAvailability(state, "REACHABLE")).toBe(state);
      expect(pinnedResolveEffectiveAvailability(state, "UNREACHABLE")).toBe(
        "UNKNOWN",
      );
      expect(pinnedResolveEffectiveAvailability(state, "UNKNOWN")).toBe(
        "UNKNOWN",
      );
    }
    expect(pinnedIsOpaqueCredentialRef({ kind: "opaque_credential_ref", vaultRef: "vault:1" })).toBe(true);
    expect(pinnedIsOpaqueCredentialRef({ vaultRef: "vault:1" })).toBe(false);
    expect(pinnedIsOpaqueCredentialRef(null)).toBe(false);
  });

  it("ui law: environment kinds, tone law, outcome chips, token version", () => {
    expect([...PINNED_ENVIRONMENT_KINDS]).toEqual(["test", "live"]);
    expect(PINNED_TEST_MARK_IS_INVERTED_STONE).toBe(true);
    expect([...PINNED_STATUS_TONES]).toEqual([
      "ok",
      "attention",
      "unknown",
      "blocked",
      "disabled",
      "failed",
    ]);
    expect(PINNED_UNKNOWN_TONE).toBe("unknown");
    expect([...PINNED_DANGER_TONES]).toEqual(["blocked", "failed"]);
    for (const tone of PINNED_DANGER_TONES) {
      expect(PINNED_STATUS_TONES).toContain(tone);
    }
    expect([...PINNED_OUTCOME_CHIP_STATES]).toEqual([
      "succeeded",
      "processing",
      "failed",
      "refunded",
      "partially_refunded",
      "disputed",
      "blocked",
      "dropped",
    ]);
    expect(PINNED_DESIGN_TOKEN_VERSION).toBe("1.1.0");
  });

  it("command law: fail-closed session reasons + the protocol-correlation vocabulary", () => {
    expect([...PINNED_SESSION_LOOKUP_REASONS]).toEqual([
      "UNKNOWN_TOKEN",
      "REVOKED",
      "EXPIRED",
      "STALE_SECURITY_EPOCH",
    ]);
    expect(PINNED_SESSION_LOOKUP_REASONS).toHaveLength(4);
  });

  it("every pinned vocabulary is frozen, non-empty and duplicate-free (the closed-vocabulary discipline)", () => {
    const vocabularies = [
      PINNED_OUTCOME_ACTION_IDS,
      PINNED_UNIVERSAL_AREA_IDS,
      PINNED_STAGE_STATUSES,
      PINNED_AUTHORIZATION_CHANGE_KINDS,
      PINNED_QUOTE_FRESHNESS_STATUSES,
      PINNED_ADVISORY_SEVERITIES,
      PINNED_ADVISORY_ACTIONS,
      PINNED_ADVISORY_STATUSES,
      PINNED_FORBIDDEN_SECRET_KEY_SUBSTRINGS,
      PINNED_FORBIDDEN_SECRET_KEY_EXACT,
      PINNED_REDACTED_MARKER_KINDS,
      PINNED_RECHECK_DRIFT_REASONS,
      PINNED_ELIGIBILITY_OBSERVATIONS,
      PINNED_AUTHORIZATION_STATUSES,
      PINNED_CAPABILITY_STATES,
      PINNED_ENVIRONMENT_KINDS,
      PINNED_STATUS_TONES,
      PINNED_DANGER_TONES,
      PINNED_OUTCOME_CHIP_STATES,
      PINNED_SESSION_LOOKUP_REASONS,
    ];
    for (const vocabulary of vocabularies) {
      expect(vocabulary.length).toBeGreaterThan(0);
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(new Set(vocabulary).size).toBe(vocabulary.length);
    }
  });
});
