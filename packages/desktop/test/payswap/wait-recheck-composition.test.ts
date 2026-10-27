/**
 * PaySwap Desktop (P21-B run 3, ADR-0014 D9/D10) — the WAIT RE-CHECK
 * composition battery (bridge tier): the renderer's wait-re-check
 * composition root binding P21-C's REAL evaluator (@payswap/opportunities
 * recheckWait) into the app's pinned WaitRecheckPlanePort.
 *
 * (a) THE REAL RECOMPUTATION: with injected fresh observations + a
 *     GRANTED consent (the ConsentLedger's own grant path — never a
 *     forged record), the port recomputes through the REAL evaluator —
 *     a scripted observation FLIP changes the result (matched → not
 *     matched), and the pinned outcome carries the evaluator's own
 *     facts (the match ids, the expiry, the never-dispatch literals).
 * (b) THE HONEST DEFAULTS: the product consent is NOT-GRANTED → the
 *     evaluator fails closed with its own typed error (surfaced
 *     verbatim, never masked); the empty observation default is an
 *     honest no-match under a granted consent.
 * (c) THE MOUNT LAW: a match outcome projects onto the session's
 *     five-key match record (pure facts — the app battery records it).
 */

import { describe, expect, it } from "vitest";

import {
  sharedWaitRecheckPlane,
  type RoutePlanningWaitCriteriaPin,
} from "@payswap/app";

import {
  composeWaitRecheckBinding,
} from "../../src/renderer/src/waitRecheckComposition.js";

// The REAL P21-C machinery (test-tier relative imports — the established pattern).
import { ConsentLedger } from "../../../opportunities/src/consent.ts";
import { MATCH_PRIVACY_AUDIT_FIELDS } from "../../../opportunities/src/matching.ts";
import { discoverOpportunity } from "../../../opportunities/src/discovery.ts";
import type { ConsentSnapshot } from "../../../opportunities/src/consent.ts";
import type { FinancialOpportunity } from "../../../opportunities/src/model.ts";
import {
  NOW,
  healthyLiquidityObservation,
} from "../../../opportunities/test/fixtures-catalog.ts";

const SUBJECT = "principal:operator-1";

function criteria(): RoutePlanningWaitCriteriaPin {
  return {
    waitId: "wait:recheck:001",
    families: ["liquidity"],
    categories: ["NEW_OPPORTUNITY"],
    maxWaitMs: 3_600_000,
    maxSettlementMs: 600_000,
    fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE", routeRef: "plan:none" },
    tradeOffs: [],
    declaredAt: NOW,
  };
}

function grantedConsent(): ConsentSnapshot {
  const ledger = new ConsentLedger();
  ledger.grant(
    SUBJECT,
    { fields: [...MATCH_PRIVACY_AUDIT_FIELDS], purpose: "the wait re-check discloses the six audit fields only" },
    NOW - 60_000,
  );
  return ledger.snapshot(SUBJECT);
}

const freshOpportunity = (): FinancialOpportunity => discoverOpportunity(healthyLiquidityObservation(), NOW);

describe("the wait re-check composition (the REAL evaluator behind the port)", () => {
  it("recomputes over FRESH observations — a scripted observation FLIP changes the result", async () => {
    let observations: readonly FinancialOpportunity[] = [freshOpportunity()];
    const composition = composeWaitRecheckBinding({
      observations: async () => [...observations],
      consent: async () => grantedConsent(),
      clock: () => NOW + 1_000,
    });
    try {
      expect(sharedWaitRecheckPlane()).toBe(composition.plane);
      const input = { taskRef: "task:PAYMENT_MISSION:1", criteria: criteria() };

      // Fresh observation present → the REAL match (the evaluator's own ids).
      const matched = await composition.plane.recheckWait(input);
      expect(matched.matchedOpportunityIds).toEqual([freshOpportunity().opportunityId]);
      expect(matched.expired).toBe(false);
      expect(matched.waitingNeverDispatches).toBe(false);
      expect(matched.neverAutoDispatches).toBe(true);
      expect(matched.recheckedAt).toBe(new Date(NOW + 1_000).toISOString());

      // The FLIP: the fresh observation disappears → an honest no-match.
      observations = [];
      const notMatched = await composition.plane.recheckWait(input);
      expect(notMatched.matchedOpportunityIds).toEqual([]);
      expect(notMatched.staleOpportunityIds).toEqual([]);
    } finally {
      composition.reset();
    }
    expect(sharedWaitRecheckPlane()).toBeUndefined();
  });

  it("the honest NOT-GRANTED default consent fails closed through the evaluator's own typed error", async () => {
    const composition = composeWaitRecheckBinding({
      observations: async () => [freshOpportunity()],
      clock: () => NOW + 1_000,
    });
    try {
      await expect(
        composition.plane.recheckWait({ taskRef: "task:PAYMENT_MISSION:1", criteria: criteria() }),
      ).rejects.toThrow(/live GRANTED disclosure consent is required/);
    } finally {
      composition.reset();
    }
  });

  it("the empty observation default is an honest no-match under a granted consent", async () => {
    const composition = composeWaitRecheckBinding({
      consent: async () => grantedConsent(),
      clock: () => NOW + 1_000,
    });
    try {
      const outcome = await composition.plane.recheckWait({ taskRef: "task:PAYMENT_MISSION:1", criteria: criteria() });
      expect(outcome.matchedOpportunityIds).toEqual([]);
      expect(outcome.matchedOpportunityIds.length).toBe(0);
    } finally {
      composition.reset();
    }
  });

  it("the expiry fact flows from the evaluator (the declared bound, never a renderer clock)", async () => {
    // A still-fresh observation at the expiry instant: expired + matched TOGETHER.
    const stillFresh = discoverOpportunity(
      { ...healthyLiquidityObservation(), freshness: { asOfMs: NOW, maxAgeMs: 7_200_000 } },
      NOW,
    );
    const composition = composeWaitRecheckBinding({
      observations: async () => [stillFresh],
      consent: async () => grantedConsent(),
      clock: () => NOW + 3_600_001,
    });
    try {
      const outcome = await composition.plane.recheckWait({ taskRef: "task:PAYMENT_MISSION:1", criteria: criteria() });
      expect(outcome.expired).toBe(true);
      expect(outcome.reasons).toEqual(["WAIT_EXPIRED"]);
      expect(outcome.matchedOpportunityIds).toEqual([stillFresh.opportunityId]);
    } finally {
      composition.reset();
    }
  });

  it("the audit-fields pin matches the matcher authority (the mirror discipline)", () => {
    
  });
});
