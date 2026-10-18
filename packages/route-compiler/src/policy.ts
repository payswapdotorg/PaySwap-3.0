/**
 * @payswap/route-compiler — the best-execution policy (P5-W1).
 *
 * PORT of the old best-execution policy.ts (MMI-19): every constant that
 * influences a scored decision is a DECLARED, VERSIONED policy field —
 * the comparator has NO hidden constants (INV-F01 extended to
 * valuations):
 *
 * - the NUMERAIRE + per-asset conversion table (exact rationals — how
 *   every asset's minor units value in numeraire minor units);
 * - the HARD constraints: maxSettlementMs, maxFailureRiskClass,
 *   degradedVenuePolicy, optional venue allowlist and hop budget
 *   (evaluated BEFORE soft optimization — rule 14);
 * - the SOFT inputs: per-risk-class failure deductions (COMPLETE table,
 *   '0' declared explicitly), timeCostPerMs;
 * - the TIE-BREAKER order — MUST terminate in the total-order
 *   discriminator (VENUE_ID at venue level, PLAN_ID at plan level).
 *
 * Validation aggregates ALL violations into one error (never
 * first-fail) so a caller sees every defect at once.
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, type Fail } from "./canonical.ts";
import { validateExactRational, type ExactRational } from "./exact-math.ts";
import { isRiskClass, RISK_CLASSES, type RiskClass } from "./quote-fees.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The closed tie-breaker vocabulary (frozen). */
export const TIE_BREAKER_KINDS = Object.freeze([
  "LOWER_RISK_CLASS",
  "FASTER_SETTLEMENT",
  "FEWER_HOPS",
  "FEWER_RAIL_CROSSINGS",
  "VENUE_ID",
  "PLAN_ID",
] as const);

export type TieBreakerKind = (typeof TIE_BREAKER_KINDS)[number];

/** One asset conversion rule: numeraire minor units per ONE asset minor unit. */
export interface AssetConversionRule {
  readonly asset: { readonly chain: string; readonly assetId: string; readonly symbol: string };
  readonly rate: ExactRational;
}

/** The best-execution policy (versioned, fully declared, frozen). */
export interface BestExecutionPolicy {
  readonly policyId: string;
  readonly version: number;
  readonly numeraire: string;
  readonly conversions: readonly AssetConversionRule[];
  readonly maxSettlementMs: number;
  readonly maxFailureRiskClass: RiskClass;
  readonly degradedVenuePolicy: "DISQUALIFY" | "ADMIT";
  readonly failureRiskDeductions: Readonly<Record<RiskClass, string>>;
  readonly timeCostPerMs: ExactRational;
  readonly allowedVenues?: readonly string[];
  readonly maxRouteHops?: number;
  readonly tieBreakers: readonly TieBreakerKind[];
}

/**
 * Fail-closed validation of the policy — aggregates every violation into
 * one ValidationError with the complete list (never first-fail).
 */
