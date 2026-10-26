/**
 * PaySwap Desktop (P17-A) — the mission-plane CHANNEL battery.
 *
 * Composes the REAL service with the REAL payment-mission runtime over
 * an in-memory file system (the p14 script composition precedent:
 * openPaymentMissionStore → createPaymentMissionRuntime →
 * recoverInterruptions once) and drives the read/input channel members
 * end-to-end:
 *
 * - SEED → ASK → CAPTURE: the nine-field intake completes over the
 *   channel; the host PINS the origin to COMPOSER_TEXT (PREVIEW_UI_ACT
 *   is reserved for the authority act and can never arrive here);
 * - PRESENT PREVIEW: the HONEST typed outcome over the empty gate
 *   environment — six BLOCK decisions with verbatim reasons,
 *   dispatchable false, NO fabricated intent (INV-7);
 * - PLAN SELECTION (the stage-9a landing site, ADR-0010 D3): the event
 *   + the record field + the RECORD-only prose; re-selection replaces
 *   the field while the events stay append-only;
 * - BOARD/DETAIL read-backs (attempt COUNT only — no artifact plane);
 * - FAIL-CLOSED: every member throws the typed
 *   PaymentPlaneNotConfiguredError when the runtime is not injected;
 * - RESTART: the persisted snapshot round-trips — the plan selection
 *   AND wait-kind events survive a store re-open (proving the store
 *   validator re-pin that fixes the P16-D quarantine defect), while a
 *   malformed plan selection quarantines fail-closed.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ServiceCollection } from "@zcode/services";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import { PaymentPlaneNotConfiguredError } from "../../src/host/payswap/shell/service.js";
import { createPaymentMissionChannelMembers } from "../../src/host/payswap/shell/payment-mission-members.js";
import {
  derivePaymentsStoreDirectory,
  registerPaySwapDesktopService,
  IPaySwapDesktopServiceDescriptor,
} from "../../src/host/payswap/index.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import { PAYMENTS_SNAPSHOT_FILE_NAME } from "../../src/host/payswap/payments/payments-snapshot-format.js";
import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { createUnwiredExecutionAuthority } from "../../src/host/payswap/payments/execution-authority.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import type { IPaySwapDesktopService } from "../../src/host/payswap/shell/contracts.js";

const T0 = "2026-10-26T12:00:00Z";
const T1 = "2026-10-26T12:05:00Z";
const PLAN_A = "route-plan:pmt-intent:task:PAYMENT_MISSION:00000000000000000000000000000001:mixed-dex-offramp";
const PLAN_B = "route-plan:pmt-intent:task:PAYMENT_MISSION:00000000000000000000000000000001:provider-native-offramp";
const VIEW_DIGEST = "fnv1a64:1abba70f0107d1b2";

/** The in-memory fs seam (the p14 script + runtime-battery precedent). */
function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
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

/** A deterministic pinned host clock (the channel edge stamps every instant). */
function pinnedClock(): () => string {
  return () => T0;
}

interface Harness {
  readonly service: IPaySwapDesktopService;
  readonly files: Map<string, string>;
  readonly runtime: PaymentMissionRuntime;
}

/** Compose the REAL service over the REAL runtime (in-memory fs). */
async function harness(): Promise<Harness> {
  const world = memoryFs();
  const clock = pinnedClock();
  const store = await openPaymentMissionStore({ fileSystem: world.fs, directory: "/mem/payments" });
  const runtime = createPaymentMissionRuntime({
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
    {
      createSessionId: () => "session-p17a",
      paymentMissionRuntime: runtime,
      paymentMissionClock: clock,
    },
  );
  return { service, files: world.files, runtime };
}

/** The nine intake fixture values (the runtime battery's own fixtures). */
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

/** Drive the channel intake to completion; returns the mission id. */
async function completeIntakeOverChannel(service: IPaySwapDesktopService): Promise<string> {
  const seeded = await service.paymentMissionSeed({
    direction: "PAY",
    goalStatement: "pay the supplier (P17-A channel battery)",
  });
  expect(seeded.action).toBe("CREATED");
  expect(seeded.missionId).toMatch(/^task:PAYMENT_MISSION:[0-9a-f]{32}$/);
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length + 1; round += 1) {
    const ask = await service.paymentMissionAskNextField(seeded.missionId);
    if (ask === null) break;
    const detail = await service.paymentMissionCapture(seeded.missionId, ask.fieldId, intakeValueFor(ask.fieldId));
    expect(detail.id).toBe(seeded.missionId);
  }
  return seeded.missionId;
}

