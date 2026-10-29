/**
 * @payswap/route-planning — the stage-7 GENERAL exclusion→repair derivation
 * (P23-C, lane C; ADR-0015 D3 — the general-purpose opportunity-emergence
 * engine over ALL grounded exclusion facts).
 *
 * From the rail snapshots' VERBATIM typed exclusion facts (both sides,
 * canonical order — the conditional-validation grounding projection) + the
 * stage-5 hard-gate results, the derivation consults the INJECTED
 * `RepairOperatorCataloguePort` (the REAL @payswap/opportunities
 * repair-operator catalogue binds at the composition root; zero sibling
 * imports in src — the pinned shapes live in ./pins/repairs.ts, frozen
 * verbatim from the amended ADR-0015 appendix) and composes the TYPED
 * REPAIR SET: conditional-construction requests (party changes), explicit
 * platform-work derivations (D4) and multi-hop hypothesis requests (D5),
 * each grounded in the verbatim facts. The default port FAILS CLOSED with
 * a typed PortUnboundError naming the exact stage
 * "stage-7:derive-exclusion-repairs". The fail-closed row validation, the
 * corridor-state projection and the construction builders live in
 * ./exclusion-validation.ts (the 400-line file-law split).
 *
 * LAWS:
 * - DETERMINISTIC and FAIL-CLOSED: no exclusion facts -> NO repairs; an
 *   exclusion code with no registered operator derives NOTHING (the honest
 *   empty set, never a guess); unknown vocabulary -> the typed error; a
 *   lying catalogue (an operator that does not answer the queried code)
 *   never composes.
 * - THE MOST-SPECIFIC-APPLICABLE-OPERATOR RULE (ADR-0015 D2): when a
 *   corridor-fact group emits an operator, the less-specific operators it
 *   shadows (the catalogue's `shadowedBy` data) are SUPPRESSED for those
 *   facts — over the FLW→Stripe corridor the P21-specific operators shadow
 *   the general funding operators, so the conditionalRequests are EXACTLY
 *   the P21 three (byte-identical under the one canonical flavor).
 * - The no-route-state operators (A.3's "the honest no-route state" rows)
 *   are consulted through the pinned NO_ROUTE_STATE corridor-state key —
 *   a grounded corridor STATE, never an exclusion code; the key is queried
 *   only when the corridor IS in that state.
 * - ADVISORY ONLY: `repairsPermitExecution()` is the literal false and
 *   every derivation carries `repairsPermitExecution: false` +
 *   `advisoryOnly: true` — a repair NEVER dispatches; the only route
 *   onward is fresh planning, preview and NEW explicit authorization.
 */

import { PortUnboundError, RoutePlanningError } from "./errors.ts";
import { contentDigest, deepFreeze, requireObject, sortedBy } from "./canonical.ts";
import type { EligibleRailSnapshot } from "./rail-snapshot.ts";
import type { HardGateEvaluation } from "./hard-gates.ts";
import type { PinnedOfferOptIn, PinnedOpportunityRailKind } from "./pins/opportunities.ts";
import { PINNED_NO_ROUTE_STATE_KEY, PINNED_NON_OPERATOR_CLASSIFICATIONS } from "./pins/repairs.ts";
import type {
  PinnedGroundedFactRef,
  PinnedHypothesisRequest,
  PinnedNonOperatorClassification,
  PinnedPlatformWorkRequest,
  PinnedRepairOperator,
  PinnedRepairOperatorKind,
} from "./pins/repairs.ts";
import type {
  ConditionalConstructionRequest,
  ConditionalDerivationInput,
  GroundedExclusionFact,
} from "./conditional-stage.ts";
import {
  groundedFactsOf,
  validatedCorridorRail,
  validatedDisclosurePurpose,
  validatedHardGates,
  validatedInstants,
  validatedOptIn,
  validatedRecipientSnapshot,
  validatedSenderSnapshot,
} from "./conditional-validation.ts";
import {
  buildConditionalRequest,
  buildHypothesisRequest,
  corridorConditionsHold,
  corridorStateOf,
  disclosureScopeOf,
  factMatchesP21Pattern,
  groundingEvidenceChainOf,
  validatedNonOperatorClassification,
  validatedRepairOperator,
  type CorridorState,
  type RepairConstructionContext,
} from "./exclusion-validation.ts";

/** The stage this seam serves (frozen; the unbound error names it exactly). */
export const EXCLUSION_REPAIR_STAGE = "stage-7:derive-exclusion-repairs" as const;

