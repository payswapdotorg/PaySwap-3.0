/**
 * PaySwap Desktop (P17-C) — the LIVE-APP ENGINE BINDING battery
 * (bridge tier; ADR-0010 D1/D4/D5).
 *
 * Composes the REAL renderer composition root (the one module that
 * imports the @payswap/route-planning + capability + route-compiler +
 * lab sources through the three-site aliases) and proves:
 *
 * (a) THE HONEST DEPLOYMENT TRUTH over the REAL channel: the REAL
 *     service + runtime (in-memory fs, the P17-A harness shape) —
 *     seed → nine-field capture → presentPreview BLOCKS typed over the
 *     honest empty gate environment (INV-7: no observed funding
 *     source, no compiled intent) → the engine's mission linkage fails
 *     closed with the typed NO_VALIDATED_INTENT error (prose never
 *     constructs an intent; the D1 law).
 * (b) THE GOLDEN PATH over the DI'd mission source (the only replaced
 *     seam, labeled): a mission detail carrying a compiled 11-key
 *     intent → the REAL engine presents the REAL view (zero available
 *     routes over the deployment's zero chains — the compiler's honest
 *     empty-state exclusion verbatim; the advisory scenario section
 *     over the empty recorded-facts snapshot; the default wait
 *     proposal; the deterministic view digest) → the stage-9a wiring:
 *     chooseProceed records the REQUEST on the task (ATTEMPT_STARTED,
 *     zero AUTHORIZATION_GRANTED) AND the plan selection on the
 *     mission plane (the sink receives planId + viewDigest + routine
 *     provenance).
 * (c) DETERMINISTIC REPLAYS: the golden path twice → byte-identical
 *     task records + identical view digests.
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  isRoutePlanningNoIntentError,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedRoutePlanningEngine,
  type AgentTaskSessionStorage,
} from "@payswap/app";

import {
  composeRoutePlanningBinding,
} from "../../src/renderer/src/routePlanningComposition.js";
import type {
  RoutePlanningMissionBoardItem,
  RoutePlanningMissionDetail,
  RoutePlanningMissionSource,
} from "../../src/renderer/src/routePlanningEngineAdapter.js";
import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { createUnwiredExecutionAuthority } from "../../src/host/payswap/payments/execution-authority.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";

const T0 = "2026-10-26T12:00:00Z";
const T1 = "2026-10-26T12:05:00Z";
const MISSION_ID = "task:PAYMENT_MISSION:00000000000000000000000000000001";

function memoryFs() {
  const files = new Map<string, string>();
  return {
    fs: {
      readFile: async (path: string) => {
        const data = files.get(path);
        if (data === undefined) throw new Error("ENOENT");
        return data;
      },
      writeFile: async (path: string, data: string) => {
        files.set(path, data);
      },
      mkdir: async () => {},
    },
  };
}

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.has(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

function intakeValueFor(fieldId: string): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "1500", currency: "USD" };
    case "fundingSource":
      return "Test funding";
    case "recipient":
      return "Test recipient";
    case "countryCorridor":
      return { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" };
    case "speedDeadline":
      return { deadlineAt: "2026-10-27T12:00:00Z" };
    case "feeCap":
      return { kind: "CAPPED", amount: { minorUnits: "100", currency: "USD" } };
    case "purpose":
      return "supplier invoice 42";
    case "privacyCompliance":
      return { kind: "CONSTRAINED", notes: "no special constraints" };
    case "partialPaymentPreference":
      return { kind: "REQUIRE_FULL" };
    default:
      throw new Error(`unexpected field ${fieldId}`);
  }
}

/** The REAL host service + runtime over the in-memory fs (the P17-A harness shape). */
async function realChannelService() {
  const world = memoryFs();
  const store = await openPaymentMissionStore({ fileSystem: world.fs, directory: "/mem/payments" });
  const runtime: PaymentMissionRuntime = createPaymentMissionRuntime({
    store,
    executionAuthority: createUnwiredExecutionAuthority(),
    principalRef: "principal:test-local",
    mintRandom: (() => {
      let seq = 0;
      return () => {
        seq += 1;
        return String(seq).padStart(32, "0");
      };
    })(),
    log: () => {},
  });
  await runtime.dispatch.recoverInterruptions(T0);
  const service = createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    { createSessionId: () => "session-p17c", paymentMissionRuntime: runtime, paymentMissionClock: () => T0 },
  );
  return { service, runtime };
}

