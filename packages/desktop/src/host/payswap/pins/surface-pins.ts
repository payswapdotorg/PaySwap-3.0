/**
 * PaySwap Desktop (P7-W2) — structural pins of the @payswap/surface
 * versioning, outcome-action, amount and money-view contracts (mirrors
 * packages/surface/src/{version,outcomes,amount-spec,money-view}.ts at the
 * base commit recorded in pin-registry.ts; pins surface.versioning,
 * surface.outcomes, surface.money-view).
 *
 * PIN LAW: shapes and closed vocabularies mirror the accepted contract
 * EXACTLY — including the AmountSpec wire pin (currency + canonical
 * non-negative integer minor-units decimal string) — the desktop product
 * re-derives nothing and invents nothing. Guards are structural only; the
 * mirrored package owns the semantics and all financial truth.
 */

import type { DesktopPinProvenance } from "./pin-registry.js";
import { DESKTOP_PIN_PROVENANCE } from "./pin-registry.js";

// ---------------------------------------------------------------------------
// Versioning (pin surface.versioning)
// ---------------------------------------------------------------------------

/** Mirrors SURFACE_API_VERSION (@payswap/surface, P2-W3). */
export const PINNED_SURFACE_API_VERSION = "1.0.0" as const;

/** Mirrors SurfaceStability. */
export type PinnedSurfaceStability = "stable" | "experimental";

/** Mirrors SurfaceContractProvenance. */
export interface PinnedSurfaceProvenance {
  readonly surfaceApiVersion: typeof PINNED_SURFACE_API_VERSION;
  readonly stability: PinnedSurfaceStability;
  readonly workOrder: string;
}

/** Mirrors surfaceProvenance(workOrder) — tag a fold with its contract provenance. */
export function pinnedSurfaceProvenance(
  workOrder: string,
  stability: PinnedSurfaceStability = "stable",
): PinnedSurfaceProvenance {
  return {
    surfaceApiVersion: PINNED_SURFACE_API_VERSION,
    stability,
    workOrder,
  };
}

// ---------------------------------------------------------------------------
// AmountSpec — the pinned cross-lane money wire shape (pin surface.money-view)
// ---------------------------------------------------------------------------

/** Mirrors AmountSpec: exact monetary amount on the wire (integer minor units). */
export interface PinnedAmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/** Mirrors the AmountSpec currency pattern (/^[A-Z]{3}$/). */
export const PINNED_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Mirrors the AmountSpec minor-units pattern (canonical decimal integer string). */
export const PINNED_MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/**
 * Structural validation of the pinned AmountSpec wire format (mirrors
 * validateSurfaceAmountSpec semantics; fail-closed).
 */
