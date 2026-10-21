/**
 * @payswap/app — the OUTCOME-AREA ALIAS data mirror.
 *
 * STRUCTURAL MIRROR of @payswap/surface (P2-W3 ACCEPTED)
 * packages/surface/src/outcome-area-aliases.ts OUTCOME_AREA_ALIASES: the
 * reconciliation of the five outcome actions onto the eleven-area
 * navigation IA, carried field-for-field (same literals). Mirror-tested
 * at test/payswap/pin-mirror.test.ts against the source.
 *
 * JOURNEY LAW (JOURNEY-MAP.md §1): the outcome actions (J3–J6) are the
 * primary tasks; this table is what makes each one land on its REAL area
 * route — never a second navigation vocabulary (the anchors are typed
 * against the pinned UniversalAreaId set).
 */

import { OUTCOME_ACTION_IDS } from "../pins/surface-pins.js";
import type { OutcomeActionIdPin } from "../pins/surface-pins.js";
import type { UniversalAreaIdPin } from "../pins/surface-pins.js";

/** Mirrors surface OutcomeAreaAlias (actionId + real area anchors + note). */
export interface OutcomeAreaAliasMirror {
  readonly actionId: OutcomeActionIdPin;
  readonly navAreas: readonly UniversalAreaIdPin[];
  readonly note: string;
}

const OUTCOME_AREA_ALIASES_MIRROR: Readonly<
  Record<OutcomeActionIdPin, OutcomeAreaAliasMirror>
> = {
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

/** The mirrored alias table (field-for-field with the surface source). */
export const OUTCOME_AREA_ALIASES: Readonly<
  Record<OutcomeActionIdPin, OutcomeAreaAliasMirror>
> = OUTCOME_AREA_ALIASES_MIRROR;

/** Look up one action's reconciliation (fail-closed on unknown ids). */
export function outcomeAreaAlias(id: OutcomeActionIdPin): OutcomeAreaAliasMirror {
  const alias = OUTCOME_AREA_ALIASES_MIRROR[id];
  if (alias === undefined) {
    throw new Error(`outcomeAreaAlias: unknown outcome action id ${JSON.stringify(id)}`);
  }
  return alias;
}

/** Every outcome action anchored on one area (canonical registry order). */
export function outcomeActionsForArea(
  areaId: UniversalAreaIdPin,
): readonly OutcomeAreaAliasMirror[] {
  const result: OutcomeAreaAliasMirror[] = [];
  for (const actionId of OUTCOME_ACTION_IDS) {
    const alias = OUTCOME_AREA_ALIASES_MIRROR[actionId];
    if (alias !== undefined && alias.navAreas.includes(areaId)) {
      result.push(alias);
    }
  }
  return result;
}
