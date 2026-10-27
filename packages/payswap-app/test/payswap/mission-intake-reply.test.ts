/**
 * @payswap/app — the MISSION-INTAKE REPLY PARSER battery (P21-B, ADR-0014
 * D2; failing-first).
 *
 * The composer's conversation ask-loop turns the user's TEXT reply into
 * the typed intake value the channel's `paymentMissionCapture` accepts.
 * The parser law: STRICT, DETERMINISTIC, FAIL-CLOSED — an ambiguous or
 * malformed reply is REFUSED with the accepted format named, never
 * coerced, never guessed (the intake law: "never invented inputs").
 * Every accepted format maps 1:1 onto the host's own capture validators
 * (packages/desktop payments/intake-machine.ts) — the parser invents no
 * field semantics, only a strict surface grammar.
 */

import { describe, expect, it } from "vitest";

import {
  MISSION_INTAKE_REPLY_FORMATS,
  parseMissionIntakeReply,
} from "../../src/agent/missionIntakeReply.js";

describe("the strict reply grammar — amount (exact money, never coerced)", () => {
  it("accepts the canonical minor-unit integer forms in both orders", () => {
    expect(parseMissionIntakeReply("amountAndCurrency", "1250 USD")).toEqual({
      ok: true,
      value: { minorUnits: "1250", currency: "USD" },
    });
    expect(parseMissionIntakeReply("amountAndCurrency", "USD 1250")).toEqual({
      ok: true,
      value: { minorUnits: "1250", currency: "USD" },
    });
    expect(parseMissionIntakeReply("amountAndCurrency", "0 KES")).toEqual({
      ok: true,
      value: { minorUnits: "0", currency: "KES" },
    });
  });

  it("REFUSES a decimal amount — never coerced into minor units (the exponent is the currency's own law, never guessed here)", () => {
    const outcome = parseMissionIntakeReply("amountAndCurrency", "12.50 USD");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain("exact minor units");
      expect(outcome.message).toContain("1250");
    }
  });

  it("REFUSES prose amounts, wrong case and malformed currencies", () => {
    expect(parseMissionIntakeReply("amountAndCurrency", "twelve USD").ok).toBe(false);
    expect(parseMissionIntakeReply("amountAndCurrency", "1250 usd").ok).toBe(false);
    expect(parseMissionIntakeReply("amountAndCurrency", "1250 US").ok).toBe(false);
    expect(parseMissionIntakeReply("amountAndCurrency", "").ok).toBe(false);
    expect(parseMissionIntakeReply("amountAndCurrency", "-5 USD").ok).toBe(false);
    expect(parseMissionIntakeReply("amountAndCurrency", "1,250 USD").ok).toBe(false);
  });
});

describe("the strict reply grammar — the text fields", () => {
  it("fundingSource / recipient / purpose accept the raw non-empty reply", () => {
    for (const fieldId of ["fundingSource", "recipient", "purpose"] as const) {
      expect(parseMissionIntakeReply(fieldId, "the spring invoice")).toEqual({
        ok: true,
        value: "the spring invoice",
      });
    }
  });

  it("empty/whitespace text is refused for every field", () => {
    for (const fieldId of [
      "fundingSource", "recipient", "purpose",
      "amountAndCurrency", "countryCorridor", "speedDeadline",
      "feeCap", "privacyCompliance", "partialPaymentPreference",
    ] as const) {
      expect(parseMissionIntakeReply(fieldId, "   ").ok).toBe(false);
    }
  });
});

describe("the strict reply grammar — the corridor (all three parts, never defaulted)", () => {
  it("accepts source country, destination country and destination currency", () => {
    expect(parseMissionIntakeReply("countryCorridor", "US KE KES")).toEqual({
      ok: true,
      value: { sourceCountry: "US", destinationCountry: "KE", destinationCurrency: "KES" },
    });
  });

  it("refuses two-part answers and lowercase forms — the destination currency is never defaulted to the source", () => {
    expect(parseMissionIntakeReply("countryCorridor", "US KE").ok).toBe(false);
    expect(parseMissionIntakeReply("countryCorridor", "us ke kes").ok).toBe(false);
    expect(parseMissionIntakeReply("countryCorridor", "US KE ken").ok).toBe(false);
  });
});

