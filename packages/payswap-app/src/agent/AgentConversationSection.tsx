/**
 * @payswap/app — the AGENT CONVERSATION SECTION (P24-3 UI).
 *
 * The composer panel's conversation surface: the selected-model
 * transcript (user/model/tool lines from the append-only log), the
 * EXACT prepared-action preview with the tiered confirmation (the
 * human gate — Confirm/Refuse are USER gestures), the account/
 * environment context with the explicit switch control, the honest
 * unbound tier and the resume/reconcile cards.
 *
 * ZERO FINANCIAL AUTHORITY (the panel's standing law): the only verbs
 * are the user gestures (confirm, refuse, bind, cancel) delegated to
 * the controller; every execution fact shown here comes from the
 * host-minted records, never from model claims. UNKNOWN renders as
 * UNKNOWN — never as failed or succeeded.
 */

import { StatusPill } from "@zcode/ui/payswap";
import type { AgentComposerController, AgentComposerState } from "./agentComposerController.js";
import type { AgentConversationState } from "./agentConversationWiring.js";
import {
  AGENT_MODEL_CONVERSATION_UNBOUND_NOTE,
} from "./modelConversationPort.js";
import {
  STRIPE_ACCOUNT_CONTEXT_UNBOUND_NOTE,
  STRIPE_TOOL_CATALOGUE_UNBOUND_NOTE,
} from "./stripeToolCataloguePort.js";
import {
  AGENT_CONVERSATION_CONFIRMATION_NOTE,
  AGENT_CONVERSATION_RUNNING_NOTE,
} from "./agentConversationProjection.js";
import {
  PREPARED_ACTION_TIER_LABELS,
  preparedActionParameterLines,
  type PreparedActionCardView,
} from "./preparedActionFlow.js";
import { accountContextLine, accountEnvironmentTone } from "./taskAccountContext.js";
import { tierAllowsConversationalConfirmation } from "./conversationConfirmationPhrases.js";

const SPEAKER_LABELS: Readonly<Record<string, string>> = {
  you: "You",
  model: "Model",
  system: "System",
};

function ConversationLine({
  entry,
}: {
  readonly entry: AgentConversationState["entries"][number];
}): React.ReactNode {
  return (
    <p className={`ps-agent-line ps-agent-line--${entry.speaker}`}>
      <span className="ps-agent-line-speaker">{SPEAKER_LABELS[entry.speaker] ?? entry.speaker}</span>
      <span className="ps-agent-line-text">{entry.text}</span>
    </p>
  );
}

