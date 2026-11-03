/**
 * PaySwap Desktop (P27-E, the P27-C lane report §7 — THE COMPOSITION SEAM
 * BATTERY) — the PAYSTACK AFRICA CORRIDOR COMPOSITION: the K3/K4 evidence
 * landing record (the registry ships EMPTY; the honest station record), the
 * harness naming map (the run card §D ↔ the c1 harness, 1:1) and the
 * corridor's KES arrival seam (the evidence gate + the REAL merchant
 * association).
 *
 * HERMETIC: zero network, zero credentials. The REAL provider-runtime
 * recipient-facts machinery (the registry + the fail-closed lookup) and the
 * REAL merchant association (defineCorridorKesPaystackRecipientReceiving —
 * its own validation is THE enforcement) are composed — never parallel
 * kernels. The one fixture observation is clearly a fixture (D11 — never
 * promoted to the shipped registry).
 */

import { describe, expect, it } from "vitest";
import {
  composePaystackAfricaCorridorSeam,
  KE_KES_CORRIDOR_CONDITION,
  PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD,
  PAYSTACK_HARNESS_ENV_NAMING_MAP,
} from "../../src/host/payswap/connections/paystack-africa-composition.js";
import {
  PAYSTACK_RECIPIENT_FACTS_STATION_RECORD,
  PAYSTACK_RECIPIENT_TYPE_EVIDENCE,
} from "../../../provider-runtime/src/adapters/paystack/recipient-facts.js";
import { PAYSTACK_OPERATION_ENDPOINTS } from "../../../provider-runtime/src/adapters/paystack/https-transport.js";
import { PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES } from "../../../merchant/src/kes-receiving.js";
import type { PaystackRecipientTypeEvidence } from "../../../provider-runtime/src/adapters/paystack/recipient-facts.js";

/* ---------------- the fixtures (clearly fixtures — D11) ---------------- */

const RECORDED_AT = 1_769_500_000_000n;

/** A VERIFIED (mobile_money, KE, KES) observation — a FIXTURE for the seam's positive control, never promoted to the shipped registry. */
const FIXTURE_KE_KES_OBSERVATION: PaystackRecipientTypeEvidence = Object.freeze({
  recipientType: "mobile_money",
  country: "KE",
  currency: "KES",
  status: "VERIFIED_AVAILABLE",
  sourceUrl: "https://docs.paystack.com/transfer-recipient",
  retrievedAt: "2026-11-03",
  evidenceTier: "LIVE_PROVIDER_DOC",
  requiredFields: ["name", "account_number", "bank_code"],
});

/** The corridor KES arrival inputs (the merchant-side receiving entry). */
function arrivalInput(recipientCode = "RCP_FIXTURE_1") {
  return {
    destinationId: "destination:kes:beneficiary-001",
    bankInstrumentRef: "bank:kes:acct-****3391",
    paystackRecipient: {
      recipientCode,
      recipientType: "mobile_money" as const,
      evidence: {
        recipientType: "mobile_money" as const,
        country: "KE" as const,
        currency: "KES" as const,
        status: "VERIFIED_AVAILABLE" as const,
        sourceUrl: "https://docs.paystack.com/transfer-recipient",
        retrievedAt: "2026-11-03",
      },
    },
    provenance: {
      source: "merchant-onboarding",
      reference: "ref:kes-bank-details-001",
      recordedAt: RECORDED_AT,
    },
    conversionChain: ["cap.corridor.stellar-usdc-holding", "cap.corridor.kes-payout"],
  };
}

/* -------- the K3/K4 evidence landing record (§7.2) -------- */

