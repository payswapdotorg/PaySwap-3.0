/**
 * @payswap/adversarial — the agent/plane detectors (P6-W3, lane r4-w3;
 * ADAPT of payswap.org@8a735bf packages/adversarial fault modules
 * account-takeover / malicious-agents / package-compromise /
 * incentive-abuse: the old injection checks re-based as deterministic,
 * evidence-generating detections over the observation bundle).
 *
 * Every detector is a PURE function of (bundle, thresholds) → signals.
 * Detections are EVIDENCE, never verdicts; the BLOCK-grade detections
 * bind only through the escalate-only composition (../block-authority.
 * ts, INV-21) and the advisory outcomes flow through the D-1 bridge.
 *
 * The laws preserved from the old fault modules:
 * - account_takeover: a credential change COMBINED with a sensitive
 *   use inside the change window is critical — the epoch bump revokes
 *   the temporally-valid authorization and the key is quarantined
 *   (cached-capability re-entry denied);
 * - malicious_agent: smuggled command-shaped proposals, unrestricted
 *   transfers and authority-widening attempts are denied with recorded
 *   reasons (the honest attenuated path keeps working);
 * - package_compromise: an observed content digest diverging from the
 *   sealed release is critical — the sealed release is immutable,
 *   remediation requires a NEW version + advisory closure + evidenced
 *   quarantine release;
 * - incentive_sybil_collusion_wash: fabricated records and
 *   rank-as-authorization are excluded (high); anomalous velocity is a
 *   sybil/collusion signal;
 * - leaderboard_gaming: velocity-anomalous or fabricated
 *   leaderboard entries game the ranking — records without provenance
 *   are excluded and rank never widens authority.
 *
 * Deterministic only: same bundle + same thresholds → byte-identical
 * signals.
 */

import type { ProviderObservationBundle } from "./observations.ts";
import type { ProviderThreatSignal } from "./signals.ts";
import type { ProviderDetectorThresholds } from "./detectors-context.ts";
import { calibrateConfidenceBps, delta, digestRefsFor } from "./detectors-context.ts";
import { buildProviderThreatSignal } from "./signals.ts";
import type { ProviderThreatFamily } from "./families.ts";

/** The shared detector input (bundle + thresholds, both pure data). */
export interface AgentDetectorContext {
  readonly bundle: ProviderObservationBundle;
  readonly thresholds: ProviderDetectorThresholds;
}

function signalOf(
  context: AgentDetectorContext,
  input: {
    readonly family: ProviderThreatFamily;
    readonly code: string;
    readonly severity: "info" | "low" | "medium" | "high" | "critical";
    readonly method: "exact_identity_match" | "structural_mismatch" | "threshold_breach" | "behavioral_pattern" | "registry_absence";
    readonly observationRefs: readonly string[];
    readonly deltas?: readonly { readonly label: string; readonly value: string }[];
    readonly summary: string;
    readonly corroborations?: number;
  },
): ProviderThreatSignal {
  return buildProviderThreatSignal({
    family: input.family,
    code: input.code,
    severity: input.severity,
    method: input.method,
    confidenceBps: calibrateConfidenceBps(input.method, input.corroborations ?? 0),
    evidence: {
      observationRefs: input.observationRefs,
      digestRefs: digestRefsFor(input.observationRefs),
      deltas: input.deltas ?? [],
    },
    summary: input.summary,
  });
}

// ---------------------------------------------------------------------------
// account_takeover (old fault family: account-takeover)
// ---------------------------------------------------------------------------

/**
 * Detect account-takeover patterns: a SIM/account change COMBINED with
 * a sensitive-authorization use inside the change window is CRITICAL
 * (the epoch bump + quarantine path); an un-combined change inside a
 * short window is a velocity-grade signal.
 */
