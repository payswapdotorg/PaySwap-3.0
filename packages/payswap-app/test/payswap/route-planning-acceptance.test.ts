/**
 * @payswap/app — the ROUTE-PLANNING ACCEPTANCE battery (P16-D part 3;
 * gap-matrix D5; ADR-0009 D2/D4/D8; ROUTINE-CONTRACT stages 0-9b).
 *
 * Three laws, all binding the REAL engines through the app's own seams
 * (test-tier relative imports — the established cross-package pattern;
 * the app's src boundary stays pin-only, product law P2):
 *
 * (a) PIN FIDELITY — the app's pinned routine id/version + skill digest
 *     equal the REAL route-planning manifest values; the wait
 *     vocabularies mirror the REAL opportunities authority; the app's
 *     local digest flavor is byte-identical to the REAL canonical module.
 * (b) THE GOLDEN PATH — present → proceed → wait → match STAYS WAITING,
 *     with the REAL routine engines bound through RoutePlanningEnginePort:
 *     the REAL typed trigger (buildRoutePlanningTrigger +
 *     RoutePlanningTriggerRegistry), the REAL fail-closed manifest loader
 *     (loadRoutineManifest + PAYMENT_ROUTE_PLANNING_MANIFEST_V1), the REAL
 *     corridor projection (projectCorridor/evaluateCorridorRoute through
 *     the port adapter from route-planning's own REAL four-layer-chain
 *     test fixtures), the REAL route compiler (compileMoneyMovementRoute),
 *     the REAL hard gates + ranking (evaluateHardGates + rankRoutes), the
 *     REAL bounded scenario exploration (planScenarioSuite +
 *     runInterventionCounterfactual through exploreBoundedScenarios) and
 *     the REAL opportunities wait evaluation (discoverOpportunity +
 *     evaluateWaitCriteria). The app NEVER writes AUTHORIZATION_GRANTED.
 * (c) DETERMINISTIC REPLAYS — the full golden path twice produces
 *     byte-identical event records.
 */
import { describe, expect, it } from "vitest";

// The REAL route-planning authority (test-tier relative imports).
import {
  ROUTINE_ID,
  ROUTINE_VERSION,
  PINNED_SKILL_CONTENT_DIGEST,
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
  loadRoutineManifest,
  RoutineVersionPinLedger,
} from "../../../route-planning/src/manifest.ts";
import { buildRoutePlanningTrigger, RoutePlanningTriggerRegistry } from "../../../route-planning/src/trigger.ts";
import { deriveRailSnapshotPair } from "../../../route-planning/src/rail-snapshot.ts";
import { enumerateRouteCandidates } from "../../../route-planning/src/candidates.ts";
import { evaluateHardGates } from "../../../route-planning/src/hard-gates.ts";
import { rankRoutes } from "../../../route-planning/src/ranking.ts";
import { exploreBoundedScenarios, type ScenarioExplorationPort, type PinnedScenarioExploration, type ScenarioExplorationRequest } from "../../../route-planning/src/lab-adapter.ts";
import { contentDigest as realContentDigest } from "../../../route-planning/src/canonical.ts";
// The REAL four-layer corridor chains + the REAL compiler evidence (route-planning's own fixtures).
import { movementCorridorQuery, movementIntentFixture, NOW, NOW_ISO, realCorridorProjectionPort, recipientChain, senderChain } from "../../../route-planning/test/fixtures.ts";
import { planningBestExecutionPolicy, planningEvidenceBundle, realRouteCompilationPort } from "../../../route-planning/test/compiler-evidence.ts";
// The REAL lab machinery (stage 6) + the REAL opportunities machinery (stage 7 / 9b).
import { recordProductionFacts } from "../../../lab/src/replay.ts";
import { planScenarioSuite } from "../../../lab/src/scenario-budget.ts";
import { runInterventionCounterfactual } from "../../../lab/src/interventions.ts";
import type { RecordedProductionFacts, SimulationProgram } from "../../../lab/src/index.ts";
import type { ScenarioIntervention } from "../../../lab/src/interventions.ts";
import { discoverOpportunity } from "../../../opportunities/src/discovery.ts";
import { evaluateWaitCriteria, WAIT_CATEGORIES, WAIT_FALLBACK_KINDS } from "../../../opportunities/src/wait-criteria.ts";
import { OPPORTUNITY_FAMILIES } from "../../../opportunities/src/model.ts";
import type { OpportunityObservationInput } from "../../../opportunities/src/discovery.ts";

