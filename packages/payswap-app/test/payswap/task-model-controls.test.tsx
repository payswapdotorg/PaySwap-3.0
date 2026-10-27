// @vitest-environment jsdom
/**
 * @payswap/app — the MODEL/DIFFICULTY CONTROLS battery (P21-B run 3,
 * ADR-0014 D4 — the app side).
 *
 * The composer's model + difficulty (reasoningLevel) controls, machine-
 * checked against the app's own seams (no engine, no network, no ambient
 * clock; the storage seam is an in-memory fake):
 *
 * - PIN FIDELITY: the app's AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN equals
 *   the REAL surface constant VERBATIM, and the app-side
 *   validatePinnedAgentTask accepts/rejects the optional modelSelection
 *   field EXACTLY like the shared contract's validateAgentTask (the
 *   two-sided mirror discipline, test-only surface imports).
 * - THE BUDGET LAW: modelBudgetOf is the pinned PURE function — a known
 *   reasoning level maps to the EXACT budget object; a foreign level
 *   FAILS CLOSED (typed error); the budget key set is exactly
 *   {searchBudget, scenarioBudget, explanationDetail} and NO
 *   eligibility/authorization/security-shaped key exists at ANY depth.
 * - THE HONEST TIERS: an unbound catalog renders the honest unbound note
 *   and NEVER a model list; no default model is ever substituted.
 * - RETENTION + RESTORE: a selection persists on the TASK RECORD through
 *   the session port and rehydrates the controls on resume (a fresh
 *   controller over the SAME storage).
 * - THE DISCLOSURE: AGENT_TASK_MODEL_DISCLOSURE_NOTE renders VERBATIM
 *   whenever a model is selected.
 * - THE STAMP: the routine presentation record (PREVIEW_PRESENTED)
 *   carries the task's model stamp, and the engine view pin accepts the
 *   optional modelSelection field (the digest stays model-independent).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

// The REAL surface authority (test-tier relative imports — the mirror discipline).
import { AGENT_TASK_MODEL_DISCLOSURE_NOTE } from "../../../surface/src/agent-tasks.ts";
import { validateAgentTask } from "../../../surface/src/agent-task-validation.ts";

import { createAgentComposerController } from "../../src/agent/agentComposerController.js";
import { AgentComposerPanel } from "../../src/agent/AgentComposerPanel.js";
import type { AgentTaskSessionStorage } from "../../src/agent/taskSessionAdapter.js";
import {
  AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN,
  type AgentTaskModelSelectionPin,
  type AgentTaskPin,
} from "../../src/lib/agent-task-pins.js";
import { validatePinnedAgentTask } from "../../src/lib/agent-task-validation.js";
import {
  AGENT_TASK_REASONING_LEVELS_PIN,
  MODEL_CATALOG_UNBOUND_NOTE,
  modelBudgetOf,
  ModelSelectionControlError,
  type CatalogModel,
  type ModelCatalogPort,
} from "../../src/agent/taskModelPins.js";
import { createRoutePlanningSession, type RoutePlanningSession } from "../../src/agent/routePlanningSession.js";
import { validateRoutePlanningEngineView } from "../../src/agent/routePlanningSession.js";
import {
  routePlanningViewDigestOf,
  type RoutePlanningEngineView,
} from "../../src/agent/routePlanningPins.js";

const NOW = "2026-10-27T12:00:00Z";

/* ------------------------- the shared fixtures ------------------------- */

function fakeStorage(): AgentTaskSessionStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** A REAL-shaped catalog model (the substrate ZCodeModelOption projection). */
function catalogModel(
  providerId: string,
  modelId: string,
  levels: readonly string[],
): CatalogModel {
  return { providerId, modelId, displayName: `${providerId} ${modelId}`, reasoningLevels: levels };
}

function catalogPort(models: readonly CatalogModel[]): ModelCatalogPort {
  return { listModels: () => Promise.resolve([...models]) } as ModelCatalogPort;
}

const SELECTION: AgentTaskModelSelectionPin = {
  providerId: "zai",
  modelId: "glm-5.2",
  reasoningLevel: "high",
};

/* --------------------------- the pin fidelity --------------------------- */

