import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.ts";
import {
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  PINNED_CORRIDOR_KES_RECEIVING_CURRENCY,
  PINNED_CORRIDOR_KES_RECEIVING_KIND,
  PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES,
  defineCorridorKesReceivingContext,
  defineCorridorKesPaystackRecipientReceiving,
} from "../src/kes-receiving.ts";
import { isExternalConversionRoute } from "../src/settlement-routes.ts";

/**
 * P22-C (ADR-0016 D5 + the frozen appendix): the CORRIDOR KES RECEIVING
 * CONTEXT — the merchant-side KES receiving entry the corridor's off-ramp
 * leg needs. The receiving destination is an EXTERNAL bank instrument
 * with provenance riding the EXTERNAL_PAYSWAP_CONVERSION settlement route
 * (the non-custody law: no field could hold a PaySwap custodial balance);
 * the pinned literals (BANK_INSTRUMENT / KES / the paystack_kes_bank_transfer
 * payout method) are the ADR-0016 appendix's off-ramp arrival, pinned
 * locally (the route-planning C-lane pins the same literals
 * independently).
 */

const RECORDED_AT = 1_769_500_000_000n;

function healthyInput() {
  return {
    destinationId: "destination:kes:beneficiary-001",
    bankInstrumentRef: "bank:kes:acct-****3391",
    provenance: {
      source: "merchant-onboarding",
      reference: "ref:kes-bank-details-001",
      recordedAt: RECORDED_AT,
    },
    conversionChain: ["cap.corridor.stellar-usdc-holding", "cap.corridor.kes-payout"],
  };
}