describe("the mission-plane channel: seed → ask → capture (the host pins the origin)", () => {
  it("the nine-field intake completes over the channel, in the pinned order, fail-closed on unknown fields", async () => {
    const { service } = await harness();
    const seeded = await service.paymentMissionSeed({
      direction: "PAY",
      goalStatement: "pay the supplier (P17-A channel battery)",
    });
    const asked: string[] = [];
    for (let round = 0; round < 12; round += 1) {
      const ask = await service.paymentMissionAskNextField(seeded.missionId);
      if (ask === null) break;
      expect(ask.question.length).toBeGreaterThan(0);
      asked.push(ask.fieldId);
      await service.paymentMissionCapture(seeded.missionId, ask.fieldId, intakeValueFor(ask.fieldId));
    }
    expect(asked).toEqual([...PAYMENT_INTAKE_FIELD_IDS]);
    expect(await service.paymentMissionAskNextField(seeded.missionId)).toBeNull();

    // The channel seed comes from the composer text plane — the host
    // PINS the origin (PREVIEW_UI_ACT can never arrive through here).
    const detail = await service.paymentMissionDetail(seeded.missionId);
    expect(detail?.origin).toBe("COMPOSER_TEXT");
    expect(detail?.fields.amountAndCurrency).toEqual({
      status: "CAPTURED",
      value: { minorUnits: "1500", currency: "USD" },
    });

    // An unknown field id is a typed refusal — never a foreign field.
    await expect(
      service.paymentMissionCapture(seeded.missionId, "notAField", "x"),
    ).rejects.toThrow(/nine intake fields/);
  });

  it("a second in-window seed with the same direction CONVERGES (RESUMED, same mission)", async () => {
    const { service } = await harness();
    const first = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay" });
    const second = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay again" });
    expect(second.action).toBe("RESUMED");
    expect(second.missionId).toBe(first.missionId);
  });
});

describe("the mission-plane channel: presentPreview (the HONEST typed outcome)", () => {
  it("the honest empty gate environment BLOCKS all six gates with verbatim reasons; no intent is fabricated (INV-7)", async () => {
    const { service } = await harness();
    const missionId = await completeIntakeOverChannel(service);
    const preview = await service.paymentMissionPresentPreview(missionId);
    expect(preview).not.toBeNull();
    // The exact honest machinery outcome: six BLOCK decisions.
    expect(preview!.gates.decision).toBe("BLOCK");
    expect(preview!.gates.decisions).toHaveLength(6);
    for (const decision of preview!.gates.decisions) {
      expect(decision.decision).toBe("BLOCK");
      expect(decision.reason.length).toBeGreaterThan(0);
    }
    expect(preview!.gates.reasons).toEqual(preview!.gates.decisions.map((decision) => decision.reason));
    expect(preview!.dispatchable).toBe(false);
    expect(preview!.missionId).toBe(missionId);
    expect(preview!.previewId).toMatch(/^pmt-preview:/);
    expect(preview!.presentedAt).toBe(T0);

    // INV-7: with no observed funding source the compile BLOCKS typed —
    // the mission carries NO intent (nothing fabricated) and the
    // PREVIEW_PRESENTED event records the blocked presentation.
    const detail = await service.paymentMissionDetail(missionId);
    expect(detail?.intent).toBeUndefined();
    expect(detail?.previewId).toBe(preview!.previewId);
    expect(detail?.events[0]?.kind).toBe("PREVIEW_PRESENTED");
    expect(detail?.events[0]?.summary).toContain("BLOCKED");
    expect(detail?.status).toBe("DRAFT");

    // The preview DTO carries no plan selection yet.
    expect(preview!.planSelection).toBeUndefined();
  });

  it("presentPreview returns null for an unknown mission (honest absence)", async () => {
    const { service } = await harness();
    expect(
      await service.paymentMissionPresentPreview("task:PAYMENT_MISSION:ffffffffffffffffffffffffffffffff"),
    ).toBeNull();
  });

  it("an incomplete intake refuses the preview with the typed error (never guessed fields)", async () => {
    const { service } = await harness();
    const seeded = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay" });
    await expect(service.paymentMissionPresentPreview(seeded.missionId)).rejects.toThrow(/complete intake/i);
  });
});

