/**
 * PaySwap Desktop renderer (P17-C, ADR-0010 D1/D4) — the REAL
 * route-planning engine adapter: THE platform-host composition module
 * the P16 contract anticipated ("the composition-root shape the
 * platform host will bind" — route-planning-acceptance.test.ts).
 *
 * This is the ONE desktop renderer module that imports the
 * @payswap/route-planning / capability / route-compiler / lab sources
 * (the three-site alias pattern: tsconfig.renderer.json paths + vite
 * resolve.alias + vitest resolve.alias — the @payswap/app precedent).
 * The import tier is accepted by ADR-0010's additive annotation (the
 * ADR-0004 honest-R3 precedent); NO other renderer file may follow.
 *
 * THE LAWS (ADR-0009 D1/D2/D4/D6 + ADR-0010 D4):
 * - The mission linkage resolves taskRef → the latest mission carrying
 *   a compiled 11-key intent and FAILS CLOSED with the app's typed
 *   RoutePlanningNoIntentError when none exists (prose never constructs
 *   an intent). The view carries the intentRef so the surface discloses
 *   WHICH mission was planned for.
 * - The intent crosses as a field-mapped TYPED GUARD (exact 11 keys,
 *   exact value shapes) — a drifted DTO never constructs a trigger.
 * - The typed trigger + fail-closed manifest + pin ledger run stages
 *   0/1; the idempotency key is `route:<missionId>` (one routine start
 *   per mission; an identical re-record replays — the D1 law).
 * - The corridor chains are the deployment's REAL connected capability
 *   instances — ZERO in this deployment — so the REAL projectCorridor
 *   projects the honest empty evaluation and the compiler's own honest
 *   exclusion ("no route family grounds the observed origin/destination
 *   pair — the honest empty state, never a fabricated route") surfaces
 *   verbatim. The scenario section runs the REAL Lab machinery over the
 *   EMPTY recorded-facts snapshot (the deployment records none).
 * - The pinned default best-execution policy is the composition root's
 *   OWN transparent ranking preference (versioned, fully declared; the
 *   identity conversion only — no fabricated market rates; a route
 *   touching an unconverted asset fails closed in the REAL compiler).
 * - Every stage's discovery NEVER permits execution; the view digest is
 *   the deterministic digest over the presentation projection.
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
  type CorridorProjectionPort,
  type CorridorSideEvaluationRequest,
  type RouteCompilationPort,
  type ScenarioExplorationPort,
  type PinnedCorridorQuery,
  type PinnedCorridorSideEvaluation,
  type RouteCompilerEvidenceBundle,
} from "@payswap/route-planning";
import { projectCorridor, evaluateCorridorRoute } from "@payswap/capability";
import { compileMoneyMovementRoute } from "@payswap/route-compiler";
import { recordProductionFacts, planScenarioSuite, runInterventionCounterfactual, type SimulationProgram } from "@payswap/lab";
import {
  RoutePlanningNoIntentError,
  routePlanningViewDigestOf,
  type RoutePlanningEnginePort,
  type RoutePlanningEngineView,
  type RoutePlanningMissionFactsSource,
  type RoutineStageMissionFacts,
} from "@payswap/app";
import {
  mapMissionIntentToPin,
  type RoutePlanningMissionBoardItem,
  type RoutePlanningMissionDetail,
  type RoutePlanningMissionSource,
} from "./routePlanningMissionLinkage.js";

/* --------------- the pinned defaults (transparent, versioned) --------------- */

