/**
 * @payswap/execution-graph — MATERIAL EXECUTION TERMS contracts (P3-W2,
 * ENCODED LAW 2 support).
 *
 * The ECONOMIC-EXECUTION-GRAPH authority: "Material changes to route,
 * destination, asset, amount, risk or capability observations invalidate
 * affected authorization."
 *
 * This module pins the MATERIAL TERM AXES — the closed set of execution-term
 * dimensions whose change is MATERIAL (must invalidate an authorization
 * projection bound to the old terms). Each axis carries a canonical digest
 * so change detection is deterministic and byte-stable; no axis is ever
 * compared by ad-hoc equality.
 *
 * The financial protocol layer owns REAL authorization; the axes here are
 * the terms THIS package projects authorization against — never authority
 * themselves.
 */

import type { ObservationVersionPin } from './observation-version-contract.ts';
import type { TimestampMs } from '@payswap/protocol';

/** The closed vocabulary of material term axes. */
export const MATERIAL_TERM_AXES = [
  'ROUTE',
  'DESTINATION',
  'ASSET',
  'AMOUNT',
  'RISK',
  'CAPABILITY_OBSERVATIONS',
  'QUOTE',
] as const;

/** One material term axis. */
export type MaterialTermAxis = (typeof MATERIAL_TERM_AXES)[number];

/**
 * The material execution terms a projection is bound to. Every axis is
 * optional in the sense that a projection may not cover it (absent = "this
 * projection makes no claim about that axis"); a change on an axis the
 * projection DOES cover is material and invalidates it.
 */
export interface MaterialExecutionTerms {
  /**
   * ROUTE: the ordered capability chain (rail path) the projection covers.
   * Canonical digest over the ordered chain — order is semantic.
   */
  readonly route?: readonly string[];
  /**
   * DESTINATION: the external settlement destination reference (never
   * PaySwap custody).
   */
  readonly destinationId?: string;
  /** ASSET: the currency/asset moved (symbol). */
  readonly asset?: string;
  /** AMOUNT: the exact minor-unit amount covered (positive). */
  readonly amountMinor?: bigint;
  /**
   * RISK: the policy/security epoch + risk verdict reference the projection
   * was bound to (opaque; owned by the trust/security lanes).
   */
  readonly riskEpochRef?: string;
  /**
   * CAPABILITY_OBSERVATIONS: the exact observation versions the projection
   * rests on (LAW 1 pins). A newer observation on any pinned instance is a
   * MATERIAL change on this axis.
   */
  readonly observationPins?: readonly ObservationVersionPin[];
  /**
   * QUOTE: the versioned economic-input (quote) references the projection
   * covers (opaque versioned source refs from the economic lane).
   */
  readonly quoteRefs?: readonly string[];
}

/** Which axes a terms object covers (deterministic, sorted). */
export type MaterialTermCoverage = readonly MaterialTermAxis[];

/**
 * A deterministic material-term change: which axes changed, with the before
 * and after digests per changed axis. Constructed ONLY by the diff function
 * (never by callers) so a change record cannot be fabricated.
 */
export interface MaterialTermChange {
  /** The axes whose covered value changed (subset of coverage, sorted). */
  readonly changedAxes: readonly MaterialTermAxis[];
  /** Per changed axis: the previous canonical digest. */
  readonly before: Readonly<Record<string, string>>;
  /** Per changed axis: the new canonical digest. */
  readonly after: Readonly<Record<string, string>>;
  /** When the change was observed (caller-supplied instant, DATA). */
  readonly detectedAt: TimestampMs;
}

/** An invalidation event for an authorization projection (LAW 2). */
export interface ProjectionInvalidation {
  readonly projectionId: string;
  /** The material axes whose change invalidated the projection. */
  readonly reasonAxes: readonly MaterialTermAxis[];
  readonly invalidatedAt: TimestampMs;
  readonly note?: string;
}
