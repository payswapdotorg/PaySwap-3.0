/**
 * @payswap/operations — the assembled operator runbook (P8-W3, law 5).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/runbook.ts.
 * The runbook principle: SYMPTOM -> DIAGNOSIS -> ACTION -> VERIFICATION.
 * Assembly is the whole game: the operational entries are data; operator
 * actions and alert rules reference entries by ID; the assembled index
 * is the single source of truth for existence; checkRunbookIntegrity
 * enforces the no-orphan-alerts law and the no-dangling-reference law in
 * BOTH directions, plus no-silent-entries (every entry declares at least
 * one routing signal) and complete entries (all four sections non-empty).
 *
 * Deterministic only: pure assembly over declared data.
 */

import type { AlertRule } from "./alerting.js";
import { ALERT_RULES } from "./alerting.js";
import type { OperatorActionDeclaration } from "./operator-actions.js";
import { OPERATOR_ACTIONS } from "./operator-actions.js";

// ---------------------------------------------------------------------------
// Runbook entries
// ---------------------------------------------------------------------------

export interface RunbookEntry {
  readonly entryId: string;
  readonly title: string;
  /** The observable condition that routes an operator here. */
  readonly symptom: string;
  readonly diagnosis: readonly string[];
  readonly action: readonly string[];
  readonly verification: readonly string[];
  /** Operator actions documented by this entry (must exist in the catalog). */
  readonly operatorActionIds: readonly string[];
  /** The observability event names that signal this entry. */
  readonly signals: readonly string[];
  readonly source: "OPERATIONS_ENTRY" | "DRILL_ENTRY";
}

