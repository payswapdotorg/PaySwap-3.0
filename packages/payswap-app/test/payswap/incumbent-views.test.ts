/**
 * @payswap/app — incumbent provenance oracle (PORT of the P7-W1
 * share of payswap.org@8a735bf packages/ux/test/incumbent-views.test.ts,
 * MMP-35 behavioral oracle).
 *
 * The old suite's law (INV-E04 posture): UI/browser artifacts are never
 * stronger than their authenticated provenance — the strength order is
 * strictly increasing, an unknown source fails closed, and claiming
 * stronger provenance than the source establishes is a violation. The
 * strength ORDER is the ported contract; the old incumbent-system
 * registry (Wise-specific) is evidence, not carried.
 */
import { describe, expect, it } from "vitest";
import { PROVENANCE_STRENGTH_ORDER } from "../../src/contracts/honest-states.js";

describe("the provenance strength order (INV-E04 posture)", () => {
  it("is exactly the four strengths, weakest-to-strongest", () => {
    expect(PROVENANCE_STRENGTH_ORDER).toEqual([
      "AUTHENTICATED_RECORD",
      "PROVIDER_OBSERVATION",
      "DECLARED_TERMS",
      "UI_ARTIFACT",
    ]);
  });

  it("the strength order is strictly ordered: a UI artifact is the weakest", () => {
    const rank = new Map(PROVENANCE_STRENGTH_ORDER.map((s, i) => [s, i]));
    expect(rank.get("UI_ARTIFACT")).toBe(3);
    expect(rank.get("AUTHENTICATED_RECORD")).toBe(0);
    // Every pairwise comparison is strict — no equal strengths.
    for (let i = 0; i < PROVENANCE_STRENGTH_ORDER.length; i += 1) {
      for (let j = i + 1; j < PROVENANCE_STRENGTH_ORDER.length; j += 1) {
        expect(rank.get(PROVENANCE_STRENGTH_ORDER[i]!)).toBeLessThan(
          rank.get(PROVENANCE_STRENGTH_ORDER[j]!),
        );
      }
    }
  });

  it("a browser/UI artifact is never stronger than any authenticated provenance", () => {
    const rank = new Map(PROVENANCE_STRENGTH_ORDER.map((s, i) => [s, i]));
    for (const strength of PROVENANCE_STRENGTH_ORDER) {
      if (strength !== "UI_ARTIFACT") {
        expect(rank.get("UI_ARTIFACT")).toBeGreaterThan(rank.get(strength));
      }
    }
  });
});
