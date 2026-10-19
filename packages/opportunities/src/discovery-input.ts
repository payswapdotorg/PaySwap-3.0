/**
 * @payswap/opportunities — discovery input validation (P6-W2, lane r4-w2;
 * the input-validation section of the old discovery.ts, split out under
 * the file law).
 *
 * Fail-closed validation of an OpportunityObservationInput BEFORE
 * anything is constructed: closed family/rail vocabularies, the pinned
 * rail-key law, the versioned-evidence law (positive observation
 * version), bounded freshness, the NON-EMPTY evidence chain, the
 * vocabulary law on every surface, and the family-scoped laws (exactly
 * two arbitrage legs; PRICE_DIFFERENCE is derived, never supplied;
 * non-arbitrage families need >= 1 observed component; "other" carries
 * its policy approval reference).
 */

import { OpportunityDiscoveryError } from "./errors.ts";
import { validateEvidenceFreshness } from "./freshness.ts";
import { validateExactRational } from "./rational.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { isOpportunityFamily, isRailKind } from "./model.ts";
import type { SupportingObservation } from "./model.ts";
import {
  PINNED_ASSET_SYMBOL_PATTERN,
  PINNED_MINOR_UNIT_PATTERN,
  PINNED_RAIL_KEY_PATTERN,
} from "./pins/onchain-domain.ts";
import type { OpportunityObservationInput } from "./discovery.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Validates one additional supporting observation of the input lineage. */
export function validateSupportingObservationInput(
  observation: SupportingObservation,
  label: string,
): void {
  const errors: string[] = [];
  if (!isNonEmptyString(observation.observationId)) {
    errors.push(`${label}.observationId must be a non-empty string`);
  }
  if (
    typeof observation.version !== "number" ||
    !Number.isSafeInteger(observation.version) ||
    observation.version < 1
  ) {
    errors.push(
      `${label}.version must be a positive integer (versioned evidence)`,
    );
  }
  for (const field of ["venueId", "adapterId", "observerId"] as const) {
    if (!isNonEmptyString(observation[field])) {
      errors.push(`${label}.${field} must be a non-empty string`);
    }
  }
  if (
    observation.protocolKey !== undefined &&
    !isNonEmptyString(observation.protocolKey)
  ) {
    errors.push(
      `${label}.protocolKey, when present, must be a non-empty string`,
    );
  }
  if (errors.length > 0) {
    throw new OpportunityDiscoveryError(
      `Invalid supporting observation: ${errors.join("; ")}`,
    );
  }
  validateEvidenceFreshness(observation.freshness, `${label}.freshness`);
  if (
    !Array.isArray(observation.evidenceRefs) ||
    observation.evidenceRefs.length === 0
  ) {
    throw new OpportunityDiscoveryError(
      `${label}.evidenceRefs must be a non-empty array (an observation without linked evidence is not evidence)`,
    );
  }
}

/**
 * Fail-closed validation of the discovery input (see the module law
 * above). Throws `OpportunityDiscoveryError` naming EVERY failed field.
 */
