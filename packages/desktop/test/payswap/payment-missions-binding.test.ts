/**
 * PaySwap Desktop (P18-C) — the PAYMENT-MISSIONS BINDING battery
 * (bridge tier; ADR-0011 D1/D2/D3).
 *
 * Composes the REAL renderer composition root (the payment-missions
 * module binding the channel members into the pinned port) and proves:
 *
 * (a) THE HONEST EMPTY ENVIRONMENT over the REAL channel: the REAL
 *     service + runtime (in-memory fs, the P18-A harness shape) —
 *     seed → nine-field capture → presentPreview through the PORT
 *     BLOCKS typed (INV-7: no observed funding source, dispatchable
 *     false, no compiled intent) → requestApproval fails TYPED (a
 *     blocked preview can never arm authorization — the honest
 *     unreachability, surfaced, never masked) → the board + detail
 *     through the port carry the truth; the artifact scan holds on
 *     every returned shape.
 * (b) THE APPROVAL GOLDEN PATH over the labeled test-tier gate
 *     environment (the ONLY replaced seam — the runtime's own fixture
 *     discipline, the P18-A battery precedent): a dispatchable preview
 *     → requestApproval through the PORT (the scope echoes the
 *     persisted preview verbatim) → resolveApproval APPROVE through
 *     the PORT → GRANTED with the scope echo + expiry, the artifact
 *     NEVER on the wire (deep scan), the mission timeline carries the
 *     authorization event, and the board row shows the truth. The
 *     DECLINE path on a second mission.
 * (c) DETERMINISTIC REPLAYS: the golden path over a second fresh
 *     harness → byte-identical scope + outcome JSON (the pinned clock
 *     + the sequential mint make both worlds identical).
 * (d) THE PLANE-NOT-CONFIGURED PATH: a service with no payment-mission
 *     runtime → every port call rejects with the app's typed
 *     PaymentMissionsPlaneNotConfiguredError (the bridge mapping) —
 *     the mount renders the honest note, never an error mask.
 */

import { describe, expect, it } from "vitest";

import {
  isPaymentMissionsPlaneNotConfigured,
  sharedPaymentMissionsPort,
} from "@payswap/app";

import {
  channelPaymentMissionsPort,
  composePaymentMissionsBinding,
} from "../../src/renderer/src/paymentMissionsComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import {
  harness,
  scriptedPassingEnvironment,
  T0,
} from "./payment-approval-plane-harness.js";

// T0/T1 are the HARNESS's own pinned clock (2026-10-22T12:00:00Z — before
// the scripted quote's 2026-10-23 expiry; the proven fixture instants).

/** The channel services facade over the REAL host service (the bridge's stand-in for the renderer connection). */
function servicesOf(service: unknown): DesktopConsoleChannelServices {
  return { payswapDesktopService: service } as unknown as DesktopConsoleChannelServices;
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
      // The harness fixture's deadline (the proven passing value, paired
      // with the harness's T0 clock — 2026-10-22 — which sits before the
      // scripted quote's 2026-10-23 expiry; the P18-A battery owns the
      // gate semantics, this bridge reuses the fixture verbatim).
      return { deadlineAt: "2026-10-23T12:00:00Z" };
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

/** Drive the full nine-field intake through the CHANNEL members (the real path). */
async function captureAllIntake(port: ReturnType<typeof channelPaymentMissionsPort>, missionId: string): Promise<void> {
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await port.askNextField(missionId);
    if (ask === null) return;
    await port.capture(missionId, ask.fieldId, intakeValueFor(ask.fieldId));
  }
}