/** The composition root's pinned default best-execution policy: fully declared, identity conversion only — never presented as market data. */
export function compositionDefaultBestExecutionPolicy() {
  return {
    policyId: "payswap-composition-default-v1",
    version: 1,
    numeraire: "USC",
    conversions: [
      { asset: { chain: "ethereum:mainnet", assetId: "ethereum:mainnet/asset:USC", symbol: "USC" }, rate: { numerator: "1", denominator: "1" } },
    ],
    maxSettlementMs: 600_000,
    maxFailureRiskClass: "MODERATE",
    degradedVenuePolicy: "ADMIT",
    failureRiskDeductions: { LOW: "0", MODERATE: "100000", ELEVATED: "1000000", HIGH: "10000000" },
    timeCostPerMs: { numerator: "1", denominator: "1000" },
    tieBreakers: ["LOWER_RISK_CLASS", "FASTER_SETTLEMENT", "FEWER_HOPS", "FEWER_RAIL_CROSSINGS", "PLAN_ID"],
  } as const;
}

/** The fail-closed security gate (BLOCK unless a real security authority binds one — never allow-all; the decision vocabulary is ALLOW/BLOCK/UNKNOWN). */
function denyByDefaultGate() {
  return (_input: unknown) => ({
    decision: "BLOCK" as const,
    reasons: [{ code: "composition-security-denial", message: "no security authority is bound at this composition root — every onchain write is blocked (fail-closed, never allow-all)" }],
    evidenceRefs: [] as readonly string[],
  });
}

/** The honest EMPTY evidence bundle: zero venues, zero observations, zero constraints — the deployment's real provider-evidence state. */
export function emptyEvidenceBundle(): RouteCompilerEvidenceBundle {
  const policy = compositionDefaultBestExecutionPolicy();
  return {
    venues: [],
    onchain: {
      policy,
      security: { policy: { policyId: "composition-security-denial-v1", version: 1 }, state: null, evaluateGate: denyByDefaultGate() },
      instances: [],
      owner: "payswap-composition-root",
      requestedBy: "payswap-composition-root",
      routeExpiryMs: 600_000,
    },
    locationObservations: [],
    assetObservations: [],
    conversionRules: [],
    payoutConstraints: [],
    settlementDestinations: [],
    merchantEligibility: [],
    liquidityEstimates: [],
    scoringPolicy: policy,
  };
}

/* ------------------- the REAL engine ports (the thin wrappers) ------------------- */

/** The REAL corridor projection over the deployment's chains (zero today — the honest empty view; the acceptance battery's proven wrapper). */
export function realCorridorPort(): CorridorProjectionPort {
  return {
    evaluateSide(input: CorridorSideEvaluationRequest): PinnedCorridorSideEvaluation {
      const routes = input.chains.map((chain) => ({
        definition: chain.definition as never,
        implementation: chain.implementation as never,
        instance: chain.instance as never,
        observation: chain.observation as never,
      }));
      const query = input.query as never;
      const view = projectCorridor({ routes, query, freshnessPolicy: input.freshnessPolicy });
      const routeRestrictionSets = routes.map((route) =>
        evaluateCorridorRoute(route as never, query, input.freshnessPolicy).restrictionSets,
      );
      return { view, routeRestrictionSets } as PinnedCorridorSideEvaluation;
    },
  };
}

/** The REAL route compilation port (the thin cast the acceptance battery proved). */
export function realCompilationPort(): RouteCompilationPort {
  return {
    compile(pinned) {
      return compileMoneyMovementRoute(pinned as never) as never;
    },
  };
}