/** The operational entries (every alert routes into one of these). */
const OPERATIONS_ENTRIES: readonly RunbookEntry[] = Object.freeze([
  {
    entryId: "rb-unknown-outcome",
    title: "UNKNOWN execution/settlement outcome",
    symptom:
      "unknown-outcome-open / reconciliation-backlog-sla alerts: an attempt's external outcome cannot be determined (timeout, provider error, connection lost mid-write); the surface renders the honest UNKNOWN view with the reconciliation path surfaced — never a failure.",
    diagnosis: [
      "Query the attempt by attemptId — the execution evidence shows the ambiguity.",
      "Check for an existing reconciliation case on the attempt — reconciliation is the AUTHORITATIVE resolution path.",
      "Confirm the command was NOT blindly retried: the idempotency registrar must show the original command still mapped to the in-flight/UNKNOWN attempt.",
    ],
    action: [
      "Verify no blind retry is scheduled: the outbox drain and execution plane fail-stop on ambiguity.",
      "Execute trigger-reconciliation to open the case keyed to the attempt and its obligation.",
      "Observe the provider's native state; the observation — not optimism — determines what happened.",
      "Record the authoritative resolution; only reconciliation changes the terminal presentation of an ambiguous effect.",
    ],
    verification: [
      "The attempt shows a terminal state with evidence lineage and the case is resolved.",
      "journey.terminal-transition.* fired with settlementId+obligationId+evidenceId correlation keys.",
      "No second external effect exists for the same command (one authoritative result).",
    ],
    operatorActionIds: ["trigger-reconciliation"],
    signals: [
      "execution.attempt.outcome-unknown",
      "execution.attempt.awaiting-reconciliation",
      "reconciliation.case-opened",
      "reconciliation.case-resolved",
    ],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-outbox-backlog",
    title: "Outbox backlog growing",
    symptom:
      "outbox-backlog-growing alert: the outbox drain is falling behind committed mutations — events are delayed (never lost while the contract holds).",
    diagnosis: [
      "Check the drain rate vs enqueue rate by eventId — is the publisher slow or the enqueue rate spiking?",
      "Check for fail-stopped drains: an ambiguous publication halts the drain until its reconciliation case resolves.",
    ],
    action: [
      "Resolve any ambiguous publication through the UNKNOWN-outcome entry first (the drain cannot resume past it).",
      "Scale the draining plane; the outbox itself never drops events.",
    ],
    verification: [
      "Backlog depth returns to zero and outbox.record-published events resume for every committed mutation.",
    ],
    operatorActionIds: [],
    signals: ["outbox.backlog-growing"],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-outbox-ambiguity",
    title: "Ambiguous outbox publication (drain fail-stopped)",
    symptom:
      "outbox-publication-ambiguous alert: a publisher's outcome is UNKNOWN; the drain FAILS STOP, the record stays PENDING, and no blind retry is scheduled.",
    diagnosis: [
      "Identify the record by eventId/commandId — which external sink produced the ambiguity.",
      "Determine whether the sink observed the write: query the sink-side state for the event id.",
    ],
    action: [
      "Open/resolve a reconciliation case for the ambiguous publication (reconciliation is authoritative).",
      "After resolution, resume the drain — the record is NEVER coerced to FAILED while ambiguous.",
    ],
    verification: [
      "The record leaves PENDING with a resolution-backed status and evidence.",
      "No duplicate external effect was created by the resumed drain.",
    ],
    operatorActionIds: ["trigger-reconciliation"],
    signals: ["outbox.publication-ambiguous"],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-security-quarantine",
    title: "Security quarantine of a component",
    symptom:
      "security-quarantine-imposed alert: a security advisory quarantined a component; capability accesses through it are denied with an enforcement record.",
    diagnosis: [
      "Read the advisory by advisoryId — severity, affected components, remediation guidance.",
      "Check the current security epoch and the quarantine record — enforcement is epoch-checked.",
      "Inventory affected in-flight executions keyed by attemptId.",
    ],
    action: [
      "Confirm the restriction's scope: which components the advisory restricts and which flows depend on them.",
      "Remediate the affected component per the advisory's guidance; record the remediation evidence.",
      "Execute release-quarantine ONLY after remediation evidence exists — atomic with the epoch bump.",
    ],
    verification: [
      "security.epoch-bumped fires correlated to the advisoryId and new epoch.",
      "A stale-epoch authorization attempt is denied with an enforcement record.",
      "The advisory shows its closure with remediation references (evidence immutable).",
    ],
    operatorActionIds: ["release-quarantine"],
    signals: [
      "security.quarantine-imposed",
      "security.epoch-bumped",
    ],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-parity-drift",
    title: "Environment configuration drift",
    symptom:
      "parity-drift-detected alert (or the release gate's parity check failed): the compared environment manifests differ outside the explicit allowlist.",
    diagnosis: [
      "Run verifyEnvironmentParity over the two manifests — the report lists per-plane version drift and unexpected config differences.",
      "Classify the drift: forgotten promotion vs divergence (a direct production edit).",
    ],
    action: [
      "Promote the drifted configuration through the normal release path (the lower tier exists to prove the higher tier's shape).",
      "For direct edits: either promote the same change down/up or revert — parity is the contract, not a preference.",
    ],
    verification: [
      "verifyEnvironmentParity passes: same plane set, same versions, differences only on PARITY_ALLOWED_DIFFERENCES.",
    ],
    operatorActionIds: [],
    signals: ["deployment.parity-drift-detected"],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-secret-exposure",
    title: "Secret exposure detected in an operational artifact",
    symptom:
      "secret-exposure-detected alert: an operational artifact contains a secret VALUE or a direct (non-`*_REF`) secret key.",
    diagnosis: [
      "Run checkSecretReferenceHygiene over the offending artifact — the report lists forbidden keys and embedded values.",
      "Identify the artifact's provenance: which deploy/PR introduced it.",
    ],
    action: [
      "Remove the exposed value from the artifact immediately; rotate the exposed secret through its rotation procedure — exposure invalidates the key's confidentiality.",
      "For authorization-sensitive keys, execute the epoch bump as part of the rotation so authorizations under the exposed key are refused.",
      "Record the incident (incidents feed security learning).",
    ],
    verification: [
      "checkSecretReferenceHygiene passes on the corrected artifact.",
      "The rotated key resolves and the old (exposed) key is revoked with evidence.",
    ],
    operatorActionIds: [],
    signals: ["secrets.exposure-detected"],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-rollout-hold",
    title: "Provider rollout hold / resume",
    symptom:
      "rollout-stage-held alert: a rollout stage's hold criteria tripped — progressive exposure is frozen at the current stage (or an operator needs to freeze/resume a rollout).",
    diagnosis: [
      "Read the stage verdict by providerName + releaseId — which hold criterion tripped (error budget, reconciliation backlog, counter threshold).",
      "Check the exact provider environment the stage runs in (execution mode, transport class, credential handle).",
    ],
    action: [
      "Execute hold-rollout-stage to freeze exposure while the criteria are investigated.",
      "Clear the hold criteria (or record an explicit override with evidence), then execute resume-rollout — a SENIOR_OPERATOR action.",
      "If the rollback criteria (not merely hold) tripped, execute the rollback path instead: rb-rollback-execution.",
    ],
    verification: [
      "provider.rollout-stage-verdict events show the HOLD -> (ADVANCE|ROLLBACK) transition with evidence.",
      "The rollout ledger shows no exposure advance while held.",
    ],
    operatorActionIds: ["hold-rollout-stage", "resume-rollout"],
    signals: ["provider.rollout-stage-verdict"],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-rollback-execution",
    title: "Rollback execution (compensation completion)",
    symptom:
      "rollback-executed alert: an operator executed a rollback artifact — the compensations must complete and be verified.",
    diagnosis: [
      "Load the rollback record by rollbackId — its target promotion, mode and compensation entries.",
      "Verify the compensation laws held: order-independence and idempotence proofs green.",
    ],
    action: [
      "Track every compensation entry to completion (each references its obligation and reconciliation requirement).",
      "For entries requiring reconciliation, follow rb-unknown-outcome until every case resolves.",
      "Re-promotion requires a FRESH promotion record with fresh evidence and fresh rollout gates — never a rollback undo.",
    ],
    verification: [
      "Every compensated obligation shows its terminal state with evidence lineage.",
      "checkRollbackCoverage is green on the updated ledger (every promotion has its rollback).",
    ],
    operatorActionIds: ["execute-rollback"],
    signals: ["release.rollback-executed"],
    source: "OPERATIONS_ENTRY",
  },
  {
    entryId: "rb-restore-replay",
    title: "Restore/replay drill (authoritative reconstruction)",
    symptom:
      "restore-replay-drill-stale alert (or the scheduled drill is due): restore/replay must be PROVEN able to reconstruct authoritative state.",
    diagnosis: [
      "Identify the last verified backup point and the journal tail after it.",
      "Confirm the outbox position at the backup point — committed mutations' events must replay.",
    ],
    action: [
      "Execute run-restore-replay-drill against a staging copy of production-shaped data (never production itself).",
      "Verify reconstruction: journal-replayed projections, outbox drain, reconciliation of unverifiable external effects.",
    ],
    verification: [
      "deployment.restore-replay-drill fires with the drill's evidence reference.",
      "Post-restore projections equal the pre-incident values modulo replayed committed mutations — recomputed from the journal.",
    ],
    operatorActionIds: ["run-restore-replay-drill"],
    signals: ["deployment.restore-replay-drill"],
    source: "DRILL_ENTRY",
  },
]);

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the indexed operations runbook: the operational entries, each
 * annotated with the alert IDs that route into it.
 */
