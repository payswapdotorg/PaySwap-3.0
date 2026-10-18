import { describe, expect, it } from "vitest";
import { checkSelectedRouteValidity, assertSelectedRouteValid } from "../src/route-validity.ts";
import { RouteInvalidatedError } from "../src/errors.ts";
import { isQuoteStale, validateQuoteFreshness } from "../src/quote.ts";
import { fixtureEngine, baseEngineRequest } from "./lane-fixtures.ts";
import { NOW } from "./fixtures.ts";

/**
 * Stale routes (PORT of the old stale-routes suite): the inclusive bound
 * law, post-decision invalidation, and the re-run-never-repair
 * discipline.
 */
describe("mandatory freshness (the inclusive bound law)", () => {
  it("invalid freshness is rejected (negative asOf, zero maxAge, non-integer)", () => {
    expect(() => validateQuoteFreshness({ asOfMs: -1, maxAgeMs: 1000 }, "probe")).toThrowError(/non-negative/);
    expect(() => validateQuoteFreshness({ asOfMs: NOW, maxAgeMs: 0 }, "probe")).toThrowError(/positive/);
    expect(() => validateQuoteFreshness({ asOfMs: 1.5, maxAgeMs: 1000 }, "probe")).toThrowError(/non-negative/);
  });

  it("staleness bound: fresh at exactly maxAge, stale one ms later", () => {
    const freshness = { asOfMs: NOW, maxAgeMs: 10_000 };
    expect(isQuoteStale(freshness, NOW + 10_000)).toBe(false);
    expect(isQuoteStale(freshness, NOW + 10_001)).toBe(true);
  });

  it("a stale quote DISQUALIFIES the candidate at decision time (never repaired)", () => {
    const decision = fixtureEngine().execute({ ...baseEngineRequest(), at: NOW + 10_001 });
    expect(decision.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(decision.ranking[0]?.disqualifications?.some((reason) => reason.code === "quote_stale")).toBe(true);
  });
});

describe("post-decision invalidation (re-run, never repair)", () => {
  it("valid at decision time and deterministic", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(checkSelectedRouteValidity(decision, NOW).valid).toBe(true);
    expect(checkSelectedRouteValidity(decision, NOW).valid).toBe(true);
  });

  it("invalidates exactly 1ms past the quote bound (QUOTE_STALE with venue and quote ids)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    const validity = checkSelectedRouteValidity(decision, NOW + 10_001);
    expect(validity.valid).toBe(false);
    if (!validity.valid) {
      expect(validity.reasons.map((reason) => reason.code)).toEqual(["QUOTE_STALE"]);
      expect(validity.reasons[0]?.venueId).toBe("fixture-dex-alpha");
      expect(validity.reasons[0]?.quoteId).toBe("quote:fixture-dex:001");
    }
  });

  it("a stale health observation alone invalidates while the quote is fresh", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    const validity = checkSelectedRouteValidity(decision, NOW + 30_001);
    expect(validity.valid).toBe(false);
    if (!validity.valid) {
      expect(validity.reasons.map((reason) => reason.code)).toContain("HEALTH_OBSERVATION_STALE");
    }
  });

  it("assertSelectedRouteValid throws RouteInvalidatedError (fail closed)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(() => assertSelectedRouteValid(decision, NOW + 10_001)).toThrowError(RouteInvalidatedError);
    expect(() => assertSelectedRouteValid(decision, NOW)).not.toThrow();
  });

  it("re-running best execution on fresh evidence is the discipline (the old decision stays invalidated)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(checkSelectedRouteValidity(decision, NOW).valid).toBe(true);
    expect(checkSelectedRouteValidity(decision, NOW + 10_001).valid).toBe(false);
    const reRun = fixtureEngine().execute({ ...baseEngineRequest(), at: NOW + 11_000, executionId: "execution:fixture-lane:002" });
    expect(reRun.decision).toBe("NO_EXECUTABLE_ROUTE");
    expect(checkSelectedRouteValidity(decision, NOW + 11_000).valid).toBe(false);
  });

  it("the re-check instant must be a non-negative integer (no ambient clock)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(() => checkSelectedRouteValidity(decision, -1)).toThrowError(/non-negative/);
    expect(() => checkSelectedRouteValidity(decision, 1.5)).toThrowError(/non-negative/);
  });

  it("valid at exactly both bounds (the inclusive law on quote AND health)", () => {
    const decision = fixtureEngine().execute(baseEngineRequest());
    expect(checkSelectedRouteValidity(decision, NOW + 10_000).valid).toBe(true);
    expect(checkSelectedRouteValidity(decision, NOW + 30_000).valid).toBe(false);
  });
});
