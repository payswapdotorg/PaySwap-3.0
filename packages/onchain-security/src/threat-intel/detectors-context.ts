/**
 * @payswap/onchain-security/threat-intel — the detector context + shared
 * helpers (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law; the 13 family detectors live in detectors-approvals.ts,
 * detectors-infra.ts and detectors-state.ts, the sweep in detectors.ts).
 *
 * Each detector is a DETERMINISTIC PURE FUNCTION of (prepared write,
 * optional simulation observation, threat policy, observation bundle,
 * evaluation instant) that returns raw signals — observations of threats
 * with their evidence chains, NEVER verdicts. Verdicts belong to the
 * deterministic policy (policy.ts) and the composed resolution
 * (verdict.ts).
 *
 * Detection discipline:
 * - evidence-generating: every raw signal names its observation refs,
 *   digest refs and exact deltas (a detector cannot emit an evidence-free
 *   signal — buildThreatSignal would reject it);
 * - exact arithmetic only: deviations/limits are integers, BigInt
 *   cross-multiplications or canonical rationals — never floating point;
 * - absence of intelligence is weak evidence (registry_absence) only
 *   where the policy demands coverage; otherwise detectors stay silent
 *   (UNKNOWN is not FAILED — INV-4 — and absence is not a threat);
 * - deterministic ordering of emitted signals per family.
 */

import type { PreparedWrite } from "../write-intent.ts";
import type { SimulationObservation } from "../simulation.ts";
import type { AssetIdentity } from "../types.ts";
import type { OnchainThreatObservationBundle } from "./observations.ts";
import type { OnchainThreatPolicy } from "./policy.ts";
import type { ThreatEvidence, EvidenceDelta } from "./evidence.ts";
import type { ThreatFamily, ThreatSeverity } from "./families.ts";
import type { DetectionMethod } from "./confidence.ts";

/**
 * A raw (un-built) detector output. `corroborations` counts independent
 * observations that support the same detection (calibration input).
 */
export interface RawSignal {
  readonly family: ThreatFamily;
  readonly code: string;
  readonly severity: ThreatSeverity;
  readonly method: DetectionMethod;
  readonly evidence: ThreatEvidence;
  readonly summary: string;
  /** Independent corroborating observations (0 = the evidence is all of it). */
  readonly corroborations: number;
}

/** Everything a detector consumes (all deterministic inputs). */
export interface DetectionContext {
  readonly write: PreparedWrite;
  readonly simulation?: SimulationObservation;
  readonly policy: OnchainThreatPolicy;
  readonly bundle: OnchainThreatObservationBundle;
  readonly at: number;
}

// ---------------------------------------------------------------------------
// Implementation (shared evidence/geometry helpers — exported for
// detector authors; the 13 family detectors build on them)
// ---------------------------------------------------------------------------

/**
 * The canonical evidence chain every detector starts from: bound to the
 * write digest, the bundle id (and the simulation id when supplied), with
 * the detector's observation refs and exact deltas.
 */
export function baseEvidence(
  context: DetectionContext,
  observationRefs: readonly string[],
  deltas?: readonly EvidenceDelta[],
): ThreatEvidence {
  const digestRefs = [
    `write:${context.write.writeDigest}`,
    `bundle:${context.bundle.bundleId}`,
  ];
  if (context.simulation !== undefined) {
    digestRefs.push(`simulation:${context.simulation.simulationId}`);
  }
  return {
    observationRefs,
    digestRefs,
    ...(deltas === undefined ? {} : { deltas }),
    note: `bound to write ${context.write.writeId} via bundle ${context.bundle.bundleId}`,
  };
}

/** Asset identities referenced by the write (transfer + approvals). */
export function intentAssets(context: DetectionContext): readonly import("../types.ts").AssetIdentity[] {
  const assets: import("../types.ts").AssetIdentity[] = [];
  if (context.write.transfer !== undefined) {
    assets.push(context.write.transfer.asset);
  }
  for (const approval of context.write.approvals) {
    assets.push(approval.asset);
  }
  return assets;
}

/** Route hop chains (the confusion surface). */
export function hopChains(
  write: import("../write-intent.ts").PreparedWrite,
): readonly string[] {
  return (write.route.hops ?? []).map((hop) => hop.chain);
}

/** Bridge hop venues (hops on a chain different from the write chain). */
export function bridgeHops(
  write: import("../write-intent.ts").PreparedWrite,
): readonly string[] {
  return (write.route.hops ?? [])
    .filter((hop) => hop.chain !== write.chain)
    .map((hop) => hop.venue);
}
