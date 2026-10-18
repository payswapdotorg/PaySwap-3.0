import { describe, expect, it } from "vitest";
import { executeOnchainLane, ONCHAIN_LANE_FAULT_KINDS } from "../src/execution-walk.ts";
import { ValidationError } from "../src/errors.ts";
import { provedFixtureLane } from "./lane-fixtures.ts";
import { NOW } from "./fixtures.ts";

/**
 * The lane execution walk (PORT of the old mixed-rail
 * execution-walk + simulation-faults suites): deterministic
 * fault-injectable observations with the canonical outcome mappings;
 * UNKNOWN is honest and terminal; staleness first.
 */
const AT = NOW;
const OBSERVED_AT = "2026-10-03T00:00:01Z";

function provedLane() {
  const lane = provedFixtureLane();
  if (lane.status !== "LANE_PROVED") {
    throw new Error("the fixture lane must be proved");
  }
  return lane.lane;
}

describe("the lane walk (deterministic, fault-injectable)", () => {
  it("the happy path CONFIRMS with a finality CANDIDATE (candidate-only, depth 1, the lane's model)", () => {
    const execution = executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: OBSERVED_AT });
    if (execution.status !== "EXECUTED") {
      throw new Error("the fixture execution must be EXECUTED");
    }
    expect(execution.outcome).toBe("CONFIRMED");
    expect(execution.observation.finalityCandidate).toEqual({
      candidateOnly: true,
      requiresProtocolFinality: true,
      confirmationDepth: 1,
      finalityModel: "PROBABILISTIC",
      reorgDetected: false,
    });
    expect(execution.railOutcome).toEqual({ kind: "RAIL_EFFECT_OBSERVED", finalityCandidateOnly: true, evidenceRefs: execution.observation.evidenceRefs });
    expect(execution.eventCandidate).toEqual({ kind: "EVENT_CANDIDATE", event: "CONFIRM_SUCCEEDED" });
    expect(execution.observation.provenance.providerName).toBe("payswap-route-compiler-lane-walk");
  });

  it("a PROTOCOL_FAILURE maps to the canonical FAILED rail outcome and event candidate", () => {
    const execution = executeOnchainLane({
      lane: provedLane(),
      at: AT,
      observedAtIso: OBSERVED_AT,
      fault: {
        kind: "PROTOCOL_FAILURE",
        failureClass: "INSUFFICIENT_FUNDS",
        description: "the fixture protocol failure",
        retryGuidance: "NOT_RETRYABLE",
      },
    });
    if (execution.status !== "EXECUTED") {
      throw new Error("unreachable");
    }
    expect(execution.outcome).toBe("FAILED");
    expect(execution.railOutcome.kind).toBe("RAIL_EFFECT_FAILED");
    expect(execution.eventCandidate).toEqual({ kind: "EVENT_CANDIDATE", event: "CONFIRM_FAILED" });
    expect(execution.observation.failure).toEqual({
      failureClass: "INSUFFICIENT_FUNDS",
      description: "the fixture protocol failure",
      retryGuidance: "NOT_RETRYABLE",
    });
    expect(execution.lifecycleStages).not.toContain("reconcile");
  });

  it("an UNFINALIZED_BROADCAST stays submitted-not-final (never confirmed, never failed)", () => {
    const execution = executeOnchainLane({
      lane: provedLane(),
      at: AT,
      observedAtIso: OBSERVED_AT,
      fault: { kind: "UNFINALIZED_BROADCAST" },
    });
    if (execution.status !== "EXECUTED") {
      throw new Error("unreachable");
    }
    expect(execution.outcome).toBe("BROADCAST");
    expect(execution.observation.finalityCandidate).toBeUndefined();
    expect(execution.observation.failure).toBeUndefined();
    expect(execution.observation.unknownReason).toBeUndefined();
    expect(execution.railOutcome.kind).toBe("RAIL_EFFECT_PENDING");
    expect(execution.eventCandidate).toEqual({ kind: "NO_EVENT", reason: "SUBMITTED_NOT_FINAL" });
  });

  it("an OUTCOME_UNKNOWN fault is an HONEST TERMINAL STATE (never coerced, never retried blindly)", () => {
    const execution = executeOnchainLane({
      lane: provedLane(),
      at: AT,
      observedAtIso: OBSERVED_AT,
      fault: { kind: "OUTCOME_UNKNOWN", reason: "a fixture reorg left the outcome unknown" },
    });
    if (execution.status !== "EXECUTED") {
      throw new Error("unreachable");
    }
    expect(execution.outcome).toBe("OUTCOME_UNKNOWN");
    expect(execution.observation.unknownReason).toContain("reorg");
    expect(execution.observation.failure).toBeUndefined();
    expect(execution.railOutcome).toEqual({
      kind: "RAIL_EFFECT_UNKNOWN",
      requiresReconciliation: true,
      reason: "a fixture reorg left the outcome unknown",
      evidenceRefs: execution.observation.evidenceRefs,
    });
    expect(execution.eventCandidate).toEqual({ kind: "EVENT_CANDIDATE", event: "OUTCOME_UNKNOWN" });
    expect(execution.lifecycleStages).toContain("reconcile");
  });

  it("a stale lane grounding at execution time is GROUNDING_STALE (not executed, not failed)", () => {
    const execution = executeOnchainLane({ lane: provedLane(), at: NOW + 7_200_000, observedAtIso: OBSERVED_AT });
    expect(execution.status).toBe("GROUNDING_STALE");
    if (execution.status === "GROUNDING_STALE") {
      expect(execution.reason).toContain("aged out");
      expect(execution.lifecycleStages).toEqual(["observe"]);
      expect(execution.evidenceRefs[0]).toContain("asset-observation:");
    }
  });

  it("determinism: the same walk inputs produce byte-identical executions", () => {
    const first = executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: OBSERVED_AT });
    const second = executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: OBSERVED_AT });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("the deterministic ids are pure functions of the lane (or caller-supplied)", () => {
    const execution = executeOnchainLane({
      lane: provedLane(),
      at: AT,
      observedAtIso: OBSERVED_AT,
      executionRef: "custom-exec:001",
      observationId: "custom-obs:001",
      externalOperationRef: "custom-tx:001",
    });
    if (execution.status !== "EXECUTED") {
      throw new Error("unreachable");
    }
    expect(execution.observation.executionRef).toBe("custom-exec:001");
    expect(execution.observation.observationId).toBe("custom-obs:001");
    expect(execution.observation.externalOperationRef).toBe("custom-tx:001");
    const defaulted = executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: OBSERVED_AT });
    if (defaulted.status !== "EXECUTED") {
      throw new Error("unreachable");
    }
    expect(defaulted.observation.executionRef).toBe(`lane-walk-exec:${provedLane().laneId}`);
  });

  it("malformed walk inputs are rejected fail-closed (no ambient clock, no empty stamps)", () => {
    expect(() => executeOnchainLane({ lane: provedLane(), at: -1, observedAtIso: OBSERVED_AT })).toThrowError(
      ValidationError,
    );
    expect(() => executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: "" })).toThrowError(
      /non-empty/,
    );
  });

  it("the fault vocabulary is closed and includes UNKNOWN", () => {
    expect([...ONCHAIN_LANE_FAULT_KINDS]).toEqual(["PROTOCOL_FAILURE", "UNFINALIZED_BROADCAST", "OUTCOME_UNKNOWN"]);
  });

  it("the tier brand is on every walk result (EXECUTED and GROUNDING_STALE alike)", () => {
    for (const execution of [
      executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: OBSERVED_AT }),
      executeOnchainLane({ lane: provedLane(), at: NOW + 7_200_000, observedAtIso: OBSERVED_AT }),
    ]) {
      expect(execution.executionTier).toBe("LAB_SIMULATION_NON_PRODUCTION");
    }
  });

  it("the observation evidence carries the lane's evidence chain (never anonymous)", () => {
    const execution = executeOnchainLane({ lane: provedLane(), at: AT, observedAtIso: OBSERVED_AT });
    if (execution.status !== "EXECUTED") {
      throw new Error("unreachable");
    }
    expect(execution.observation.evidenceRefs.length).toBeGreaterThan(1);
    expect(execution.evidenceRefs).toContain(`lane-execution:lane-walk-exec:${provedLane().laneId}`);
  });

  it("the lifecycle stages never include authorize or broadcast (propose and observe, never execute)", () => {
    for (const fault of [undefined, { kind: "PROTOCOL_FAILURE" as const, failureClass: "REVERTED" as const, description: "d", retryGuidance: "SAFE_TO_RETRY" as const }, { kind: "UNFINALIZED_BROADCAST" as const }, { kind: "OUTCOME_UNKNOWN" as const, reason: "r" }]) {
      const execution = executeOnchainLane({
        lane: provedLane(),
        at: AT,
        observedAtIso: OBSERVED_AT,
        ...(fault !== undefined ? { fault } : {}),
      });
      expect(execution.lifecycleStages).not.toContain("authorize");
      expect(execution.lifecycleStages).not.toContain("broadcast");
    }
  });
});
