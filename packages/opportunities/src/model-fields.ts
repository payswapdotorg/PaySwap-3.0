/**
 * @payswap/opportunities — first-class field validators (P6-W2, lane
 * r4-w2; the field-validation section of the old
 * payswap.org@8a735bf packages/onchain-opportunities/src/model.ts, split
 * out under the 400-line file law).
 *
 * Fail-closed validators for the typed first-class fields: the rail
 * scope, the versioned supporting observations, the capital requirement,
 * the arbitrage legs, and the return-component/estimate family.
 */

import { InvalidOpportunityError } from "./errors.ts";
import { validateEvidenceFreshness } from "./freshness.ts";
import { isRationalZero, validateExactRational } from "./rational.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { isReturnComponentKind } from "./model.ts";
import type {
  ArbitrageLeg,
  CapitalRequirement,
  ExpectedReturnEstimate,
  ReturnComponent,
  SupportingObservation,
} from "./model.ts";
import {
  PINNED_ASSET_SYMBOL_PATTERN,
  PINNED_MINOR_UNIT_PATTERN,
  PINNED_RAIL_KEY_PATTERN,
  pinnedIsValidCapitalAssetRef,
} from "./pins/onchain-domain.ts";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function requireNonEmpty(value: unknown, label: string): string {
  if (!isNonEmptyString(value)) {
    throw new InvalidOpportunityError(
      `${label} must be a non-empty string`,
    );
  }
  return value;
}

/**
 * Validates the rail scope: a closed rail-kind vocabulary and the pinned
 * canonical `${namespace}:${network}` rail-key law. Accepts untyped
 * sources (the field values are validated, never trusted).
 */
export function validateRailScope(
  rail: { readonly railKind?: unknown; readonly railKey?: unknown },
): void {
  if (
    typeof rail.railKind !== "string" ||
    !["ONCHAIN", "FIAT", "FX"].includes(rail.railKind)
  ) {
    throw new InvalidOpportunityError(
      `rail.railKind must be one of [ONCHAIN, FIAT, FX] (got '${String(rail.railKind)}')`,
    );
  }
  if (
    typeof rail.railKey !== "string" ||
    !PINNED_RAIL_KEY_PATTERN.test(rail.railKey)
  ) {
    throw new InvalidOpportunityError(
      `rail.railKey '${String(rail.railKey)}' is not a canonical \`\${namespace}:\${network}\` rail key`,
    );
  }
}

/**
 * Validates one versioned supporting observation: non-empty identity and
 * provenance strings, a POSITIVE integer version (the versioned-evidence
 * law), a bounded freshness window and a NON-EMPTY evidence-ref list.
 */
export function validateSupportingObservation(
  observation: SupportingObservation,
  label: string,
): void {
  requireNonEmpty(observation.observationId, `${label}.observationId`);
  if (
    typeof observation.version !== "number" ||
    !Number.isSafeInteger(observation.version) ||
    observation.version < 1
  ) {
    throw new InvalidOpportunityError(
      `${label}.version must be a positive integer (the versioned-evidence law — a versionless observation is not pinned evidence)`,
    );
  }
  requireNonEmpty(observation.venueId, `${label}.venueId`);
  requireNonEmpty(observation.adapterId, `${label}.adapterId`);
  requireNonEmpty(observation.observerId, `${label}.observerId`);
  if (
    observation.protocolKey !== undefined &&
    !isNonEmptyString(observation.protocolKey)
  ) {
    throw new InvalidOpportunityError(
      `${label}.protocolKey, when present, must be a non-empty string`,
    );
  }
  validateEvidenceFreshness(observation.freshness, `${label}.freshness`);
  if (
    !Array.isArray(observation.evidenceRefs) ||
    observation.evidenceRefs.length === 0
  ) {
    throw new InvalidOpportunityError(
      `${label}.evidenceRefs is MANDATORY and non-empty: an observation without linked evidence is not evidence`,
    );
  }
  for (const ref of observation.evidenceRefs) {
    requireNonEmpty(ref, `${label}.evidenceRefs entry`);
  }
}

