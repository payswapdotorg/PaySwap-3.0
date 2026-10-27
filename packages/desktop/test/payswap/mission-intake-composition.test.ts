/**
 * PaySwap Desktop (P21-B run 2, ADR-0014 D2/D3) — the MISSION-INTAKE
 * COMPOSITION battery (bridge tier; failing-first).
 *
 * The renderer composition root that binds the REAL channel members
 * (paymentMissionSeed / paymentMissionAskNextField /
 * paymentMissionCapture) behind the app's pinned MissionIntakePlanePort:
 *
 * - the adapter maps each member call 1:1 (seed/ask/capture) and NEVER
 *   invents an origin (the input the channel receives carries EXACTLY
 *   the two caller fields — the origin stays host-pinned) or a field
 *   order (the ask order is the channel's own);
 * - FAIL-CLOSED: a member rejection surfaces as the typed error, never
 *   a coerced outcome; a host plane-not-configured failure maps onto
 *   the honest not-configured error class;
 * - the SHARED binding: composeMissionIntakeBinding binds the shared
 *   plane BEFORE the first shared-controller construction — a composer
 *   created afterwards seeds a REAL mission through the channel;
 * - the STAGE-PROJECTION INPUT binding (D3): the engine adapter's
 *   missionFacts read returns the mission's typed timeline + status
 *   over the channel mission cache (null when unknown).
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  resetSharedAgentComposerController,
  resetSharedMissionIntakePlane,
  sharedMissionIntakePlane,
  type AgentTaskSessionStorage,
  type MissionIntakePlanePort,
} from "@payswap/app";

import {
  channelMissionIntakePlane,
  composeMissionIntakeBinding,
  MissionIntakePlaneNotConfiguredError,
} from "../../src/renderer/src/missionIntakeComposition.js";
import { createRealRoutePlanningEngine } from "../../src/renderer/src/routePlanningEngineAdapter.js";
import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { createUnwiredExecutionAuthority } from "../../src/host/payswap/payments/execution-authority.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";

const T0 = "2026-10-27T12:00:00Z";

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
    { createSessionId: () => "session-p21b", paymentMissionRuntime: runtime, paymentMissionClock: () => T0 },
  );
  return { service, runtime };
}

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
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

/* ------------- the scripted channel client (the member shapes) ------------- */

interface ScriptedCalls {
  readonly seeds: { readonly direction: string; readonly goalStatement: string; readonly keyCount: number }[];
  readonly asks: string[];
  readonly captures: { readonly missionId: string; readonly fieldId: string; readonly value: unknown }[];
}

function scriptedChannel(options?: { readonly refuseCapture?: boolean; readonly notConfigured?: boolean }) {
  const calls: ScriptedCalls = { seeds: [], asks: [], captures: [] };
  let missionSeq = 0;
  const missions = new Map<string, Set<string>>();
  const client = {
    async paymentMissionSeed(input: { direction: string; goalStatement: string }) {
      calls.seeds.push({ direction: input.direction, goalStatement: input.goalStatement, keyCount: Object.keys(input).length });
      if (options?.notConfigured === true) {
        const error = new Error("not configured") as Error & { name: string };
        error.name = "PaymentPlaneNotConfiguredError";
        throw error;
      }
      missionSeq += 1;
      const id = `task:PAYMENT_MISSION:${String(missionSeq).padStart(2, "0")}`;
      missions.set(id, new Set());
      return { missionId: id, action: "CREATED" as const };
    },
    async paymentMissionAskNextField(missionId: string) {
      calls.asks.push(missionId);
      const captured = missions.get(missionId);
      if (captured === undefined) throw new Error("unknown mission");
      const next = PAYMENT_INTAKE_FIELD_IDS.find((field) => !captured.has(field));
      return next === undefined ? null : { fieldId: next, question: `Q(${next})` };
    },
    async paymentMissionCapture(missionId: string, fieldId: string, value: unknown) {
      calls.captures.push({ missionId, fieldId, value });
      if (options?.refuseCapture === true) {
        throw new Error("the capture was refused: amountAndCurrency.minorUnits must be POSITIVE");
      }
      missions.get(missionId)?.add(fieldId);
      return { id: missionId };
    },
  };
  return { client, calls };
}