export function buildOperationsRunbook(input?: {
  readonly alerts?: readonly AlertRule[];
}): readonly RunbookEntry[] {
  const alerts = input?.alerts ?? ALERT_RULES;
  const entries: RunbookEntry[] = OPERATIONS_ENTRIES.map((entry) => ({
    ...entry,
    signals: [...entry.signals],
  }));
  for (const alert of alerts) {
    const entry = entries.find(
      (candidate) => candidate.entryId === alert.runbookEntryId,
    );
    if (entry !== undefined) {
      entries[entries.indexOf(entry)] = {
        ...entry,
        signals: [...entry.signals, `alert:${alert.alertId}`],
      };
    }
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.entryId)) {
      throw new Error(
        `runbook assembly produced duplicate entry '${entry.entryId}'`,
      );
    }
    seen.add(entry.entryId);
  }
  return entries;
}

/** The assembled runbook (the single indexed source of truth). */
export const OPERATIONS_RUNBOOK: readonly RunbookEntry[] = Object.freeze(
  buildOperationsRunbook(),
);

/** The assembled runbook's entry IDs (existence source for references). */
export const OPERATIONS_RUNBOOK_ENTRY_IDS: readonly string[] =
  OPERATIONS_RUNBOOK.map((entry) => entry.entryId);