/**
 * The injected catalogue port (the REAL @payswap/opportunities repair
 * operator catalogue binds at the composition root): the operators that
 * answer one exclusion code (or the pinned NO_ROUTE_STATE corridor-state
 * key), and the honest non-operator classification for a code with no
 * repair operators (null — no non-operator row). A code with no registered
 * operator and no classification row derives NOTHING.
 */
export interface RepairOperatorCataloguePort {
  operatorsFor(code: string): readonly PinnedRepairOperator[];
  classificationOf(code: string): PinnedNonOperatorClassification | null;
}

/** The general derivation input: the same shapes the conditional stage consumes + the catalogue. */
export interface ExclusionRepairDerivationInput {
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  readonly hardGates: HardGateEvaluation;
  readonly catalogue: RepairOperatorCataloguePort;
  /** The corridor's rail identity (caller-supplied corridor facts). */
  readonly corridorRail: { readonly railKind: PinnedOpportunityRailKind; readonly railKey: string };
  readonly optIn: PinnedOfferOptIn;
  readonly at: number;
  readonly expiresAt: number;
  readonly disclosurePurpose: string;
}

/** One honest non-repair classification row (recheck / wait / intake / revise), citing its facts. */
export interface NonRepairClassificationRow {
  readonly code: string;
  readonly classification: (typeof PINNED_NON_OPERATOR_CLASSIFICATIONS)[number];
  readonly reason: string;
  readonly evidenceBasis: readonly PinnedGroundedFactRef[];
}

/** One emitted operator (the honest disclosure of what the derivation applied). */
export interface AppliedOperator {
  readonly operatorId: string;
  readonly kind: PinnedRepairOperatorKind;
}

/** One suppressed operator + the more-specific operators that shadowed it (never a silent drop). */
export interface SuppressedOperator {
  readonly operatorId: string;
  readonly shadowedBy: readonly string[];
}

/** The stage-7 general derivation output (ADVISORY — the typed repair set). */
export interface ExclusionRepairDerivation {
  readonly stage: typeof EXCLUSION_REPAIR_STAGE;
  readonly derivedAt: number;
  readonly corridorFundingMethod: string;
  readonly corridor: { readonly sourceCurrency: string; readonly destinationCurrency: string };
  readonly groundedFacts: readonly GroundedExclusionFact[];
  readonly conditionalRequests: readonly ConditionalConstructionRequest[];
  readonly platformWorkRequests: readonly PinnedPlatformWorkRequest[];
  readonly hypothesisRequests: readonly PinnedHypothesisRequest[];
  readonly nonRepairClassifications: readonly NonRepairClassificationRow[];
  readonly appliedOperators: readonly AppliedOperator[];
  readonly suppressedOperators: readonly SuppressedOperator[];
  readonly senderSnapshotDigest: string;
  readonly recipientSnapshotDigest: string;
  readonly hardGateDigest: string;
  readonly repairDigest: string;
  readonly advisoryOnly: true;
  readonly repairsPermitExecution: false;
}

/** A general derivation input or catalogue result violated the laws. */
export class ExclusionRepairError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "EXCLUSION_REPAIR_FAILED", details);
    this.name = "ExclusionRepairError";
  }
}

/** THE ADVISORY LAW: the repair set NEVER permits execution — the literal false. */
export function repairsPermitExecution(): false {
  return false;
}

/** The UNBOUND catalogue port (fail closed): every call throws naming the exact stage. */
export function unboundRepairOperatorCatalogue(): RepairOperatorCataloguePort {
  const unbound = (method: string): never => {
    throw new PortUnboundError(
      `the repair-operator catalogue is not bound (${method}) — bind a real RepairOperatorCataloguePort at the composition root (ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated repairs)`,
      { stage: EXCLUSION_REPAIR_STAGE },
    );
  };
  return {
    operatorsFor(code: string): readonly PinnedRepairOperator[] {
      void code;
      return unbound("operatorsFor");
    },
    classificationOf(code: string): PinnedNonOperatorClassification | null {
      void code;
      return unbound("classificationOf");
    },
  };
}

/** Require an injected catalogue port (fail closed on a missing binding). */
export function requireRepairOperatorCatalogue(candidate: unknown): RepairOperatorCataloguePort {
  if (
    candidate === null || typeof candidate !== "object" ||
    typeof (candidate as RepairOperatorCataloguePort).operatorsFor !== "function" ||
    typeof (candidate as RepairOperatorCataloguePort).classificationOf !== "function"
  ) {
    throw new PortUnboundError(
      "a RepairOperatorCataloguePort must be injected (an object implementing operatorsFor + classificationOf) — the derivation never fabricates repair operators",
      { stage: EXCLUSION_REPAIR_STAGE },
    );
  }
  return candidate as RepairOperatorCataloguePort;
}

