/**
 * @payswap/adversarial — provider threat signals (P6-W3, lane r4-w3;
 * ADAPT of the threat-signal discipline from the accepted
 * onchain-security threat-intel lane — evidence-chained, integer-bps
 * calibrated, content-addressed — over the PROVIDER family vocabulary).
 *
 * A ProviderThreatSignal is the ONLY output currency of the provider
 * detectors: a family-classified, severity-graded detection with a
 * MANDATORY evidence chain (observation refs + digests + exact deltas)
 * and a calibrated confidence in integer basis points.
 *
 * A signal is NOT a decision. Signals feed the adversarial provider
 * agent's recommendation (./agent.ts — evidence, never authority), the
 * D-1 bridge's advisory proposals (../integration/onchain-bridge.ts)
 * and the escalate-only composition (../block-authority.ts, INV-21).
 * A signal without evidence fails validation STRUCTURALLY.
 *
 * Deterministic only: pure data + pure functions.
 */

import { contentDigest, type DetectionMethod, type ThreatSeverity } from "../pins/index.ts";
import type { ProviderThreatFamily } from "./families.ts";

/** The evidence chain of a provider detection (observation-grounded). */
export interface ProviderEvidence {
  /** Observation ids this detection is grounded in. */
  readonly observationRefs: readonly string[];
  /** Content digests of the grounding observations. */
  readonly digestRefs: readonly string[];
  /** Exact measured deltas (string numbers; can be negative). */
  readonly deltas: readonly { readonly label: string; readonly value: string }[];
}

/** A provider threat signal (immutable, content-addressed). */
export interface ProviderThreatSignal {
  /** Deterministic content digest of the signal (identity). */
  readonly signalId: string;
  readonly family: ProviderThreatFamily;
  /** Machine code, e.g. `provider_outage_window`. */
  readonly code: string;
  readonly severity: ThreatSeverity;
  /** How the detection was made (calibration input). */
  readonly method: DetectionMethod;
  /** Calibrated confidence, integer basis points in [0, 10_000]. */
  readonly confidenceBps: number;
  /** The mandatory evidence chain. */
  readonly evidence: ProviderEvidence;
  readonly summary: string;
}

/** Everything buildProviderThreatSignal consumes. */
export interface BuildProviderThreatSignalInput {
  readonly family: ProviderThreatFamily;
  readonly code: string;
  readonly severity: ThreatSeverity;
  readonly method: DetectionMethod;
  readonly confidenceBps: number;
  readonly evidence: ProviderEvidence;
  readonly summary: string;
}

/** Raised when a provider signal is structurally invalid. */
export class InvalidProviderSignalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProviderSignalError";
  }
}

/**
 * Construct + validate one provider threat signal. Computes the
 * deterministic signalId (content digest) and validates:
 * 1. family + severity are known vocabulary;
 * 2. the code and summary are non-empty;
 * 3. the confidence is a valid integer-bps value;
 * 4. THE EVIDENCE CHAIN IS PRESENT AND COMPLETE (structural law: an
 *    evidence-free signal is unconstructible through any path).
 */
export function buildProviderThreatSignal(
  input: BuildProviderThreatSignalInput,
): ProviderThreatSignal {
  if (input.code.length === 0) {
    throw new InvalidProviderSignalError(
      `signal for family '${input.family}': code must be non-empty`,
    );
  }
  if (input.summary.length === 0) {
    throw new InvalidProviderSignalError(
      `signal '${input.code}': summary must be non-empty`,
    );
  }
  if (!Number.isInteger(input.confidenceBps) || input.confidenceBps < 0 || input.confidenceBps > 10_000) {
    throw new InvalidProviderSignalError(
      `signal '${input.code}': confidence must be an integer in [0, 10000] basis points`,
    );
  }
  if (input.evidence.observationRefs.length === 0) {
    throw new InvalidProviderSignalError(
      `signal '${input.code}': the evidence chain is mandatory (no observation-grounded refs)`,
    );
  }
  const evidence: ProviderEvidence = Object.freeze({
    observationRefs: Object.freeze([...input.evidence.observationRefs]),
    digestRefs: Object.freeze([...input.evidence.digestRefs]),
    deltas: Object.freeze(input.evidence.deltas.map((d) => Object.freeze({ ...d }))),
  });
  const signalId = contentDigest({
    family: input.family,
    code: input.code,
    severity: input.severity,
    method: input.method,
    confidenceBps: input.confidenceBps,
    evidence,
    summary: input.summary,
  });
  return Object.freeze({
    signalId,
    family: input.family,
    code: input.code,
    severity: input.severity,
    method: input.method,
    confidenceBps: input.confidenceBps,
    evidence,
    summary: input.summary,
  });
}

/**
 * Deterministic signal ordering (severity desc, then family, then
 * code, then signalId) — the agent and the bridge consume signals in
 * exactly this order.
 */
export function compareProviderSignals(
  a: ProviderThreatSignal,
  b: ProviderThreatSignal,
): number {
  const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;
  const rank = (s: ThreatSeverity): number => SEVERITY_ORDER.indexOf(s);
  const bySeverity = rank(b.severity) - rank(a.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  if (a.family !== b.family) {
    return a.family < b.family ? -1 : 1;
  }
  if (a.code !== b.code) {
    return a.code < b.code ? -1 : 1;
  }
  return a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0;
}