/** Look up an entry by ID. */
export function runbookEntry(entryId: string): RunbookEntry | undefined {
  return OPERATIONS_RUNBOOK.find((entry) => entry.entryId === entryId);
}

/** All entries that list a given operator action. */
export function entriesForOperatorAction(
  action: OperatorActionDeclaration,
): readonly RunbookEntry[] {
  return OPERATIONS_RUNBOOK.filter((entry) =>
    entry.operatorActionIds.includes(action.actionId),
  );
}

// ---------------------------------------------------------------------------
// Integrity checks — no orphan alerts, no dangling references
// ---------------------------------------------------------------------------

export interface RunbookIntegrityReport {
  readonly passed: boolean;
  readonly entryCount: number;
  readonly orphanAlerts: readonly string[];
  readonly danglingActionReferences: readonly string[];
  readonly emptySignals: readonly string[];
  readonly incompleteEntries: readonly string[];
}

/**
 * The runbook integrity check:
 *  1. NO ORPHAN ALERTS — every alert rule's runbookEntryId exists;
 *  2. NO DANGLING REFERENCES — every operator action's runbookEntryId
 *     exists, and every entry's operatorActionIds resolve in the catalog;
 *  3. NO SILENT ENTRIES — every entry declares at least one signal;
 *  4. COMPLETE ENTRIES — symptom, diagnosis, action and verification are
 *     all non-empty (the runbook principle, structural).
 */
export function checkRunbookIntegrity(input?: {
  readonly entries?: readonly RunbookEntry[];
  readonly alerts?: readonly AlertRule[];
  readonly actions?: readonly OperatorActionDeclaration[];
}): RunbookIntegrityReport {
  const entries = input?.entries ?? OPERATIONS_RUNBOOK;
  const alerts = input?.alerts ?? ALERT_RULES;
  const actions = input?.actions ?? OPERATOR_ACTIONS;

  const entryIds = new Set(entries.map((entry) => entry.entryId));
  const actionIds = new Set(actions.map((action) => action.actionId));

  const orphanAlerts = alerts
    .filter((alert) => !entryIds.has(alert.runbookEntryId))
    .map((alert) => alert.alertId);

  const danglingActionReferences: string[] = [];
  for (const action of actions) {
    if (!entryIds.has(action.runbookEntryId)) {
      danglingActionReferences.push(
        `${action.actionId} -> ${action.runbookEntryId}`,
      );
    }
  }
  for (const entry of entries) {
    for (const actionId of entry.operatorActionIds) {
      if (!actionIds.has(actionId)) {
        danglingActionReferences.push(`${entry.entryId} -> ${actionId}`);
      }
    }
  }

  const emptySignals = entries
    .filter((entry) => entry.signals.length === 0)
    .map((entry) => entry.entryId);

  const incompleteEntries = entries
    .filter(
      (entry) =>
        !entry.symptom ||
        entry.diagnosis.length === 0 ||
        entry.action.length === 0 ||
        entry.verification.length === 0,
    )
    .map((entry) => entry.entryId);

  return {
    passed:
      orphanAlerts.length === 0 &&
      danglingActionReferences.length === 0 &&
      emptySignals.length === 0 &&
      incompleteEntries.length === 0,
    entryCount: entries.length,
    orphanAlerts,
    danglingActionReferences,
    emptySignals,
    incompleteEntries,
  };
}
