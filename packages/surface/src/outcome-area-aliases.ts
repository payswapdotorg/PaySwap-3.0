/**
 * @payswap/surface — outcome-action reconciliation onto the areas IA (P2-W3).
 *
 * NET-NEW ADAPTATION of the old repo's UX-002 alias table
 * (payswap.org@8a735bf packages/surface/src/outcomes.ts §aliases, lines
 * 230-306): the old table reconciled the five certified outcome actions
 * onto @payswap/ux command verbs + sidebar anchors. @payswap/ux does not
 * exist in PaySwap 3.0 — the canonical navigation vocabulary of this
 * program is the ELEVEN-AREA IA (src/areas.ts, mapped to the handoff's
 * product law). This table reconciles the five actions onto THOSE areas.
 *
 * ADDITIVE side-table: the five outcome actions keep their ids, shapes and
 * dispatch authorities exactly as src/outcomes.ts records them; this table
 * only adds the navigation reconciliation. No second navigation vocabulary
 * is created — the anchors are typed against UniversalAreaId (the single
 * source, src/areas.ts), and drift fails the test gate.
 */

import type { UniversalAreaId } from "./areas.ts";
import type { OutcomeActionId } from "./outcomes.ts";

/** The reconciliation of one outcome action onto the areas navigation IA. */
export interface OutcomeAreaAlias {
  readonly actionId: OutcomeActionId;
  /** Where the action's lane lives in the eleven-area IA (real area ids only). */
  readonly navAreas: readonly UniversalAreaId[];
  /** Why this mapping holds (auditable, one line). */
  readonly note: string;
}

const OUTCOME_AREA_ALIASES_TABLE: Readonly<Record<OutcomeActionId, OutcomeAreaAlias>> = {
  pay: {
    actionId: "pay",
    navAreas: ["payments"],
    note: "Paying is money out: the Payments area owns the pay lane of the outcome-first vocabulary.",
  },
  receive: {
    actionId: "receive",
    navAreas: ["payments"],
    note: "receive ≈ the collect-request lane: requesting money is money in, owned by the Payments area.",
  },
  move: {
    actionId: "move",
    navAreas: ["payments", "accounts"],
    note: "move ≈ the payout lane to a registered settlement destination: money out through Payments, observed in Accounts.",
  },
  convert: {
    actionId: "convert",
    navAreas: ["accounts", "capabilities"],
    note: "Converting moves value between the balances you hold — anchored on Accounts, with coverage honesty from Capabilities.",
  },
  checkout: {
    actionId: "checkout",
    navAreas: ["payments", "connections"],
    note: "checkout ≈ the merchant payment-link lane: a hosted customer-facing checkout page, live only with a connected merchant context.",
  },
};

/**
 * The outcome-action reconciliation table: five outcome actions x real
 * eleven-area anchors. ADDITIVE — the OUTCOME_REGISTRY shapes are untouched.
 */
export const OUTCOME_AREA_ALIASES: Readonly<Record<OutcomeActionId, OutcomeAreaAlias>> =
  OUTCOME_AREA_ALIASES_TABLE;

/** Look up one action's reconciliation (fail-closed on unknown ids). */
export function outcomeAreaAlias(id: OutcomeActionId): OutcomeAreaAlias {
  const alias = OUTCOME_AREA_ALIASES[id];
  if (alias === undefined) {
    throw new Error(`outcomeAreaAlias: unknown outcome action id ${JSON.stringify(id)}`);
  }
  return alias;
}
