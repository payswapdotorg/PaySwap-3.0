/**
 * @payswap/app — the TASK ACCOUNT/ENVIRONMENT CONTEXT binding
 * (P24-3, handoff §3.4 + §11 Worker-3.5).
 *
 * A task's conversation is bound to ONE Stripe connection/account/
 * environment (host-resolved facts — never model-supplied). The laws:
 *
 * - ONE BINDING AT A TIME: the fold reads the LAST
 *   ACCOUNT_CONTEXT_BOUND event; every tool call carries that
 *   connectionId and nothing else.
 * - SWITCHING IS AN EXPLICIT USER-AUTHORIZED SCOPE CHANGE: only the
 *   controller's user-gesture path appends a
 *   USER_AUTHORIZED_SWITCH binding; the model can never trigger,
 *   forge or silently cross account context (tool argument schemas
 *   have NO connection/account field — unknown fields are rejected).
 * - MULTI-ACCOUNT CLARITY: the UI renders the bound account +
 *   environment chip and the available connections (from the
 *   account-facts port), honestly labeled.
 */

import type { AgentConversationLogEvent } from "./conversationLogEvents.js";
import type { StripeAccountFactsPin } from "./stripeToolCataloguePort.js";

/* ------------------------------ the binding --------------------------- */

/** The task's account binding (the fold of the log's binding events). */
export interface AgentTaskAccountBinding {
  readonly connectionId: string;
  readonly boundAt: string;
  readonly scopeChange: "INITIAL" | "USER_AUTHORIZED_SWITCH";
}

/**
 * Fold the CURRENT binding from the conversation log (the LAST
 * ACCOUNT_CONTEXT_BOUND event wins; undefined = no binding yet).
 */
export function foldAccountBinding(
  events: readonly AgentConversationLogEvent[],
): AgentTaskAccountBinding | undefined {
  let binding: AgentTaskAccountBinding | undefined;
  for (const logEvent of events) {
    const event = logEvent.event;
    if (event.kind === "ACCOUNT_CONTEXT_BOUND") {
      binding = {
        connectionId: event.connectionId,
        boundAt: logEvent.at,
        scopeChange: event.scopeChange,
      };
    }
  }
  return binding;
}

/** The account-facts lookup for the bound connection (undefined = unbound). */
export function boundAccountFacts(
  events: readonly AgentConversationLogEvent[],
  accounts: readonly StripeAccountFactsPin[],
): StripeAccountFactsPin | undefined {
  const binding = foldAccountBinding(events);
  if (binding === undefined) {
    return undefined;
  }
  return accounts.find((account) => account.connectionId === binding.connectionId);
}

/** The people-language account chip line (multi-account clarity). */
export function accountContextLine(account: StripeAccountFactsPin): string {
  const label = account.displayName ?? account.stripeAccountId;
  return `Stripe · ${label} · ${account.stripeAccountId} · ${account.environment}`;
}

/** The environment tone (SANDBOX is the current deployment's only tier — INV-25). */
export function accountEnvironmentTone(environment: string): "ok" | "attention" {
  return environment === "SANDBOX" ? "ok" : "attention";
}

/** The honest note when the bound connection's facts can no longer be resolved. */
export const ACCOUNT_CONTEXT_UNRESOLVED_NOTE =
  "The connection this task was bound to can no longer be verified — its account facts are not currently available, so no tool can run against it and no prepared action can execute until the connection is verified again or you bind a different account explicitly." as const;

/** The scope-change disclosure recorded with every explicit switch. */
export const ACCOUNT_SCOPE_CHANGE_NOTE =
  "Account context changed by an explicit user action — the conversation, its tools and any future prepared actions now bind to the new account and environment; pending prepared actions from the previous context do NOT carry over (a new preview is required for anything you still want to do)." as const;