describe("the model-selection pin mirrors the shared surface contract (D4)", () => {
  it("pins the disclosure note VERBATIM (byte-identical)", () => {
    expect(AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN).toBe(AGENT_TASK_MODEL_DISCLOSURE_NOTE);
  });

  it("accepts the optional modelSelection field exactly like the source validator", () => {
    const base = validTask();
    const withSelection = { ...base, modelSelection: SELECTION } as AgentTaskPin;
    expect(() => validateAgentTask(withSelection)).not.toThrow();
    expect(() => validatePinnedAgentTask(withSelection)).not.toThrow();
    expect(validatePinnedAgentTask(withSelection).modelSelection).toEqual(SELECTION);
  });

  it("rejects drifted selections exactly like the source validator", () => {
    const drifted = [
      { ...SELECTION, extra: 1 },
      { providerId: "", modelId: "glm-5.2", reasoningLevel: "high" },
      { providerId: "zai", modelId: "glm-5.2" },
      "not-a-record",
    ];
    for (const candidate of drifted) {
      const task = { ...validTask(), modelSelection: candidate } as unknown as AgentTaskPin;
      expect(() => validateAgentTask(task)).toThrow();
      expect(() => validatePinnedAgentTask(task)).toThrow();
    }
  });
});

/* --------------------------- the budget law --------------------------- */

describe("the difficulty→budget mapping (the pinned PURE function)", () => {
  it("maps each pinned reasoning level to the EXACT budget object", () => {
    expect(modelBudgetOf("low")).toEqual({
      searchBudget: { maxCandidates: 5, maxShapes: 4, maxCandidatesPerShape: 5 },
      scenarioBudget: { maxScenarios: 2, maxInterventionsPerRun: 2, maxDemands: 5, maxPools: 5, maxRails: 5 },
      explanationDetail: "MINIMAL",
    });
    expect(modelBudgetOf("medium")).toEqual({
      searchBudget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      scenarioBudget: { maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 },
      explanationDetail: "STANDARD",
    });
    expect(modelBudgetOf("high")).toEqual({
      searchBudget: { maxCandidates: 20, maxShapes: 18, maxCandidatesPerShape: 20 },
      scenarioBudget: { maxScenarios: 10, maxInterventionsPerRun: 8, maxDemands: 10, maxPools: 10, maxRails: 10 },
      explanationDetail: "DETAILED",
    });
  });

  it("is deterministic and frozen (identical input → identical object identity)", () => {
    expect(modelBudgetOf("medium")).toBe(modelBudgetOf("medium"));
    expect(Object.isFrozen(modelBudgetOf("low"))).toBe(true);
  });

  it("FAILS CLOSED on a foreign reasoning level (never a coerced default)", () => {
    expect(() => modelBudgetOf("ultra")).toThrow(ModelSelectionControlError);
    expect(() => modelBudgetOf("")).toThrow(ModelSelectionControlError);
    expect(() => modelBudgetOf("HIGH")).toThrow(ModelSelectionControlError);
  });

  it("carries ONLY budget knobs — no eligibility/authorization/security key at ANY depth", () => {
    const forbidden = /^(eligib|authoriz|author|security|permission|approve|grant|scope|credential|secret)/i;
    const scan = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((entry, index) => scan(entry, `${path}[${index}]`));
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const key of Object.keys(value)) {
          expect(`${path}.${key}`).not.toMatch(forbidden);
          scan((value as Record<string, unknown>)[key], `${path}.${key}`);
        }
      }
    };
    for (const level of AGENT_TASK_REASONING_LEVELS_PIN) {
      const budget = modelBudgetOf(level);
      expect(Object.keys(budget).sort()).toEqual(["explanationDetail", "scenarioBudget", "searchBudget"]);
      scan(budget, `budget:${level}`);
    }
  });
});

/* ------------------------ the honest tiers (UI) ------------------------ */