export function validateBestExecutionPolicy(candidate: unknown): BestExecutionPolicy {
  const record = requireObject(candidate, "a BestExecutionPolicy", fail);
  const errors: string[] = [];

  const policyId =
    typeof record["policyId"] === "string" && record["policyId"].length > 0
      ? record["policyId"]
      : undefined;
  if (policyId === undefined) {
    errors.push("policyId must be a non-empty string");
  }
  const version = record["version"];
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    errors.push("version must be a positive integer");
  }
  const numeraire = record["numeraire"];
  if (typeof numeraire !== "string" || !/^[A-Z]{3}$/.test(numeraire)) {
    errors.push("numeraire must be a three-letter uppercase currency code");
  }
  const conversions = record["conversions"];
  if (!Array.isArray(conversions) || conversions.length === 0) {
    errors.push("conversions must be a non-empty array (every touched asset must be convertible)");
  }
  const conversionKeys = new Set<string>();
  const validatedConversions: AssetConversionRule[] = [];
  if (Array.isArray(conversions)) {
    for (const conversion of conversions) {
      const conversionRecord = requireObject(conversion, "an AssetConversionRule", fail);
      const asset = conversionRecord["asset"];
      const assetRecord = requireObject(asset, "conversion.asset", fail);
      const chain = assetRecord["chain"];
      const assetId = assetRecord["assetId"];
      const symbol = assetRecord["symbol"];
      if (typeof chain !== "string" || typeof assetId !== "string" || typeof symbol !== "string") {
        errors.push("conversion.asset must carry chain, assetId and symbol strings");
        continue;
      }
      const key = `${chain}|${assetId}|${symbol}`;
      if (conversionKeys.has(key)) {
        errors.push(`duplicate conversion rule for asset key '${key}'`);
      }
      conversionKeys.add(key);
      const rate = conversionRecord["rate"];
      try {
        validateExactRational(rate as ExactRational);
      } catch {
        errors.push(`conversion rate for asset key '${key}' must be a canonical ExactRational`);
        continue;
      }
      validatedConversions.push(
        Object.freeze({
          asset: Object.freeze({ chain, assetId, symbol }),
          rate: rate as ExactRational,
        }),
      );
    }
  }
  const maxSettlementMs = record["maxSettlementMs"];
  if (typeof maxSettlementMs !== "number" || !Number.isSafeInteger(maxSettlementMs) || maxSettlementMs < 1) {
    errors.push("maxSettlementMs must be a positive integer (a zero time budget is refused)");
  }
  const maxFailureRiskClass = record["maxFailureRiskClass"];
  if (!isRiskClass(maxFailureRiskClass)) {
    errors.push("maxFailureRiskClass must be a member of the closed risk vocabulary");
  }
  const degradedVenuePolicy = record["degradedVenuePolicy"];
  if (degradedVenuePolicy !== "DISQUALIFY" && degradedVenuePolicy !== "ADMIT") {
    errors.push("degradedVenuePolicy must be DISQUALIFY or ADMIT");
  }
  const failureRiskDeductions = record["failureRiskDeductions"];
  const validatedDeductions: Partial<Record<RiskClass, string>> = {};
  if (typeof failureRiskDeductions !== "object" || failureRiskDeductions === null) {
    errors.push("failureRiskDeductions must be a complete per-class table (declare '0' explicitly)");
  } else {
    for (const riskClass of RISK_CLASSES) {
      const value = (failureRiskDeductions as Record<string, unknown>)[riskClass];
      if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
        errors.push(`failureRiskDeductions.${riskClass} must be a canonical integer string (declare '0' explicitly — no hidden defaults)`);
      } else {
        validatedDeductions[riskClass] = value;
      }
    }
  }
  const timeCostPerMs = record["timeCostPerMs"];
  try {
    validateExactRational(timeCostPerMs as ExactRational);
  } catch {
    errors.push("timeCostPerMs must be a canonical ExactRational (an explicit time cost, never a hidden constant)");
  }
  const allowedVenues = record["allowedVenues"];
  if (allowedVenues !== undefined && !Array.isArray(allowedVenues)) {
    errors.push("allowedVenues must be an array when present (undefined = unrestricted)");
  }
  const maxRouteHops = record["maxRouteHops"];
  if (maxRouteHops !== undefined && (typeof maxRouteHops !== "number" || !Number.isSafeInteger(maxRouteHops) || maxRouteHops < 1)) {
    errors.push("maxRouteHops must be a positive integer when present (undefined = unrestricted)");
  }
  const tieBreakers = record["tieBreakers"];
  if (!Array.isArray(tieBreakers) || tieBreakers.length === 0) {
    errors.push("tieBreakers must be a non-empty array");
  } else {
    const seen = new Set<string>();
    for (const tieBreaker of tieBreakers) {
      if (typeof tieBreaker !== "string" || !(TIE_BREAKER_KINDS as readonly string[]).includes(tieBreaker)) {
        errors.push(`tieBreaker '${String(tieBreaker)}' is not a member of the closed vocabulary`);
      } else if (seen.has(tieBreaker)) {
        errors.push(`tieBreaker '${tieBreaker}' appears twice (the declared order is total, no repeats)`);
      } else {
        seen.add(tieBreaker);
      }
    }
    const last = tieBreakers[tieBreakers.length - 1];
    if (last !== "VENUE_ID" && last !== "PLAN_ID") {
      errors.push("tieBreakers must terminate in VENUE_ID or PLAN_ID (the mandatory total order)");
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `the best-execution policy failed validation (every violation listed): ${errors.join("; ")}`,
      { errors },
    );
  }

  return deepFreeze({
    policyId: policyId as string,
    version: version as number,
    numeraire: numeraire as string,
    conversions: Object.freeze(validatedConversions),
    maxSettlementMs: maxSettlementMs as number,
    maxFailureRiskClass: maxFailureRiskClass as RiskClass,
    degradedVenuePolicy: degradedVenuePolicy as "DISQUALIFY" | "ADMIT",
    failureRiskDeductions: validatedDeductions as Readonly<Record<RiskClass, string>>,
    timeCostPerMs: timeCostPerMs as ExactRational,
    ...(Array.isArray(allowedVenues) ? { allowedVenues: Object.freeze([...allowedVenues]) } : {}),
    ...(maxRouteHops !== undefined ? { maxRouteHops } : {}),
    tieBreakers: Object.freeze([...(tieBreakers as TieBreakerKind[])]),
  }) as BestExecutionPolicy;
}

/** The policy reference `${policyId}@${version}` (provenance chains). */
export function policyRef(policy: BestExecutionPolicy): string {
  return `${policy.policyId}@${policy.version}`;
}

/**
 * The conversion rule for an asset (exact match on chain+assetId+symbol);
 * missing -> undefined — the valuation fails closed upstream, NEVER a
 * default rate.
 */
export function conversionFor(
  policy: BestExecutionPolicy,
  asset: { chain: string; assetId: string; symbol: string },
): AssetConversionRule | undefined {
  for (const conversion of policy.conversions) {
    if (
      conversion.asset.chain === asset.chain &&
      conversion.asset.assetId === asset.assetId &&
      conversion.asset.symbol === asset.symbol
    ) {
      return conversion;
    }
  }
  return undefined;
}

/** Fail-closed bounded-string helper re-exported for policy consumers. */
export function requirePolicyId(value: unknown): string {
  return requireBoundedString(value, "policy.policyId", 256, fail);
}
