import { describe, expect, it } from "vitest";
import { GuaranteeLanguageError, ValidationError } from "../src/index.ts";
import {
  CONSENT_KIND,
  CONSENT_LEDGER_OPERATIONS,
  CONSENT_STATES,
  ConsentLedger,
  DisclosureConsentError,
  consentIsValid,
  validateConsentScope,
  validateDisclosureConsent,
} from "../src/consent.ts";
import type { DisclosureConsentRecord, DisclosureScope } from "../src/consent.ts";
import { NOW } from "./fixtures-catalog.ts";

/**
 * Minimum-disclosure consent (P16-C, gap-matrix row C6): the unknown-typed
 * fail-closed validator, the append-only ledger with the ES-private closed
 * operation set, BOTH error paths (the typed GuaranteeLanguageError from
 * validateConsentScope; the aggregated DisclosureConsentError from grant),
 * REVOKED records, and the caller-side consentIsValid liveness gate.
 */
describe("minimum-disclosure consent", () => {
  const validScope = (): DisclosureScope => ({
    fields: ["opportunity_id", "family"],
    purpose: "opportunity match disclosure for the waiting mission",
  });
  const grantedRecord = (): DisclosureConsentRecord => ({
    consentKind: CONSENT_KIND,
    consentId: "consent:participant:1:0",
    subject: "participant:1",
    scope: validScope(),
    state: "GRANTED",
    recordedAt: NOW,
  });

  it("validateDisclosureConsent accepts a valid GRANTED record and returns a NEW frozen record", () => {
    const source = grantedRecord();
    const validated = validateDisclosureConsent(source);
    expect(validated).toEqual(source);
    expect(validated).not.toBe(source);
    expect(validated.scope).not.toBe(source.scope);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.scope)).toBe(true);
    expect([...CONSENT_STATES]).toEqual(["GRANTED", "REVOKED"]);
  });

  it("validateDisclosureConsent fails closed on malformed records (aggregated errors)", () => {
    expect(() => validateDisclosureConsent(null)).toThrow(DisclosureConsentError);
    try {
      validateDisclosureConsent({});
      expect.unreachable("a malformed consent record must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(DisclosureConsentError);
      expect((error as DisclosureConsentError).errors?.length).toBeGreaterThanOrEqual(5);
    }
    // A REVOKED record REQUIRES revokedAt; a GRANTED record must not carry it.
    expect(() => validateDisclosureConsent({ ...grantedRecord(), state: "REVOKED" })).toThrow(/revokedAt/);
    expect(() =>
      validateDisclosureConsent({ ...grantedRecord(), state: "REVOKED", revokedAt: NOW + 1 }),
    ).not.toThrow();
    expect(() =>
      validateDisclosureConsent({ ...grantedRecord(), revokedAt: NOW + 1 }),
    ).toThrow(/must not carry revokedAt/);
    expect(() =>
      validateDisclosureConsent({ ...grantedRecord(), state: "REVOKED", revokedAt: NOW - 1 }),
    ).toThrow(/may not precede recordedAt/);
    expect(() => validateDisclosureConsent({ ...grantedRecord(), state: "MAYBE" })).toThrow(/state/);
  });

  it("validateConsentScope aggregates structural violations (every failed field listed)", () => {
    try {
      validateConsentScope({ fields: [], purpose: "" });
      expect.unreachable("a malformed scope must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(DisclosureConsentError);
      expect((error as DisclosureConsentError).errors).toHaveLength(2);
    }
    expect(() =>
      validateConsentScope({ fields: ["a", "a"], purpose: "p" }),
    ).toThrow(/unique/);
    expect(() => validateConsentScope({ fields: ["a", ""], purpose: "p" })).toThrow(/non-empty strings/);
    expect(() => validateConsentScope(null)).toThrow(DisclosureConsentError);
    const scope = validateConsentScope(validScope());
    expect(scope.fields).toEqual(["opportunity_id", "family"]);
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it("validateConsentScope throws the TYPED GuaranteeLanguageError directly on guaranteed-return language", () => {
    expect(() =>
      validateConsentScope({ fields: ["family"], purpose: "guaranteed returns on every disclosed opportunity" }),
    ).toThrow(GuaranteeLanguageError);
    expect(() =>
      validateConsentScope({ fields: ["family"], purpose: "a risk-free disclosure purpose" }),
    ).toThrow(GuaranteeLanguageError);
    try {
      validateConsentScope({ fields: ["family"], purpose: "assured outcomes" });
      expect.unreachable("guarantee language must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(GuaranteeLanguageError);
      expect(error).toBeInstanceOf(ValidationError);
    }
  });

  it("the ledger's grant aggregates scope errors INCLUDING guarantee-language into DisclosureConsentError", () => {
    const ledger = new ConsentLedger();
    expect(() =>
      ledger.grant("participant:1", { fields: [], purpose: "guaranteed returns" }, NOW),
    ).toThrow(DisclosureConsentError);
    try {
      ledger.grant("participant:1", { fields: [], purpose: "guaranteed returns" }, NOW);
      expect.unreachable("the aggregate path must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(DisclosureConsentError);
      expect((error as DisclosureConsentError).errors?.length).toBeGreaterThanOrEqual(2);
      expect((error as DisclosureConsentError).message).toMatch(/guaranteed/);
      expect((error as DisclosureConsentError).message).toMatch(/no-guaranteed-returns/);
    }
  });

  it("the ledger grants and appends deterministically (one live grant per subject; input validation)", () => {
    const ledger = new ConsentLedger();
    const record = ledger.grant("participant:1", validScope(), NOW);
    expect(record.state).toBe("GRANTED");
    expect(record.consentId).toBe("consent:participant:1:0");
    expect(record.recordedAt).toBe(NOW);
    expect(record.revokedAt).toBeUndefined();
    expect(Object.isFrozen(record)).toBe(true);
    expect(ledger.records()).toHaveLength(1);
    expect(() => ledger.grant("participant:1", validScope(), NOW + 1)).toThrow(/live GRANTED/);
    expect(() => ledger.grant("", validScope(), NOW)).toThrow(DisclosureConsentError);
    expect(() => ledger.grant("participant:2", validScope(), -1)).toThrow(RangeError);
    expect(() => ledger.grant("participant:2", validScope(), 0.5)).toThrow(RangeError);
  });

  it("revoke appends the REVOKED record (state, revokedAt, causal law, fail-closed negatives)", () => {
    const ledger = new ConsentLedger();
    ledger.grant("participant:1", validScope(), NOW);
    const revoked = ledger.revoke("participant:1", NOW + 1_000);
    expect(revoked.state).toBe("REVOKED");
    expect(revoked.revokedAt).toBe(NOW + 1_000);
    expect(revoked.recordedAt).toBe(NOW + 1_000);
    expect(revoked.scope).toEqual(validScope());
    expect(ledger.records()).toHaveLength(2);
    expect(() => ledger.revoke("participant:1", NOW + 2_000)).toThrow(/already REVOKED/);
    expect(() => ledger.revoke("participant:unknown", NOW)).toThrow(/no GRANTED/);
    const late = new ConsentLedger();
    late.grant("participant:1", validScope(), NOW + 5_000);
    expect(() => late.revoke("participant:1", NOW)).toThrow(/may not precede the grant/);
    expect(() => ledger.revoke("", NOW)).toThrow(DisclosureConsentError);
    expect(() => ledger.revoke("participant:1", -1)).toThrow(RangeError);
  });

  it("the structural census: the ConsentLedger prototype is EXACTLY the frozen closed operation set", () => {
    expect(Object.getOwnPropertyNames(ConsentLedger.prototype).sort()).toEqual(
      [...CONSENT_LEDGER_OPERATIONS].sort(),
    );
    expect([...CONSENT_LEDGER_OPERATIONS].sort()).toEqual([
      "constructor",
      "grant",
      "records",
      "revoke",
      "snapshot",
    ]);
    expect(Object.isFrozen(CONSENT_LEDGER_OPERATIONS)).toBe(true);
    expect(Object.isFrozen(CONSENT_STATES)).toBe(true);
  });

  it("the typed read path: snapshot() delegates through validateDisclosureConsent", () => {
    const ledger = new ConsentLedger();
    const granted = ledger.grant("participant:1", validScope(), NOW);
    const snapshot = ledger.snapshot("participant:1");
    expect(snapshot.subject).toBe("participant:1");
    expect(snapshot.granted).toEqual(granted);
    expect(snapshot.granted).not.toBe(granted);
    expect(snapshot.revocation).toBeNull();
    expect(() => ledger.snapshot("")).toThrow(DisclosureConsentError);
    const untouched = ledger.snapshot("participant:2");
    expect(untouched.granted).toBeNull();
    expect(untouched.revocation).toBeNull();
  });

  it("consentIsValid: the caller-side liveness gate (stale pre-revocation snapshots return false — never throws)", () => {
    const ledger = new ConsentLedger();
    ledger.grant("participant:1", validScope(), NOW);
    const live = ledger.snapshot("participant:1");
    expect(consentIsValid(live)).toBe(true);
    ledger.revoke("participant:1", NOW + 1_000);
    // The ledger's current view AFTER the revocation carries BOTH the
    // pre-revocation GRANT and the REVOKED record: not live, NO throw.
    const stale = ledger.snapshot("participant:1");
    expect(stale.granted?.state).toBe("GRANTED");
    expect(stale.revocation?.state).toBe("REVOKED");
    expect(consentIsValid(stale)).toBe(false);
    expect(consentIsValid(ledger.snapshot("participant:2"))).toBe(false);
    expect(consentIsValid(null)).toBe(false);
    expect(consentIsValid(42)).toBe(false);
    expect(consentIsValid({})).toBe(false);
    expect(consentIsValid({ subject: "participant:1", granted: null, revocation: null })).toBe(false);
    expect(consentIsValid({ subject: "participant:1", granted: "garbage", revocation: null })).toBe(false);
    expect(consentIsValid({ subject: "", granted: grantedRecord(), revocation: null })).toBe(false);
  });

  it("re-grant after revocation is legal (a fresh live consent)", () => {
    const ledger = new ConsentLedger();
    ledger.grant("participant:1", validScope(), NOW);
    ledger.revoke("participant:1", NOW + 1_000);
    const regranted = ledger.grant("participant:1", validScope(), NOW + 2_000);
    expect(regranted.state).toBe("GRANTED");
    expect(regranted.consentId).toBe("consent:participant:1:2");
    expect(ledger.records()).toHaveLength(3);
    expect(consentIsValid(ledger.snapshot("participant:1"))).toBe(true);
  });

  it("determinism: two ledgers fed identical sequences produce identical records", () => {
    const first = new ConsentLedger();
    const second = new ConsentLedger();
    for (const ledger of [first, second]) {
      ledger.grant("participant:1", validScope(), NOW);
      ledger.grant("participant:2", validScope(), NOW + 1);
      ledger.revoke("participant:1", NOW + 2);
    }
    expect(JSON.stringify(first.records())).toBe(JSON.stringify(second.records()));
    expect(JSON.stringify(first.snapshot("participant:1"))).toBe(JSON.stringify(second.snapshot("participant:1")));
  });
});
