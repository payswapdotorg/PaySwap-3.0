/**
 * @payswap/onchain-security/threat-intel — the adversarial transaction
 * agent (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/agent.ts).
 *
 * The AdversarialTransactionAgent is a DETERMINISTIC analysis engine —
 * no LLM, no randomness, no ambient clock — that sweeps the 13 family
 * detectors over (prepared write, simulation, policy, observation bundle)
 * and produces a ThreatAssessment:
 *
 * - every signal is built through buildThreatSignal, so each carries its
 *   evidence chain (structurally mandatory) and its calibrated confidence;
 * - the agent computes an AGENT RECOMMENDATION from the signals via the
 *   fixed deterministic rule (severity → recommendation). The
 *   recommendation is explicitly NOT AUTHORITY (INV-9: agents cannot
 *   declare financial truth): the deterministic policy (policy.ts)
 *   evaluates the verdict, and verdict.ts composes the two under the
 *   no-downgrade law (an agent BLOCK stays BLOCK; an agent ALLOW can
 *   still be overridden to BLOCK by deterministic policy — INV-21). The
 *   agent holds no override path at all — it can only recommend and FLAG.
 *
 * AGENT-BOUNDARY LAWS enforced here:
 * - the input and output are secret-scanned with the kernel scanner
 *   (INV-19: the adversarial agent MODELS threats, it never handles key
 *   material);
 * - the agent never broadcasts, never mints authorization, never mutates
 *   a kernel decision (no such API exists on it);
 * - provenance: every assessment names the agent ref and the digests it
 *   analyzed (write, simulation, bundle).
 *
 * Deterministic only: same input → byte-identical assessment.
 */

import type { PreparedWrite } from "../write-intent.ts";
import type { SimulationObservation } from "../simulation.ts";
import type { OnchainThreatObservationBundle } from "./observations.ts";
import type { OnchainThreatPolicy } from "./policy.ts";

/** The four-value recommendation vocabulary (same union as the verdict). */
export type ThreatRecommendation =
  | "ALLOW"
  | "ALLOW_WITH_CONSTRAINTS"
  | "REQUIRE_CONFIRMATION"
  | "BLOCK";

/** Everything the agent analyzes (all deterministic inputs). */
export interface AdversarialAnalysisInput {
  readonly write: PreparedWrite;
  readonly simulation?: SimulationObservation;
  readonly policy: OnchainThreatPolicy;
  readonly bundle: OnchainThreatObservationBundle;
  /** Deterministic evaluation instant (ms). */
  readonly at: number;
}

/** The full output of one adversarial analysis run. */
export interface ThreatAssessment {
  /** Deterministic content digest of the assessment (identity). */
  readonly assessmentId: string;
  /** The analyzing agent (provenance). */
  readonly agentRef: string;
  /** Evaluation instant (= input.at). */
  readonly analyzedAt: number;
  /** Signals raised, deterministic order (severity desc, family, code). */
  readonly signals: readonly ThreatSignal[];
  /** The agent's recommendation — evidence, NEVER authority. */
  readonly agentRecommendation: ThreatRecommendation;
  /** All evidence digest refs the assessment is bound to. */
  readonly evidenceRefs: readonly string[];
}

/** Raised on malformed agent input (fail closed). */
export class InvalidAdversarialAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAdversarialAnalysisError";
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

import { runAllDetectors } from "./detectors.ts";
import { calibrateConfidenceBps } from "./confidence.ts";
import { buildThreatSignal, type ThreatSignal } from "./signals.ts";
import { validateThreatPolicy } from "./policy.ts";
import { threatSeverityRank } from "./families.ts";
import { assertNoSecretMaterial } from "../secrets.ts";
import { contentDigest } from "../digest.ts";

/**
 * The agent's fixed deterministic recommendation rule: the recommendation
 * is the strictest rule-mapped severity present in the signals:
 * critical → BLOCK, high → REQUIRE_CONFIRMATION, medium →
 * ALLOW_WITH_CONSTRAINTS, low/info → ALLOW. This mirrors the deterministic
 * policy default table's shape but is the AGENT's own view — composition
 * happens in verdict.ts (the agent's recommendation is evidence, never
 * authority).
 */
