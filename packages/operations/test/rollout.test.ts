import { describe, expect, it } from "vitest";
import {
  PROVIDER_PARITY_ALLOWED_DIFFERENCES,
  ROLLOUT_STAGE_LADDER,
  RolloutContractError,
  checkProviderRolloutPlan,
  evaluateRolloutStage,
  exposureOf,
  verifyProviderParity,
  type RolloutObservation,
  type RolloutStageSpec,
} from "../src/rollout.js";
import { defineProviderEnvironment } from "../src/provider-environment.js";

function environment(tier: "preview" | "production") {
  return defineProviderEnvironment({
    providerName: "wise",
    tier,
    executionMode: tier === "production" ? "LIVE" : "SANDBOX",
    transportClass: "PRODUCTION_HTTP",
    credentialConfigKey: "PROVIDER_WISE_CREDENTIAL_REF",
    credentialHandle: `vault://payswap/${tier}/wise`,
  });
}

function stage(
  stageId: (typeof ROLLOUT_STAGE_LADDER)[number]["stageId"],
  extra: Partial<RolloutStageSpec> = {},
): RolloutStageSpec {
  return {
    stageId,
    holdCriteria: [
      { kind: "PARITY_PASSED" },
      { kind: "HEALTH_CONTRACT_PASSED" },
      { kind: "CERTIFICATION_CONCLUSIVE" },
      { kind: "PROVIDER_ENABLED" },
      { kind: "COUNTER_BELOW", counter: "unknownOutcomesOpen", limit: 1 },
    ],
    rollbackCriteria: [
      { kind: "SECRET_EXPOSURE_DETECTED" },
      { kind: "COUNTER_ABOVE", counter: "unknownOutcomesOpen", limit: 10 },
    ],
    ...extra,
  };
}

function plan(
  stages: readonly RolloutStageSpec[] = [
    stage("observe"),
    stage("canary-1"),
    stage("percent-10"),
    stage("percent-50"),
    stage("full"),
  ],
) {
  return {
    planId: "plan-wise-001",
    providerName: "wise",
    environment: environment("production"),
    stages,
    plannedBy: "release-manager",
  };
}

function healthyObservation(overrides: Partial<RolloutObservation> = {}): RolloutObservation {
  return {
    parityPassed: true,
    healthContractPassed: true,
    certificationConclusive: true,
    providerEnabled: true,
    secretExposureDetected: false,
    counters: { unknownOutcomesOpen: 0, outboxDepth: 0 },
    ...overrides,
  };
}

describe("the progressive exposure ladder (hard law 6)", () => {
  it("the ladder is strictly increasing to full exposure", () => {
    expect(
      ROLLOUT_STAGE_LADDER.map((s) => s.exposurePercent),
    ).toEqual([0, 1, 10, 50, 100]);
    expect(exposureOf("full")).toBe(100);
    expect(exposureOf("canary-1")).toBe(1);
    expect(() => exposureOf("everywhere" as never)).toThrow(RolloutContractError);
  });

  it("a valid plan passes; malformed plans fail closed", () => {
    expect(checkProviderRolloutPlan(plan()).ok).toBe(true);

    const noCriteria = checkProviderRolloutPlan(
      plan([stage("observe", { holdCriteria: [] }), stage("full", { rollbackCriteria: [] })]),
    );
    expect(noCriteria.ok).toBe(false);
    expect(noCriteria.problems.join("\n")).toContain("no hold criteria");
    expect(noCriteria.problems.join("\n")).toContain("no rollback criteria");

    const outOfOrder = checkProviderRolloutPlan(
      plan([stage("full"), stage("observe")]),
    );
    expect(outOfOrder.ok).toBe(false);
    expect(outOfOrder.problems.join("\n")).toContain("out of ladder order");

    const skipAhead = checkProviderRolloutPlan(plan([stage("observe"), stage("full")]));
    expect(skipAhead.ok).toBe(false);
    expect(skipAhead.problems.join("\n")).toContain("out of ladder order");

    const notEndingFull = checkProviderRolloutPlan(plan([stage("observe")]));
    expect(notEndingFull.ok).toBe(false);
    expect(notEndingFull.problems.join("\n")).toContain("ends at the 'full' stage");

    const unknownStage = checkProviderRolloutPlan(
      plan([stage("observe"), { ...stage("full"), stageId: "skip-ahead" as never }]),
    );
    expect(unknownStage.ok).toBe(false);
    expect(unknownStage.problems.join("\n")).toContain("not on the canonical ladder");

    const providerMismatch = checkProviderRolloutPlan({
      ...plan(),
      providerName: "stripe",
    });
    expect(providerMismatch.ok).toBe(false);
    expect(providerMismatch.problems.join("\n")).toContain(
      "does not match its environment record provider",
    );
  });
});