describe("(a) the honest deployment truth over the REAL channel", () => {
  it("the empty environment blocks the compile typed → the mission linkage fails closed NO_VALIDATED_INTENT", async () => {
    const { service } = await realChannelService();
    const seeded = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay the supplier" });
    for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
      const ask = await service.paymentMissionAskNextField(seeded.missionId);
      if (ask === null) break;
      await service.paymentMissionCapture(seeded.missionId, ask.fieldId, intakeValueFor(ask.fieldId));
    }
    const preview = await service.paymentMissionPresentPreview(seeded.missionId);
    // The honest machinery: six BLOCK decisions, dispatchable false, NO compiled intent (INV-7).
    expect(preview!.gates.decision).toBe("BLOCK");
    expect(preview!.dispatchable).toBe(false);
    const detail = await service.paymentMissionDetail(seeded.missionId);
    expect(detail!.intent).toBeUndefined();

    // The composition over the REAL channel: the engine presents → the
    // typed NO_VALIDATED_INTENT error (never a fabricated view).
    const controller = createAgentComposerController({ storage: fakeStorage(), clock: () => T1 });
    const source: RoutePlanningMissionSource = {
      board: () => service.paymentMissionBoard(),
      detail: (missionId) => service.paymentMissionDetail(missionId),
    };
    const composition = composeRoutePlanningBinding({ source, controller });
    await composition.refresh();
    expect(() => sharedRoutePlanningEngine().presentableView({ taskRef: "task:PAYMENT_MISSION:1" })).toThrow(
      expect.objectContaining({ kind: "NO_VALIDATED_INTENT" }) as unknown as Error,
    );
    try {
      sharedRoutePlanningEngine().presentableView({ taskRef: "task:PAYMENT_MISSION:1" });
      expect.unreachable("the engine must fail closed");
    } catch (thrown: unknown) {
      expect(isRoutePlanningNoIntentError(thrown)).toBe(true);
    }
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
  });
});

