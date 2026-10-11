/**
 * @payswap/surface — corridor coverage projection (P2-W3).
 *
 * NET-NEW module: the corridor view over capability-shaped data. Law (Wise
 * §4.1 mapped to the frozen architecture; P2-W1 work order: "A corridor is
 * a discovery projection over capabilities, not a new authority or a
 * currency pair alone"):
 *
 * - a corridor view MUST reference the underlying capability/provider/
 *   connected-instance identities and their versions or observations;
 * - it must show why a corridor is eligible or excluded;
 * - catalogue support alone can never make a corridor executable (INV-13);
 * - a corridor is a discovery projection, never an authority — the view
 *   says so (INV-10).
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** Raised when a corridor source is invalid (fail-closed). */
export class InvalidCorridorSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCorridorSourceError";
  }
}

/** A reference to an underlying capability with its version (never the capability itself). */
export interface CorridorCapabilityRef {
  readonly capabilityId: string;
  readonly version: string;
}

/** What the fold reads from corridor-shaped data (STRUCTURAL pin — P2-W1 owns the real shapes). */
export interface CorridorSource {
  /** Corridor identity (e.g. "eu/eur->gb/gbp"). */
  readonly corridorId: string;
  readonly sourceCountry: string;
  readonly targetCountry: string;
  readonly sourceCurrency: string;
  readonly targetCurrency: string;
  /**
   * References to the underlying capability identities + versions (Wise
   * §4.1 law: the corridor view references its sources; it is never just a
   * currency pair).
   */
  readonly capabilityRefs: readonly CorridorCapabilityRef[];
  /** Connected-instance identities behind the corridor. */
  readonly connectedInstanceRefs: readonly string[];
  /** Whether the corridor is currently eligible. */
  readonly eligible: boolean;
  /** Why or why not — typed reasons, rendered verbatim. */
  readonly reasons: readonly string[];
}

/** One corridor's view. */
export interface CorridorCoverageRow {
  readonly corridorId: string;
  readonly sourceCountry: string;
  readonly targetCountry: string;
  readonly sourceCurrency: string;
  readonly targetCurrency: string;
  readonly eligible: boolean;
  /** true when no connected instance exists behind the corridor (catalogue-only, never executable). */
  readonly catalogueOnly: boolean;
  readonly capabilityRefs: readonly CorridorCapabilityRef[];
  readonly connectedInstanceRefs: readonly string[];
  readonly reasons: readonly string[];
}

/** The full corridor coverage view. */
export interface CorridorCoverageView {
  /** The SIMPLE outcome line. */
  readonly outcomeLine: string;
  readonly rows: readonly CorridorCoverageRow[];
  readonly counts: {
    readonly total: number;
    readonly eligible: number;
    readonly excluded: number;
    readonly catalogueOnly: number;
  };
  /** True when NO corridor is eligible — honest headline, never a failure tone. */
  readonly nothingEligible: boolean;
  /** The advisory disclaimer (INV-10 + "a corridor is a projection, not an authority"). */
  readonly advisoryDisclaimer: string;
  readonly provenance: SurfaceContractProvenance;
}

const CORRIDOR_ADVISORY =
  "A corridor is a discovery projection over capabilities, not an authority and not a currency pair alone (INV-10): corridor eligibility cannot authorize execution; consequential paths go through policy, security, PaySwap authorization and the financial protocol.";

function validateCorridor(source: CorridorSource): void {
  if (typeof source.corridorId !== "string" || source.corridorId.length === 0) {
    throw new InvalidCorridorSourceError("corridorId must be a non-empty string");
  }
  if (source.capabilityRefs.length === 0) {
    throw new InvalidCorridorSourceError(
      `corridor ${source.corridorId}: capabilityRefs must be non-empty — a corridor view must reference its underlying capabilities (never just a currency pair)`,
    );
  }
  for (const ref of source.capabilityRefs) {
    if (typeof ref.capabilityId !== "string" || ref.capabilityId.length === 0) {
      throw new InvalidCorridorSourceError(`corridor ${source.corridorId}: capabilityRef.capabilityId must be non-empty`);
    }
    if (typeof ref.version !== "string" || ref.version.length === 0) {
      throw new InvalidCorridorSourceError(
        `corridor ${source.corridorId}: capabilityRef.version must be non-empty (observations/versions must be referenced)`,
      );
    }
  }
  if (source.eligible && source.connectedInstanceRefs.length === 0) {
    throw new InvalidCorridorSourceError(
      `corridor ${source.corridorId}: eligible without any connected instance — catalogue support alone cannot make a corridor executable (INV-13)`,
    );
  }
}

function corridorRow(source: CorridorSource): CorridorCoverageRow {
  return {
    corridorId: source.corridorId,
    sourceCountry: source.sourceCountry,
    targetCountry: source.targetCountry,
    sourceCurrency: source.sourceCurrency,
    targetCurrency: source.targetCurrency,
    eligible: source.eligible,
    catalogueOnly: source.connectedInstanceRefs.length === 0,
    capabilityRefs: source.capabilityRefs,
    connectedInstanceRefs: source.connectedInstanceRefs,
    reasons: source.reasons,
  };
}

/**
 * Fold corridor-shaped data into the coverage view. Pure and fail-closed:
 * a corridor without capability references, or an eligible corridor with no
 * connected instance, is refused.
 */
export function foldCorridorCoverage(corridors: readonly CorridorSource[]): CorridorCoverageView {
  for (const source of corridors) {
    validateCorridor(source);
  }
  const rows = corridors.map(corridorRow);
  const eligible = rows.filter((row) => row.eligible);
  const excluded = rows.filter((row) => !row.eligible);
  const catalogueOnly = rows.filter((row) => row.catalogueOnly);
  const nothingEligible = eligible.length === 0;
  const outcomeLine = nothingEligible
    ? `No eligible corridor right now — ${rows.length} corridor${rows.length === 1 ? "" : "s"} recorded and every one is honestly excluded with its reasons; nothing was silently dropped.`
    : `${eligible.length} eligible corridor${eligible.length === 1 ? "" : "s"}${
        excluded.length > 0 ? `, ${excluded.length} excluded (reasons on drill-down)` : ""
      } — coverage with its sources, never a bare currency-pair list.`;
  return {
    outcomeLine,
    rows,
    counts: {
      total: rows.length,
      eligible: eligible.length,
      excluded: excluded.length,
      catalogueOnly: catalogueOnly.length,
    },
    nothingEligible,
    advisoryDisclaimer: CORRIDOR_ADVISORY,
    provenance: surfaceProvenance("P2-W3"),
  };
}
