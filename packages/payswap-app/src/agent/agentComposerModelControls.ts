/**
 * @payswap/app — the composer's MODEL-CONTROLS wiring (P21-B run 3,
 * ADR-0014 D4), split from ./agentComposerController.ts for the ≤400-line
 * file law (the agentComposerIntake.ts precedent).
 *
 * The wiring owns: (a) the catalog load (LOADING → READY/ERROR, over the
 * injected ModelCatalogPort — NO default; an absent port keeps the honest
 * UNBOUND tier); (b) the selection path (validate fail-closed → the level
 * must carry a pinned budget mapping → the model must be in the LOADED
 * catalog → record through the controller's ONE task-session port on the
 * newest resumable task → refresh); (c) taskModelRecovery (the controls
 * rehydrate from the task record's persisted modelSelection — the resume
 * law).
 *
 * LAWS: no silent substitution (NO default model, NO coerced budget — a
 * foreign level is a typed refusal); the selection NEVER confers
 * eligibility/authorization/security rights; a selection with NO resumable
 * task is refused (never a side-effect seed).
 */

import type { AgentTaskPin } from "../lib/agent-task-pins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import type { AgentComposerTaskView } from "./agentComposerProjection.js";
import {
  modelBudgetOf,
  requireValidModelSelectionPin,
  ModelSelectionControlError,
  MODEL_CONTROLS_UNBOUND_STATE,
  type AgentTaskModelSelectionPin,
  type ModelCatalogPort,
  type ModelControlsState,
} from "./taskModelPins.js";

/** The controller seams the wiring rides (the intake-wiring pattern). */
export interface AgentComposerModelSeams {
  readonly catalog: ModelCatalogPort | undefined;
  readonly session: () => AgentTaskSessionPort;
  readonly clock: () => string;
  /** The projected task list (the newest resumable task is the target). */
  readonly tasks: () => readonly AgentComposerTaskView[];
  readonly setModelControls: (next: ModelControlsState) => void;
  readonly getModelControls: () => ModelControlsState;
  readonly refresh: () => Promise<void>;
}

export interface AgentComposerModelWiring {
  /** Load the catalog (idempotent; the honest phases surface). */
  loadModelCatalog(): Promise<void>;
  /** Record a selection on the newest resumable task (fail-closed). */
  selectModel(selection: AgentTaskModelSelectionPin): Promise<void>;
  /** taskModelRecovery: rehydrate the controls from the persisted record. */
  recoverModelSelection(tasks: readonly AgentComposerTaskView[]): void;
}

/** The newest resumable task (the journey task the selection rides). */
function newestResumableTask(tasks: readonly AgentComposerTaskView[]): AgentComposerTaskView | undefined {
  return tasks.find((task) => task.resumable);
}

export function createAgentComposerModelWiring(seams: AgentComposerModelSeams): AgentComposerModelWiring {
  const recoverModelSelection = (tasks: readonly AgentComposerTaskView[]): void => {
    const current = seams.getModelControls();
    const target = newestResumableTask(tasks);
    const persisted = (target as (AgentComposerTaskView & { readonly modelSelection?: AgentTaskModelSelectionPin }) | undefined)?.modelSelection;
    if (persisted === undefined) {
      // Nothing persisted — the controls keep NO selection (never a default).
      if (current.selection !== undefined) {
        seams.setModelControls({ ...current, selection: undefined });
      }
      return;
    }
    if (current.selection === undefined || current.selection.modelId !== persisted.modelId ||
      current.selection.providerId !== persisted.providerId || current.selection.reasoningLevel !== persisted.reasoningLevel) {
      seams.setModelControls({ ...current, selection: persisted });
    }
  };

  return {
    async loadModelCatalog(): Promise<void> {
      if (seams.catalog === undefined) {
        // The honest UNBOUND tier stands (never a fabricated list).
        seams.setModelControls({ ...MODEL_CONTROLS_UNBOUND_STATE });
        return;
      }
      const current = seams.getModelControls();
      seams.setModelControls({ ...current, phase: "LOADING" });
      try {
        const models = await seams.catalog.listModels();
        seams.setModelControls({ phase: "READY", models });
        recoverModelSelection(seams.tasks());
      } catch (thrown: unknown) {
        seams.setModelControls({
          phase: "ERROR",
          models: [],
          error: thrown instanceof Error ? thrown.message : String(thrown),
        });
      }
    },

    async selectModel(selection: AgentTaskModelSelectionPin): Promise<void> {
      const validated = requireValidModelSelectionPin(selection);
      // The budget law FIRST: a foreign level has no pinned budget mapping —
      // the control fails closed (never a coerced default budget).
      modelBudgetOf(validated.reasoningLevel);
      const current = seams.getModelControls();
      if (current.phase !== "READY") {
        throw new ModelSelectionControlError(
          "CATALOG_UNBOUND",
          "the model catalogue is not loaded in this deployment — no model selection can be recorded honestly (never a substituted default)",
        );
      }
      // The model must be in the LOADED catalog (never an invented entry).
      const known = current.models.some(
        (model) =>
          model.providerId === validated.providerId &&
          model.modelId === validated.modelId &&
          model.reasoningLevels.includes(validated.reasoningLevel),
      );
      if (!known) {
        throw new ModelSelectionControlError(
          "INVALID_SELECTION",
          `the selection ${validated.providerId}/${validated.modelId} (${validated.reasoningLevel}) is not in the loaded model catalogue — never recorded`,
        );
      }
      const target = newestResumableTask(seams.tasks());
      if (target === undefined) {
        throw new ModelSelectionControlError(
          "NO_TASK",
          "no resumable task exists to record the model selection on — seed a request first (a selection is never a side-effect seed)",
        );
      }
      await seams.session().recordModelSelection(target.id, validated, seams.clock());
      await seams.refresh();
      recoverModelSelection(seams.tasks());
    },

    recoverModelSelection,
  };
}

/** The persisted selection on a task record (the projection helper). */
export function taskModelSelectionOf(task: AgentTaskPin): AgentTaskModelSelectionPin | undefined {
  return task.modelSelection;
}
