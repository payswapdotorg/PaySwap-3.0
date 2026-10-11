/**
 * @payswap/surface — capability/operation discovery projections (P2-W3).
 *
 * NET-NEW module implementing the work order's CAPABILITY/OPERATION
 * DISCOVERY PROJECTIONS: what the user can do next + why (eligibility
 * reasons, required fields, limits) as versioned projections over
 * capability-shaped data.
 *
 * STRUCTURAL PIN (the work order's law): the sibling lane P2-W1
 * (packages/capability, IN FLIGHT) owns the real capability-fabric
 * contracts. This module pins what the fold reads as an OPAQUE, versioned
 * projection (typed envelope with explicit content); the TL wires imports
 * at integration. No import from any sibling package exists or may exist
 * while lanes are in flight.
 *
 * LAWS enforced here (canonical):
 * - INV-13 (catalogue capability is not executable connected capability):
 *   an operation with no connectedInstanceId CANNOT be offered as
 *   executable — the fold refuses `eligible: true` without a connection
 *   (fail-closed).
 * - INV-10 (discovery output cannot directly authorize execution): every
 *   view carries the advisory disclaimer; eligible operations are labeled
 *   candidates, never authorizations.
 * - Honest disclosure (ported discipline from the old convert-preview
 *   fold): ineligible operations are listed with their typed reasons —
 *   never silently dropped; the all-ineligible case leads with the honest
 *   fact, never a failure tone.
 */

import { requireSurfaceAmountSpec, type AmountSpec } from "./amount-spec.ts";
import { formatMoneyAmount, type MoneyDisplayInput } from "./money-view.ts";
import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** Raised when a discovery source is invalid (fail-closed). */
export class InvalidDiscoverySourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDiscoverySourceError";
  }
}

/** State of one required field for an operation. */
export type RequiredFieldState = "PROVIDED" | "MISSING" | "NOT_APPLICABLE";

/** One required field of an operation (people-language + state + when). */
export interface OperationRequiredField {
  readonly fieldId: string;
  readonly label: string;
  readonly state: RequiredFieldState;
  /** When this field is required (e.g. "for business recipients in this corridor"). */
  readonly requiredWhen: string;
}

/** Amount bounds for an operation (displayed verbatim — never a surface-side check). */
export interface OperationLimits {
  readonly minAmount?: AmountSpec;
  readonly maxAmount?: AmountSpec;
  readonly note?: string;
}

/** Freshness of the provider observation behind an operation. */
export interface ObservationFreshness {
  readonly observedAt: string;
  readonly version: string;
}

/**
 * What the fold reads from capability-shaped data (STRUCTURAL pin of the
 * P2-W1 sibling-lane contract — opaque here, TL-wired at integration).
 */
export interface CapabilityOperationSource {
  /** Operation identity within the capability fabric (e.g. "payout.send"). */
  readonly operationId: string;
  /** CapabilityDefinition identity (P2-W1 canonical hierarchy). */
  readonly capabilityId: string;
  /** ProviderImplementation identity, when known. */
  readonly implementationId?: string;
  /**
   * ConnectedCapabilityInstance identity. ABSENT for catalogue-only rows —
   * and a catalogue-only row can never be offered as executable (INV-13).
   */
  readonly connectedInstanceId?: string;
  /** People-language label of what the user can do. */
  readonly operationLabel: string;
  /** Whether the operation is currently eligible. */
  readonly eligible: boolean;
  /** Why (or why not) — typed reasons, rendered verbatim. */
  readonly eligibilityReasons: readonly {
    readonly code: string;
    readonly dimension: string;
    readonly detail: string;
  }[];
  readonly requiredFields: readonly OperationRequiredField[];
  readonly limits?: OperationLimits;
  readonly freshness?: ObservationFreshness;
}

/** Explicit fold inputs. */
export interface DiscoveryFoldInput {
  /** Display context for exact money formatting of limit bounds. */
  readonly display: MoneyDisplayInput;
}

/** One operation's view (eligible or not — never silently dropped). */
export interface OperationDiscoveryRow {
  readonly operationId: string;
  readonly capabilityId: string;
  readonly implementationId?: string;
  readonly connectedInstanceId?: string;
  readonly operationLabel: string;
  readonly eligible: boolean;
  /** true when the row is catalogue-only (never executable). */
  readonly catalogueOnly: boolean;
  /** Why this is or is not available, one line per reason. */
  readonly reasons: readonly string[];
  readonly requiredFields: readonly {
    readonly fieldId: string;
    readonly label: string;
    readonly state: RequiredFieldState;
    readonly requiredWhen: string;
  }[];
  readonly limits?:
    | { readonly kind: "DECLARED"; readonly note: string }
    | { readonly kind: "NONE_DECLARED"; readonly note: string };
  readonly freshness?: ObservationFreshness;
}

/** The full operation-discovery view. */
export interface OperationDiscoveryView {
  /** The SIMPLE outcome line (progressive disclosure level 1). */
  readonly outcomeLine: string;
  /** Eligible operations — what the user can do next (candidates, never authorizations). */
  readonly available: readonly OperationDiscoveryRow[];
  /** Ineligible operations with their typed reasons — never silently dropped. */
  readonly unavailable: readonly OperationDiscoveryRow[];
  /** Counts behind the headline. */
  readonly counts: {
    readonly total: number;
    readonly eligible: number;
    readonly ineligible: number;
    readonly catalogueOnly: number;
  };
  /** True when NOTHING is eligible — the honest headline leads with that fact (not a failure tone). */
  readonly nothingAvailable: boolean;
  /** The advisory disclaimer (INV-10) — carried on every discovery view. */
  readonly advisoryDisclaimer: string;
  readonly provenance: SurfaceContractProvenance;
}