export function validateDiscoveryInput(
  input: OpportunityObservationInput,
): void {
  const errors: string[] = [];
  if (!isOpportunityFamily(input.family)) {
    errors.push("family must be one of the six opportunity families");
  }
  for (const field of [
    "observationId",
    "venueId",
    "adapterId",
    "observerId",
  ] as const) {
    if (!isNonEmptyString(input[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (
    typeof input.observationVersion !== "number" ||
    !Number.isSafeInteger(input.observationVersion) ||
    input.observationVersion < 1
  ) {
    errors.push(
      "observationVersion must be a positive integer (the versioned-evidence law — a versionless observation is not pinned evidence)",
    );
  }
  if (!isRailKind(input.railKind)) {
    errors.push("railKind must be one of [ONCHAIN, FIAT, FX]");
  }
  if (
    typeof input.railKey !== "string" ||
    !PINNED_RAIL_KEY_PATTERN.test(input.railKey)
  ) {
    errors.push(
      "railKey must be a canonical `${namespace}:${network}` rail key",
    );
  }
  try {
    validateEvidenceFreshness(input.freshness, "freshness");
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : "freshness must be { asOfMs, maxAgeMs } with a positive maxAgeMs (the observation law)",
    );
  }
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) {
    errors.push(
      "evidenceRefs is MANDATORY and non-empty (an observation without linked evidence is not evidence)",
    );
  }
  for (const surface of [input.title, input.description]) {
    if (!isNonEmptyString(surface)) {
      errors.push("title and description must be non-empty strings");
      break;
    }
  }
  if (errors.length > 0) {
    throw new OpportunityDiscoveryError(
      `Invalid opportunity observation input: ${errors.join("; ")}`,
    );
  }

  // Vocabulary law on the input's human-readable surfaces.
  assertNoGuaranteeLanguage(input.title, "observation input title");
  assertNoGuaranteeLanguage(
    input.description,
    "observation input description",
  );
  assertNoGuaranteeLanguage(
    input.exitPath.description,
    "observation input exitPath.description",
  );
  for (const constraint of input.exitPath.constraints) {
    assertNoGuaranteeLanguage(
      constraint,
      "observation input exitPath.constraints entry",
    );
  }
  assertNoGuaranteeLanguage(
    input.smartContractRisk.summary,
    "smartContractRisk.summary",
  );
  assertNoGuaranteeLanguage(
    input.oracleBridgeRisk.summary,
    "oracleBridgeRisk.summary",
  );

  // The versioned supporting-observation lineage.
  if (input.additionalSupportingObservations !== undefined) {
    for (const observation of input.additionalSupportingObservations) {
      validateSupportingObservationInput(
        observation,
        "additionalSupportingObservations entry",
      );
    }
  }

  if (input.capitalRequired !== undefined) {
    const symbol = input.capitalRequired.assetRef.startsWith(
      `${input.railKey}/asset:`,
    )
      ? input.capitalRequired.assetRef.substring(
          `${input.railKey}/asset:`.length,
        )
      : "";
    if (
      !isNonEmptyString(input.capitalRequired.assetRef) ||
      symbol === "" ||
      !PINNED_ASSET_SYMBOL_PATTERN.test(symbol) ||
      typeof input.capitalRequired.minorUnits !== "string" ||
      !PINNED_MINOR_UNIT_PATTERN.test(input.capitalRequired.minorUnits)
    ) {
      throw new OpportunityDiscoveryError(
        "capitalRequired, when present, must be { assetRef: `${railKey}/asset:<SYMBOL>`, minorUnits } (exact integer minor units)",
      );
    }
  }
  if (input.liquidity !== undefined) {
    for (const field of [
      "depthMinorUnits",
      "withdrawalLiquidityMinorUnits",
    ] as const) {
      const value = input.liquidity[field];
      if (
        value !== null &&
        (typeof value !== "string" || !PINNED_MINOR_UNIT_PATTERN.test(value))
      ) {
        throw new OpportunityDiscoveryError(
          `liquidity.${field} must be a canonical minor-unit string or null (UNKNOWN surfaced honestly)`,
        );
      }
    }
  }
  if (input.maxLoss !== undefined) {
    validateExactRational(input.maxLoss.fractionOfCapital);
  }
  if (input.executionCostFraction !== undefined) {
    validateExactRational(input.executionCostFraction);
  }

  // Family-scoped input laws.
  if (input.family === "arbitrage") {
    if (!Array.isArray(input.arbitrageLegs) || input.arbitrageLegs.length !== 2) {
      throw new OpportunityDiscoveryError(
        "an arbitrage observation requires exactly two venue price legs (the two sides of the price difference)",
      );
    }
    for (const leg of input.arbitrageLegs) {
      if (!isNonEmptyString(leg.legId) || !isNonEmptyString(leg.venueId)) {
        throw new OpportunityDiscoveryError(
          "every arbitrage leg must carry a non-empty legId and venueId",
        );
      }
      validateExactRational(leg.price);
    }
  }
  if (input.family !== "arbitrage") {
    if (
      !Array.isArray(input.returnComponents) ||
      input.returnComponents.length === 0
    ) {
      throw new OpportunityDiscoveryError(
        `a '${input.family}' observation requires at least one observed return component (empty evidence is not an estimate)`,
      );
    }
    for (const component of input.returnComponents) {
      if (!isNonEmptyString(component.componentId)) {
        throw new OpportunityDiscoveryError(
          "every return component must carry a non-empty componentId",
        );
      }
      validateExactRational(component.ratePerYear);
      if (component.kind === "PRICE_DIFFERENCE") {
        throw new OpportunityDiscoveryError(
          `the PRICE_DIFFERENCE component kind is derived by arbitrage discovery, never supplied directly (component '${component.componentId}')`,
        );
      }
      assertNoGuaranteeLanguage(
        component.description,
        `return component '${component.componentId}'.description`,
      );
    }
  }
  if (
    input.family === "other" &&
    input.policyApprovalRef !== undefined &&
    !isNonEmptyString(input.policyApprovalRef)
  ) {
    throw new OpportunityDiscoveryError(
      "policyApprovalRef, when present, must be a non-empty string",
    );
  }
}
