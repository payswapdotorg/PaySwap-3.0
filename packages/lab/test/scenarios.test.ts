import { describe, expect, it } from "vitest";
import {
  BASELINE_SCENARIOS,
  BASELINE_WORLD,
  PAYMENT_ROUTING_DOMAIN_PACK,
  getBaselineSuite,
  runSimulation,
} from "@payswap/lab";

/**
 * The mandatory baseline suite (P6-W1 rebuild of the old W2-004 scenarios
 * suite — LAB.md "Scenario generation": the suite covers the full incident
 * taxonomy; every scenario is deterministic and belongs to the canonical
 * payment-routing domain pack).
 
 * Site classification (this file): 3 old sites PORTED (the old scenario
 * half of the old scenarios suite: exists/deterministic/covers-taxonomy,
 * belongs-to-pack-and-world, runnable-and-deterministic) + 1 NET-NEW
 * site (the unique-ids/structural-world receipt) = 4 tests. The
 * baseline-candidate half of the old suite lives in
 * baseline-candidates.test.ts.
 */

describe("baseline suite (LAB.md)", () => {
  it("exists, is deterministic and covers every scenario taxonomy entry", () => {
    const suite = getBaselineSuite();
    const again = getBaselineSuite();
    expect(suite).toEqual(again);
    expect(suite.suiteId).toBe("lab.baseline-suite");
    expect(suite.scenarios.length).toBeGreaterThanOrEqual(13);

    const covered = new Set(suite.scenarios.map((s) => s.scenarioType));
    for (const scenarioType of PAYMENT_ROUTING_DOMAIN_PACK.scenarioTypes) {
      expect(covered.has(scenarioType)).toBe(true);
    }
    // One scenario per taxonomy entry.
    expect(suite.scenarios.length).toBe(PAYMENT_ROUTING_DOMAIN_PACK.scenarioTypes.length);
    expect(BASELINE_SCENARIOS).toEqual(suite.scenarios);
  });

  it("every scenario belongs to the payment-routing domain pack and the shared world", () => {
    for (const scenario of getBaselineSuite().scenarios) {
      expect(scenario.domainPackId).toBe(PAYMENT_ROUTING_DOMAIN_PACK.packId);
      expect(scenario.world).toEqual(BASELINE_WORLD);
      expect(scenario.plan.scenarioId).toBe(scenario.scenarioId);
      expect(scenario.description.length).toBeGreaterThan(0);
    }
  });

  it("every scenario is runnable and deterministic across repeated runs", () => {
    const program = getBaselineSuite().candidates[0]?.program;
    expect(program).toBeDefined();
    for (const scenario of getBaselineSuite().scenarios) {
      const a = runSimulation({ scenario: scenario.plan, world: scenario.world, program: program!, seed: "suite" });
      const b = runSimulation({ scenario: scenario.plan, world: scenario.world, program: program!, seed: "suite" });
      expect(a).toEqual(b);
      expect(a.metrics.totalDemands).toBe(scenario.plan.demands.length);
    }
  });
});

describe("baseline suite structural receipts", () => {
  it("suite scenario ids are unique and the shared world is structural data", () => {
    const suite = getBaselineSuite();
    const ids = suite.scenarios.map((s) => s.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BASELINE_WORLD.worldId).toBe("lab.baseline-world");
    expect(BASELINE_WORLD.rails.length).toBe(4);
    expect(BASELINE_WORLD.pools.length).toBe(4);
    for (const rail of BASELINE_WORLD.rails) {
      expect(typeof rail.fixedFeeMinor).toBe("bigint");
      expect(typeof rail.variableFeeBps).toBe("bigint");
    }
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/scenarios.test.ts,
// scenario half)
// ---------------------------------------------------------------------------
// PORTED (3): "exists, is deterministic and covers every scenario taxonomy
// entry"; "every scenario belongs to the payment-routing domain pack and
// the shared world"; "every scenario is runnable and deterministic across
// repeated runs".
// NET-NEW (1): unique-ids / structural-world receipt.
// ---------------------------------------------------------------------------
// Suite-coverage receipts (the LAB.md scenario taxonomy, one per entry)
// ---------------------------------------------------------------------------
// NORMAL_DEMAND           steady outbound + inbound demand, no incidents
// LIQUIDITY_SHORTAGE      pool-a drained 9.5M mid-flight (step 4)
// PROVIDER_OUTAGE         rail-a down at step 2; demands re-route
// FX_VOLATILITY           cross-currency spread +150bps at step 1
// DELAYED_WRITE           rail-b writes become UNKNOWN (reconciliation)
// APPROVAL_DELAY          customer approval +8000ms past a 5000ms deadline
// FRAUD / COLLUSION /
// MALICIOUS_AGENT /
// INCENTIVE_GAMING        the adversarial demand taxonomy, screened
// PARTIAL_PAYMENT         providers execute 6000bps / 4500bps only
// CONGESTION              +2500ms latency network-wide (one 3000ms
//                         deadline demand expires)
// ADVERSARIAL_MODEL_BEHAVIOR  an adversarial model routes a forbidden
//                         480k demand alongside legitimate ones
//
// Every scenario shares BASELINE_WORLD (4 rails, 4 pools, 250ms steps) and
// belongs to the canonical payment-routing Domain Pack; the suite id and
// version match the pack's evaluationSuite declaration exactly.
// ---------------------------------------------------------------------------
// Determinism receipts (restated)
// ---------------------------------------------------------------------------
// getBaselineSuite returns structurally identical data on every call;
// BASELINE_SCENARIOS is the frozen module-level source of truth; and every
// scenario re-runs byte-identically under the same program and seed — the
// suite is pure data plus a deterministic engine, nothing else.
