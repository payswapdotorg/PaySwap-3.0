import { describe, expect, it } from "vitest";
import { BestExecutionEngine } from "../src/best-execution.ts";
import { RouteExecutionRecord } from "../src/execution-record.ts";
import { ExecutionTransitionError, RouteInvalidatedError } from "../src/errors.ts";
import { checkSelectedRouteValidity } from "../src/route-validity.ts";
import { baseSecurity, blockAllGate, fixtureVenue, unknownAllGate } from "./venue-fixtures.ts";
import { baseEngineRequest, fixtureEngine } from "./lane-fixtures.ts";
import { NOW } from "./fixtures.ts";

/**
 * Gates integration (PORT of the old gates-integration suite): BLOCK
 * kills routes, UNKNOWN surfaces and is never converted, no bypass of
 * the recorded ALLOW, and the record-level BLOCK/UNKNOWN discipline.
 */
describe("security gates integration (the injected evaluator is the authority)", () => {
  it("BLOCK kills the route (security BLOCK is terminal — no override)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue());
    const decision = engine.execute({
      ...baseEngineRequest(),
      security: { ...baseSecurity(), evaluateGate: blockAllGate("spender_not_permitted") },
    });
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(decision.ranking[0]?.security.gateDecision).toBe("BLOCK");
    expect(decision.ranking[0]?.security.blockReasonCodes).toContain("spender_not_permitted");
  });

  it("UNKNOWN surfaces, never converts (INV-X01) — the candidate is held UNKNOWN", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue());
    const decision = engine.execute({
      ...baseEngineRequest(),
      security: { ...baseSecurity(), evaluateGate: unknownAllGate() },
    });
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(decision.ranking[0]?.status).toBe("UNKNOWN");
    expect(decision.ranking[0]?.security.gateDecision).toBe("UNKNOWN");
  });

  it("no bypass: selection requires a recorded ALLOW with the write digest of the selected write", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    if (decision.decision !== "ROUTE_SELECTED") {
      throw new Error("the fixture decision must select");
    }
    const selected = decision.ranking.find((trace) => trace.status === "SELECTED");
    expect(selected?.security.gateDecision).toBe("ALLOW");
    expect(selected?.security.writeDigest).toBe(decision.selected.write.writeDigest);
  });

  it("record-level BLOCK: the record transitions to ROUTE_BLOCKED AND throws (rule 27)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    if (decision.decision !== "ROUTE_SELECTED") {
      throw new Error("the fixture decision must select");
    }
    const record = RouteExecutionRecord.open(decision);
    record.recordPreparedWrite(decision.selected.write, NOW);
    expect(() => record.recordGateDecision({ decision: "BLOCK" }, NOW)).toThrowError(ExecutionTransitionError);
    expect(record.status).toBe("ROUTE_BLOCKED");
  });

  it("record-level UNKNOWN: throws, the status stays WRITE_PREPARED (never an allowance)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    if (decision.decision !== "ROUTE_SELECTED") {
      throw new Error("the fixture decision must select");
    }
    const record = RouteExecutionRecord.open(decision);
    record.recordPreparedWrite(decision.selected.write, NOW);
    expect(() => record.recordGateDecision({ decision: "UNKNOWN" }, NOW)).toThrowError(/INV-X01/);
    expect(record.status).toBe("WRITE_PREPARED");
  });

  it("a foreign write never binds to the selected route (digest binding)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    if (decision.decision !== "ROUTE_SELECTED") {
      throw new Error("the fixture decision must select");
    }
    const record = RouteExecutionRecord.open(decision);
    expect(() =>
      record.recordPreparedWrite({ writeDigest: "fnv1a64:deadbeefdeadbeef" }, NOW),
    ).toThrowError(/does not bind to the selected route/);
  });

  it("a stale route never proceeds to execution (re-run, never repair)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    if (decision.decision !== "ROUTE_SELECTED") {
      throw new Error("the fixture decision must select");
    }
    const farFuture = NOW + 100_000;
    const record = RouteExecutionRecord.open(decision);
    expect(() => record.recordPreparedWrite(decision.selected.write, farFuture)).toThrowError(RouteInvalidatedError);
    expect(checkSelectedRouteValidity(decision, farFuture).valid).toBe(false);
  });

  it("validity re-derivation is deterministic and records the check instant", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    const validity = checkSelectedRouteValidity(decision, NOW);
    expect(validity.valid).toBe(true);
    if (validity.valid) {
      expect(validity.checkedAt).toBe(NOW);
    }
  });

  it("an empty decision carries no route to invalidate (fail closed)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ quoteOutcome: "UNAVAILABLE" }));
    const decision = engine.execute(baseEngineRequest());
    expect(() => checkSelectedRouteValidity(decision, NOW)).toThrowError(RouteInvalidatedError);
  });
});
