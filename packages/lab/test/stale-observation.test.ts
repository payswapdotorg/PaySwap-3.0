import { describe, expect, it } from "vitest";
import {
  BASELINE_SCENARIOS,
  PAYMENT_ROUTING_DOMAIN_PACK,
  SCENARIO_INCIDENT_TYPES,
  isScenarioIncidentType,
  recordProductionFacts,
  runReplay,
  runSimulation,
} from "@payswap/lab";
import type { RecordedProductionFacts, SimulationProgram } from "@payswap/lab";
import { InterventionError, applyIntervention, runInterventionCounterfactual, validateIntervention } from "../src/interventions.ts";
import type { ScenarioIntervention } from "../src/interventions.ts";
import { BASELINE_WORLD } from "../src/scenarios.ts";

/**
 * The STALE_OBSERVATION incident kind (P21-C, ADR-0014 D9 — the scenario
 * family completion): an incident that marks a rail's observed facts
 * STALE in the variant world. THE ONE-CHANGE LAW companion battery: the
 * vocabulary growth, the fail-closed incident shape, the honest replay
 * semantics (a settlement grounded on stale observed facts cannot be
 * CLAIMED — UNKNOWN-tier honesty, the DELAYED_WRITE accounting
 * discipline applied to fact freshness; the rail's freshness is
 * degraded and its confirmed-settlement eligibility degrades with it),
 * the frozen-facts tamper law, the counterfactual delta, and the
 * baseline-suite coverage (one scenario per taxonomy entry).
 */
