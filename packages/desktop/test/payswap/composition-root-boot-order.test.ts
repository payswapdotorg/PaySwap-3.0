/**
 * PaySwap Desktop (P21-D reviewer-gate ③, ADR-0014 D2/D4) — the
 * COMPOSITION-ROOT BOOT-ORDER battery (failing-first).
 *
 * THE FINDING (the live CDP probe, 2026-10-28): the REAL desktop app
 * booted with the composer PERMANENTLY at the web-tier honest notes —
 * "The mission plane is not wired in this deployment", "The model
 * catalogue is not wired in this deployment" — even though the host
 * runtime registers every member and the renderer composition roots
 * exist. The cause is a BOOT-ORDER violation in the renderer's
 * initializeBusinessRoot: composeRoutePlanningBinding runs FIRST and
 * its `options.controller ?? sharedAgentComposerController()` line
 * constructs the ONE shared controller SYNCHRONOUSLY — BEFORE
 * composeMissionIntakeBinding / composeModelCatalogBinding bind the
 * seams the controller captures AT CONSTRUCTION (agentComposerShared.ts
 * — the "bind BEFORE the first shared-controller construction"
 * discipline the composition root itself was violating).
 *
 * THE LAW THIS BATTERY PINS:
 *  1. (source-order pin — failing on the violating order) inside
 *     initializeBusinessRoot, every seam binding the shared controller
 *     captures at construction (the mission-intake plane, the model
 *     catalogue) is called BEFORE the one composition that constructs
 *     the shared controller (the route-planning binding);
 *  2. (mechanism pin — order-independent fact) calling
 *     composeRoutePlanningBinding with no prior seam bindings
 *     constructs a shared controller whose mission intake is the
 *     HONEST UNBOUND tier — the exact degradation the live app showed;
 *  3. (corrected-order law) binding the intake plane + the model
 *     catalogue BEFORE the route-planning composition yields a shared
 *     controller that seeds a REAL mission through the channel members
 *     and loads the REAL catalogue (the desktop journey the reviewer
 *     ordered proven end-to-end).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  resetSharedAgentComposerController,
  resetSharedMissionIntakePlane,
  resetSharedModelCatalog,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedAgentComposerController,
} from "@payswap/app";

import { composeMissionIntakeBinding } from "../../src/renderer/src/missionIntakeComposition.js";
import { composeModelCatalogBinding } from "../../src/renderer/src/modelCatalogComposition.js";
import { composeRoutePlanningBinding } from "../../src/renderer/src/routePlanningComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";

/** The renderer entrypoint whose initializeBusinessRoot order this battery pins. */
const MAIN_TSX_PATH = resolve(import.meta.dirname, "../../src/renderer/src/main.tsx");

/** The binding calls whose order the boot law governs. */
const ORDERED_BINDING_CALLS = [
  "composePaymentMissionsBinding(",
  "composeMissionIntakeBinding(",
  "composeModelCatalogBinding(",
  "composeConnectionsActivationBinding(",
  "composeRoutePlanningBinding(",
] as const;

/** Extract the initializeBusinessRoot body (the composition root under test). */
function initializeBusinessRootBody(source: string): string {
  const start = source.indexOf("function initializeBusinessRoot(");
  expect(start, "initializeBusinessRoot exists in main.tsx").toBeGreaterThan(-1);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("initializeBusinessRoot body not terminated");
}

/** Restore every shared seam this battery touches (the bridge battery's discipline). */
function resetSharedSeams(): void {
  resetSharedAgentComposerController();
  resetSharedMissionIntakePlane();
  resetSharedModelCatalog();
  resetSharedRoutePlanningEngine();
  resetSharedRoutePlanningSession();
}

/** A channel-stub services object (plain members — every composition read is lazy). */
function stubServices(members: Record<string, unknown> = {}): DesktopConsoleChannelServices {
  return { payswapDesktopService: members } as unknown as DesktopConsoleChannelServices;
}

/**
 * The ambient browser-profile storage the shared controller binds when
 * NO explicit storage is injected (the real renderer's localStorage
 * tier — the shared-controller construction reads it through
 * bindUiStorage). Installed around the corrected-order law only.
 */
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

