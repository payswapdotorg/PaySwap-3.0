/**
 * @payswap/route-compiler — the PINNED WIRE SHAPES of the execution-graph
 * lane (P5-W1, lane R3-W1).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its
 * AUTHORITY — @payswap/execution-graph, the Economic Execution Graph
 * contract package (P3-W2). The route compiler is the graph's
 * COMPOSITION-SIDE supplier: it compiles candidate plans whose QUOTE,
 * OBSERVATION and AUTHORITY lineage the graph preserves exactly as
 * decided (the observation-VERSION preservation law, ENCODED LAW 1 of
 * that lane: "the graph must keep the exact version it decided on").
 *
 * Pins in this module (authority: @payswap/execution-graph):
 * - PinnedObservationVersionPin / PinnedVersionedObservationRecord (the
 *   append-only version ledger record — lossless retrieval, digest
 *   re-verified)
 * - PinnedMaterialExecutionTerms (material-terms changes invalidate
 *   affected authorization — the compiler carries the terms it decided on)
 * - PinnedExecutionModeReference (the graph's mode-vocabulary pin)
 * - RoutePlanLineageRecord (THIS package's own lineage assembly over the
 *   pinned records — see src/evidence.ts)
 */

import { fnv1a64 } from "../canonical.ts";

/**
 * STRUCTURAL PIN — authority: @payswap/execution-graph
 * src/observation-version-contract.ts `ObservationVersionPin` (SUBSET:
 * the version pin + digest the compiler records per observation it
 * decided on; the full contract carries instance identity classes and
 * ledger bookkeeping owned by that lane).
 */
export interface PinnedObservationVersionPin {
  /** The connected instance the observation is scoped to. */
  readonly instanceId: string;
  /** The EXACT monotonic observation version decided on (never "latest"). */
  readonly observationVersion: number;
  /** The pinned digest of the recorded observation (lossless retrieval law). */
  readonly pinnedDigest: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/execution-graph
 * src/observation-version-contract.ts `VersionedObservationRecord`
 * (SUBSET: the recorded observation body + version + observedAt; the
 * ledger's recordedAt/append discipline is owned by that lane).
 */
export interface PinnedVersionedObservationRecord {
  readonly instanceId: string;
  readonly observationVersion: number;
  readonly observedAt: string;
  /** The canonical two-axis observation body (capability pin shape). */
  readonly observation: {
    readonly capabilityState: string;
    readonly sourceAvailability: string;
    readonly availability: string;
    readonly eligibility: string;
    readonly provenance: {
      readonly providerName: string;
      readonly source: string;
      readonly capturedAt: string;
    };
  };
}

/**
 * STRUCTURAL PIN — authority: @payswap/execution-graph
 * src/material-terms-contract.ts `MaterialExecutionTerms` (SUBSET: the
 * versioned terms identity + the digest binding; the full change-taxonomy
 * surface is owned by that lane). MATERIAL terms changes invalidate
 * affected authorization: the compiler carries the terms version it
 * decided on so the graph can detect drift.
 */
export interface PinnedMaterialExecutionTerms {
  readonly termsId: string;
  readonly termsVersion: string;
  /** Content digest binding of the terms as decided. */
  readonly termsDigest: string;
}

/**
 * VALUE PIN — authority: @payswap/execution-graph
 * src/execution-modes.ts `EXECUTION_MODES_LOCAL` (itself a byte-identical
 * pin of @payswap/capability EXECUTION_MODES). Pinned here for the
 * lineage record's mode references; identical to the capability pin.
 */
export const PINNED_GRAPH_EXECUTION_MODES = Object.freeze([
  "PASS_THROUGH_NATIVE",
  "COMPOSED_PAYSWAP",
  "OPTIMIZED_MULTI_PROVIDER",
] as const);

/**
 * The observation-version FINGERPRINT: the deterministic binding of the
 * exact versions a compilation decided on (the determinism grounding
 * law — same versions -> same fingerprint; any version change -> a
 * different fingerprint). Pure function of the version pins, order
 * canonicalized by (instanceId, observationVersion), digest by this
 * package's canonical FNV-1a 64 (binding, never security).
 */
export function observationVersionFingerprint(
  pins: readonly PinnedObservationVersionPin[],
): string {
  const canonical = [...pins]
    .sort((left, right) => {
      const leftKey = `${left.instanceId}@${left.observationVersion}`;
      const rightKey = `${right.instanceId}@${right.observationVersion}`;
      if (leftKey < rightKey) {
        return -1;
      }
      if (leftKey > rightKey) {
        return 1;
      }
      return 0;
    })
    .map((pin) => `${pin.instanceId}@${pin.observationVersion}:${pin.pinnedDigest}`)
    .join("|");
  return `fnv1a64:${fnv1a64(canonical)}`;
}