/** Validates the capital requirement (canonical rail asset ref + minor units). */
export function validateCapitalRequirement(
  capital: CapitalRequirement,
  railKey: string,
): void {
  requireNonEmpty(capital.assetRef, "capitalRequired.assetRef");
  // P22-C growth (ADR-0016 D3): BOTH the canonical two-segment form
  // (`${railKey}/asset:<SYMBOL>`) AND the issuer-scoped three-segment form
  // (`${railKey}/asset:<CODE>:<ISSUER_G>` — two issuers of the same code
  // are two assets) validate; every other shape fails closed.
  if (!pinnedIsValidCapitalAssetRef(railKey, capital.assetRef)) {
    throw new InvalidOpportunityError(
      `capitalRequired.assetRef '${capital.assetRef}' is not a canonical asset ref for rail '${railKey}' (expected \`${railKey}/asset:<SYMBOL>\` or the issuer-scoped \`${railKey}/asset:<CODE>:<ISSUER_G>\`)`,
    );
  }
  if (
    typeof capital.minorUnits !== "string" ||
    !PINNED_MINOR_UNIT_PATTERN.test(capital.minorUnits)
  ) {
    throw new InvalidOpportunityError(
      "capitalRequired.minorUnits must be a canonical non-negative integer decimal string (exact integer minor units)",
    );
  }
}

/** Validates one arbitrage leg (price, freshness, exit liquidity). */
export function validateArbitrageLeg(leg: ArbitrageLeg): void {
  requireNonEmpty(leg.legId, "arbitrage leg legId");
  requireNonEmpty(leg.venueId, `arbitrage leg '${leg.legId}' venueId`);
  validateExactRational(leg.price);
  if (isRationalZero(leg.price)) {
    throw new InvalidOpportunityError(
      `arbitrage leg '${leg.legId}': a venue price of exactly zero is malformed evidence (fail closed — never a fabricated zero spread)`,
    );
  }
  validateEvidenceFreshness(
    leg.freshness,
    `arbitrage leg '${leg.legId}' freshness`,
  );
  if (
    leg.withdrawalLiquidityMinorUnits !== null &&
    (typeof leg.withdrawalLiquidityMinorUnits !== "string" ||
      !PINNED_MINOR_UNIT_PATTERN.test(leg.withdrawalLiquidityMinorUnits))
  ) {
    throw new InvalidOpportunityError(
      `arbitrage leg '${leg.legId}': withdrawalLiquidityMinorUnits must be a canonical minor-unit string or null (UNKNOWN)`,
    );
  }
}

/** Validates one evidence-backed return component. */
export function validateReturnComponent(component: ReturnComponent): void {
  requireNonEmpty(component.componentId, "return component componentId");
  if (!isReturnComponentKind(component.kind)) {
    throw new InvalidOpportunityError(
      `return component '${component.componentId}': kind must be one of [FEE_YIELD, INCENTIVE_YIELD, STAKING_YIELD, SUPPLY_APY, PRICE_DIFFERENCE]`,
    );
  }
  validateExactRational(component.ratePerYear);
  if (typeof component.evidenceVerified !== "boolean") {
    throw new InvalidOpportunityError(
      `return component '${component.componentId}': evidenceVerified must be a boolean`,
    );
  }
  if (
    component.budgetReserved !== undefined &&
    typeof component.budgetReserved !== "boolean"
  ) {
    throw new InvalidOpportunityError(
      `return component '${component.componentId}': budgetReserved, when present, must be a boolean`,
    );
  }
  if (
    component.kind !== "INCENTIVE_YIELD" &&
    component.budgetReserved !== undefined
  ) {
    throw new InvalidOpportunityError(
      `return component '${component.componentId}': budgetReserved applies to incentive components only`,
    );
  }
  assertNoGuaranteeLanguage(
    component.description,
    `return component '${component.componentId}'.description`,
  );
}

/**
 * Validates the expected-return estimate. The honest UNKNOWN case (point
 * AND bounds null — no verified components) is legal and only requires an
 * honest, vocabulary-scanned basis; an estimate with a point but no
 * bounds is a CLAIM and fails closed.
 */
export function validateEstimate(estimate: ExpectedReturnEstimate): void {
  if (estimate.estimateKind !== "EVIDENCE_BACKED_ESTIMATE") {
    throw new InvalidOpportunityError(
      `expectedReturn.estimateKind must be 'EVIDENCE_BACKED_ESTIMATE' — the estimate is never a claim (got '${String(estimate.estimateKind)}')`,
    );
  }
  for (const component of estimate.components) {
    validateReturnComponent(component);
  }
  if (estimate.point === null && estimate.bounds === null) {
    // Honest UNKNOWN estimate: no verified components. The basis must say so.
    assertNoGuaranteeLanguage(estimate.basis, "expectedReturn.basis");
    return;
  }
  if (estimate.point === null || estimate.bounds === null) {
    throw new InvalidOpportunityError(
      "expectedReturn: point and bounds are set together or null together (an estimate without bounds is a claim — the uncertainty bounds are mandatory)",
    );
  }
  validateExactRational(estimate.point);
  validateExactRational(estimate.bounds.low);
  validateExactRational(estimate.bounds.high);
  assertNoGuaranteeLanguage(estimate.basis, "expectedReturn.basis");
}
