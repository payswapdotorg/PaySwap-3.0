/**
 * @payswap/operations — the operator action catalog data (P8-W3, law 5).
 *
 * The six canonical release/operations actions, as data. The LAWS each
 * declaration satisfies are documented + machine-checked in
 * operator-actions.ts (checkOperatorActionCatalog): authority level,
 * checkable preconditions, typed effects emitting taxonomy events,
 * evidence obligations, rollback paths, runbook linkage and versioning.
 * EXECUTING the actions is the production operator console's job (law 9).
 */

import type { OperatorActionDeclaration } from "./operator-actions.js";

/** The operator action catalog (P8-W3 operational set). */
export const OPERATOR_ACTIONS: readonly OperatorActionDeclaration[] =
  Object.freeze([
    {
      actionId: "trigger-reconciliation",
      version: 1,
      title: "Trigger reconciliation for an ambiguous effect",
      description:
        "Open (or force-schedule) a reconciliation case for an UNKNOWN execution attempt or settlement outcome. Reconciliation is the AUTHORITATIVE resolution path for external ambiguity — the trigger never writes an outcome itself.",
      authorityLevel: "OPERATOR",
      preconditions: [
        {
          preconditionId: "ambiguity-evidence-exists",
          description:
            "The execution evidence shows the ambiguous external effect (attempt record or provider state envelope).",
          checkableBy: "evidence-record lookup by attemptId",
        },
      ],
      effects: [
        {
          effectId: "case-opened",
          description:
            "A reconciliation case is opened keyed to the attempt and its obligation, with the evidence attached.",
          emitsEvent: "reconciliation.case-opened",
        },
      ],
      evidence: [
        {
          kind: "ambiguity-evidence",
          description:
            "The execution evidence showing the ambiguous external effect.",
          minimum: 1,
        },
      ],
      rollback: {
        mode: "REVERSIBLE",
        description:
          "Closing the case without resolution (withdrawn) is always available; the case is an append-only record and stays in history.",
      },
      runbookEntryId: "rb-unknown-outcome",
      invariants: ["INV-X01", "INV-X02", "INV-X03"],
    },
    {
      actionId: "execute-rollback",
      version: 1,
      title: "Execute a rollback artifact",
      description:
        "Execute a recorded rollback (its compensations) against its promotion. The rollback record, its coverage and its compensation verification must all be green first; the execution cites the operator authorization.",
      authorityLevel: "SENIOR_OPERATOR",
      preconditions: [
        {
          preconditionId: "rollback-record-exists",
          description:
            "The versioned rollback record exists in the ledger and its digest chain verifies.",
          checkableBy: "rollback ledger lookup + digest verification",
        },
        {
          preconditionId: "compensation-verified",
          description:
            "The compensations are order-independent and idempotent (the provable laws).",
          checkableBy:
            "verifyCompensationOrderIndependence + verifyRollbackIdempotence",
        },
      ],
      effects: [
        {
          effectId: "compensations-applied",
          description:
            "The typed compensations are applied; the compensated obligations are recorded.",
          emitsEvent: "release.rollback-executed",
        },
      ],
      evidence: [
        {
          kind: "rollback-record",
          description: "The digest-chained rollback record being executed.",
          minimum: 1,
        },
        {
          kind: "operator-authorization",
          description:
            "The explicit operator authorization for this execution (law 9).",
          minimum: 1,
        },
      ],
      rollback: {
        mode: "IRREVERSIBLE_WITH_AUDIT",
        description:
          "A executed rollback is history; the compensating path is a fresh promotion record with fresh evidence and fresh rollout gates.",
      },
      runbookEntryId: "rb-rollback-execution",
      invariants: ["INV-E05"],
    },
    {
      actionId: "hold-rollout-stage",
      version: 1,
      title: "Hold a provider rollout at its current stage",
      description:
        "Freeze a provider rollout's progressive exposure at the current stage — no further exposure advance until the hold criteria clear or a rollback is executed.",
      authorityLevel: "OPERATOR",
      preconditions: [
        {
          preconditionId: "rollout-active",
          description: "The rollout plan is active (not terminal).",
          checkableBy: "rollout ledger state lookup",
        },
      ],
      effects: [
        {
          effectId: "exposure-frozen",
          description:
            "The rollout's exposure freezes at the current stage; the verdict is observable.",
          emitsEvent: "provider.rollout-stage-verdict",
        },
      ],
      evidence: [
        {
          kind: "hold-reason",
          description:
            "The reason record for the hold (alert, metric or operator judgement with its source).",
          minimum: 1,
        },
      ],
      rollback: {
        mode: "COMPENSATING_ACTION",
        description: "Resume the rollout (the compensating action).",
        compensatingActionId: "resume-rollout",
      },
      runbookEntryId: "rb-rollout-hold",
      invariants: [],
    },
    {
      actionId: "resume-rollout",
      version: 1,
      title: "Resume a held provider rollout",
      description:
        "Resume a held rollout: the hold criteria must have cleared (or been explicitly overridden with evidence) before exposure advances again.",
      authorityLevel: "SENIOR_OPERATOR",
      preconditions: [
        {
          preconditionId: "hold-criteria-cleared",
          description:
            "The hold criteria that tripped are cleared, or an explicit override with evidence is recorded.",
          checkableBy: "hold-criteria evaluation over the rollout ledger",
        },
      ],
      effects: [
        {
          effectId: "exposure-advances",
          description:
            "The rollout's exposure may advance through its gates again.",
          emitsEvent: "provider.rollout-stage-verdict",
        },
      ],
      evidence: [
        {
          kind: "hold-clearance",
          description: "The hold-clearance or override evidence.",
          minimum: 1,
        },
      ],
      rollback: {
        mode: "COMPENSATING_ACTION",
        description: "Hold the rollout again (another freeze).",
        compensatingActionId: "hold-rollout-stage",
      },
      runbookEntryId: "rb-rollout-hold",
      invariants: [],
    },
    {
      actionId: "release-quarantine",
      version: 1,
      title: "Release a component from security quarantine",
      description:
        "Release a quarantined component after the owning advisory closes or remediates. Release is ATOMIC with a security epoch bump so cached capability state cannot survive.",
      authorityLevel: "SECURITY_OFFICER",
      preconditions: [
        {
          preconditionId: "advisory-closed",
          description:
            "The advisory that imposed the quarantine is closed with verified remediation.",
          checkableBy: "advisory record lookup",
        },
        {
          preconditionId: "remediation-recorded",
          description: "A remediation record exists for the component.",
          checkableBy: "remediation evidence lookup",
        },
      ],
      effects: [
        {
          effectId: "epoch-bumped",
          description:
            "The security epoch advances atomically with the release.",
          emitsEvent: "security.epoch-bumped",
        },
      ],
      evidence: [
        {
          kind: "advisory-closure",
          description: "The closed advisory with its remediation guidance.",
          minimum: 1,
        },
        {
          kind: "remediation-record",
          description: "The remediation record for the affected component.",
          minimum: 1,
        },
        {
          kind: "epoch-bump-record",
          description:
            "The epoch bump executed atomically with the release.",
          minimum: 1,
        },
      ],
      rollback: {
        mode: "COMPENSATING_ACTION",
        description:
          "Re-quarantine by publishing a new advisory and bumping the epoch again; accesses granted in between stay in the enforcement audit.",
        compensatingActionId: "release-quarantine",
      },
      runbookEntryId: "rb-security-quarantine",
      invariants: ["INV-S01", "INV-S02", "INV-S03"],
    },
    {
      actionId: "run-restore-replay-drill",
      version: 1,
      title: "Run the restore/replay drill",
      description:
        "Execute the restore/replay drill over a staging copy of production-shaped data: restore the journal, replay committed events, drain the outbox, reconcile unverifiable effects, rebuild projections.",
      authorityLevel: "OPERATOR",
      preconditions: [
        {
          preconditionId: "staging-copy-ready",
          description:
            "A staging copy of production-shaped data is available (never production itself).",
          checkableBy: "drill environment declaration",
        },
      ],
      effects: [
        {
          effectId: "drill-recorded",
          description:
            "The drill's verification event fires with the drill's evidence reference.",
          emitsEvent: "deployment.restore-replay-drill",
        },
      ],
      evidence: [
        {
          kind: "drill-report",
          description:
            "The drill report: replayed projections, drain results, reconciliation outcomes.",
          minimum: 1,
        },
      ],
      rollback: {
        mode: "REVERSIBLE",
        description:
          "A drill is advisory evidence over derived fixtures — nothing to roll back; discard the staging copy.",
      },
      runbookEntryId: "rb-restore-replay",
      invariants: ["INV-O04"],
    },
  ]);

export function operatorAction(
  actionId: string,
): OperatorActionDeclaration | undefined {
  return OPERATOR_ACTIONS.find((action) => action.actionId === actionId);
}
