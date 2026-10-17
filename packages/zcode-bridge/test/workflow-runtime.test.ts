/**
 * Dynamic-workflow runtime protocol surface tests (P3-W3): the NDJSON
 * child<->parent wire.
 */

import { describe, expect, it } from "vitest";

import {
  DWF_CHILD_MESSAGE_KINDS,
  DWF_PARENT_MESSAGE_KINDS,
  DWF_WIRE_EVENT_TYPES,
  DWF_WIRE_REQUEST_TYPES,
  dwfCompleteMessage,
  dwfCreateActorMessage,
  dwfDeclareArtifactEventMessage,
  dwfLogEventMessage,
  dwfPhaseEnteredEventMessage,
  dwfReportEventMessage,
  dwfRequestMessage,
  dwfResponseMessage,
  dwfWireError,
  isDwfWireEventType,
} from "../src/index.ts";

describe("dynamic-workflow runtime protocol surface", () => {
  it("pins the message-kind, request-type and event-type vocabularies", () => {
    expect([...DWF_CHILD_MESSAGE_KINDS]).toEqual([
      "create-actor",
      "request",
      "event",
      "complete",
    ]);
    expect([...DWF_PARENT_MESSAGE_KINDS]).toEqual(["response"]);
    expect([...DWF_WIRE_REQUEST_TYPES]).toEqual([
      "ask",
      "world-read",
      "publish-artifact",
    ]);
    expect([...DWF_WIRE_EVENT_TYPES]).toEqual([
      "log",
      "report",
      "declare-artifact",
      "phase-entered",
    ]);
    expect(Object.isFrozen(DWF_WIRE_REQUEST_TYPES)).toBe(true);
    expect(isDwfWireEventType("report")).toBe(true);
    expect(isDwfWireEventType("escalate")).toBe(false);
  });

  it("validates create-actor messages", () => {
    const message = dwfCreateActorMessage({
      kind: "create-actor",
      localId: "local-1",
      siteId: "agent#1",
      name: "reviewer",
      persona: { name: "reviewer" },
    });
    expect(Object.isFrozen(message)).toBe(true);
    expect(() =>
      dwfCreateActorMessage({ kind: "request", localId: "l", siteId: "s" }),
    ).toThrowError(/kind/);
    expect(() =>
      dwfCreateActorMessage({ kind: "create-actor", localId: "", siteId: "s" }),
    ).toThrowError(/localId/);
  });

  it("validates ask, world-read and publish-artifact request messages", () => {
    const ask = dwfRequestMessage({
      kind: "request",
      id: "req-1",
      type: "ask",
      siteId: "ask#1",
      actor: "agent-1",
      instructions: "review the diff",
    });
    expect(Object.isFrozen(ask)).toBe(true);
    const worldRead = dwfRequestMessage({
      kind: "request",
      id: "req-2",
      type: "world-read",
      siteId: "world#1",
      op: "git-status",
      args: [],
    });
    expect(worldRead.op).toBe("git-status");
    const publish = dwfRequestMessage({
      kind: "request",
      id: "req-3",
      type: "publish-artifact",
      siteId: "artifact#1",
      artifactOp: "markdown",
      args: ["report.md", "body"],
    });
    expect(publish.artifactOp).toBe("markdown");
  });

  it("request messages reject unknown types and per-type member violations", () => {
    expect(() =>
      dwfRequestMessage({ kind: "request", id: "1", type: "sleep", siteId: "s" }),
    ).toThrowError(/type/);
    expect(() =>
      dwfRequestMessage({ kind: "event", id: "1", type: "ask", siteId: "s" }),
    ).toThrowError(/kind/);
    expect(() =>
      dwfRequestMessage({
        kind: "request",
        id: "1",
        type: "publish-artifact",
        siteId: "s",
        artifactOp: "chart" as never,
      }),
    ).toThrowError(/artifactOp/);
    expect(() =>
      dwfRequestMessage({ kind: "request", id: "1", type: "ask", siteId: "" }),
    ).toThrowError(/siteId/);
  });

  it("validates the four event messages", () => {
    expect(dwfLogEventMessage({ kind: "event", type: "log", message: "hi" }).message).toBe(
      "hi",
    );
    const report = dwfReportEventMessage({
      kind: "event",
      type: "report",
      siteId: "ask#2",
      item: { finding: "x" },
      artifactId: "perf",
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(report.artifactId).toBe("perf");
    expect(() =>
      dwfLogEventMessage({ kind: "event", type: "report", message: "x" }),
    ).toThrowError(/kind\/type/);
    expect(() =>
      dwfReportEventMessage({ kind: "event", type: "report", siteId: "s", item: 1 }),
    ).not.toThrow();
    const declare = dwfDeclareArtifactEventMessage({
      kind: "event",
      type: "declare-artifact",
      siteId: "artifact#1",
      op: "table",
      args: ["t", {}],
    });
    expect(declare.op).toBe("table");
    expect(() =>
      dwfDeclareArtifactEventMessage({
        kind: "event",
        type: "declare-artifact",
        siteId: "s",
        op: "timeline" as never,
        args: [],
      }),
    ).toThrowError(/op/);
    expect(
      dwfPhaseEnteredEventMessage({ kind: "event", type: "phase-entered", name: "review" })
        .name,
    ).toBe("review");
  });

  it("validates wire errors with optional structured detail", () => {
    const error = dwfWireError({
      name: "WorkflowError",
      message: "bad result",
      code: "ResultNotSubmitted",
      violations: [{ path: "$", expected: "object", got: "null" }],
      finalText: "partial",
      stack: "at workflow.ts:9",
    });
    expect(Object.isFrozen(error)).toBe(true);
    expect(error.code).toBe("ResultNotSubmitted");
    expect(() => dwfWireError({ name: "", message: "x" })).toThrowError(/name/);
    expect(() =>
      dwfWireError({ name: "E", message: "x", violations: [{ path: "p", expected: "e", got: "" }] }),
    ).toThrowError(/violations/);
  });

  it("validates complete and response messages (error arm validated too)", () => {
    const complete = dwfCompleteMessage({
      kind: "complete",
      ok: true,
      value: { summary: "done" },
    });
    expect(Object.isFrozen(complete)).toBe(true);
    const failed = dwfCompleteMessage({
      kind: "complete",
      ok: false,
      error: { name: "WorkflowError", message: "boom" },
    });
    expect(failed.error?.name).toBe("WorkflowError");
    const response = dwfResponseMessage({
      kind: "response",
      id: "req-1",
      ok: true,
      value: "answer",
    });
    expect(response.value).toBe("answer");
    expect(() =>
      dwfCompleteMessage({ kind: "complete", ok: "yes" as never }),
    ).toThrowError(/ok/);
    expect(() =>
      dwfResponseMessage({ kind: "response", id: "", ok: true }),
    ).toThrowError(/id/);
    expect(() =>
      dwfResponseMessage({ kind: "response", id: "1", ok: false, error: { name: "x", message: "" } }),
    ).toThrowError(/error/);
  });
});
