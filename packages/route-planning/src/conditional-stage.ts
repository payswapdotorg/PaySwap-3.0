/**
 * @payswap/route-planning — the stage-7 conditional-opportunity derivation
 * (P21-C, lane C; ADR-0014 D7/D9; ROUTINE-CONTRACT stage 7 "discover
 * offers/opportunities" — the conditional growth).
 *
 * From the rail snapshots' typed exclusion facts (stages 2/3) + the
 * stage-5 hard-gate results, the derivation composes the P21
 * party-change CONDITIONAL OPPORTUNITIES through the INJECTED
 * ConditionalOpportunityConstructionPort (the REAL @payswap/opportunities
 * machinery — `discoverOpportunity` + `publishConditionalOpportunity` —
 * binds at the composition root; zero sibling imports in src, the
 * leaf-in-flight law — the pinned wire shapes live in
 * ./pins/opportunities.ts, the fail-closed validation + the grounding
 * projection in ./conditional-validation.ts). The default port FAILS
 * CLOSED with a typed PortUnboundError naming the exact stage
 * "stage-7:derive-conditional-opportunities".
 *
 * LAWS:
 * - DETERMINISTIC and FAIL-CLOSED: no exclusion facts -> NO conditionals;
 *   the party-change vocabulary is the P21 closed vocabulary and the
 *   derivation recognizes ONLY the typed P21 corridor pattern (an
 *   FLW-wallet funding method declined by a Stripe receiving rail) —
 *   never invented, never generalized to a foreign corridor.
 * - THE HONEST PLATFORM PREREQUISITE: where a party change ALONE is
 *   insufficient (an FLW receiving method needs an FLW send operation;
 *   an intermediary needs a cross-provider route shape), the platform
 *   gap is labeled DISTINCT from the party prerequisite — never
 *   conflated, never hidden.
 * - ADVISORY ONLY: `conditionalsPermitExecution()` is the literal false
 *   and every derivation carries `conditionalsPermitExecution: false` +
 *   `advisoryOnly: true` — a conditional NEVER dispatches; the only route
 *   onward is fresh planning, preview and NEW explicit authorization.
 * - The grounding evidence chain is a PROJECTION of the rail snapshots'
 *   verbatim observation grounding (instance, version, observed-at,
 *   provider, implementation + the typed exclusion facts) — the ids are
 *   derived identities naming those exact facts, never references to
 *   unobserved things (INV-07).
 */

import { PortUnboundError, RoutePlanningError } from "./errors.ts";
import { contentDigest, deepFreeze, requireObject } from "./canonical.ts";
import type { EligibleRailSnapshot } from "./rail-snapshot.ts";
import type { HardGateEvaluation } from "./hard-gates.ts";
import {
  PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE,
  PINNED_P21_CROSS_PROVIDER_SHAPE_GAP,
  PINNED_P21_FLW_SEND_OPERATION_GAP,
  PINNED_P21_FLW_WALLET_FUNDING_METHOD,
  PINNED_P21_STRIPE_PROVIDER_NAME,
} from "./pins/opportunities.ts";
import type {
  PinnedConditionalOpportunity,
  PinnedDisclosureScope,
  PinnedOfferOptIn,
  PinnedOpportunityFamily,
  PinnedOpportunityRailKind,
  PinnedPlatformPrerequisite,
  PinnedRequiredPartyChange,
  PinnedSupportingObservation,
} from "./pins/opportunities.ts";
import {
  groundedFactsOf,
  groundingObservationOf,
  validatedCorridorRail,
  validatedDisclosurePurpose,
  validatedHardGates,
  validatedInstants,
  validatedOptIn,
  validatedRecipientSnapshot,
  validatedSenderSnapshot,
  validatePortResult,
} from "./conditional-validation.ts";

/** The stage this seam serves (frozen; the unbound error names it exactly). */
export const CONDITIONAL_DERIVATION_STAGE = "stage-7:derive-conditional-opportunities" as const;

