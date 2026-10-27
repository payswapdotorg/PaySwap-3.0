/**
 * PaySwap Desktop (P21-D, ADR-0014 D10 — the bridge battery) — the
 * JOURNEY ROUTE-PLANNING COMPOSITION (split from
 * ./p21-journey-bridge-fixtures.ts at the ≤400-line file law): stages
 * 0-7 of the routine over the REAL engines, composed exactly as the
 * desktop engine adapter (routePlanningEngineAdapter.ts) composes them
 * for the zero-chain deployment — but with the corridor's REAL
 * capability chains (the P21-C no-route fixtures, validated by the REAL
 * capability validators) in place of the honest empty chain set, and
 * the corridor query carrying the P21-C funding-method vocabulary (the
 * FLW-wallet funding method). The bridge FACTS (the connection-derived
 * instances over the seeded ACTIVE connections) and the chains'
 * capability facts AGREE by construction in this corridor — the FLW
 * rail is read-only on both sides (the bridge derives no execution
 * grant for a Flutterwave probe; the chain's definition is
 * non-executable), the Stripe rail carries CREATE_EXTERNAL_EFFECT on
 * both sides (the FULL_TEST key's SANDBOX grant; the executable
 * definition) — the battery asserts the agreement, it never invents a
 * chain (a host-side chain-from-bridge composition is the named
 * follow-on).
 */

import {
  buildRoutePlanningTrigger,
  RoutePlanningTriggerRegistry,
  loadRoutineManifest,
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
  RoutineVersionPinLedger,
  deriveRailSnapshotPair,
  enumerateRouteCandidates,
  evaluateHardGates,
  rankRoutes,
  exploreBoundedScenarios,
  movementViewOfIntent,
  PINNED_P21_FLW_WALLET_FUNDING_METHOD,
  type EligibleRailSnapshot,
  type PinnedCorridorQuery,
  type ScenarioExplorationPort,
} from "@payswap/route-planning";
import {
  planScenarioSuite,
  recordProductionFacts,
  runInterventionCounterfactual,
  type SimulationProgram,
} from "@payswap/lab";
import {
  modelBudgetOf,
  routePlanningViewDigestOf,
  type AgentTaskModelSelectionPin,
  type RoutePlanningEngineView,
} from "@payswap/app";
import {
  emptyEvidenceBundle,
  realCompilationPort,
  realCorridorPort,
  compositionDefaultBudgets,
  compositionDefaultBestExecutionPolicy,
} from "../../src/renderer/src/routePlanningEngineAdapter.js";
import {
  mapMissionIntentToPin,
  type RoutePlanningMissionIntentDto,
} from "../../src/renderer/src/routePlanningMissionLinkage.js";
// The P21-C no-route corridor chains + the REAL conditional port (the
// test-tier cross-package import — the wait-recheck composition precedent).
import {
  CORRIDOR_RAIL_KEY,
  flwSenderChain,
  realConditionalOpportunityPort,
  stripeRecipientChain,
} from "../../../route-planning/test/no-route-fixtures.ts";

export { CORRIDOR_RAIL_KEY, realConditionalOpportunityPort };

/** The corridor query of the operator's original intent (the FLW wallet funding a Stripe merchant). */
export function journeyCorridorQuery(captured: {
  readonly corridor: { readonly sourceCountry: string; readonly destinationCountry: string; readonly destinationCurrency: string };
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly asOf: string;
}): PinnedCorridorQuery {
  return {
    sourceCountry: captured.corridor.sourceCountry,
    destinationCountry: captured.corridor.destinationCountry,
    sourceCurrency: captured.amount.currency,
    destinationCurrency: captured.corridor.destinationCurrency,
    customerType: "PERSONAL",
    sendAmount: { currency: captured.amount.currency, minorUnits: captured.amount.minorUnits },
    // The P21-C corridor vocabulary: the FLW-wallet funding method (the
    // corridor's own funding method — PINNED_P21_FLW_WALLET_FUNDING_METHOD)
    // and the Stripe merchant's receiving payout method.
    fundingMethod: PINNED_P21_FLW_WALLET_FUNDING_METHOD,
    payoutMethod: "stripe_payment_intent",
    presentedFieldIds: ["merchant.stripe_account"],
    asOf: captured.asOf,
  };
}

