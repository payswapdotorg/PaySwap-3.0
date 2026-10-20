/**
 * @payswap/client-certification — the dead-action audit (P8-W2, hard
 * law 2).
 *
 * REAUTHORED from the old-repo no-simulated-success audit
 * (payswap.org@8a735bf packages/certification src/production/audit.ts
 * — the marker scan + evidence-backed-success fold) onto the canonical
 * architecture as the CLIENT-side lineage law:
 *
 * Every customer-visible action must be backed by a real
 *   action -> contract -> effect
 * lineage, machine-checkable against declared registries. A DEAD
 * action (renders, accepts input, does nothing) and a FAKE-SUCCESS
 * action (renders success while its backing effect is simulated) are
 * certification FAILURES. The audit emits the resolved lineage table —
 * the evidence a release reviewer reads.
 *
 * Deterministic only: a pure fold over the declared registries.
 */

import {
  PINNED_OUTCOME_ACTION_IDS,
  PINNED_UNIVERSAL_AREA_IDS,
} from "./pins/surface.ts";
import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 2). */
const LAW = "dead-action-audit" as const;

/** The kinds of real effects that can back a customer action. */
export const EFFECT_KINDS = Object.freeze([
  "onchain-write",
  "payment-execution",
  "record-write",
  "provider-call",
] as const);

export type EffectKind = (typeof EFFECT_KINDS)[number];

/** One REAL effect a contract can dispatch to. */
export interface EffectDeclaration {
  readonly effectId: string;
  readonly kind: EffectKind;
  /** Evidence references proving the effect exists (non-empty). */
  readonly evidenceRefs: readonly string[];
  /**
   * A simulated effect: legal ONLY inside declared test tiers — it can
   * never back an action that renders success to a customer.
   */
  readonly simulated?: boolean;
}

/** One contract backing customer actions (the dispatch seam). */
export interface ContractDeclaration {
  readonly contractId: string;
  /** The real effects this contract dispatches to (non-empty). */
  readonly effectRefs: readonly string[];
}

/** One customer-visible action as declared by the surface registry. */
export interface CustomerVisibleAction {
  readonly actionId: string;
  /** The area or outcome action the action renders inside (pinned vocabularies). */
  readonly area: string;
  readonly label: string;
  /** The contracts backing this action (non-empty for a live action). */
  readonly contractRefs: readonly string[];
  /** Whether the element accepts customer input. */
  readonly acceptsInput: boolean;
  /** The outcome the action's copy promises (if any). */
  readonly promisesOutcome?: "success" | "acknowledgement" | "none";
}

/** The resolved lineage of one action (the audit's evidence table row). */
export interface ActionLineageEntry {
  readonly actionId: string;
  readonly area: string;
  readonly resolvedContracts: readonly string[];
  readonly resolvedEffects: readonly string[];
  readonly dead: boolean;
  readonly fakeSuccess: boolean;
}

export interface DeadActionAuditReport extends ClientGateResult {
  readonly lineage: readonly ActionLineageEntry[];
}

function isKnownSurfaceArea(area: string): boolean {
  return (
    (PINNED_UNIVERSAL_AREA_IDS as readonly string[]).includes(area) ||
    (PINNED_OUTCOME_ACTION_IDS as readonly string[]).includes(area)
  );
}

/**
 * The dead-action audit (hard law 2). Folds the declared registries:
 * every action must resolve to contracts, every contract to effects,
 * every effect to a real (non-simulated, evidenced) consequence.
 */
