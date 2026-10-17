/**
 * Dynamic-workflow engine surface tests (P3-W3): the engine vocabulary,
 * references, personas, submit verdicts, run events and workflow errors.
 */

import { describe, expect, it } from "vitest";

import {
  DWF_ARTIFACT_CONTENT_OPS,
  DWF_ARTIFACT_PRESET_OPS,
  DWF_NODE_KINDS,
  DWF_NODE_OUTCOMES,
  DWF_NUDGE_ATTEMPTS,
  DWF_PROVIDER_STOP_KINDS,
  DWF_REPAIR_ATTEMPTS,
  DWF_RUN_EVENT_KINDS,
  DWF_RUN_STATUSES,
  DWF_RUN_STOP_REASONS,
  DWF_TERMINAL_RUN_STATUSES,
  DWF_WORKFLOW_ERROR_CODES,
  DWF_WORLD_READ_OPS,
  dwfPersonaSpec,
  dwfRef,
  dwfRefToString,
  dwfRunEvent,
  dwfSubmitVerdict,
  dwfWorkflowErrorJson,
  isDwfAskStats,
  isDwfNodeKind,
  isDwfPhaseNameList,
  isDwfRunEventKind,
  isDwfRunStatus,
  isDwfRunStopReason,
  isDwfWorkflowErrorCode,
} from "../src/index.ts";