/** The artifact/lineage scan: no artifact or lineage key may exist anywhere on the shape. */
const FORBIDDEN_KEYS = ["artifactId", "idempotencyKey", "commandId", "correlationId", "connectionRef"];
function scanClean(shape: unknown, path = "root"): void {
  if (shape === null || typeof shape !== "object") return;
  if (Array.isArray(shape)) {
    shape.forEach((item, i) => scanClean(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(shape)) {
    expect(FORBIDDEN_KEYS, `${path}.${key} must not exist on any wire shape`).not.toContain(key);
    scanClean(value, `${path}.${key}`);
  }
}

describe("(a) the honest empty environment over the REAL channel", () => {
  it("blocks the compile typed → the approval is honestly unreachable, surfaced typed, never masked", async () => {
    const world = await harness();
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const seeded = await world.service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay the supplier" });
      await captureAllIntake(composition.port, seeded.missionId);

      // The honest machinery through the PORT: BLOCK, dispatchable false, no intent (INV-7).
      const preview = await composition.port.presentPreview(seeded.missionId);
      expect(preview!.gates.decision).toBe("BLOCK");
      expect(preview!.dispatchable).toBe(false);
      expect(preview!.gates.reasons.length).toBeGreaterThan(0);
      const detail = await composition.port.detail(seeded.missionId);
      expect(detail!.intent).toBeUndefined();

      // The approval is UNREACHABLE in the empty environment — typed, never
      // masked (the intent-check fires first: no compiled intent can ever
      // arm authorization; the dispatchable-check is the second law).
      await expect(composition.port.requestApproval(seeded.missionId)).rejects.toThrow(
        /never arm authorization/,
      );

      // The board + detail carry the truth; every shape is artifact/lineage-clean.
      const board = await composition.port.board();
      expect(board).toHaveLength(1);
      expect(board[0]!.hasCompiledIntent).toBe(false);
      expect(board[0]!.hasPreview).toBe(true);
      scanClean(board);
      scanClean(detail);
      scanClean(preview);
    } finally {
      composition.reset();
    }
  });
});

describe("(b) the approval golden path + the decline path over the REAL channel", () => {
  it("requestApproval echoes the persisted preview verbatim → APPROVE grants with the scope echo, the artifact never on the wire", async () => {
    const world = await harness();
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const seeded = await world.service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay the supplier" });
      await captureAllIntake(composition.port, seeded.missionId);

      // The labeled test-tier DI (the ONLY replaced seam): a passing gate
      // environment makes the persisted preview dispatchable — the P18-A
      // battery's own fixture discipline.
      const dispatchable = await world.runtime.presentPreview(seeded.missionId, scriptedPassingEnvironment(T0));
      expect(dispatchable.dispatchable).toBe(true);

      // ACT 1 through the port: the scope echoes the persisted preview verbatim.
      const request = await composition.port.requestApproval(seeded.missionId);
      expect(request.missionId).toBe(seeded.missionId);
      expect(request.previewId).toBe(dispatchable.previewId);
      expect(request.scope.missionId).toBe(seeded.missionId);
      expect(request.scope.direction).toBe("PAY");
      expect(request.scope.amount).toEqual({ currency: "USD", minorUnits: "1500" });
      expect(typeof request.scope.intentDigest).toBe("string");
      expect(request.scope.intentDigest.length).toBeGreaterThan(0);
      expect(request.scopeSummary.length).toBeGreaterThan(0);
      expect(request.expiresAt > request.createdAt).toBe(true);
      scanClean(request);

      // ACT 2 through the port: the operator's decision — the origin is pinned
      // at the channel edge (this call supplies ONLY requestId + "APPROVE").
      const resolution = await composition.port.resolveApproval(request.requestId, "APPROVE");
      expect(resolution.outcome).toBe("GRANTED");
      if (resolution.outcome === "GRANTED") {
        expect(resolution.scope).toEqual(request.scope);
        expect(resolution.expiresAt).toBe(request.expiresAt);
      }
      scanClean(resolution);

      // The mission truth through the port: the timeline carries the authorization
      // event; the board row shows the compiled intent.
      const detail = await composition.port.detail(seeded.missionId);
      expect(detail!.intent).toBeDefined();
      expect(detail!.events.some((event) => event.kind === "AUTHORIZATION_GRANTED")).toBe(true);
      const board = await composition.port.board();
      expect(board[0]!.hasCompiledIntent).toBe(true);
      scanClean(detail);
      scanClean(board);
    } finally {
      composition.reset();
    }
  });

  it("the DECLINE path records the declined event and declines honestly", async () => {
    const world = await harness();
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const seeded = await world.service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay another supplier" });
      await captureAllIntake(composition.port, seeded.missionId);
      await world.runtime.presentPreview(seeded.missionId, scriptedPassingEnvironment(T0));

      const request = await composition.port.requestApproval(seeded.missionId);
      const resolution = await composition.port.resolveApproval(request.requestId, "DECLINE");
      expect(resolution.outcome).toBe("DECLINED");
      if (resolution.outcome === "DECLINED") {
        expect(resolution.reason.length).toBeGreaterThan(0);
      }
      scanClean(resolution);

      const detail = await composition.port.detail(seeded.missionId);
      expect(detail!.events.some((event) => event.kind === "AUTHORIZATION_DECLINED")).toBe(true);
      scanClean(detail);
    } finally {
      composition.reset();
    }
  });
});

describe("(c) deterministic replays", () => {
  it("the golden path over a second fresh harness → byte-identical scope + outcome", async () => {
    const runGoldenPath = async (): Promise<{ scope: unknown; outcome: unknown }> => {
      const world = await harness();
      const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
      try {
        const seeded = await world.service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay the supplier" });
        await captureAllIntake(composition.port, seeded.missionId);
        await world.runtime.presentPreview(seeded.missionId, scriptedPassingEnvironment(T0));
        const request = await composition.port.requestApproval(seeded.missionId);
        const resolution = await composition.port.resolveApproval(request.requestId, "APPROVE");
        return { scope: request.scope, outcome: resolution.outcome };
      } finally {
        composition.reset();
      }
    };
    const first = await runGoldenPath();
    const second = await runGoldenPath();
    expect(JSON.stringify(second.scope)).toBe(JSON.stringify(first.scope));
    expect(JSON.stringify(second.outcome)).toBe(JSON.stringify(first.outcome));
  });
});

describe("(d) the plane-not-configured path", () => {
  it("every port call rejects with the app's typed error — the honest note, never an error mask", async () => {
    // The REAL service with NO payment-mission runtime composed (the honest-unwired authority).
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: () => {} },
      { createSessionId: () => "session-p18c-unwired" },
    );
    const composition = composePaymentMissionsBinding({ services: servicesOf(service) });
    try {
      const port = composition.port;
      const probes: readonly (() => Promise<unknown>)[] = [
        () => port.board(),
        () => port.detail("task:PAYMENT_MISSION:x"),
        () => port.askNextField("task:PAYMENT_MISSION:x"),
        () => port.capture("task:PAYMENT_MISSION:x", "purpose", "x"),
        () => port.presentPreview("task:PAYMENT_MISSION:x"),
        () => port.requestApproval("task:PAYMENT_MISSION:x"),
        () => port.resolveApproval("req:x", "APPROVE"),
      ];
      let mapped = 0;
      for (const probe of probes) {
        try {
          await probe();
          expect.unreachable("every member must fail closed when the plane is not configured");
        } catch (thrown: unknown) {
          expect(isPaymentMissionsPlaneNotConfigured(thrown), `member must reject with the app typed error: ${String(thrown)}`).toBe(true);
          expect((thrown as Error).message.length).toBeGreaterThan(0);
          mapped += 1;
        }
      }
      expect(mapped).toBe(probes.length);
    } finally {
      composition.reset();
      expect(sharedPaymentMissionsPort()).toBeUndefined();
    }
  });
});
