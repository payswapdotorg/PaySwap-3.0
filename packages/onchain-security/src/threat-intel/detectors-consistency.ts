/**
 * @payswap/onchain-security/threat-intel — family detectors 11–13
 * (observation-consistency threats: unexpected balance/state deltas,
 * stale/materially changed simulations, finality/reorg anomalies)
 * (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law).
 */

import type { DetectionContext, RawSignal } from "./detectors-context.ts";
import { baseEvidence, intentAssets } from "./detectors-context.ts";
import { sameAsset } from "../types.ts";

// ---------------------------------------------------------------------------
// Family 11 — unexpected balance/state deltas
// ---------------------------------------------------------------------------

/**
 * Detect unexpected balance/state deltas: simulated deltas for holders/
 * assets outside the intent, and approvals observed that the write never
 * requested.
 */
export function detectUnexpectedBalanceDelta(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, simulation } = context;
  if (simulation === undefined) {
    return signals;
  }

  const intentHolders = new Set<string>();
  if (write.transfer !== undefined) {
    intentHolders.add(write.transfer.from);
    intentHolders.add(write.transfer.to);
  }
  for (const approval of write.approvals) {
    intentHolders.add(approval.owner);
  }
  const intentAssetsList = intentAssets(context);

  for (const delta of simulation.balanceDeltas) {
    const inIntent =
      intentHolders.has(delta.holder) &&
      intentAssetsList.some((asset) => sameAsset(asset, delta.asset));
    if (!inIntent) {
      signals.push({
        family: "unexpected_balance_delta",
        code: "delta_outside_intent",
        severity: "high",
        method: "threshold_breach",
        corroborations: 0,
        evidence: baseEvidence(context, [`${simulation.simulationId}:delta:${delta.holder}`], [
          {
            label: "delta_minor_units",
            unit: "minor_units",
            observed: delta.amount.minorUnits,
            expected: "0",
          },
        ]),
        summary: `simulation observed a ${delta.direction} of ${delta.amount.minorUnits} ${delta.amount.currency} for holder ${delta.holder} on ${delta.asset.assetId} — outside the intent's legs`,
      });
    }
  }

  for (const observed of simulation.approvals) {
    const requested = write.approvals.some(
      (approval) =>
        approval.owner === observed.owner &&
        approval.spender === observed.spender &&
        sameAsset(approval.asset, observed.asset),
    );
    if (!requested) {
      signals.push({
        family: "unexpected_balance_delta",
        code: "approval_state_change_outside_intent",
        severity: "critical",
        method: "threshold_breach",
        corroborations: 0,
        evidence: baseEvidence(
          context,
          [`${simulation.simulationId}:approval:${observed.spender}`],
          [
            {
              label: "unexpected_allowance_minor_units",
              unit: "minor_units",
              observed: observed.allowance.minorUnits,
              expected: "0",
            },
          ],
        ),
        summary: `simulation observed an allowance of ${observed.allowance.minorUnits} ${observed.allowance.currency} from ${observed.owner} to spender ${observed.spender} that the write never requested`,
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 12 — stale/materially changed simulations
// ---------------------------------------------------------------------------

/** Detect stale or materially changed simulations (wrong write, old age, lagging block). */
export function detectStaleChangedSimulation(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, simulation, policy, bundle, at } = context;

  // Corroborating staleness: the whole observation bundle is too old —
  // checked REGARDLESS of simulation presence (stale intelligence taints
  // every downstream evaluation, with or without a simulation).
  if (policy.maxObservationAgeMs !== undefined && at - bundle.observedAt > policy.maxObservationAgeMs) {
    signals.push({
      family: "stale_changed_simulation",
      code: "observation_bundle_stale",
      severity: "medium",
      method: "threshold_breach",
      corroborations: 1,
      evidence: baseEvidence(context, [`bundle:${bundle.bundleId}:age`], [
        {
          label: "bundle_age_ms",
          unit: "milliseconds",
          observed: (at - bundle.observedAt).toString(),
          expected: policy.maxObservationAgeMs.toString(),
        },
      ]),
      summary: `threat observation bundle ${bundle.bundleId} is ${at - bundle.observedAt}ms old (max ${policy.maxObservationAgeMs}ms)`,
    });
  }

  if (simulation === undefined) {
    return signals;
  }

  if (simulation.writeId !== write.writeId) {
    signals.push({
      family: "stale_changed_simulation",
      code: "simulation_bound_to_different_write",
      severity: "critical",
      method: "exact_identity_match",
      corroborations: 0,
      evidence: baseEvidence(context, [`${simulation.simulationId}:write-binding`], [
        {
          label: "simulation_write_binding",
          unit: "count",
          observed: "1",
          expected: "1",
        },
      ]),
      summary: `simulation ${simulation.simulationId} is bound to write '${simulation.writeId}', not this write '${write.writeId}'`,
    });
  }

  if (policy.maxSimulationAgeMs !== undefined && at - simulation.observedAt > policy.maxSimulationAgeMs) {
    signals.push({
      family: "stale_changed_simulation",
      code: "simulation_older_than_policy_max_age",
      severity: "high",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(context, [`${simulation.simulationId}:age`], [
        {
          label: "simulation_age_ms",
          unit: "milliseconds",
          observed: (at - simulation.observedAt).toString(),
          expected: policy.maxSimulationAgeMs.toString(),
        },
      ]),
      summary: `simulation ${simulation.simulationId} is ${at - simulation.observedAt}ms old (max ${policy.maxSimulationAgeMs}ms)`,
    });
  }

  const blockNumber = parseBlockNumber(simulation.blockRef);
  const finality = bundle.finality;
  if (
    blockNumber !== undefined &&
    finality !== undefined &&
    policy.maxSimulationLagBlocks !== undefined &&
    finality.headBlock - blockNumber > policy.maxSimulationLagBlocks
  ) {
    signals.push({
      family: "stale_changed_simulation",
      code: "simulation_block_lags_head",
      severity: "high",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(
        context,
        [`${simulation.simulationId}:block`, finality.observationId],
        [
          {
            label: "simulation_block_lag",
            unit: "blocks",
            observed: (finality.headBlock - blockNumber).toString(),
            expected: policy.maxSimulationLagBlocks.toString(),
          },
        ],
      ),
      summary: `simulation ran against block ${blockNumber}; the observed head is ${finality.headBlock} (max lag ${policy.maxSimulationLagBlocks} blocks)`,
    });
  }

  return signals;
}

function parseBlockNumber(blockRef: string | undefined): number | undefined {
  if (blockRef === undefined) {
    return undefined;
  }
  const match = /(\d+)$/.exec(blockRef);
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

// ---------------------------------------------------------------------------
// Family 13 — finality/reorg anomalies
// ---------------------------------------------------------------------------

/** Detect finality/reorg anomalies: reorg depth, head→safe gap, stale finality. */
export function detectFinalityReorgAnomaly(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy, bundle, at } = context;
  const finality = bundle.finality;
  if (finality === undefined) {
    return signals;
  }
  // Finality intel for a different chain cannot judge this write's chain.
  if (finality.chain !== write.chain) {
    return signals;
  }

  if (
    finality.lastReorgDepthBlocks !== undefined &&
    policy.maxReorgDepthBlocks !== undefined &&
    finality.lastReorgDepthBlocks > policy.maxReorgDepthBlocks
  ) {
    signals.push({
      family: "finality_reorg_anomaly",
      code: "reorg_depth_exceeds_threshold",
      severity: "critical",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(context, [finality.observationId], [
        {
          label: "reorg_depth_blocks",
          unit: "blocks",
          observed: finality.lastReorgDepthBlocks.toString(),
          expected: policy.maxReorgDepthBlocks.toString(),
        },
      ]),
      summary: `chain ${finality.chain} observed a reorg of depth ${finality.lastReorgDepthBlocks} blocks (max ${policy.maxReorgDepthBlocks})`,
    });
  }

  if (
    policy.maxFinalityLagBlocks !== undefined &&
    finality.headBlock - finality.safeBlock > policy.maxFinalityLagBlocks
  ) {
    signals.push({
      family: "finality_reorg_anomaly",
      code: "finality_lag_exceeds_threshold",
      severity: "high",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(context, [finality.observationId], [
        {
          label: "finality_lag_blocks",
          unit: "blocks",
        observed: (finality.headBlock - finality.safeBlock).toString(),
        expected: policy.maxFinalityLagBlocks.toString(),
        },
      ]),
      summary: `chain ${finality.chain} head ${finality.headBlock} is ${finality.headBlock - finality.safeBlock} blocks ahead of safe head ${finality.safeBlock} (max ${policy.maxFinalityLagBlocks})`,
    });
  }

  if (policy.maxObservationAgeMs !== undefined && at - finality.observedAt > policy.maxObservationAgeMs) {
    signals.push({
      family: "finality_reorg_anomaly",
      code: "finality_observation_stale",
      severity: "medium",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(context, [finality.observationId], [
        {
          label: "finality_observation_age_ms",
          unit: "milliseconds",
          observed: (at - finality.observedAt).toString(),
          expected: policy.maxObservationAgeMs.toString(),
        },
      ]),
      summary: `finality observation for ${finality.chain} is ${at - finality.observedAt}ms old (max ${policy.maxObservationAgeMs}ms)`,
    });
  }

  return signals;
}
