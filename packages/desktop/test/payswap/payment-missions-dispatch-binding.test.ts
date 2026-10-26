/**
 * PaySwap Desktop (P19-C) — the DISPATCH LEG of the payment-missions
 * binding battery (bridge tier; ADR-0012 D1/D2).
 *
 * Composes the REAL renderer composition root (the payment-missions
 * module binding the channel members into the pinned port — now
 * dispatch-capable) and proves:
 *
 * (a) THE HONEST EMPTY TRUTH over the REAL channel: an unapproved
 *     mission → armed:false with the verbatim no-artifact reason; an
 *     approved mission (the labeled test-tier gate environment) over
 *     an EMPTY connections registry → armed:true with ZERO lanes (the
 *     honest no-lane truth — never a fabricated lane) and the dispatch
 *     → the typed act-time refusal (the choice-validation law over the
 *     REAL channel: an outside connectionRef is refused, no attempt
 *     recorded, the artifact NOT consumed — still armed).
 * (b) THE GOLDEN PATH over the labeled fixtures (the scripted gate
 *     environment + the REAL connection session authority with a
 *     seeded ACTIVE SANDBOX lane + the scriptedAuthority CONFIRMED):
 *     armed:true with the lane → the dispatch through the PORT with
 *     EXACTLY (missionId, connectionRef) → DISPATCHED, the attempt
 *     state CONFIRMED on the detail, the artifact consumed (armed
 *     re-reads honestly), byte-identical replays.
 * (c) THE REFUSED PATH (the unwired execution authority — the
 *     deployment's honest default): REFUSED with the people-language
 *     summary, the attempt state REFUSED on the detail.
 * (d) THE ARTIFACT-NEVER-ON-THE-WIRE scan over every new shape (the
 *     armed card + the outcome; the lane's connectionRef IS the choice
 *     key — the fixtures' own lane-shape law holds).
 */

import { describe, expect, it } from "vitest";

import { isPaymentMissionsDispatchPort } from "@payswap/app";

import {
  channelPaymentMissionsPort,
  composePaymentMissionsBinding,
} from "../../src/renderer/src/paymentMissionsComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import {
  approveHostSide,
  harness,
  scriptedAuthority,
  seedDispatchablePreview,
  T0,
} from "./payment-approval-plane-harness.js";
import {
  connectionWorld,
  seedActiveSandboxConnection,
} from "./payment-dispatch-plane-fixtures.js";

/** The channel services facade over the REAL host service (the bridge's stand-in for the renderer connection). */
function servicesOf(service: unknown): DesktopConsoleChannelServices {
  return { payswapDesktopService: service } as unknown as DesktopConsoleChannelServices;
}

describe("(a) the honest empty truth over the REAL channel", () => {
  it("an unapproved mission reads armed:false with the verbatim no-artifact reason", async () => {
    const connections = connectionWorld();
    const world = await harness(undefined, connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      // No approval yet: the armed truth is the verbatim no-artifact reason.
      const armed = await composition.port.armedEffect(missionId);
      expect(armed.armed).toBe(false);
      expect(armed.reason).toContain("no authorization artifact exists");
      expect(armed.lanes).toHaveLength(0);
    } finally {
      composition.reset();
    }
  });

  it("an approved mission over the EMPTY registry: armed:true, zero lanes, the dispatch refused typed (no attempt, the artifact intact)", async () => {
    const connections = connectionWorld(); // configured but EMPTY — zero connections
    const world = await harness(undefined, connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);

      const armed = await composition.port.armedEffect(missionId);
      expect(armed.armed).toBe(true);
      expect(armed.scope!.amount).toEqual({ currency: "USD", minorUnits: "1500" });
      expect(armed.expiresAt !== undefined && armed.expiresAt > T0).toBe(true);
      expect(armed.lanes).toHaveLength(0); // the honest no-lane truth — never a fabricated lane

      // The choice-validation law over the REAL channel: an outside
      // connectionRef is a typed act-time refusal.
      await expect(composition.port.dispatch(missionId, "conn:not-in-the-registry")).rejects.toThrow(
        /lane|connection/i,
      );
      // No attempt recorded; the artifact NOT consumed — still armed.
      const detail = await composition.port.detail(missionId);
      expect(detail!.attempts).toHaveLength(0);
      const reArmed = await composition.port.armedEffect(missionId);
      expect(reArmed.armed).toBe(true);
    } finally {
      composition.reset();
    }
  });
});

