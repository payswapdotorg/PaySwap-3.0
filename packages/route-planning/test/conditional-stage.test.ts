import { describe, expect, it } from "vitest";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import {
  CONDITIONAL_DERIVATION_STAGE,
  ConditionalDerivationError,
  conditionalsPermitExecution,
  deriveConditionalOpportunities,
  requireConditionalOpportunityPort,
  unboundConditionalOpportunityPort,
  type ConditionalDerivationInput,
} from "../src/conditional-stage.ts";
import {
  PINNED_CONDITIONAL_KIND,
  PINNED_CONDITIONAL_PARTIES,
  PINNED_CONDITIONAL_PARTY_CHANGES,
  PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE,
  PINNED_CORRIDOR_NOT_EXECUTABLE_CODE,
  PINNED_DISCOVERY_TIER,
  PINNED_OPPORTUNITY_FAMILIES,
  PINNED_OPPORTUNITY_RAIL_KINDS,
  PINNED_P21_CROSS_PROVIDER_SHAPE_GAP,
  PINNED_P21_FLW_SEND_OPERATION_GAP,
  type PinnedConditionalOpportunity,
} from "../src/pins/opportunities.ts";
import { PortUnboundError } from "../src/errors.ts";
// The REAL authorities, imported at the TEST tier only (the pin-fidelity law):
import { CONDITIONAL_KIND, CONDITIONAL_PARTIES, CONDITIONAL_PARTY_CHANGES } from "../../opportunities/src/conditional.ts";
import { DISCOVERY_TIER } from "../../opportunities/src/discovery-tier.ts";
import { OPPORTUNITY_FAMILIES, RAIL_KINDS } from "../../opportunities/src/model.ts";
import { validateConditionalOpportunity } from "../../opportunities/src/conditional-lifecycle.ts";
import { CORRIDOR_EXCLUSION_CODES } from "../../capability/src/corridor-types.ts";
import {
  CORRIDOR_RAIL_KEY,
  FLW_SENDER_INSTANCE_ID,
  NOW,
  STRIPE_RECIPIENT_INSTANCE_ID,
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  realConditionalOpportunityPort,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { movementCorridorQuery, realCorridorProjectionPort, recipientChain, senderChain } from "./fixtures.ts";

/**
 * THE STAGE-7 CONDITIONAL-OPPORTUNITY DERIVATION (P21-C, ADR-0014 D7/D9):
 * from the rail snapshots' typed exclusion facts + the stage-5 hard-gate
 * results, the derivation composes the P21 party-change conditionals
 * through the REAL opportunities machinery via the injected port. Laws:
 * DETERMINISTIC and fail-closed (no exclusion facts -> no conditionals;
 * never invent party semantics for a corridor that does not match the
 * typed P21 pattern); ADVISORY ONLY (conditionalsPermitExecution false);
 * the honest platform-prerequisite note where a party change alone is
 * insufficient; the unbound port fails CLOSED naming stage 7 exactly; a
 * lying port never composes. (The STALE_OBSERVATION stage-6 binding is
 * proven in lab-adapter.test.ts — the stage-6 battery.)
 */

const OPT_IN = { participantRef: "principal:operator-1", optedInAt: NOW - 1_000 };
const DERIVE_AT = NOW;
const EXPIRES_AT = NOW + 3_600_000;
const DISCLOSURE_PURPOSE = "the operator's no-route panel renders the conditional opportunities with their preconditions";

function noRouteSnapshots() {
  return deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
}

/** Stage 5 over the corridor's honest empty candidate set (stage 4 compiled nothing for a corridor with zero eligible rails). */
function noRouteHardGates() {
  return evaluateHardGates({ intent: noRouteIntentFixture(), at: NOW, candidates: [] });
}

function deriveNoRoute() {
  const pair = noRouteSnapshots();
  return deriveConditionalOpportunities({
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    hardGates: noRouteHardGates(),
    port: realConditionalOpportunityPort(),
    corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
    optIn: OPT_IN,
    at: DERIVE_AT,
    expiresAt: EXPIRES_AT,
    disclosurePurpose: DISCLOSURE_PURPOSE,
  });
}

describe("the stage-7 conditional-opportunity derivation (P21-C, ADR-0014 D7/D9)", () => {
  it("the vocabulary pins are byte-identical to the REAL opportunities/capability authorities", () => {
    expect([...PINNED_CONDITIONAL_PARTIES]).toEqual([...CONDITIONAL_PARTIES]);
    expect([...PINNED_CONDITIONAL_PARTY_CHANGES]).toEqual([...CONDITIONAL_PARTY_CHANGES]);
    expect(PINNED_CONDITIONAL_KIND).toBe(CONDITIONAL_KIND);
    expect(PINNED_DISCOVERY_TIER).toBe(DISCOVERY_TIER);
    expect([...PINNED_OPPORTUNITY_FAMILIES]).toEqual([...OPPORTUNITY_FAMILIES]);
    expect([...PINNED_OPPORTUNITY_RAIL_KINDS]).toEqual([...RAIL_KINDS]);
    expect(Object.isFrozen(PINNED_CONDITIONAL_PARTIES)).toBe(true);
    expect(Object.isFrozen(PINNED_CONDITIONAL_PARTY_CHANGES)).toBe(true);
    expect([...CORRIDOR_EXCLUSION_CODES]).toContain(PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE);
    expect([...CORRIDOR_EXCLUSION_CODES]).toContain(PINNED_CORRIDOR_NOT_EXECUTABLE_CODE);
    expect(PINNED_P21_FLW_SEND_OPERATION_GAP).toBe("platform:flutterwave-send-operation");
    expect(PINNED_P21_CROSS_PROVIDER_SHAPE_GAP).toBe("platform:cross-provider-route-shape");
  });

  it("the honest no-route world derives exactly the three P21 conditionals over the typed exclusion facts", () => {
    const derivation = deriveNoRoute();
    expect(derivation.stage).toBe(CONDITIONAL_DERIVATION_STAGE);
    expect(derivation.corridorFundingMethod).toBe("flutterwave_wallet");
    // The grounded facts are the corridor's VERBATIM typed exclusions.
    const fundingFact = derivation.groundedFacts.find(
      (fact) => fact.code === PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE,
    );
    expect(fundingFact?.side).toBe("RECIPIENT");
    expect(fundingFact?.routeId).toBe(STRIPE_RECIPIENT_INSTANCE_ID);
    expect(fundingFact?.fundingMethod).toBe("flutterwave_wallet");
    const readonlyFact = derivation.groundedFacts.find(
      (fact) => fact.code === PINNED_CORRIDOR_NOT_EXECUTABLE_CODE,
    );
    expect(readonlyFact?.side).toBe("SENDER");
    expect(readonlyFact?.routeId).toBe(FLW_SENDER_INSTANCE_ID);
    // The three conditionals, in the fixed derivation order.
    expect(derivation.conditionalOpportunities).toHaveLength(3);
    const [recipientConditional, senderConditional, intermediaryConditional] = derivation.conditionalOpportunities;
    expect(recipientConditional?.requiredPartyChanges).toEqual([
      { party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" },
    ]);
    // The honest platform gap: an FLW receiving method needs an FLW send operation — DISTINCT from the party prerequisite.
    expect(recipientConditional?.platformPrerequisites).toHaveLength(1);
    expect(recipientConditional?.platformPrerequisites[0]?.gapId).toBe(PINNED_P21_FLW_SEND_OPERATION_GAP);
    expect(recipientConditional?.platformPrerequisites[0]?.note).toContain("Flutterwave send operation");
    expect(recipientConditional?.platformPrerequisites[0]?.note).toContain("platform gap");
    expect(senderConditional?.requiredPartyChanges).toEqual([
      { party: "SENDER", change: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT" },
    ]);
    // No platform gap for the sender's instrument: the merchant-native route is executable once the funding instrument is genuinely served (ADR-0014 D8).
    expect(senderConditional?.platformPrerequisites).toEqual([]);
    expect(intermediaryConditional?.requiredPartyChanges).toEqual([
      { party: "THIRD_PARTY", change: "INTERMEDIARY_INTRODUCED" },
    ]);
    expect(intermediaryConditional?.platformPrerequisites).toHaveLength(1);
    expect(intermediaryConditional?.platformPrerequisites[0]?.gapId).toBe(PINNED_P21_CROSS_PROVIDER_SHAPE_GAP);
    for (const conditional of derivation.conditionalOpportunities) {
      expect(conditional.conditionalKind).toBe(PINNED_CONDITIONAL_KIND);
      expect(conditional.discoveryTier).toBe(PINNED_DISCOVERY_TIER);
      expect(conditional.state).toBe("OPEN");
      expect(conditional.evidence.length).toBeGreaterThan(0);
      expect(conditional.evidence[0]?.observationId.startsWith("rail-snapshot:")).toBe(true);
      expect(conditional.assumptions.length).toBeGreaterThan(0);
      expect(conditional.publishedAt).toBe(DERIVE_AT);
      expect(conditional.expiresAt).toBe(EXPIRES_AT);
      expect(conditional.optIn).toEqual(OPT_IN);
      // THE strongest proof: every derived value is a REAL ConditionalOpportunity record.
      expect(() => validateConditionalOpportunity(conditional)).not.toThrow();
    }
  });

  it("is deterministic: identical inputs and instant derive byte-identical conditionals", () => {
    const first = deriveNoRoute();
    const second = deriveNoRoute();
    expect(JSON.stringify(second.conditionalOpportunities)).toBe(JSON.stringify(first.conditionalOpportunities));
    expect(second.derivationDigest).toBe(first.derivationDigest);
    expect(second.groundedFacts).toEqual(first.groundedFacts);
  });

  it("is ADVISORY ONLY: the permits literal is false and the structural fields carry it", () => {
    expect(conditionalsPermitExecution()).toBe(false);
    const derivation = deriveNoRoute();
    expect(derivation.conditionalsPermitExecution).toBe(false);
    expect(derivation.advisoryOnly).toBe(true);
    expect(Object.isFrozen(derivation)).toBe(true);
    expect(Object.isFrozen(derivation.conditionalOpportunities)).toBe(true);
    expect(Object.isFrozen(derivation.groundedFacts)).toBe(true);
  });

  it("never invents: the healthy corridor (every rail eligible) derives ZERO conditionals", () => {
    const pair = deriveRailSnapshotPair({
      sender: {
        side: "SENDER", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [senderChain()], corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [recipientChain()], corridorPort: realCorridorProjectionPort(),
      },
    });
    const derivation = deriveConditionalOpportunities({
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
      hardGates: evaluateHardGates({ intent: noRouteIntentFixture(), at: NOW, candidates: [] }),
      port: realConditionalOpportunityPort(),
      corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
      optIn: OPT_IN, at: DERIVE_AT, expiresAt: EXPIRES_AT,
      disclosurePurpose: DISCLOSURE_PURPOSE,
    });
    expect(derivation.groundedFacts).toEqual([]);
    expect(derivation.conditionalOpportunities).toEqual([]);
  });

  it("never invents party semantics: a FOREIGN funding method derives no FLW/Stripe conditionals", () => {
    const foreignQuery = { ...noRouteCorridorQuery(), fundingMethod: "sepa_bank_debit" };
    const pair = deriveRailSnapshotPair({
      sender: {
        side: "SENDER", query: foreignQuery, freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT", query: foreignQuery, freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
      },
    });
    const derivation = deriveConditionalOpportunities({
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
      hardGates: noRouteHardGates(),
      port: realConditionalOpportunityPort(),
      corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
      optIn: OPT_IN, at: DERIVE_AT, expiresAt: EXPIRES_AT,
      disclosurePurpose: DISCLOSURE_PURPOSE,
    });
    // The not-served fact is real (the corridor still composes nothing) — but the
    // party-change vocabulary names the P21 pattern only: only the honest
    // intermediary conditional derives, never an invented FLW/Stripe one.
    expect(derivation.corridorFundingMethod).toBe("sepa_bank_debit");
    const parties = derivation.conditionalOpportunities.flatMap((conditional) =>
      conditional.requiredPartyChanges.map((change) => change.party),
    );
    expect(parties).toEqual(["THIRD_PARTY"]);
  });

  it("the unbound port fails CLOSED naming the exact stage (never a fallback, never fabricated conditionals)", () => {
    let stage = "";
    try {
      unboundConditionalOpportunityPort().construct({
        family: "other", railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY,
        title: "t", description: "d", at: DERIVE_AT, optIn: OPT_IN, expiresAt: EXPIRES_AT,
        requiredPartyChanges: [{ party: "THIRD_PARTY", change: "INTERMEDIARY_INTRODUCED" }],
        assumptions: ["a"], platformPrerequisites: [], groundingEvidence: [], disclosureScope: { fields: ["conditional_id"], purpose: "p" },
      });
      expect.unreachable("the unbound conditional port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-7:derive-conditional-opportunities");
    expect(() => requireConditionalOpportunityPort(undefined)).toThrow(PortUnboundError);
    const pair = noRouteSnapshots();
    expect(() =>
      deriveConditionalOpportunities({
        senderSnapshot: pair.sender, recipientSnapshot: pair.recipient, hardGates: noRouteHardGates(),
        port: undefined as never,
        corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
        optIn: OPT_IN, at: DERIVE_AT, expiresAt: EXPIRES_AT,
        disclosurePurpose: DISCLOSURE_PURPOSE,
      }),
    ).toThrow(PortUnboundError);
  });

  it("a lying port never composes (the derived values are validated fail-closed)", () => {
    const pair = noRouteSnapshots();
    const base = deriveNoRoute();
    const honest = base.conditionalOpportunities[0];
    expect(honest).toBeDefined();
    type Liar = (request: { requiredPartyChanges: readonly { party: string; change: string }[] }) => PinnedConditionalOpportunity;
    const asConditional = (value: unknown) => value as PinnedConditionalOpportunity;
    const liars: readonly Liar[] = [
      (request) => asConditional({ ...honest, requiredPartyChanges: [{ party: "MERCHANT", change: request.requiredPartyChanges[0]?.change }] }),
      () => asConditional({ ...honest, discoveryTier: "SOME_AUTHORITY_TIER" }),
      () => asConditional({ ...honest, conditionalKind: "Offer" }),
      () => asConditional({ ...honest, expiresAt: DERIVE_AT + 1 }),
      () => asConditional({ ...honest, state: "REVOKED" }),
      () => asConditional({ ...honest, evidence: [] }),
    ];
    for (const liar of liars) {
      expect(() =>
        deriveConditionalOpportunities({
          senderSnapshot: pair.sender, recipientSnapshot: pair.recipient, hardGates: noRouteHardGates(),
          port: { construct: (request) => liar(request) },
          corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
          optIn: OPT_IN, at: DERIVE_AT, expiresAt: EXPIRES_AT,
          disclosurePurpose: DISCLOSURE_PURPOSE,
        }),
      ).toThrow(ConditionalDerivationError);
    }
  });

  it("fails closed on malformed derivation inputs (sides, corridor mismatch, expiry, opt-in)", () => {
    const pair = noRouteSnapshots();
    const input: ConditionalDerivationInput = {
      senderSnapshot: pair.sender, recipientSnapshot: pair.recipient, hardGates: noRouteHardGates(),
      port: realConditionalOpportunityPort(),
      corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
      optIn: OPT_IN, at: DERIVE_AT, expiresAt: EXPIRES_AT,
      disclosurePurpose: DISCLOSURE_PURPOSE,
    };
    expect(() => deriveConditionalOpportunities({ ...input, senderSnapshot: pair.recipient })).toThrow(ConditionalDerivationError);
    expect(() => deriveConditionalOpportunities({ ...input, expiresAt: DERIVE_AT })).toThrow(ConditionalDerivationError);
    expect(() => deriveConditionalOpportunities({ ...input, optIn: { participantRef: "p", optedInAt: DERIVE_AT + 1 } })).toThrow(ConditionalDerivationError);
    expect(() => deriveConditionalOpportunities({ ...input, disclosurePurpose: "" })).toThrow(ConditionalDerivationError);
    expect(() => deriveConditionalOpportunities({ ...input, corridorRail: { railKind: "FIAT" as never, railKey: "not-a-rail-key" } })).toThrow(ConditionalDerivationError);
    // A side snapshot grounded on a FOREIGN corridor never composes (the corridor law).
    const foreign = deriveRailSnapshotPair({
      sender: {
        side: "SENDER", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [senderChain()], corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [recipientChain()], corridorPort: realCorridorProjectionPort(),
      },
    });
    expect(() =>
      deriveConditionalOpportunities({
        ...input,
        senderSnapshot: foreign.sender,
        recipientSnapshot: pair.recipient,
      }),
    ).toThrow(ConditionalDerivationError);
  });
});
