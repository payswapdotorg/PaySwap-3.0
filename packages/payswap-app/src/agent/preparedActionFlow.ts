/**
 * @payswap/app — the PREPARED-ACTION FLOW folds (P24-3, ADR-0017 D10).
 *
 * The pure, deterministic projections of the two-phase action law over
 * a task's conversation log:
 *
 *   Prepare → Validate → Preview → HUMAN confirmation → Authorize
 *           → Execute → Verify/Reconcile
 *
 * - The preview is EXACT: operation, normalized parameters, account
 *   context, effect class, approval tier, confirmation inputs, digest
 *   and expiry — rendered verbatim from the host-minted record, never
 *   re-derived or paraphrased by the model side.
 * - CONFIRMATION IS A HUMAN EVENT: the fold treats
 *   PREPARED_ACTION_CONFIRMED / REFUSED as the recorded human decision;
 *   nothing in the model-side flow can produce them.
 * - A parameter or account-context change after approval invalidates
 *   the authorization (typed errors below) — a NEW preview is required.
 * - EXPIRY IS ABSOLUTE: an expired pending action never auto-executes
 *   on resume; resume marks it EXPIRED and shows the honest card.
 * - UNKNOWN IS UNKNOWN: an interrupted or unknown execution renders as
 *   a reconcile card (read-back before any retry), never as failed or
 *   succeeded (INV-04).
 */

import type { AgentConversationLogEvent } from "./conversationLogEvents.js";
import type {
  StripeActionApprovalTierPin,
  StripeActionExecutionOutcomePin,
  StripePreparedActionPin,
} from "./stripePreparedActionPins.js";

/* ----------------------------- typed errors -------------------------- */

export type PreparedActionFlowErrorCode =
  | "PARAMETERS_CHANGED_NEW_PREVIEW_REQUIRED"
  | "ACCOUNT_CONTEXT_CHANGED_NEW_PREVIEW_REQUIRED"
  | "ACTION_EXPIRED"
  | "ACTION_ALREADY_DECIDED"
  | "UNKNOWN_ACTION";

/** The typed, fail-closed prepared-action flow error. */
export class PreparedActionFlowError extends Error {
  readonly code: PreparedActionFlowErrorCode;
  constructor(code: PreparedActionFlowErrorCode, message: string) {
    super(message);
    this.name = "PreparedActionFlowError";
    this.code = code;
  }
}

/* ------------------------------ the views ---------------------------- */

/** The lifecycle phase of one prepared action (folded from the log). */
export type PreparedActionPhase =
  | "PENDING"
  | "CONFIRMED"
  | "EXECUTING"
  | "EXECUTED"
  | "REFUSED"
  | "EXPIRED";

/** One prepared-action card's projected view (append-only derived). */
export interface PreparedActionCardView {
  readonly preparedActionId: string;
  readonly action: StripePreparedActionPin;
  readonly phase: PreparedActionPhase;
  /** The recorded execution outcome, when one exists (UNKNOWN stays UNKNOWN). */
  readonly outcome?: StripeActionExecutionOutcomePin;
  /** The recorded authorization reference (the host-minted id only). */
  readonly authorizationId?: string;
  /** True when the phase demands a reconcile card (UNKNOWN / interrupted). */
  readonly reconcileDue: boolean;
  readonly lastAt: string;
}

/** The tiered-confirmation people language (D7's tiers, rendered honestly). */
export const PREPARED_ACTION_TIER_LABELS: Readonly<Record<StripeActionApprovalTierPin, string>> =
  Object.freeze({
    NONE: "No confirmation required",
    CONFIRM: "Confirmation required",
    STRONG_CONFIRM: "Strong confirmation required",
    REAUTH: "Re-authentication required",
  });

/* ------------------------------- the fold ---------------------------- */

/**
 * Fold the conversation log into the prepared-action card views (latest
 * state per preparedActionId; order = first-pending order).
 */