export function detectAccountTakeover(context: AgentDetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const change of context.bundle.credentialChanges) {
    const insideWindow = change.sincePreviousChangeMs <= context.thresholds.credentialChangeWindowMs;
    if (change.combinedWithAuthorizationUse && insideWindow) {
      signals.push(
        signalOf(context, {
          family: "account_takeover",
          code:
            change.changeKind === "sim_change"
              ? "sim_change_with_sensitive_use"
              : "credential_change_with_sensitive_use",
          severity: "critical",
          method: "behavioral_pattern",
          corroborations: 2,
          observationRefs: [change.observationId],
          deltas: [
            delta("changeKind", change.changeKind),
            delta("sincePreviousChangeMs", String(change.sincePreviousChangeMs)),
          ],
          summary:
            `${change.changeKind} for ${change.principalRef} combined with a sensitive ` +
            `authorization use inside the change window — revoke via the epoch bump, quarantine ` +
            `the key (cached-capability re-entry denied); recovery requires re-verification ` +
            `issuing a fresh epoch-current authorization`,
        }),
      );
      continue;
    }
    if (change.changeKind === "sim_change" || change.changeKind === "account_change") {
      signals.push(
        signalOf(context, {
          family: "account_takeover",
          code: "credential_change_velocity",
          severity: "medium",
          method: "behavioral_pattern",
          observationRefs: [change.observationId],
          deltas: [delta("sincePreviousChangeMs", String(change.sincePreviousChangeMs))],
          summary:
            `${change.changeKind} for ${change.principalRef} ` +
            `(${change.sincePreviousChangeMs}ms since the previous verified change) — watch; ` +
            `a sensitive use inside the window escalates to the takeover path`,
        }),
      );
    }
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// malicious_agent (old fault family: malicious-agents)
// ---------------------------------------------------------------------------

/**
 * Detect malicious delegated-agent behavior: smuggled command-shaped
 * proposals (invalid proposal shape), unrestricted-transfer requests
 * and authority-widening attempts — each denied with a recorded
 * reason; the honest attenuated path keeps working.
 */
export function detectMaliciousAgent(context: AgentDetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const behavior of context.bundle.agentBehaviors) {
    if (!behavior.proposalShapeValid) {
      signals.push(
        signalOf(context, {
          family: "malicious_agent",
          code: "smuggled_command_proposal",
          severity: "critical",
          method: "structural_mismatch",
          observationRefs: [behavior.observationId],
          deltas: [delta("attemptedAction", behavior.attemptedAction)],
          summary:
            `agent ${behavior.agentKeyRef} smuggled a command-shaped proposal at depth ` +
            `('${behavior.attemptedAction}') — rejected; the command surface is explicit`,
        }),
      );
    }
    if (behavior.unrestrictedTransfer) {
      signals.push(
        signalOf(context, {
          family: "malicious_agent",
          code: "unrestricted_transfer_request",
          severity: "critical",
          method: "behavioral_pattern",
          observationRefs: [behavior.observationId],
          deltas: [delta("attemptedAction", behavior.attemptedAction)],
          summary:
            `agent ${behavior.agentKeyRef} requested an unrestricted transfer ` +
            `('${behavior.attemptedAction}') — denied with a recorded reason (attenuation law)`,
        }),
      );
    }
    if (behavior.authorityWidening) {
      signals.push(
        signalOf(context, {
          family: "malicious_agent",
          code: "authority_widening_attempt",
          severity: "high",
          method: "structural_mismatch",
          observationRefs: [behavior.observationId],
          deltas: [delta("attemptedAction", behavior.attemptedAction)],
          summary:
            `agent ${behavior.agentKeyRef} attempted to widen authority on some dimension ` +
            `('${behavior.attemptedAction}') — refused on every dimension (child delegation is strictly attenuated)`,
        }),
      );
    }
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// package_compromise (old fault family: package-compromise)
// ---------------------------------------------------------------------------

/**
 * Detect package compromises: an observed content digest diverging
 * from the sealed release is CRITICAL (exact identity match — the
 * sealed release is immutable; remediation requires a NEW version,
 * advisory closure and evidenced quarantine release).
 */
export function detectPackageCompromise(context: AgentDetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const integrity of context.bundle.packageIntegrities) {
    if (integrity.observedContentDigest === integrity.expectedContentDigest) {
      continue;
    }
    signals.push(
      signalOf(context, {
        family: "package_compromise",
        code: "sealed_release_digest_divergence",
        severity: "critical",
        method: "exact_identity_match",
        corroborations: 1,
        observationRefs: [integrity.observationId],
        deltas: [
          delta("expectedContentDigest", integrity.expectedContentDigest),
          delta("observedContentDigest", integrity.observedContentDigest),
        ],
        summary:
          `package ${integrity.packageRef}@${integrity.version} content digest diverged from the ` +
          `sealed release — restrict globally through the advisory, quarantine, and remediate via a ` +
          `patched version + advisory closure + evidenced quarantine release (the sealed release is immutable)`,
      }),
    );
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// incentive_sybil_collusion_wash (old fault family: incentive-abuse)
// ---------------------------------------------------------------------------

/**
 * Detect incentive Sybil/collusion/wash patterns: fabricated records
 * (provenance failure) and rank-as-authorization attempts are high;
 * anomalous participant velocity is the sybil/collusion signal
 * (thresholded, exact bps).
 */
export function detectIncentiveAbuse(context: AgentDetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const record of context.bundle.incentiveRecords) {
    if (record.recordKind === "leaderboard_entry") {
      continue; // leaderboard entries are the leaderboard_gaming family
    }
    if (record.fabricated) {
      signals.push(
        signalOf(context, {
          family: "incentive_sybil_collusion_wash",
          code: "fabricated_record_excluded",
          severity: "high",
          method: "structural_mismatch",
          observationRefs: [record.observationId],
          deltas: [delta("recordKind", record.recordKind)],
          summary:
            `${record.recordKind} by ${record.participantRef} in ${record.programRef} failed ` +
            `provenance validation — excluded (fabricated records never rank, never reward)`,
        }),
      );
    }
    if (record.rankClaimed) {
      signals.push(
        signalOf(context, {
          family: "incentive_sybil_collusion_wash",
          code: "rank_as_authorization_refused",
          severity: "high",
          method: "behavioral_pattern",
          observationRefs: [record.observationId],
          deltas: [delta("recordKind", record.recordKind)],
          summary:
            `${record.participantRef} presented rank as authorization in ${record.programRef} — ` +
            `refused (rank is never authorization; the clawback, when ordered, is a SEPARATE ` +
            `adjustment obligation while history remains)`,
        }),
      );
    }
    if (
      record.velocityBps >= context.thresholds.incentiveVelocityMediumBps &&
      !record.fabricated
    ) {
      const severity =
        record.velocityBps >= context.thresholds.incentiveVelocityHighBps ? "high" : "medium";
      signals.push(
        signalOf(context, {
          family: "incentive_sybil_collusion_wash",
          code: "velocity_anomaly",
          severity,
          method: "threshold_breach",
          observationRefs: [record.observationId],
          deltas: [delta("velocityBps", String(record.velocityBps))],
          summary:
            `${record.participantRef} activity velocity ${record.velocityBps}bps over baseline in ` +
            `${record.programRef} — sybil/collusion/wash investigation (gate enforcement + post-hoc clawback on confirmation)`,
        }),
      );
    }
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// leaderboard_gaming (old fault family: incentive-abuse, gaming half)
// ---------------------------------------------------------------------------

/**
 * Detect leaderboard gaming: fabricated or velocity-anomalous
 * leaderboard entries — records without provenance are excluded from
 * ranking and rank never widens authority.
 */
export function detectLeaderboardGaming(context: AgentDetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const record of context.bundle.incentiveRecords) {
    if (record.recordKind !== "leaderboard_entry") {
      continue;
    }
    if (record.fabricated) {
      signals.push(
        signalOf(context, {
          family: "leaderboard_gaming",
          code: "gamed_entry_excluded",
          severity: "high",
          method: "structural_mismatch",
          observationRefs: [record.observationId],
          deltas: [delta("participantRef", record.participantRef)],
          summary:
            `leaderboard entry by ${record.participantRef} in ${record.programRef} failed ` +
            `provenance validation — excluded from ranking (re-rank on the verified set)`,
        }),
      );
    } else if (record.velocityBps >= context.thresholds.incentiveVelocityMediumBps) {
      const severity =
        record.velocityBps >= context.thresholds.incentiveVelocityHighBps ? "high" : "medium";
      signals.push(
        signalOf(context, {
          family: "leaderboard_gaming",
          code: "ranking_velocity_anomaly",
          severity,
          method: "threshold_breach",
          observationRefs: [record.observationId],
          deltas: [delta("velocityBps", String(record.velocityBps))],
          summary:
            `leaderboard velocity ${record.velocityBps}bps over baseline for ${record.participantRef} ` +
            `in ${record.programRef} — gaming investigation; rank never widens authority`,
        }),
      );
    }
  }
  return Object.freeze(signals);
}
