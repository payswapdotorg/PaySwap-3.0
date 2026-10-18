import { describe, expect, it } from "vitest";
import { BestExecutionEngine } from "../src/best-execution.ts";
import { RouteExecutionRecord } from "../src/execution-record.ts";
import { ValidationError } from "../src/errors.ts";
import {
  allowAllGate,
  baseBestExecutionPolicy,
  baseSecurity,
  blockAllGate,
  fixtureVenue,
  onchainInstanceFixture,
  unknownAllGate,
} from "./venue-fixtures.ts";
import { baseEngineRequest, fixtureEngine } from "./lane-fixtures.ts";
import { CHAIN, NOW } from "./fixtures.ts";

/**
 * The best-execution engine (PORT of the old engine suite): the
 * five-stage pipeline, per-dimension influence on the decision, honest
 * empty states, determinism.
 */
describe("registration law", () => {
  it("a fresh engine has no venues; malformed requests fail closed before the pipeline runs", () => {
    expect(new BestExecutionEngine().venues()).toEqual([]);
    const engine = fixtureEngine();
    for (const bad of [
      { ...baseEngineRequest(), executionId: "" },
      { ...baseEngineRequest(), at: -1 },
      { ...baseEngineRequest(), routeExpiryMs: NOW },
    ]) {
      expect(() => engine.execute(bad)).toThrowError(ValidationError);
    }
    expect(() =>
      fixtureEngine().execute({ ...baseEngineRequest(), security: { ...baseSecurity(), evaluateGate: undefined as never } }),
    ).toThrowError(/injected/);
  });
});