export function runDeadActionAudit(input: {
  readonly actions: readonly CustomerVisibleAction[];
  readonly contracts: readonly ContractDeclaration[];
  readonly effects: readonly EffectDeclaration[];
}): DeadActionAuditReport {
  const violations: CertificationViolation[] = [];
  const contractIndex = new Map<string, ContractDeclaration>();
  for (const contract of input.contracts) {
    contractIndex.set(contract.contractId, contract);
  }
  const effectIndex = new Map<string, EffectDeclaration>();
  for (const effect of input.effects) {
    effectIndex.set(effect.effectId, effect);
  }

  const lineage: ActionLineageEntry[] = [];
  for (const action of input.actions) {
    const resolvedContracts: string[] = [];
    const resolvedEffects: string[] = [];
    let dead = false;
    let fakeSuccess = false;

    if (!isKnownSurfaceArea(action.area)) {
      violations.push(
        violationOf(
          LAW,
          "action_outside_surface_vocabulary",
          `action '${action.actionId}' declares area '${action.area}' — outside the pinned area/outcome vocabularies`,
        ),
      );
    }
    if (action.contractRefs.length === 0) {
      dead = true;
      violations.push(
        violationOf(
          LAW,
          "unbacked_action",
          `action '${action.actionId}' (${action.label}) renders with no backing contract — a dead action is a certification FAILURE`,
        ),
      );
    }
    for (const contractRef of action.contractRefs) {
      const contract = contractIndex.get(contractRef);
      if (contract === undefined) {
        dead = true;
        violations.push(
          violationOf(
            LAW,
            "unknown_contract_reference",
            `action '${action.actionId}' references contract '${contractRef}' which is not declared`,
          ),
        );
        continue;
      }
      resolvedContracts.push(contract.contractId);
      if (contract.effectRefs.length === 0) {
        dead = true;
        violations.push(
          violationOf(
            LAW,
            "contract_without_effect",
            `contract '${contract.contractId}' dispatches to no effect — the lineage stops at a seam that does nothing`,
          ),
        );
      }
      for (const effectRef of contract.effectRefs) {
        const effect = effectIndex.get(effectRef);
        if (effect === undefined) {
          dead = true;
          violations.push(
            violationOf(
              LAW,
              "unknown_effect_reference",
              `contract '${contract.contractId}' references effect '${effectRef}' which is not declared`,
            ),
          );
          continue;
        }
        resolvedEffects.push(effect.effectId);
        if (effect.evidenceRefs.length === 0) {
          violations.push(
            violationOf(
              LAW,
              "effect_without_evidence",
              `effect '${effect.effectId}' carries no evidence references — an unevidenced consequence is indistinguishable from none`,
            ),
          );
        }
        if (
          effect.simulated === true &&
          action.promisesOutcome === "success"
        ) {
          fakeSuccess = true;
          violations.push(
            violationOf(
              LAW,
              "fake_success_action",
              `action '${action.actionId}' promises success but is backed by simulated effect '${effect.effectId}' — synthetic success is a certification FAILURE`,
            ),
          );
        }
      }
    }
    if (dead && action.acceptsInput && action.contractRefs.length > 0) {
      violations.push(
        violationOf(
          LAW,
          "dead_action",
          `action '${action.actionId}' accepts customer input but its lineage resolves to no real effect`,
        ),
      );
    }
    lineage.push(
      Object.freeze({
        actionId: action.actionId,
        area: action.area,
        resolvedContracts: Object.freeze(resolvedContracts),
        resolvedEffects: Object.freeze(resolvedEffects),
        dead,
        fakeSuccess,
      }),
    );
  }

  const base: ClientGateResult = Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: input.actions.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      lineage,
      violations,
    }),
  });
  return Object.freeze({ ...base, lineage: Object.freeze(lineage) });
}

/**
 * Resolve one action's lineage (machine-checkable single-action view —
 * the evidence-record entry for a specific action).
 */
export function resolveActionLineage(
  actionId: string,
  input: {
    readonly actions: readonly CustomerVisibleAction[];
    readonly contracts: readonly ContractDeclaration[];
    readonly effects: readonly EffectDeclaration[];
  },
): ActionLineageEntry | undefined {
  return runDeadActionAudit(input).lineage.find(
    (entry) => entry.actionId === actionId,
  );
}