/** The REAL Lab scenario port (the acceptance battery's proven adapter). */
function realScenarioPort(): ScenarioExplorationPort {
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

/* ---------------- the engine (stages 0-7 over the REAL machinery) ---------------- */

/** The per-document engine state (the trigger registry + pin ledger + the latest linkage). */
export interface RoutePlanningEngineState {
  /** The latest presented linkage (missionId + view provenance — the stage-9a decorator reads it). */
  readonly lastPresented: { readonly missionId: string; readonly viewDigest: string; readonly routineId: string; readonly routineVersion: string } | null;
}

/**
 * Build the REAL route-planning engine over a mission source: stages
 * 0-7 exactly as the acceptance battery's proven adapter composes them,
 * with the mission linkage (D4) and the honest empty deployment facts.
 * Synchronous by contract (the app's RoutePlanningEnginePort) — the
 * mission cache is refreshed by the composition module (init + after
 * every session mutation), never inside this call.
 */
export function createRealRoutePlanningEngine(
  source: RoutePlanningMissionSource,
  state: { missions: readonly RoutePlanningMissionBoardItem[]; details: ReadonlyMap<string, RoutePlanningMissionDetail> },
  engineState: { lastPresented: RoutePlanningEngineState["lastPresented"] },
): RoutePlanningEnginePort & RoutePlanningMissionFactsSource {
  const registry = new RoutePlanningTriggerRegistry();
  const pins = new RoutineVersionPinLedger();
  return {
    presentableView(_request: { readonly taskRef: string }): RoutePlanningEngineView {
      // The mission linkage (D4): the latest mission carrying a compiled intent.
      const target = [...state.details.values()]
        .filter((detail) => detail.intent !== undefined && detail.status !== "COMPLETED" && detail.status !== "CANCELLED" && detail.status !== "EXPIRED")
        .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
      const intentDto = target?.intent;
      if (target === undefined || intentDto === undefined) {
        throw new RoutePlanningNoIntentError(
          "no mission carries a compiled payment intent yet — route planning starts only from a validated typed intent (complete a mission intake and present its preview on the authority surface)",
        );
      }
      const intent = mapMissionIntentToPin(intentDto);
      // The movement view (the 10-key projection — commerceRef stripped; the
      // authority's own asMoneyMovementIntent law): stages 4/5 take the movement view.
      const movement = movementViewOfIntent(intent);
      // Stage 0/1 — the typed trigger (prose UNCONSTRUCTIBLE) + the fail-closed manifest + the version pin.
      const trigger = buildRoutePlanningTrigger(intent, {
        idempotencyKey: `route:${target.id}`,
        acceptedAt: intent.declaredAt,
      });
      registry.recordStart(trigger);
      const manifest = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
      pins.pinRoutineVersion(`mission:${target.id}`, manifest.routineVersion);
      // The corridor query derived from the mission's captured fields (the desktop gates' own derivation, PERSONAL pinned as they pin it).
      const captured = (target.fields ?? {}) as Readonly<Record<string, { status?: string; value?: unknown }>>;
      const corridor = captured["countryCorridor"]?.status === "CAPTURED" ? captured["countryCorridor"].value as { sourceCountry: string; destinationCountry: string; destinationCurrency: string } : undefined;
      const amount = captured["amountAndCurrency"]?.status === "CAPTURED" ? captured["amountAndCurrency"].value as { currency: string; minorUnits: string } : undefined;
      if (corridor === undefined || amount === undefined) {
        throw new RoutePlanningNoIntentError("the mission's corridor or amount captures are absent — the corridor query is never guessed");
      }
      const query: PinnedCorridorQuery = {
        sourceCountry: corridor.sourceCountry,
        destinationCountry: corridor.destinationCountry,
        sourceCurrency: amount.currency,
        destinationCurrency: corridor.destinationCurrency,
        customerType: "PERSONAL",
        sendAmount: { currency: amount.currency, minorUnits: amount.minorUnits },
        asOf: new Date(intent.declaredAt).toISOString(),
      };
      const at = intent.declaredAt;
      // Stages 2/3 — the per-side snapshots over the REAL corridor projection, ZERO chains (the deployment fact).
      const corridorPort = realCorridorPort();
      const freshnessPolicy = { maxAgeSeconds: 3600 };
      const pair = deriveRailSnapshotPair({
        sender: { side: "SENDER", query, freshnessPolicy, chains: [], corridorPort },
        recipient: { side: "RECIPIENT", query, freshnessPolicy, chains: [], corridorPort },
      });
      // Stage 4 — the REAL compiler through the port over the honest EMPTY evidence bundle.
      const enumeration = enumerateRouteCandidates({
        intent: movement,
        at,
        senderSnapshot: pair.sender,
        recipientSnapshot: pair.recipient,
        corridorQuery: query,
        evidence: emptyEvidenceBundle(),
        budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
        compilationPort: realCompilationPort(),
      });
      // Stage 5 — the typed hard gates BEFORE the transparent ranking.
      const gates = evaluateHardGates({ intent: movement, at, candidates: enumeration.candidates });
      const ranking = rankRoutes({ evaluation: gates, policy: compositionDefaultBestExecutionPolicy() as never });
      // Stage 6 — the REAL Lab machinery over the EMPTY recorded-facts snapshot (the deployment records none).
      const baseProgram: SimulationProgram = { programId: "composition.base", programVersion: "1.0.0", routePreference: [], useNetting: false, useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true, authorizationMode: "PROTOCOL_AUTHORIZED" };
      const variantProgram: SimulationProgram = { programId: "composition.variant", programVersion: "1.0.0", routePreference: [], useNetting: false, useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true, authorizationMode: "PROTOCOL_AUTHORIZED" };
      const exploration = exploreBoundedScenarios({
        port: realScenarioPort(),
        baseFacts: recordProductionFacts({ factsId: `composition:${target.id}`, rails: [], pools: [], stepLatencyMs: 250, demands: [], incidents: [] }),
        interventions: [],
        budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
        baseProgram,
        variantProgram,
        seed: `composition:${target.id}`,
        stepMs: 250,
      });
      // Stage 8's view over the REAL results (the sections stay separated; the wait proposal is the honest default).
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
            ...(candidate.metrics.riskClass !== undefined ? { riskClass: candidate.metrics.riskClass } : {}),
            ...(candidate.metrics.estimatedSettlementMs !== undefined ? { estimatedSettlementMs: candidate.metrics.estimatedSettlementMs } : {}),
            unknownDimensions: [...candidate.metrics.unknownDimensions],
            paretoNonDominated: candidate.paretoNonDominated,
            dominatedBy: [...candidate.dominatedBy],
          })),
          notScored: ranking.notScored.map((candidate) => ({ ...candidate, unknownDimensions: [...candidate.unknownDimensions] })),
          senderEligibleRouteIds: [...pair.sender.eligibleRouteIds],
          recipientEligibleRouteIds: [...pair.recipient.eligibleRouteIds],
        },
        exclusions: enumeration.exclusions.flatMap((exclusion) =>
          exclusion.reasons.map((reason) => ({ subject: `shape:${exclusion.shapeId}`, code: "ROUTE_SHAPE_UNSUPPORTED", message: reason })),
        ),
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
            waitId: `wait:${target.id}`,
            families: ["liquidity" as const],
            categories: ["NEW_OPPORTUNITY" as const, "FEES_KNOWN" as const],
            maxWaitMs: 3_600_000,
            maxSettlementMs: Math.max(1, intent.constraints.maxSettlementMs),
            fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: ranking.ranked[0]?.metrics.planId ?? "plan:unknown" },
            tradeOffs: [] as readonly string[],
            declaredAt: at,
          },
        },
      };
      const view = { ...value, viewDigest: routePlanningViewDigestOf(value) } as RoutePlanningEngineView;
      engineState.lastPresented = { missionId: target.id, viewDigest: view.viewDigest, routineId: manifest.routineId, routineVersion: manifest.routineVersion };
      return view;
    },

    // (P21-B, ADR-0014 D3) The stage-projection input: the mission's
    // typed timeline + status over the SAME mission cache the engine
    // plans over (the channel's own read model — never a parallel one).
    missionFacts(missionId: string): RoutineStageMissionFacts | null {
      const detail = state.details.get(missionId);
      if (detail === undefined) {
        return null;
      }
      return {
        missionId: detail.id,
        missionStatus: detail.status,
        events: [...(detail.events ?? [])],
      };
    },
  };
}