describe("the mission-plane channel: recordPlanSelection (the stage-9a landing site, ADR-0010 D3)", () => {
  it("records the event + the field with RECORD-only prose; re-selection replaces the field, events stay append-only", async () => {
    const { service } = await harness();
    const missionId = await completeIntakeOverChannel(service);
    const first = await service.paymentMissionRecordPlanSelection(missionId, {
      planId: PLAN_A,
      viewDigest: VIEW_DIGEST,
      routineId: "payment-route-planning",
      routineVersion: "1.0.0",
    });
    expect(first.planSelection).toEqual({
      planId: PLAN_A,
      viewDigest: VIEW_DIGEST,
      routineId: "payment-route-planning",
      routineVersion: "1.0.0",
      selectedAt: T0,
    });
    // The event: kind + RECORD-only prose (names the plan + routine,
    // never claims an authorization; the persisted prose carries NO
    // authority-surface machine literal — the clean-audit-scan law).
    expect(first.events[0]?.kind).toBe("PLAN_SELECTION_RECORDED");
    expect(first.events[0]?.summary).toContain(PLAN_A);
    expect(first.events[0]?.summary).toContain("payment-route-planning");
    expect(first.events[0]?.summary).toContain("RECORD only, never an authorization");
    expect(first.events[0]?.summary).not.toContain("AUTHORIZATION_GRANTED");
    expect(first.events[0]?.at).toBe(T0);
    // The DTO exposes no artifact plane.
    expect("authorizationArtifactId" in first).toBe(false);
    expect(first.attemptCount).toBe(0);

    // Re-selection at a later instant: the FIELD carries the latest
    // selection; BOTH events remain (append-only timeline).
    const second = await service.paymentMissionRecordPlanSelection(missionId, {
      planId: PLAN_B,
      viewDigest: VIEW_DIGEST,
      routineId: "payment-route-planning",
      routineVersion: "1.0.0",
    });
    expect(second.planSelection?.planId).toBe(PLAN_B);
    expect(second.planSelection?.selectedAt).toBe(T0);
    const selections = second.events.filter((event) => event.kind === "PLAN_SELECTION_RECORDED");
    expect(selections).toHaveLength(2);
    expect(selections[1]?.summary).toContain(PLAN_A);
    expect(selections[0]?.summary).toContain(PLAN_B);

    // The preview DTO now carries the mission's (latest) plan selection.
    const preview = await service.paymentMissionPresentPreview(missionId);
    expect(preview?.planSelection?.planId).toBe(PLAN_B);
  });

  it("bounded inputs are enforced fail-closed (never trimmed)", async () => {
    const { service } = await harness();
    const missionId = await completeIntakeOverChannel(service);
    await expect(
      service.paymentMissionRecordPlanSelection(missionId, {
        planId: "x".repeat(161),
        viewDigest: VIEW_DIGEST,
        routineId: "payment-route-planning",
        routineVersion: "1.0.0",
      }),
    ).rejects.toThrow(/planId/);
    await expect(
      service.paymentMissionRecordPlanSelection(missionId, {
        planId: PLAN_A,
        viewDigest: "",
        routineId: "payment-route-planning",
        routineVersion: "1.0.0",
      }),
    ).rejects.toThrow(/viewDigest/);
    await expect(
      service.paymentMissionRecordPlanSelection("task:PAYMENT_MISSION:ffffffffffffffffffffffffffffffff", {
        planId: PLAN_A,
        viewDigest: VIEW_DIGEST,
        routineId: "payment-route-planning",
        routineVersion: "1.0.0",
      }),
    ).rejects.toThrow(/No payment mission/);
  });
});

describe("the mission-plane channel: board/detail read-backs", () => {
  it("the board lists newest-updated-first with the honest derived flags", async () => {
    const { service } = await harness();
    const missionId = await completeIntakeOverChannel(service);
    await service.paymentMissionPresentPreview(missionId);
    await service.paymentMissionRecordPlanSelection(missionId, {
      planId: PLAN_A,
      viewDigest: VIEW_DIGEST,
      routineId: "payment-route-planning",
      routineVersion: "1.0.0",
    });
    const board = await service.paymentMissionBoard();
    expect(board).toHaveLength(1);
    expect(board[0]).toEqual({
      missionId,
      direction: "PAY",
      goalStatement: "pay the supplier (P17-A channel battery)",
      status: "DRAFT",
      hasCompiledIntent: false,
      hasPreview: true,
      planSelection: {
        planId: PLAN_A,
        viewDigest: VIEW_DIGEST,
        routineId: "payment-route-planning",
        routineVersion: "1.0.0",
        selectedAt: T0,
      },
      updatedAt: T0,
    });
    // Detail read-backs: unknown id → null; known id → the full record.
    expect(await service.paymentMissionDetail("task:PAYMENT_MISSION:ffffffffffffffffffffffffffffffff")).toBeNull();
    const detail = await service.paymentMissionDetail(missionId);
    expect(detail?.events.every((event) => typeof event.summary === "string" && event.summary.length > 0)).toBe(true);
    expect(detail?.fields.purpose).toEqual({ status: "CAPTURED", value: "supplier invoice 42" });
  });
});