export function recommendationFromSignals(
  signals: readonly ThreatSignal[],
): ThreatRecommendation {
  let highest = 0;
  for (const signal of signals) {
    highest = Math.max(highest, threatSeverityRank(signal.severity));
  }
  if (highest <= 1) {
    return "ALLOW";
  }
  if (highest === 2) {
    return "ALLOW_WITH_CONSTRAINTS";
  }
  if (highest === 3) {
    return "REQUIRE_CONFIRMATION";
  }
  return "BLOCK";
}

/**
 * The adversarial transaction agent. Stateless: one instance may analyze
 * any number of writes; every assessment is a pure function of its input.
 */
export class AdversarialTransactionAgent {
  readonly agentRef: string;

  constructor(agentRef: string) {
    if (agentRef.length === 0) {
      throw new InvalidAdversarialAnalysisError(
        "agentRef must be a non-empty provenance ref (e.g. 'agent:threat-intel-1')",
      );
    }
    this.agentRef = agentRef;
  }

  /**
   * Analyze one prepared write. Deterministic sweep of all 13 family
   * detectors → signals (evidence + confidence) → agent recommendation.
   * The assessment is content-addressed and secret-scanned on BOTH sides
   * of the boundary (input and output).
   */
  analyze(input: AdversarialAnalysisInput): ThreatAssessment {
    assertNoSecretMaterial(input, "adversarial analysis input");
    validateThreatPolicy(input.policy);
    if (!Number.isInteger(input.at) || input.at < 0) {
      throw new InvalidAdversarialAnalysisError(
        "evaluation instant `at` must be a non-negative integer (ms)",
      );
    }
    if (input.simulation !== undefined && input.simulation.writeId.length === 0) {
      throw new InvalidAdversarialAnalysisError(
        "simulation observations must carry a writeId (use recordSimulation)",
      );
    }

    const rawSignals = runAllDetectors({
      write: input.write,
      ...(input.simulation === undefined ? {} : { simulation: input.simulation }),
      policy: input.policy,
      bundle: input.bundle,
      at: input.at,
    });

    // Build every raw signal through the validated constructor: evidence
    // chains are structurally mandatory; confidence is calibrated from
    // (method, corroborations).
    const signals: ThreatSignal[] = [];
    for (const raw of rawSignals) {
      const confidenceBps = calibrateConfidenceBps(raw.method, raw.corroborations);
      signals.push(
        buildThreatSignal({
          family: raw.family,
          code: raw.code,
          severity: raw.severity,
          method: raw.method,
          confidenceBps,
          evidence: raw.evidence,
          summary: raw.summary,
        }),
      );
    }

    // Deterministic ordering: severity desc, then family, then code.
    signals.sort((a, b) => {
      const rank = threatSeverityRank(b.severity) - threatSeverityRank(a.severity);
      if (rank !== 0) {
        return rank;
      }
      if (a.family !== b.family) {
        return a.family < b.family ? -1 : 1;
      }
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });

    const evidenceRefs = [
      `write:${input.write.writeDigest}`,
      `bundle:${input.bundle.bundleDigest}`,
      ...(input.simulation === undefined
        ? []
        : [`simulation:${input.simulation.simulationId}`]),
      `policy:${input.policy.policyId}@${input.policy.version}`,
    ];

    const agentRecommendation = recommendationFromSignals(signals);
    const assessmentId = contentDigest({
      agentRef: this.agentRef,
      at: input.at,
      writeDigest: input.write.writeDigest,
      bundleDigest: input.bundle.bundleDigest,
      signals: signals.map((signal) => signal.signalId),
      agentRecommendation,
    });

    const assessment: ThreatAssessment = Object.freeze({
      assessmentId,
      agentRef: this.agentRef,
      analyzedAt: input.at,
      signals: Object.freeze(signals),
      agentRecommendation,
      evidenceRefs: Object.freeze(evidenceRefs),
    });
    assertNoSecretMaterial(assessment, "threat assessment output");
    return assessment;
  }
}