describe("dynamic-workflow engine surface", () => {
  it("pins the node-kind, outcome, run-status and stop-reason vocabularies", () => {
    expect([...DWF_NODE_KINDS]).toEqual([
      "ask",
      "world-read",
      "world-run",
      "report",
      "artifact",
    ]);
    expect([...DWF_NODE_OUTCOMES]).toEqual(["ok", "failed", "cancelled"]);
    expect([...DWF_RUN_STATUSES]).toEqual([
      "pending",
      "running",
      "completed",
      "errored",
      "stopped",
    ]);
    expect([...DWF_RUN_STOP_REASONS]).toEqual([
      "user",
      "model",
      "provider",
      "interrupted",
      "superseded",
    ]);
    expect([...DWF_TERMINAL_RUN_STATUSES]).toEqual([
      "completed",
      "errored",
      "stopped",
    ]);
  });

  it("pins the 25-kind run event vocabulary and the strategy constants", () => {
    expect(DWF_RUN_EVENT_KINDS.length).toBe(25);
    expect(DWF_RUN_EVENT_KINDS[0]).toBe("run-started");
    expect(DWF_RUN_EVENT_KINDS[24]).toBe("run-settled");
    expect(DWF_RUN_EVENT_KINDS).toContain("compaction"); // reserved, never emitted in v1
    expect(DWF_REPAIR_ATTEMPTS).toBe(3);
    expect(DWF_NUDGE_ATTEMPTS).toBe(1);
    expect(Object.isFrozen(DWF_RUN_EVENT_KINDS)).toBe(true);
  });

  it("pins the world-read and artifact op registries (OBSERVED vocabulary)", () => {
    expect([...DWF_WORLD_READ_OPS]).toEqual([
      "glob",
      "read",
      "grep",
      "git-changed-files",
      "git-diff",
      "git-status",
      "git-log",
      "run",
    ]);
    expect([...DWF_ARTIFACT_CONTENT_OPS]).toEqual(["file", "markdown"]);
    expect([...DWF_ARTIFACT_PRESET_OPS]).toEqual([
      "chart",
      "table",
      "metrics",
      "board",
    ]);
  });

  it("guards recognize vocabulary members", () => {
    expect(isDwfRunStatus("running")).toBe(true);
    expect(isDwfRunStatus("failed")).toBe(false);
    expect(isDwfRunStopReason("superseded")).toBe(true);
    expect(isDwfRunStopReason("timeout")).toBe(false);
    expect(isDwfRunEventKind("node-settled")).toBe(true);
    expect(isDwfRunEventKind("node-expired")).toBe(false);
    expect(isDwfNodeKind("ask")).toBe(true);
    expect(isDwfNodeKind("query")).toBe(false);
    expect(isDwfWorkflowErrorCode("ProviderStop")).toBe(true);
    expect(isDwfWorkflowErrorCode("UnknownError")).toBe(false);
    expect(isDwfPhaseNameList(["a", "b"])).toBe(true);
    expect(isDwfPhaseNameList("a")).toBe(false);
  });

  it("pins all 25 workflow error codes in substrate declaration order", () => {
    expect(DWF_WORKFLOW_ERROR_CODES.length).toBe(25);
    expect(DWF_WORKFLOW_ERROR_CODES[0]).toBe("ValidationFailed");
    expect(DWF_WORKFLOW_ERROR_CODES[24]).toBe("ArtifactPrimaryConflict");
    expect(Object.isFrozen(DWF_WORKFLOW_ERROR_CODES)).toBe(true);
  });

  it("validates references and renders the site@ordinal handle", () => {
    const ref = dwfRef({ siteId: "ask#3", ordinal: 2 });
    expect(Object.isFrozen(ref)).toBe(true);
    expect(dwfRefToString(ref)).toBe("ask#3@2");
    expect(() => dwfRef({ siteId: "", ordinal: 1 })).toThrowError(/siteId/);
    expect(() => dwfRef({ siteId: "s", ordinal: 0 })).toThrowError(/ordinal/);
  });

  it("validates persona specs (identity only: name + system)", () => {
    expect(dwfPersonaSpec({})).toEqual({});
    expect(dwfPersonaSpec({ name: "reviewer", system: "you review" })).toEqual({
      name: "reviewer",
      system: "you review",
    });
    expect(() => dwfPersonaSpec({ name: "" })).toThrowError(/name/);
    expect(Object.isFrozen(dwfPersonaSpec({ name: "x" }))).toBe(true);
  });

  it("validates all three submit verdict arms", () => {
    expect(dwfSubmitVerdict({ kind: "accept" })).toEqual({ kind: "accept" });
    expect(dwfSubmitVerdict({ kind: "nudge" })).toEqual({ kind: "nudge" });
    const reject = dwfSubmitVerdict({
      kind: "reject",
      violations: [{ path: "$.result", expected: "string", got: "number" }],
    });
    expect(Object.isFrozen(reject)).toBe(true);
    expect(() =>
      dwfSubmitVerdict({ kind: "reject", violations: [] }),
    ).toThrowError(/violations/);
    expect(() => dwfSubmitVerdict({ kind: "maybe" })).toThrowError(/kind/);
  });

  it("validates run events with pinned kinds and optional payloads", () => {
    const event = dwfRunEvent({
      type: "run-started",
      runId: "run_1",
      payload: { maxConcurrency: 4 },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(event.payload).toEqual({ maxConcurrency: 4 });
    expect(() => dwfRunEvent({ type: "run-exploded" })).toThrowError(/type/);
    expect(() => dwfRunEvent({ type: "log", runId: "" })).toThrowError(/runId/);
    expect(() => dwfRunEvent({ type: "log", payload: "not-an-object" })).toThrowError(
      /payload/,
    );
  });

  it("validates workflow error json with all optional detail arms", () => {
    const error = dwfWorkflowErrorJson({
      code: "ProviderStop",
      message: "model auth failed",
      providerStop: { kind: "auth", reason: "401" },
    });
    expect(Object.isFrozen(error)).toBe(true);
    expect(error.providerStop?.kind).toBe("auth");
    const mismatch = dwfWorkflowErrorJson({
      code: "ScriptHashMismatch",
      message: "script changed",
      mismatch: { expected: "aaa", got: "bbb" },
      finalText: "script body",
    });
    expect(mismatch.mismatch?.expected).toBe("aaa");
  });

  it("workflow error json rejects unknown codes, empty messages and bad provider stops", () => {
    expect(() =>
      dwfWorkflowErrorJson({ code: "MadeUp", message: "x" }),
    ).toThrowError(/code/);
    expect(() =>
      dwfWorkflowErrorJson({ code: "Cancelled", message: "" }),
    ).toThrowError(/message/);
    expect(() =>
      dwfWorkflowErrorJson({
        code: "ProviderStop",
        message: "x",
        providerStop: { kind: "offline" as never, reason: "r" },
      }),
    ).toThrowError(/providerStop.kind/);
    expect(() =>
      dwfWorkflowErrorJson({
        code: "ValidationFailed",
        message: "x",
        violations: [{ path: "p", expected: "e", got: "" }],
      }),
    ).toThrowError(/violations/);
  });

  it("pins the provider-stop kind vocabulary and recognizes ask stats", () => {
    expect([...DWF_PROVIDER_STOP_KINDS]).toEqual([
      "auth",
      "not_configured",
      "model_unavailable",
      "invalid_request",
      "quota",
      "other",
    ]);
    expect(isDwfAskStats({ tokens: 10, toolCalls: 2, turns: 1 })).toBe(true);
    expect(
      isDwfAskStats({ tokens: 10, toolCalls: 2, turns: 1, worldToolCalls: 0 }),
    ).toBe(true);
    expect(isDwfAskStats({ tokens: -1, toolCalls: 0, turns: 0 })).toBe(false);
    expect(isDwfAskStats({ tokens: 1, toolCalls: 0 })).toBe(false);
  });
});
