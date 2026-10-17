/**
 * Session events surface tests (P3-W3): envelope law with the ISO-string
 * serialization pin, the 79-name vocabulary, and the family projection.
 */

import { describe, expect, it } from "vitest";

import {
  SESSION_EVENT_FAMILY_NAMES,
  SESSION_EVENT_TYPES,
  TURN_COMPLETE_RESULT_TYPES,
  isIsoUtcTimestamp,
  isSessionEventType,
  sessionEvent,
  sessionEventFamilyCoverage,
  sessionEventFamilyOf,
} from "../src/index.ts";

const VALID_EVENT = {
  id: "evt_1",
  sessionId: "sess_1",
  type: "tool_call_result",
  timestamp: "2026-10-17T07:30:00Z",
  traceId: "trace_1",
  sequenceNumber: 42,
  payload: { toolCallId: "tool_1", success: true },
};

describe("session events surface", () => {
  it("pins the full 79-name vocabulary in substrate declaration order", () => {
    expect(SESSION_EVENT_TYPES.length).toBe(79);
    expect(SESSION_EVENT_TYPES[0]).toBe("session_created");
    expect(SESSION_EVENT_TYPES[6]).toBe("session_ended");
    expect(SESSION_EVENT_TYPES[19]).toBe("turn_complete");
    expect(SESSION_EVENT_TYPES[20]).toBe("turn_error");
    expect(SESSION_EVENT_TYPES[49]).toBe("dynamic_workflow_run_progress");
    expect(SESSION_EVENT_TYPES[72]).toBe("subagent_spawned");
    expect(SESSION_EVENT_TYPES[78]).toBe("error");
    expect(Object.isFrozen(SESSION_EVENT_TYPES)).toBe(true);
  });

  it("recognizes members and rejects outsiders", () => {
    expect(isSessionEventType("model_streaming")).toBe(true);
    expect(isSessionEventType("permission_requested")).toBe(true);
    expect(isSessionEventType("compaction_started")).toBe(false);
    expect(isSessionEventType("")).toBe(false);
    expect(isSessionEventType(7)).toBe(false);
  });

  it("accepts strict ISO-8601 UTC timestamps only (the serialization pin)", () => {
    expect(isIsoUtcTimestamp("2026-10-17T07:30:00Z")).toBe(true);
    expect(isIsoUtcTimestamp("2026-10-17T07:30:00.123Z")).toBe(true);
    expect(isIsoUtcTimestamp("2026-10-17T07:30:00+02:00")).toBe(false);
    expect(isIsoUtcTimestamp("2026-10-17 07:30:00Z")).toBe(false);
    expect(isIsoUtcTimestamp("2026-13-01T00:00:00Z")).toBe(false);
    expect(isIsoUtcTimestamp("2026-10-17T25:00:00Z")).toBe(false);
    expect(isIsoUtcTimestamp("not-a-time")).toBe(false);
  });

  it("constructs and freezes a valid session event envelope", () => {
    const event = sessionEvent({ ...VALID_EVENT, turnId: "turn_9" });
    expect(Object.isFrozen(event)).toBe(true);
    expect(event.turnId).toBe("turn_9");
    expect(event.payload).toEqual({ toolCallId: "tool_1", success: true });
  });

  it("rejects unknown event types, bad timestamps and non-positive sequence numbers", () => {
    expect(() => sessionEvent({ ...VALID_EVENT, type: "made_up" })).toThrowError(/type/);
    expect(() =>
      sessionEvent({ ...VALID_EVENT, timestamp: "2026-10-17" }),
    ).toThrowError(/timestamp/);
    expect(() =>
      sessionEvent({ ...VALID_EVENT, sequenceNumber: 0 }),
    ).toThrowError(/sequenceNumber/);
    expect(() => sessionEvent({ ...VALID_EVENT, sessionId: "" })).toThrowError(/sessionId/);
    expect(() =>
      sessionEvent({ ...VALID_EVENT, turnId: "" as never }),
    ).toThrowError(/turnId/);
  });

  it("the family projection covers all 79 types exactly once across ten families", () => {
    expect(sessionEventFamilyCoverage()).toBe(79);
    expect(SESSION_EVENT_FAMILY_NAMES.length).toBe(10);
    expect(Object.isFrozen(SESSION_EVENT_FAMILY_NAMES)).toBe(true);
  });

  it("projects representative event types onto their families", () => {
    expect(sessionEventFamilyOf("session_created")).toBe("session");
    expect(sessionEventFamilyOf("turn_started")).toBe("turn");
    expect(sessionEventFamilyOf("turn_steer_queued")).toBe("input_control");
    expect(sessionEventFamilyOf("assistant_message")).toBe("message");
    expect(sessionEventFamilyOf("model_streaming")).toBe("model");
    expect(sessionEventFamilyOf("stream_recovery_started")).toBe("stream_recovery");
    expect(sessionEventFamilyOf("tool_call_result")).toBe("tool");
    expect(sessionEventFamilyOf("dynamic_workflow_run_progress")).toBe("background_task");
    expect(sessionEventFamilyOf("permission_requested")).toBe("permission_and_hooks");
    expect(sessionEventFamilyOf("subagent_spawned")).toBe("history_and_lifecycle");
    expect(sessionEventFamilyOf("interrupt")).toBe("history_and_lifecycle");
  });

  it("unknown event types project to undefined", () => {
    expect(sessionEventFamilyOf("not_an_event")).toBeUndefined();
  });

  it("pins the turn-completion result types", () => {
    expect([...TURN_COMPLETE_RESULT_TYPES]).toEqual([
      "success",
      "cancelled",
      "error_max_turns",
      "error_max_budget",
      "error_during_execution",
      "error_max_tool_calls",
    ]);
  });

  it("payload data is cloned, not aliased (caller mutation cannot reach the frozen event)", () => {
    const payload = { nested: { value: 1 } };
    const event = sessionEvent({ ...VALID_EVENT, payload });
    payload.nested.value = 999;
    expect(
      (event.payload as { nested: { value: number } }).nested.value,
    ).toBe(1);
  });
});