describe("the STALE_OBSERVATION incident kind (the staleness scenario family)", () => {
  const PROGRAM: SimulationProgram = {
    programId: "stale.base", programVersion: "1.0.0",
    routePreference: ["rail-a", "rail-b"], useNetting: false, useNetworkCredit: false,
    delayToleranceSteps: 0, fraudScreening: true, privacyBounded: true,
    authorizationMode: "PROTOCOL_AUTHORIZED",
  };

  function facts(incidents: RecordedProductionFacts["incidents"]): RecordedProductionFacts {
    return recordProductionFacts({
      factsId: "stale-facts",
      rails: [
        { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
        { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
      ],
      pools: [
        { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
        { poolId: "pool-b", railId: "rail-b", availableMinor: 800_000n },
      ],
      stepLatencyMs: 250,
      demands: [
        { demandId: "d-before", observedAtMs: 0, amountMinor: 120_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 30_000 },
        { demandId: "d-after", observedAtMs: 500, amountMinor: 90_000n, currency: "EUR", direction: "OUTBOUND", deadlineMs: 30_000 },
      ],
      incidents,
    });
  }

  it("joins the incident taxonomy as a total, frozen vocabulary member", () => {
    expect([...SCENARIO_INCIDENT_TYPES]).toContain("STALE_OBSERVATION");
    expect(isScenarioIncidentType("STALE_OBSERVATION")).toBe(true);
    for (const incidentType of SCENARIO_INCIDENT_TYPES) {
      expect(isScenarioIncidentType(incidentType)).toBe(true);
    }
    expect(isScenarioIncidentType("STALE_OBSERVATION_EXTRA")).toBe(false);
  });

  it("the incident shape validates fail-closed (rail-scoped, like PROVIDER_OUTAGE)", () => {
    const intervention = validateIntervention({
      kind: "INCIDENT_APPLIED",
      interventionId: "stale-rail-a",
      incident: { incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-a" },
    });
    expect(intervention.kind).toBe("INCIDENT_APPLIED");
    expect(() =>
      validateIntervention({
        kind: "INCIDENT_APPLIED",
        interventionId: "stale-malformed",
        incident: { incidentType: "STALE_OBSERVATION", atStep: 1 },
      }),
    ).toThrow(InterventionError);
    expect(() =>
      validateIntervention({
        kind: "INCIDENT_APPLIED",
        interventionId: "stale-bad-type",
        incident: { incidentType: "STALE_OBSERVATIONS", atStep: 1, railId: "rail-a" },
      }),
    ).toThrow(InterventionError);
  });

  it("a settlement grounded on stale observed facts cannot be CLAIMED (honest UNKNOWN-tier effects)", () => {
    const run = runReplay({
      facts: facts([{ incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-a", observedAtMs: 250 }]),
      program: PROGRAM,
      seed: "stale-seed",
      stepMs: 250,
    });
    const before = run.run.outcomes.find((outcome) => outcome.demandId === "d-before");
    const after = run.run.outcomes.find((outcome) => outcome.demandId === "d-after");
    // The demand that settled while the facts were fresh settles normally.
    expect(before?.outcome).toBe("SETTLED");
    // The demand routed on stale-marked facts cannot be claimed settled.
    expect(after?.outcome).toBe("UNKNOWN_REQUIRES_RECONCILIATION");
    expect(after?.railId).toBe("rail-a");
    expect(after?.movedMinor).toBe(0n);
    expect(run.run.metrics.settled).toBe(1);
    expect(run.run.metrics.unknownOutcomes).toBe(1);
  });

  it("the untouched rails keep settling (the incident is rail-scoped)", () => {
    const run = runReplay({
      facts: facts([{ incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-b", observedAtMs: 250 }]),
      program: PROGRAM,
      seed: "stale-seed",
      stepMs: 250,
    });
    for (const outcome of run.run.outcomes) {
      expect(outcome.outcome).toBe("SETTLED");
      expect(outcome.railId).toBe("rail-a");
    }
    expect(run.run.metrics.unknownOutcomes).toBe(0);
  });

  it("the counterfactual delta reflects the staleness (settled down, unknown up) and stays deterministic", () => {
    const intervention: ScenarioIntervention = {
      kind: "INCIDENT_APPLIED",
      interventionId: "stale-rail-a",
      incident: { incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-a" },
    };
    const first = runInterventionCounterfactual({
      facts: facts([]),
      intervention,
      baseProgram: PROGRAM,
      variantProgram: { ...PROGRAM, programId: "stale.variant" },
      seed: "stale-seed",
      stepMs: 250,
    });
    const second = runInterventionCounterfactual({
      facts: facts([]),
      intervention,
      baseProgram: PROGRAM,
      variantProgram: { ...PROGRAM, programId: "stale.variant" },
      seed: "stale-seed",
      stepMs: 250,
    });
    expect(second.digest).toBe(first.digest);
    expect(first.delta.settled).toBe(-1);
    expect(first.delta.unknownOutcomes).toBe(1);
    expect(first.variantFacts.facts.incidents).toEqual([
      { incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-a", observedAtMs: 250 },
    ]);
    // The base branch replayed through the UNMODIFIED machinery.
    expect(first.base.run.metrics.unknownOutcomes).toBe(0);
    expect(first.base.run.metrics.settled).toBe(2);
  });

  it("the frozen-facts tamper law holds through the staleness intervention", () => {
    const base = facts([]);
    const intervention: ScenarioIntervention = {
      kind: "INCIDENT_APPLIED",
      interventionId: "stale-rail-a",
      incident: { incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-a" },
    };
    const variant = applyIntervention(base, intervention);
    // The variant carries the injected staleness incident; the base is untouched and frozen.
    expect(variant.facts.incidents).toEqual([
      { incidentType: "STALE_OBSERVATION", atStep: 1, railId: "rail-a", observedAtMs: 250 },
    ]);
    expect(base.incidents).toEqual([]);
    expect(Object.isFrozen(base)).toBe(true);
    const tampered = { ...base, stepLatencyMs: 999 } as RecordedProductionFacts;
    expect(() => applyIntervention(tampered, intervention)).toThrow();
  });

  it("the baseline suite covers the staleness family (one scenario per taxonomy entry)", () => {
    const scenario = BASELINE_SCENARIOS.find((entry) => entry.scenarioType === "STALE_OBSERVATION");
    expect(scenario).toBeDefined();
    expect(scenario?.description.length).toBeGreaterThan(0);
    expect(PAYMENT_ROUTING_DOMAIN_PACK.scenarioTypes).toContain("STALE_OBSERVATION");
    expect(BASELINE_SCENARIOS.length).toBe(PAYMENT_ROUTING_DOMAIN_PACK.scenarioTypes.length);
    // The baseline staleness scenario runs deterministically over the shared world.
    const a = runSimulation({ scenario: scenario!.plan, world: BASELINE_WORLD, program: PROGRAM, seed: "suite" });
    const b = runSimulation({ scenario: scenario!.plan, world: BASELINE_WORLD, program: PROGRAM, seed: "suite" });
    expect(a).toEqual(b);
    expect(a.metrics.unknownOutcomes).toBeGreaterThan(0);
    expect(a.metrics.settled).toBeGreaterThan(0);
  });
});
