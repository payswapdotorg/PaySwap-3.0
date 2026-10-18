/**
 * @payswap/route-compiler — the net-outcome scoring core (P5-W1).
 *
 * PORT of the old best-execution comparator (MMI-19), re-targeted from
 * venue quotes to SCOREABLE ROUTE CANDIDATES (a quote, a conversion-
 * grounded leg set — anything carrying the same dimension surface):
 *
 * THE SCORING MODEL: NOT a weighted multi-dimension vector. Every
 * dimension reduces to a single SIGNED numeraire value through exact
 * rational arithmetic — OUTPUT (the guaranteed worst case) minus fees,
 * gas, bridge, FX, liquidity impact, the declared risk deduction and
 * the declared time cost. "Weights" exist ONLY as policy fields (the
 * conversion table, the per-risk deductions, timeCostPerMs) — every
 * number is an explicit typed input; there are no hidden constants.
 *
 * INV-C08 BASELINE INDIFFERENCE (the work-order law): the evaluation
 * NEVER consults execution mode, optimization origin or baseline status
 * — the function's input is dimensions + policy ONLY. Provider-native
 * and composed candidates score identically when their dimensions are
 * identical (test-enforced with the discriminating pair).
 *
 * The single rounding law: each valued component floors toward zero at
 * its one boundary — the same rule for outputs and costs, so no
 * component is systematically favored.
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze } from "./canonical.ts";
import {
  floorRationalToIntegerString,
  multiplyRationals,
  rationalTimesInteger,
  valueThroughRate,
  type ExactRational,
} from "./exact-math.ts";
import { conversionFor, type BestExecutionPolicy } from "./policy.ts";
import { riskClassRank, type RiskClass } from "./quote-fees.ts";
import type { VenueQuote } from "./quote.ts";

/** The closed valued-component vocabulary (frozen). */
export const VALUED_COMPONENT_KINDS = Object.freeze([
  "OUTPUT",
  "FEE",
  "GAS",
  "BRIDGE_COST",
  "FX_COST",
  "LIQUIDITY_IMPACT",
  "RISK_DEDUCTION",
  "TIME_COST",
] as const);

export type ValuedComponentKind = (typeof VALUED_COMPONENT_KINDS)[number];

/** One valued component of a net-outcome trace (signed, evidenced). */
export interface ValuedComponent {
  readonly kind: ValuedComponentKind;
  readonly description: string;
  readonly sourceAmount?: { readonly currency: string; readonly minorUnits: string };
  readonly appliedRate?: ExactRational;
  readonly gasUnits?: string;
  readonly milliseconds?: number;
  readonly riskClass?: RiskClass;
  /** SIGNED canonical decimal string: OUTPUT positive; every cost negative. */
  readonly numeraireMinorUnits: string;
}

/** The full net-outcome evaluation of one candidate. */
export interface NetOutcomeEvaluation {
  readonly candidateId: string;
  readonly numeraire: string;
  readonly components: readonly ValuedComponent[];
  /** The signed BigInt sum of every component (the scored number). */
  readonly netNumeraireMinorUnits: string;
}

/** The scoreable candidate surface (dimensions only — INV-C08 indifference). */
export interface ScoreableCandidate {
  readonly candidateId: string;
  readonly quote: VenueQuote;
}

/**
 * The exact net-outcome evaluation of one candidate. Algorithm (each
 * step a ValuedComponent; exact arithmetic; fail closed when a touched
 * asset has no conversion rule — the valuation never guesses a rate):
 *
 * 1. OUTPUT (+): the guaranteed worstCaseOutput of the quote, converted
 *    through the policy's rate for the OUTPUT asset. The optimistic
 *    expectedOutput NEVER enters arithmetic (slippage enters exactly
 *    once, via the worst case).
 * 2. FEES (-): one component per declared fee, converted through the
 *    fee asset's rate.
 * 3. GAS (-): gasUnits x (nativePrice x feeAssetRate), floored once.
 * 4. BRIDGE_COST / FX_COST / LIQUIDITY_IMPACT (-): declared costs
 *    through their asset rates (liquidity enters ONLY here — the
 *    advisory depth never enters valuation).
 * 5. RISK_DEDUCTION (-): the policy's declared deduction for the
 *    quote's risk class (a missing class is a hard error).
 * 6. TIME_COST (-): estimatedMs x timeCostPerMs, floored once.
 */
