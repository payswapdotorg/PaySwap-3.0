import { describe, expect, it } from "vitest";
import {
  buildRoutePlanningTrigger,
  RoutePlanningTriggerRegistry,
  triggerPermitsExecution,
} from "../src/trigger.ts";
import {
  loadRoutineManifest,
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
  ROUTINE_VERSION,
  RoutineVersionPinLedger,
} from "../src/manifest.ts";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { enumerateRouteCandidates } from "../src/candidates.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import { rankRoutes } from "../src/ranking.ts";
import {
  exploreBoundedScenarios,
  scenariosPermitExecution,
  type ScenarioExplorationPort,
  type PinnedScenarioExploration,
  type ScenarioExplorationRequest,
} from "../src/lab-adapter.ts";
import { PortUnboundError } from "../src/errors.ts";
import {
  movementCorridorQuery,
  movementIntentFixture,
  NOW,
  paymentIntentFixture,
  realCorridorProjectionPort,
  recipientChain,
  senderChain,
} from "./fixtures.ts";
import { planningBestExecutionPolicy, planningEvidenceBundle, realRouteCompilationPort } from "./compiler-evidence.ts";
import { recordProductionFacts } from "../../lab/src/replay.ts";
import { planScenarioSuite } from "../../lab/src/scenario-budget.ts";
import { runInterventionCounterfactual } from "../../lab/src/interventions.ts";
import type { RecordedProductionFacts, SimulationProgram } from "../../lab/src/index.ts";
import type { ScenarioIntervention } from "../../lab/src/interventions.ts";
import { discoverOpportunity } from "../../opportunities/src/discovery.ts";
import { matchOpportunities, matchResultIsStructurallyPure } from "../../opportunities/src/matching.ts";
import { evaluateWaitCriteria, WAIT_CATEGORIES } from "../../opportunities/src/wait-criteria.ts";
import { ConsentLedger } from "../../opportunities/src/consent.ts";
import { MATCH_PRIVACY_AUDIT_FIELDS } from "../../opportunities/src/matching.ts";
import type { OpportunityObservationInput } from "../../opportunities/src/discovery.ts";

/**
 * THE OFFLINE/CONTRACT-TIER ROUTINE COMPOSITION E2E (P16-D part 1):
 * trigger -> manifest (loads green, version pinned) -> stages 2-5 with
 * the REAL corridor projection + REAL route compiler bound through the
 * ports -> stage 6 with the REAL lab machinery through the adapter port ->
 * stage 7 with the REAL opportunities matching. Byte-identical receipts
 * on full replay; unbound engines fail CLOSED at the exact stage; every
 * stage's permits-execution literal is false end-to-end.
 */

const ONCHAIN_RAIL = "ethereum:mainnet";

/** A REAL liquidity opportunity observed fresh at the composition instant. */
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
    description:
      "observed liquidity provisioning opportunity in a stable pair pool; the estimate derives from observed fee yields with uncertainty bounds",
    capitalRequired: { assetRef: `${ONCHAIN_RAIL}/asset:USCD`, minorUnits: "1000000000" },
    fees: {
      entryFeeFraction: { numerator: "0", denominator: "1" },
      exitFeeFraction: { numerator: "3", denominator: "1000" },
      ongoingFeeFractionPerYear: { numerator: "1", denominator: "10000" },
    },
    liquidity: { depthMinorUnits: "500000000000", withdrawalLiquidityMinorUnits: "480000000000" },
    exitPath: {
      status: "AVAILABLE",
      description: "exit observed in one transaction through the venue router",
      constraints: ["exit size may be constrained by observed withdrawal liquidity"],
    },
    lockUp: { locked: false, durationMs: null, unlockConditions: [] },
    smartContractRisk: { level: "LOW", audited: true, summary: "independent audit observed; hashes recorded in the evidence chain" },
    oracleBridgeRisk: { level: "UNKNOWN", audited: null, summary: "oracle and bridge dependencies were not determinable" },
    maxLoss: { fractionOfCapital: { numerator: "5", denominator: "100" } },
    returnComponents: [
      {
        componentId: "rp:liq:fee-yield",
        kind: "FEE_YIELD",
        ratePerYear: { numerator: "431", denominator: "10000" },
        evidenceVerified: true,
        description: "observed fee yield component, annualized from venue observations",
      },
    ],
  };
  return discoverOpportunity(observation, NOW);
}

/** The REAL lab machinery bound through the stage-6 port (the composition root). */
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