const ADVISORY_DISCLAIMER =
  "Discovery output cannot directly authorize execution (INV-10). Every eligible operation is a candidate, not an authorization; consequential paths go through eligibility, policy, security, PaySwap authorization and the financial protocol — never through this view.";

function validateOperation(source: CapabilityOperationSource): void {
  if (typeof source.operationId !== "string" || source.operationId.length === 0) {
    throw new InvalidDiscoverySourceError("operationId must be a non-empty string");
  }
  if (typeof source.capabilityId !== "string" || source.capabilityId.length === 0) {
    throw new InvalidDiscoverySourceError(`operations[${source.operationId}]: capabilityId must be non-empty`);
  }
  if (typeof source.operationLabel !== "string" || source.operationLabel.length === 0) {
    throw new InvalidDiscoverySourceError(`operations[${source.operationId}]: operationLabel must be non-empty`);
  }
  if (source.eligible && !source.connectedInstanceId) {
    throw new InvalidDiscoverySourceError(
      `operations[${source.operationId}]: eligible without a connectedInstanceId — catalogue support alone cannot make an operation executable (INV-13)`,
    );
  }
  if (source.limits?.minAmount !== undefined) {
    requireSurfaceAmountSpec(source.limits.minAmount, `operations[${source.operationId}].limits.minAmount`);
  }
  if (source.limits?.maxAmount !== undefined) {
    requireSurfaceAmountSpec(source.limits.maxAmount, `operations[${source.operationId}].limits.maxAmount`);
  }
}

/** The declared/none-declared limits view value (never undefined). */
export type OperationLimitsView =
  | { readonly kind: "DECLARED"; readonly note: string }
  | { readonly kind: "NONE_DECLARED"; readonly note: string };

function limitsView(
  limits: OperationLimits | undefined,
  operationId: string,
  display: MoneyDisplayInput,
): OperationLimitsView {
  if (limits === undefined) {
    return {
      kind: "NONE_DECLARED",
      note: "No limits declared for this operation — the surface displays declared limits, never invents them.",
    };
  }
  const parts: string[] = [];
  if (limits.minAmount !== undefined) {
    parts.push(`at least ${formatMoneyAmount(limits.minAmount, display)}`);
  }
  if (limits.maxAmount !== undefined) {
    parts.push(`at most ${formatMoneyAmount(limits.maxAmount, display)}`);
  }
  const bounds = parts.length > 0 ? parts.join(" and ") : "no amount bounds declared";
  const note = limits.note !== undefined ? `${bounds} — ${limits.note}` : bounds;
  return { kind: "DECLARED", note: `${note} (declared by the capability authority for ${operationId})` };
}

function rowView(source: CapabilityOperationSource, display: MoneyDisplayInput): OperationDiscoveryRow {
  return {
    operationId: source.operationId,
    capabilityId: source.capabilityId,
    ...(source.implementationId !== undefined ? { implementationId: source.implementationId } : {}),
    ...(source.connectedInstanceId !== undefined
      ? { connectedInstanceId: source.connectedInstanceId }
      : {}),
    operationLabel: source.operationLabel,
    eligible: source.eligible,
    catalogueOnly: source.connectedInstanceId === undefined,
    reasons: source.eligibilityReasons.map(
      (reason) => `${reason.dimension} [${reason.code}]: ${reason.detail}`,
    ),
    requiredFields: source.requiredFields.map((field) => ({
      fieldId: field.fieldId,
      label: field.label,
      state: field.state,
      requiredWhen: field.requiredWhen,
    })),
    limits: limitsView(source.limits, source.operationId, display),
    ...(source.freshness !== undefined ? { freshness: source.freshness } : {}),
  };
}

/**
 * Fold capability-shaped operations into the discovery view. Pure: same
 * input, same view. Fail-closed: catalogue-only rows cannot claim
 * eligibility (INV-13); malformed rows throw.
 */
export function foldOperationDiscovery(
  operations: readonly CapabilityOperationSource[],
  input: DiscoveryFoldInput,
): OperationDiscoveryView {
  for (const source of operations) {
    validateOperation(source);
  }
  const rows = operations.map((source) => rowView(source, input.display));
  const available = rows.filter((row) => row.eligible);
  const unavailable = rows.filter((row) => !row.eligible);
  const catalogueOnly = rows.filter((row) => row.catalogueOnly);
  const nothingAvailable = available.length === 0;
  const outcomeLine = nothingAvailable
    ? `Nothing available right now — ${rows.length} operation${rows.length === 1 ? "" : "s"} recorded and every one is honestly listed as unavailable with its reasons; nothing was silently dropped.`
    : `${available.length} operation${available.length === 1 ? "" : "s"} available${
        unavailable.length > 0
          ? `, ${unavailable.length} unavailable (reasons on drill-down)`
          : ""
      } — what you can do next, and why.`;
  return {
    outcomeLine,
    available,
    unavailable,
    counts: {
      total: rows.length,
      eligible: available.length,
      ineligible: unavailable.length,
      catalogueOnly: catalogueOnly.length,
    },
    nothingAvailable,
    advisoryDisclaimer: ADVISORY_DISCLAIMER,
    provenance: surfaceProvenance("P2-W3"),
  };
}
