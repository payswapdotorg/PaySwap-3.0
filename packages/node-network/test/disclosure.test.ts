import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_FIELDS,
  buildLegDisclosureEnvelope,
  isDisclosureRefusal,
} from "../src/index.ts";
import { DisclosureError } from "../src/index.ts";

const FULL_FACTS: Record<string, string> = {
  SENDER_IDENTITY: "principal:alice",
  BENEFICIARY_IDENTITY: "principal:bob",
  AMOUNT_AND_CURRENCY: "GHS 1000.00",
  PURPOSE_CLASS: "GENUINE_COMMERCE",
  PURPOSE_EVIDENCE_REF: "evidence:invoice-42",
  SOURCE_OF_FUNDS: "sow: salary account",
  KYC_DOCUMENT_REFS: "kyc:doc-1;kyc:doc-2",
  BENEFICIARY_BANK_DETAILS: "bank:ke-1234",
  ROUTE_CONTEXT_REF: "route:ctx-9",
  LEG_REFERENCE: "leg:0",
};

describe("per-leg least disclosure (ADR-0020 D9 — minimization, not anonymity)", () => {
  it("an execution-only leg receives ONLY its execution fields (raw passthrough is structurally excluded)", () => {
    const result = buildLegDisclosureEnvelope({
      legIndex: 0,
      disclosedTo: "provider:stripe",
      obligations: [
        { field: "AMOUNT_AND_CURRENCY", obligation: "EXECUTION_REQUIRED" },
        { field: "BENEFICIARY_IDENTITY", obligation: "EXECUTION_REQUIRED" },
      ],
      availableFacts: FULL_FACTS,
    });
    expect(isDisclosureRefusal(result)).toBe(false);
    if (!isDisclosureRefusal(result)) {
      expect(Object.keys(result.fields).sort()).toEqual(["AMOUNT_AND_CURRENCY", "BENEFICIARY_IDENTITY"]);
      // the sender identity, KYC docs, bank details etc. are NOT in the envelope
      expect(result.fields["SENDER_IDENTITY"]).toBeUndefined();
      expect(result.fields["KYC_DOCUMENT_REFS"]).toBeUndefined();
      expect(result.disclosedTo).toBe("provider:stripe");
    }
  });

  it("an AML-obligated leg receives its obligated AML fields (minimization is not concealment)", () => {
    const result = buildLegDisclosureEnvelope({
      legIndex: 1,
      disclosedTo: "node:regulated-pi-1",
      obligations: [
        { field: "AMOUNT_AND_CURRENCY", obligation: "EXECUTION_REQUIRED" },
        { field: "SENDER_IDENTITY", obligation: "AML_LEGAL_OBLIGATION" },
        { field: "SOURCE_OF_FUNDS", obligation: "AML_LEGAL_OBLIGATION" },
        { field: "PURPOSE_CLASS", obligation: "AML_LEGAL_OBLIGATION" },
      ],
      availableFacts: FULL_FACTS,
    });
    expect(isDisclosureRefusal(result)).toBe(false);
    if (!isDisclosureRefusal(result)) {
      expect(result.fields["SENDER_IDENTITY"]).toBe("principal:alice");
      expect(result.fields["SOURCE_OF_FUNDS"]).toBe("sow: salary account");
    }
  });

  it("CONCEALING an obligated field is a TYPED REFUSAL (D2/D9) — never a silent envelope", () => {
    const result = buildLegDisclosureEnvelope({
      legIndex: 1,
      disclosedTo: "node:regulated-pi-1",
      obligations: [
        { field: "AMOUNT_AND_CURRENCY", obligation: "EXECUTION_REQUIRED" },
        { field: "SOURCE_OF_FUNDS", obligation: "AML_LEGAL_OBLIGATION" },
      ],
      availableFacts: FULL_FACTS,
      withheldFields: ["SOURCE_OF_FUNDS"],
    });
    expect(isDisclosureRefusal(result)).toBe(true);
    if (isDisclosureRefusal(result)) {
      expect(result.code).toBe("DISCLOSURE_OBLIGATION_UNMET");
      expect(result.missingObligations.map((obligation) => obligation.field)).toEqual([
        "SOURCE_OF_FUNDS",
      ]);
      expect(result.message).toContain("typed refusal");
    }
  });

  it("a MISSING obligated fact (not just withheld) is the same typed refusal", () => {
    const result = buildLegDisclosureEnvelope({
      legIndex: 0,
      disclosedTo: "provider:paystack",
      obligations: [{ field: "BENEFICIARY_BANK_DETAILS", obligation: "EXECUTION_REQUIRED" }],
      availableFacts: { AMOUNT_AND_CURRENCY: "KES 500" },
    });
    expect(isDisclosureRefusal(result)).toBe(true);
  });

  it("a field outside the closed vocabulary is refused (the vocabulary is closed)", () => {
    expect(() =>
      buildLegDisclosureEnvelope({
        legIndex: 0,
        disclosedTo: "provider:x",
        obligations: [{ field: "EVERYTHING_RAW", obligation: "EXECUTION_REQUIRED" }],
        availableFacts: FULL_FACTS,
      }),
    ).toThrow(DisclosureError);
    expect([...DISCLOSURE_FIELDS]).toHaveLength(10);
  });

  it("an obligation-less leg is refused (a leg receives fields BECAUSE it is obligated)", () => {
    expect(() =>
      buildLegDisclosureEnvelope({
        legIndex: 0,
        disclosedTo: "provider:x",
        obligations: [],
        availableFacts: FULL_FACTS,
      }),
    ).toThrow(/non-empty array/);
  });
});
