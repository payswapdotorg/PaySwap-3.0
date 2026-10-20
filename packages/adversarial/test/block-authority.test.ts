/**
 * The INV-21 block-authority law (P6-W3, lane r4-w3; NET-NEW — the
 * escalate-only composition, its type laws and the tested rejection
 * seams; the kernel's own no-downgrade suite pattern extended to the
 * immune plane).
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import {
  composeAdvisoryWithKernelDecision,
  GATE_DECISION_RANK,
  joinVerdicts,
  stricterGateDecision,
  verdictToGateGrade,
  attemptAdvisoryDowngrade,
  attemptBlockBypass,
  BlockDowngradeForbiddenError,
  BlockBypassForbiddenError,
  type GateDecision,
  type NoBlockDowngrade,
  type EscalationOnly,
} from "../src/index.ts";

const allowDecision: GateDecision = {
  decision: "ALLOW",
  checks: [{ dimension: "chain", outcome: "pass", code: "chain_permitted", detail: "fixture" }],
  evidenceRefs: ["obs:1"],
};
const unknownDecision: GateDecision = {
  decision: "UNKNOWN",
  dimensions: [{ dimension: "route", code: "route_unverified", message: "fixture" }],
  checks: [],
  evidenceRefs: [],
};
const blockDecision: GateDecision = {
  decision: "BLOCK",
  reasons: [
    { dimension: "asset", code: "asset_not_permitted", message: "fixture", invariantRefs: ["INV-21"] },
  ],
  checks: [],
  evidenceRefs: [],
};

describe("the INV-21 block-authority law (escalate-only)", () => {
  it("the gate-decision lattice ranks ALLOW < UNKNOWN < BLOCK and joins deterministically", () => {
    expect(GATE_DECISION_RANK).toEqual({ ALLOW: 0, UNKNOWN: 1, BLOCK: 2 });
    expect(stricterGateDecision("ALLOW", "BLOCK")).toBe("BLOCK");
    expect(stricterGateDecision("BLOCK", "ALLOW")).toBe("BLOCK");
    expect(stricterGateDecision("UNKNOWN", "ALLOW")).toBe("UNKNOWN");
    expect(stricterGateDecision("ALLOW", "ALLOW")).toBe("ALLOW");
    expect(joinVerdicts("ALLOW", "REQUIRE_CONFIRMATION")).toBe("REQUIRE_CONFIRMATION");
    expect(joinVerdicts("BLOCK", "ALLOW")).toBe("BLOCK");
    expect(joinVerdicts("ALLOW_WITH_CONSTRAINTS", "ALLOW_WITH_CONSTRAINTS")).toBe(
      "ALLOW_WITH_CONSTRAINTS",
    );
  });

  it("TYPE LAW: NoBlockDowngrade forbids leaving BLOCK and allows every other projection", () => {
    expectTypeOf<NoBlockDowngrade<"BLOCK", "BLOCK">>().toEqualTypeOf<"BLOCK">();
    expectTypeOf<
      NoBlockDowngrade<"BLOCK", "ALLOW">
    >().toEqualTypeOf<["CANNOT_DOWNGRADE_BLOCK", "BLOCK", "ALLOW"]>();
    expectTypeOf<
      NoBlockDowngrade<"BLOCK", "UNKNOWN">
    >().toEqualTypeOf<["CANNOT_DOWNGRADE_BLOCK", "BLOCK", "UNKNOWN"]>();
    expectTypeOf<NoBlockDowngrade<"ALLOW", "BLOCK">>().toEqualTypeOf<"BLOCK">();
    expectTypeOf<NoBlockDowngrade<"UNKNOWN", "ALLOW">>().toEqualTypeOf<"ALLOW">();
  });

  it("TYPE LAW: EscalationOnly allows equal-or-harder verdicts and rejects downgrades", () => {
    expectTypeOf<EscalationOnly<"ALLOW", "BLOCK">>().toEqualTypeOf<"BLOCK">();
    expectTypeOf<EscalationOnly<"BLOCK", "BLOCK">>().toEqualTypeOf<"BLOCK">();
    expectTypeOf<
      EscalationOnly<"REQUIRE_CONFIRMATION", "ALLOW_WITH_CONSTRAINTS">
    >().toEqualTypeOf<["CANNOT_DOWNGRADE_VERDICT", "REQUIRE_CONFIRMATION", "ALLOW_WITH_CONSTRAINTS"]>();
    expectTypeOf<
      EscalationOnly<"BLOCK", "ALLOW">
    >().toEqualTypeOf<["CANNOT_DOWNGRADE_VERDICT", "BLOCK", "ALLOW"]>();
    expectTypeOf<EscalationOnly<"ALLOW", "ALLOW_WITH_CONSTRAINTS">>().toEqualTypeOf<
      "ALLOW_WITH_CONSTRAINTS"
    >();
  });

  it("REJECTION: attemptAdvisoryDowngrade ALWAYS throws (the tested first-class seam)", () => {
    for (const attempted of ["ALLOW", "UNKNOWN", "BLOCK"] as const) {
      expect(() => attemptAdvisoryDowngrade(attempted, "agent:rogue")).toThrowError(
        BlockDowngradeForbiddenError,
      );
      try {
        attemptAdvisoryDowngrade(attempted, "agent:rogue");
      } catch (error) {
        expect(error).toBeInstanceOf(BlockDowngradeForbiddenError);
        expect((error as BlockDowngradeForbiddenError).attempted).toBe(attempted);
        expect((error as BlockDowngradeForbiddenError).message).toContain("INV-21");
      }
    }
  });

  it("REJECTION: attemptBlockBypass ALWAYS throws (a BLOCK is terminal)", () => {
    expect(() => attemptBlockBypass("agent:rogue")).toThrowError(BlockBypassForbiddenError);
    expect(() => attemptBlockBypass("advisory:adv-1")).toThrowError(/terminal/);
  });

  it("COMPOSITION: a kernel BLOCK is TERMINAL — the advisory layer only corroborates", () => {
    for (const advisoryVerdict of [
      "ALLOW",
      "ALLOW_WITH_CONSTRAINTS",
      "REQUIRE_CONFIRMATION",
      "BLOCK",
    ] as const) {
      const composed = composeAdvisoryWithKernelDecision({
        kernelDecision: blockDecision,
        advisoryVerdict,
      });
      expect(composed.decision).toBe("BLOCK");
      expect(composed.kernelDecision).toBe("BLOCK");
      expect(composed.basis.some((line) => line.includes("kernel:BLOCK:terminal"))).toBe(true);
    }
    const corroborated = composeAdvisoryWithKernelDecision({
      kernelDecision: blockDecision,
      advisoryVerdict: "BLOCK",
    });
    expect(corroborated.basis.some((line) => line.includes("advisory:BLOCK:corroborated"))).toBe(true);
  });

  it("COMPOSITION: an advisory BLOCK ESCALATES over a kernel ALLOW (the escalation path)", () => {
    const composed = composeAdvisoryWithKernelDecision({
      kernelDecision: allowDecision,
      advisoryVerdict: "BLOCK",
      advisoryRefs: ["adv-1"],
    });
    expect(composed.decision).toBe("BLOCK");
    expect(composed.kernelDecision).toBe("ALLOW");
    expect(composed.basis).toContain("advisory:BLOCK:escalation (binding)");
    expect(composed.basis).toContain("adv-1");
  });

  it("COMPOSITION: a kernel UNKNOWN is never silently allowed (the REQUIRE_CONFIRMATION floor)", () => {
    for (const advisoryVerdict of ["ALLOW", "ALLOW_WITH_CONSTRAINTS"] as const) {
      const composed = composeAdvisoryWithKernelDecision({
        kernelDecision: unknownDecision,
        advisoryVerdict,
      });
      expect(composed.decision).toBe("UNKNOWN");
      expect(composed.basis.join(" ")).toContain("floor=REQUIRE_CONFIRMATION");
    }
    const escalated = composeAdvisoryWithKernelDecision({
      kernelDecision: unknownDecision,
      advisoryVerdict: "BLOCK",
    });
    expect(escalated.decision).toBe("BLOCK");
  });

  it("COMPOSITION: over a kernel ALLOW the advisory verdict can only harden (never soften)", () => {
    expect(
      composeAdvisoryWithKernelDecision({ kernelDecision: allowDecision, advisoryVerdict: "ALLOW" })
        .decision,
    ).toBe("ALLOW");
    expect(
      composeAdvisoryWithKernelDecision({
        kernelDecision: allowDecision,
        advisoryVerdict: "ALLOW_WITH_CONSTRAINTS",
      }).decision,
    ).toBe("ALLOW");
    expect(
      composeAdvisoryWithKernelDecision({
        kernelDecision: allowDecision,
        advisoryVerdict: "REQUIRE_CONFIRMATION",
      }).decision,
    ).toBe("UNKNOWN");
    expect(
      composeAdvisoryWithKernelDecision({ kernelDecision: allowDecision, advisoryVerdict: "BLOCK" })
        .decision,
    ).toBe("BLOCK");
  });

  it("COMPOSITION: the kernel decision object is carried verbatim (never rebuilt, never mutated)", () => {
    const composed = composeAdvisoryWithKernelDecision({
      kernelDecision: allowDecision,
      advisoryVerdict: "ALLOW",
    });
    expect(composed.kernelEvidence).toBe(allowDecision.evidenceRefs);
  });

  it("COMPOSITION: an unknown verdict fails closed", () => {
    expect(() =>
      composeAdvisoryWithKernelDecision({
        kernelDecision: allowDecision,
        // @ts-expect-error the invalid verdict is rejected at runtime
        advisoryVerdict: "MAYBE",
      }),
    ).toThrow(/unknown verdict/);
  });

  it("the verdict → gate-grade projection is monotone (harden-only)", () => {
    expect(verdictToGateGrade("ALLOW")).toBe("ALLOW");
    expect(verdictToGateGrade("ALLOW_WITH_CONSTRAINTS")).toBe("ALLOW");
    expect(verdictToGateGrade("REQUIRE_CONFIRMATION")).toBe("UNKNOWN");
    expect(verdictToGateGrade("BLOCK")).toBe("BLOCK");
  });
});
