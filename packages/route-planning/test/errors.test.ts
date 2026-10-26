import { describe, expect, it } from "vitest";
import {
  CandidateEnumerationError,
  CatalogueRailRejectedError,
  HardGateError,
  isRoutePlanningError,
  PortUnboundError,
  RailSnapshotError,
  RoutePlanningError,
  RoutePlanningValidationError,
  RouteRankingError,
  RouteSearchBudgetError,
  ROUTE_PLANNING_ERROR_CODES,
} from "../src/errors.ts";

/** The typed error taxonomy: stable codes, frozen details, honest names. */

describe("the error taxonomy (stable machine codes)", () => {
  it("every sub-error is a RoutePlanningError with its stable code", () => {
    const cases: readonly [Error, string][] = [
      [new RoutePlanningValidationError("v"), "ROUTE_PLANNING_VALIDATION_FAILED"],
      [new PortUnboundError("p"), "PORT_UNBOUND"],
      [new RouteSearchBudgetError("b"), "ROUTE_SEARCH_BUDGET_FAILED"],
      [new RailSnapshotError("s"), "RAIL_SNAPSHOT_FAILED"],
      [new CatalogueRailRejectedError("c"), "CATALOGUE_RAIL_REJECTED"],
      [new CandidateEnumerationError("e"), "CANDIDATE_ENUMERATION_FAILED"],
      [new HardGateError("g"), "HARD_GATE_FAILED"],
      [new RouteRankingError("r"), "ROUTE_RANKING_FAILED"],
    ];
    for (const [error, code] of cases) {
      expect(error).toBeInstanceOf(RoutePlanningError);
      expect(error).toBeInstanceOf(Error);
      expect((error as RoutePlanningError).code).toBe(code);
      expect(isRoutePlanningError(error)).toBe(true);
    }
  });

  it("the base error carries a custom code and frozen details when supplied", () => {
    const details = Object.freeze({ stage: "x" });
    const error = new RoutePlanningError("message", "CUSTOM_CODE", details);
    expect(error.code).toBe("CUSTOM_CODE");
    expect((error as { details?: unknown }).details).toBe(details);
    expect(error.name).toBe("RoutePlanningError");
    expect(error.message).toBe("message");
    const bare = new RoutePlanningError("bare", "BARE");
    expect((bare as { details?: unknown }).details).toBeUndefined();
  });

  it("sub-error names are stable (instanceof chains + name discipline)", () => {
    expect(new RoutePlanningValidationError("x").name).toBe("RoutePlanningValidationError");
    expect(new PortUnboundError("x").name).toBe("PortUnboundError");
    expect(new RouteSearchBudgetError("x").name).toBe("RouteSearchBudgetError");
    expect(new RailSnapshotError("x").name).toBe("RailSnapshotError");
    expect(new CatalogueRailRejectedError("x").name).toBe("CatalogueRailRejectedError");
    expect(new CandidateEnumerationError("x").name).toBe("CandidateEnumerationError");
    expect(new HardGateError("x").name).toBe("HardGateError");
    expect(new RouteRankingError("x").name).toBe("RouteRankingError");
  });

  it("the closed machine-code vocabulary is frozen and complete", () => {
    expect(Object.isFrozen(ROUTE_PLANNING_ERROR_CODES)).toBe(true);
    expect([...ROUTE_PLANNING_ERROR_CODES]).toEqual([
      "ROUTE_PLANNING_VALIDATION_FAILED",
      "PORT_UNBOUND",
      "ROUTE_SEARCH_BUDGET_FAILED",
      "RAIL_SNAPSHOT_FAILED",
      "CATALOGUE_RAIL_REJECTED",
      "CANDIDATE_ENUMERATION_FAILED",
      "HARD_GATE_FAILED",
      "ROUTE_RANKING_FAILED",
    ]);
    const codes = new Set<string>();
    for (const error of [
      new RoutePlanningValidationError("v"),
      new PortUnboundError("p"),
      new RouteSearchBudgetError("b"),
      new RailSnapshotError("s"),
      new CatalogueRailRejectedError("c"),
      new CandidateEnumerationError("e"),
      new HardGateError("g"),
      new RouteRankingError("r"),
    ]) {
      codes.add((error as RoutePlanningError).code);
    }
    for (const code of ROUTE_PLANNING_ERROR_CODES) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it("the typed filter rejects foreign errors", () => {
    expect(isRoutePlanningError(new Error("plain"))).toBe(false);
    expect(isRoutePlanningError("string")).toBe(false);
    expect(isRoutePlanningError(null)).toBe(false);
  });

  it("PortUnboundError carries the unbound stage name in its details", () => {
    const error = new PortUnboundError("unbound", { stage: "stage-4:compile-available-routes" });
    expect((error as { details?: { stage: string } }).details?.stage).toBe(
      "stage-4:compile-available-routes",
    );
  });
});
