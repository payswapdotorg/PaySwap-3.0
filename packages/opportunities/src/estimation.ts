/**
 * @payswap/opportunities — evidence-backed return estimation (P6-W2,
 * lane r4-w2; ADAPTED from payswap.org@8a735bf
 * packages/onchain-opportunities/src/discovery.ts estimation section —
 * split out under the file law; arithmetic in ./rational.ts).
 *
 * Honest BY CONSTRUCTION: point = sum of ALL observed components; lower
 * bound = sum of VERIFIED components only (incentives count as verified
 * only with a reserved budget — the old AGENTS.md rule 13), net of
 * observed execution costs (floored at zero; arbitrage only); upper
 * bound = the point; NO verified component -> UNKNOWN (null point and
 * bounds). The arbitrage price-difference component is DERIVED from the
 * two legs (never supplied directly) and verified only when BOTH legs
 * carry observed, non-vanished exit liquidity.
 */

import { OpportunityDiscoveryError } from "./errors.ts";
import {
  compareRationals,
  isRationalZero,
  subtractRationalsFlooredAtZero,
  sumRationals,
  validateExactRational,
} from "./rational.ts";
import type { ExactRational } from "./rational.ts";
import type {
  ArbitrageLeg,
  ExpectedReturnEstimate,
  ReturnComponent,
} from "./model.ts";

function isVerifiedComponent(component: ReturnComponent): boolean {
  if (!component.evidenceVerified) {
    return false;
  }
  if (
    component.kind === "INCENTIVE_YIELD" &&
    component.budgetReserved !== true
  ) {
    return false;
  }
  return true;
}

/**
 * Derives the price-difference component of an arbitrage opportunity from
 * its two venue price legs. The gross spread rate is
 * (max(price) − min(price)) / min(price) — an exact rational. The
 * component counts as evidence-verified only when BOTH legs carry
 * observed, non-vanished exit liquidity (a vanished-liquidity leg is not
 * verified evidence of a capturable difference).
 */
export function deriveArbitrageComponents(
  legs: readonly ArbitrageLeg[],
): readonly ReturnComponent[] {
  if (legs.length !== 2) {
    throw new OpportunityDiscoveryError(
      `an arbitrage opportunity observation requires exactly two venue price legs (got ${legs.length}) — a price difference needs both sides`,
    );
  }
  const [legA, legB] = legs as [ArbitrageLeg, ArbitrageLeg];
  validateExactRational(legA.price);
  validateExactRational(legB.price);
  if (isRationalZero(legA.price) || isRationalZero(legB.price)) {
    throw new OpportunityDiscoveryError(
      "a venue price leg of exactly zero cannot ground a price-difference estimate (a zero price is malformed evidence — fail closed, never a fabricated zero spread)",
    );
  }
  const comparison = compareRationals(legA.price, legB.price);
  const lower = comparison <= 0 ? legA.price : legB.price;
  const higher = comparison <= 0 ? legB.price : legA.price;
  // spread = (higher − lower) / lower, exact.
  const numerator =
    BigInt(higher.numerator) * BigInt(lower.denominator) -
    BigInt(lower.numerator) * BigInt(higher.denominator);
  const denominator =
    BigInt(lower.numerator) * BigInt(higher.denominator);
  const spread: ExactRational = {
    numerator: numerator.toString(),
    denominator: denominator.toString(),
  };
  const bothLegsLiquid =
    legA.withdrawalLiquidityMinorUnits !== null &&
    legA.withdrawalLiquidityMinorUnits !== "0" &&
    legB.withdrawalLiquidityMinorUnits !== null &&
    legB.withdrawalLiquidityMinorUnits !== "0";
  const component: ReturnComponent = {
    componentId: `arbitrage-spread:${legA.venueId}:${legB.venueId}`,
    kind: "PRICE_DIFFERENCE",
    ratePerYear: spread,
    evidenceVerified: bothLegsLiquid,
    description: `observed price difference between venue '${legA.venueId}' and venue '${legB.venueId}' — an estimate from two venue observations, net of nothing (see bounds)`,
  };
  return Object.freeze([component]);
}

/**
 * Derives the expected-return ESTIMATE from observed components. The
 * point is the sum of ALL observed components; the lower bound is the
 * sum of VERIFIED components reduced by the observed execution costs
 * (floored at zero; only the arbitrage path supplies costs); the upper
 * bound equals the point. When NO component is verified the estimate is
 * UNKNOWN (point and bounds null) — honest disclosure, never an
 * unverified number.
 */
export function estimateExpectedReturn(
  components: readonly ReturnComponent[],
  input?: { readonly executionCostFraction?: ExactRational },
): ExpectedReturnEstimate {
  for (const component of components) {
    validateExactRational(component.ratePerYear);
  }
  const total = sumRationals(components.map((c) => c.ratePerYear));
  const verified = sumRationals(
    components.filter(isVerifiedComponent).map((c) => c.ratePerYear),
  );
  const costReduction = input?.executionCostFraction;
  if (costReduction !== undefined) {
    validateExactRational(costReduction);
  }
  const low =
    costReduction !== undefined
      ? subtractRationalsFlooredAtZero(verified, costReduction)
      : verified;
  const hasVerified = components.some(isVerifiedComponent);
  if (!hasVerified) {
    return Object.freeze({
      estimateKind: "EVIDENCE_BACKED_ESTIMATE",
      point: null,
      bounds: null,
      components: Object.freeze([...components]),
      basis:
        "expected return UNKNOWN: no observed return component carries verified evidence (honest disclosure — never an unverified number)",
    });
  }
  const componentSummary = components
    .map(
      (component) =>
        `${component.kind} (verified: ${component.evidenceVerified ? "yes" : "no"}${component.kind === "INCENTIVE_YIELD" ? `, budget reserved: ${component.budgetReserved === true ? "yes" : "no"}` : ""})`,
    )
    .join("; ");
  const basis = `estimate derived from observed components: ${componentSummary}; lower bound counts verified components only${costReduction !== undefined ? ", net of observed execution costs" : ""}; the point is an estimate with uncertainty bounds, not a claim`;
  return Object.freeze({
    estimateKind: "EVIDENCE_BACKED_ESTIMATE",
    point: total,
    bounds: Object.freeze({ low, high: total }),
    components: Object.freeze([...components]),
    basis,
  });
}
