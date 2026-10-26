// @vitest-environment jsdom
/**
 * @payswap/app — the ROUTE-PLANNING COMPOSITION-SEAM laws (P17-B;
 * ADR-0010 D5 — "the session seam is app-side and additive").
 *
 * The module-level composition seams, machine-checked against the REAL
 * mount with the REAL routine engines bound through the port (the
 * acceptance battery's proven adapter shape, reused here — with one
 * type-hygiene `as SimulationProgram` cast on the two program literals)
 * and the REAL session over the REAL BROWSER_PROFILE adapter:
 *
 * - THE HONEST DEFAULTS: with NO composition root bound, the shared
 *   engine is the fail-closed UNBOUND engine and there is NO shared
 *   session — the web-host truth (ADR-0010 D7): the mount renders the
 *   honest unbound note, never fabricated data, and the choices are not
 *   wired (module state is reset after every law — the seams never leak).
 * - THE COMPOSITION ROOT: bindRoutePlanningEngine + bindRoutePlanningSession
 *   actually WIRE the mount — with NO engine/session props, the mount
 *   presents the REAL engine view and the choices record live (Proceed →
 *   the stage-9a REQUEST record; the app NEVER writes AUTHORIZATION_GRANTED).
 * - THE RESET LAW: resetSharedRoutePlanningEngine/resetSharedRoutePlanningSession
 *   restore the honest defaults.
 * - THE BARREL LAW: the composition surface is exported from the package
 *   barrel (src/index.ts) — the platform host binds through the public API.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

// The REAL route-planning authority (test-tier relative imports — the
// established cross-package pattern; the app's src boundary stays
// pin-only, product law P2).
import {
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
  loadRoutineManifest,
  RoutineVersionPinLedger,
} from "../../../route-planning/src/manifest.ts";
import { buildRoutePlanningTrigger, RoutePlanningTriggerRegistry } from "../../../route-planning/src/trigger.ts";
import { deriveRailSnapshotPair } from "../../../route-planning/src/rail-snapshot.ts";
import { enumerateRouteCandidates } from "../../../route-planning/src/candidates.ts";
import { evaluateHardGates } from "../../../route-planning/src/hard-gates.ts";
import { rankRoutes } from "../../../route-planning/src/ranking.ts";
import {
  exploreBoundedScenarios,
  type ScenarioExplorationPort,
  type PinnedScenarioExploration,
  type ScenarioExplorationRequest,
} from "../../../route-planning/src/lab-adapter.ts";
// The REAL four-layer corridor chains + the REAL compiler evidence (route-planning's own fixtures).
import {
  movementCorridorQuery,
  movementIntentFixture,
  NOW,
  NOW_ISO,
  realCorridorProjectionPort,
  recipientChain,
  senderChain,
} from "../../../route-planning/test/fixtures.ts";
import { planningBestExecutionPolicy, planningEvidenceBundle, realRouteCompilationPort } from "../../../route-planning/test/compiler-evidence.ts";
// The REAL lab machinery (stage 6).
import { recordProductionFacts } from "../../../lab/src/replay.ts";
import { planScenarioSuite } from "../../../lab/src/scenario-budget.ts";
import { runInterventionCounterfactual } from "../../../lab/src/interventions.ts";
import type { RecordedProductionFacts, SimulationProgram } from "../../../lab/src/index.ts";
import type { ScenarioIntervention } from "../../../lab/src/interventions.ts";

// The app's own seams under test (the mount's composition seams + the
// session + the task-session port) and the PUBLIC BARREL.
import {
  bindRoutePlanningEngine,
  bindRoutePlanningSession,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedRoutePlanningEngine,
  sharedRoutePlanningSession,
  RoutePlanningMount,
} from "../../src/agent/RoutePlanningMount.js";
import { createRoutePlanningSession } from "../../src/agent/routePlanningSession.js";
import { createBrowserAgentTaskSessionPort, type AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import { createAgentComposerController, type AgentComposerController } from "../../src/agent/agentComposerController.js";
import {
  isRoutePlanningEngineUnbound,
  ROUTE_PLANNING_ENGINE_UNBOUND_NOTE,
  routePlanningViewDigestOf,
  type RoutePlanningEnginePort,
  type RoutePlanningEngineView,
} from "../../src/agent/routePlanningPins.js";
import * as appBarrel from "../../src/index.js";

const T0 = "2026-10-22T12:00:00Z";
const T1 = "2026-10-22T12:05:00Z";

/** The in-memory storage seam (deterministic; localStorage-shaped). */
function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

