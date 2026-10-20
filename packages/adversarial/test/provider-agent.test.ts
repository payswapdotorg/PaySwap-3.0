/**
 * The adversarial provider agent (P6-W3, lane r4-w3; ADAPT of the old
 * adversarial suite's determinism + recommendation laws — the agent's
 * output is EVIDENCE, NEVER AUTHORITY; the composition is escalate-
 * only).
 */

import { describe, expect, it } from "vitest";
import {
  AdversarialProviderAgent,
  InvalidProviderAnalysisError,
  recommendationFromProviderSignals,
  runAllProviderDetectors,
} from "../src/provider/index.ts";
import { composeAdvisoryWithKernelDecision } from "../src/index.ts";
import type { GateDecision } from "../src/index.ts";
import {
  agentBehaviorFixture,
  commandAttemptFixture,
  emptyBundle,
  incidentFixture,
  TIGHT_THRESHOLDS,
} from "./helpers.ts";

const allowDecision: GateDecision = {
  decision: "ALLOW",
  checks: [{ dimension: "chain", outcome: "pass", code: "chain_permitted", detail: "fixture" }],
  evidenceRefs: [],
};

describe("the adversarial provider agent (recommendation-only)", () => {
  it("refuses an empty agent ref (provenance is mandatory)", () => {
    expect(() => new AdversarialProviderAgent("")).toThrowError(InvalidProviderAnalysisError);
    expect(new AdversarialProviderAgent("agent:provider-intel-1").agentRef).toBe(
      "agent:provider-intel-1",
    );
  });

  it("an empty bundle assesses clean: zero signals, ALLOW", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const assessment = agent.analyze({ bundle: emptyBundle(), thresholds: TIGHT_THRESHOLDS, at: 1 });
    expect(assessment.signals).toEqual([]);
    expect(assessment.agentRecommendation).toBe("ALLOW");
    expect(assessment.analyzedAt).toBe(1);
    expect(assessment.assessmentId).toMatch(/^fnv1a64:/);
    expect(assessment.evidenceRefs).toEqual([]);
  });

  it("produces a deterministic digest (identical re-run)", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const input = {
      bundle: emptyBundle({
        commandAttempts: [
          commandAttemptFixture({ observationId: "idempotency:reg:1", attemptCount: 2 }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1_766_000_000_000,
    };
    const first = agent.analyze(input);
    const second = agent.analyze(input);
    expect(first.assessmentId).toBe(second.assessmentId);
    expect(first.signals.map((s) => s.signalId)).toEqual(second.signals.map((s) => s.signalId));
    // A different instant is a different assessment (deterministic, not cached).
    const later = agent.analyze({ ...input, at: input.at + 1 });
    expect(later.assessmentId).not.toBe(first.assessmentId);
  });

  it("the recommendation rule is the strictest severity present (fixed + deterministic)", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const critical = agent.analyze({
      bundle: emptyBundle({
        agentBehaviors: [
          agentBehaviorFixture({ observationId: "agent:k:1", proposalShapeValid: false }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1,
    });
    expect(critical.agentRecommendation).toBe("BLOCK");
    const medium = agent.analyze({
      bundle: emptyBundle({
        commandAttempts: [
          commandAttemptFixture({ observationId: "idempotency:reg:2", attemptCount: 2 }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1,
    });
    expect(medium.agentRecommendation).toBe("ALLOW_WITH_CONSTRAINTS");
    const high = agent.analyze({
      bundle: emptyBundle({
        incidents: [incidentFixture({ observationId: "incident:p:1", incidentKind: "unknown" })],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1,
    });
    expect(high.agentRecommendation).toBe("REQUIRE_CONFIRMATION");
  });

  it("the recommendation projects evidence-only: signals feed the escalate-only composition", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const assessment = agent.analyze({
      bundle: emptyBundle({
        agentBehaviors: [
          agentBehaviorFixture({ observationId: "agent:k:2", proposalShapeValid: false }),
        ],
      }),
      thresholds: TIGHT_THRESHOLDS,
      at: 1,
    });
    // The agent's BLOCK recommendation ESCALATES over a kernel ALLOW
    // through the INV-21 composition (never softens anything).
    const composed = composeAdvisoryWithKernelDecision({
      kernelDecision: allowDecision,
      advisoryVerdict: assessment.agentRecommendation,
    });
    expect(composed.decision).toBe("BLOCK");
    // And it corroborates a kernel BLOCK without changing it.
    const blockKernel: GateDecision = {
      decision: "BLOCK",
      reasons: [
        { dimension: "asset", code: "asset_not_permitted", message: "fixture", invariantRefs: ["INV-21"] },
      ],
      checks: [],
      evidenceRefs: [],
    };
    expect(
      composeAdvisoryWithKernelDecision({
        kernelDecision: blockKernel,
        advisoryVerdict: "ALLOW",
      }).decision,
    ).toBe("BLOCK");
  });

  it("evidence refs bind the assessment to every signal chain (deduplicated, sorted)", () => {
    const agent = new AdversarialProviderAgent("agent:provider-intel-1");
    const bundle = emptyBundle({
      agentBehaviors: [
        agentBehaviorFixture({ observationId: "agent:k:3", proposalShapeValid: false }),
        agentBehaviorFixture({ observationId: "agent:k:4", unrestrictedTransfer: true }),
      ],
    });
    const assessment = agent.analyze({ bundle, thresholds: TIGHT_THRESHOLDS, at: 1 });
    const detectorRefs = new Set(
      runAllProviderDetectors({ bundle, thresholds: TIGHT_THRESHOLDS }).flatMap((s) =>
        s.evidence.digestRefs,
      ),
    );
    expect(assessment.evidenceRefs).toEqual([...detectorRefs].sort());
  });

  it("recommendationFromProviderSignals maps the severity ladder exactly", () => {
    expect(recommendationFromProviderSignals([])).toBe("ALLOW");
    const signalOf = (severity: "info" | "low" | "medium" | "high" | "critical") =>
      ({ severity, signalId: "s", family: "provider_outage", code: "c", method: "behavioral_pattern", confidenceBps: 1, evidence: { observationRefs: ["o"], digestRefs: [], deltas: [] }, summary: "s" }) as never;
    expect(recommendationFromProviderSignals([signalOf("info"), signalOf("low")])).toBe("ALLOW");
    expect(recommendationFromProviderSignals([signalOf("medium")])).toBe("ALLOW_WITH_CONSTRAINTS");
    expect(recommendationFromProviderSignals([signalOf("high"), signalOf("low")])).toBe(
      "REQUIRE_CONFIRMATION",
    );
    expect(recommendationFromProviderSignals([signalOf("critical")])).toBe("BLOCK");
  });
});