/**
 * THE stage-7 GENERAL derivation (deterministic, fail-closed, advisory
 * only): consumes ALL grounded exclusion facts through the injected
 * catalogue, applies the most-specific-operator rule, and composes the
 * typed repair set — conditional construction requests, platform-work
 * derivations and multi-hop hypothesis requests — each grounded in the
 * verbatim facts, plus the honest non-operator classification rows for the
 * codes that are honestly not repairs. Deterministic ordering everywhere:
 * the discovery groups follow the facts' canonical order (the no-route
 * state group LAST), the operators within a group sort by operator id, and
 * the platform work items sort by gap id.
 */
export function deriveExclusionRepairs(input: ExclusionRepairDerivationInput): ExclusionRepairDerivation {
  const request = requireObject(input, "the exclusion-repair derivation request");
  const catalogue = requireRepairOperatorCatalogue(request["catalogue"]);
  // The stage-7 validators read exactly the shared field set (this input is
  // the conditional derivation's shape with the catalogue port in place of
  // the construction port) — the narrow cast never widens a law.
  const conditionalShaped = input as unknown as ConditionalDerivationInput;
  const sender = validatedSenderSnapshot(conditionalShaped);
  const recipient = validatedRecipientSnapshot(conditionalShaped, sender);
  const { at, expiresAt } = validatedInstants(conditionalShaped);
  const optIn = validatedOptIn(conditionalShaped, at);
  const disclosurePurpose = validatedDisclosurePurpose(conditionalShaped);
  const corridorRail = validatedCorridorRail(conditionalShaped);
  const hardGates = validatedHardGates(conditionalShaped);

  const groundedFacts = Object.freeze([...groundedFactsOf("SENDER", sender), ...groundedFactsOf("RECIPIENT", recipient)]);
  const corridorFundingMethod = typeof recipient.query.fundingMethod === "string" ? recipient.query.fundingMethod : "";
  const state: CorridorState = corridorStateOf(sender, recipient, hardGates, corridorFundingMethod);
  const context: RepairConstructionContext = {
    corridorRail,
    corridor: { sourceCurrency: recipient.query.sourceCurrency, destinationCurrency: recipient.query.destinationCurrency },
    at,
    optIn,
    expiresAt,
    evidence: groundingEvidenceChainOf(sender, recipient),
    disclosureScope: disclosureScopeOf(disclosurePurpose),
  };

  // The discovery groups: one per DISTINCT grounded exclusion code (the
  // facts' canonical order), then — iff the corridor IS in the honest
  // no-route state — the pinned state key group (citing the whole corridor).
  const groupKeys: string[] = [];
  const groupsByCode = new Map<string, GroundedExclusionFact[]>();
  for (const fact of groundedFacts) {
    const existing = groupsByCode.get(fact.code);
    if (existing === undefined) {
      groupKeys.push(fact.code);
      groupsByCode.set(fact.code, [fact]);
    } else {
      existing.push(fact);
    }
  }

  const conditionalRequests: ConditionalConstructionRequest[] = [];
  const hypothesisRequests: PinnedHypothesisRequest[] = [];
  const nonRepairRows: NonRepairClassificationRow[] = [];
  const appliedOperators: AppliedOperator[] = [];
  const suppressedOperators: SuppressedOperator[] = [];
  const platformByGapId = new Map<string, { title: string; operatorIds: Set<string>; facts: PinnedGroundedFactRef[] }>();
  const emittedAcrossGroups = new Set<string>();

  const consumeGroup = (key: string, facts: readonly GroundedExclusionFact[], isStateKey: boolean): void => {
    const operators = catalogue.operatorsFor(key).map(validatedRepairOperator);
    if (operators.length === 0) {
      if (isStateKey) return;
      const classification = catalogue.classificationOf(key);
      if (classification !== null) {
        validatedNonOperatorClassification(classification, key);
        nonRepairRows.push(
          deepFreeze({
            code: key,
            classification: (classification as PinnedNonOperatorClassification).classification,
            reason: (classification as PinnedNonOperatorClassification).reason,
            evidenceBasis: Object.freeze([...facts]),
          }),
        );
      }
      return;
    }
    const byOperatorId = (a: PinnedRepairOperator, b: PinnedRepairOperator) => (a.operatorId < b.operatorId ? -1 : 1);
    const applicable = [...operators].sort(byOperatorId).filter((operator) => {
      if (!isStateKey && !(operator.applicableExclusionCodes as readonly string[]).includes(key)) {
        throw new ExclusionRepairError(
          `the catalogue returned operator '${operator.operatorId}' for code '${key}' which the operator does not answer — a lying catalogue never composes`,
          { operatorId: operator.operatorId, code: key },
        );
      }
      return corridorConditionsHold(operator, state);
    });
    const applicableIds = new Set(applicable.map((operator) => operator.operatorId));
    for (const operator of applicable) {
      if (emittedAcrossGroups.has(operator.operatorId)) continue;
      const applicableFacts = (operator.sideConditions ?? []).some((condition) => condition.kind === "P21_FLW_WALLET_FUNDING_PATTERN")
        ? facts.filter((fact) => factMatchesP21Pattern(fact, state))
        : [...facts];
      if (applicableFacts.length === 0) continue;
      const shadows = (operator.shadowedBy ?? []).filter((id) => applicableIds.has(id));
      if (shadows.length > 0) {
        suppressedOperators.push(deepFreeze({ operatorId: operator.operatorId, shadowedBy: Object.freeze(shadows) }));
        continue;
      }
      emittedAcrossGroups.add(operator.operatorId);
      appliedOperators.push(deepFreeze({ operatorId: operator.operatorId, kind: operator.kind }));
      if (operator.partyChangeProposal !== undefined) {
        conditionalRequests.push(buildConditionalRequest(operator, applicableFacts, context));
      }
      const platformWork = operator.platformWorkProposal;
      if (platformWork !== undefined) {
        const entry = platformByGapId.get(platformWork.gapId) ?? { title: platformWork.title, operatorIds: new Set<string>(), facts: [] as PinnedGroundedFactRef[] };
        entry.operatorIds.add(operator.operatorId);
        for (const fact of applicableFacts) {
          if (!entry.facts.some((other) => other.side === fact.side && other.routeId === fact.routeId && other.code === fact.code)) {
            entry.facts.push(fact);
          }
        }
        platformByGapId.set(platformWork.gapId, entry);
      }
      if (operator.hypothesisProposal !== undefined) {
        hypothesisRequests.push(buildHypothesisRequest(operator, applicableFacts, context));
      }
    }
  };

  for (const key of groupKeys) {
    consumeGroup(key, Object.freeze(groupsByCode.get(key) ?? []), false);
  }
  if (state.noRoute) {
    consumeGroup(PINNED_NO_ROUTE_STATE_KEY, groundedFacts, true);
  }

  const platformWorkRequests: PinnedPlatformWorkRequest[] = sortedBy([...platformByGapId.entries()], ([gapId]) => gapId).map(([gapId, entry]) =>
    deepFreeze({
      workItemId: `platform-work:${gapId}`,
      gapId,
      title: entry.title,
      requiredByOperatorIds: Object.freeze(sortedBy([...entry.operatorIds], (id) => id)),
      evidenceBasis: Object.freeze(entry.facts),
      status: "OPEN",
      advisoryOnly: true,
    }),
  );

  const repairDigest = contentDigest({
    stage: EXCLUSION_REPAIR_STAGE,
    derivedAt: at,
    groundedFacts,
    conditionalRequests: conditionalRequests.map((conditionalRequest) => conditionalRequest.title),
    platformWorkRequests: platformWorkRequests.map((work) => work.workItemId),
    hypothesisRequests: hypothesisRequests.map((hypothesis) => hypothesis.operatorId),
    nonRepairClassifications: nonRepairRows.map((row) => ({ code: row.code, classification: row.classification })),
    appliedOperators: appliedOperators.map((applied) => applied.operatorId),
    suppressedOperators,
    senderSnapshotDigest: sender.snapshotDigest,
    recipientSnapshotDigest: recipient.snapshotDigest,
    hardGateDigest: hardGates.hardGateDigest,
    repairsPermitExecution: false,
  });
  return deepFreeze({
    stage: EXCLUSION_REPAIR_STAGE,
    derivedAt: at,
    corridorFundingMethod,
    corridor: deepFreeze({ sourceCurrency: recipient.query.sourceCurrency, destinationCurrency: recipient.query.destinationCurrency }),
    groundedFacts,
    conditionalRequests: Object.freeze(conditionalRequests),
    platformWorkRequests: Object.freeze(platformWorkRequests),
    hypothesisRequests: Object.freeze(hypothesisRequests),
    nonRepairClassifications: Object.freeze(nonRepairRows),
    appliedOperators: Object.freeze(appliedOperators),
    suppressedOperators: Object.freeze(suppressedOperators),
    senderSnapshotDigest: sender.snapshotDigest,
    recipientSnapshotDigest: recipient.snapshotDigest,
    hardGateDigest: hardGates.hardGateDigest,
    repairDigest,
    advisoryOnly: true,
    repairsPermitExecution: false,
  });
}