describe("the channel mission-intake plane adapter (the 1:1 member mapping)", () => {
  it("maps seedMission/askNextField/captureField 1:1 onto the channel members — and NEVER invents an origin or a field order", async () => {
    const { client, calls } = scriptedChannel();
    const plane: MissionIntakePlanePort = channelMissionIntakePlane({ payswapDesktopService: client as never });
    const seeded = await plane.seedMission({ direction: "PAY", goalStatement: "pay the supplier" });
    expect(seeded.action).toBe("CREATED");
    // The channel received EXACTLY the two caller fields — the origin
    // stays HOST-PINNED (COMPOSER_TEXT), never renderer-supplied.
    expect(calls.seeds).toHaveLength(1);
    expect(calls.seeds[0]!.keyCount).toBe(2);
    expect(calls.seeds[0]!.direction).toBe("PAY");
    // The ask order is the CHANNEL's own (askNextField delegates; the
    // adapter never constructs one).
    const ask = await plane.askNextField(seeded.missionId);
    expect(ask!.fieldId).toBe(PAYMENT_INTAKE_FIELD_IDS[0]);
    // The capture passes the value through unchanged.
    const value = intakeValueFor(ask!.fieldId);
    await plane.captureField(seeded.missionId, ask!.fieldId, value);
    expect(calls.captures[0]!.value).toEqual(value);
  });

  it("FAILS CLOSED: a member rejection surfaces as the typed error (never coerced); a not-configured plane maps onto the honest class", async () => {
    const refusing = scriptedChannel({ refuseCapture: true });
    const refusingPlane = channelMissionIntakePlane({ payswapDesktopService: refusing.client as never });
    const seeded = await refusingPlane.seedMission({ direction: "PAY", goalStatement: "pay" });
    const ask = await refusingPlane.askNextField(seeded.missionId);
    await expect(refusingPlane.captureField(seeded.missionId, ask!.fieldId, { minorUnits: "0", currency: "USD" }))
      .rejects.toThrow("the capture was refused");

    const unconfigured = scriptedChannel({ notConfigured: true });
    const unconfiguredPlane = channelMissionIntakePlane({ payswapDesktopService: unconfigured.client as never });
    await expect(unconfiguredPlane.seedMission({ direction: "PAY", goalStatement: "pay" }))
      .rejects.toBeInstanceOf(MissionIntakePlaneNotConfiguredError);
  });
});

describe("the shared composition binding (the desktop business root)", () => {
  it("composeMissionIntakeBinding binds the shared plane — a composer constructed afterwards seeds a REAL mission through the channel", async () => {
    const { service } = await realChannelService();
    resetSharedMissionIntakePlane();
    resetSharedAgentComposerController();
    try {
      const composition = composeMissionIntakeBinding({ services: { payswapDesktopService: service } as never });
      expect(sharedMissionIntakePlane()).toBe(composition.plane);
      // The composer constructed AFTER the binding rides the plane.
      const controller = createAgentComposerController({ storage: fakeStorage(), clock: () => T0 });
      controller.setDraft("pay the supplier");
      await controller.send();
      const intake = controller.getState().missionIntake;
      expect(intake.phase).toBe("ASKING");
      expect(intake.missionId).toBeDefined();
      expect(intake.pendingAsk!.fieldId).toBe(PAYMENT_INTAKE_FIELD_IDS[0]);
      // The REAL channel sees the mission (the board lists it).
      const board = await service.paymentMissionBoard();
      expect(board.length).toBeGreaterThan(0);
    } finally {
      resetSharedMissionIntakePlane();
      resetSharedAgentComposerController();
    }
  });

  it("the composition requires the channel services (honest failure — nothing is bound)", () => {
    expect(() => composeMissionIntakeBinding({})).toThrow(/requires the payswap-desktop channel services/);
  });
});

describe("the stage-projection input binding (D3 — the engine's missionFacts read)", () => {
  it("missionFacts returns the mission's typed timeline + status over the mission cache (null when unknown)", async () => {
    const { service } = await realChannelService();
    const seeded = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay the supplier" });
    const ask = await service.paymentMissionAskNextField(seeded.missionId);
    await service.paymentMissionCapture(seeded.missionId, ask!.fieldId, intakeValueFor(ask!.fieldId));

    const missions: { missionId: string; status: string; hasCompiledIntent: boolean; updatedAt: string }[] = [];
    const details = new Map<string, unknown>();
    const state = {
      missions,
      details,
      lastPresented: null,
      planSelectionSink: null,
    };
    const source = {
      board: async () => missions,
      detail: async (missionId: string) => details.get(missionId) ?? null,
    };
    const engine = createRealRoutePlanningEngine(source as never, state as never, state as never) as unknown as {
      missionFacts(missionId: string): { missionId: string; missionStatus: string; events: readonly { kind: string }[] } | null;
    };
    // The channel detail (with its timeline) feeds the cache.
    const detail = await service.paymentMissionDetail(seeded.missionId);
    details.set(seeded.missionId, detail);
    missions.push({ missionId: seeded.missionId, status: detail!.status, hasCompiledIntent: false, updatedAt: detail!.updatedAt });

    const facts = engine.missionFacts(seeded.missionId);
    expect(facts).not.toBeNull();
    expect(facts!.missionId).toBe(seeded.missionId);
    expect(facts!.events.some((event) => event.kind === "MISSING_FIELD_ASKED")).toBe(true);
    expect(facts!.events.some((event) => event.kind === "FIELD_CAPTURED")).toBe(true);
    expect(engine.missionFacts("task:PAYMENT_MISSION:unknown")).toBeNull();
  });
});