describe("the K3/K4 evidence landing record (the registry ships EMPTY)", () => {
  it("the shipped registry is EMPTY and the station record is the REAL typed record", () => {
    expect(PAYSTACK_RECIPIENT_TYPE_EVIDENCE).toEqual([]);
    expect(PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD.registryShips).toBe("EMPTY");
    expect(PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD.stationConclusion).toBe("UNVERIFIED_AT_STATION");
    expect(PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD.stationAttemptedAt).toBe(
      PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attemptedAt,
    );
    expect(PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD.attemptCount).toBe(
      PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attempts.length,
    );
    // the honest attempt trail: every recorded attempt is a typed failure, never a silent pass
    for (const attempt of PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attempts) {
      expect(attempt.outcome).toMatch(/NXDOMAIN|CHALLENGE|TIMEOUT|RATE_LIMITED|401/);
    }
  });

  it("the landing law is typed: nothing unverified is ever encoded (the candidates stay names)", () => {
    expect(PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD.landingLaw).toContain("PAYSTACK_RECIPIENT_TYPE_UNVERIFIED");
    expect(PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD.candidatesClaimedNeverEncoded).toContain("NAMES ONLY");
    expect(PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES).toContain("kepss");
    expect(PINNED_PAYSTACK_KES_RECIPIENT_TYPE_CANDIDATES).toContain("mobile_money");
  });

  it("the C1 endpoint rows are landed in the canonical endpoint map (the §7.1 mirror's source)", () => {
    const operationIds = [...PAYSTACK_OPERATION_ENDPOINTS.keys()];
    for (const expected of [
      "paystack.transfer_recipient.create",
      "paystack.transfer_recipient.list",
      "paystack.transaction.initialize",
      "paystack.transaction.verify",
      "paystack.page.create",
    ]) {
      expect(operationIds).toContain(expected);
    }
  });
});

/* -------- the harness naming map (§7.4) -------- */

describe("the harness naming map (the run card §D ↔ the c1 harness, 1:1)", () => {
  it("records both names and the 1:1 sourcing convention", () => {
    expect(PAYSTACK_HARNESS_ENV_NAMING_MAP.runCardConvention).toBe("PAYSTACK_SECRET_KEY_<BUSINESS>");
    expect(PAYSTACK_HARNESS_ENV_NAMING_MAP.harnessPrimary).toBe("PAYSTACK_SECRET_KEY");
    expect(PAYSTACK_HARNESS_ENV_NAMING_MAP.mapping).toContain("maps 1:1");
  });
});

/* -------- the corridor KES arrival seam (§7.5) -------- */

describe("the corridor KES arrival seam (the evidence gate + the REAL association)", () => {
  it("the shipped EMPTY registry answers the typed CONDITIONAL refusal — never a route", async () => {
    const seam = composePaystackAfricaCorridorSeam();
    expect(seam.evidenceRegistry).toEqual([]);
    const arrival = await seam.kesArrival(arrivalInput());
    expect(arrival.ok).toBe(false);
    if (!arrival.ok) {
      expect(arrival.refusal.kind).toBe("KE_KES_OBSERVATION_UNVERIFIED");
      expect(arrival.refusal.detail).toContain("registry ships EMPTY");
    }
    expect(KE_KES_CORRIDOR_CONDITION.status).toBe("OBSERVATION_UNVERIFIED");
  });

  it("a VERIFIED observation in the injected registry composes the REAL receiving context", async () => {
    const seam = composePaystackAfricaCorridorSeam({
      evidenceRegistry: [FIXTURE_KE_KES_OBSERVATION],
    });
    const arrival = await seam.kesArrival(arrivalInput());
    expect(arrival.ok).toBe(true);
    if (arrival.ok) {
      expect(arrival.context.paystackRecipient.recipientCode).toBe("RCP_FIXTURE_1");
      expect(arrival.context.paystackRecipient.recipientType).toBe("mobile_money");
    }
  });

  it("the merchant module's own validation is THE enforcement: a malformed association refuses typed", async () => {
    const seam = composePaystackAfricaCorridorSeam({
      evidenceRegistry: [FIXTURE_KE_KES_OBSERVATION],
    });
    const malformed = arrivalInput("");
    const arrival = await seam.kesArrival(malformed);
    expect(arrival.ok).toBe(false);
    if (!arrival.ok) {
      expect(arrival.refusal.kind).toBe("ASSOCIATION_REFUSED");
    }
  });

  it("an observation for a DIFFERENT type does not admit the arrival (the triple must match exactly)", async () => {
    const otherTypeObservation: PaystackRecipientTypeEvidence = Object.freeze({
      ...FIXTURE_KE_KES_OBSERVATION,
      recipientType: "kepss",
    });
    const seam = composePaystackAfricaCorridorSeam({
      evidenceRegistry: [otherTypeObservation],
    });
    const arrival = await seam.kesArrival(arrivalInput());
    expect(arrival.ok).toBe(false);
    if (!arrival.ok) {
      expect(arrival.refusal.kind).toBe("KE_KES_OBSERVATION_UNVERIFIED");
    }
  });
});