describe("the composer model controls render the honest tiers", () => {
  afterEach(cleanup);

  it("an UNBOUND catalog renders the honest unbound note and NEVER a model list", async () => {
    const controller = createAgentComposerController({ clock: () => NOW, storage: fakeStorage() });
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
    });
    const text = panel!.container.textContent ?? "";
    expect(text).toContain(MODEL_CATALOG_UNBOUND_NOTE);
    // NEVER a model list: no select options for models exist anywhere.
    expect(panel!.container.querySelectorAll("select option")).toHaveLength(0);
    // No disclosure without a selection (nothing is claimed).
    expect(text).not.toContain(AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN);
  });

  it("a BOUND catalog hydrates the selects from the REAL catalog; the disclosure renders VERBATIM once selected", async () => {
    const storage = fakeStorage();
    const models = [
      catalogModel("zai", "glm-5.2", ["low", "medium", "high"]),
      catalogModel("zai", "glm-5.2-air", ["low", "medium"]),
    ];
    const controller = createAgentComposerController({
      clock: () => NOW,
      storage,
      modelCatalog: catalogPort(models),
    });
    // Seed a payment-mission task first (the selection persists on a task record).
    await act(async () => {
      await controller.seedFromSurface({
        intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
        originNote: "pay the supplier",
        area: "payments",
      });
    });
    let panel: ReturnType<typeof render>;
    await act(async () => {
      panel = render(<AgentComposerPanel state={controller.getState()} controller={controller} />);
      await controller.loadModelCatalog();
    });
    panel!.rerender(
      <AgentComposerPanel state={controller.getState()} controller={controller} />,
    );
    const modelSelect = panel!.container.querySelector("select[data-ps-model-select]") as HTMLSelectElement;
    expect(modelSelect).not.toBeNull();
    // The placeholder + exactly the TWO catalog models (never an invented entry).
    expect(modelSelect.options).toHaveLength(3);
    expect([...modelSelect.options].map((option) => option.value)).toEqual([
      "",
      "zai/glm-5.2",
      "zai/glm-5.2-air",
    ]);
    // No disclosure yet — nothing is selected, nothing is claimed.
    expect(panel!.container.textContent ?? "").not.toContain(AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN);

    // Select model + difficulty through the controller (the panel's verbs).
    await act(async () => {
      await controller.selectModel(SELECTION);
    });
    panel!.rerender(
      <AgentComposerPanel state={controller.getState()} controller={controller} />,
    );
    expect(panel!.container.textContent).toContain(AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN);
    const modelSelectAfter = panel!.container.querySelector("select[data-ps-model-select]") as HTMLSelectElement;
    expect(modelSelectAfter.value).toContain("glm-5.2");
  });

  it("RETAINS the selection on the task record and RESTORES it on resume (taskModelRecovery)", async () => {
    const storage = fakeStorage();
    const models = [catalogModel("zai", "glm-5.2", ["low", "medium", "high"])];
    const first = createAgentComposerController({
      clock: () => NOW,
      storage,
      modelCatalog: catalogPort(models),
    });
    await act(async () => {
      await first.seedFromSurface({
        intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
        originNote: "pay the supplier",
        area: "payments",
      });
      await first.loadModelCatalog();
      await first.selectModel(SELECTION);
    });
    // The persisted record carries the selection (retention).
    const persisted = await first.sessionPort().listTasks();
    expect(persisted.find((task) => task.modelSelection !== undefined)?.modelSelection).toEqual(SELECTION);

    // A FRESH controller over the SAME storage (resume) rehydrates the controls.
    const resumed = createAgentComposerController({
      clock: () => NOW,
      storage,
      modelCatalog: catalogPort(models),
    });
    await act(async () => {
      await resumed.refresh();
      await resumed.loadModelCatalog();
    });
    expect(resumed.getState().modelControls.selection).toEqual(SELECTION);
  });

  it("REFUSES a selection with no resumable task and never substitutes a default model", async () => {
    const storage = fakeStorage();
    const controller = createAgentComposerController({
      clock: () => NOW,
      storage,
      modelCatalog: catalogPort([catalogModel("zai", "glm-5.2", ["low", "medium", "high"])]),
    });
    await act(async () => {
      await controller.loadModelCatalog();
      await expect(controller.selectModel(SELECTION)).rejects.toThrow(ModelSelectionControlError);
    });
    expect(controller.getState().modelControls.selection).toBeUndefined();
    // No task was created as a side effect (no silent seeding).
    expect(await controller.sessionPort().listTasks()).toHaveLength(0);
  });

  it("REFUSES a foreign reasoning level (the budget law fails closed at the control)", async () => {
    const storage = fakeStorage();
    const controller = createAgentComposerController({
      clock: () => NOW,
      storage,
      modelCatalog: catalogPort([catalogModel("zai", "glm-5.2", ["low", "medium", "high", "turbo"])]),
    });
    await act(async () => {
      await controller.seedFromSurface({
        intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
        originNote: "pay the supplier",
        area: "payments",
      });
      await controller.loadModelCatalog();
      await expect(
        controller.selectModel({ providerId: "zai", modelId: "glm-5.2", reasoningLevel: "turbo" }),
      ).rejects.toThrow(ModelSelectionControlError);
    });
    expect(controller.getState().modelControls.selection).toBeUndefined();
  });
});

