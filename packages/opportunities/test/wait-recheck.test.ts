import { describe, expect, it } from "vitest";
import { ConsentLedger, DisclosureConsentError } from "../src/consent.ts";
import { MATCH_PRIVACY_AUDIT_FIELDS, matchOpportunities } from "../src/matching.ts";
import { WAIT_CATEGORIES, evaluateWaitCriteria } from "../src/wait-criteria.ts";
import { discoverOpportunity } from "../src/discovery.ts";
import { publishConditionalOpportunity } from "../src/conditional-publication.ts";
import { conditionalIsLive } from "../src/conditional-lifecycle.ts";
import { recheckWait } from "../src/wait-recheck.ts";
import type { WaitRecheckInput } from "../src/wait-recheck.ts";
import type { ConsentSnapshot } from "../src/consent.ts";
import type { OpportunityMatchCriteria } from "../src/matching.ts";
import type { FinancialOpportunity } from "../src/model.ts";
import {
  NOW,
  healthyLiquidityObservation,
  staleQuoteObservation,
  supportingPoolTelemetryObservation,
} from "./fixtures-catalog.ts";

/**
 * The WAIT RE-CHECK evaluator (P21-C, ADR-0014 D9/D10): the pure domain
 * service behind the user-triggered "check now". Laws: it REUSES the
 * existing matchers (matchOpportunities for the consent-gated fresh
 * match, evaluateWaitCriteria for the pure five-key wait evaluation) —
 * never a parallel matcher; STALE observations never match and are
 * reported as staleness facts; expiry and matches are reported TOGETHER;
 * a revoked consent fails closed through the matcher's own typed error;
 * conditional opportunities re-check as liveness facts; and the honest
 * `neverAutoDispatches: true` literal — a re-check only reports, fresh
 * planning + explicit authorization decide.
 */
