/**
 * @payswap/opportunities — FinancialOpportunity record validation (P6-W2,
 * lane r4-w2; ADAPTED from payswap.org@8a735bf
 * packages/onchain-opportunities/src/model.ts validation section —
 * provenance upgraded to the VERSIONED lineage law; field validators
 * split into ./model-fields.ts and ./model-validation-sections.ts under
 * the file law).
 *
 * Runtime validation from untyped sources: fails closed on EVERY mandated
 * field, scans EVERY human-readable surface, validates every rational and
 * freshness window, enforces the lineage coherence laws, re-derives the
 * deterministic identity; a valid opportunity is returned deep-frozen.
 */

import { InvalidOpportunityError } from "./errors.ts";
import { validateExactRational } from "./rational.ts";
import { validateKnowable } from "./knowable.ts";
import { assertNoGuaranteeLanguage } from "./vocabulary.ts";
import { DISCOVERY_TIER } from "./discovery-tier.ts";
import { isOpportunityFamily, opportunityId } from "./model.ts";
import type {
  CapitalRequirement,
  ExpectedReturnEstimate,
  FeeSchedule,
  FinancialOpportunity,
  LiquidityProfile,
  SupportingObservation,
} from "./model.ts";
import { PINNED_MINOR_UNIT_PATTERN } from "./pins/onchain-domain.ts";
import {
  isNonEmptyString,
  validateCapitalRequirement,
  validateRailScope,
} from "./model-fields.ts";
import { validateEstimate } from "./model-fields.ts";
import {
  collectAssessmentErrors,
  collectLineageErrors,
  collectPolicyErrors,
} from "./model-validation-sections.ts";

/**
 * Runtime validation of a FinancialOpportunity from untyped sources (the
 * module law above): fail-closed on every field, full lineage coherence,
 * deterministic identity re-derivation, deep-frozen output.
 */
export function validateFinancialOpportunity(
  candidate: unknown,
): FinancialOpportunity {
  const errors: string[] = [];
  if (candidate === null || typeof candidate !== "object") {
    throw new InvalidOpportunityError(
      "a financial opportunity must be an object",
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;

  if (record.observationKind !== "FinancialOpportunity") {
    errors.push(
      "observationKind must be 'FinancialOpportunity' (nominal separation from every execution/authority shape)",
    );
  }
  if (record.discoveryTier !== DISCOVERY_TIER) {
    errors.push(
      `discoveryTier must be '${DISCOVERY_TIER}' (the structural never-authorization tier is mandatory on every opportunity)`,
    );
  }
  const family = isOpportunityFamily(record.family)
    ? record.family
    : undefined;
  if (family === undefined) {
    errors.push(
      "family must be one of [liquidity, lending, staking, incentives, arbitrage, other]",
    );
  }
  if (!isNonEmptyString(record.opportunityId)) {
    errors.push("opportunityId must be a non-empty string");
  }

  // The rail scope (the across-rails law).
  const rail = record.rail;
  let railKey: string | undefined;
  if (rail === null || typeof rail !== "object") {
    errors.push("rail must be a RailScope { railKind, railKey }");
  } else {
    try {
      validateRailScope(rail as { railKind: unknown; railKey: unknown });
      railKey = (rail as { railKey: string }).railKey;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Human-readable surfaces: the no-guaranteed-returns law is structural.
  for (const label of ["title", "description"] as const) {
    const surface = record[label];
    if (!isNonEmptyString(surface)) {
      errors.push(`${label} must be a non-empty string`);
    } else {
      try {
        assertNoGuaranteeLanguage(surface, label);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  // capitalRequired
  try {
    const capital = record.capitalRequired;
    if (capital === null || typeof capital !== "object") {
      throw new InvalidOpportunityError(
        "capitalRequired must be a Knowable (KNOWN or UNKNOWN)",
      );
    }
    validateKnowable(
      capital as { kind: "KNOWN"; value: CapitalRequirement },
      "capitalRequired",
      (value) => {
        if (railKey !== undefined) {
          validateCapitalRequirement(value, railKey);
        }
      },
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // expectedReturn
  try {
    if (
      record.expectedReturn === null ||
      typeof record.expectedReturn !== "object"
    ) {
      throw new InvalidOpportunityError(
        "expectedReturn must be an ExpectedReturnEstimate",
      );
    }
    validateEstimate(record.expectedReturn as ExpectedReturnEstimate);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // liquidity
  const liquidity = record.liquidity;
  if (liquidity === null || typeof liquidity !== "object") {
    errors.push("liquidity must be a LiquidityProfile");
  } else {
    for (const field of [
      "depthMinorUnits",
      "withdrawalLiquidityMinorUnits",
    ] as const) {
      const value = (liquidity as LiquidityProfile)[field];
      if (
        value !== null &&
        (typeof value !== "string" || !PINNED_MINOR_UNIT_PATTERN.test(value))
      ) {
        errors.push(
          `liquidity.${field} must be a canonical minor-unit string or null (UNKNOWN surfaced honestly)`,
        );
      }
    }
  }

  // fees
  try {
    const fees = record.fees;
    if (fees === null || typeof fees !== "object") {
      throw new InvalidOpportunityError(
        "fees must be a Knowable (KNOWN or UNKNOWN)",
      );
    }
    validateKnowable(
      fees as { kind: "KNOWN"; value: FeeSchedule },
      "fees",
      (value) => {
        validateExactRational(value.entryFeeFraction);
        validateExactRational(value.exitFeeFraction);
        validateExactRational(value.ongoingFeeFractionPerYear);
      },
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // The assessment, lineage and policy sections (collected in full).
  errors.push(...collectAssessmentErrors(record));
  errors.push(...collectLineageErrors(record));
  errors.push(...collectPolicyErrors(record));

  // deterministic identity
  if (
    family !== undefined &&
    railKey !== undefined &&
    isNonEmptyString(record.opportunityId) &&
    record.primaryObservation !== null &&
    typeof record.primaryObservation === "object"
  ) {
    const primary = record.primaryObservation as SupportingObservation;
    if (
      isNonEmptyString(primary.observationId) &&
      isNonEmptyString(primary.venueId)
    ) {
      const expected = opportunityId(
        family,
        railKey,
        primary.venueId,
        primary.observationId,
      );
      if (record.opportunityId !== expected) {
        errors.push(
          `opportunity identity is deterministic: opportunityId must be '${expected}'`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new InvalidOpportunityError(
      `Invalid financial opportunity: ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }

  return deepFreezeOpportunity(candidate as FinancialOpportunity);
}

/** Deep-freezes plain data (bigint-safe) so published opportunities are immutable. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function deepFreezeOpportunity(
  opportunity: FinancialOpportunity,
): FinancialOpportunity {
  return deepFreeze(opportunity);
}
