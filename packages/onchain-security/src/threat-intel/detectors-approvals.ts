/**
 * @payswap/onchain-security/threat-intel — family detectors 1–4
 * (approval-plane threats: malicious approvals/permits, unexpected
 * spenders, token impersonation, honeypot/transfer restrictions)
 * (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law).
 *
 * Each detector is a DETERMINISTIC PURE FUNCTION returning raw signals —
 * observations of threats with their evidence chains, NEVER verdicts.
 * Detection discipline: evidence-generating, exact arithmetic only,
 * absence-of-intelligence is weak evidence only where the policy demands
 * coverage, deterministic ordering.
 */

import type { DetectionContext, RawSignal } from "./detectors-context.ts";
import { baseEvidence, intentAssets } from "./detectors-context.ts";
import { compareAmounts } from "../pins/index.ts";
import { sameAsset } from "../types.ts";

// ---------------------------------------------------------------------------
// Family 1 — malicious approvals/permits
// ---------------------------------------------------------------------------

/**
 * Detect malicious approvals/permits: unlimited approvals when forbidden,
 * over-cap approvals, allowances to drain-pattern spenders, and expired
 * permit deadlines.
 */
export function detectMaliciousApprovalPermit(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy, bundle, at } = context;

  for (const approval of write.approvals) {
    const spenderIntel = (bundle.spenders ?? []).find(
      (entry) => entry.spender === approval.spender,
    );
    const observationRefs = [
      `approval:${approval.spender}`,
      ...(spenderIntel === undefined ? [] : [spenderIntel.observationId]),
    ];

    if (approval.unlimited && policy.forbidUnlimitedApprovals) {
      signals.push({
        family: "malicious_approval_permit",
        code: "unlimited_approval_forbidden",
        severity: "critical",
        method: "structural_mismatch",
        corroborations: spenderIntel?.knownDrainPattern === true ? 1 : 0,
        evidence: baseEvidence(context, observationRefs, [
          {
            label: "approval_allowance",
            unit: "boolean",
            observed: "true",
            expected: "false",
          },
        ]),
        summary: `unlimited approval to spender ${approval.spender} while policy forbids unlimited allowances`,
      });
      continue;
    }

    const cap = policy.maxApprovalAmount;
    if (cap !== undefined && !approval.unlimited) {
      if (cap.currency !== approval.amount.currency) {
        signals.push({
          family: "malicious_approval_permit",
          code: "approval_cap_currency_mismatch",
          severity: "high",
          method: "structural_mismatch",
          corroborations: 0,
          evidence: baseEvidence(context, observationRefs, [
            {
              label: "approval_currency",
              unit: "count",
              observed: "1",
              expected: "1",
            },
          ]),
          summary: `approval currency ${approval.amount.currency} does not match policy cap currency ${cap.currency}`,
        });
        continue;
      }
      if (compareAmounts(approval.amount, cap) > 0) {
        signals.push({
          family: "malicious_approval_permit",
          code: "approval_exceeds_policy_cap",
          severity: "high",
          method: "threshold_breach",
          corroborations: spenderIntel?.knownDrainPattern === true ? 1 : 0,
          evidence: baseEvidence(context, observationRefs, [
            {
              label: "approval_minor_units",
              unit: "minor_units",
              observed: approval.amount.minorUnits,
              expected: cap.minorUnits,
            },
          ]),
          summary: `approval of ${approval.amount.minorUnits} ${approval.amount.currency} to ${approval.spender} exceeds the policy cap ${cap.minorUnits}`,
        });
        continue;
      }
    }

    if (spenderIntel?.knownDrainPattern === true) {
      signals.push({
        family: "malicious_approval_permit",
        code: "approval_to_drain_pattern_spender",
        severity: "critical",
        method: "behavioral_pattern",
        corroborations: (spenderIntel.observedIncidents ?? 0) > 0 ? 1 : 0,
        evidence: baseEvidence(context, observationRefs),
        summary: `spender ${approval.spender} carries a known drain pattern in spender intelligence`,
      });
    }
  }

  const domain = bundle.domain;
  if (domain?.permitDeadline !== undefined && domain.permitDeadline <= at) {
    signals.push({
      family: "malicious_approval_permit",
      code: "permit_deadline_expired",
      severity: "high",
      method: "threshold_breach",
      corroborations: 0,
      evidence: baseEvidence(context, [domain.observationId], [
        {
          label: "permit_deadline_ms",
          unit: "milliseconds",
          observed: domain.permitDeadline.toString(),
          expected: (at + 1).toString(),
        },
      ]),
      summary: `permit deadline ${domain.permitDeadline} is at/before the evaluation instant ${at}`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 2 — unexpected spenders
// ---------------------------------------------------------------------------

/** Detect unexpected spenders: unapproved, too-recent, incident-heavy. */
export function detectUnexpectedSpender(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy, bundle, at } = context;

  for (const approval of write.approvals) {
    const intel = (bundle.spenders ?? []).find(
      (entry) => entry.spender === approval.spender,
    );
    const observationRefs = [`approval:${approval.spender}`];

    if (policy.allowedSpenders !== undefined && !policy.allowedSpenders.includes(approval.spender)) {
      signals.push({
        family: "unexpected_spender",
        code: "spender_not_in_policy_allowlist",
        severity: "high",
        method: "exact_identity_match",
        corroborations: 0,
        evidence: baseEvidence(context, observationRefs),
        summary: `spender ${approval.spender} is not in the policy allowlist`,
      });
    }

    if (intel !== undefined) {
      observationRefs.push(intel.observationId);
      if (
        intel.firstObservedAt !== undefined &&
        policy.spenderMinimumAgeMs !== undefined &&
        at - intel.firstObservedAt < policy.spenderMinimumAgeMs
      ) {
        signals.push({
          family: "unexpected_spender",
          code: "spender_below_minimum_age",
          severity: "medium",
          method: "threshold_breach",
          corroborations: 0,
          evidence: baseEvidence(context, observationRefs, [
            {
              label: "spender_age_ms",
              unit: "milliseconds",
              observed: (at - intel.firstObservedAt).toString(),
              expected: policy.spenderMinimumAgeMs.toString(),
            },
          ]),
          summary: `spender ${approval.spender} was first observed ${at - intel.firstObservedAt}ms ago (minimum ${policy.spenderMinimumAgeMs}ms)`,
        });
      }
      if (
        policy.spenderIncidentThreshold !== undefined &&
        (intel.observedIncidents ?? 0) >= policy.spenderIncidentThreshold
      ) {
        signals.push({
          family: "unexpected_spender",
          code: "spender_incident_threshold_reached",
          severity: "high",
          method: "behavioral_pattern",
          corroborations: 0,
          evidence: baseEvidence(context, observationRefs, [
            {
              label: "spender_incidents",
              unit: "count",
              observed: (intel.observedIncidents ?? 0).toString(),
              expected: policy.spenderIncidentThreshold.toString(),
            },
          ]),
          summary: `spender ${approval.spender} carries ${intel.observedIncidents} observed incidents (threshold ${policy.spenderIncidentThreshold})`,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 3 — token impersonation
// ---------------------------------------------------------------------------

/** Detect token impersonation: fake/uncertified tokens mimicking canonical assets. */
export function detectTokenImpersonation(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { write, policy, bundle } = context;
  const tokens = bundle.tokens ?? [];

  for (const asset of intentAssets(context)) {
    const entry = tokens.find((candidate) => sameAsset(candidate.asset, asset));
    const registryRef = `registry:${asset.chain}:${asset.assetId}`;
    if (entry !== undefined) {
      if (entry.impersonatesAssetId !== undefined) {
        signals.push({
          family: "token_impersonation",
          code: "impersonator_token_identified",
          severity: "critical",
          method: "exact_identity_match",
          corroborations: entry.canonical === false ? 1 : 0,
          evidence: baseEvidence(context, [entry.observationId, registryRef], [
            {
              label: "impersonated_asset_id",
              unit: "count",
              observed: "1",
              expected: "0",
            },
          ]),
          summary: `asset ${asset.assetId} (${asset.symbol} on ${asset.chain}) is an impersonator of canonical asset ${entry.impersonatesAssetId}`,
        });
      } else if (policy.requireTokenRegistryCoverage && !entry.canonical) {
        signals.push({
          family: "token_impersonation",
          code: "asset_not_canonical_in_registry",
          severity: "high",
          method: "exact_identity_match",
          corroborations: 0,
          evidence: baseEvidence(context, [entry.observationId, registryRef], [
            {
              label: "registry_canonical",
              unit: "boolean",
              observed: entry.canonical ? "true" : "false",
              expected: "true",
            },
          ]),
          summary: `asset ${asset.assetId} (${asset.symbol} on ${asset.chain}) is not canonical in the observed registry`,
        });
      }
    } else if (policy.requireTokenRegistryCoverage) {
      // Absence of registry coverage: weak evidence — the policy's
      // confidence floor keeps this at REQUIRE_CONFIRMATION, never BLOCK.
      signals.push({
        family: "token_impersonation",
        code: "asset_absent_from_registry_observation",
        severity: "medium",
        method: "registry_absence",
        corroborations: 0,
        evidence: baseEvidence(context, [
          `registry:${asset.chain}:${asset.assetId}`,
        ], [
          {
            label: "registry_coverage",
            unit: "count",
            observed: "0",
            expected: "1",
          },
        ]),
        summary: `asset ${asset.assetId} (${asset.symbol} on ${asset.chain}) is absent from the observed token registry (coverage required by policy)`,
      });
    }
  }

  // Lookalike detection inside the registry itself: two entries, same
  // symbol+chain, different assetIds, one canonical and one not.
  for (const candidate of tokens) {
    if (candidate.canonical || candidate.impersonatesAssetId === undefined) {
      continue;
    }
    const target = tokens.find(
      (other) =>
        other.canonical &&
        other.asset.chain === candidate.asset.chain &&
        other.asset.assetId === candidate.impersonatesAssetId,
    );
    if (target !== undefined && target.asset.symbol === candidate.asset.symbol) {
      const touchesIntent = intentAssets(context).some((asset) => sameAsset(asset, candidate.asset));
      if (touchesIntent) {
        signals.push({
          family: "token_impersonation",
          code: "registry_impersonation_pair_observed",
          severity: "high",
          method: "behavioral_pattern",
          corroborations: 1,
          evidence: baseEvidence(context, [
            candidate.observationId,
            target.observationId,
          ], [
            {
              label: "impersonation_pairs",
              unit: "count",
              observed: "1",
              expected: "0",
            },
          ]),
          summary: `registry observes impersonation pair: ${candidate.asset.assetId} mimics canonical ${target.asset.assetId} (${candidate.asset.symbol} on ${candidate.asset.chain})`,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Family 4 — honeypot/transfer restrictions
// ---------------------------------------------------------------------------

/** Detect honeypot/transfer restrictions via registry markers. */
export function detectHoneypotTransferRestriction(context: DetectionContext): readonly RawSignal[] {
  const signals: RawSignal[] = [];
  const { bundle } = context;
  const tokens = bundle.tokens ?? [];

  for (const asset of intentAssets(context)) {
    const entry = tokens.find((candidate) => sameAsset(candidate.asset, asset));
    if (entry === undefined) {
      continue;
    }
    if (entry.transferRestricted === true) {
      signals.push({
        family: "honeypot_transfer_restriction",
        code: "token_transfer_restricted",
        severity: "critical",
        method: "behavioral_pattern",
        corroborations: entry.sellable === false ? 1 : 0,
        evidence: baseEvidence(context, [entry.observationId, `registry:${asset.chain}:${asset.assetId}`], [
          {
            label: "transfer_restricted",
            unit: "boolean",
            observed: "true",
            expected: "false",
          },
        ]),
        summary: `asset ${asset.assetId} (${asset.symbol}) is registry-observed as transfer-restricted (honeypot marker)`,
      });
    }
    if (entry.sellable === false) {
      signals.push({
        family: "honeypot_transfer_restriction",
        code: "token_not_sellable",
        severity: "high",
        method: "behavioral_pattern",
        corroborations: 0,
        evidence: baseEvidence(context, [entry.observationId, `registry:${asset.chain}:${asset.assetId}`], [
          {
            label: "sellable",
            unit: "boolean",
            observed: "false",
            expected: "true",
          },
        ]),
        summary: `asset ${asset.assetId} (${asset.symbol}) is registry-observed as not sellable (value in, no value out)`,
      });
    }
  }

  return signals;
}
