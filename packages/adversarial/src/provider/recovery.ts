/**
 * @payswap/adversarial — the recovery-path contracts (P6-W3, lane r4-w3;
 * ADAPT of payswap.org@8a735bf packages/adversarial — the old harness's
 * "exact recovery/reconciliation path" law, preserved as DECLARATIVE
 * ordered-step contracts per family).
 *
 * The old fault modules each ENACTED their recovery path against the
 * real old-repo subsystems (protocol/journeys/rails machinery that
 * does not exist at this base). The LAWS those paths obeyed are the
 * durable content — each family below carries its recovery contract as
 * pure data: the ordered steps, each citing the canonical invariant it
 * satisfies. The wiring layer (and the composition tests) walk these
 * contracts against the REAL immune machinery of THIS package.
 *
 * Deterministic only: pure data.
 */

import type { ProviderThreatFamily } from "./families.ts";

/** One ordered recovery step of a family contract. */
export interface RecoveryStepContract {
  readonly stepId: string;
  readonly summary: string;
  /** The canonical law this step satisfies. */
  readonly invariantRefs: readonly string[];
}

/** A family's full recovery-path contract (ordered steps, pure data). */
export interface FamilyRecoveryContract {
  readonly family: ProviderThreatFamily;
  readonly steps: readonly RecoveryStepContract[];
}

/** One step builder (deterministic, ordered by construction). */
function step(
  stepId: string,
  summary: string,
  ...invariantRefs: readonly string[]
): RecoveryStepContract {
  return Object.freeze({ stepId, summary, invariantRefs: Object.freeze(invariantRefs) });
}

/** The eleven recovery-path contracts (the exact recovery laws). */
export const PROVIDER_FAMILY_RECOVERY_CONTRACTS: Readonly<
  Record<ProviderThreatFamily, FamilyRecoveryContract>
> = Object.freeze({
  duplicated_commands: {
    family: "duplicated_commands",
    steps: [
      step("replay-held", "the replay is held by the idempotency registrar (one key → one authoritative result)", "INV-6"),
      step("journal-verified", "verify the journal was not double-posted by the replay", "INV-3", "INV-6"),
      step("conflict-refusal", "refuse the mutated re-binding with CONFLICT (state unchanged)", "INV-6"),
    ],
  },
  lost_webhooks: {
    family: "lost_webhooks",
    steps: [
      step("pending-preserved", "keep the outbox event PENDING through the loss (no silent loss)", "INV-14"),
      step("external-refetch", "re-fetch the external object from the provider (reconciliation input)", "INV-14"),
      step("reconcile", "reconcile the re-fetched state against the local record", "INV-4", "INV-5"),
      step("history-append", "append the re-fetch to the append-only history", "INV-3"),
    ],
  },
  ambiguous_provider: {
    family: "ambiguous_provider",
    steps: [
      step("unknown-preserved", "preserve UNKNOWN — never map it to FAILED", "INV-4"),
      step("blind-retry-forbidden", "refuse the blind retry", "INV-4"),
      step("reconcile", "reconcile the ambiguous outcome against the provider's authoritative record", "INV-4", "INV-5"),
      step("safe-to-retry", "retry ONLY after reconciliation marks the path SAFE_TO_RETRY", "INV-4"),
    ],
  },
  account_takeover: {
    family: "account_takeover",
    steps: [
      step("epoch-bump", "revoke the temporally-valid authorization through the epoch bump (voids every epoch-scoped authorization under it)", "INV-21"),
      step("quarantine-key", "quarantine the compromised key (the ledger, not a cache)", "INV-19"),
      step("deny-cached-reentry", "deny the quarantined key's cached-capability re-entry", "INV-19", "INV-21"),
      step("re-verify", "recover ONLY through re-verification issuing a fresh epoch-current authorization", "INV-5"),
    ],
  },
  malicious_agent: {
    family: "malicious_agent",
    steps: [
      step("reject-smuggling", "reject the command-shape proposal smuggled at depth", "INV-5"),
      step("deny-unrestricted", "deny every unrestricted-transfer request with a recorded reason", "INV-12"),
      step("refuse-widening", "refuse authority widening on every dimension", "INV-12"),
      step("honest-path-works", "keep the honest attenuated path working (recovery)", "INV-12"),
    ],
  },
  package_compromise: {
    family: "package_compromise",
    steps: [
      step("global-restrict", "restrict the affected package globally through the advisory", "INV-24"),
      step("deny-writes", "prove the compromised package cannot write financial state", "INV-24", "INV-5"),
      step("sealed-immutable", "keep the sealed release immutable (remediation requires a new version)", "INV-3"),
      step("patched-release", "recover via the patched version, advisory closure and evidenced quarantine release", "INV-3", "INV-5"),
    ],
  },
  incentive_sybil_collusion_wash: {
    family: "incentive_sybil_collusion_wash",
    steps: [
      step("exclude-fabricated", "exclude fabricated records (provenance validation)", "INV-5"),
      step("refuse-rank", "refuse rank as authorization", "INV-10"),
      step("clawback-separate", "claw back with a SEPARATE adjustment obligation while history remains", "INV-3"),
      step("gate-enforcement", "recover through gate enforcement and post-hoc clawback", "INV-3", "INV-5"),
    ],
  },
  leaderboard_gaming: {
    family: "leaderboard_gaming",
    steps: [
      step("exclude-unprovenanced", "exclude the fabricated/gamed entries from ranking", "INV-10"),
      step("rerank-verified", "re-rank on the verified set", "INV-10"),
      step("rank-never-authorizes", "keep rank from widening any authority", "INV-10"),
    ],
  },
  provider_outage: {
    family: "provider_outage",
    steps: [
      step("unknown-surfaced", "surface the in-flight write as UNKNOWN requiring reconciliation (never FAILED)", "INV-4"),
      step("window-evidenced", "evidence the outage window and probe recovery before resuming", "INV-14"),
      step("reconcile", "reconcile every in-flight effect against the provider's authoritative record", "INV-4", "INV-5"),
      step("finality-then-redrain", "await finality, then re-drain the outbox", "INV-4", "INV-14"),
    ],
  },
  clock_skew: {
    family: "clock_skew",
    steps: [
      step("no-resurrection", "never resurrect an expired grant through clock regression", "INV-2"),
      step("detect-regression", "detect the epoch regression and keep terminal transitions monotonic", "INV-6"),
      step("cap-unverified-evidence", "cap UI/browser evidence regardless of claims or clock", "INV-5"),
      step("resynchronize", "re-synchronize on the verified clock before further provider writes", "INV-6"),
    ],
  },
  partial_payment: {
    family: "partial_payment",
    steps: [
      step("surface-partial", "surface the partial effect as PARTIALLY_EXECUTED", "INV-4"),
      step("refuse-over-reservation", "refuse the over-reservation without side effects", "INV-2"),
      step("preserve-gross", "preserve gross obligations behind the net position", "INV-3", "INV-2"),
      step("balanced-journal", "complete with evidence on a balanced journal (recovery)", "INV-3", "INV-5"),
    ],
  },
});

/** The recovery contract of one family (fail-closed lookup). */
export function recoveryContractFor(
  family: ProviderThreatFamily,
): FamilyRecoveryContract {
  const contract = PROVIDER_FAMILY_RECOVERY_CONTRACTS[family];
  if (contract === undefined) {
    throw new Error(`no recovery contract recorded for family '${family}'`);
  }
  return contract;
}