describe("the mission-plane channel: fail-closed without a composed runtime", () => {
  it("every paymentMission* member throws the typed PaymentPlaneNotConfiguredError", async () => {
    const lines: string[] = [];
    const service = createPaySwapDesktopService(
      { scope: { kind: "local" }, log: (_level, message) => lines.push(message) },
      { createSessionId: () => "session-bare" },
    );
    const members: [string, () => Promise<unknown>][] = [
      ["paymentMissionBoard", () => service.paymentMissionBoard()],
      ["paymentMissionDetail", () => service.paymentMissionDetail("task:PAYMENT_MISSION:00000000000000000000000000000001")],
      ["paymentMissionSeed", () => service.paymentMissionSeed({ direction: "PAY", goalStatement: "pay" })],
      ["paymentMissionAskNextField", () => service.paymentMissionAskNextField("task:PAYMENT_MISSION:00000000000000000000000000000001")],
      ["paymentMissionCapture", () => service.paymentMissionCapture("task:PAYMENT_MISSION:00000000000000000000000000000001", "purpose", "x")],
      ["paymentMissionPresentPreview", () => service.paymentMissionPresentPreview("task:PAYMENT_MISSION:00000000000000000000000000000001")],
      ["paymentMissionRecordPlanSelection", () => service.paymentMissionRecordPlanSelection("task:PAYMENT_MISSION:00000000000000000000000000000001", { planId: PLAN_A, viewDigest: VIEW_DIGEST, routineId: "r", routineVersion: "1.0.0" })],
    ];
    for (const [name, call] of members) {
      await expect(call(), `${name} must fail closed`).rejects.toBeInstanceOf(PaymentPlaneNotConfiguredError);
    }
    // The typed kind is the fail-closed signal (never a silent no-op).
    const error = await service.paymentMissionBoard().catch((caught: unknown) => caught);
    expect((error as PaymentPlaneNotConfiguredError).kind).toBe("PAYMENT_PLANE_NOT_CONFIGURED");
    // The fail-closed path is logged once through the host seam.
    expect(lines.filter((message) => message.includes("payment-mission plane NOT configured"))).toHaveLength(1);
  });

  it("the members compose directly over an injected runtime too (the split module's own surface)", async () => {
    const world = memoryFs();
    const store = await openPaymentMissionStore({ fileSystem: world.fs, directory: "/mem/payments" });
    const runtime = createPaymentMissionRuntime({
      store,
      principalRef: "principal:test-local",
      log: () => {},
    });
    const members = createPaymentMissionChannelMembers({
      resolveRuntime: () => runtime,
      now: () => T0,
      log: () => {},
    });
    const seeded = await members.paymentMissionSeed({ direction: "PAY", goalStatement: "pay" });
    expect(seeded.action).toBe("CREATED");
  });
});

