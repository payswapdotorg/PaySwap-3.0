/**
 * PaySwap Desktop (P21-D reviewer-gate ③) — the ROUTE-PLANNING CACHE
 * FRESHNESS battery (failing-first).
 *
 * THE FINDING (the live CDP journey, 2026-10-28): the desktop's
 * route-planning composition refreshes its mission cache ONCE at the
 * business-root boot and after session mutations — but a mission seeded
 * LATER (the composer's "Pay merchant X" through the bound intake plane)
 * never enters the cache: the engine's missionFacts read returns null
 * and the composer's stage checklist renders the "not wired" note even
 * though the mission plane IS bound and the mission EXISTS in the host
 * store (a dishonest understatement — the exact inverse failure of a
 * fabricated progress claim).
 *
 * THE LAW THIS BATTERY PINS: the composition SUBSCRIBES to the shared
 * composer controller — when the mission-intake link changes (a mission
 * seeds or resumes), the cache refreshes through the channel members and
 * the engine's missionFacts read answers the mission's typed timeline.
 */

import { describe, expect, it } from "vitest";

import {
  resetSharedAgentComposerController,
  resetSharedMissionIntakePlane,
  resetSharedModelCatalog,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedAgentComposerController,
  sharedRoutePlanningEngine,
} from "@payswap/app";

import { composeMissionIntakeBinding } from "../../src/renderer/src/missionIntakeComposition.js";
import { composeRoutePlanningBinding } from "../../src/renderer/src/routePlanningComposition.js";
import { createRealRoutePlanningEngine } from "../../src/renderer/src/routePlanningEngineAdapter.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";

/** Restore every shared seam this battery touches. */
function resetSharedSeams(): void {
  resetSharedAgentComposerController();
  resetSharedMissionIntakePlane();
  resetSharedModelCatalog();
  resetSharedRoutePlanningEngine();
  resetSharedRoutePlanningSession();
}

/** The ambient browser-profile storage (the shared controller's bind). */
function installAmbientLocalStorage(): () => void {
  const data = new Map<string, string>();
  const shim = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => void data.clear(),
  };
  const holder = globalThis as { localStorage?: unknown };
  const previous = holder.localStorage;
  holder.localStorage = shim;
  return () => {
    if (previous === undefined) {
      delete holder.localStorage;
    } else {
      holder.localStorage = previous;
    }
  };
}

/** Await the predicate (bounded — the refresh is asynchronous). */
async function until(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("the route-planning cache freshness (the mission-seeded-after-boot law)", () => {
  it("a mission seeded through the composer AFTER the composition boot enters the cache — the engine's missionFacts answers its typed timeline", async () => {
    resetSharedSeams();
    // The stub channel: the board/detail members serve what the seed
    // member records (the mission exists in the host's world).
    const missions = new Map<string, { status: string; events: { kind: string; summary: string; at: string }[] }>();
    const services = {
      payswapDesktopService: {
        paymentMissionSeed: (input: { direction: string; goalStatement: string }) => {
          const missionId = `task:PAYMENT_MISSION:${String(missions.size + 1).padStart(2, "0")}`;
          missions.set(missionId, {
            status: "DRAFT",
            events: [
              { kind: "CREATED", summary: `Payment mission created — goal: ${input.goalStatement}`, at: "2026-10-28T14:00:00Z" },
            ],
          });
          return Promise.resolve({ missionId, action: "CREATED" });
        },
        paymentMissionAskNextField: () => Promise.resolve(null),
        paymentMissionCapture: () => Promise.resolve(undefined),
        paymentMissionBoard: () =>
          Promise.resolve(
            [...missions.entries()].map(([missionId, mission]) => ({
              missionId,
              status: mission.status,
              hasCompiledIntent: false,
              updatedAt: "2026-10-28T14:00:00Z",
            })),
          ),
        paymentMissionDetail: (missionId: string) =>
          Promise.resolve(
            missions.has(missionId)
              ? { id: missionId, status: missions.get(missionId)!.status, events: missions.get(missionId)!.events }
              : null,
          ),
      },
    } as unknown as DesktopConsoleChannelServices;

    const restoreStorage = installAmbientLocalStorage();
    try {
      composeMissionIntakeBinding({ services });
      composeRoutePlanningBinding({ services });
      const controller = sharedAgentComposerController();
      const engine = sharedRoutePlanningEngine() as unknown as ReturnType<typeof createRealRoutePlanningEngine>;

      // BEFORE the seed: the cache is honestly empty (no mission exists).
      controller.setDraft("Pay merchant X");
      await controller.send();
      const missionId = controller.getState().missionIntake.missionId;
      expect(missionId).toBeDefined();

      // THE LAW: the composition noticed the mission link and refreshed
      // the cache — the engine's missionFacts answers the timeline.
      await until(() => engine.missionFacts(missionId!) !== null);
      const facts = engine.missionFacts(missionId!);
      expect(facts?.missionStatus).toBe("DRAFT");
      expect(facts?.events.map((event) => event.kind)).toContain("CREATED");
    } finally {
      restoreStorage();
      resetSharedSeams();
    }
  });
});