/** The minimal REAL scenario port (the adapter's own shape — interventions: [] select nothing). */
function journeyScenarioPort(): ScenarioExplorationPort {
  return {
    explore(input) {
      const plan = planScenarioSuite({ budget: input.budget, candidates: [...input.interventions] });
      const scenarios = plan.selected.map((intervention) => {
        const result = runInterventionCounterfactual({
          facts: input.baseFacts as never,
          intervention,
          seed: input.seed,
          baseProgram: input.baseProgram as never,
          variantProgram: input.variantProgram as never,
          stepMs: input.stepMs,
        });
        return {
          interventionId: intervention.interventionId,
          kind: intervention.kind,
          counterfactualId: result.counterfactualId,
          counterfactualDigest: result.digest,
          delta: result.delta,
        };
      });
      return {
        baseFactsId: input.baseFacts.factsId,
        baseFactsDigest: input.baseFacts.factsDigest,
        suiteDigest: plan.digest,
        selectedInterventionIds: plan.selected.map((intervention) => intervention.interventionId),
        receipts: plan.receipts,
        coverage: plan.coverage,
        scenarios,
      };
    },
  };
}

const BASE_PROGRAM: SimulationProgram = {
  programId: "p21d.base", programVersion: "1.0.0", routePreference: [], useNetting: false,
  useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};
