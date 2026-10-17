/**
 * @payswap/onchain-security/threat-intel — the threat signature pack: the
 * intelligence-registry alignment surface (R2-W2; PORT+ADAPT of
 * payswap.org@8a735bf packages/onchain-threat-intel/src/advisory-bridge.ts,
 * split for the ≤400-line law).
 *
 * `buildThreatSignatureForTarget` builds one registration input,
 * structurally assignable to the threat signature registry's register
 * input (signatureId, kind, title, description, affected scope,
 * indicators, declaredBy, publishedAt): one registration per (family,
 * target component) with indicators naming the family's signal class, so
 * immune-system signature matching observes onchain threat intelligence.
 *
 * Deterministic only: pure functions of explicit inputs.
 */

import type { ThreatFamily } from "./families.ts";
import type { ThreatAffectedComponent } from "./advisory-bridge.ts";

/** The signature kind vocabulary (structurally identical literals). */
export const THREAT_SIGNATURE_KINDS = [
  "vulnerable_package",
  "vulnerable_extension",
  "malicious_behavior",
  "abuse_pattern",
  "credential_compromise",
] as const;

export type ThreatSignatureKind = (typeof THREAT_SIGNATURE_KINDS)[number];

/** Family → signature kind (deterministic mapping). */
export const FAMILY_SIGNATURE_KIND: Readonly<Record<ThreatFamily, ThreatSignatureKind>> =
  Object.freeze({
    malicious_approval_permit: "malicious_behavior",
    unexpected_spender: "malicious_behavior",
    token_impersonation: "malicious_behavior",
    honeypot_transfer_restriction: "malicious_behavior",
    proxy_admin_change: "vulnerable_extension",
    oracle_manipulation: "vulnerable_extension",
    bridge_compromise: "vulnerable_extension",
    mev_sandwich_exposure: "abuse_pattern",
    destination_chain_confusion: "malicious_behavior",
    replay_signature_domain: "credential_compromise",
    unexpected_balance_delta: "malicious_behavior",
    stale_changed_simulation: "abuse_pattern",
    finality_reorg_anomaly: "abuse_pattern",
  });

/** One signature indicator (action pattern, token family or signal class). */
export interface ThreatSignatureIndicator {
  readonly indicatorId: string;
  readonly kind: "action_pattern" | "token_family" | "signal_class";
  readonly pattern: string;
}

/**
 * A signature registration input, structurally assignable to the threat
 * signature registry's register input. The registry computes provenance
 * content hashes at registration time.
 */
export interface ThreatSignatureRegistration {
  readonly signatureId: string;
  readonly kind: ThreatSignatureKind;
  readonly title: string;
  readonly description: string;
  readonly affected: ThreatAffectedComponent;
  readonly indicators: readonly ThreatSignatureIndicator[];
  readonly declaredBy: string;
  readonly publishedAt: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

import { familySignalClass } from "./families.ts";
import { isImmuneComponentKind } from "./advisory-bridge.ts";
import { ValidationError } from "../pins/index.ts";

/**
 * Build one family signature registration scoped to a concrete target
 * component (the registry's matching is identity-scoped: kind + id + range).
 * The indicator is the family's signal class, so immune-system observation
 * matching (signalClass pattern) picks up onchain threat intelligence.
 *
 * The `actionPattern` argument adds an optional trust-action indicator
 * (e.g. "onchain.approval.*") for behavioral matching.
 */
export function buildThreatSignatureForTarget(
  family: ThreatFamily,
  target: ThreatAffectedComponent,
  input: {
    declaredBy: string;
    publishedAt: number;
    actionPattern?: string;
  },
): ThreatSignatureRegistration {
  if (!isImmuneComponentKind(target.kind)) {
    throw new ValidationError(
      `unknown immune component kind '${String(target.kind)}'`,
    );
  }
  if (target.id.length === 0) {
    throw new ValidationError("signature target id must be non-empty");
  }
  if (input.declaredBy.length === 0) {
    throw new ValidationError("declaredBy must be a non-empty provenance ref");
  }
  const indicators: ThreatSignatureIndicator[] = [
    {
      indicatorId: `${family}:signal-class`,
      kind: "signal_class",
      pattern: familySignalClass(family),
    },
  ];
  if (input.actionPattern !== undefined && input.actionPattern.length > 0) {
    indicators.push({
      indicatorId: `${family}:action-pattern`,
      kind: "action_pattern",
      pattern: input.actionPattern,
    });
  }
  return {
    signatureId: `sig:${family}:${target.kind}:${target.id}`,
    kind: FAMILY_SIGNATURE_KIND[family],
    title: `${family} threat signature (${target.kind} ${target.id})`,
    description: `Onchain threat intelligence signature for family '${family}', scoped to component ${target.kind}:${target.id}. Raised from the adversarial threat-intel detectors; match observations carrying signal class '${familySignalClass(family)}'.`,
    affected: target,
    indicators,
    declaredBy: input.declaredBy,
    publishedAt: input.publishedAt,
  };
}
