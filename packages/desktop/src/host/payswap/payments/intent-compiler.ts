/**
 * PaySwap Desktop (P13-C) — the mission→intent compiler.
 *
 * Compiles the nine captured intake fields PLUS the observation-grounded
 * locations into the canonical 11-field PaymentIntent (the ADVISORY
 * demand record — see ./adapters/economic-payment-intent.ts for the pin).
 *
 * THE COMPILATION LAWS:
 * - OBSERVATION-GROUNDED ORIGINS/DESTINATIONS ONLY (INV-7): the origin
 *   and destination are FundsLocationRefs derived from OBSERVED funding
 *   sources / destination references — a reference, never a balance, never
 *   custody. When no observation exists, the compile is BLOCKED with the
 *   typed reason — an observationRef is NEVER fabricated (a fabricated
 *   observation would be a fabricated corridor/account fact).
 * - NO GUESSED MONEY: the origin amount is the captured exact amount,
 *   verbatim; the arrival currency is the captured corridor destination
 *   currency, verbatim.
 * - DEADLINE → CONSTRAINTS: maxSettlementMs is derived from the captured
 *   deadline minus the declared-at instant (strictly positive — a passed
 *   deadline compiles nothing); maxRouteHops is the structural bound the
 *   runtime pins for a direct single-leg payment demand (composed routes
 *   are the route-compiler lane's territory, never a mission demand).
 * - LINEAGE: intentAuthorizationRef is the OPAQUE demand-registration
 *   lineage (the mission record); commerceRef is the mission's commerce
 *   context lineage. Neither establishes authorization — the authorization
 *   artifact (authorization-gate.ts) is minted LATER, against the preview.
 * - ADVISORY DEMAND ONLY: the compiled intent establishes no
 *   authorization and no financial finality.
 */

import {
  PaymentMissionError,
  type CompiledPaymentIntent,
  type PaymentIntakeCaptures,
} from "./contracts.js";
import {
  validateCanonicalPaymentIntent,
  type CanonicalPaymentIntent,
} from "./adapters/economic-payment-intent.js";

/** The structural hop bound for a direct single-leg payment demand. */
export const DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1;

/**
 * (P22-D, ADR-0016 D11 — the hop-bound law) The corridor demand's
 * structural hop bound: the MOVE/CONVERT direction classes ride the
 * corridor (the canonical 1..8 vocabulary's corridor allocation — the
 * pinned corridor demand's own bound, route-compiler/test/corridor-
 * fixtures.ts route5Intent). PAY (and RECEIVE) keep the direct bound
 * byte-identically — a direct demand never silently widens.
 */
export const CORRIDOR_MAX_ROUTE_HOPS = 6;

/** An observed funding source — a REFERENCE, never a balance (INV-7). */
export interface ObservedFundingSource {
  readonly locationRef: string;
  readonly currency: string;
  readonly observationRef: string;
  readonly displayName: string;
}

/** An observed destination — a REFERENCE, never a verified payee claim. */
export interface ObservedDestination {
  readonly locationRef: string;
  readonly currency: string;
  readonly observationRef: string;
  readonly displayName: string;
}

/** The compile input (everything explicit; nothing ambient, nothing defaulted). */
export interface CompileMissionIntentInput {
  readonly missionId: string;
  /** The mission's direction class (the D11 hop-bound derivation's input). */
  readonly direction: "PAY" | "RECEIVE" | "MOVE" | "CONVERT";
  readonly captured: PaymentIntakeCaptures;
  /** The principal reference (opaque; the trust plane owns identity). */
  readonly principalRef: string;
  /** The observed funding source the demand resolves to (gates supply it). */
  readonly observedFunding: ObservedFundingSource | undefined;
  /** The observed destination the demand resolves to (gates supply it). */
  readonly observedDestination: ObservedDestination | undefined;
  /** Declared-at instant (ISO-8601 UTC — explicit input, never ambient). */
  readonly declaredAt: string;
  /** Absolute expiry (ISO-8601 UTC; strictly after declaredAt). */
  readonly expiresAt: string;
}

/** The typed compile result — COMPILED or honestly BLOCKED, never a guess. */
export type CompileMissionIntentResult =
  | { readonly kind: "COMPILED"; readonly intent: CanonicalPaymentIntent }
  | { readonly kind: "BLOCKED"; readonly reasons: readonly string[] };

