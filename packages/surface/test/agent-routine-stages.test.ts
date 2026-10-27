/**
 * @payswap/surface — the agent ROUTINE-STAGE vocabulary battery (P21-B,
 * ADR-0014 D3/D4; failing-first).
 *
 * Pins the stage-progress contract vocabulary BY VALUE against
 * ROUTINE-CONTRACT.md + packages/route-planning/src/manifest.ts (the
 * canonical 12-stage vocabulary — ONE workflow vocabulary, never a second
 * one), plus the model-selection field contract on the shared task
 * envelope (D4) and the ROUTINE_PINNED event kind (D3 stage 0).
 */

import { describe, expect, it } from "vitest";

import {
  AGENT_ROUTINE_STAGE_IDS,
  AGENT_ROUTINE_STAGES,
  AGENT_TASK_STAGE_STATUSES,
  ROUTINE_STAGE_STATUS_LABELS,
  type AgentRoutineStageDeclaration,
} from "../src/agent-routine-stages.ts";
import {
  AGENT_TASK_EVENT_KINDS,
  type AgentTask,
  type AgentTaskModelSelection,
} from "../src/agent-tasks.ts";
import { validateAgentTask } from "../src/agent-task-validation.ts";

describe("the routine stage vocabulary (ADR-0014 D3 — ROUTINE-CONTRACT's OWN 12 stages)", () => {
  it("pins the TWELVE stage ids verbatim from the routine manifest (0..10 with the 9a/9b branches)", () => {
    expect([...AGENT_ROUTINE_STAGE_IDS]).toEqual([
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9a", "9b", "10",
    ]);
  });

  it("pins every stage's title verbatim from ROUTINE-CONTRACT's stage contract table", () => {
    const titles = Object.fromEntries(AGENT_ROUTINE_STAGES.map((s) => [s.stageId, s.title]));
    expect(titles["0"]).toBe("Match + load");
    expect(titles["1"]).toBe("Validate / clarify");
    expect(titles["2"]).toBe("Discover sender rails");
    expect(titles["3"]).toBe("Discover recipient rails");
    expect(titles["4"]).toBe("Compile available routes");
    expect(titles["5"]).toBe("Apply hard gates and rank");
    expect(titles["6"]).toBe("Explore bounded counterfactuals");
    expect(titles["7"]).toBe("Discover offers and opportunities");
    expect(titles["8"]).toBe("Present user choices");
    expect(titles["9a"]).toBe("Proceed now");
    expect(titles["9b"]).toBe("Wait for opportunities");
    expect(titles["10"]).toBe("Reconcile and close");
  });

  it("pins the handler ids + the branch/advisory/authority classes (the manifest's own vocabulary)", () => {
    const byId = (id: string): AgentRoutineStageDeclaration =>
      AGENT_ROUTINE_STAGES.find((s) => s.stageId === id)!;
    expect(byId("0").handlerId).toBe("route-planning/match-and-load");
    expect(byId("6").handlerId).toBe("route-planning/explore-bounded-counterfactuals");
    expect(byId("6").advisory).toBe(true);
    expect(byId("9a").handlerId).toBe("route-planning/proceed-now");
    expect(byId("9a").authorityClass).toBe("EFFECT_BEARING");
    expect(byId("9b").advisory).toBe(true);
    expect(byId("9b").authorityClass).toBe("ADVISORY");
    expect(byId("10").authorityClass).toBe("RECONCILIATION");
    for (const stage of AGENT_ROUTINE_STAGES) {
      expect(["LINEAR", "ALTERNATIVE"]).toContain(stage.branch);
      expect(typeof stage.handlerId).toBe("string");
    }
  });

  it("the stage declarations are frozen and unique (a closed vocabulary)", () => {
    expect(Object.isFrozen(AGENT_ROUTINE_STAGES)).toBe(true);
    expect(new Set(AGENT_ROUTINE_STAGE_IDS).size).toBe(AGENT_ROUTINE_STAGE_IDS.length);
  });
});

describe("the stage-progress projection vocabulary (the substrate plan pattern, app-consumable)", () => {
  it("pins the three plan statuses + their people-language labels", () => {
    expect([...AGENT_TASK_STAGE_STATUSES]).toEqual(["PENDING", "IN_PROGRESS", "COMPLETED"]);
    expect(ROUTINE_STAGE_STATUS_LABELS.PENDING).toBe("pending");
    expect(ROUTINE_STAGE_STATUS_LABELS.IN_PROGRESS).toBe("in progress");
    expect(ROUTINE_STAGE_STATUS_LABELS.COMPLETED).toBe("completed");
  });

  it("exposes the per-stage prerequisite/checkpoint contract fields (never a bare checklist)", () => {
    for (const stage of AGENT_ROUTINE_STAGES) {
      expect(typeof stage.prerequisites).toBe("string");
      expect(stage.prerequisites.length).toBeGreaterThan(0);
      expect(typeof stage.checkpoint).toBe("string");
      expect(stage.checkpoint.length).toBeGreaterThan(0);
    }
    // The effect-bearing stage's prerequisite IS the fresh scoped authorization (the law).
    const proceed = AGENT_ROUTINE_STAGES.find((s) => s.stageId === "9a")!;
    expect(proceed.prerequisites).toContain("fresh scoped authorization");
  });
});

describe("the ROUTINE_PINNED task event (D3 stage 0)", () => {
  it("is a member of the shared event vocabulary (appended after WAIT_EXPIRED)", () => {
    expect([...AGENT_TASK_EVENT_KINDS]).toContain("ROUTINE_PINNED");
    expect(AGENT_TASK_EVENT_KINDS[AGENT_TASK_EVENT_KINDS.length - 1]).toBe("ROUTINE_PINNED");
  });
});

describe("the model-selection field (D4 — the selection persists on the task record)", () => {
  const baseTask = {
    id: "task:PAYMENT_MISSION:1",
    kind: "PAYMENT_MISSION",
    intent: { kind: "PAYMENT_MISSION", direction: "PAY", goalStatement: "pay the supplier" },
    origin: "COMPOSER_TEXT",
    createdAt: "2026-10-27T12:00:00Z",
    updatedAt: "2026-10-27T12:00:00Z",
    status: "ACTIVE",
    events: [],
  } as const;

  it("a task WITHOUT modelSelection stays valid (old consumers keep compiling — the additive law)", () => {
    expect(() => validateAgentTask(baseTask)).not.toThrow();
  });

  it("a task WITH a well-formed modelSelection validates", () => {
    const selection: AgentTaskModelSelection = {
      providerId: "zai",
      modelId: "glm-5.2",
      reasoningLevel: "medium",
    };
    expect(() => validateAgentTask({ ...baseTask, modelSelection: selection })).not.toThrow();
    const task = validateAgentTask({ ...baseTask, modelSelection: selection }) as AgentTask;
    expect(task.modelSelection?.modelId).toBe("glm-5.2");
  });

  it("a malformed modelSelection fails CLOSED (exact keys, non-empty strings — never coerced)", () => {
    expect(() => validateAgentTask({ ...baseTask, modelSelection: {} })).toThrow();
    expect(() =>
      validateAgentTask({ ...baseTask, modelSelection: { providerId: "zai" } }),
    ).toThrow();
    expect(() =>
      validateAgentTask({
        ...baseTask,
        modelSelection: { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "" },
      }),
    ).toThrow();
    expect(() =>
      validateAgentTask({
        ...baseTask,
        modelSelection: {
          providerId: "zai",
          modelId: "glm-5.2",
          reasoningLevel: "medium",
          extra: "no",
        },
      }),
    ).toThrow();
  });
});