describe("the mission-plane channel: the persisted snapshot round-trip (the validator re-pin)", () => {
  it("plan selection + wait-kind events survive a store re-open; a malformed plan selection quarantines fail-closed", async () => {
    const { service, files } = await harness();
    const missionId = await completeIntakeOverChannel(service);
    await service.paymentMissionPresentPreview(missionId);
    await service.paymentMissionRecordPlanSelection(missionId, {
      planId: PLAN_A,
      viewDigest: VIEW_DIGEST,
      routineId: "payment-route-planning",
      routineVersion: "1.0.0",
    });

    // A "restart": re-open the store over the SAME persisted bytes.
    const snapshotPath = `/mem/payments/${PAYMENTS_SNAPSHOT_FILE_NAME}`;
    const raw = files.get(snapshotPath);
    expect(raw).toBeDefined();
    const world2 = memoryFs();
    world2.files.set(snapshotPath, raw!);
    const reopened = await openPaymentMissionStore({ fileSystem: world2.fs, directory: "/mem/payments" });
    const health = await reopened.health();
    expect(health.quarantinedCount).toBe(0);
    const state = await reopened.load();
    expect(state.missions).toHaveLength(1);
    expect(state.missions[0]?.planSelection).toEqual({
      planId: PLAN_A,
      viewDigest: VIEW_DIGEST,
      routineId: "payment-route-planning",
      routineVersion: "1.0.0",
      selectedAt: T0,
    });

    // The wait-kind survival (the P16-D defect proof): inject the four
    // wait events a vocabulary-sharing plane would persist, re-open,
    // and assert the mission LOADS (before the P17-A re-pin the store
    // validator pinned only 17 kinds and this mission quarantined).
    const snapshot = JSON.parse(raw!);
    const waitEvents = ["WAIT_STARTED", "WAIT_CRITERIA_RECORDED", "OPPORTUNITY_MATCHED", "WAIT_EXPIRED"].map(
      (kind, index) => ({
        id: `${missionId}-ev-wait-${String(index)}`,
        at: T1,
        kind,
        summary: `persisted ${kind} event (vocabulary-sharing plane)`,
      }),
    );
    snapshot.missions[0].events = [...waitEvents, ...snapshot.missions[0].events];
    const world3 = memoryFs();
    world3.files.set(snapshotPath, JSON.stringify(snapshot));
    const reopenedWithWaits = await openPaymentMissionStore({ fileSystem: world3.fs, directory: "/mem/payments" });
    const healthWithWaits = await reopenedWithWaits.health();
    expect(healthWithWaits.quarantinedCount).toBe(0);
    const stateWithWaits = await reopenedWithWaits.load();
    const kinds = stateWithWaits.missions[0]?.events.map((event) => event.kind);
    for (const kind of ["WAIT_STARTED", "WAIT_CRITERIA_RECORDED", "OPPORTUNITY_MATCHED", "WAIT_EXPIRED"]) {
      expect(kinds).toContain(kind);
    }
    expect(stateWithWaits.missions[0]?.planSelection?.planId).toBe(PLAN_A);

    // Fail-closed: a MALFORMED plan selection quarantines (never
    // coerced) while the well-formed mission still loads.
    snapshot.missions.push({
      ...snapshot.missions[0],
      id: "task:PAYMENT_MISSION:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      events: [],
      planSelection: { planId: "" },
    });
    const world4 = memoryFs();
    world4.files.set(snapshotPath, JSON.stringify(snapshot));
    const reopenedWithBad = await openPaymentMissionStore({ fileSystem: world4.fs, directory: "/mem/payments" });
    const healthWithBad = await reopenedWithBad.health();
    expect(healthWithBad.quarantinedCount).toBe(1);
    expect(healthWithBad.quarantine[0]?.reason).toMatch(/planSelection/);
    const stateWithBad = await reopenedWithBad.load();
    expect(stateWithBad.missions).toHaveLength(1);
    expect(stateWithBad.missions[0]?.id).toBe(missionId);
  });
});

describe("the mission-plane composition edge (registerPaySwapDesktopService)", () => {
  it("composes the runtime over the derived sibling payments directory; absent directory stays un-injected", async () => {
    const lines: string[] = [];
    const seam = {
      scope: { kind: "local" } as const,
      log: (_level: "info" | "warn" | "error", message: string) => lines.push(message),
    };
    const directory = await mkdtemp(join(tmpdir(), "payswap-mission-plane-"));
    try {
      // The sibling-derivation law: <root>/workspace → <root>/payments.
      expect(derivePaymentsStoreDirectory(join(directory, "workspace"))).toBe(join(directory, "payments"));

      const services = new ServiceCollection();
      await registerPaySwapDesktopService(services, {
        ...seam,
        storeDirectory: join(directory, "workspace"),
        paymentsStoreDirectory: derivePaymentsStoreDirectory(join(directory, "workspace")),
      });
      const resolved = services.get(IPaySwapDesktopServiceDescriptor);
      const seeded = await resolved.paymentMissionSeed({ direction: "PAY", goalStatement: "composition edge" });
      expect(seeded.action).toBe("CREATED");
      // The snapshot persisted under the payments directory.
      const { readFile } = await import("node:fs/promises");
      const raw = JSON.parse(
        await readFile(join(directory, "payments", PAYMENTS_SNAPSHOT_FILE_NAME), "utf8"),
      ) as { missions: { id: string }[] };
      expect(raw.missions.map((mission) => mission.id)).toEqual([seeded.missionId]);
      expect(lines.some((message) => message.includes("payment-mission runtime composed"))).toBe(true);

      // The un-injected posture: no payments directory on the seam →
      // the composition succeeds, the members fail closed, typed.
      const bareServices = new ServiceCollection();
      await registerPaySwapDesktopService(bareServices, { ...seam, storeDirectory: join(directory, "workspace") });
      const bare = bareServices.get(IPaySwapDesktopServiceDescriptor);
      await expect(bare.paymentMissionBoard()).rejects.toBeInstanceOf(PaymentPlaneNotConfiguredError);
      expect(lines.some((message) => message.includes("payment-mission plane NOT composed"))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