const VARIANT_PROGRAM: SimulationProgram = {
  programId: "p21d.variant", programVersion: "1.0.0", routePreference: [], useNetting: false,
  useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

/** The journey plan request (the mission's compiled intent + captured corridor facts). */
export interface JourneyPlanRequest {
  readonly taskRef: string;
  readonly intentDto: RoutePlanningMissionIntentDto;
  readonly corridor: { readonly sourceCountry: string; readonly destinationCountry: string; readonly destinationCurrency: string };
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly modelSelection?: AgentTaskModelSelectionPin;
}

/** The journey plan (the engine view + the per-side rail snapshots + the ranked count). */
export interface JourneyPlan {
  readonly view: RoutePlanningEngineView;
  readonly senderSnapshot: EligibleRailSnapshot;
  readonly recipientSnapshot: EligibleRailSnapshot;
  readonly rankedCount: number;
}

/**
 * Compose route-planning stages 0-7 over the REAL engines with the
 * corridor's REAL capability chains (the acceptance battery's proven
 * composition + the adapter's own ports): trigger → manifest + version
 * pin → per-side rail snapshots → the REAL compiler → hard gates →
 * transparent ranking → the bounded advisory scenario suite → the
 * presentation view (ranked, exclusions, truncation, wait proposal).
 */
export function planJourneyRoute(request: JourneyPlanRequest): JourneyPlan {
  const intent = mapMissionIntentToPin(request.intentDto);
  const at = intent.declaredAt;
  const trigger = buildRoutePlanningTrigger(intent, {
    idempotencyKey: `route:${request.taskRef}`,
    acceptedAt: at,
  });
  const registry = new RoutePlanningTriggerRegistry();
  if (!registry.recordStart(trigger).started) {
    throw new Error("the journey's routine start did not record (idempotency drift)");
  }
  const manifest = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
  const pins = new RoutineVersionPinLedger();
  if (!pins.pinRoutineVersion(`mission:${request.taskRef}`, manifest.routineVersion).pinned) {
    throw new Error("the journey's routine version pin failed");
  }
  const query = journeyCorridorQuery({ ...request, asOf: new Date(at).toISOString() });
  const freshnessPolicy = { maxAgeSeconds: 3600 };
  const pair = deriveRailSnapshotPair({
    sender: { side: "SENDER", query, freshnessPolicy, chains: [flwSenderChain()], corridorPort: realCorridorPort() },
    recipient: { side: "RECIPIENT", query, freshnessPolicy, chains: [stripeRecipientChain()], corridorPort: realCorridorPort() },
  });
  const budgets = request.modelSelection !== undefined
    ? modelBudgetOf(request.modelSelection.reasoningLevel)
    : compositionDefaultBudgets();
  const enumeration = enumerateRouteCandidates({
    intent,
    at,
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    corridorQuery: query,
    evidence: emptyEvidenceBundle(),
    budget: budgets.searchBudget,
    compilationPort: realCompilationPort(),
  });
  // The 10-key movement view (the authority's own asMoneyMovementIntent law —
  // the hard gates take the movement shape, exactly as the adapter passes it).
  const movement = movementViewOfIntent(intent);
  const gates = evaluateHardGates({ intent: movement, at, candidates: enumeration.candidates });
  const ranking = rankRoutes({ evaluation: gates, policy: compositionDefaultBestExecutionPolicy() as never });
  const exploration = exploreBoundedScenarios({
    port: journeyScenarioPort(),
    baseFacts: recordProductionFacts({
      factsId: `p21d:${request.taskRef}`,
      rails: [], pools: [], stepLatencyMs: 250, demands: [], incidents: [],
    }),
    interventions: [],
    budget: budgets.scenarioBudget,
    baseProgram: BASE_PROGRAM,
    variantProgram: VARIANT_PROGRAM,
    seed: `p21d:${request.taskRef}`,
    stepMs: 250,
  });
  const corridorExclusions = [
    ...pair.sender.rails.flatMap((rail) =>
      rail.exclusions.map((exclusion) => ({ subject: rail.routeId, code: exclusion.code, message: exclusion.message })),
    ),
    ...pair.recipient.rails.flatMap((rail) =>
      rail.exclusions.map((exclusion) => ({ subject: rail.routeId, code: exclusion.code, message: exclusion.message })),
    ),
  ];
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: manifest.routineId as "payment-route-planning",
      routineVersion: manifest.routineVersion as "1.0.0",
      skillContentDigest: manifest.skill.contentDigest as "fnv1a64:1abba70f0107d1b2",
    },
    intentRef: trigger.intentId,
    presentedAt: new Date(at).toISOString(),
    availableNow: {
      ranked: ranking.ranked.map((candidate) => ({
        planId: candidate.metrics.planId,
        shapeId: candidate.metrics.shapeId,
        rank: candidate.rank,
        netNumeraireMinorUnits: candidate.metrics.score!.netNumeraireMinorUnits,
        numeraire: ranking.numeraire,
        hopCount: candidate.metrics.hopCount,
        railCrossings: candidate.metrics.railCrossings,
        unknownDimensions: [...candidate.metrics.unknownDimensions],
        paretoNonDominated: candidate.paretoNonDominated,
        dominatedBy: [...candidate.dominatedBy],
      })),
      notScored: ranking.notScored.map((candidate) => ({ ...candidate, unknownDimensions: [...candidate.unknownDimensions] })),
      senderEligibleRouteIds: [...pair.sender.eligibleRouteIds],
      recipientEligibleRouteIds: [...pair.recipient.eligibleRouteIds],
    },
    exclusions: [
      ...corridorExclusions,
      ...enumeration.exclusions.flatMap((exclusion) =>
        exclusion.reasons.map((reason) => ({ subject: `shape:${exclusion.shapeId}`, code: "ROUTE_SHAPE_UNSUPPORTED", message: reason })),
      ),
    ],
    truncation: {
      receipts: enumeration.budgetedSelection.receipts.map((receipt) => ({ ...receipt })),
      coverage: enumeration.budgetedSelection.coverage,
    },
    scenarios: {
      advisoryOnly: true as const,
      coverage: exploration.coverage,
      outcomes: exploration.scenarios.map((scenario) => ({
        interventionId: scenario.interventionId,
        kind: scenario.kind,
        counterfactualId: scenario.counterfactualId,
        counterfactualDigest: scenario.counterfactualDigest,
      })),
    },
    waiting: {
      proposal: {
        waitId: `wait:${request.taskRef}`,
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const, "FEES_KNOWN" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: Math.max(1, intent.constraints.maxSettlementMs),
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: ranking.ranked[0]?.metrics.planId ?? "plan:unknown" },
        tradeOffs: [] as readonly string[],
        declaredAt: at,
      },
    },
    ...(request.modelSelection !== undefined ? { modelSelection: request.modelSelection } : {}),
  };
  const view = { ...value, viewDigest: routePlanningViewDigestOf(value) } as RoutePlanningEngineView;
  return { view, senderSnapshot: pair.sender, recipientSnapshot: pair.recipient, rankedCount: ranking.ranked.length };
}