describe("the five-stage pipeline (deterministic)", () => {
  it("ROUTE_SELECTED: the winning quote is selected with the exact net margin recorded", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(decision.decision).toBe("ROUTE_SELECTED");
    if (decision.decision === "ROUTE_SELECTED") {
      expect(decision.selected.venueId).toBe("fixture-dex-alpha");
      expect(decision.selected.gateDecision.decision).toBe("ALLOW");
      expect(decision.selected.write.writeDigest).toMatch(/^fnv1a64:/);
      expect(decision.selected.evaluation.netNumeraireMinorUnits).toBe("2299880");
      expect(decision.provenance.selection?.marginOverRunnerUpMinorUnits).toBeUndefined();
    }
  });

  it("every venue outcome is recorded in the provenance chain (QUOTED, verbatim)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(decision.provenance.venues).toEqual([
      expect.objectContaining({ venueId: "fixture-dex-alpha", outcome: "QUOTED" }),
    ]);
    expect(decision.provenance.evidenceRefs.length).toBeGreaterThan(0);
    expect(decision.provenance.policyRef).toBe("best-execution-policy-fixture@1");
  });

  it("an UNAVAILABLE venue is recorded honestly (never a fabricated quote)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ quoteOutcome: "UNAVAILABLE" }));
    const decision = engine.execute(baseEngineRequest());
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(decision.provenance.venues[0]?.outcome).toBe("UNAVAILABLE");
    if (decision.decision === "NO_EXECUTABLE_ROUTE") {
      expect(decision.detail).toContain("no venue produced a quote");
    }
  });

  it("an OUTCOME_UNKNOWN venue quote stage is recorded, never converted to failure (INV-X01; folded with the UNAVAILABLE law)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ quoteOutcome: "OUTCOME_UNKNOWN" }));
    const decision = engine.execute(baseEngineRequest());
    expect(decision.provenance.venues[0]?.outcome).toBe("OUTCOME_UNKNOWN");
    if (decision.decision === "NO_EXECUTABLE_ROUTE") {
      expect(decision.detail).toContain("never converted to failure");
    }
    const unavailableEngine = new BestExecutionEngine();
    unavailableEngine.register(fixtureVenue({ quoteOutcome: "UNAVAILABLE" }));
    const unavailable = unavailableEngine.execute(baseEngineRequest());
    expect(unavailable.provenance.venues[0]?.outcome).toBe("UNAVAILABLE");
  });

  it("a better worst-case output wins through the engine (the scored number decides)", () => {
    const engine = new BestExecutionEngine();
    const venue = fixtureVenue();
    engine.register(venue);
    engine.register({
      ...venue,
      descriptor: { ...venue.descriptor, venueId: "fixture-dex-beta" },
      quote: (request: Parameters<typeof venue.quote>[0], at: number) => {
        const outcome = venue.quote(request, at);
        return outcome.kind === "QUOTE"
          ? {
              kind: "QUOTE" as const,
              quote: {
                ...outcome.quote,
                quoteId: "quote:fixture-dex:beta-001",
                venueId: "fixture-dex-beta",
                slippage: {
                  ...outcome.quote.slippage,
                  worstCaseOutput: { currency: "USC", minorUnits: "3300000" },
                  expectedOutput: { currency: "USC", minorUnits: "3400000" },
                },
                routeShape: [{ venue: "fixture-dex-beta", chain: CHAIN, description: "the second fixture venue's single hop" }],
                provenance: { ...outcome.quote.provenance, evidenceRefs: ["fixture:venue-quote:beta-001"] },
              },
            }
          : outcome;
      },
    });
    const decision = engine.execute(baseEngineRequest());
    expect(decision.decision).toBe("ROUTE_SELECTED");
    if (decision.decision === "ROUTE_SELECTED") {
      expect(decision.selected.venueId).toBe("fixture-dex-beta");
      expect(decision.provenance.selection?.marginOverRunnerUpMinorUnits).toBe("100000");
    }
  });

  it("a BLOCKed write is terminal for the candidate (rule 27 — no override)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue());
    const decision = engine.execute({
      ...baseEngineRequest(),
      security: { ...baseSecurity(), evaluateGate: blockAllGate("fixture_spender_not_permitted") },
    });
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    const candidate = decision.ranking[0];
    expect(candidate?.status).toBe("SECURITY_BLOCKED");
    expect(candidate?.security.blockReasonCodes).toContain("fixture_spender_not_permitted");
  });

  it("an UNKNOWN gate holds the candidate UNKNOWN — never selected, never failed", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue());
    const decision = engine.execute({
      ...baseEngineRequest(),
      security: { ...baseSecurity(), evaluateGate: unknownAllGate() },
    });
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    const candidate = decision.ranking[0];
    expect(candidate?.status).toBe("UNKNOWN");
    expect(candidate?.unknownDimensions?.some((dimension) => dimension.code === "security_gate_unknown")).toBe(true);
  });

  it("a venue whose planWrite throws is contained (the decision never crashes on venue garbage)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ planWriteThrows: true }));
    const decision = engine.execute(baseEngineRequest());
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(decision.ranking[0]?.disqualifications?.some((reason) => reason.code === "gate_evaluation_failed")).toBe(true);
  });

  it("a malformed quote is disqualified, not crashed (quote_validation_failed)", () => {
    const engine = new BestExecutionEngine();
    const venue = fixtureVenue();
    engine.register({
      ...venue,
      quote: (request: Parameters<typeof venue.quote>[0], at: number) => {
        const outcome = venue.quote(request, at);
        return outcome.kind === "QUOTE"
          ? { kind: "QUOTE" as const, quote: { ...outcome.quote, quoteId: "" } }
          : outcome;
      },
    });
    const decision = engine.execute(baseEngineRequest());
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(decision.ranking[0]?.disqualifications?.some((reason) => reason.code === "quote_validation_failed")).toBe(true);
  });

  it("an INDICATIVE quote is never selectable (the no-fake-quote law)", () => {
    const engine = new BestExecutionEngine();
    const venue = fixtureVenue();
    engine.register({
      ...venue,
      quote: (request, at) => {
        const outcome = venue.quote(request, at);
        return outcome.kind === "QUOTE"
          ? { kind: "QUOTE", quote: { ...outcome.quote, quoteSemantics: "INDICATIVE" as const } }
          : outcome;
      },
    });
    const decision = engine.execute(baseEngineRequest());
    expect(decision.ranking[0]?.disqualifications?.some((reason) => reason.code === "quote_not_executable")).toBe(true);
  });

  it("determinism: the same inputs at the same instant produce byte-identical provenance", () => {
    const first = fixtureEngine().execute(baseEngineRequest());
    const second = fixtureEngine().execute(baseEngineRequest());
    expect(JSON.stringify(first.provenance)).toBe(JSON.stringify(second.provenance));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("the execution-scope law: an ineligible instance yields no route (folded with the REVOKED law)", () => {
    const engine = fixtureEngine();
    const ineligible = { ...onchainInstanceFixture(), eligible: false };
    const decision = engine.execute({ ...baseEngineRequest(), instances: [ineligible] });
    expect(decision.ranking[0]?.disqualifications?.some((reason) => reason.code === "no_execution_scope")).toBe(true);
    const revoked = engine.execute({
      ...baseEngineRequest(),
      instances: [{ ...onchainInstanceFixture(), authorizationStatus: "REVOKED" }],
    });
    expect(revoked.ranking[0]?.disqualifications?.some((reason) => reason.code === "no_execution_scope")).toBe(true);
  });

  it("health: UNHEALTHY disqualifies; UNKNOWN holds (INV-X01); DEGRADED admits under the policy", () => {
    const unhealthy = new BestExecutionEngine();
    unhealthy.register(fixtureVenue({ healthStatus: "UNHEALTHY" }));
    expect(unhealthy.execute(baseEngineRequest()).ranking[0]?.disqualifications?.some((r) => r.code === "venue_unhealthy")).toBe(true);
    const unknownHealth = new BestExecutionEngine();
    unknownHealth.register(fixtureVenue({ healthStatus: "UNKNOWN" }));
    expect(unknownHealth.execute(baseEngineRequest()).ranking[0]?.unknownDimensions?.some((r) => r.code === "health_unknown")).toBe(true);
    const degraded = new BestExecutionEngine();
    degraded.register(fixtureVenue({ healthStatus: "DEGRADED" }));
    expect(degraded.execute(baseEngineRequest()).decision).toBe("ROUTE_SELECTED");
  });

  it("policy hard constraints gate BEFORE soft optimization (rule 14: allowlist + time + risk)", () => {
    const engine = fixtureEngine();
    const disallowed = engine.execute({
      ...baseEngineRequest(),
      policy: { ...baseBestExecutionPolicy(), allowedVenues: ["some-other-venue"] },
    });
    expect(disallowed.ranking[0]?.disqualifications?.some((r) => r.code === "venue_not_permitted_by_policy")).toBe(true);
    expect(disallowed.ranking[0]?.policyCompliance.compliant).toBe(false);
    const tooSlow = engine.execute({
      ...baseEngineRequest(),
      policy: { ...baseBestExecutionPolicy(), maxSettlementMs: 60_000 },
    });
    expect(tooSlow.ranking[0]?.disqualifications?.some((r) => r.code === "settlement_too_slow")).toBe(true);
    const tooRisky = engine.execute({
      ...baseEngineRequest(),
      policy: { ...baseBestExecutionPolicy(), maxFailureRiskClass: "LOW" },
    });
    expect((tooRisky.ranking[0]?.disqualifications ?? []).some((r) => r.code === "failure_risk_above_tolerance")).toBe(false);
  });

  it("the record opens only on a ROUTE_SELECTED decision (an empty decision executes nothing)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ quoteOutcome: "UNAVAILABLE" }));
    const decision = engine.execute(baseEngineRequest());
    expect(() => RouteExecutionRecord.open(decision)).toThrowError(/ROUTE_SELECTED/);
    const selected = fixtureEngine().execute(baseEngineRequest());
    const record = RouteExecutionRecord.open(selected);
    expect(record.status).toBe("ROUTE_SELECTED");
    expect(record.isExecutedCandidate).toBe(false);
    expect(allowAllGate).toBeTypeOf("function");
  });
});
