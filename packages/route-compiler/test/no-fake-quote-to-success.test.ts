import { describe, expect, it } from "vitest";
import { BestExecutionEngine } from "../src/best-execution.ts";
import { RouteExecutionRecord } from "../src/execution-record.ts";
import { ExecutionTransitionError } from "../src/errors.ts";
import { fixtureEngine, baseEngineRequest } from "./lane-fixtures.ts";
import { NOW } from "./fixtures.ts";

/**
 * The no-fake-quote seam (PORT of the old no-fake-quote-to-success
 * suite): a quote can NEVER produce an executed state; the ONLY path to
 * an executed state is a domain-validated execution observation bound
 * to this record's executionRef and the route's chain.
 */
function selectedDecision() {
  const decision = fixtureEngine().execute(baseEngineRequest());
  if (decision.decision !== "ROUTE_SELECTED") {
    throw new Error("the fixture decision must select");
  }
  return decision;
}

function openedRecord() {
  const decision = selectedDecision();
  const record = RouteExecutionRecord.open(decision);
  record.recordPreparedWrite(decision.selected.write, NOW);
  record.recordGateDecision({ decision: "ALLOW" }, NOW);
  record.recordBroadcastHandoff("handoff:fixture:001", NOW);
  return { record, decision };
}

function observationFor(decision: ReturnType<typeof selectedDecision>, outcome: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN", options?: { executionRef?: string; chainKey?: string; finalityCandidate?: unknown; failure?: unknown; unknownReason?: string }) {
  return {
    observationId: "obs:fixture-execution:001",
    executionRef: options?.executionRef ?? `best-execution:${decision.provenance.executionId}`,
    observedAt: "2026-10-03T00:00:01Z",
    chainKey: options?.chainKey ?? decision.selected.quote.chain,
    outcome,
    ...(options?.finalityCandidate !== undefined ? { finalityCandidate: options.finalityCandidate } : {}),
    ...(options?.failure !== undefined ? { failure: options.failure } : {}),
    ...(options?.unknownReason !== undefined ? { unknownReason: options.unknownReason } : {}),
    evidenceRefs: ["fixture:execution-observation:001"],
  };
}