describe("(b) the golden path over the labeled fixtures", () => {
  it("armed with the lane → the dispatch through the PORT → DISPATCHED + the CONFIRMED attempt state, byte-identical replays", async () => {
    const runGoldenPath = async (): Promise<{ armed: unknown; outcome: unknown }> => {
      const connections = connectionWorld();
      const connectionId = await seedActiveSandboxConnection(connections.authority);
      const world = await harness(scriptedAuthority(["CONFIRMED"]), connections.authority);
      const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
      try {
        expect(isPaymentMissionsDispatchPort(composition.port)).toBe(true);
        const missionId = await seedDispatchablePreview(world);
        await approveHostSide(world.runtime, missionId);

        const armed = await composition.port.armedEffect(missionId);
        expect(armed.armed).toBe(true);
        expect(armed.lanes).toHaveLength(1);
        const lane = armed.lanes[0] as { readonly connectionRef: string; readonly ineligible?: { readonly reason: string } } | undefined;
        expect(lane).toBeDefined();
        expect(lane!.connectionRef).toBe(connectionId);
        expect(lane!.ineligible).toBeUndefined();

        const outcome = await composition.port.dispatch(missionId, connectionId);
        expect(outcome.kind).toBe("DISPATCHED");
        expect(outcome.attemptId.length).toBeGreaterThan(0);
        expect(outcome.summary).toContain("confirmed the effect");

        // The attempt state lands on the mission record; the artifact is
        // consumed (armed re-reads honestly as not-armed-consumed).
        const detail = await composition.port.detail(missionId);
        const attempt = (detail?.attempts ?? [])[0] as { readonly outcome: string } | undefined;
        expect(detail?.attempts ?? []).toHaveLength(1);
        expect(attempt?.outcome).toBe("CONFIRMED");
        const reArmed = await composition.port.armedEffect(missionId);
        expect(reArmed.armed).toBe(false);
        expect(reArmed.reason).toContain("was consumed at");

        return { armed: { scope: armed.scope, lanes: armed.lanes }, outcome };
      } finally {
        composition.reset();
      }
    };
    const first = await runGoldenPath();
    const second = await runGoldenPath();
    expect(JSON.stringify(second.armed)).toBe(JSON.stringify(first.armed));
    expect(JSON.stringify(second.outcome)).toBe(JSON.stringify(first.outcome));
  });
});

describe("(c) the refused path (the unwired authority — the deployment's honest default)", () => {
  it("REFUSED with the people-language summary and the REFUSED attempt state on the detail", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(undefined, connections.authority); // the unwired execution authority
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);

      const outcome = await composition.port.dispatch(missionId, connectionId);
      expect(outcome.kind).toBe("REFUSED");
      expect(outcome.summary).toContain("refused the command before any effect");

      const detail = await composition.port.detail(missionId);
      const attempt = (detail?.attempts ?? [])[0] as { readonly outcome: string } | undefined;
      expect(detail?.attempts ?? []).toHaveLength(1);
      expect(attempt?.outcome).toBe("REFUSED");
    } finally {
      composition.reset();
    }
  });
});

describe("(d) the artifact-never-on-the-wire scan over the new shapes", () => {
  it("the armed card + the outcome carry no artifact or lineage keys (the lane's connectionRef is the choice key, by law)", async () => {
    const connections = connectionWorld();
    const connectionId = await seedActiveSandboxConnection(connections.authority);
    const world = await harness(scriptedAuthority(["CONFIRMED"]), connections.authority);
    const composition = composePaymentMissionsBinding({ services: servicesOf(world.service) });
    try {
      const missionId = await seedDispatchablePreview(world);
      await approveHostSide(world.runtime, missionId);

      const armed = await composition.port.armedEffect(missionId);
      // The lane's connectionRef IS the operator's choice key (ADR-0012 D2) —
      // it appears on the armed card BY LAW; nothing else artifact-shaped does.
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
      const armedKeys: string[] = [];
      walkKeys(armed, "armed", armedKeys);
      for (const key of armedKeys) {
        expect(key).not.toMatch(/artifact/i);
        expect(["idempotencyKey", "commandId", "correlationId"].some((banned) => key.endsWith(banned))).toBe(false);
      }

      const outcome = await composition.port.dispatch(missionId, connectionId);
      // The OUTCOME carries NO connectionRef at all (outcome facts only).
      const outcomeJson = JSON.stringify(outcome);
      expect(outcomeJson).not.toContain(connectionId);
      expect(outcomeJson).not.toMatch(/artifact/i);
      expect(outcome.kind).toBe("DISPATCHED");
    } finally {
      composition.reset();
    }
  });
});
