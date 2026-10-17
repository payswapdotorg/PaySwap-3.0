/**
 * @payswap/onchain-security/threat-intel — family detectors 5–6
 * (contract-infrastructure threats: proxy/admin/implementation changes,
 * oracle manipulation)
 * (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law).
 *
 * Same detection discipline as detectors-approvals.ts: pure functions,
 * evidence-generating, exact arithmetic only (BigInt rationals — never
 * floating point), deterministic ordering.
 */

import type { DetectionContext, RawSignal } from "./detectors-context.ts";
import { baseEvidence } from "./detectors-context.ts";
import type { OracleObservation } from "./observations-chain.ts";
import { parseRational, rationalDeviationBps, rationalExceedsInteger } from "./evidence.ts";

// ---------------------------------------------------------------------------
// Family 5 — proxy/admin/implementation changes
// ---------------------------------------------------------------------------

/**
 * Detect proxy/admin/implementation drift: the write's declared protocol
 * contract diverges from the policy's certified reference on
 * bytecode/source hashes, upgrade authority or admin authority.
 */
export function detectProxyAdminChange(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy } = context;
  if (write.protocol === undefined) {
    return signals;
  }
  const certified = policy.certifiedProtocols ?? [];
  const reference = certified.find((candidate) => candidate.protocolId === write.protocol!.protocolId);
  if (reference === undefined) {
    return signals; // certification itself is the kernel's dimension (INV-20)
  }

  const writeContract = write.protocol.contract;
  const referenceContract = reference.contract;
  const observationRefs = [
    `protocol:${write.protocol.protocolId}@${write.protocol.contract.contractAddress}`,
  ];

  if (writeContract.bytecodeHash !== referenceContract.bytecodeHash) {
    signals.push({
      family: "proxy_admin_change",
      code: "implementation_bytecode_drift",
      severity: "critical",
      method: "structural_mismatch",
      corroborations: writeContract.sourceHash !== referenceContract.sourceHash ? 1 : 0,
      evidence: baseEvidence(context, observationRefs, [
        {
          label: "bytecode_hash",
          unit: "count",
          observed: "1",
          expected: "1",
        },
      ]),
      summary: `implementation bytecode of ${write.protocol.protocolId} at ${writeContract.contractAddress} drifted from the certified declaration (hash ${writeContract.bytecodeHash} ≠ ${referenceContract.bytecodeHash})`,
    });
  }

  if (writeContract.upgradeAuthority.kind !== referenceContract.upgradeAuthority.kind) {
    signals.push({
      family: "proxy_admin_change",
      code: "upgrade_authority_changed",
      severity: "critical",
      method: "structural_mismatch",
      corroborations: 0,
      evidence: baseEvidence(context, observationRefs, [
        {
          label: "upgrade_authority_kind",
          unit: "count",
          observed: "1",
          expected: "1",
        },
      ]),
      summary: `upgrade authority of ${write.protocol.protocolId} changed from '${referenceContract.upgradeAuthority.kind}' to '${writeContract.upgradeAuthority.kind}'`,
    });
  }

  if (writeContract.adminAuthority.kind !== referenceContract.adminAuthority.kind) {
    signals.push({
      family: "proxy_admin_change",
      code: "admin_authority_changed",
      severity: "high",
      method: "structural_mismatch",
      corroborations: 0,
      evidence: baseEvidence(context, observationRefs, [
        {
          label: "admin_authority_kind",
          unit: "count",
          observed: "1",
          expected: "1",
        },
      ]),
      summary: `admin authority of ${write.protocol.protocolId} changed from '${referenceContract.adminAuthority.kind}' to '${writeContract.adminAuthority.kind}'`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 6 — oracle manipulation
// ---------------------------------------------------------------------------

/**
 * Detect oracle manipulation: pairwise deviation between same-pair oracle
 * readings beyond the policy threshold, stale feeds, and deviation from
 * policy reference prices. All arithmetic is exact (BigInt rationals).
 */
export function detectOracleManipulation(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { policy, bundle } = context;
  const oracles = bundle.oracles ?? [];

  const byPair = new Map<string, OracleObservation[]>();
  for (const reading of oracles) {
    const bucket = byPair.get(reading.pair) ?? [];
    bucket.push(reading);
    byPair.set(reading.pair, bucket);
  }

  for (const [pair, readings] of byPair) {
    if (policy.maxOracleDeviationBasisPoints !== undefined && readings.length >= 2) {
      // Compare the FIRST TWO observations deterministically (the
      // observation bundle is order-stable by construction).
      const left = readings[0];
      const right = readings[1];
      if (left !== undefined && right !== undefined) {
        const deviation = rationalDeviationBps(left.observedPrice, right.observedPrice);
        if (rationalExceedsInteger(deviation, policy.maxOracleDeviationBasisPoints)) {
          signals.push({
            family: "oracle_manipulation",
            code: "oracle_pairwise_deviation_exceeds_threshold",
            severity: "critical",
            method: "threshold_breach",
            corroborations: readings.length - 2,
            evidence: baseEvidence(context, [left.observationId, right.observationId], [
              {
                label: "pairwise_price_deviation_bps",
                unit: "rational",
                observed: deviation,
                expected: `${policy.maxOracleDeviationBasisPoints}/1`,
              },
            ]),
            summary: `oracle readings for ${pair} deviate by ${deviation} bps (threshold ${policy.maxOracleDeviationBasisPoints} bps): ${left.oracleId}=${left.observedPrice} vs ${right.oracleId}=${right.observedPrice}`,
          });
        }
      }
    }

    if (policy.maxOracleFeedAgeMs !== undefined) {
      for (const reading of readings) {
        if (reading.feedAgeMs > policy.maxOracleFeedAgeMs) {
          signals.push({
            family: "oracle_manipulation",
            code: "oracle_feed_stale",
            severity: "high",
            method: "threshold_breach",
            corroborations: 0,
            evidence: baseEvidence(context, [reading.observationId], [
              {
                label: "oracle_feed_age_ms",
                unit: "milliseconds",
                observed: reading.feedAgeMs.toString(),
                expected: policy.maxOracleFeedAgeMs.toString(),
              },
            ]),
            summary: `oracle ${reading.oracleId} for ${pair} feed is ${reading.feedAgeMs}ms old (max ${policy.maxOracleFeedAgeMs}ms)`,
          });
        }
      }
    }
  }

  // Reference-price deviation (when the policy pins references).
  if (policy.maxOracleReferenceDeviationBasisPoints !== undefined) {
    for (const reference of policy.referenceOraclePrices ?? []) {
      for (const reading of oracles.filter((o) => o.pair === reference.pair)) {
        const deviation = rationalDeviationBps(reading.observedPrice, reference.price);
        if (rationalExceedsInteger(deviation, policy.maxOracleReferenceDeviationBasisPoints)) {
          signals.push({
            family: "oracle_manipulation",
            code: "oracle_reference_deviation_exceeds_threshold",
            severity: "high",
            method: "threshold_breach",
            corroborations: 0,
            evidence: baseEvidence(context, [reading.observationId], [
              {
                label: "reference_price_deviation_bps",
                unit: "rational",
                observed: deviation,
                expected: `${policy.maxOracleReferenceDeviationBasisPoints}/1`,
              },
            ]),
            summary: `oracle ${reading.oracleId} for ${reference.pair} deviates ${deviation} bps from the policy reference ${reference.price} (max ${policy.maxOracleReferenceDeviationBasisPoints} bps)`,
          });
        }
      }
    }
  }

  return signals;
}

