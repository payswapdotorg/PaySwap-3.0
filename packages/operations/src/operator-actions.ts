/**
 * @payswap/operations — the typed operator-action catalog (P8-W3, law 5).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * operator-actions.ts onto the canonical architecture. The law: NO
 * action exists in this catalog without
 *  1. an AUTHORITY LEVEL that gates who may execute it (attenuated
 *     delegation — a higher level may act at a lower one, never below);
 *  2. at least one CHECKABLE PRECONDITION — untyped operational magic is
 *     forbidden; every precondition names a machine-checkable contract;
 *  3. at least one typed EFFECT with the observability event it emits;
 *  4. at least one EVIDENCE OBLIGATION (>= 1 artifact) — an operator
 *     action without evidence cannot exist;
 *  5. a ROLLBACK PATH (reversible, compensating action, or irreversible
 *     with full audit) — never "unknown rollback";
 *  6. a RUNBOOK ENTRY that documents symptom -> diagnosis -> action ->
 *     verification (dangling references fail the check);
 *  7. a VERSION — procedures evolve; historical records bind to the
 *     version they executed.
 *
 * Deterministic only: declarations + checkers. EXECUTING the actions is
 * the production operator console's job (law 9).
 */

import { OBSERVABILITY_EVENT_TAXONOMY } from "./observability.js";
import type { RollbackMode } from "./rollback.js";
import { OPERATOR_ACTIONS } from "./operator-catalog.js";

// ---------------------------------------------------------------------------
// Authority levels (attenuated delegation)
// ---------------------------------------------------------------------------

export const OPERATOR_AUTHORITY_LEVELS = [
  "OPERATOR",
  "SENIOR_OPERATOR",
  "SECURITY_OFFICER",
  "PROTOCOL_LEAD",
] as const;
export type OperatorAuthorityLevel =
  (typeof OPERATOR_AUTHORITY_LEVELS)[number];

export function isOperatorAuthorityLevel(
  value: unknown,
): value is OperatorAuthorityLevel {
  return (
    typeof value === "string" &&
    (OPERATOR_AUTHORITY_LEVELS as readonly unknown[]).includes(value)
  );
}

/** Ordinal of authority — higher may act at lower levels (attenuation). */
const AUTHORITY_ORDER: Readonly<Record<OperatorAuthorityLevel, number>> =
  Object.freeze({
    OPERATOR: 1,
    SENIOR_OPERATOR: 2,
    SECURITY_OFFICER: 3,
    PROTOCOL_LEAD: 4,
  });

export function authoritySatisfies(
  held: OperatorAuthorityLevel,
  required: OperatorAuthorityLevel,
): boolean {
  return AUTHORITY_ORDER[held] >= AUTHORITY_ORDER[required];
}

// ---------------------------------------------------------------------------
// Preconditions, effects, evidence obligations, rollback paths
// ---------------------------------------------------------------------------

/** A machine-checkable precondition — untyped magic is forbidden. */
export interface OperatorPrecondition {
  readonly preconditionId: string;
  readonly description: string;
  /** Names the contract that checks it (e.g. "checkRollbackCoverage"). */
  readonly checkableBy: string;
}

/** A typed effect with the observability event it emits. */
export interface OperatorEffect {
  readonly effectId: string;
  readonly description: string;
  readonly emitsEvent: string;
}

/** An evidence obligation — what must be on record when the action runs. */
export interface EvidenceObligation {
  readonly kind: string;
  readonly description: string;
  /** Minimum number of distinct evidence artifacts required. */
  readonly minimum: number;
}

export interface OperatorRollbackPath {
  readonly mode: RollbackMode;
  readonly description: string;
  /** For COMPENSATING_ACTION: the action that undoes this one. */
  readonly compensatingActionId?: string;
}

// ---------------------------------------------------------------------------
// The declaration and catalog
// ---------------------------------------------------------------------------

