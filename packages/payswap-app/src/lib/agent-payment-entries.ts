/**
 * @payswap/app — the AGENT PAYMENT-DIRECTION ENTRIES (P13-A).
 *
 * The Pay/Receive/Move/Convert seed cards the payments and accounts
 * surfaces render in their agent-led sections: each entry maps an
 * anchored outcome action to its ONE typed mission direction and a
 * people-language goal statement. Clicking a card and typing a payment
 * text converge on the SAME resumable PAYMENT_MISSION task (the shared
 * contract's resume key is `payment:<direction>` — the convergence law).
 *
 * HONEST LAWS:
 * - Checkout has NO entry here: the mission vocabulary has exactly four
 *   directions (PAY/RECEIVE/MOVE/CONVERT) and checkout is a hosted
 *   merchant lane with no direction mapping — never a guessed seed.
 * - Seeding is a REQUEST RECORD, never a dispatch: the card copy says
 *   so, and the composer owns zero financial authority (ADR-0007 D7).
 * - The goal statements are the pinned alias-table notes (people
 *   language, no invented vocabulary).
 */

import type { MissionIntentDirection } from "../console/contracts.js";
import { outcomeAreaAlias } from "./outcome-area-aliases.js";
import type { OutcomeActionIdPin } from "../pins/surface-pins.js";

/** One agent payment-direction seed card (a surface-action entry). */
export interface AgentPaymentDirectionEntry {
  /** The outcome action this entry anchors on (alias-table id). */
  readonly actionId: OutcomeActionIdPin;
  /** The ONE typed mission direction this action seeds. */
  readonly direction: MissionIntentDirection;
  /** Card title (people language). */
  readonly cardTitle: string;
  /** Card body line (the pinned alias note — never invented). */
  readonly cardLine: string;
  /** The seed button label. */
  readonly cardActionLabel: string;
  /** The goal statement recorded on the seeded task. */
  readonly goalStatement: string;
}

/** The payment-direction entries (order = the alias-table order). */
export const AGENT_PAYMENT_DIRECTION_ENTRIES: readonly AgentPaymentDirectionEntry[] = [
  {
    actionId: "pay",
    direction: "PAY",
    cardTitle: "Pay — with the agent",
    cardLine: "Paying is money out: describe the payment in words and the agent opens one guided intake task.",
    cardActionLabel: "Start a Pay task",
    goalStatement: "Pay — a guided payment intake started from the Payments area.",
  },
  {
    actionId: "receive",
    direction: "RECEIVE",
    cardTitle: "Receive — with the agent",
    cardLine: "Requesting money is money in: describe the collect request and the agent opens one guided intake task.",
    cardActionLabel: "Start a Receive task",
    goalStatement: "Receive — a guided collect-request intake started from the Payments area.",
  },
  {
    actionId: "move",
    direction: "MOVE",
    cardTitle: "Move — with the agent",
    cardLine: "Moving is a payout to a registered settlement destination: describe it and the agent opens one guided intake task.",
    cardActionLabel: "Start a Move task",
    goalStatement: "Move — a guided payout intake started from the Payments area.",
  },
  {
    actionId: "convert",
    direction: "CONVERT",
    cardTitle: "Convert — with the agent",
    cardLine: "Converting moves value between the balances you hold: describe it and the agent opens one guided intake task.",
    cardActionLabel: "Start a Convert task",
    goalStatement: "Convert — a guided conversion intake started from the Accounts area.",
  },
];

/** The entries for a given area (payments: pay/receive/move; accounts: convert + move cross-anchor). */
export function agentPaymentDirectionEntries(
  area: "payments" | "accounts",
): readonly AgentPaymentDirectionEntry[] {
  return AGENT_PAYMENT_DIRECTION_ENTRIES.filter((entry) => {
    const alias = outcomeAreaAlias(entry.actionId);
    return alias.navAreas.includes(area);
  });
}