export function foldPreparedActionCards(
  events: readonly AgentConversationLogEvent[],
): readonly PreparedActionCardView[] {
  const order: string[] = [];
  const byId = new Map<string, PreparedActionCardView>();
  const actions = new Map<string, StripePreparedActionPin>();
  for (const logEvent of events) {
    const event = logEvent.event;
    switch (event.kind) {
      case "PREPARED_ACTION_PENDING": {
        const action = event.action as StripePreparedActionPin;
        if (!byId.has(action.preparedActionId)) {
          order.push(action.preparedActionId);
        }
        actions.set(action.preparedActionId, action);
        byId.set(action.preparedActionId, {
          preparedActionId: action.preparedActionId,
          action,
          phase: "PENDING",
          reconcileDue: false,
          lastAt: logEvent.at,
        });
        break;
      }
      case "PREPARED_ACTION_CONFIRMED": {
        const current = byId.get(event.preparedActionId);
        if (current !== undefined) {
          byId.set(event.preparedActionId, {
            ...current,
            phase: "EXECUTING",
            authorizationId: event.authorizationId,
            lastAt: logEvent.at,
          });
        }
        break;
      }
      case "PREPARED_ACTION_REFUSED": {
        const current = byId.get(event.preparedActionId);
        if (current !== undefined) {
          byId.set(event.preparedActionId, { ...current, phase: "REFUSED", lastAt: logEvent.at });
        }
        break;
      }
      case "PREPARED_ACTION_EXPIRED": {
        const current = byId.get(event.preparedActionId);
        if (current !== undefined) {
          byId.set(event.preparedActionId, { ...current, phase: "EXPIRED", lastAt: logEvent.at });
        }
        break;
      }
      case "EXECUTION_OUTCOME": {
        const current = byId.get(event.preparedActionId);
        if (current !== undefined) {
          const outcome = event.outcome as StripeActionExecutionOutcomePin;
          byId.set(event.preparedActionId, {
            ...current,
            phase: "EXECUTED",
            outcome,
            reconcileDue:
              outcome.kind === "UNKNOWN" ||
              (outcome.kind === "CONFIRMED" && outcome.readBackDue),
            lastAt: logEvent.at,
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return order
    .map((id) => byId.get(id) as PreparedActionCardView)
    .map((view) => ({ ...view, action: actions.get(view.preparedActionId) ?? view.action }));
}

/** Is the pending action expired at `now` (ISO-8601 UTC instants compare lexically). */
export function isPreparedActionExpired(action: StripePreparedActionPin, now: string): boolean {
  return now >= action.expiresAt;
}

/**
 * The pending (awaiting the human) card, if any — at most ONE action
 * awaits confirmation at a time (the loop pauses on the first).
 */
export function pendingPreparedActionOf(
  events: readonly AgentConversationLogEvent[],
): PreparedActionCardView | undefined {
  return foldPreparedActionCards(events).find((card) => card.phase === "PENDING");
}

/** The reconcile cards (UNKNOWN outcomes and interrupted executions). */
export function reconcileCardsOf(
  events: readonly AgentConversationLogEvent[],
): readonly PreparedActionCardView[] {
  return foldPreparedActionCards(events).filter(
    (card) =>
      card.reconcileDue ||
      (card.phase === "EXECUTING" && card.outcome === undefined),
  );
}

/* -------------------------- the confirm gates ------------------------ */

/**
 * The confirm-path gates (the wiring calls these BEFORE authorizing):
 * expiry, digest match (a parameter change after approval = a NEW
 * preview required) and account-context match. Each failure is the
 * typed D10/D11 error — never a silent pass.
 */
export function assertConfirmable(
  action: StripePreparedActionPin,
  confirmedDigest: string,
  boundConnectionId: string,
  now: string,
): void {
  if (isPreparedActionExpired(action, now)) {
    throw new PreparedActionFlowError(
      "ACTION_EXPIRED",
      `prepared action ${action.preparedActionId} expired at ${action.expiresAt} — an expired action never executes; ask for a fresh preview`,
    );
  }
  if (action.digest !== confirmedDigest) {
    throw new PreparedActionFlowError(
      "PARAMETERS_CHANGED_NEW_PREVIEW_REQUIRED",
      `the prepared action's digest no longer matches what was approved (parameters changed after approval) — the authorization is invalid and a NEW preview is required before anything can execute`,
    );
  }
  if (action.accountContext.connectionId !== boundConnectionId) {
    throw new PreparedActionFlowError(
      "ACCOUNT_CONTEXT_CHANGED_NEW_PREVIEW_REQUIRED",
      `the task's account context changed since this action was prepared (action binds ${action.accountContext.connectionId}, task binds ${boundConnectionId}) — the authorization is invalid and a NEW preview prepared under the new account context is required`,
    );
  }
}

/** Resolve one action's current record by id (the re-inspect gate). */
export function findActionCard(
  events: readonly AgentConversationLogEvent[],
  preparedActionId: string,
): PreparedActionCardView | undefined {
  return foldPreparedActionCards(events).find((card) => card.preparedActionId === preparedActionId);
}

/** The expired-but-still-PENDING actions at `now` (resume marks them; never auto-executes). */
export function expiredPendingCards(
  events: readonly AgentConversationLogEvent[],
  now: string,
): readonly PreparedActionCardView[] {
  return foldPreparedActionCards(events).filter(
    (card) => card.phase === "PENDING" && isPreparedActionExpired(card.action, now),
  );
}

/** The exact-preview parameter lines (name = value · location). */
export function preparedActionParameterLines(
  action: StripePreparedActionPin,
): readonly { readonly name: string; readonly value: string; readonly location: string }[] {
  return action.parameters.map((parameter) => ({
    name: parameter.name,
    value: typeof parameter.value === "string" ? parameter.value : JSON.stringify(parameter.value),
    location: parameter.location,
  }));
}
