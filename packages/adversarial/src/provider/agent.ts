/**
 * @payswap/adversarial — the adversarial provider agent (P6-W3, lane
 * r4-w3; ADAPT of the adversarial-agent discipline from the accepted
 * onchain-security threat-intel lane, over the PROVIDER family
 * vocabulary).
 *
 * The agent is a DETERMINISTIC ANALYSIS ENGINE: it runs the detector
 * sweep over a provider observation bundle and produces a THREAT
 * ASSESSMENT — severity-ordered signals plus the agent's own
 * RECOMMENDATION. The recommendation is EVIDENCE, NEVER AUTHORITY:
 *
 * - it is computed by a fixed deterministic rule (the strictest
 *   severity present: critical → BLOCK, high →
 *   REQUIRE_CONFIRMATION, medium → ALLOW_WITH_CONSTRAINTS,
 *   low/info → ALLOW — the same rule shape the onchain-security
 *   agent uses);
 * - it never mutates a kernel decision, never mints authority, never
 *   downgrades anything: the ONLY lawful composition is the
 *   escalate-only seam (../block-authority.ts, INV-21) and the ONLY
 *   enforcement path is the D-1 bridge (../integration/
 *   onchain-bridge.ts → the advisory registry → quarantine/restrict/
 *   retire with verified-remediation release).
 *
 * Deterministic only: same bundle + same thresholds + same instant →
 * byte-identical assessment (content-addressed).
 */

import { contentDigest, type ThreatRecommendation } from "../pins/index.ts";
import type { ProviderObservationBundle } from "./observations.ts";
import type { ProviderDetectorThresholds } from "./detectors-context.ts";
import { DEFAULT_PROVIDER_THRESHOLDS } from "./detectors-context.ts";
import { runAllProviderDetectors } from "./detectors.ts";
import type { ProviderThreatSignal } from "./signals.ts";
import { threatSeverityRank } from "./families.ts";

/** Raised on malformed agent input (fail closed). */
export class InvalidProviderAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProviderAnalysisError";
  }
}

/** Everything the agent analyzes (all deterministic inputs). */
export interface ProviderAnalysisInput {
  readonly bundle: ProviderObservationBundle;
  readonly thresholds?: ProviderDetectorThresholds;
  /** Deterministic evaluation instant (ms). */
  readonly at: number;
}

/** The full output of one adversarial provider analysis run. */
export interface ProviderThreatAssessment {
  /** Deterministic content digest of the assessment (identity). */
  readonly assessmentId: string;
  /** The analyzing agent (provenance). */
  readonly agentRef: string;
  /** Evaluation instant (= input.at). */
  readonly analyzedAt: number;
  /** Signals raised, deterministic order (severity desc, family, code). */
  readonly signals: readonly ProviderThreatSignal[];
  /** The agent's recommendation — evidence, NEVER authority. */
  readonly agentRecommendation: ThreatRecommendation;
  /** All evidence digest refs the assessment is bound to. */
  readonly evidenceRefs: readonly string[];
}

/**
 * The agent's fixed deterministic recommendation rule: the strictest
 * severity present in the signals (critical → BLOCK, high →
 * REQUIRE_CONFIRMATION, medium → ALLOW_WITH_CONSTRAINTS, low/info →
 * ALLOW). This is the AGENT's own view — composition happens under the
 * no-downgrade law (INV-21); the recommendation can only ever harden a
 * decision, never soften one.
 */
export function recommendationFromProviderSignals(
  signals: readonly ProviderThreatSignal[],
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

/** The adversarial provider agent (deterministic, advisory only). */
export class AdversarialProviderAgent {
  readonly agentRef: string;

  constructor(agentRef: string) {
    if (agentRef.length === 0) {
      throw new InvalidProviderAnalysisError(
        "agentRef must be a non-empty provenance ref (e.g. 'agent:provider-intel-1')",
      );
    }
    this.agentRef = agentRef;
  }

  /**
   * Analyze a provider observation bundle: run every family detector,
   * order the signals deterministically, compute the recommendation
   * (evidence, never authority) and content-address the assessment.
   */
  analyze(input: ProviderAnalysisInput): ProviderThreatAssessment {
    const thresholds = input.thresholds ?? DEFAULT_PROVIDER_THRESHOLDS;
    const signals = runAllProviderDetectors({
      bundle: input.bundle,
      thresholds,
    });
    const evidenceRefs = Object.freeze(
      [...new Set(signals.flatMap((signal) => signal.evidence.digestRefs))].sort(),
    );
    const assessmentId = contentDigest({
      agentRef: this.agentRef,
      analyzedAt: input.at,
      signals,
      recommendation: recommendationFromProviderSignals(signals),
    });
    return Object.freeze({
      assessmentId,
      agentRef: this.agentRef,
      analyzedAt: input.at,
      signals,
      agentRecommendation: recommendationFromProviderSignals(signals),
      evidenceRefs,
    });
  }
}