describe("the strict reply grammar — the deadline (an ISO-8601 UTC instant)", () => {
  it("accepts the exact instant form", () => {
    expect(parseMissionIntakeReply("speedDeadline", "2026-10-27T12:00:00Z")).toEqual({
      ok: true,
      value: { deadlineAt: "2026-10-27T12:00:00Z" },
    });
  });

  it("refuses dates without time or offsets — never normalized, never guessed", () => {
    expect(parseMissionIntakeReply("speedDeadline", "2026-10-27").ok).toBe(false);
    expect(parseMissionIntakeReply("speedDeadline", "tomorrow").ok).toBe(false);
    expect(parseMissionIntakeReply("speedDeadline", "2026-10-27T12:00:00+02:00").ok).toBe(false);
  });
});

describe("the strict reply grammar — the fee cap (an explicit statement either way)", () => {
  it("accepts the explicit uncapped statement (case-insensitive word)", () => {
    expect(parseMissionIntakeReply("feeCap", "uncapped")).toEqual({
      ok: true,
      value: { kind: "UNCAPPED" },
    });
    expect(parseMissionIntakeReply("feeCap", "Uncapped").ok).toBe(true);
  });

  it("accepts the explicit capped amount (both orders)", () => {
    expect(parseMissionIntakeReply("feeCap", "capped 100 USD")).toEqual({
      ok: true,
      value: { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } },
    });
    expect(parseMissionIntakeReply("feeCap", "capped USD 100").ok).toBe(true);
  });

  it("refuses decimals and prose — the cap is exact money or an explicit uncapped", () => {
    expect(parseMissionIntakeReply("feeCap", "capped 1.50 USD").ok).toBe(false);
    expect(parseMissionIntakeReply("feeCap", "whatever").ok).toBe(false);
    expect(parseMissionIntakeReply("feeCap", "no cap").ok).toBe(false);
  });
});

describe("the strict reply grammar — privacy/compliance (explicit either way)", () => {
  it("'none' is the explicit NONE_STATED statement; anything else is the stated constraint", () => {
    expect(parseMissionIntakeReply("privacyCompliance", "none")).toEqual({
      ok: true,
      value: { kind: "NONE_STATED" },
    });
    expect(parseMissionIntakeReply("privacyCompliance", "None").ok).toBe(true);
    expect(parseMissionIntakeReply("privacyCompliance", "EU data must stay in region")).toEqual({
      ok: true,
      value: { kind: "CONSTRAINED", notes: "EU data must stay in region" },
    });
  });
});

describe("the strict reply grammar — the partial-payment preference (one of two words)", () => {
  it("accepts full / partial (case-insensitive)", () => {
    expect(parseMissionIntakeReply("partialPaymentPreference", "full")).toEqual({
      ok: true,
      value: { kind: "REQUIRE_FULL" },
    });
    expect(parseMissionIntakeReply("partialPaymentPreference", "Partial")).toEqual({
      ok: true,
      value: { kind: "ALLOW_PARTIAL" },
    });
  });

  it("refuses prose — the preference is explicit, never defaulted", () => {
    expect(parseMissionIntakeReply("partialPaymentPreference", "whatever works").ok).toBe(false);
  });
});

describe("the honest surface contract", () => {
  it("every field names its accepted format; the STRUCTURED fields refuse junk with a teachable message", () => {
    const structured = [
      "amountAndCurrency", "countryCorridor", "speedDeadline",
      "feeCap", "partialPaymentPreference",
    ] as const;
    for (const fieldId of structured) {
      const refusal = parseMissionIntakeReply(fieldId, "??");
      expect(refusal.ok, fieldId).toBe(false);
      if (!refusal.ok) {
        expect(refusal.message.length, fieldId).toBeGreaterThan(10);
      }
    }
    // The free-text fields accept any non-empty reply (their format hint still exists).
    for (const fieldId of ["fundingSource", "recipient", "purpose", "privacyCompliance"] as const) {
      expect(MISSION_INTAKE_REPLY_FORMATS[fieldId].length, fieldId).toBeGreaterThan(5);
      expect(parseMissionIntakeReply(fieldId, "in my own words").ok, fieldId).toBe(true);
    }
    for (const fieldId of structured) {
      expect(MISSION_INTAKE_REPLY_FORMATS[fieldId].length, fieldId).toBeGreaterThan(5);
    }
  });

  it("an unknown field id fails closed (never a passthrough)", () => {
    expect(parseMissionIntakeReply("notAField", "x").ok).toBe(false);
  });
});