/* ----------------------- the presentation stamp ----------------------- */

describe("the routine presentation record gains the model stamp (D4)", () => {
  it("PREVIEW_PRESENTED stamps the task's modelSelection; the digest stays model-independent", async () => {
    const storage = fakeStorage();
    const controller = createAgentComposerController({ clock: () => NOW, storage });
    await controller.seedFromSurface({
      intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
      originNote: "pay the supplier",
      area: "payments",
    });
    const task = (await controller.sessionPort().listTasks())[0];
    await controller.sessionPort().recordModelSelection(task.id, SELECTION, NOW);

    const session: RoutePlanningSession = createRoutePlanningSession({
      session: controller.sessionPort(),
      clock: () => NOW,
    });
    const view = fixedEngineView();
    await session.presentChoices(task.id, view, NOW);
    const stamped = await controller.sessionPort().taskDetail(task.id);
    const preview = stamped!.events.find((event) => event.kind === "PREVIEW_PRESENTED");
    expect(preview).toBeDefined();
    expect(preview!.summary).toContain("zai/glm-5.2");
    expect(preview!.summary).toContain("high");
    expect(preview!.summary.toLowerCase()).not.toContain("authored");

    // The engine-view pin accepts the optional stamp and the digest is UNCHANGED by it.
    const stampedView = { ...view, modelSelection: SELECTION } as RoutePlanningEngineView;
    expect(() => validateRoutePlanningEngineView(stampedView)).not.toThrow();
    expect(routePlanningViewDigestOf(stampedView)).toBe(view.viewDigest);
    const badStamp = { ...view, modelSelection: { providerId: "" } as AgentTaskModelSelectionPin };
    expect(() => validateRoutePlanningEngineView(badStamp)).toThrow();
  });
});

/* --------------------------- local helpers --------------------------- */

/** A fixed, fully-valid engine view (the panel battery's own shape, compact). */
function fixedEngineView(): RoutePlanningEngineView {
  const value = {
    kind: "PRESENTED_PLAN" as const,
    routine: {
      routineId: "payment-route-planning" as const,
      routineVersion: "1.0.0" as const,
      skillContentDigest: "fnv1a64:1abba70f0107d1b2" as const,
    },
    intentRef: "intent:planning:001",
    presentedAt: NOW,
    availableNow: {
      ranked: [],
      notScored: [],
      senderEligibleRouteIds: [],
      recipientEligibleRouteIds: [],
    },
    exclusions: [],
    truncation: { receipts: [], coverage: "COMPLETE" as const },
    scenarios: { advisoryOnly: true as const, coverage: "COMPLETE" as const, outcomes: [] },
    waiting: {
      proposal: {
        waitId: "wait:route:001",
        families: ["liquidity" as const],
        categories: ["NEW_OPPORTUNITY" as const],
        maxWaitMs: 3_600_000,
        maxSettlementMs: 600_000,
        fallback: { kind: "REPLAN_FROM_FRESH_EVIDENCE" as const, routeRef: "plan:none" },
        tradeOffs: [],
        declaredAt: 1_771_612_800_000,
      },
    },
  };
  return { ...value, viewDigest: routePlanningViewDigestOf(value) };
}

function validTask(): AgentTaskPin {
  return {
    id: "task:PAYMENT_MISSION:1",
    kind: "PAYMENT_MISSION",
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    createdAt: NOW,
    updatedAt: NOW,
    status: "DRAFT",
    events: [
      { id: "event:1", at: NOW, kind: "CREATED", summary: "Task created from composer text: pay the supplier" },
    ],
  };
}
