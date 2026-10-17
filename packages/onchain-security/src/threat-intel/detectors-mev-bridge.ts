/**
 * @payswap/onchain-security/threat-intel — family detectors 7–8
 * (transport/execution-surface threats: bridge compromise, MEV/sandwich
 * exposure)
 * (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law).
 *
 * Same detection discipline as detectors-approvals.ts: pure functions,
 * evidence-generating, exact arithmetic only (BigInt rationals — never
 * floating point), deterministic ordering.
 */

import type { DetectionContext, RawSignal } from "./detectors-context.ts";
import { baseEvidence, bridgeHops } from "./detectors-context.ts";
import { parseRational, rationalDeviationBps, rationalExceedsInteger } from "./evidence.ts";

// ---------------------------------------------------------------------------
// Family 7 — bridge compromise
// ---------------------------------------------------------------------------

/** Detect bridge compromise: halted/degraded status, validator churn, sub-quorum. */
export function detectBridgeCompromise(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy, bundle, at } = context;
  const bridges = bundle.bridges ?? [];

  const relevantBridges =
    bridgeHops(write).length > 0
      ? bridges
      : bridges; // health intel applies to any observed bridge on the route

  for (const bridge of relevantBridges) {
    if (bridge.status === "halted") {
      signals.push({
        family: "bridge_compromise",
        code: "bridge_halted",
        severity: "critical",
        method: "behavioral_pattern",
        corroborations: 0,
        evidence: baseEvidence(context, [bridge.observationId, `venue:${bridge.bridgeId}`], [
          {
            label: "bridge_status",
            unit: "count",
            observed: "0",
            expected: "2",
          },
        ]),
        summary: `bridge ${bridge.bridgeId} is observed HALTED`,
      });
    } else if (bridge.status === "degraded") {
      signals.push({
        family: "bridge_compromise",
        code: "bridge_degraded",
        severity: "high",
        method: "behavioral_pattern",
        corroborations: 0,
        evidence: baseEvidence(context, [bridge.observationId, `venue:${bridge.bridgeId}`], [
          {
            label: "bridge_status",
            unit: "count",
            observed: "1",
            expected: "2",
          },
        ]),
        summary: `bridge ${bridge.bridgeId} is observed DEGRADED`,
      });
    }

    if (
      bridge.validatorSetChangedAt !== undefined &&
      policy.bridgeValidatorChangeWindowMs !== undefined &&
      at - bridge.validatorSetChangedAt < policy.bridgeValidatorChangeWindowMs
    ) {
      signals.push({
        family: "bridge_compromise",
        code: "bridge_validator_set_recently_changed",
        severity: "high",
        method: "threshold_breach",
        corroborations: bridge.status === "healthy" ? 0 : 1,
        evidence: baseEvidence(context, [bridge.observationId], [
          {
            label: "validator_set_change_age_ms",
            unit: "milliseconds",
            observed: (at - bridge.validatorSetChangedAt).toString(),
            expected: policy.bridgeValidatorChangeWindowMs.toString(),
          },
        ]),
        summary: `bridge ${bridge.bridgeId} validator set changed ${at - bridge.validatorSetChangedAt}ms ago (suspicion window ${policy.bridgeValidatorChangeWindowMs}ms)`,
      });
    }

    if (bridge.attestationQuorum !== undefined && policy.minBridgeAttestationQuorum !== undefined) {
      const observed = parseRational(bridge.attestationQuorum);
      const minimum = parseRational(policy.minBridgeAttestationQuorum);
      if (observed.numerator * minimum.denominator < minimum.numerator * observed.denominator) {
        signals.push({
          family: "bridge_compromise",
          code: "bridge_attestation_quorum_below_minimum",
          severity: "critical",
          method: "threshold_breach",
          corroborations: 0,
          evidence: baseEvidence(context, [bridge.observationId], [
            {
              label: "attestation_quorum",
              unit: "rational",
              observed: bridge.attestationQuorum,
              expected: policy.minBridgeAttestationQuorum,
            },
          ]),
          summary: `bridge ${bridge.bridgeId} attestation quorum ${bridge.attestationQuorum} is below the policy minimum ${policy.minBridgeAttestationQuorum}`,
        });
      }
    }
  }

  // Policy demands bridge health for bridge hops; absence is weak evidence.
  if (policy.requireBridgeHealthForBridgeHops) {
    for (const venue of bridgeHops(write)) {
      const hasHealth = bridges.some((bridge) => bridge.bridgeId === venue);
      if (!hasHealth) {
        signals.push({
          family: "bridge_compromise",
          code: "bridge_hop_without_health_observation",
          severity: "medium",
          method: "registry_absence",
          corroborations: 0,
          evidence: baseEvidence(context, [`bridge:${venue}`], [
            {
              label: "bridge_health_coverage",
              unit: "count",
              observed: "0",
              expected: "1",
            },
          ]),
          summary: `route crosses bridge hop ${venue} with no bridge health observation in the bundle (coverage required by policy)`,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 8 — MEV/sandwich exposure
// ---------------------------------------------------------------------------

/**
 * Detect MEV/sandwich exposure from the execution-quote disclosures
 * (pinned structural inputs — see pins/quote.ts): over-limit slippage,
 * visible-in-mempool swaps with sandwich-profitable slippage, high price
 * impact, expired quotes.
 */
export function detectMevSandwichExposure(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { policy, bundle, at } = context;
  const slippage = bundle.quoteSlippage;
  const liquidity = bundle.quoteLiquidityImpact;
  const mempool = bundle.mempool;

  if (slippage?.limitBasisPoints !== undefined && policy.maxSlippageBasisPoints !== undefined) {
    if (slippage.limitBasisPoints > policy.maxSlippageBasisPoints) {
      signals.push({
        family: "mev_sandwich_exposure",
        code: "slippage_limit_above_policy_max",
        severity: "medium",
        method: "threshold_breach",
        corroborations: 0,
        evidence: baseEvidence(context, ["quote:slippage"], [
          {
            label: "slippage_limit_bps",
            unit: "basis_points",
            observed: slippage.limitBasisPoints.toString(),
            expected: policy.maxSlippageBasisPoints.toString(),
          },
        ]),
        summary: `declared slippage limit ${slippage.limitBasisPoints} bps exceeds the policy max ${policy.maxSlippageBasisPoints} bps`,
      });
    }
  }

  if (
    slippage?.limitBasisPoints !== undefined &&
    policy.sandwichSensitiveSlippageBasisPoints !== undefined &&
    slippage.limitBasisPoints >= policy.sandwichSensitiveSlippageBasisPoints
  ) {
    if (mempool?.writeVisible === true) {
      signals.push({
        family: "mev_sandwich_exposure",
        code: "visible_swap_with_sandwich_profitable_slippage",
        severity: "critical",
        method: "threshold_breach",
        corroborations: (mempool.competingTransactions ?? 0) > 0 ? 1 : 0,
        evidence: baseEvidence(context, ["quote:slippage", mempool.observationId], [
          {
            label: "sandwich_surface_bps",
            unit: "basis_points",
            observed: slippage.limitBasisPoints.toString(),
            expected: (policy.sandwichSensitiveSlippageBasisPoints - 1).toString(),
          },
        ]),
        summary: `swap visible in public mempool with ${slippage.limitBasisPoints} bps slippage (sensitive threshold ${policy.sandwichSensitiveSlippageBasisPoints} bps)${(mempool.competingTransactions ?? 0) > 0 ? ` and ${mempool.competingTransactions} competing transactions` : ""}`,
      });
    }
  }

  if (
    liquidity?.priceImpactBasisPoints !== undefined &&
    policy.maxPriceImpactBasisPoints !== undefined &&
    liquidity.priceImpactBasisPoints > policy.maxPriceImpactBasisPoints
  ) {
    signals.push({
      family: "mev_sandwich_exposure",
      code: "price_impact_above_policy_max",
      severity: "high",
      method: "threshold_breach",
      corroborations: mempool?.writeVisible === true ? 1 : 0,
      evidence: baseEvidence(context, ["quote:liquidity_impact", ...(mempool === undefined ? [] : [mempool.observationId])], [
        {
          label: "price_impact_bps",
          unit: "basis_points",
          observed: liquidity.priceImpactBasisPoints.toString(),
          expected: policy.maxPriceImpactBasisPoints.toString(),
        },
      ]),
      summary: `declared price impact ${liquidity.priceImpactBasisPoints} bps exceeds the policy max ${policy.maxPriceImpactBasisPoints} bps`,
    });
  }

  if (bundle.quoteValidUntil !== undefined && bundle.quoteValidUntil <= at) {
    signals.push({
      family: "mev_sandwich_exposure",
      code: "quote_expired_at_evaluation",
      severity: "medium",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(context, ["quote:validity"], [
        {
          label: "quote_validity_ms",
          unit: "milliseconds",
          observed: bundle.quoteValidUntil.toString(),
          expected: (at + 1).toString(),
        },
      ]),
      summary: `execution quote expired at ${bundle.quoteValidUntil} (evaluation instant ${at})`,
    });
  }

  return signals;
}