describe("the corridor KES receiving context (ADR-0016 D5 — the off-ramp arrival)", () => {
  it("constructs the KES bank receiving entry over the EXTERNAL conversion route (the non-custody law)", () => {
    const context = defineCorridorKesReceivingContext(healthyInput());
    expect(context.receivingKind).toBe("BANK_INSTRUMENT");
    expect(context.receivingCurrency).toBe("KES");
    expect(context.payoutMethod).toBe("paystack_kes_bank_transfer");
    expect(isExternalConversionRoute(context.route)).toBe(true);
    expect(context.route.destination).toEqual({
      id: "destination:kes:beneficiary-001",
      kind: "BANK_INSTRUMENT",
      currency: "KES",
      externalRef: "bank:kes:acct-****3391",
      provenance: {
        source: "merchant-onboarding",
        reference: "ref:kes-bank-details-001",
        recordedAt: RECORDED_AT,
      },
    });
    expect(context.route.conversionChain).toEqual([
      "cap.corridor.stellar-usdc-holding",
      "cap.corridor.kes-payout",
    ]);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("the pinned receiving literals are the ADR-0016 appendix's off-ramp arrival", () => {
    expect(PINNED_CORRIDOR_KES_RECEIVING_KIND).toBe("BANK_INSTRUMENT");
    expect(PINNED_CORRIDOR_KES_RECEIVING_CURRENCY).toBe("KES");
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe("paystack_kes_bank_transfer");
  });

  it("an empty destination id or bank instrument reference fails closed (never invented)", () => {
    expect(() =>
      defineCorridorKesReceivingContext({ ...healthyInput(), destinationId: "" }),
    ).toThrow(ValidationError);
    expect(() =>
      defineCorridorKesReceivingContext({ ...healthyInput(), bankInstrumentRef: "" }),
    ).toThrow(/non-empty bank instrument reference/);
  });

  it("missing or malformed provenance fails closed (never assumed)", () => {
    expect(() =>
      defineCorridorKesReceivingContext({
        ...healthyInput(),
        provenance: { source: "", reference: "ref:x", recordedAt: RECORDED_AT },
      }),
    ).toThrow(/provenance/);
    expect(() =>
      defineCorridorKesReceivingContext({
        ...healthyInput(),
        // A NUMBER where the law requires a bigint TimestampMs (the runtime
        // guard is tested through the cast — the type would otherwise refuse).
        provenance: { source: "s", reference: "r", recordedAt: 123 as unknown as bigint },
      }),
    ).toThrow(/provenance/);
    expect(() =>
      defineCorridorKesReceivingContext({
        ...healthyInput(),
        provenance: null as never,
      }),
    ).toThrow(/provenance/);
  });

  it("the conversion chain law rides the route constructor's own (non-empty, non-repeating)", () => {
    expect(() =>
      defineCorridorKesReceivingContext({ ...healthyInput(), conversionChain: [] }),
    ).toThrow(/non-empty conversion capability chain/);
    expect(() =>
      defineCorridorKesReceivingContext({
        ...healthyInput(),
        conversionChain: ["cap.a", "cap.a"],
      }),
    ).toThrow(/must not repeat/);
  });
});

// ---------------------------------------------------------------------------
// (P27-C, ADR-0020 D10) the Paystack recipient association — the KES
// receiving slice riding the new recipient plane. The dated evidence
// observation below is a FIXTURE (test material only — never promoted to
// shipped constants, D11); at the 2026-11-03 station NO verified KES
// recipient fact exists (the Paystack docs were unreachable — the K3/K4
// record), so the association is unconstructible from shipped constants
// and every test constructs it from an explicit fixture observation.
// ---------------------------------------------------------------------------

describe("the Paystack recipient association (P27-C — the typed KES arrival)", () => {
  const FIXTURE_EVIDENCE = {
    recipientType: "kepss" as const,
    country: "KE" as const,
    currency: "KES" as const,
    status: "VERIFIED_AVAILABLE" as const,
    sourceUrl: "https://docs.paystack.com/transfers",
    retrievedAt: "2026-11-03",
  };

  function recipientInput() {
    return {
      destinationId: "destination:kes:beneficiary-001",
      bankInstrumentRef: "bank:kes:acct-****3391",
      paystackRecipient: {
        recipientCode: "RCP_fixture_p27c",
        recipientType: "kepss" as const,
        evidence: FIXTURE_EVIDENCE,
      },
      provenance: {
        source: "merchant-onboarding",
        reference: "ref:kes-bank-details-001",
        recordedAt: RECORDED_AT,
      },
      conversionChain: ["cap.corridor.stellar-usdc-holding", "cap.corridor.kes-payout"],
    };
  }

  it("carries the claimed KES candidate vocabulary (names only — never availability facts)", () => {
    expect(PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES).toEqual([
      "kepss",
      "mobile_money",
    ]);
  });

  it("constructs the associated receiving context over the same EXTERNAL conversion route", () => {
    const context = defineCorridorKesPaystackRecipientReceiving(recipientInput());
    expect(isExternalConversionRoute(context.route)).toBe(true);
    expect(context.receivingKind).toBe("BANK_INSTRUMENT");
    expect(context.receivingCurrency).toBe("KES");
    expect(context.payoutMethod).toBe("paystack_kes_bank_transfer");
    expect(context.paystackRecipient).toEqual({
      recipientCode: "RCP_fixture_p27c",
      recipientType: "kepss",
      evidence: FIXTURE_EVIDENCE,
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.paystackRecipient)).toBe(true);
  });

  it("refuses a recipient type outside the claimed KES candidate vocabulary", () => {
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: {
          recipientCode: "RCP_fixture_p27c",
          recipientType: "nuban" as never,
          evidence: FIXTURE_EVIDENCE,
        },
      }),
    ).toThrow(/kepss\/mobile_money/);
  });

  it("refuses evidence that widens the pinned Kenya/KES triple or is not VERIFIED_AVAILABLE", () => {
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: {
          recipientCode: "RCP_fixture_p27c",
          recipientType: "kepss",
          evidence: { ...FIXTURE_EVIDENCE, country: "GH" as never },
        },
      }),
    ).toThrow(/Kenya\/KES/);
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: {
          recipientCode: "RCP_fixture_p27c",
          recipientType: "kepss",
          evidence: { ...FIXTURE_EVIDENCE, status: "VERIFIED_EXCLUDED" as never },
        },
      }),
    ).toThrow(/VERIFIED_AVAILABLE/);
  });

  it("refuses undated or unsourced observations (the D10 law — a fixture-grade claim is not evidence)", () => {
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: {
          recipientCode: "RCP_fixture_p27c",
          recipientType: "kepss",
          evidence: { ...FIXTURE_EVIDENCE, retrievedAt: "2026-11-03T12:00:00Z" },
        },
      }),
    ).toThrow(/ISO retrieval date/);
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: {
          recipientCode: "RCP_fixture_p27c",
          recipientType: "kepss",
          evidence: { ...FIXTURE_EVIDENCE, sourceUrl: "ftp://not-https.example" },
        },
      }),
    ).toThrow(/source URL/);
  });

  it("refuses an empty recipient code or a missing association (fail-closed)", () => {
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: {
          recipientCode: "",
          recipientType: "kepss",
          evidence: FIXTURE_EVIDENCE,
        },
      }),
    ).toThrow(/recipient code/);
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        paystackRecipient: null as never,
      }),
    ).toThrow(/typed recipient association/);
  });

  it("the base route laws still apply (the existing constructor's refusals are unchanged)", () => {
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        conversionChain: [],
      }),
    ).toThrow(/non-empty conversion capability chain/);
    expect(() =>
      defineCorridorKesPaystackRecipientReceiving({
        ...recipientInput(),
        provenance: { source: "", reference: "r", recordedAt: RECORDED_AT },
      }),
    ).toThrow(/provenance/);
  });
});