afterEach(() => {
  cleanup();
  resetSharedRoutePlanningEngine();
  resetSharedRoutePlanningSession();
});

/* -------- the REAL engines, bound through the app's port (the acceptance
 * battery's proven adapter shape — test/payswap/route-planning-
 * acceptance.test.ts, reused verbatim) -------- */

/** The REAL stage-6 lab machinery bound through the adapter port. */
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

/** THE REAL ENGINE ADAPTER (the composition-root shape the platform host
 * will bind — ADR-0010 D4): runs stages 0-7 of the REAL routine over the
 * REAL engines and maps the results into the app's pinned engine view. */
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
        baseProgram: { programId: "rp.app.base", programVersion: "1.0.0", routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true, authorizationMode: "PROTOCOL_AUTHORIZED" } as SimulationProgram,
        variantProgram: { programId: "rp.app.variant", programVersion: "1.0.0", routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false, delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true, authorizationMode: "PROTOCOL_AUTHORIZED" } as SimulationProgram,
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

/* ----------------------- the composition harness ----------------------- */

/** One composition root: ONE task-session port shared by the composer
 * controller and the route-planning session (the P17-C renderer shape). */
interface SeamHarness {
  readonly port: ReturnType<typeof createBrowserAgentTaskSessionPort>;
  readonly controller: AgentComposerController;
  seedPaymentMissionTask(): Promise<string>;
}

function makeHarness(): SeamHarness {
  const port = createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
  const controller = createAgentComposerController({ session: port, clock: () => T1 });
  return {
    port,
    controller,
    async seedPaymentMissionTask() {
      const { task } = await port.seedOrResume({
        intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
        origin: "COMPOSER_TEXT",
        now: T0,
        originNote: "pay the supplier",
      });
      await controller.refresh();
      return task.id;
    },
  };
}

/* -------------------------------- the laws ------------------------------- */

describe("the honest defaults (no composition root bound — the web-host truth, ADR-0010 D7)", () => {
  it("the shared engine is the fail-closed UNBOUND engine and there is NO shared session", () => {
    expect(sharedRoutePlanningSession()).toBeUndefined();
    let thrown: unknown;
    try {
      sharedRoutePlanningEngine().presentableView({ taskRef: "task:seam:001" });
    } catch (caught) {
      thrown = caught;
    }
    expect(isRoutePlanningEngineUnbound(thrown)).toBe(true);
  });

  it("an unbound mount renders the honest unbound note — no sections, no wired choices, no fabricated data", async () => {
    const harness = makeHarness();
    await harness.seedPaymentMissionTask();
    const { container } = render(<RoutePlanningMount controller={harness.controller} />);
    const section = container.querySelector(".ps-agent-route")!;
    expect(section.textContent).toContain(ROUTE_PLANNING_ENGINE_UNBOUND_NOTE);
    expect(container.querySelector("#ps-agent-route-section-available-now")).toBeNull();
    expect(container.querySelector("[data-ps-route-choice='PROCEED']")).toBeNull();
  });
});

