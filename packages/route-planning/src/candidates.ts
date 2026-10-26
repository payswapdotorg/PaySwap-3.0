/**
 * @payswap/route-planning — candidate enumeration (P16-A;
 * ROUTINE-CONTRACT stage 4).
 *
 * Composes the REAL compiler through the injected RouteCompilationPort:
 * builds the pinned compiler input from the intent + the two per-side
 * rail snapshots (+ the caller-injected evidence adapters — venues,
 * security gate evaluator, conversion rules, payout constraints,
 * settlement destinations, merchant evidence, liquidity estimates,
 * location observations, routing hints — all carried VERBATIM, never
 * interpreted), then returns the budgeted candidate set with the
 * compiler's ExcludedRouteShape list preserved verbatim and the
 * observation version pins carried. The enumeration itself is bounded by
 * the count-based search budget (search-budget.ts, ADR-0009 D6). The
 * merged corridor view unions the two snapshots' route evaluations
 * (deduplicated by routeId, canonically ordered); both side queries must
 * equal the movement corridor query (fail-closed — a side snapshot
 * grounded on a different corridor never composes).
 *
 * THE DISCOVERY LAW: route planning NEVER permits execution —
 * `routePlanningPermitsExecution()` is the literal false (the compiler's
 * own discovery-tier law, re-declared at this tier).
 */

import { CandidateEnumerationError } from "./errors.ts";
import { contentDigest, deepFreeze, dedupeByKey, sortedBy } from "./canonical.ts";
import type { MoneyMovementIntentPin, PaymentIntentPin } from "./pins/economic.ts";
import { hasPinnedIntentKeySet, hasPinnedPaymentIntentKeySet } from "./pins/economic.ts";
import type { PinnedCorridorRouteEvaluation, PinnedCorridorView } from "./pins/capability.ts";
import { PINNED_CORRIDOR_PROJECTION_VERSION } from "./pins/capability.ts";
import type {
  PinnedExcludedRouteShape,
  PinnedObservationVersionPin,
  PinnedRouteCompilationResult,
  PinnedRoutePlan,
  RouteCompilerInputPin,
} from "./pins/route-compiler.ts";
import { requireRouteCompilationPort, type RouteCompilationPort } from "./ports.ts";
import type { EligibleRailSnapshot } from "./rail-snapshot.ts";
import {
  admitRouteCandidatesWithinBudget,
  validateRouteSearchBudget,
  type BudgetedRouteCandidateSelection,
  type RouteSearchBudget,
} from "./search-budget.ts";

/** The caller-injected evidence bundle (all adapters carried verbatim). */
export type RouteCompilerEvidenceBundle = Omit<
  RouteCompilerInputPin,
  "intent" | "at" | "corridorView"
>;

/** The enumeration input: intent + both snapshots + evidence + budget + port. */
export interface RouteCandidateEnumerationInput {
  /** The validated movement intent, or the payment intent (commerceRef stripped). */
  readonly intent: MoneyMovementIntentPin | PaymentIntentPin;
  /** Deterministic compile instant (ms, caller-supplied; no ambient clock). */
  readonly at: number;
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  /** The movement corridor query both side snapshots were grounded on. */
  readonly corridorQuery: PinnedCorridorView["query"];
  readonly evidence: RouteCompilerEvidenceBundle;
  readonly budget: RouteSearchBudget;
  readonly compilationPort: RouteCompilationPort;
}

/** The bounded candidate enumeration (the stage-4 output contract). */
export interface RouteCandidateEnumeration {
  readonly intentRef: string;
  readonly compiledAt: number;
  /** The compiler's own status, preserved verbatim. */
  readonly compilerStatus: "ROUTES_COMPILED" | "NO_COMPILABLE_ROUTE";
  /** The budgeted candidate plans, canonically ordered by planId. */
  readonly candidates: readonly PinnedRoutePlan[];
  /** The compiler's ExcludedRouteShape list, preserved VERBATIM. */
  readonly exclusions: readonly PinnedExcludedRouteShape[];
  /** The exact observation versions the compilation decided on (carried). */
  readonly observationVersionPins: readonly PinnedObservationVersionPin[];
  /** The per-side snapshot digests the enumeration composed from. */
  readonly senderSnapshotDigest: string;
  readonly recipientSnapshotDigest: string;
  readonly budgetedSelection: BudgetedRouteCandidateSelection;
  /** The compiler's own digest, preserved verbatim. */
  readonly compilationDigest: string;
  /** Digest over the enumeration projection (budget + selection + pins). */
  readonly enumerationDigest: string;
  /** LITERAL: candidate enumeration never permits execution. */
  readonly discoveryPermitsExecution: false;
}

/**
 * THE DISCOVERY LAW (first-class predicate): route planning never
 * permits execution — the literal false, never a derived value.
 */
export function routePlanningPermitsExecution(): false {
  return false;
}

/**
 * The movement view of an intent: a payment intent (the 11-key commerce
 * specialization) projects onto the 10-key movement shape by stripping
 * the opaque commerceRef lineage field (a pure copy — the authority's
 * own asMoneyMovementIntent law); a movement intent passes through.
 * Anything else fails closed.
 */
export function movementViewOfIntent(
  intent: MoneyMovementIntentPin | PaymentIntentPin,
): MoneyMovementIntentPin {
  if (hasPinnedPaymentIntentKeySet(intent)) {
    const movement: Record<string, unknown> = { ...intent };
    delete movement["commerceRef"];
    return deepFreeze(movement) as unknown as MoneyMovementIntentPin;
  }
  if (hasPinnedIntentKeySet(intent)) {
    return intent;
  }
  throw new CandidateEnumerationError(
    "the intent must carry exactly the pinned 10-key movement shape or the pinned 11-key payment shape — prose or a malformed record never constructs a route enumeration",
  );
}

