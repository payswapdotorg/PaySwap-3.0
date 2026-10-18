import { describe, expect, it } from "vitest";
import {
  LAB_EXECUTION_TIER,
  isLabTieredValue,
  assertLabExecutionTier,
  labTierPermitsFinancialSettlement,
  rejectLabTierForFinancialSettlement,
} from "../src/simulation-tier.ts";
import { LabTierSettlementRejectedError, ValidationError } from "../src/errors.ts";
import { executeOnchainLane } from "../src/execution-walk.ts";
import { provedFixtureLane } from "./lane-fixtures.ts";

/**
 * The structural non-production tier (PORT of the old mixed-rail
 * never-production suite): every walk result carries the tier; the
 * settlement gate is first-class always-false; tiered aggregates are
 * never production settlement evidence.
 */
describe("the structural non-production tier (never production settlement)", () => {
  it("every lane-walk result carries the structural tier (branded + re-derivable)", () => {
    const lane = provedFixtureLane();
    if (lane.status !== "LANE_PROVED") {
      throw new Error("the fixture lane must be proved");
    }
    const execution = executeOnchainLane({ lane: lane.lane, at: 1_790_985_600_000, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(isLabTieredValue(execution)).toBe(true);
    expect(execution.executionTier).toBe(LAB_EXECUTION_TIER);
    expect(() => assertLabExecutionTier(execution)).not.toThrow();
  });

  it("the tier settlement law: labTierPermitsFinancialSettlement() is false, always", () => {
    expect(labTierPermitsFinancialSettlement()).toBe(false);
    expect(labTierPermitsFinancialSettlement()).toBe(false);
  });

  it("the downstream settlement gate ALWAYS throws (first-class contract, no input passes)", () => {
    const lane = provedFixtureLane();
    if (lane.status !== "LANE_PROVED") {
      throw new Error("the fixture lane must be proved");
    }
    const execution = executeOnchainLane({ lane: lane.lane, at: 1_790_985_600_000, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(() => rejectLabTierForFinancialSettlement(execution)).toThrowError(LabTierSettlementRejectedError);
    expect(() => rejectLabTierForFinancialSettlement({})).toThrowError(LabTierSettlementRejectedError);
    expect(() => rejectLabTierForFinancialSettlement(null)).toThrowError(LabTierSettlementRejectedError);
  });

  it("the tier assertion rejects forgeries (fail closed, never guessed)", () => {
    expect(() => assertLabExecutionTier(null)).toThrowError(ValidationError);
    expect(() => assertLabExecutionTier({})).toThrowError(ValidationError);
    expect(() => assertLabExecutionTier({ executionTier: "PRODUCTION" })).toThrowError(ValidationError);
    expect(isLabTieredValue({ executionTier: "PRODUCTION" })).toBe(false);
    expect(isLabTieredValue(42)).toBe(false);
  });

  it("a tiered execution is not a settleable artifact (the brand is nominal)", () => {
    const lane = provedFixtureLane();
    if (lane.status !== "LANE_PROVED") {
      throw new Error("the fixture lane must be proved");
    }
    const execution = executeOnchainLane({ lane: lane.lane, at: 1_790_985_600_000, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(() => rejectLabTierForFinancialSettlement(execution)).toThrowError(/can never be production financial execution/);
  });

  it("no lane walk ever records the authorize or broadcast lifecycle stage", () => {
    const lane = provedFixtureLane();
    if (lane.status !== "LANE_PROVED") {
      throw new Error("the fixture lane must be proved");
    }
    const execution = executeOnchainLane({ lane: lane.lane, at: 1_790_985_600_000, observedAtIso: "2026-10-03T00:00:01Z" });
    if (execution.status !== "EXECUTED") {
      throw new Error("the fixture execution must be EXECUTED");
    }
    for (const stage of execution.lifecycleStages) {
      expect(stage).not.toBe("authorize");
      expect(stage).not.toBe("broadcast");
    }
    expect(execution.lifecycleStages).toContain("observeResult");
    expect(execution.lifecycleStages).toContain("finality");
  });

  it("the tier is distinct from chain-environment classes (a PRODUCTION chain is still Lab-tiered in a walk)", () => {
    const lane = provedFixtureLane();
    if (lane.status !== "LANE_PROVED") {
      throw new Error("the fixture lane must be proved");
    }
    expect(lane.lane.quote.chain).toBe("ethereum:mainnet");
    const execution = executeOnchainLane({ lane: lane.lane, at: 1_790_985_600_000, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(execution.executionTier).toBe("LAB_SIMULATION_NON_PRODUCTION");
  });

  it("LAB_EXECUTION_TIER is the only tier vocabulary value this package produces", () => {
    expect(LAB_EXECUTION_TIER).toBe("LAB_SIMULATION_NON_PRODUCTION");
  });

  it("there is no exported unwrap (a tiered artifact cannot be laundered to production)", async () => {
    const module = Object.keys(await import("../src/simulation-tier.ts"));
    expect(module.some((name) => /unwrap|strip|toProduction|clearTier/i.test(name))).toBe(false);
  });
});