export function validatePinnedAmountSpec(amount: PinnedAmountSpec): void {
  if (amount === null || typeof amount !== "object") {
    throw new Error("validatePinnedAmountSpec: amount must be an AmountSpec object");
  }
  if (!PINNED_CURRENCY_PATTERN.test(amount.currency)) {
    throw new Error(
      `validatePinnedAmountSpec: currency must match /^[A-Z]{3}$/ — got ${JSON.stringify(amount.currency)}`,
    );
  }
  if (!PINNED_MINOR_UNITS_PATTERN.test(amount.minorUnits)) {
    throw new Error(
      `validatePinnedAmountSpec: minorUnits must be a canonical non-negative decimal integer string — got ${JSON.stringify(amount.minorUnits)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Money display inputs (pin surface.money-view)
// ---------------------------------------------------------------------------

/** Mirrors DisplayLocaleInput — locale data as explicit inputs, never ambient. */
export interface PinnedDisplayLocaleInput {
  readonly thousandsSeparator?: string;
  readonly decimalSeparator?: string;
  readonly groupSize?: number;
}

/** Mirrors MoneyDisplayInput — all display context as EXPLICIT INPUTS. */
export interface PinnedMoneyDisplayInput {
  readonly currencyDigits?: ReadonlyMap<string, number>;
  readonly locale?: PinnedDisplayLocaleInput;
}

/** Mirrors MinorUnitDigitsSource — how digits were resolved (honest, labeled). */
export type PinnedMinorUnitDigitsSource =
  | { readonly kind: "input-registry"; readonly code: string; readonly digits: number }
  | { readonly kind: "fallback-assumed-2"; readonly code: string; readonly digits: 2 };

// ---------------------------------------------------------------------------
// Outcome actions (pin surface.outcomes)
// ---------------------------------------------------------------------------

/** Mirrors OutcomeActionId — the five outcome actions, fixed and versioned. */
export const PINNED_OUTCOME_ACTION_IDS = ["pay", "receive", "move", "convert", "checkout"] as const;

export type PinnedOutcomeActionId = (typeof PINNED_OUTCOME_ACTION_IDS)[number];

/** Mirrors OutcomeDispatchAuthority — where a journey REALLY executes. */
export interface PinnedOutcomeDispatchAuthority {
  readonly authority: "economic-intent-plane" | "quote-projection-plane" | "merchant-checkout-plane";
  readonly intentKind: "MoneyMovementIntent" | "PaymentIntent" | "ServiceAccessIntent";
  readonly journeyId: string;
  readonly topologyNote: string;
}

/** Mirrors OutcomeCapabilityState — the honest dispatchability fact. */
export interface PinnedOutcomeCapabilityState {
  readonly dispatchable: boolean;
  readonly missingPrerequisite?: string;
}

/** Mirrors OutcomeDeploymentContext — facts about configured authority planes. */
export interface PinnedOutcomeDeploymentContext {
  readonly economicIntakeConfigured: boolean;
  readonly capabilityObservationsAvailable: boolean;
  readonly merchantCheckoutContextBound: boolean;
}

/**
 * The desktop's pinned record of one outcome action — the DATA half of the
 * mirrored OutcomeAction. The capability fold lives in the desktop product
 * layer and folds the pinned deployment-context facts against the pinned
 * capability law (each action's prerequisite plane).
 */
export interface PinnedOutcomeActionRecord {
  readonly id: PinnedOutcomeActionId;
  readonly label: string;
  readonly outcomeLine: string;
  readonly advancedDisclosure: readonly string[];
  readonly dispatch: PinnedOutcomeDispatchAuthority;
  readonly provenance: PinnedSurfaceProvenance;
}

// ---------------------------------------------------------------------------
// Guards (closed vocabularies, fail-closed)
// ---------------------------------------------------------------------------

/** Guard: a value is one of the pinned outcome action ids. */
export function isPinnedOutcomeActionId(value: unknown): value is PinnedOutcomeActionId {
  return (
    typeof value === "string" &&
    (PINNED_OUTCOME_ACTION_IDS as readonly unknown[]).includes(value)
  );
}

/** Guard: a value structurally satisfies PinnedAmountSpec (wire check). */
export function isPinnedAmountSpec(value: unknown): value is PinnedAmountSpec {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<PinnedAmountSpec>;
  return (
    typeof candidate.currency === "string" &&
    PINNED_CURRENCY_PATTERN.test(candidate.currency) &&
    typeof candidate.minorUnits === "string" &&
    PINNED_MINOR_UNITS_PATTERN.test(candidate.minorUnits)
  );
}

/** The desktop pin provenance view (stamped on every product fold). */
export interface SurfacePinStamp {
  readonly surfaceApiVersion: typeof PINNED_SURFACE_API_VERSION;
  readonly pin: DesktopPinProvenance;
}

/** The stamp every surface-derived desktop view carries. */
export const SURFACE_PIN_STAMP: SurfacePinStamp = Object.freeze({
  surfaceApiVersion: PINNED_SURFACE_API_VERSION,
  pin: DESKTOP_PIN_PROVENANCE,
});
