/**
 * PaySwap Desktop (P21-B run 3, ADR-0014 D4) — the MODEL/DIFFICULTY
 * composition battery (bridge tier): the renderer's model-catalog
 * composition root + the difficulty→budget wiring inside the REAL
 * route-planning engine adapter.
 *
 * (a) THE CATALOG COMPOSITION: no source → the honest fail-closed throw
 *     (nothing bound — the composer renders the unbound-catalog note);
 *     a DI'd source binds the shared seam 1:1 (listModels → the source).
 * (b) THE BUDGET WIRING: the engine request's persisted modelSelection
 *     derives the REAL count-based budgets through the app's pinned PURE
 *     mapping — the view carries the MODEL STAMP, the digest stays
 *     byte-identical with and without the stamp (the digest pins the
 *     model-INDEPENDENT computation), the composition defaults equal the
 *     pinned "medium" mapping, and a FOREIGN reasoning level fails
 *     closed through the typed error (never a coerced default budget).
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  ModelSelectionControlError,
  modelBudgetOf,
  resetSharedModelCatalog,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedModelCatalog,
  sharedRoutePlanningEngine,
  type AgentTaskSessionStorage,
  type CatalogModel,
} from "@payswap/app";

import {
  composeModelCatalogBinding,
} from "../../src/renderer/src/modelCatalogComposition.js";
import {
  compositionDefaultBudgets,
} from "../../src/renderer/src/routePlanningEngineAdapter.js";
import type {
  RoutePlanningMissionBoardItem,
  RoutePlanningMissionDetail,
  RoutePlanningMissionSource,
} from "../../src/renderer/src/routePlanningMissionLinkage.js";
import { composeRoutePlanningBinding } from "../../src/renderer/src/routePlanningComposition.js";

const T0 = "2026-10-26T12:00:00Z";
const T1 = "2026-10-26T12:05:00Z";
const MISSION_ID = "task:PAYMENT_MISSION:00000000000000000000000000000001";

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => (data.get(k) ? data.get(k)! : null), setItem: (k, v) => void data.set(k, v) };
}

/** A mission detail carrying a compiled 11-key intent (the DI'd source fixture — the only replaced seam, labeled). */
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

/** The composed engine + task over the DI'd mission source (the golden-path shape). */
async function composedEngineWithTask() {
  const controller = createAgentComposerController({ storage: fakeStorage(), clock: () => T1 });
  const detail = missionDetailWithIntent();
  const board: readonly RoutePlanningMissionBoardItem[] = [
    { missionId: detail.id, status: detail.status, hasCompiledIntent: true, updatedAt: T0 },
  ];
  const source: RoutePlanningMissionSource = {
    board: async () => board,
    detail: async (missionId) => (missionId === detail.id ? detail : null),
  };
  const composition = composeRoutePlanningBinding({ source, controller });
  await composition.refresh();
  await controller.seedFromSurface({
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    originNote: "pay the supplier",
    area: "payments",
  });
  const state = controller.getState();
  const task = state.tasks[state.tasks.length - 1]!;
  return { controller, task };
}

describe("(a) the model-catalog composition (the honest tiers)", () => {
  it("no source → the honest fail-closed throw; nothing is bound", () => {
    expect(() => composeModelCatalogBinding({})).toThrow(
      "the model-catalog composition requires the substrate's model-availability source",
    );
    expect(sharedModelCatalog()).toBeUndefined();
  });

  it("a DI'd source binds the shared seam 1:1 (listModels → the source read)", async () => {
    const models: readonly CatalogModel[] = [
      { providerId: "zai", modelId: "glm-5.2", displayName: "GLM-5.2", reasoningLevels: ["low", "medium", "high"] },
    ];
    let reads = 0;
    const composition = composeModelCatalogBinding({ source: async () => { reads += 1; return [...models]; } });
    expect(await composition.catalog.listModels()).toEqual(models);
    expect(reads).toBe(1);
    expect(sharedModelCatalog()).toBe(composition.catalog);
    composition.reset();
    expect(sharedModelCatalog()).toBeUndefined();
    resetSharedModelCatalog();
  });
});

describe("(b) the difficulty→budget wiring inside the REAL engine adapter", () => {
  it("the composition defaults equal the pinned 'medium' mapping (budget knobs only)", () => {
    expect(compositionDefaultBudgets()).toEqual(modelBudgetOf("medium"));
    expect(Object.keys(compositionDefaultBudgets()).sort()).toEqual(["explanationDetail", "scenarioBudget", "searchBudget"]);
  });

  it("the request's modelSelection derives the budgets + stamps the view; the digest stays model-INDEPENDENT", async () => {
    const { controller, task } = await composedEngineWithTask();
    try {
      const engine = sharedRoutePlanningEngine();
      const plain = engine.presentableView({ taskRef: task.id });
      const stamped = engine.presentableView({
        taskRef: task.id,
        modelSelection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "low" },
      });
      expect(stamped.modelSelection).toEqual({ providerId: "zai", modelId: "glm-5.2", reasoningLevel: "low" });
      expect(plain.modelSelection).toBeUndefined();
      // The digest projection EXCLUDES the stamp: identical computation.
      expect(stamped.viewDigest).toBe(plain.viewDigest);
    } finally {
      resetSharedRoutePlanningEngine();
      resetSharedRoutePlanningSession();
      await controller.refresh();
    }
  });

  it("a FOREIGN reasoning level fails closed through the typed error (never a coerced budget)", async () => {
    const { controller, task } = await composedEngineWithTask();
    try {
      const engine = sharedRoutePlanningEngine();
      expect(() =>
        engine.presentableView({
          taskRef: task.id,
          modelSelection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "turbo" },
        }),
      ).toThrow(ModelSelectionControlError);
    } finally {
      resetSharedRoutePlanningEngine();
      resetSharedRoutePlanningSession();
      await controller.refresh();
    }
  });
});
