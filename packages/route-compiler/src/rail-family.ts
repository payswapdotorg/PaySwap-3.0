/**
 * @payswap/route-compiler — rail families and the rail-crossing law (P5-W1).
 *
 * NET-NEW vs the old repo (the F-2 verified finding): the old tree had
 * no rail-crossing metric; the rebuild's plan-level scoring order needs
 * one, and the honest definition is WITHIN-LEG, not between legs:
 *
 * THE LAW: a route "crosses rails" when ONE leg's custody transfer moves
 * value between rail FAMILIES — `custody.from` to `custody.to`. The
 * BETWEEN-leg definition (comparing consecutive legs' custody parties)
 * is STRUCTURALLY DEAD under the custody-continuity law: consecutive
 * transfers agree on the handing-over party (same kind + same
 * identifying ref — see custodyPartyIdentity), so consecutive legs can
 * never differ in family. The live, honest signal is the WITHIN-leg
 * family change: wallet(onchain) -> provider(fiat) is a crossing;
 * wallet -> wallet via a protocol is not; provider -> provider is not;
 * wallet -> bank is; provider -> merchant balance is.
 *
 * railCrossingCount(plan) is advisory: it feeds the FEWER_RAIL_CROSSINGS
 * tie-breaker of the scoring order (before the PLAN_ID total order) and
 * the plan's declared metrics — never an eligibility verdict.
 */

import { ValidationError } from "./errors.ts";
import type { CustodyParty, CustodyTransfer } from "./custody.ts";

/** The closed rail-family vocabulary (coarse custody custody families). */
export const RAIL_FAMILIES = Object.freeze(["ONCHAIN", "PROVIDER", "BANK", "MERCHANT"] as const);

export type RailFamily = (typeof RAIL_FAMILIES)[number];

/**
 * The rail family of a custody party: onchain wallets and protocols are
 * ONCHAIN; external providers are PROVIDER; bank instruments are BANK;
 * merchant balances are MERCHANT. Unknown party kinds throw (closed
 * vocabulary law — this function is total over the validated union).
 */
export function railFamilyOf(party: CustodyParty): RailFamily {
  switch (party.kind) {
    case "ONCHAIN_WALLET":
    case "ONCHAIN_PROTOCOL":
      return "ONCHAIN";
    case "EXTERNAL_PROVIDER":
      return "PROVIDER";
    case "EXTERNAL_BANK_INSTRUMENT":
      return "BANK";
    case "MERCHANT_BALANCE":
      return "MERCHANT";
    default:
      throw new ValidationError("a custody party outside the closed vocabulary has no rail family");
  }
}

/** True iff ONE custody transfer crosses rail families WITHIN the leg (F-2). */
export function custodyTransferCrossesRails(transfer: CustodyTransfer): boolean {
  return railFamilyOf(transfer.from) !== railFamilyOf(transfer.to);
}

/**
 * The rail-crossing count of a leg sequence: the number of legs whose
 * custody transfer crosses rail families WITHIN the leg. BETWEEN-leg
 * crossings are structurally impossible under custody continuity (the
 * dead definition — deliberately not computed; see the module law).
 */
export function railCrossingCount(custodies: readonly CustodyTransfer[]): number {
  let crossings = 0;
  for (const transfer of custodies) {
    if (custodyTransferCrossesRails(transfer)) {
      crossings += 1;
    }
  }
  return crossings;
}

/** The plan-level rail-crossing metric (advisory, deterministic). */
export interface RailCrossingMetric {
  readonly crossings: number;
  /** Per-leg family pairs, in hop order (advisory trace, never eligibility). */
  readonly legs: readonly {
    readonly hopIndex: number;
    readonly fromFamily: RailFamily;
    readonly toFamily: RailFamily;
    readonly crosses: boolean;
  }[];
}

/** The full advisory rail-crossing metric for a custody sequence. */
export function railCrossingMetric(custodies: readonly CustodyTransfer[]): RailCrossingMetric {
  const legs: RailCrossingMetric["legs"][number][] = [];
  let crossings = 0;
  for (let index = 0; index < custodies.length; index += 1) {
    const transfer = custodies[index] as CustodyTransfer;
    const fromFamily = railFamilyOf(transfer.from);
    const toFamily = railFamilyOf(transfer.to);
    const crosses = fromFamily !== toFamily;
    if (crosses) {
      crossings += 1;
    }
    legs.push(Object.freeze({ hopIndex: index, fromFamily, toFamily, crosses }));
  }
  return Object.freeze({ crossings, legs: Object.freeze(legs) });
}
