import { describe, expect, it } from "vitest";
import { certifyLegSeparation } from "../src/index.ts";
import type { CertifiedLegObservation } from "../src/index.ts";
import { conformingLegs } from "./fixtures.ts";

/**
 * FIN-LAW-03 — funding/payout separation (hard law 3): the two legs are
 * separately authorized, separately observed, separately reconciled —
 * no fused leg, no cross-leg shortcut, no hidden custody.
 */
describe("FIN-LAW-03: funding/payout separation", () => {
  it("the conforming leg pair passes (same mandate, DIFFERENT grants is legal)", () => {
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      ...conformingLegs(),
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("a FUSED leg (both slots share one leg id) violates the law", () => {
    const { funding } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding,
      payout: { ...funding, legKind: "PAYOUT" },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("fused leg");
  });

  it("FUSED AUTHORIZATION (the same grant authorizes both legs) violates the law", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding,
      payout: {
        ...payout,
        authorizationLineage: { ...funding.authorizationLineage },
      },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("fused authorization");
  });

  it("an UNOBSERVED leg (no observation evidence) violates the law", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding: { ...funding, observationEvidenceRefs: [] },
      payout,
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("funding leg carries NO observation");
  });

  it("a CROSS-LEG SHORTCUT (payout observed only via funding evidence) violates the law", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding,
      payout: {
        ...payout,
        observationEvidenceRefs: [...funding.observationEvidenceRefs],
      },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("cross-leg shortcut");
  });

  it("an UNRECONCILED leg violates the law", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding,
      payout: { ...payout, reconciliationRef: "" },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("payout leg references NO reconciliation");
  });

  it("SHARED RECONCILIATION (one record for both legs) violates the law", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding,
      payout: { ...payout, reconciliationRef: funding.reconciliationRef },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("separately reconciled");
  });

  it("HIDDEN CUSTODY (a non-external payout destination) violates the law", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding,
      payout: {
        ...payout,
        custody: { party: "PROVIDER", externalDestination: false },
      },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("hidden custody");
  });

  it("slot/kind pairing mismatches are reported (no fused kind exists)", () => {
    const { funding, payout } = conformingLegs();
    const verdict = certifyLegSeparation({
      subjectRef: "corridor:test",
      funding: { ...payout },
      payout: { ...funding },
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("pairing");
  });

  it("malformed legs fail closed", () => {
    const { payout } = conformingLegs();
    const broken: CertifiedLegObservation = {
      ...payout,
      authorizationLineage: {
        mandateRef: "",
        grantRef: "g",
        issuedAtEpoch: 0n,
      },
    };
    expect(() =>
      certifyLegSeparation({
        subjectRef: "corridor:test",
        funding: broken,
        payout,
        evidenceRefs: [],
      }),
    ).toThrow(/authorization lineage/);
  });
});