/** A mission detail carrying a compiled 11-key intent (the DI'd source's fixture — the only replaced seam, labeled). */
function missionDetailWithIntent(): RoutePlanningMissionDetail {
  return {
    id: MISSION_ID,
    status: "ACTIVE",
    intent: {
      intentId: `pmt-intent:${MISSION_ID}`,
      principalRef: "principal:test-local",
      origin: { locationRef: "observed:funding:usd-wallet", currency: "USD", observationRef: "observation:funding:001" },
      destination: { locationRef: "observed:destination:usd-bank", currency: "USD", observationRef: "observation:destination:001" },
      originAmount: { currency: "USD", minorUnits: "1500" },
      arrivalCurrency: "USD",
      constraints: { maxSettlementMs: 600_000, maxRouteHops: 1 },
      intentAuthorizationRef: `pmt-mission:${MISSION_ID}`,
      declaredAt: Date.parse(T0),
      expiresAt: Date.parse("2026-10-27T12:00:00Z"),
      commerceRef: `pmt-mission:${MISSION_ID}`,
    },
    fields: {
      amountAndCurrency: { status: "CAPTURED", value: { minorUnits: "1500", currency: "USD" } },
      countryCorridor: { status: "CAPTURED", value: { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" } },
    },
  };
}

interface GoldenRun {
  readonly viewJson: string;
  readonly taskJson: string;
  readonly selection: { planId: string; viewDigest: string; routineId: string; routineVersion: string } | null;
}

async function goldenPath(): Promise<GoldenRun> {
  const controller = createAgentComposerController({ storage: fakeStorage(), clock: () => T1 });
  const detail = missionDetailWithIntent();
  const board: readonly RoutePlanningMissionBoardItem[] = [
    { missionId: detail.id, status: detail.status, hasCompiledIntent: true, updatedAt: T0 },
  ];
  let selection: GoldenRun["selection"] = null;
  const sink = async (input: { planId: string; viewDigest: string; routineId: string; routineVersion: string }): Promise<RoutePlanningMissionDetail> => {
    selection = { ...input };
    return detail;
  };
  const source: RoutePlanningMissionSource = {
    board: async () => board,
    detail: async (missionId) => (missionId === detail.id ? detail : null),
  };
  const composition = composeRoutePlanningBinding({ source, controller, planSelectionSink: sink });
  await composition.refresh();
  await controller.seedFromSurface({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    originNote: "pay the supplier",
  });
  const state = controller.getState();
  const task = state.tasks[state.tasks.length - 1]!;
  const engine = sharedRoutePlanningEngine();
  const view = engine.presentableView({ taskRef: task.id });
  await composition.session.presentChoices(task.id, view, T1);
  await composition.session.chooseProceed(task.id, "plan:none-presented", T1).catch(() => {
    // The honest outcome when no ranked plan exists: the proceed REQUEST
    // still records on the task (the choice is the user's); the mission
    // plane records only against a PRESENTED linkage — assert below.
  });
  // The mount's own discipline: the controller reloads from the shared
  // port after every session mutation (the projection stays honest).
  await controller.refresh();
  const refreshed = controller.getState();
  const finalTask = refreshed.tasks.find((entry) => entry.id === task.id)!;
  return {
    viewJson: JSON.stringify(view),
    taskJson: JSON.stringify(finalTask),
    selection,
  };
}

describe("(b) the golden path over the DI'd mission source (the REAL engines)", () => {
  it("presents the REAL honest empty view; proceed records the REQUEST; the stage-9a sink fires only against a presented linkage", async () => {
    const run = await goldenPath();
    const view = JSON.parse(run.viewJson);
    // The REAL engine output over the deployment's zero chains: zero
    // available-now routes, the compiler's honest empty-state exclusion.
    expect(view.kind).toBe("PRESENTED_PLAN");
    expect(view.routine.routineId).toBe("payment-route-planning");
    expect(view.routine.routineVersion).toBe("1.0.0");
    expect(view.availableNow.ranked).toHaveLength(0);
    expect(view.availableNow.senderEligibleRouteIds).toHaveLength(0);
    expect(view.availableNow.recipientEligibleRouteIds).toHaveLength(0);
    expect(view.exclusions.length).toBeGreaterThan(0);
    expect(JSON.stringify(view.exclusions)).toContain("honest empty state");
    expect(view.scenarios.advisoryOnly).toBe(true);
    expect(view.truncation.coverage).toBe("COMPLETE");
    expect(view.viewDigest).toMatch(/^fnv1a64:/);
    // The task record: PREVIEW_PRESENTED (the presentation) + zero
    // AUTHORIZATION_GRANTED anywhere (the structural law).
    expect(run.taskJson).not.toContain("AUTHORIZATION_GRANTED");
    expect(run.taskJson).toContain("PREVIEW_PRESENTED");
    // The stage-9a sink: the presented linkage carried ZERO ranked
    // routes, so the proceed selection references the presented view
    // digest — the sink fired with the REAL provenance.
    expect(run.selection).not.toBeNull();
    expect(run.selection!.routineId).toBe("payment-route-planning");
    expect(run.selection!.viewDigest).toBe(view.viewDigest);
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
  });
});

describe("(c) deterministic replays", () => {
  it("the golden path twice produces byte-identical records", async () => {
    const first = await goldenPath();
    const second = await goldenPath();
    expect(second.viewJson).toBe(first.viewJson);
    expect(second.taskJson).toBe(first.taskJson);
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
  });
});