// The app's own seams (the pins + the session under acceptance).
import {
  PINNED_ROUTE_PLANNING_ROUTINE_ID,
  PINNED_ROUTE_PLANNING_ROUTINE_VERSION,
  PINNED_ROUTE_PLANNING_SKILL_DIGEST,
  ROUTE_PLANNING_OPPORTUNITY_FAMILIES_PIN,
  ROUTE_PLANNING_WAIT_CATEGORIES_PIN,
  ROUTE_PLANNING_WAIT_FALLBACK_KINDS_PIN,
  routePlanningContentDigest,
  routePlanningViewDigestOf,
  type RoutePlanningEnginePort,
  type RoutePlanningEngineView,
} from "../../src/agent/routePlanningPins.js";
import { createRoutePlanningSession, projectRoutePlanningProceedSelection } from "../../src/agent/routePlanningSession.js";
import { createBrowserAgentTaskSessionPort, type AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import type { RoutePlanningSession } from "../../src/agent/routePlanningSession.js";

const ONCHAIN_RAIL = "ethereum:mainnet";
const T0 = "2026-10-22T12:00:00Z";
const T1 = "2026-10-22T12:05:00Z";
const T2 = "2026-10-22T12:10:00Z";

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

/* ---------------- the REAL engines, bound through the app's port ---------------- */

/** The REAL stage-6 lab machinery bound through the adapter port (the composition test's proven adapter). */
function realScenarioExplorationPort(): ScenarioExplorationPort {
  return {
    explore(input: ScenarioExplorationRequest): PinnedScenarioExploration {
      const plan = planScenarioSuite({ budget: input.budget, candidates: [...input.interventions] });
      const scenarios = plan.selected.map((intervention) => {
        const result = runInterventionCounterfactual({
          facts: input.baseFacts as unknown as RecordedProductionFacts,
          intervention,
          seed: input.seed,
          baseProgram: input.baseProgram as unknown as SimulationProgram,
          variantProgram: input.variantProgram as unknown as SimulationProgram,
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

/** A REAL liquidity opportunity observed fresh at the composition instant (stage 7). */
function realOpportunity() {
  const observation: OpportunityObservationInput = {
    family: "liquidity",
    observationId: "obs:rp:liq:001",
    observationVersion: 4,
    venueId: "venue:rp-stable-pair",
    protocolKey: "protocol:amm-v2",
    railKind: "ONCHAIN",
    railKey: ONCHAIN_RAIL,
    adapterId: "adapter:onchain:evm",
    observerId: "observer:rp:indexer:001",
    freshness: { asOfMs: NOW, maxAgeMs: 30_000 },
    evidenceRefs: ["evidence:rp:pool-state:001"],
    title: "StablePair USCD/WSC liquidity provisioning",
    description: "observed liquidity provisioning opportunity in a stable pair pool; the estimate derives from observed fee yields with uncertainty bounds",
    capitalRequired: { assetRef: `${ONCHAIN_RAIL}/asset:USCD`, minorUnits: "1000000000" },
    fees: {
      entryFeeFraction: { numerator: "0", denominator: "1" },
      exitFeeFraction: { numerator: "3", denominator: "1000" },
      ongoingFeeFractionPerYear: { numerator: "1", denominator: "10000" },
    },
    liquidity: { depthMinorUnits: "500000000000", withdrawalLiquidityMinorUnits: "480000000000" },
    exitPath: { status: "AVAILABLE", description: "exit observed in one transaction through the venue router", constraints: ["exit size may be constrained by observed withdrawal liquidity"] },
    lockUp: { locked: false, durationMs: null, unlockConditions: [] },
    smartContractRisk: { level: "LOW", audited: true, summary: "independent audit observed; hashes recorded in the evidence chain" },
    oracleBridgeRisk: { level: "UNKNOWN", audited: null, summary: "oracle and bridge dependencies were not determinable" },
    maxLoss: { fractionOfCapital: { numerator: "5", denominator: "100" } },
    returnComponents: [
      { componentId: "rp:liq:fee-yield", kind: "FEE_YIELD", ratePerYear: { numerator: "431", denominator: "10000" }, evidenceVerified: true, description: "observed fee yield component, annualized from venue observations" },
    ],
  };
  return discoverOpportunity(observation, NOW);
}

/**
 * THE REAL ENGINE ADAPTER (the composition-root shape the platform host
 * will bind): runs stages 0-7 of the REAL routine over the REAL engines
 * and maps the results into the app's pinned engine view. The validated
 * economic intent comes from the engine's own mission linkage (here: the
 * route-planning fixtures' movement intent — the REAL 10-key pin).
 */
function realRoutePlanningEngine(): RoutePlanningEnginePort {
  return {
    presentableView(request): RoutePlanningEngineView {
      // Stage 0/1 — the typed trigger (prose UNCONSTRUCTIBLE).
      const trigger = buildRoutePlanningTrigger(movementIntentFixture(), {
        idempotencyKey: `route:${request.taskRef}`,
        acceptedAt: NOW - 1_000,
      });
      const registry = new RoutePlanningTriggerRegistry();
      expect(registry.recordStart(trigger).started).toBe(true);
      const manifest = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
      const pins = new RoutineVersionPinLedger();
      expect(pins.pinRoutineVersion(`mission:${request.taskRef}`, manifest.routineVersion).pinned).toBe(true);
      // Stages 2/3 — independent per-side snapshots (REAL corridor projection).
      const pair = deriveRailSnapshotPair({
        sender: { side: "SENDER", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 }, chains: [senderChain()], corridorPort: realCorridorProjectionPort() },
        recipient: { side: "RECIPIENT", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 }, chains: [recipientChain()], corridorPort: realCorridorProjectionPort() },
      });
      // Stage 4 — the REAL compiler through the port (bounded).
      const enumeration = enumerateRouteCandidates({
        intent: movementIntentFixture(),
        at: NOW,
        senderSnapshot: pair.sender,
        recipientSnapshot: pair.recipient,
        corridorQuery: movementCorridorQuery(),
        evidence: planningEvidenceBundle(),
        budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
        compilationPort: realRouteCompilationPort(),
      });
      // Stage 5 — hard gates BEFORE transparent ranking.
      const gates = evaluateHardGates({ intent: movementIntentFixture(), at: NOW, candidates: enumeration.candidates });
      const ranking = rankRoutes({ evaluation: gates, policy: planningBestExecutionPolicy() });
      // Stage 6 — bounded counterfactuals through the REAL lab machinery.
      const interventions: readonly ScenarioIntervention[] = [
        { kind: "POOL_FUNDED", interventionId: "fund-pool-a", poolId: "pool-a", addedMinor: 500_000n },
      ];
      const exploration = exploreBoundedScenarios({
        port: realScenarioExplorationPort(),
        baseFacts: recordProductionFacts({
          factsId: "rp-app-facts",
          rails: [
            { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
            { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
          ],
          pools: [
            { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
            { poolId: "pool-b", railId: "rail-b", availableMinor: 800_000n },
          ],
          stepLatencyMs: 250,
          demands: [{ demandId: "d1", observedAtMs: 0, amountMinor: 120_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 30_000 }],
          incidents: [],
        }),
        interventions,
        budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
        baseProgram: { programId: "rp.app.base", programVersion: "1.0.0", routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true, authorizationMode: "PROTOCOL_AUTHORIZED" },
        variantProgram: { programId: "rp.app.variant", programVersion: "1.0.0", routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true, authorizationMode: "PROTOCOL_AUTHORIZED" },
        seed: "rp-app-seed",
        stepMs: 250,
      });
      // Stage 8's view over the REAL results (the sections stay separated).
      const value = {
        kind: "PRESENTED_PLAN" as const,
        routine: {
          routineId: manifest.routineId as "payment-route-planning",
          routineVersion: manifest.routineVersion as "1.0.0",
          skillContentDigest: manifest.skill.contentDigest as "fnv1a64:1abba70f0107d1b2",
        },
        intentRef: trigger.intentId,
        presentedAt: NOW_ISO,
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
            waitId: `wait:${request.taskRef}`,
            families: ["liquidity" as const],
            categories: ["NEW_OPPORTUNITY" as const, "FEES_KNOWN" as const],
            maxWaitMs: 3_600_000,
            maxSettlementMs: 600_000,
            fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: ranking.ranked[0]?.metrics.planId ?? "plan:unknown" },
            tradeOffs: [] as readonly string[],
            declaredAt: NOW,
          },
        },
      };
      return { ...value, viewDigest: routePlanningViewDigestOf(value) };
    },
  };
}

/** The golden path: present → proceed → wait → match (STAYS WAITING). */
interface GoldenPathOutcome {
  readonly tasksJson: string;
  readonly statusAfterMatch: string;
  readonly eventKinds: readonly string[];
  readonly proceedSelection: { readonly planId: string; readonly at: string } | null;
  readonly matchedOpportunityIds: readonly string[];
  readonly realMatchedCount: number;
}

async function goldenPath(): Promise<GoldenPathOutcome> {
  const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
  const session = createRoutePlanningSession({ session: port, clock: () => T1 });
  const { task } = await port.seedOrResume({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    now: T0,
    originNote: "pay the supplier",
  });
  const engine = realRoutePlanningEngine();
  const view = engine.presentableView({ taskRef: task.id });
  await session.presentChoices(task.id, view, T1);
  await session.chooseProceed(task.id, view.availableNow.ranked[0]!.planId, T1);
  await session.chooseWait(task.id, view.waiting.proposal, T2);
  // Stage 7/9b — the REAL opportunities wait evaluation, mapped into the app's five-fact match pin.
  const criteria = view.waiting.proposal;
  const realEvaluation = evaluateWaitCriteria(criteria, [realOpportunity()], NOW);
  const afterMatch = await session.recordOpportunityMatch(
    task.id,
    {
      matchedOpportunityIds: realEvaluation.matchedOpportunityIds,
      categoryAttribution: realEvaluation.categoryAttribution,
      expired: realEvaluation.expired,
      reasons: realEvaluation.reasons,
      waitingNeverDispatches: realEvaluation.waitingNeverDispatches,
    },
    T2,
  );
  const tasks = await port.listTasks();
  return {
    tasksJson: JSON.stringify(tasks),
    statusAfterMatch: afterMatch.status,
    eventKinds: afterMatch.events.map((event) => event.kind),
    proceedSelection: projectRoutePlanningProceedSelection(afterMatch.events),
    matchedOpportunityIds: realEvaluation.matchedOpportunityIds,
    realMatchedCount: realEvaluation.matchedOpportunityIds.length,
  };
}

describe("(a) PIN FIDELITY — the app's pins equal the REAL authorities", () => {
  it("the pinned routine id/version + skill digest equal the REAL route-planning manifest values", () => {
    expect(PINNED_ROUTE_PLANNING_ROUTINE_ID).toBe(ROUTINE_ID);
    expect(PINNED_ROUTE_PLANNING_ROUTINE_VERSION).toBe(ROUTINE_VERSION);
    expect(PINNED_ROUTE_PLANNING_SKILL_DIGEST).toBe(PINNED_SKILL_CONTENT_DIGEST);
    const manifest = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
    expect(manifest.routineId).toBe(PINNED_ROUTE_PLANNING_ROUTINE_ID);
    expect(manifest.skill.contentDigest).toBe(PINNED_ROUTE_PLANNING_SKILL_DIGEST);
    expect(manifest.stages.filter((stage) => stage.authorityClass === "EFFECT_BEARING").map((stage) => stage.stageId)).toEqual(["9a"]);
  });

  it("the wait vocabularies mirror the REAL opportunities authority, and the digest flavor is byte-identical", () => {
    expect([...ROUTE_PLANNING_OPPORTUNITY_FAMILIES_PIN]).toEqual([...OPPORTUNITY_FAMILIES]);
    expect([...ROUTE_PLANNING_WAIT_CATEGORIES_PIN]).toEqual([...WAIT_CATEGORIES]);
    expect([...ROUTE_PLANNING_WAIT_FALLBACK_KINDS_PIN]).toEqual([...WAIT_FALLBACK_KINDS]);
    const probe = { z: "text", a: 42, big: 9007199254740993n, nested: { y: [1, "two", null], b: true } };
    expect(routePlanningContentDigest(probe)).toBe(realContentDigest(probe));
  });
});

describe("(b) THE GOLDEN PATH — present → proceed → wait → match STAYS WAITING (REAL engines)", () => {
  it("composes the REAL routine through the engine port; the match keeps the task WAITING and no AUTHORIZATION_GRANTED is ever written", async () => {
    const run = await goldenPath();
    // The REAL engines produced an available-now ranked route and a REAL matched opportunity
    // (the authority's id format: `opportunity:<family>:<railKey>:<venueId>:<observationId>`).
    expect(run.realMatchedCount).toBe(1);
    expect(run.matchedOpportunityIds[0]).toContain("opportunity:");
    // The match KEEPS the task WAITING (ADR-0009 D8 — a wait match never dispatches).
    expect(run.statusAfterMatch).toBe("WAITING_FOR_OPPORTUNITIES");
    // The ordered event record: the preview, the REQUEST, the wait, the match.
    expect(run.eventKinds).toEqual([
      "CREATED",
      "PREVIEW_PRESENTED",
      "ATTEMPT_STARTED",
      "WAIT_STARTED",
      "WAIT_CRITERIA_RECORDED",
      "OPPORTUNITY_MATCHED",
    ]);
    // THE STRUCTURAL LAW: no event kind anywhere in the record is AUTHORIZATION_GRANTED.
    expect(run.eventKinds).not.toContain("AUTHORIZATION_GRANTED");
    expect(JSON.stringify(run.tasksJson)).not.toContain("AUTHORIZATION_GRANTED");
    // The recorded proceed selection survives the wait (the fallback policy may reference it).
    expect(run.proceedSelection).not.toBeNull();
  });
});

describe("(c) DETERMINISTIC REPLAYS — the golden path twice is byte-identical", () => {
  it("produces byte-identical event records", async () => {
    const first = await goldenPath();
    const second = await goldenPath();
    expect(second.tasksJson).toBe(first.tasksJson);
  });
});
