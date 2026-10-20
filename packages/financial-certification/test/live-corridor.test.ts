import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_LIVE_EVIDENCE_KINDS,
  HERMETIC_EVIDENCE_KIND,
  LIVE_CORRIDOR_LIMITATION,
  LiveCorridorClaimError,
  assertNoLiveClaims,
  isForbiddenLiveEvidenceKind,
  liveCorridorLimitation,
} from "../src/index.ts";

/**
 * FIN-LAW-09 — no live-corridor claim (hard law 9): the suite is
 * deterministic/hermetic by law; live-corridor certification is
 * credential-gated (GAP-02 class) and recorded as an EXPLICIT LIMITATION
 * — never simulated, no fake success, no mock-as-live, no synthetic
 * provider balance.
 */
describe("FIN-LAW-09: no live-corridor claim (the GAP-02 limitation)", () => {
  it("the limitation is a frozen, first-class fact (enabled is the literal false)", () => {
    expect(Object.isFrozen(LIVE_CORRIDOR_LIMITATION)).toBe(true);
    expect(LIVE_CORRIDOR_LIMITATION.enabled).toBe(false);
    expect(LIVE_CORRIDOR_LIMITATION.limitationClass).toBe("GAP-02");
    expect(LIVE_CORRIDOR_LIMITATION.statement).toContain("credential-gated");
    expect(liveCorridorLimitation()).toBe(LIVE_CORRIDOR_LIMITATION);
  });

  it("every forbidden live-claiming kind is detected (exact + marker scan)", () => {
    expect(FORBIDDEN_LIVE_EVIDENCE_KINDS).toEqual([
      "LIVE_PROVIDER_EXECUTION",
      "LIVE_CORRIDOR_RUN",
      "MOCK_AS_LIVE",
      "SYNTHETIC_PROVIDER_BALANCE",
    ]);
    for (const kind of FORBIDDEN_LIVE_EVIDENCE_KINDS) {
      expect(isForbiddenLiveEvidenceKind(kind), kind).toBe(true);
    }
    // Marker scan: any LIVE_-prefixed or MOCK_AS_LIVE-containing kind.
    expect(isForbiddenLiveEvidenceKind("LIVE_SOMETHING_ELSE")).toBe(true);
    expect(isForbiddenLiveEvidenceKind("CLAIMS_MOCK_AS_LIVE")).toBe(true);
    // The honest hermetic marker is admissible.
    expect(isForbiddenLiveEvidenceKind(HERMETIC_EVIDENCE_KIND)).toBe(false);
    expect(isForbiddenLiveEvidenceKind("SYNTHETIC_CONTRACT_LEVEL")).toBe(false);
  });

  it("assertNoLiveClaims REJECTS live-claiming evidence with the honest remediation", () => {
    expect(() =>
      assertNoLiveClaims([{ kind: "LIVE_PROVIDER_EXECUTION" }], "corridor:test"),
    ).toThrow(LiveCorridorClaimError);
    expect(() =>
      assertNoLiveClaims([{ kind: "SYNTHETIC_PROVIDER_BALANCE" }], "corridor:test"),
    ).toThrow(/SYNTHETIC_PROVIDER_BALANCE/);
    let message = "";
    try {
      assertNoLiveClaims([{ kind: "LIVE_CORRIDOR_RUN" }], "corridor:test");
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("resubmit as SYNTHETIC_CONTRACT_LEVEL");
    // The honest marker passes.
    expect(() =>
      assertNoLiveClaims([{ kind: HERMETIC_EVIDENCE_KIND }], "corridor:test"),
    ).not.toThrow();
  });

  it("evidence entries without a kind are inadmissible (fail closed)", () => {
    expect(() =>
      assertNoLiveClaims([{} as { kind: string }], "corridor:test"),
    ).toThrow(/without a kind/);
    expect(() => assertNoLiveClaims([], "corridor:test")).not.toThrow();
  });
});
