import { describe, expect, it } from "vitest";
import {
  DiscoveryExecutionRejectedError,
  GuaranteeLanguageError,
  discoverOpportunity,
} from "../src/index.ts";
import {
  CONDITIONAL_KIND,
  CONDITIONAL_PARTIES,
  CONDITIONAL_PARTY_CHANGES,
  ConditionalOpportunityError,
  conditionalEventId,
  conditionalOpportunityId,
  conditionalPermitsExecution,
  rejectConditionalForExecution,
} from "../src/conditional.ts";
import { publishConditionalOpportunity } from "../src/conditional-publication.ts";
import {
  conditionalIsExpired,
  conditionalIsLive,
  declineConditional,
  revokeConditional,
  validateConditionalOpportunity,
} from "../src/conditional-lifecycle.ts";
import type { ConditionalPublicationInput } from "../src/conditional-publication.ts";
import type { RequiredPartyChange, SupportingObservation } from "../src/index.ts";
import { NOW, healthyLiquidityObservation, supportingPoolTelemetryObservation } from "./fixtures-catalog.ts";

/**
 * The CONDITIONAL opportunity (P21-C, ADR-0014 D9): an evidence-backed
 * opportunity composed with a party-change precondition. Laws: the frozen
 * closed party/change vocabularies (fail-closed); explicit assumptions;
 * the honest platform-prerequisite note (a party change alone may be
 * insufficient — the platform gap is labeled DISTINCT, never conflated,
 * never hidden); the versioned grounding-evidence chain (the existing
 * lineage law); opt-in BEFORE publication; expiry strictly after
 * publication; append-only decline/revoke; the disclosure scope through
 * the consent law; ADVISORY ONLY (conditionalPermitsExecution() false,
 * the always-throwing gate); secret-free + no-guarantee-language.
 */