describe("the only-path law (quote -> executed is impossible without observation)", () => {
  it("a fresh record is ROUTE_SELECTED, never executed", () => {
    const record = RouteExecutionRecord.open(selectedDecision());
    expect(record.status).toBe("ROUTE_SELECTED");
    expect(record.isExecutedCandidate).toBe(false);
  });

  it("the full happy path WITHOUT an observation stays EXECUTION_SUBMITTED (rule 29)", () => {
    const { record } = openedRecord();
    expect(record.status).toBe("EXECUTION_SUBMITTED");
    expect(record.isExecutedCandidate).toBe(false);
  });

  it("a BROADCAST observation yields EXECUTION_BROADCAST (submitted is not finality)", () => {
    const { record, decision } = openedRecord();
    expect(record.recordExecutionObservation(observationFor(decision, "BROADCAST"), NOW)).toBe("EXECUTION_BROADCAST");
    expect(record.isExecutedCandidate).toBe(false);
  });

  it("CONFIRMED without a finality candidate is EXECUTION_CONFIRMED_OBSERVED (still not executed)", () => {
    const { record, decision } = openedRecord();
    expect(record.recordExecutionObservation(observationFor(decision, "CONFIRMED"), NOW)).toBe(
      "EXECUTION_CONFIRMED_OBSERVED",
    );
    expect(record.isExecutedCandidate).toBe(false);
  });

  it("CONFIRMED WITH a finality candidate is EXECUTED_CANDIDATE (finality is candidate-only, INV-F06)", () => {
    const { record, decision } = openedRecord();
    const finalityCandidate = {
      candidateOnly: true,
      requiresProtocolFinality: true,
      confirmationDepth: 1,
      finalityModel: "PROBABILISTIC",
      reorgDetected: false,
    };
    expect(
      record.recordExecutionObservation(
        observationFor(decision, "CONFIRMED", { finalityCandidate }),
        NOW,
      ),
    ).toBe("EXECUTED_CANDIDATE");
    expect(record.isExecutedCandidate).toBe(true);
    expect(record.finalityCandidate).toEqual(finalityCandidate);
  });

  it("OUTCOME_UNKNOWN is resolvable by a later CONFIRMED observation (reconciliation IS a new observation)", () => {
    const { record, decision } = openedRecord();
    expect(
      record.recordExecutionObservation(
        observationFor(decision, "OUTCOME_UNKNOWN", { unknownReason: "a fixture reorg" }),
        NOW,
      ),
    ).toBe("EXECUTION_OUTCOME_UNKNOWN");
    expect(
      record.recordExecutionObservation(
        observationFor(decision, "CONFIRMED", {
          finalityCandidate: { candidateOnly: true, requiresProtocolFinality: true },
        }),
        NOW,
      ),
    ).toBe("EXECUTED_CANDIDATE");
  });

  it("FAILED is terminal: a later CONFIRMED throws (history is never rewritten)", () => {
    const { record, decision } = openedRecord();
    record.recordExecutionObservation(
      observationFor(decision, "FAILED", {
        failure: { failureClass: "REVERTED", description: "fixture revert", retryGuidance: "NOT_RETRYABLE" },
      }),
      NOW,
    );
    expect(record.status).toBe("EXECUTION_FAILED");
    expect(() =>
      record.recordExecutionObservation(observationFor(decision, "CONFIRMED"), NOW),
    ).toThrowError(ExecutionTransitionError);
  });

  it("a foreign executionRef OR chainKey is rejected (different executions and chain confusion are not evidence)", () => {
    const { record, decision } = openedRecord();
    expect(() =>
      record.recordExecutionObservation(
        observationFor(decision, "CONFIRMED", { executionRef: "best-execution:other-execution" }),
        NOW,
      ),
    ).toThrowError(/different execution/);
    expect(() =>
      record.recordExecutionObservation(
        observationFor(decision, "CONFIRMED", { chainKey: "solana:mainnet-beta" }),
        NOW,
      ),
    ).toThrowError(/chainKey/);
  });

  it("malformed observations are rejected by the domain validator with the status unchanged", () => {
    const { record, decision } = openedRecord();
    const statusBefore = record.status;
    expect(() =>
      record.recordExecutionObservation(
        observationFor(decision, "BROADCAST", { finalityCandidate: { candidateOnly: true } }),
        NOW,
      ),
    ).toThrowError(/BROADCAST observation must NOT carry a finality candidate/);
    expect(record.status).toBe(statusBefore);
    expect(() =>
      record.recordExecutionObservation(observationFor(decision, "OUTCOME_UNKNOWN"), NOW),
    ).toThrowError(/requires its unknown reason/);
    expect(() =>
      record.recordExecutionObservation(
        observationFor(decision, "OUTCOME_UNKNOWN", { unknownReason: "x", failure: { failureClass: "REVERTED", description: "y", retryGuidance: "SAFE_TO_RETRY" } }),
        NOW,
      ),
    ).toThrowError(/must NOT carry a failure/);
    expect(() => record.recordExecutionObservation(null, NOW)).toThrowError(ExecutionTransitionError);
  });

  it("no observation is accepted before submission", () => {
    const decision = selectedDecision();
    const record = RouteExecutionRecord.open(decision);
    expect(() => record.recordExecutionObservation(observationFor(decision, "CONFIRMED"), NOW)).toThrowError(
      /only after submission/,
    );
  });

  it("the recorded write must be EXACTLY the gate-evaluated write", () => {
    const decision = selectedDecision();
    const record = RouteExecutionRecord.open(decision);
    expect(() => record.recordPreparedWrite({ writeDigest: "fnv1a64:0000000000000000" }, NOW)).toThrowError(
      /does not bind/,
    );
    expect(record.recordPreparedWrite(decision.selected.write, NOW)).toBe("WRITE_PREPARED");
  });

  it("the broadcast handoff requires a non-empty reference from GATED_ALLOW", () => {
    const decision = selectedDecision();
    const record = RouteExecutionRecord.open(decision);
    record.recordPreparedWrite(decision.selected.write, NOW);
    expect(() => record.recordBroadcastHandoff("handoff:fixture:001", NOW)).toThrowError(/GATED_ALLOW/);
    expect(record.recordGateDecision({ decision: "ALLOW" }, NOW)).toBe("GATED_ALLOW");
    expect(() => record.recordBroadcastHandoff("", NOW)).toThrowError(/non-empty/);
    expect(record.recordBroadcastHandoff("handoff:fixture:001", NOW)).toBe("EXECUTION_SUBMITTED");
  });

  it("there is NO API whose input is a quote and whose output is an executed state (structural)", () => {
    const record = RouteExecutionRecord.open(selectedDecision());
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(record));
    expect(methodNames.some((name) => name.toLowerCase().includes("quote"))).toBe(false);
    for (const name of methodNames) {
      if (name.startsWith("record") && name !== "recordExecutionObservation") {
        expect(name).not.toMatch(/quote/i);
      }
    }
    expect(() =>
      record.recordExecutionObservation(
        { ...observationFor(selectedDecision(), "CONFIRMED"), quoteId: "quote:fixture-dex:001" },
        NOW,
      ),
    ).toThrowError();
  });

  it("passing a quote OBJECT as the observation is rejected (the seam attack)", () => {
    const { record, decision } = openedRecord();
    const quoteAsObservation = { ...decision.selected.quote, outcome: "CONFIRMED" };
    expect(() =>
      record.recordExecutionObservation(quoteAsObservation, NOW),
    ).toThrowError(ExecutionTransitionError);
  });

  it("the observations are append-only evidence AND the decision is deeply frozen (immutable history)", () => {
    const { record, decision } = openedRecord();
    record.recordExecutionObservation(observationFor(decision, "BROADCAST"), NOW);
    const snapshot = record.observations();
    expect(snapshot.length).toBe(1);
    record.recordExecutionObservation(observationFor(decision, "CONFIRMED"), NOW);
    expect(snapshot.length).toBe(1);
    expect(record.observations().length).toBe(2);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.provenance)).toBe(true);
  });
});
