/**
 * Session port surface tests (P3-W3): statuses, observed collaboration
 * modes and the product-neutral posture projection (label only — never
 * financial authorization).
 */

import { describe, expect, it } from "vitest";

import {
  COLLABORATION_MODE_POSTURES,
  OBSERVED_BUILT_IN_AGENT_TYPES,
  OBSERVED_COLLABORATION_MODES,
  SESSION_MANAGER_CAPABILITIES,
  SESSION_STATUSES,
  collaborationModePosture,
  isObservedCollaborationMode,
  isSessionStatus,
  sessionWire,
} from "../src/index.ts";

describe("session port surface", () => {
  it("pins the session status vocabulary", () => {
    expect([...SESSION_STATUSES]).toEqual([
      "idle",
      "running",
      "waiting",
      "paused",
      "completed",
      "error",
    ]);
    expect(Object.isFrozen(SESSION_STATUSES)).toBe(true);
    expect(isSessionStatus("waiting")).toBe(true);
    expect(isSessionStatus("busy")).toBe(false);
  });

  it("pins the observed collaboration modes (substrate vocabulary)", () => {
    expect([...OBSERVED_COLLABORATION_MODES]).toEqual([
      "plan",
      "build",
      "edit",
      "yolo",
      "auto",
    ]);
    expect(isObservedCollaborationMode("yolo")).toBe(true);
    expect(isObservedCollaborationMode("chaos")).toBe(false);
  });

  it("projects each observed mode onto its neutral posture", () => {
    expect(collaborationModePosture("plan")).toBe("PROPOSE");
    expect(collaborationModePosture("build")).toBe("ACT");
    expect(collaborationModePosture("edit")).toBe("ACT");
    expect(collaborationModePosture("yolo")).toBe("AUTO");
    expect(collaborationModePosture("auto")).toBe("AUTO");
    expect(Object.isFrozen(COLLABORATION_MODE_POSTURES)).toBe(true);
    expect(() => collaborationModePosture("stealth" as never)).toThrowError(
      /observed collaboration mode/,
    );
  });

  it("the AUTO posture is APPLICATION permission auto-consent — still never financial authority (label law)", () => {
    // The posture vocabulary is a LABEL projection over application
    // permission modes; it carries no authority of any kind.
    for (const mode of OBSERVED_COLLABORATION_MODES) {
      const posture = collaborationModePosture(mode);
      expect(["PROPOSE", "ACT", "AUTO"]).toContain(posture);
    }
  });

  it("pins the session manager capability list (descriptive only)", () => {
    expect([...SESSION_MANAGER_CAPABILITIES]).toEqual([
      "createSession",
      "resumeSession",
      "forkSession",
      "getSession",
      "listSessions",
    ]);
  });

  it("constructs and freezes a session wire record with the DERIVED posture", () => {
    const session = sessionWire({ id: "sess_1", status: "running", mode: "plan" });
    expect(Object.isFrozen(session)).toBe(true);
    expect(session.projectedPosture).toBe("PROPOSE");
    const yolo = sessionWire({ id: "sess_2", status: "idle", mode: "yolo" });
    expect(yolo.projectedPosture).toBe("AUTO");
  });

  it("a session without a mode projects to the ACT posture (the acting default)", () => {
    const session = sessionWire({ id: "sess_3", status: "idle" });
    expect(session.mode).toBeUndefined();
    expect(session.projectedPosture).toBe("ACT");
  });

  it("rejects bad statuses, bad modes and empty ids", () => {
    expect(() => sessionWire({ id: "s", status: "zooming" as never })).toThrowError(
      /status/,
    );
    expect(() =>
      sessionWire({ id: "s", status: "idle", mode: "turbo" as never }),
    ).toThrowError(/mode/);
    expect(() => sessionWire({ id: "", status: "idle" })).toThrowError(/id/);
  });

  it("records the substrate's built-in agent types as observed vocabulary (coding flavor noted)", () => {
    expect([...OBSERVED_BUILT_IN_AGENT_TYPES]).toEqual([
      "general-purpose",
      "Explore",
    ]);
  });
});
