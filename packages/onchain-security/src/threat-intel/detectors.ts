/**
 * @payswap/onchain-security/threat-intel — the 13-family detector sweep
 * (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/detectors.ts, split for the
 * ≤400-line law; the detectors themselves live in detectors-approvals.ts
 * (families 1–4), detectors-infra.ts (families 5–8) and
 * detectors-state.ts (families 9–13)).
 *
 * `runAllDetectors` sweeps every family detector over the context in
 * deterministic family order and returns raw signals; the agent
 * (agent.ts) builds/validates them into ThreatSignals.
 */

import type { DetectionContext, RawSignal } from "./detectors-context.ts";
import type { ThreatFamily } from "./families.ts";
import {
  detectHoneypotTransferRestriction,
  detectMaliciousApprovalPermit,
  detectTokenImpersonation,
  detectUnexpectedSpender,
} from "./detectors-approvals.ts";
import {
  detectOracleManipulation,
  detectProxyAdminChange,
} from "./detectors-infra.ts";
import {
  detectBridgeCompromise,
  detectMevSandwichExposure,
} from "./detectors-mev-bridge.ts";
import {
  detectDestinationChainConfusion,
  detectReplaySignatureDomain,
} from "./detectors-state.ts";
import {
  detectFinalityReorgAnomaly,
  detectStaleChangedSimulation,
  detectUnexpectedBalanceDelta,
} from "./detectors-consistency.ts";

/** One family detector: family id + deterministic detect function. */
export interface FamilyDetector {
  readonly family: ThreatFamily;
  readonly detect: (context: DetectionContext) => readonly RawSignal[];
}

/** All 13 detectors, in family order (deterministic). */
export const FAMILY_DETECTORS: readonly FamilyDetector[] = Object.freeze([
  { family: "malicious_approval_permit", detect: detectMaliciousApprovalPermit },
  { family: "unexpected_spender", detect: detectUnexpectedSpender },
  { family: "token_impersonation", detect: detectTokenImpersonation },
  { family: "honeypot_transfer_restriction", detect: detectHoneypotTransferRestriction },
  { family: "proxy_admin_change", detect: detectProxyAdminChange },
  { family: "oracle_manipulation", detect: detectOracleManipulation },
  { family: "bridge_compromise", detect: detectBridgeCompromise },
  { family: "mev_sandwich_exposure", detect: detectMevSandwichExposure },
  { family: "destination_chain_confusion", detect: detectDestinationChainConfusion },
  { family: "replay_signature_domain", detect: detectReplaySignatureDomain },
  { family: "unexpected_balance_delta", detect: detectUnexpectedBalanceDelta },
  { family: "stale_changed_simulation", detect: detectStaleChangedSimulation },
  { family: "finality_reorg_anomaly", detect: detectFinalityReorgAnomaly },
]);

/**
 * Run every family detector over the context (deterministic order, family
 * by family). Returns raw signals; the agent builds/validates them.
 */
export function runAllDetectors(context: DetectionContext): readonly RawSignal[] {
  const raw: RawSignal[] = [];
  for (const detector of FAMILY_DETECTORS) {
    raw.push(...detector.detect(context));
  }
  return raw;
}