describe("the wait re-check evaluator (the pure 'check now' service)", () => {
  const SUBJECT = "principal:operator-1";

  function criteria(overrides?: Partial<OpportunityMatchCriteria>): OpportunityMatchCriteria {
    return {
      waitId: "wait:recheck:001",
      families: ["liquidity"],
      categories: [...WAIT_CATEGORIES],
      maxWaitMs: 3_600_000,
      maxSettlementMs: 600_000,
      fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE", routeRef: "plan:mixed-dex-offramp" },
      tradeOffs: [],
      declaredAt: NOW,
      ...overrides,
    };
  }

  function liveConsent(): ConsentSnapshot {
    const ledger = new ConsentLedger();
    ledger.grant(
      SUBJECT,
      { fields: [...MATCH_PRIVACY_AUDIT_FIELDS], purpose: "the wait re-check discloses the six audit fields only" },
      NOW - 60_000,
    );
    return ledger.snapshot(SUBJECT);
  }

  function revokedConsent(): ConsentSnapshot {
    const ledger = new ConsentLedger();
    ledger.grant(
      SUBJECT,
      { fields: [...MATCH_PRIVACY_AUDIT_FIELDS], purpose: "the wait re-check discloses the six audit fields only" },
      NOW - 60_000,
    );
    ledger.revoke(SUBJECT, NOW - 30_000);
    return ledger.snapshot(SUBJECT);
  }

  const freshOpportunity = (): FinancialOpportunity =>
    discoverOpportunity(healthyLiquidityObservation(), NOW);

  function recheckInput(overrides?: Partial<WaitRecheckInput>): WaitRecheckInput {
    return {
      criteria: criteria(),
      opportunities: [freshOpportunity()],
      consent: liveConsent(),
      ...overrides,
    };
  }

  it("reuses the existing matchers: the outcome carries their results verbatim (no parallel matcher)", () => {
    const input = recheckInput();
    const at = NOW + 1_000;
    const outcome = recheckWait(input, at);
    const match = matchOpportunities(input, at);
    const waitEvaluation = evaluateWaitCriteria(input.criteria, input.opportunities, at);
    expect(outcome.recheckedAt).toBe(at);
    expect(JSON.stringify(outcome.match)).toBe(JSON.stringify(match));
    expect(JSON.stringify(outcome.waitEvaluation)).toBe(JSON.stringify(waitEvaluation));
    expect(outcome.match.matched).toHaveLength(1);
    expect(outcome.waitEvaluation.matchedOpportunityIds).toEqual([freshOpportunity().opportunityId]);
  });

  it("STALE observations never match and are reported as the staleness facts", () => {
    const stale = discoverOpportunity(staleQuoteObservation(), NOW);
    const input = recheckInput({ opportunities: [freshOpportunity(), stale] });
    const outcome = recheckWait(input, NOW + 1_000);
    expect(outcome.waitEvaluation.matchedOpportunityIds).toEqual([freshOpportunity().opportunityId]);
    expect(outcome.staleOpportunityIds).toEqual([stale.opportunityId]);
    expect(outcome.staleOpportunityIds).not.toContain(freshOpportunity().opportunityId);
  });

  it("an empty observation set is an honest no-match (nothing fabricated)", () => {
    const outcome = recheckWait(recheckInput({ opportunities: [] }), NOW + 1_000);
    expect(outcome.match.matched).toEqual([]);
    expect(outcome.waitEvaluation.matchedOpportunityIds).toEqual([]);
    expect(outcome.staleOpportunityIds).toEqual([]);
  });

  it("expiry and matches are reported TOGETHER (the expired wait still reports what it sees)", () => {
    const stillFreshAtExpiry = discoverOpportunity(
      { ...healthyLiquidityObservation(), freshness: { asOfMs: NOW, maxAgeMs: 7_200_000 } },
      NOW,
    );
    const at = NOW + 3_600_001;
    const outcome = recheckWait(recheckInput({ opportunities: [stillFreshAtExpiry] }), at);
    expect(outcome.waitEvaluation.expired).toBe(true);
    expect(outcome.waitEvaluation.reasons).toEqual(["WAIT_EXPIRED"]);
    expect(outcome.waitEvaluation.matchedOpportunityIds).toEqual([stillFreshAtExpiry.opportunityId]);
    expect(outcome.match.matched).toHaveLength(1);
    expect(outcome.staleOpportunityIds).toEqual([]);
  });

  it("a revoked consent fails closed through the matcher's own typed error", () => {
    expect(() => recheckWait(recheckInput({ consent: revokedConsent() }), NOW + 1_000)).toThrow(
      DisclosureConsentError,
    );
  });

  it("the consent scope must cover the audit fields (the fail-closed scope law, reused)", () => {
    const ledger = new ConsentLedger();
    ledger.grant(
      SUBJECT,
      { fields: ["opportunity_id"], purpose: "an under-scoped consent never discloses the full audit" },
      NOW - 60_000,
    );
    expect(() => recheckWait(recheckInput({ consent: ledger.snapshot(SUBJECT) }), NOW + 1_000)).toThrow(
      /does not cover the audit field/,
    );
  });

  it("conditional opportunities re-check as liveness facts (never as dispatchable matches)", () => {
    const underlying = freshOpportunity();
    const conditional = publishConditionalOpportunity(
      underlying,
      {
        optIn: { participantRef: SUBJECT, optedInAt: NOW - 2_000 },
        expiresAt: NOW + 7_200_000,
        requiredPartyChanges: [{ party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" }],
        assumptions: ["the sender's Flutterwave connection remains the only eligible funding rail"],
        platformPrerequisites: [
          {
            gapId: "platform:flutterwave-send-operation",
            note: "an FLW receiving method makes the corridor real only when a Flutterwave send operation exists in the capability model — the platform gap, distinct from the party prerequisite",
          },
        ],
        groundingEvidence: [supportingPoolTelemetryObservation()],
        disclosureScope: {
          fields: ["conditional_id", "required_party_changes", "assumptions", "platform_prerequisites"],
          purpose: "the operator's no-route panel renders the conditional opportunities with their preconditions",
        },
      },
      NOW,
    );
    const outcome = recheckWait(
      recheckInput({ opportunities: [underlying], conditionalOpportunities: [conditional] }),
      NOW + 1_000,
    );
    expect(outcome.conditionalFacts).toHaveLength(1);
    expect(outcome.conditionalFacts[0]?.conditionalId).toBe(conditional.conditionalId);
    expect(outcome.conditionalFacts[0]?.state).toBe("OPEN");
    expect(outcome.conditionalFacts[0]?.expired).toBe(false);
    expect(outcome.conditionalFacts[0]?.underlyingOpportunityId).toBe(underlying.opportunityId);
    expect(outcome.conditionalFacts[0]?.underlyingMatched).toBe(true);

    const laterView = recheckWait(
      recheckInput({ opportunities: [underlying], conditionalOpportunities: [conditional] }),
      NOW + 7_200_001,
    );
    expect(laterView.conditionalFacts[0]?.expired).toBe(true);
    expect(conditionalIsLive(conditional, NOW + 7_200_001)).toBe(false);
  });

  it("the honest literals: neverAutoDispatches is true; the carried wait literal stays false", () => {
    const outcome = recheckWait(recheckInput(), NOW + 1_000);
    expect(outcome.neverAutoDispatches).toBe(true);
    expect(outcome.waitEvaluation.waitingNeverDispatches).toBe(false);
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.staleOpportunityIds)).toBe(true);
    expect(Object.isFrozen(outcome.conditionalFacts)).toBe(true);
  });

  it("is deterministic and fails closed on a malformed instant", () => {
    const first = recheckWait(recheckInput(), NOW + 1_000);
    const second = recheckWait(recheckInput(), NOW + 1_000);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(() => recheckWait(recheckInput(), -1)).toThrow(RangeError);
    expect(() => recheckWait(null as never, NOW)).toThrow();
  });
});