export interface OperatorActionDeclaration {
  readonly actionId: string;
  /** Procedure version — historical records bind to the executed version. */
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly authorityLevel: OperatorAuthorityLevel;
  readonly preconditions: readonly OperatorPrecondition[];
  readonly effects: readonly OperatorEffect[];
  readonly evidence: readonly EvidenceObligation[];
  readonly rollback: OperatorRollbackPath;
  /** The runbook entry documenting the procedure (must exist). */
  readonly runbookEntryId: string;
  readonly invariants: readonly string[];
}


export interface ActionCatalogReport {
  readonly passed: boolean;
  readonly violations: readonly { readonly actionId: string; readonly detail: string }[];
}

/**
 * Check the operator-action catalog: valid authority level, positive
 * version, >= 1 CHECKABLE precondition, >= 1 effect emitting a declared
 * taxonomy event, >= 1 evidence obligation with minimum >= 1, a declared
 * rollback path with the fields its mode requires, a runbook entry that
 * exists in the supplied index, and compensating references that resolve
 * inside the catalog.
 */
export function checkOperatorActionCatalog(
  actions: readonly OperatorActionDeclaration[] = OPERATOR_ACTIONS,
  runbookEntryIds: readonly string[],
): ActionCatalogReport {
  const known = new Set(runbookEntryIds);
  const taxonomyEvents = new Set(
    OBSERVABILITY_EVENT_TAXONOMY.map((declaration) => declaration.eventName),
  );
  const ids = new Set(actions.map((action) => action.actionId));
  const violations: { actionId: string; detail: string }[] = [];

  if (actions.length === 0) {
    return {
      passed: false,
      violations: [{ actionId: "*", detail: "empty catalog" }],
    };
  }

  for (const action of actions) {
    if (!isOperatorAuthorityLevel(action.authorityLevel)) {
      violations.push({
        actionId: action.actionId,
        detail: `invalid authority level '${String(action.authorityLevel)}'`,
      });
    }
    if (!Number.isInteger(action.version) || action.version < 1) {
      violations.push({
        actionId: action.actionId,
        detail: "version must be a positive integer",
      });
    }
    if (
      action.preconditions.length === 0 ||
      action.preconditions.some((p) => !p.checkableBy || p.checkableBy.length < 3)
    ) {
      violations.push({
        actionId: action.actionId,
        detail: "every action needs >= 1 machine-checkable precondition (no untyped magic)",
      });
    }
    if (action.effects.length === 0) {
      violations.push({
        actionId: action.actionId,
        detail: "every action declares >= 1 typed effect",
      });
    }
    for (const effect of action.effects) {
      if (!taxonomyEvents.has(effect.emitsEvent)) {
        violations.push({
          actionId: action.actionId,
          detail: `effect '${effect.effectId}' emits unknown taxonomy event '${effect.emitsEvent}'`,
        });
      }
    }
    if (
      action.evidence.length === 0 ||
      action.evidence.some((obligation) => obligation.minimum < 1)
    ) {
      violations.push({
        actionId: action.actionId,
        detail: "every action needs >= 1 evidence obligation with minimum >= 1",
      });
    }
    if (action.rollback.mode === "COMPENSATING_ACTION") {
      if (
        action.rollback.compensatingActionId === undefined ||
        !ids.has(action.rollback.compensatingActionId)
      ) {
        violations.push({
          actionId: action.actionId,
          detail: "compensating-action rollback must reference a catalog action",
        });
      }
    }
    if (
      action.rollback.mode === "IRREVERSIBLE_WITH_AUDIT" &&
      action.rollback.compensatingActionId !== undefined
    ) {
      violations.push({
        actionId: action.actionId,
        detail: "irreversible-with-audit rollback cannot declare a compensating action",
      });
    }
    if (!known.has(action.runbookEntryId)) {
      violations.push({
        actionId: action.actionId,
        detail: `runbook entry '${action.runbookEntryId}' does not exist (dangling reference)`,
      });
    }
  }

  if (ids.size !== actions.length) {
    violations.push({ actionId: "*", detail: "duplicate actionId in catalog" });
  }
  return { passed: violations.length === 0, violations };
}