/** The construction request the derivation hands the port (the Part-1 constructor's input shape). */
export interface ConditionalConstructionRequest {
  readonly family: PinnedOpportunityFamily;
  readonly railKind: PinnedOpportunityRailKind;
  /** Canonical rail key `${namespace}:${network}` (the corridor's rail identity). */
  readonly railKey: string;
  readonly title: string;
  readonly description: string;
  readonly at: number;
  readonly optIn: PinnedOfferOptIn;
  readonly expiresAt: number;
  readonly requiredPartyChanges: readonly PinnedRequiredPartyChange[];
  readonly assumptions: readonly string[];
  readonly platformPrerequisites: readonly PinnedPlatformPrerequisite[];
  readonly groundingEvidence: readonly PinnedSupportingObservation[];
  readonly disclosureScope: PinnedDisclosureScope;
}

/** The injected stage-7 port (the REAL opportunities machinery binds at the composition root). */
export interface ConditionalOpportunityConstructionPort {
  construct(request: ConditionalConstructionRequest): PinnedConditionalOpportunity;
}

/** One grounded exclusion fact (the verbatim typed corridor exclusion the derivation consumed). */
export interface GroundedExclusionFact {
  readonly side: "SENDER" | "RECIPIENT";
  readonly routeId: string;
  readonly code: string;
  readonly message: string;
  readonly fundingMethod?: string;
}

/** The derivation input: both snapshots + the stage-5 results + the port + the caller-supplied semantics. */
export interface ConditionalDerivationInput {
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  readonly hardGates: HardGateEvaluation;
  readonly port: ConditionalOpportunityConstructionPort;
  /** The corridor's rail identity (caller-supplied corridor facts). */
  readonly corridorRail: { readonly railKind: PinnedOpportunityRailKind; readonly railKey: string };
  readonly optIn: PinnedOfferOptIn;
  readonly at: number;
  readonly expiresAt: number;
  readonly disclosurePurpose: string;
}

/** The stage-7 derivation output (ADVISORY — the additive panel contract). */
export interface ConditionalOpportunityDerivation {
  readonly stage: typeof CONDITIONAL_DERIVATION_STAGE;
  readonly derivedAt: number;
  readonly corridorFundingMethod: string;
  readonly groundedFacts: readonly GroundedExclusionFact[];
  readonly conditionalOpportunities: readonly PinnedConditionalOpportunity[];
  readonly senderSnapshotDigest: string;
  readonly recipientSnapshotDigest: string;
  readonly hardGateDigest: string;
  readonly derivationDigest: string;
  readonly advisoryOnly: true;
  readonly conditionalsPermitExecution: false;
}

/** A stage-7 derivation input or port result violated the laws. */
export class ConditionalDerivationError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "CONDITIONAL_DERIVATION_FAILED", details);
    this.name = "ConditionalDerivationError";
  }
}

/** THE ADVISORY LAW: the derivation NEVER permits execution — the literal false. */
export function conditionalsPermitExecution(): false {
  return false;
}

/** The UNBOUND stage-7 port (fail closed): every call throws naming the exact stage. */
export function unboundConditionalOpportunityPort(): ConditionalOpportunityConstructionPort {
  return {
    construct(request: ConditionalConstructionRequest): PinnedConditionalOpportunity {
      void request;
      throw new PortUnboundError(
        "the conditional-opportunity construction engine is not bound — bind a real ConditionalOpportunityConstructionPort at the composition root (ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated conditionals)",
        { stage: CONDITIONAL_DERIVATION_STAGE },
      );
    },
  };
}

/** Require an injected conditional-construction port (fail closed on a missing binding). */
export function requireConditionalOpportunityPort(candidate: unknown): ConditionalOpportunityConstructionPort {
  if (candidate === null || typeof candidate !== "object" || typeof (candidate as ConditionalOpportunityConstructionPort).construct !== "function") {
    throw new PortUnboundError(
      "a ConditionalOpportunityConstructionPort must be injected (an object implementing construct) — the derivation never fabricates conditional opportunities",
      { stage: CONDITIONAL_DERIVATION_STAGE },
    );
  }
  return candidate as ConditionalOpportunityConstructionPort;
}