describe("the composition-root boot order (the shared-controller construction discipline)", () => {
  it("the source-order pin: the seam bindings the shared controller captures run BEFORE the route-planning composition that constructs it", () => {
    const source = readFileSync(MAIN_TSX_PATH, "utf8");
    const body = initializeBusinessRootBody(source);
    const positions = new Map<string, number>();
    for (const call of ORDERED_BINDING_CALLS) {
      const at = body.indexOf(call);
      expect(at, `${call} is called inside initializeBusinessRoot`).toBeGreaterThan(-1);
      positions.set(call, at);
    }
    const routePlanningAt = positions.get("composeRoutePlanningBinding(")!;
    // THE LAW: the mission-intake plane and the model catalogue are
    // captured by the shared controller AT CONSTRUCTION — both must be
    // bound before the one composition that constructs it.
    expect(
      positions.get("composeMissionIntakeBinding(")!,
      "composeMissionIntakeBinding runs before composeRoutePlanningBinding (the plane binds before the first controller construction)",
    ).toBeLessThan(routePlanningAt);
    expect(
      positions.get("composeModelCatalogBinding(")!,
      "composeModelCatalogBinding runs before composeRoutePlanningBinding (the catalog binds before the first controller construction)",
    ).toBeLessThan(routePlanningAt);
  });

  it("the mechanism pin: composeRoutePlanningBinding with no prior seam bindings constructs the shared controller at the HONEST UNBOUND mission tier", () => {
    resetSharedSeams();
    try {
      const composition = composeRoutePlanningBinding({ services: stubServices() });
      expect(composition.session).toBeDefined();
      // The route-planning composition constructed the ONE shared
      // controller synchronously — with nothing bound, its mission
      // intake is the honest UNBOUND tier (the live app's degradation).
      const state = sharedAgentComposerController().getState();
      expect(state.missionIntake.phase).toBe("UNBOUND");
      expect(state.modelControls.phase).toBe("UNBOUND");
    } finally {
      resetSharedSeams();
    }
  });

  it("the corrected-order law: intake plane + model catalogue bound BEFORE the route-planning composition → the shared controller seeds a REAL mission and loads the REAL catalogue", async () => {
    resetSharedSeams();
    const seeds: { direction: string; goalStatement: string }[] = [];
    const asks: string[] = [];
    const services = stubServices({
      paymentMissionSeed: (input: { direction: string; goalStatement: string }) => {
        seeds.push(input);
        return Promise.resolve({ missionId: "m-boot-order", action: "CREATED" });
      },
      paymentMissionAskNextField: (missionId: string) => {
        asks.push(missionId);
        return Promise.resolve({
          fieldId: PAYMENT_INTAKE_FIELD_IDS[0],
          question: "Who is being paid, and where do they receive money?",
        });
      },
      paymentMissionCapture: () => Promise.resolve(undefined),
      paymentMissionBoard: () => Promise.resolve([]),
      paymentMissionDetail: () => Promise.resolve(null),
    });
    try {
      // The CORRECTED order: the seams the controller captures bind first…
      composeMissionIntakeBinding({ services });
      composeModelCatalogBinding({
        source: async () => [
          {
            providerId: "zai",
            modelId: "glm-5.2",
            displayName: "GLM 5.2",
            reasoningLevels: ["standard", "high"],
          },
        ],
      });
      // …then the composition that constructs the shared controller
      // (the ambient browser-profile storage the real renderer binds).
      const restoreStorage = installAmbientLocalStorage();
      try {
        const composition = composeRoutePlanningBinding({ services });
        expect(composition.session).toBeDefined();

        const controller = sharedAgentComposerController();
        // The model catalogue: LOADING → READY with the bound source's models.
        await controller.loadModelCatalog();
        const controls = controller.getState().modelControls;
        expect(controls.phase).toBe("READY");
        expect(controls.models.map((model) => `${model.providerId}/${model.modelId}`)).toEqual(["zai/glm-5.2"]);

        // The mission intake: a payment-shaped request seeds ONE REAL
        // mission through the channel members and the ask loop starts.
        controller.setDraft("Pay merchant X");
        await controller.send();
        const afterSend = controller.getState();
        expect(seeds).toEqual([{ direction: "PAY", goalStatement: "Pay merchant X" }]);
        expect(asks).toEqual(["m-boot-order"]);
        expect(afterSend.missionIntake.phase).toBe("ASKING");
        expect(afterSend.missionIntake.missionId).toBe("m-boot-order");
        expect(afterSend.missionIntake.pendingAsk?.fieldId).toBe(PAYMENT_INTAKE_FIELD_IDS[0]);
      } finally {
        restoreStorage();
      }
    } finally {
      resetSharedSeams();
    }
  });
});
