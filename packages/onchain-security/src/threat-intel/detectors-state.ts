/**
 * @payswap/onchain-security/threat-intel — family detectors 9–10
 * (identity/confusion threats: destination/chain confusion, replay/
 * signature-domain issues)
 * (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law).
 */

import type { DetectionContext, RawSignal } from "./detectors-context.ts";
import { baseEvidence, hopChains } from "./detectors-context.ts";
import { sameAsset } from "../types.ts";

// ---------------------------------------------------------------------------
// Family 9 — destination/chain confusion
// ---------------------------------------------------------------------------

/** Detect destination/chain confusion: hop-chain mismatch, cross-chain address reuse, wrong chain. */
export function detectDestinationChainConfusion(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy, bundle } = context;

  for (const hopChain of hopChains(write)) {
    if (hopChain !== write.chain) {
      signals.push({
        family: "destination_chain_confusion",
        code: "route_hop_chain_mismatch",
        severity: "critical",
        method: "structural_mismatch",
        corroborations: 0,
        evidence: baseEvidence(context, [`route:${write.route.routeId}`], [
          {
            label: "hop_chain_matches_write_chain",
            unit: "boolean",
            observed: "false",
            expected: "true",
          },
        ]),
        summary: `route hop executes on ${hopChain} while the write targets ${write.chain} — one write, one chain`,
      });
    }
  }

  if (policy.expectedChain !== undefined && write.chain !== policy.expectedChain) {
    signals.push({
      family: "destination_chain_confusion",
      code: "write_chain_differs_from_expected",
      severity: "high",
      method: "structural_mismatch",
      corroborations: 0,
      evidence: baseEvidence(context, [`chain:${write.chain}`], [
        {
          label: "write_chain",
          unit: "count",
          observed: "1",
          expected: "1",
        },
      ]),
      summary: `write executes on ${write.chain} but the policy expects ${policy.expectedChain}`,
    });
  }

  const destination = write.transfer?.to;
  if (destination !== undefined) {
    for (const intel of bundle.addresses ?? []) {
      if (intel.address !== destination) {
        continue;
      }
      const activeOnWriteChain = intel.chainsActiveOn.includes(write.chain);
      if (!activeOnWriteChain) {
        signals.push({
          family: "destination_chain_confusion",
          code: "destination_address_active_on_other_chains",
          severity: "high",
          method: "behavioral_pattern",
          corroborations: intel.chainsActiveOn.length > 1 ? 1 : 0,
          evidence: baseEvidence(context, [intel.observationId], [
            {
              label: "destination_active_on_write_chain",
              unit: "boolean",
              observed: "false",
              expected: "true",
            },
          ]),
          summary: `destination ${destination} is observed active on ${intel.chainsActiveOn.join(", ")} but not on the write chain ${write.chain}`,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 10 — replay/signature-domain issues
// ---------------------------------------------------------------------------

/**
 * Detect replay/signature-domain issues: previously observed payload
 * digests, domain/chain mismatches, and nonce reuse.
 */
export function detectReplaySignatureDomain(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, bundle } = context;
  const domain = bundle.domain;
  if (domain === undefined) {
    return signals;
  }

  if (domain.digestPreviouslyObserved) {
    signals.push({
      family: "replay_signature_domain",
      code: "payload_digest_previously_observed",
      severity: "critical",
      method: "exact_identity_match",
      corroborations: 0,
      evidence: baseEvidence(context, [domain.observationId], [
        {
          label: "digest_reuse",
          unit: "count",
          observed: "1",
          expected: "0",
        },
      ]),
      summary: `payload digest ${domain.payloadDigest} was previously observed under domain ${domain.domainRef} — replay risk`,
    });
  }

  if (domain.domainChain !== undefined && domain.domainChain !== write.chain) {
    signals.push({
      family: "replay_signature_domain",
      code: "signature_domain_chain_mismatch",
      severity: "high",
      method: "structural_mismatch",
      corroborations: 0,
      evidence: baseEvidence(context, [domain.observationId], [
        {
          label: "domain_chain_matches_write_chain",
          unit: "boolean",
          observed: "false",
          expected: "true",
        },
      ]),
      summary: `signing domain is bound to ${domain.domainChain} while the write executes on ${write.chain}`,
    });
  }

  if (
    write.nonce !== undefined &&
    domain.nonceLastUsedAt !== undefined &&
    domain.nonceLastUsedAt > 0
  ) {
    signals.push({
      family: "replay_signature_domain",
      code: "nonce_previously_used",
      severity: "high",
      method: "exact_identity_match",
      corroborations: 0,
      evidence: baseEvidence(context, [domain.observationId], [
        {
          label: "nonce_last_used_ms",
          unit: "milliseconds",
          observed: domain.nonceLastUsedAt.toString(),
          expected: "0",
        },
      ]),
      summary: `write nonce '${write.nonce}' was already used (last use at ${domain.nonceLastUsedAt})`,
    });
  }

  return signals;
}