describe("the conditional opportunity (opportunity x party-change precondition)", () => {
  const liquidity = () => discoverOpportunity(healthyLiquidityObservation(), NOW);
  const partyChange: RequiredPartyChange = {
    party: "RECIPIENT",
    change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
  };

  function publicationInput(
    overrides?: Partial<ConditionalPublicationInput>,
  ): ConditionalPublicationInput {
    return {
      optIn: { participantRef: "participant:operator-1", optedInAt: NOW - 1_000 },
      expiresAt: NOW + 3_600_000,
      requiredPartyChanges: [partyChange],
      assumptions: [
        "the sender's Flutterwave connection remains the only eligible funding rail",
        "the receiving rail's restriction sets admit the corridor query once the receiving method is enabled",
      ],
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
      ...overrides,
    };
  }

  it("publishes a conditional from a validated opportunity (deterministic id, frozen, PUBLISHED event)", () => {
    const opportunity = liquidity();
    const conditional = publishConditionalOpportunity(opportunity, publicationInput(), NOW);
    expect(conditional.conditionalKind).toBe(CONDITIONAL_KIND);
    expect(conditional.conditionalId).toBe(
      conditionalOpportunityId(opportunity.opportunityId, [partyChange]),
    );
    expect(conditional.conditionalId).toBe(
      `conditional:RECIPIENT:ENABLES_FLUTTERWAVE_RECEIVING_METHOD:${opportunity.opportunityId}`,
    );
    expect(conditional.opportunityId).toBe(opportunity.opportunityId);
    expect(conditional.family).toBe("liquidity");
    expect(conditional.railKey).toBe("ethereum:mainnet");
    expect(conditional.summary).toBe(opportunity.title);
    expect(conditional.requiredPartyChanges).toEqual([partyChange]);
    expect(conditional.assumptions).toHaveLength(2);
    expect(conditional.platformPrerequisites).toHaveLength(1);
    expect(conditional.platformPrerequisites[0]?.gapId).toBe("platform:flutterwave-send-operation");
    expect(conditional.evidence).toEqual([supportingPoolTelemetryObservation()]);
    expect(conditional.evidenceFreshness).toEqual(supportingPoolTelemetryObservation().freshness);
    expect(conditional.disclosureScope.fields).toHaveLength(4);
    expect(conditional.optIn.participantRef).toBe("participant:operator-1");
    expect(conditional.publishedAt).toBe(NOW);
    expect(conditional.expiresAt).toBe(NOW + 3_600_000);
    expect(conditional.state).toBe("OPEN");
    expect(conditional.events).toHaveLength(1);
    expect(conditional.events[0]?.eventId).toBe(conditionalEventId(conditional.conditionalId, 0));
    expect(conditional.events[0]?.kind).toBe("PUBLISHED");
    expect(conditional.discoveryTier).toBe("DISCOVERY_NEVER_AUTHORIZATION");
    expect(Object.isFrozen(conditional)).toBe(true);
    expect(Object.isFrozen(conditional.events)).toBe(true);
    expect(Object.isFrozen(conditional.requiredPartyChanges)).toBe(true);
    expect(Object.isFrozen(conditional.evidence)).toBe(true);
  });

  it("is deterministic: identical inputs and instant yield byte-identical conditionals", () => {
    const first = publishConditionalOpportunity(liquidity(), publicationInput(), NOW);
    const second = publishConditionalOpportunity(liquidity(), publicationInput(), NOW);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("derives the id over the canonical sorted unique party changes (multi-change conjuncts)", () => {
    const opportunity = liquidity();
    const changes: readonly RequiredPartyChange[] = [
      { party: "SENDER", change: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT" },
      { party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" },
    ];
    const conditional = publishConditionalOpportunity(
      opportunity,
      publicationInput({ requiredPartyChanges: changes }),
      NOW,
    );
    expect(conditional.conditionalId).toBe(
      `conditional:RECIPIENT:ENABLES_FLUTTERWAVE_RECEIVING_METHOD+SENDER:ADDS_STRIPE_COMPATIBLE_INSTRUMENT:${opportunity.opportunityId}`,
    );
  });

  it("the party/change vocabularies are frozen and closed", () => {
    expect(Object.isFrozen(CONDITIONAL_PARTIES)).toBe(true);
    expect(Object.isFrozen(CONDITIONAL_PARTY_CHANGES)).toBe(true);
    expect([...CONDITIONAL_PARTIES]).toEqual(["SENDER", "RECIPIENT", "THIRD_PARTY"]);
    expect([...CONDITIONAL_PARTY_CHANGES]).toEqual([
      "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
      "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
      "INTERMEDIARY_INTRODUCED",
    ]);
  });

  it("fails closed on a malformed precondition (the closed vocabulary law)", () => {
    const opportunity = liquidity();
    const cases: readonly [string, unknown][] = [
      ["empty requiredPartyChanges", []],
      ["unknown party", [{ party: "MERCHANT", change: "INTERMEDIARY_INTRODUCED" }]],
      ["unknown change", [{ party: "THIRD_PARTY", change: "ENABLES_A_RAIL" }]],
      ["duplicate party change", [partyChange, partyChange]],
      ["non-object change", ["RECIPIENT"]],
    ];
    for (const [label, requiredPartyChanges] of cases) {
      expect(() =>
        publishConditionalOpportunity(
          opportunity,
          publicationInput({ requiredPartyChanges: requiredPartyChanges as RequiredPartyChange[] }),
          NOW,
        ),
      ).toThrow(ConditionalOpportunityError);
      void label;
    }
  });

  it("fails closed on malformed assumptions (non-empty, bounded, unique, vocabulary-scanned)", () => {
    const opportunity = liquidity();
    expect(() => publishConditionalOpportunity(opportunity, publicationInput({ assumptions: [] }), NOW)).toThrow(
      ConditionalOpportunityError,
    );
    expect(() =>
      publishConditionalOpportunity(opportunity, publicationInput({ assumptions: ["", "a second one"] }), NOW),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({ assumptions: ["x".repeat(201)] }),
        NOW,
      ),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({ assumptions: ["same assumption", "same assumption"] }),
        NOW,
      ),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({
          assumptions: ["the corridor is guaranteed to become real once the party changes"],
        }),
        NOW,
      ),
    ).toThrow(GuaranteeLanguageError);
  });

  it("fails closed on a malformed platform prerequisite (the honest distinct platform gap)", () => {
    const opportunity = liquidity();
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({ platformPrerequisites: [{ gapId: "", note: "a note" }] }),
        NOW,
      ),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({ platformPrerequisites: [{ gapId: "platform:x", note: "" }] }),
        NOW,
      ),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({
          platformPrerequisites: [{ gapId: "platform:x", note: "the corridor is risk-free after the change" }],
        }),
        NOW,
      ),
    ).toThrow(GuaranteeLanguageError);
  });

  it("fails closed without the grounding evidence chain (the lineage law)", () => {
    const opportunity = liquidity();
    expect(() =>
      publishConditionalOpportunity(opportunity, publicationInput({ groundingEvidence: [] }), NOW),
    ).toThrow(ConditionalOpportunityError);
    const badVersion: SupportingObservation = {
      ...supportingPoolTelemetryObservation(),
      version: 0,
    };
    expect(() =>
      publishConditionalOpportunity(opportunity, publicationInput({ groundingEvidence: [badVersion] }), NOW),
    ).toThrow(ConditionalOpportunityError);
    const noRefs: SupportingObservation = {
      ...supportingPoolTelemetryObservation(),
      evidenceRefs: [],
    };
    expect(() =>
      publishConditionalOpportunity(opportunity, publicationInput({ groundingEvidence: [noRefs] }), NOW),
    ).toThrow(ConditionalOpportunityError);
    const duplicate = supportingPoolTelemetryObservation();
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({ groundingEvidence: [duplicate, { ...duplicate, freshness: { asOfMs: NOW, maxAgeMs: 1_000 } }] }),
        NOW,
      ),
    ).toThrow(ConditionalOpportunityError);
  });

  it("mirrors the offer-lifecycle laws: opt-in precedes publication, expiry strictly after", () => {
    const opportunity = liquidity();
    expect(() =>
      publishConditionalOpportunity(
        opportunity,
        publicationInput({ optIn: { participantRef: "participant:operator-1", optedInAt: NOW + 1 } }),
        NOW,
      ),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(opportunity, publicationInput({ expiresAt: NOW }), NOW),
    ).toThrow(ConditionalOpportunityError);
    expect(() => publishConditionalOpportunity(opportunity, publicationInput(), -1)).toThrow(RangeError);
  });

  it("fails closed without a validated underlying opportunity (no conditional without evidence)", () => {
    expect(() =>
      publishConditionalOpportunity({} as ReturnType<typeof discoverOpportunity>, publicationInput(), NOW),
    ).toThrow(ConditionalOpportunityError);
    expect(() =>
      publishConditionalOpportunity(null as never, publicationInput(), NOW),
    ).toThrow(ConditionalOpportunityError);
  });

  it("declines and revoke append-only with deterministic event ids and derived state", () => {
    const conditional = publishConditionalOpportunity(liquidity(), publicationInput(), NOW);
    const declined = declineConditional(conditional, NOW + 1_000);
    expect(declined.state).toBe("DECLINED");
    expect(declined.events).toHaveLength(2);
    expect(declined.events[1]?.eventId).toBe(conditionalEventId(conditional.conditionalId, 1));
    expect(declined.events[1]?.kind).toBe("DECLINED");
    expect(() => declineConditional(declined, NOW + 2_000)).toThrow(ConditionalOpportunityError);
    const revoked = revokeConditional(declined, NOW + 3_000);
    expect(revoked.state).toBe("REVOKED");
    expect(revoked.events).toHaveLength(3);
    expect(() => revokeConditional(revoked, NOW + 4_000)).toThrow(ConditionalOpportunityError);
    expect(() => declineConditional(conditional, NOW - 1)).toThrow(ConditionalOpportunityError);
  });

  it("expiry and liveness mirror the offer law (expired at >= expiresAt; live only OPEN in window)", () => {
    const conditional = publishConditionalOpportunity(liquidity(), publicationInput(), NOW);
    expect(conditionalIsExpired(conditional, NOW + 3_600_000)).toBe(true);
    expect(conditionalIsExpired(conditional, NOW + 3_599_999)).toBe(false);
    expect(conditionalIsLive(conditional, NOW)).toBe(true);
    expect(conditionalIsLive(conditional, NOW + 3_600_000)).toBe(false);
    const declined = declineConditional(conditional, NOW + 1);
    expect(conditionalIsLive(declined, NOW + 2)).toBe(false);
  });

  it("is ADVISORY ONLY: the permits literal is false and the execution gate always throws", () => {
    expect(conditionalPermitsExecution()).toBe(false);
    const conditional = publishConditionalOpportunity(liquidity(), publicationInput(), NOW);
    expect(() => rejectConditionalForExecution(conditional)).toThrow(DiscoveryExecutionRejectedError);
    expect(() => rejectConditionalForExecution({})).toThrow(DiscoveryExecutionRejectedError);
  });

  it("the read-path validator round-trips a published conditional and rejects tampering", () => {
    const conditional = publishConditionalOpportunity(liquidity(), publicationInput(), NOW);
    const roundTrip = validateConditionalOpportunity(JSON.parse(JSON.stringify(conditional)));
    expect(JSON.stringify(roundTrip)).toBe(JSON.stringify(conditional));
    expect(() =>
      validateConditionalOpportunity({ ...conditional, discoveryTier: "SOMETHING_ELSE" }),
    ).toThrow(ConditionalOpportunityError);
    expect(() => validateConditionalOpportunity({ ...conditional, conditionalKind: "Offer" })).toThrow(
      ConditionalOpportunityError,
    );
    expect(() =>
      validateConditionalOpportunity({
        ...conditional,
        events: conditional.events.slice(1),
      }),
    ).toThrow(ConditionalOpportunityError);
    expect(() => validateConditionalOpportunity(null)).toThrow(ConditionalOpportunityError);
  });
});
