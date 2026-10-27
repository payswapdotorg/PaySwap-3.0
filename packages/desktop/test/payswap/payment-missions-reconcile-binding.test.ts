/**
 * PaySwap Desktop (P20-C) — the RECONCILIATION LEG of the
 * payment-missions binding battery (bridge tier; ADR-0013 D1/D2).
 *
 * Composes the REAL renderer composition root (the payment-missions
 * module binding the channel members into the pinned port — now
 * reconciliation-capable: the dispatch + reconciliation composed
 * interfaces intersected) and proves:
 *
 * (a) THE HONEST EMPTY TRUTH over the REAL channel: a healthy mission
 *     (a seeded dispatchable preview, no dispatch yet) → the pending
 *     card is EMPTY with the host's honest note + the accepted-sources
 *     echo; a CONFIRMED dispatch leaves nothing pending either.
 * (b) THE GOLDEN PATH over the labeled fixtures (the scripted gate
 *     environment + the REAL connection session authority with a
 *     seeded ACTIVE SANDBOX lane + the scriptedAuthority answering
 *     UNKNOWN): the dispatch through the PORT → the pending card lists
 *     the UNKNOWN attempt → the reconcile through the PORT with
 *     EXACTLY (missionId, attemptId, evidence) → RECONCILED with the
 *     resolved direction → the mission COMPLETED on the detail (the
 *     CONFIRMED-of-a-create side effect) → the pending card re-reads
 *     empty → the detail re-read byte-identical; the FAILED variant
 *     leaves the mission open. The structural guard passes over the
 *     composed port.
 * (c) THE ACT-TIME REFUSAL over the REAL channel: an attemptId not on
 *     the mission is the typed refusal BEFORE any runtime call — the
 *     record snapshot is byte-identical (nothing changed).
 * (d) THE DOUBLE-RECONCILE typed refusal: a re-send against the closed
 *     attempt surfaces the runtime's honest append-only reason.
 * (e) THE SCANNER LAW over the new shapes: no artifact, no
 *     idempotency/command/correlation ids, no connectionRef, no
 *     edge-pin literals on any wire shape the bridge touches.
 */

import { describe, expect, it } from "vitest";

import { isPaymentMissionsReconciliationPort } from "@payswap/app";

import {
  composePaymentMissionsBinding,
} from "../../src/renderer/src/paymentMissionsComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import {
  approveHostSide,
  harness,
  scriptedAuthority,
  seedDispatchablePreview,
} from "./payment-approval-plane-harness.js";
import {
  connectionWorld,
  seedActiveSandboxConnection,
} from "./payment-dispatch-plane-fixtures.js";
import {
  EDGE_PIN_LITERALS,
  FOREIGN_ATTEMPT_ID,
  snapshotOf,
  STATEMENT_REF,
} from "./payment-reconcile-plane-fixtures.js";

/** The channel services facade over the REAL host service (the bridge's stand-in for the renderer connection). */
function servicesOf(service: unknown): DesktopConsoleChannelServices {
  return { payswapDesktopService: service } as unknown as DesktopConsoleChannelServices;
}

describe("(a) the honest empty truth over the REAL channel", () => {
  it("a healthy mission reads the EMPTY pending card with the honest note + the accepted-sources echo", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      const card = await composition.port.pendingReconciliation(missionId);
      expect(card.pending).toHaveLength(0);
      expect(card.acceptedSources).toContain("EXTERNAL_PROVIDER_STATEMENT");
      expect(card.acceptedSources).toContain("EXTERNAL_PROVIDER_RETRIEVAL");
      expect(card.note.length).toBeGreaterThan(0);
    } finally {
      composition.reset();
    }
  });

  it("a CONFIRMED dispatch leaves nothing pending either (only UNKNOWN/unanswered attempts reconcile)", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(scriptedAuthority(["CONFIRMED"]), connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);
      const outcome = await composition.port.dispatch(missionId, connectionId);
      expect(outcome.kind).toBe("DISPATCHED");

      const card = await composition.port.pendingReconciliation(missionId);
      expect(card.pending).toHaveLength(0);
    } finally {
      composition.reset();
    }
  });
});