export function evaluateNetOutcome(input: {
  candidate: ScoreableCandidate;
  policy: BestExecutionPolicy;
}): NetOutcomeEvaluation {
  const { candidate, policy } = input;
  const quote = candidate.quote;
  const components: ValuedComponent[] = [];
  const numeraire = policy.numeraire;

  const outputRate = requireRate(policy, quote.outputAsset, "the quote's output asset");
  components.push(
    Object.freeze({
      kind: "OUTPUT" as const,
      description: `guaranteed worst-case output of quote '${quote.quoteId}' (${quote.slippage.protection === "DECLARED_LIMIT" ? "declared limit" : "provider-defined protection"})`,
      sourceAmount: quote.slippage.worstCaseOutput,
      appliedRate: outputRate,
      numeraireMinorUnits: valueThroughRate(
        quote.slippage.worstCaseOutput.minorUnits,
        outputRate,
      ),
    }),
  );

  for (const fee of quote.fees) {
    const feeRate = requireRate(policy, fee.asset, "a declared quote fee");
    components.push(
      Object.freeze({
        kind: "FEE" as const,
        description: fee.description,
        sourceAmount: Object.freeze({ currency: fee.asset.symbol, minorUnits: fee.minorUnits }),
        appliedRate: feeRate,
        numeraireMinorUnits: negate(
          valueThroughRate(fee.minorUnits, feeRate),
        ),
      }),
    );
  }

  const gasCost = quote.gasCost;
  if (gasCost !== undefined && gasCost.feeAsset !== undefined) {
    const gasAssetRate = requireRate(policy, gasCost.feeAsset, "the gas fee asset");
    const fullRate = multiplyRationals(gasCost.pricePerUnitNativeMinor, gasAssetRate);
    components.push(
      Object.freeze({
        kind: "GAS" as const,
        description: "gas cost (gasUnits x native price, converted to numeraire)",
        appliedRate: fullRate,
        gasUnits: gasCost.gasUnits,
        numeraireMinorUnits: negate(valueThroughRate(gasCost.gasUnits, fullRate)),
      }),
    );
  }

  const deduction = policy.failureRiskDeductions[quote.failureRisk.riskClass];
  if (deduction === undefined) {
    throw new ValidationError(
      `no declared failure-risk deduction for risk class '${quote.failureRisk.riskClass}' — the valuation fails closed rather than defaulting (no hidden constants)`,
    );
  }
  components.push(
    Object.freeze({
      kind: "RISK_DEDUCTION" as const,
      description: `declared policy deduction for failure risk class '${quote.failureRisk.riskClass}'`,
      riskClass: quote.failureRisk.riskClass,
      numeraireMinorUnits: negate(deduction),
    }),
  );

  const timeMagnitude = floorRationalToIntegerString(
    rationalTimesInteger(policy.timeCostPerMs, quote.timeToSettlement.estimatedMs.toString()),
  );
  components.push(
    Object.freeze({
      kind: "TIME_COST" as const,
      description: "declared policy time cost (estimatedMs x timeCostPerMs)",
      appliedRate: policy.timeCostPerMs,
      milliseconds: quote.timeToSettlement.estimatedMs,
      numeraireMinorUnits: negate(timeMagnitude),
    }),
  );

  let net = 0n;
  for (const component of components) {
    net += BigInt(component.numeraireMinorUnits);
  }

  return deepFreeze({
    candidateId: candidate.candidateId,
    numeraire,
    components: Object.freeze(components),
    netNumeraireMinorUnits: net.toString(),
  });
}

function requireRate(
  policy: BestExecutionPolicy,
  asset: { chain: string; assetId: string; symbol: string },
  subject: string,
): ExactRational {
  const conversion = conversionFor(policy, asset);
  if (conversion === undefined) {
    throw new ValidationError(
      `no explicit conversion rule for asset '${asset.symbol}' (${asset.assetId} on ${asset.chain}) — ${subject} — the valuation fails closed rather than guessing a rate (no hidden constants)`,
    );
  }
  return conversion.rate;
}

function negate(canonicalInteger: string): string {
  const value = BigInt(canonicalInteger);
  return (value === 0n ? 0n : -value).toString();
}

/** Exact comparison of two net outcomes (BigInt, ascending). */
export function compareNetOutcomes(
  left: NetOutcomeEvaluation,
  right: NetOutcomeEvaluation,
): -1 | 0 | 1 {
  const leftNet = BigInt(left.netNumeraireMinorUnits);
  const rightNet = BigInt(right.netNumeraireMinorUnits);
  if (leftNet < rightNet) {
    return -1;
  }
  if (leftNet > rightNet) {
    return 1;
  }
  return 0;
}

/** The risk rank of a candidate's quote (tie-breaker input). */
export function candidateRiskRank(candidate: ScoreableCandidate): number {
  return riskClassRank(candidate.quote.failureRisk.riskClass);
}

/** The estimated settlement time of a candidate's quote (tie-breaker input). */
export function candidateSettlementMs(candidate: ScoreableCandidate): number {
  return candidate.quote.timeToSettlement.estimatedMs;
}

/** The hop count of a candidate's quote (tie-breaker input). */
export function candidateHops(candidate: ScoreableCandidate): number {
  return candidate.quote.routeShape.length;
}