function requireMovementCorridorQueries(input: RouteCandidateEnumerationInput): void {
  const expected = input.corridorQuery;
  for (const side of [
    { name: "sender", snapshot: input.senderSnapshot },
    { name: "recipient", snapshot: input.recipientSnapshot },
  ] as const) {
    const query = side.snapshot.query;
    const matches =
      query.sourceCountry === expected.sourceCountry &&
      query.destinationCountry === expected.destinationCountry &&
      query.sourceCurrency === expected.sourceCurrency &&
      query.destinationCurrency === expected.destinationCurrency &&
      query.asOf === expected.asOf;
    if (!matches) {
      throw new CandidateEnumerationError(
        `the ${side.name} snapshot was grounded on a different corridor query than the movement corridor — a side snapshot never composes onto a foreign corridor`,
        { side: side.name },
      );
    }
  }
}

/**
 * The merged corridor view the compiler consumes: the UNION of both
 * snapshots' route evaluations, deduplicated by routeId and canonically
 * ordered (the input-order law — identical snapshot pairs produce
 * byte-identical views regardless of side ordering).
 */
export function mergedCorridorView(
  sender: EligibleRailSnapshot,
  recipient: EligibleRailSnapshot,
  query: PinnedCorridorView["query"],
): PinnedCorridorView {
  const evaluations: readonly PinnedCorridorRouteEvaluation[] = [
    ...sender.rails.map((rail) => rail.evaluation),
    ...recipient.rails.map((rail) => rail.evaluation),
  ];
  const routes = sortedBy(dedupeByKey(evaluations, (route) => route.routeId), (route) => route.routeId);
  return deepFreeze({
    projectionVersion: PINNED_CORRIDOR_PROJECTION_VERSION,
    query,
    routes,
    eligibleRoutes: Object.freeze(routes.filter((route) => route.eligible)),
  });
}

/**
 * Enumerate route candidates: compose the REAL compiler through the
 * injected port over the merged corridor view, then admit the compiled
 * plans under the count-based search budget (greedy canonical-order
 * admission with TRUE-count truncation receipts — ADR-0009 D6). Plans
 * excluded by the budget are disclosed by the receipts (never silently
 * dropped); the compiler's per-shape exclusions are preserved verbatim.
 */
export function enumerateRouteCandidates(
  input: RouteCandidateEnumerationInput,
): RouteCandidateEnumeration {
  const intent = movementViewOfIntent(input.intent);
  if (typeof input.at !== "number" || !Number.isSafeInteger(input.at) || input.at < 0) {
    throw new CandidateEnumerationError(
      "the compile instant must be a non-negative integer millisecond instant (caller-supplied, no ambient clock)",
    );
  }
  requireMovementCorridorQueries(input);
  const budget = validateRouteSearchBudget(input.budget);
  const compilationPort = requireRouteCompilationPort(input.compilationPort);
  if (input.senderSnapshot.side !== "SENDER" || input.recipientSnapshot.side !== "RECIPIENT") {
    throw new CandidateEnumerationError(
      "the enumeration requires the SENDER snapshot first and the RECIPIENT snapshot second",
    );
  }

  const compilerInput: RouteCompilerInputPin = deepFreeze({
    intent,
    at: input.at,
    corridorView: mergedCorridorView(
      input.senderSnapshot,
      input.recipientSnapshot,
      input.corridorQuery,
    ),
    venues: input.evidence.venues,
    onchain: input.evidence.onchain,
    locationObservations: input.evidence.locationObservations,
    assetObservations: input.evidence.assetObservations,
    conversionRules: input.evidence.conversionRules,
    payoutConstraints: input.evidence.payoutConstraints,
    settlementDestinations: input.evidence.settlementDestinations,
    merchantEligibility: input.evidence.merchantEligibility,
    liquidityEstimates: input.evidence.liquidityEstimates,
    ...(input.evidence.routingHints !== undefined
      ? { routingHints: input.evidence.routingHints }
      : {}),
    scoringPolicy: input.evidence.scoringPolicy,
  });
  const compilation: PinnedRouteCompilationResult = compilationPort.compile(compilerInput);

  const budgetedSelection = admitRouteCandidatesWithinBudget({
    budget,
    candidates: compilation.plans.map((plan) => ({ planId: plan.planId, shapeId: plan.shapeId })),
  });
  const admittedIds = new Set(budgetedSelection.admitted.map((record) => record.planId));
  const candidates = compilation.plans.filter((plan) => admittedIds.has(plan.planId));
  const enumerationDigest = contentDigest({
    intentRef: intent.intentId,
    compiledAt: input.at,
    senderSnapshotDigest: input.senderSnapshot.snapshotDigest,
    recipientSnapshotDigest: input.recipientSnapshot.snapshotDigest,
    compilationDigest: compilation.compilationDigest,
    budgetedSelection: {
      admitted: budgetedSelection.admitted.map((record) => record.planId),
      receipts: budgetedSelection.receipts,
      coverage: budgetedSelection.coverage,
    },
    observationVersionPins: compilation.observationVersionPins,
    discoveryPermitsExecution: false,
  });
  return deepFreeze({
    intentRef: intent.intentId,
    compiledAt: input.at,
    compilerStatus: compilation.status,
    candidates: Object.freeze(candidates),
    exclusions: compilation.exclusions,
    observationVersionPins: compilation.observationVersionPins,
    senderSnapshotDigest: input.senderSnapshot.snapshotDigest,
    recipientSnapshotDigest: input.recipientSnapshot.snapshotDigest,
    budgetedSelection,
    compilationDigest: compilation.compilationDigest,
    enumerationDigest,
    discoveryPermitsExecution: false,
  });
}