function stage6Facts(): RecordedProductionFacts {
  return recordProductionFacts({
    factsId: "rp-e2e-facts",
    rails: [
      { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
      { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
    ],
    pools: [
      { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
      { poolId: "pool-b", railId: "rail-b", availableMinor: 800_000n },
    ],
    stepLatencyMs: 250,
    demands: [
      { demandId: "d1", observedAtMs: 0, amountMinor: 120_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 30_000 },
    ],
    incidents: [],
  });
}

const STAGE6_BASE_PROGRAM: SimulationProgram = {
  programId: "rp.e2e.base", programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false,
  delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

/** The full routine composition (stages 0-7, all REAL engines bound). */
function composeRoutine() {
  // Stage 0/1 — the typed trigger (the payment intent: the 11-key shape).
  const trigger = buildRoutePlanningTrigger(paymentIntentFixture(), {
    idempotencyKey: "idem:e2e:001",
    acceptedAt: NOW - 1_000,
  });
  const registry = new RoutePlanningTriggerRegistry();
  const start = registry.recordStart(trigger);
  // Stage 0 — the manifest loads GREEN and the mission version is pinned.
  const manifest = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
  const pins = new RoutineVersionPinLedger();
  const pin = pins.pinRoutineVersion("mission:e2e:001", manifest.routineVersion);
  // Stages 2/3 — independent per-side snapshots (REAL corridor projection).
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
  // Stage 5 — hard gates then transparent ranking.
  const gates = evaluateHardGates({ intent: movementIntentFixture(), at: NOW, candidates: enumeration.candidates });
  const ranking = rankRoutes({ evaluation: gates, policy: planningBestExecutionPolicy() });
  // Stage 6 — bounded counterfactuals through the REAL lab machinery.
  const interventions: readonly ScenarioIntervention[] = [
    {
      kind: "RAIL_ADDED", interventionId: "add-rail-c", name: "rail c enters",
      rail: { railId: "rail-c", currency: "EUR", latencyMs: 500, fixedFeeMinor: 10n, variableFeeBps: 5n },
      pools: [{ poolId: "pool-c", railId: "rail-c", availableMinor: 5_000_000n }],
    },
    { kind: "POOL_FUNDED", interventionId: "fund-pool-a", poolId: "pool-a", addedMinor: 500_000n },
  ];
  const exploration = exploreBoundedScenarios({
    port: realScenarioExplorationPort(),
    baseFacts: stage6Facts(),
    interventions,
    budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
    baseProgram: STAGE6_BASE_PROGRAM,
    variantProgram: { ...STAGE6_BASE_PROGRAM, programId: "rp.e2e.variant" },
    seed: "rp-e2e-seed",
    stepMs: 250,
  });
  // Stage 7 — the REAL opportunities matching (consent-gated, minimum disclosure).
  const ledger = new ConsentLedger();
  ledger.grant("principal:planning-1", { fields: [...MATCH_PRIVACY_AUDIT_FIELDS], purpose: "route planning wait matching, minimum disclosure" }, NOW - 60_000);
  const waitCriteria = {
    waitId: "wait:rp:e2e:001",
    families: ["liquidity" as const],
    categories: [...WAIT_CATEGORIES],
    maxWaitMs: 3_600_000,
    maxSettlementMs: 600_000,
    fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:mixed-dex-offramp" },
    tradeOffs: [],
    declaredAt: NOW,
  };
  const opportunity = realOpportunity();
  const match = matchOpportunities(
    { criteria: waitCriteria, opportunities: [opportunity], consent: ledger.snapshot("principal:planning-1") },
    NOW,
  );
  const wait = evaluateWaitCriteria(waitCriteria, [opportunity], NOW);
  return { trigger, start, manifest, pin, pair, enumeration, gates, ranking, exploration, match, wait };
}

describe("the routine composition E2E (offline/contract tier, REAL engines)", () => {
  it("trigger -> manifest -> stages 2-5 -> stage 6 -> stage 7 compose end-to-end with every REAL engine", () => {
    const run = composeRoutine();
    expect(run.start).toEqual({ started: true, startedAt: NOW - 1_000 });
    expect(run.trigger.intentKind).toBe("PAYMENT");
    expect(run.manifest.routineVersion).toBe(ROUTINE_VERSION);
    expect(run.pin.pinned).toBe(true);
    expect(run.pair.sender.eligibleRouteIds).toEqual(["inst:sender-psp-native"]);
    expect(run.pair.recipient.eligibleRouteIds).toEqual(["inst:recipient-psp-payouts"]);
    expect(run.enumeration.compilerStatus).toBe("ROUTES_COMPILED");
    expect(run.enumeration.candidates.map((plan) => plan.shapeId).sort()).toEqual([
      "mixed-dex-offramp", "provider-native-offramp",
    ]);
    expect(run.gates.rankEligible).toHaveLength(2);
    expect(run.ranking.ranked).toHaveLength(1);
    expect(run.exploration.coverage).toBe("COMPLETE");
    expect(run.exploration.scenarios.map((scenario) => scenario.kind)).toEqual(["RAIL_ADDED", "POOL_FUNDED"]);
    expect(run.match.matched).toHaveLength(1);
    expect(run.match.matched[0]?.audit.asset_symbol).toBe("USCD");
    expect(run.wait.matchedOpportunityIds).toEqual([run.match.matched[0]?.opportunityId]);
  });

  it("the full composition replays byte-identically (the acceptance law)", () => {
    const first = composeRoutine();
    const second = composeRoutine();
    expect(second.trigger.intentDigest).toBe(first.trigger.intentDigest);
    expect(second.trigger.hardConstraintsDigest).toBe(first.trigger.hardConstraintsDigest);
    expect(second.pair.sender.snapshotDigest).toBe(first.pair.sender.snapshotDigest);
    expect(second.pair.recipient.snapshotDigest).toBe(first.pair.recipient.snapshotDigest);
    expect(second.enumeration.enumerationDigest).toBe(first.enumeration.enumerationDigest);
    expect(second.gates.hardGateDigest).toBe(first.gates.hardGateDigest);
    expect(second.ranking.rankingDigest).toBe(first.ranking.rankingDigest);
    expect(second.exploration.explorationDigest).toBe(first.exploration.explorationDigest);
    expect(JSON.stringify(second.match.matched)).toBe(JSON.stringify(first.match.matched));
    expect(JSON.stringify(second.wait.categoryAttribution)).toBe(JSON.stringify(first.wait.categoryAttribution));
  });

  it("every stage's permits-execution literal is false end-to-end (NO stage ever dispatches)", () => {
    const run = composeRoutine();
    expect(triggerPermitsExecution()).toBe(false);
    expect(run.pair.sender.railsPermitExecution).toBe(false);
    expect(run.pair.recipient.railsPermitExecution).toBe(false);
    expect(run.enumeration.discoveryPermitsExecution).toBe(false);
    expect(run.gates.hardGatesPermitExecution).toBe(false);
    expect(run.ranking.rankingPermitsExecution).toBe(false);
    expect(run.exploration.scenariosPermitExecution).toBe(false);
    expect(scenariosPermitExecution()).toBe(false);
    expect(run.wait.waitingNeverDispatches).toBe(false);
    expect(matchResultIsStructurallyPure(run.match)).toBe(true);
    // The ONLY effect-bearing stage is 9a, which requires fresh scoped authorization.
    const effectBearing = run.manifest.stages.filter((stage) => stage.authorityClass === "EFFECT_BEARING");
    expect(effectBearing.map((stage) => stage.stageId)).toEqual(["9a"]);
    expect(effectBearing[0]?.requiresFreshScopedAuthorization).toBe(true);
  });

  it("an UNBOUND engine fails CLOSED at the exact stage (never a fallback, never fabricated data)", () => {
    let stage = "";
    try {
      deriveRailSnapshotPair({
        sender: {
          side: "SENDER", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
          chains: [senderChain()], corridorPort: undefined as never,
        },
        recipient: {
          side: "RECIPIENT", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
          chains: [recipientChain()], corridorPort: realCorridorProjectionPort(),
        },
      });
      expect.unreachable("the unbound corridor port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-2:discover-sender-rails");
    const pair = composeRoutine().pair;
    let stage4 = "";
    try {
      enumerateRouteCandidates({
        intent: movementIntentFixture(), at: NOW,
        senderSnapshot: pair.sender, recipientSnapshot: pair.recipient,
        corridorQuery: movementCorridorQuery(), evidence: planningEvidenceBundle(),
        budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
        compilationPort: undefined as never,
      });
      expect.unreachable("the unbound compilation port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage4 = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage4).toBe("stage-4:compile-available-routes");
    let stage6 = "";
    const interventions: readonly ScenarioIntervention[] = [
      { kind: "POOL_FUNDED", interventionId: "fund-pool-a", poolId: "pool-a", addedMinor: 500_000n },
    ];
    try {
      exploreBoundedScenarios({
        port: undefined as never, baseFacts: stage6Facts(),
        interventions,
        budget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
        baseProgram: STAGE6_BASE_PROGRAM, variantProgram: { ...STAGE6_BASE_PROGRAM, programId: "rp.e2e.variant" },
        seed: "rp-e2e-seed", stepMs: 250,
      });
      expect.unreachable("the unbound scenario port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage6 = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage6).toBe("stage-6:explore-bounded-counterfactuals");
  });

  it("the wait match NEVER dispatches: a match keeps waiting, and expiry discloses honestly", () => {
    const run = composeRoutine();
    expect(run.wait.matchedOpportunityIds).toHaveLength(1);
    expect(run.wait.expired).toBe(false);
    expect(run.wait.reasons).toEqual([]);
    const later = evaluateWaitCriteria(
      {
        waitId: "wait:rp:e2e:001", families: ["liquidity"], categories: [...WAIT_CATEGORIES],
        maxWaitMs: 3_600_000, maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE", routeRef: "plan:mixed-dex-offramp" },
        tradeOffs: [], declaredAt: NOW,
      },
      [realOpportunity()],
      NOW + 3_600_001,
    );
    expect(later.expired).toBe(true);
    expect(later.reasons).toEqual(["WAIT_EXPIRED"]);
    expect(later.waitingNeverDispatches).toBe(false);
    // A stale opportunity never matches (UNKNOWN is not FAILED; STALE is not attractive).
    const staleView = evaluateWaitCriteria(
      {
        waitId: "wait:rp:e2e:001", families: ["liquidity"], categories: [...WAIT_CATEGORIES],
        maxWaitMs: 3_600_000, maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE", routeRef: "plan:mixed-dex-offramp" },
        tradeOffs: [], declaredAt: NOW,
      },
      [realOpportunity()],
      NOW + 60_000,
    );
    expect(staleView.matchedOpportunityIds).toEqual([]);
  });
});