function toEpochMs(instant: string, field: string): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    throw new PaymentMissionError("INVALID_FIELD_VALUE", `${field} must be an ISO-8601 UTC instant`);
  }
  return ms;
}

/**
 * Compile the mission demand to the canonical 11-field PaymentIntent.
 * Fail-closed: a blocked compile returns the typed reasons verbatim; a
 * compiled record is validated against the canonical exact-keys law before
 * it leaves (the compiler can never emit a non-canonical intent).
 */
export function compileMissionIntent(
  input: CompileMissionIntentInput,
): CompileMissionIntentResult {
  const reasons: string[] = [];
  const funding = input.observedFunding;
  const destination = input.observedDestination;

  if (funding === undefined) {
    reasons.push(
      "No observed funding source exists for this mission — the intent origin is an observation-grounded funds-location reference, and no observation is available. An origin is never guessed and an observationRef is never fabricated.",
    );
  } else if (funding.currency !== input.captured.amountAndCurrency.currency) {
    reasons.push(
      `The observed funding source '${funding.displayName}' is in ${funding.currency}, but the captured amount is in ${input.captured.amountAndCurrency.currency} — the origin amount must match the origin location currency (no conversion is invented at compile time).`,
    );
  }
  if (destination === undefined) {
    reasons.push(
      "No observed destination exists for this mission — the intent destination is an observation-grounded funds-location reference, and no observation is available. A destination is never guessed and an observationRef is never fabricated.",
    );
  } else if (destination.currency !== input.captured.countryCorridor.destinationCurrency) {
    reasons.push(
      `The observed destination '${destination.displayName}' is in ${destination.currency}, but the captured corridor declares ${input.captured.countryCorridor.destinationCurrency} — the arrival currency must match the destination location currency (never silently reconciled).`,
    );
  }

  const declaredAtMs = toEpochMs(input.declaredAt, "declaredAt");
  const expiresAtMs = toEpochMs(input.expiresAt, "expiresAt");
  const deadlineMs = toEpochMs(input.captured.speedDeadline.deadlineAt, "speedDeadline.deadlineAt");
  const maxSettlementMs = deadlineMs - declaredAtMs;
  if (maxSettlementMs <= 0) {
    reasons.push(
      "The captured deadline is not after the declared-at instant — a passed deadline compiles nothing (maxSettlementMs must be positive).",
    );
  }
  if (expiresAtMs <= declaredAtMs) {
    reasons.push(
      "The intent expiry must be strictly after the declared-at instant — an already-expired window compiles nothing.",
    );
  }

  if (reasons.length > 0 || funding === undefined || destination === undefined) {
    return { kind: "BLOCKED", reasons };
  }

  const intentId = `pmt-intent:${input.missionId}`;
  const candidate: CompiledPaymentIntent = Object.freeze({
    intentId,
    principalRef: input.principalRef,
    origin: Object.freeze({
      locationRef: funding.locationRef,
      currency: funding.currency,
      observationRef: funding.observationRef,
    }),
    destination: Object.freeze({
      locationRef: destination.locationRef,
      currency: destination.currency,
      observationRef: destination.observationRef,
    }),
    originAmount: Object.freeze({
      currency: input.captured.amountAndCurrency.currency,
      minorUnits: input.captured.amountAndCurrency.minorUnits,
    }),
    arrivalCurrency: input.captured.countryCorridor.destinationCurrency,
    constraints: Object.freeze({
      maxSettlementMs,
      // (P22-D, ADR-0016 D11) The hop-bound law: the corridor classes
      // (MOVE/CONVERT) ride the corridor's structural bound; every other
      // direction keeps the direct single-leg bound byte-identically.
      maxRouteHops:
        input.direction === "MOVE" || input.direction === "CONVERT"
          ? CORRIDOR_MAX_ROUTE_HOPS
          : DIRECT_PAYMENT_MAX_ROUTE_HOPS,
    }),
    intentAuthorizationRef: `pmt-mission:${input.missionId}`,
    declaredAt: declaredAtMs,
    expiresAt: expiresAtMs,
    commerceRef: `pmt-mission:${input.missionId}`,
  });
  // The canonical exact-keys law, enforced at the boundary: the compiler
  // can never emit a non-canonical record (the mirror test additionally
  // proves the REAL @payswap/economic validator accepts it).
  const validated = validateCanonicalPaymentIntent(candidate);
  return { kind: "COMPILED", intent: validated };
}