describe("the composition root (bindRoutePlanningEngine + bindRoutePlanningSession wire the mount)", () => {
  it("binding BOTH seams presents the REAL engine view and records the choices live — with NO engine/session props", async () => {
    const harness = makeHarness();
    const taskId = await harness.seedPaymentMissionTask();
    bindRoutePlanningEngine(realRoutePlanningEngine());
    bindRoutePlanningSession(createRoutePlanningSession({ session: harness.port, clock: () => T1 }));

    const { container } = render(<RoutePlanningMount controller={harness.controller} />);
    // The mount presents the REAL engine's view through the SEAMS (no props).
    const availableNow = container.querySelector("#ps-agent-route-section-available-now")!;
    expect(availableNow).not.toBeNull();
    const ranked = availableNow.querySelectorAll(".ps-agent-route-item");
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]!.textContent).toContain("#1");
    expect(container.querySelector("[data-ps-route-choice='PROCEED']")).not.toBeNull();
    expect(container.querySelector("[data-ps-route-choice='WAIT']")).not.toBeNull();
    // The shared session wired the choices — the not-wired note is GONE.
    expect(container.querySelector(".ps-agent-route")!.textContent).not.toContain("The Wait choice is not wired in this deployment");

    // Flush the PREVIEW_PRESENTED record, then choose Proceed (stage 9a).
    await act(async () => {});
    await act(async () => {
      fireEvent.click(container.querySelector("[data-ps-route-choice='PROCEED']")!);
    });
    const task = await harness.port.taskDetail(taskId);
    expect(task!.events.map((event) => event.kind)).toEqual(["CREATED", "PREVIEW_PRESENTED", "ATTEMPT_STARTED"]);
    expect(task!.events[2]!.summary).toContain("Proceed request recorded for plan '");
    expect(task!.events[2]!.summary).toContain("a REQUEST record, never an authorization");
    // THE STRUCTURAL LAW: no AUTHORIZATION_GRANTED anywhere in the record.
    expect(JSON.stringify(task)).not.toContain("AUTHORIZATION_GRANTED");
  });
});

describe("the reset law (the composition seams never leak between laws)", () => {
  it("resetSharedRoutePlanningEngine/resetSharedRoutePlanningSession restore the honest defaults", () => {
    bindRoutePlanningEngine(realRoutePlanningEngine());
    const session = createRoutePlanningSession({ session: createBrowserAgentTaskSessionPort({ storage: fakeStorage() }), clock: () => T1 });
    bindRoutePlanningSession(session);
    expect(sharedRoutePlanningSession()).toBe(session);
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
    expect(sharedRoutePlanningSession()).toBeUndefined();
    let thrown: unknown;
    try {
      sharedRoutePlanningEngine().presentableView({ taskRef: "task:seam:002" });
    } catch (caught) {
      thrown = caught;
    }
    expect(isRoutePlanningEngineUnbound(thrown)).toBe(true);
  });
});

describe("the barrel law (the composition surface is the public API — src/index.ts)", () => {
  it("exports the six seam functions, the session/port constructors and the typed-error guard", () => {
    for (const seam of [
      appBarrel.bindRoutePlanningEngine,
      appBarrel.sharedRoutePlanningEngine,
      appBarrel.resetSharedRoutePlanningEngine,
      appBarrel.bindRoutePlanningSession,
      appBarrel.sharedRoutePlanningSession,
      appBarrel.resetSharedRoutePlanningSession,
      appBarrel.createRoutePlanningSession,
      appBarrel.createBrowserAgentTaskSessionPort,
      appBarrel.routePlanningViewDigestOf,
      appBarrel.isRoutePlanningNoIntentError,
    ] as const) {
      expect(typeof seam).toBe("function");
    }
    expect(new appBarrel.RoutePlanningNoIntentError("task:seam:003").kind).toBe("NO_VALIDATED_INTENT");
    // The typed composition surface compiles through the same barrel.
    const port: appBarrel.AgentTaskSessionPort = appBarrel.createBrowserAgentTaskSessionPort({ storage: fakeStorage() });
    const session: appBarrel.RoutePlanningSession = appBarrel.createRoutePlanningSession({ session: port, clock: () => T1 });
    expect(typeof session.chooseProceed).toBe("function");
    const engineRequest: appBarrel.RoutePlanningEngineRequest = { taskRef: "task:seam:003" };
    expect(engineRequest.taskRef).toBe("task:seam:003");
  });
});