/** The EXACT preview of one prepared action (rendered verbatim from the record). */
function PreparedActionPreview({ card }: { readonly card: PreparedActionCardView }): React.ReactNode {
  const action = card.action;
  return (
    <dl className="ps-agent-prepared-preview">
      <div>
        <dt>Operation</dt>
        <dd className="ps-num">{action.operationId}</dd>
      </div>
      <div>
        <dt>Account</dt>
        <dd className="ps-num">
          {action.accountContext.stripeAccountId} · {action.accountContext.environment} ·{" "}
          {action.accountContext.accountModel}
        </dd>
      </div>
      <div>
        <dt>Parameters (exact)</dt>
        <dd>
          {preparedActionParameterLines(action).map((parameter) => (
            <span key={parameter.name} className="ps-num ps-agent-prepared-param">
              {parameter.name} = {parameter.value} ({parameter.location})
            </span>
          ))}
        </dd>
      </div>
      <div>
        <dt>Effect class</dt>
        <dd>{action.effectClass}</dd>
      </div>
      <div>
        <dt>Approval tier</dt>
        <dd>{PREPARED_ACTION_TIER_LABELS[action.approvalTier]}</dd>
      </div>
      <div>
        <dt>Confirmation inputs</dt>
        <dd>{action.confirmationInputs.length > 0 ? action.confirmationInputs.join("; ") : "—"}</dd>
      </div>
      <div>
        <dt>Preview digest</dt>
        <dd className="ps-num">{action.digest}</dd>
      </div>
      <div>
        <dt>Expires</dt>
        <dd className="ps-num">{action.expiresAt}</dd>
      </div>
      {action.readBackOperationId !== null ? (
        <div>
          <dt>Read-back</dt>
          <dd className="ps-num">{action.readBackOperationId}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function PendingActionCard({
  card,
  controller,
}: {
  readonly card: PreparedActionCardView;
  readonly controller: AgentComposerController;
}): React.ReactNode {
  const tier = card.action.approvalTier;
  const confirmLabel =
    tier === "REAUTH"
      ? "Re-authenticate & confirm"
      : tier === "STRONG_CONFIRM"
        ? "Confirm — strong confirmation"
        : "Confirm this action";
  const conversationalHint = tierAllowsConversationalConfirmation(tier)
    ? " You can also confirm by replying exactly 'yes' in the conversation (or refuse with 'no')."
    : " This tier requires the button — a chat reply cannot confirm it.";
  return (
    <div className="ps-agent-task ps-agent-prepared-action" data-testid="ps-agent-prepared-action">
      <div className="ps-agent-task-head">
        <p className="ps-agent-task-title">Proposed action — awaiting your confirmation</p>
        <StatusPill tone="attention">{PREPARED_ACTION_TIER_LABELS[tier]}</StatusPill>
      </div>
      <PreparedActionPreview card={card} />
      <p className="ps-agent-voice-note">
        {AGENT_CONVERSATION_CONFIRMATION_NOTE}
        {conversationalHint}
      </p>
      <div className="ps-agent-task-actions">
        <button
          type="button"
          className="ps-agent-task-action"
          data-testid="ps-agent-confirm-action"
          onClick={() => void controller.confirmPreparedAction(card.preparedActionId)}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="ps-agent-task-action"
          data-testid="ps-agent-refuse-action"
          onClick={() => void controller.refusePreparedAction(card.preparedActionId)}
        >
          Refuse — do not execute
        </button>
      </div>
    </div>
  );
}

function ReconcileCard({ card }: { readonly card: PreparedActionCardView }): React.ReactNode {
  const interrupted = card.phase === "EXECUTING" && card.outcome === undefined;
  return (
    <div className="ps-agent-task ps-agent-reconcile-card" data-testid="ps-agent-reconcile-card">
      <div className="ps-agent-task-head">
        <p className="ps-agent-task-title">{interrupted ? "Interrupted execution" : "Reconciliation due"}</p>
        <StatusPill tone="unknown">UNKNOWN</StatusPill>
      </div>
      <p className="ps-agent-task-meta ps-num">
        {card.action.operationId} · {card.preparedActionId}
      </p>
      <p className="ps-agent-line ps-agent-line-text">
        {interrupted
          ? "The execution was interrupted before its outcome was recorded — the effect may or may not have happened. UNKNOWN is not failed and not succeeded: a provider read-back (reconciliation) establishes the truth before any retry, and nothing retries automatically."
          : "The outcome is UNKNOWN — the effect may or may not have happened. Reconciliation reads the provider state back before any retry; no success or failure is claimed here."}
      </p>
    </div>
  );
}

function AccountContextControls({
  state,
  controller,
}: {
  readonly state: AgentConversationState;
  readonly controller: AgentComposerController;
}): React.ReactNode {
  const account = state.accountContext;
  return (
    <div className="ps-agent-account-context">
      {account !== undefined ? (
        <>
          <p className="ps-agent-account-chip" data-testid="ps-agent-account-chip">
            {accountContextLine(account)}
          </p>
          <StatusPill tone={accountEnvironmentTone(account.environment)}>{account.environment}</StatusPill>
        </>
      ) : (
        <p className="ps-agent-account-chip">{STRIPE_ACCOUNT_CONTEXT_UNBOUND_NOTE}</p>
      )}
      {state.availableAccounts.length > 1 ? (
        <>
          <label className="ps-sr-only" htmlFor="ps-agent-account-select">
            Stripe account for this task
          </label>
          <select
            id="ps-agent-account-select"
            data-testid="ps-agent-account-select"
            className="ps-agent-model-select"
            value={account?.connectionId ?? ""}
            onChange={(event) => void controller.bindAccountContext(event.target.value)}
          >
            <option value="">Select an account…</option>
            {state.availableAccounts.map((available) => (
              <option key={available.connectionId} value={available.connectionId}>
                {accountContextLine(available)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

export function AgentConversationSection({
  state,
  controller,
}: {
  readonly state: AgentComposerState;
  readonly controller: AgentComposerController;
}): React.ReactNode {
  const conversation = state.conversation;
  if (conversation.phase === "UNBOUND") {
    // The web tier's honest truth — never a simulated conversation.
    return (
      <div className="ps-agent-tasks" id="ps-agent-conversation">
        <h3 className="ps-agent-tasks-title">Conversation</h3>
        <p className="ps-agent-line ps-agent-line--empty">{AGENT_MODEL_CONVERSATION_UNBOUND_NOTE}</p>
        <p className="ps-agent-line ps-agent-line--empty">{STRIPE_TOOL_CATALOGUE_UNBOUND_NOTE}</p>
      </div>
    );
  }
  return (
    <div className="ps-agent-tasks" id="ps-agent-conversation">
      <h3 className="ps-agent-tasks-title">Conversation</h3>
      <AccountContextControls state={conversation} controller={controller} />
      {conversation.modelNote !== undefined ? (
        <p className="ps-agent-line ps-agent-line--system" role="note" data-testid="ps-agent-conversation-note">
          {conversation.modelNote}
        </p>
      ) : null}
      {conversation.phase === "RUNNING" ? (
        <p className="ps-agent-line" role="status">
          {AGENT_CONVERSATION_RUNNING_NOTE}
        </p>
      ) : null}
      {conversation.phase === "RUNNING" ? (
        <div className="ps-agent-task-actions">
          <button
            type="button"
            className="ps-agent-task-action"
            data-testid="ps-agent-cancel-conversation"
            onClick={() => controller.cancelConversation()}
          >
            Cancel this run
          </button>
        </div>
      ) : null}
      <div className="ps-agent-transcript" aria-live="polite" aria-label="Model conversation">
        {conversation.entries.length === 0 ? (
          <p className="ps-agent-line ps-agent-line--empty">
            The conversation with the recorded model starts with your next request on this task.
          </p>
        ) : (
          conversation.entries.map((entry) => <ConversationLine key={entry.id} entry={entry} />)
        )}
      </div>
      {conversation.pendingAction !== undefined && conversation.pendingAction.phase === "PENDING" ? (
        <PendingActionCard card={conversation.pendingAction} controller={controller} />
      ) : null}
      {conversation.reconcileCards.map((card) => (
        <ReconcileCard key={card.preparedActionId} card={card} />
      ))}
    </div>
  );
}