describe("stage-gate evaluation (hold/rollback criteria)", () => {
  it("healthy observation + all criteria met -> ADVANCE", () => {
    const verdict = evaluateRolloutStage(plan(), stage("canary-1"), healthyObservation());
    expect(verdict.verdict).toBe("ADVANCE");
    expect(verdict.unmetHoldCriteria).toEqual([]);
    expect(verdict.digest).toMatch(/^fnv1a64:/);
  });

  it("an unmet hold criterion -> HOLD (frozen exposure)", () => {
    const verdict = evaluateRolloutStage(
      plan(),
      stage("canary-1"),
      healthyObservation({ parityPassed: false }),
    );
    expect(verdict.verdict).toBe("HOLD");
    expect(verdict.unmetHoldCriteria).toEqual(["PARITY_PASSED"]);
    const counterHold = evaluateRolloutStage(
      plan(),
      stage("canary-1"),
      healthyObservation({ counters: { unknownOutcomesOpen: 5 } }),
    );
    expect(counterHold.verdict).toBe("HOLD");
    expect(counterHold.unmetHoldCriteria).toEqual([
      "COUNTER_BELOW:unknownOutcomesOpen:1",
    ]);
  });

  it("a tripped rollback criterion forces ROLLBACK (wins over HOLD)", () => {
    const exposure = evaluateRolloutStage(
      plan(),
      stage("percent-50"),
      healthyObservation({
        secretExposureDetected: true,
        parityPassed: false,
      }),
    );
    expect(exposure.verdict).toBe("ROLLBACK");
    expect(exposure.trippedRollbackCriteria).toEqual(["SECRET_EXPOSURE_DETECTED"]);
    expect(exposure.unmetHoldCriteria).toEqual(["PARITY_PASSED"]);

    const counterRollback = evaluateRolloutStage(
      plan(),
      stage("percent-50"),
      healthyObservation({ counters: { unknownOutcomesOpen: 11 } }),
    );
    expect(counterRollback.verdict).toBe("ROLLBACK");
    expect(counterRollback.trippedRollbackCriteria).toEqual([
      "COUNTER_ABOVE:unknownOutcomesOpen:10",
    ]);
  });

  it("verdicts are byte-deterministic and carry the exact environment digest", () => {
    const a = evaluateRolloutStage(plan(), stage("full"), healthyObservation());
    const b = evaluateRolloutStage(plan(), stage("full"), healthyObservation());
    expect(a.digest).toBe(b.digest);
    expect(a.environmentDigest).toBe(environment("production").digest);
    const c = evaluateRolloutStage(
      plan(),
      stage("full"),
      healthyObservation({ providerEnabled: false }),
    );
    expect(c.verdict).toBe("HOLD");
    expect(c.digest).not.toBe(a.digest);
    const held = evaluateRolloutStage(
      plan(),
      stage("full"),
      healthyObservation({ parityPassed: false }),
    );
    expect(held.verdict).toBe("HOLD");
    expect(held.digest).not.toBe(a.digest);
  });
});

describe("provider parity (explicit differences only)", () => {
  it("only the credential handle may differ between tiers", () => {
    expect(PROVIDER_PARITY_ALLOWED_DIFFERENCES).toEqual(["credentialHandle"]);
    const report = verifyProviderParity(
      environment("preview"),
      environment("production"),
    );
    expect(report.passed).toBe(true);
    expect(report.digest).toMatch(/^fnv1a64:/);
  });

  it("inverted mode direction (LIVE below, SANDBOX above) fails parity", () => {
    // The tier-progressive direction SANDBOX -> LIVE is the ONLY allowed
    // execution-mode difference; the inversion is drift.
    const report = verifyProviderParity(
      environment("production"),
      environment("preview"),
    );
    expect(report.passed).toBe(false);
    expect(report.unexpectedDifferences).toContain("executionMode");
  });

  it("config-key drift fails parity", () => {
    const lower = environment("preview");
    const drifted = defineProviderEnvironment({
      providerName: "wise",
      tier: "production",
      executionMode: "LIVE",
      transportClass: "PRODUCTION_HTTP",
      credentialConfigKey: "PROVIDER_OTHER_CREDENTIAL_REF",
      credentialHandle: "vault://payswap/production/wise",
    });
    const report = verifyProviderParity(lower, drifted);
    expect(report.passed).toBe(false);
    expect(report.unexpectedDifferences).toContain("credentialConfigKey");
  });
});