describe("(b) the golden path over the labeled fixtures", () => {
  it("UNKNOWN dispatch → the pending card lists the attempt → the reconcile through the PORT → RECONCILED + mission COMPLETED + the empty re-read, byte-identical details", async () => {
    const runGoldenPath = async (): Promise<{ pending: unknown; outcome: unknown }> => {
      const connections = connectionWorld();
      const connectionId = await seedActiveSandboxConnection(connections.authority);
      const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
      const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
      try {
        expect(isPaymentMissionsReconciliationPort(composition.port)).toBe(true);

        const missionId = await seedDispatchablePreview(world);
        await approveHostSide(world.runtime, missionId);
        const dispatch = await composition.port.dispatch(missionId, connectionId);
        expect(dispatch.kind).toBe("DISPATCHED");

        const card = await composition.port.pendingReconciliation(missionId);
        expect(card.pending).toHaveLength(1);
        const pending = card.pending[0] as { readonly attemptId: string };
        expect(pending.attemptId).toBe(dispatch.attemptId);

        const outcome = await composition.port.reconcile(missionId, dispatch.attemptId, {
          resolvedTo: "CONFIRMED",
          source: "EXTERNAL_PROVIDER_STATEMENT",
          evidenceRefs: [STATEMENT_REF],
        });
        expect(outcome.attemptId).toBe(dispatch.attemptId);
        expect(outcome.resolvedTo).toBe("CONFIRMED");
        expect(outcome.summary).toContain("closed");

        // The mission state side effect: CONFIRMED-of-a-create COMPLETES.
        const detail = await composition.port.detail(missionId);
        expect(detail?.status).toBe("COMPLETED");
        const attempt = (detail?.attempts ?? [])[0] as { readonly outcome: string } | undefined;
        expect(attempt?.outcome).toBe("RECONCILED");

        // The pending card re-reads EMPTY; the detail re-read is stable.
        const reCard = await composition.port.pendingReconciliation(missionId);
        expect(reCard.pending).toHaveLength(0);
        const reDetail = await composition.port.detail(missionId);
        expect(JSON.stringify(reDetail)).toBe(JSON.stringify(detail));

        return { pending: card.pending, outcome };
      } finally {
        composition.reset();
      }
    };
    const first = await runGoldenPath();
    const second = await runGoldenPath();
    expect(JSON.stringify(second.pending)).toBe(JSON.stringify(first.pending));
    expect(JSON.stringify(second.outcome)).toBe(JSON.stringify(first.outcome));
  });

  it("the FAILED variant reconciles honestly and leaves the mission open", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);
      const dispatch = await composition.port.dispatch(missionId, connectionId);

      const outcome = await composition.port.reconcile(missionId, dispatch.attemptId, {
        resolvedTo: "FAILED",
        source: "EXTERNAL_PROVIDER_RETRIEVAL",
        evidenceRefs: ["retrieval-citation-001"],
      });
      expect(outcome.resolvedTo).toBe("FAILED");

      const detail = await composition.port.detail(missionId);
      expect(detail?.status).not.toBe("COMPLETED");
      const attempt = (detail?.attempts ?? [])[0] as { readonly outcome: string } | undefined;
      expect(attempt?.outcome).toBe("RECONCILED");
      const card = await composition.port.pendingReconciliation(missionId);
      expect(card.pending).toHaveLength(0);
    } finally {
      composition.reset();
    }
  });
});

describe("(c) the act-time refusal over the REAL channel", () => {
  it("an attemptId not on the mission is the typed refusal BEFORE any runtime call — the record is byte-identical", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);
      await composition.port.dispatch(missionId, connectionId);
      const before = await snapshotOf(world, missionId);

      await expect(
        composition.port.reconcile(missionId, FOREIGN_ATTEMPT_ID, {
          resolvedTo: "CONFIRMED",
          source: "EXTERNAL_PROVIDER_STATEMENT",
          evidenceRefs: [STATEMENT_REF],
        }),
      ).rejects.toThrow(/no reconciliation was recorded/i);

      const after = await snapshotOf(world, missionId);
      expect(after).toBe(before);
    } finally {
      composition.reset();
    }
  });
});

describe("(d) the double-reconcile typed refusal (the append-only law)", () => {
  it("a re-send against the closed attempt surfaces the runtime's honest already-reconciled reason", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);
      const dispatch = await composition.port.dispatch(missionId, connectionId);
      await composition.port.reconcile(missionId, dispatch.attemptId, {
        resolvedTo: "CONFIRMED",
        source: "EXTERNAL_PROVIDER_STATEMENT",
        evidenceRefs: [STATEMENT_REF],
      });

      await expect(
        composition.port.reconcile(missionId, dispatch.attemptId, {
          resolvedTo: "CONFIRMED",
          source: "EXTERNAL_PROVIDER_STATEMENT",
          evidenceRefs: [STATEMENT_REF],
        }),
      ).rejects.toThrow(/reconcil/i);
    } finally {
      composition.reset();
    }
  });
});

describe("(e) the scanner law over the new shapes", () => {
  it("the pending card + the outcome carry no artifact, no lineage ids, no connectionRef, no edge-pin literals", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(scriptedAuthority(["UNKNOWN"]), connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);
      const dispatch = await composition.port.dispatch(missionId, connectionId);

      const card = await composition.port.pendingReconciliation(missionId);
      const outcome = await composition.port.reconcile(missionId, dispatch.attemptId, {
        resolvedTo: "CONFIRMED",
        source: "EXTERNAL_PROVIDER_STATEMENT",
        evidenceRefs: [STATEMENT_REF],
      });

      const walkKeys = (value: unknown, path: string, keys: string[]): void => {
        if (value === null || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach((item, i) => walkKeys(item, `${path}[${i}]`, keys));
          return;
        }
        for (const [key, child] of Object.entries(value)) {
          keys.push(`${path}.${key}`);
          walkKeys(child, `${path}.${key}`, keys);
        }
      };
      for (const shape of [card, outcome]) {
        const keys: string[] = [];
        walkKeys(shape, "shape", keys);
        for (const key of keys) {
          expect(key).not.toMatch(/artifact/i);
          expect(
            ["idempotencyKey", "commandId", "correlationId", "connectionRef"].some((banned) =>
              key.endsWith(banned),
            ),
          ).toBe(false);
        }
        const json = JSON.stringify(shape);
        for (const literal of EDGE_PIN_LITERALS) {
          expect(json).not.toContain(literal);
        }
        expect(json).not.toContain(connectionId);
      }
      expect(outcome.resolvedTo).toBe("CONFIRMED");
    } finally {
      composition.reset();
    }
  });
});