/**
 * THE stage-7 derivation (deterministic, fail-closed, advisory only):
 * recognizes the typed P21 corridor pattern over the snapshots' verbatim
 * exclusion facts and composes the party-change conditionals through the
 * injected port. No exclusion facts -> NO conditionals; a foreign funding
 * method never derives the FLW/Stripe party changes; the honest no-route
 * state (rails observed on both sides, nothing eligible, nothing
 * rank-eligible at stage 5) derives the intermediary conditional with the
 * cross-provider platform-gap note.
 */
export function deriveConditionalOpportunities(input: ConditionalDerivationInput): ConditionalOpportunityDerivation {
  const request = requireObject(input, "the conditional derivation request");
  const port = requireConditionalOpportunityPort(request["port"]);
  const sender = validatedSenderSnapshot(input);
  const recipient = validatedRecipientSnapshot(input, sender);
  const { at, expiresAt } = validatedInstants(input);
  const optIn = validatedOptIn(input, at);
  const disclosurePurpose = validatedDisclosurePurpose(input);
  const corridorRail = validatedCorridorRail(input);
  const hardGates = validatedHardGates(input);

  // The grounded facts: the corridor's VERBATIM typed exclusions, both sides, canonical order.
  const groundedFacts = Object.freeze([...groundedFactsOf("SENDER", sender), ...groundedFactsOf("RECIPIENT", recipient)]);
  const corridorFundingMethod = typeof recipient.query.fundingMethod === "string" ? recipient.query.fundingMethod : "";

  // The typed P21 pattern: an FLW-wallet funding method declined by the receiving side.
  const p21FundingFacts = groundedFacts.filter(
    (fact) =>
      fact.side === "RECIPIENT" &&
      fact.code === PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE &&
      fact.fundingMethod === PINNED_P21_FLW_WALLET_FUNDING_METHOD &&
      fact.fundingMethod === corridorFundingMethod,
  );
  const stripeReceiving = recipient.rails.some((rail) => rail.lineage.providerName === PINNED_P21_STRIPE_PROVIDER_NAME);
  // The honest no-route state: rails observed on both sides, nothing eligible anywhere.
  const noRoute =
    sender.rails.length > 0 &&
    recipient.rails.length > 0 &&
    sender.eligibleRouteIds.length === 0 &&
    recipient.eligibleRouteIds.length === 0 &&
    hardGates.rankEligible.length === 0;

  // The grounding evidence chain: every excluded rail record, sender side first, canonical order.
  const byRouteId = (a: { routeId: string }, b: { routeId: string }) => (a.routeId < b.routeId ? -1 : 1);
  const evidence = Object.freeze([
    ...[...sender.rails].filter((rail) => rail.exclusions.length > 0).sort(byRouteId).map((rail) => groundingObservationOf("SENDER", rail)),
    ...[...recipient.rails].filter((rail) => rail.exclusions.length > 0).sort(byRouteId).map((rail) => groundingObservationOf("RECIPIENT", rail)),
  ]);
  const disclosureScope = deepFreeze({
    fields: Object.freeze(["conditional_id", "required_party_changes", "assumptions", "platform_prerequisites"]),
    purpose: disclosurePurpose,
  });
  const railKind = corridorRail.railKind;
  const railKey = corridorRail.railKey;
  const requests: ConditionalConstructionRequest[] = [];
  if (p21FundingFacts.length > 0) {
    const fundingMessage = p21FundingFacts.map((fact) => fact.message).join("; ");
    const base = { family: "other" as PinnedOpportunityFamily, railKind, railKey, at, optIn, expiresAt, groundingEvidence: evidence, disclosureScope };
    requests.push(
      {
        ...base,
        title: "the recipient enables an eligible Flutterwave receiving method",
        description: `the corridor does not compose today: ${fundingMessage} — the conditional route exists only when the recipient enables a Flutterwave receiving method that serves this funding method`,
        requiredPartyChanges: [{ party: "RECIPIENT", change: "ENABLES_FLUTTERWAVE_RECEIVING_METHOD" }],
        assumptions: [
          "the recipient enables a Flutterwave receiving method that serves this corridor's funding method",
          "the sender's Flutterwave connection remains an eligible funding rail for the corridor",
        ],
        platformPrerequisites: [
          {
            gapId: PINNED_P21_FLW_SEND_OPERATION_GAP,
            note: "an FLW receiving method makes the corridor real only when a Flutterwave send operation exists in the capability model — the platform gap, distinct from the party prerequisite (P21 implements no FLW send; ADR-0014 D7)",
          },
        ],
      },
    );
    if (stripeReceiving) {
      requests.push({
        ...base,
        title: "the sender adds a genuinely supported Stripe-compatible payment instrument",
        description: `the corridor does not compose today: ${fundingMessage} — the conditional route exists only when the sender funds it with an instrument the receiving rail's restriction sets genuinely serve`,
        requiredPartyChanges: [{ party: "SENDER", change: "ADDS_STRIPE_COMPATIBLE_INSTRUMENT" }],
        assumptions: [
          "the sender adds a payment instrument the receiving rail's restriction sets genuinely serve (a Stripe-compatible funding method)",
          "the receiving rail's restriction sets continue to serve the corridor's destination and payout dimensions",
        ],
        platformPrerequisites: [],
      });
    }
  }
  if (noRoute) {
    requests.push({
      family: "other",
      railKind,
      railKey,
      title: "a verified intermediary is introduced",
      description: "no route composes across the corridor's two sides — the conditional route exists only when a verified intermediary bridges the sender's funding rail and the merchant's receiving context",
      at,
      optIn,
      expiresAt,
      requiredPartyChanges: [{ party: "THIRD_PARTY", change: "INTERMEDIARY_INTRODUCED" }],
      assumptions: [
        "a verified intermediary is introduced whose rails bridge the sender's funding rail and the merchant's receiving context",
        "the intermediary's participation is evidenced (a connected instance with observations), never assumed",
      ],
      platformPrerequisites: [
        {
          gapId: PINNED_P21_CROSS_PROVIDER_SHAPE_GAP,
          note: "a verified intermediary makes the corridor real only when a frozen route shape composes the cross-provider pair — a governance-level vocabulary change, never manufactured this wave (ADR-0014 D7)",
        },
      ],
      groundingEvidence: evidence,
      disclosureScope,
    });
  }

  const seen = new Set<string>();
  const conditionalOpportunities = Object.freeze(requests.map((construction) => validatePortResult(port.construct(construction), construction, seen)));
  const derivationDigest = contentDigest({
    stage: CONDITIONAL_DERIVATION_STAGE,
    derivedAt: at,
    corridorFundingMethod,
    groundedFacts,
    conditionalOpportunities: conditionalOpportunities.map((conditional) => conditional.conditionalId),
    senderSnapshotDigest: sender.snapshotDigest,
    recipientSnapshotDigest: recipient.snapshotDigest,
    hardGateDigest: hardGates.hardGateDigest,
    conditionalsPermitExecution: false,
  });
  return deepFreeze({
    stage: CONDITIONAL_DERIVATION_STAGE,
    derivedAt: at,
    corridorFundingMethod,
    groundedFacts,
    conditionalOpportunities,
    senderSnapshotDigest: sender.snapshotDigest,
    recipientSnapshotDigest: recipient.snapshotDigest,
    hardGateDigest: hardGates.hardGateDigest,
    derivationDigest,
    advisoryOnly: true,
    conditionalsPermitExecution: false,
  });
}
