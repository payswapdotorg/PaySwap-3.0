/**
 * @payswap/app — the AGENT COMPOSER PANEL (P13-A UI).
 *
 * The open-state panel: the conversation transcript (role=log, polite),
 * the TASK HISTORY projection (status pill + append-only events, the
 * history toggle per task), the text input (Enter sends, Shift+Enter
 * adds a line — predictable, never a surprise send) and the pinned
 * honest notes — the ZERO-AUTHORITY law, the no-tools fact, the
 * declared-unsupported VOICE statement VERBATIM and the durability
 * fact. Rendered by ./AgentComposer.tsx (the mount owns the dock +
 * focus management).
 *
 * ZERO AUTHORITY (ADR-0007 D7): the only verbs here are send (seed a
 * task), show history and cancel a task RECORD. No dispatch, no
 * approval, no credential entry — ever.
 */

import { useEffect, useRef, useState } from "react";
import { StatusPill } from "@zcode/ui/payswap";
import { AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN } from "../lib/agent-task-pins.js";
import type { AgentComposerController, AgentComposerState, AgentComposerTranscriptEntry } from "./agentComposerController.js";
import { RoutePlanningMount } from "./RoutePlanningMount.js";
import {
  AGENT_COMPOSER_DURABILITY_FACT,
  AGENT_COMPOSER_EMPTY_TRANSCRIPT_NOTE,
  AGENT_COMPOSER_INPUT_HINT,
  AGENT_COMPOSER_MEMORY_ONLY_FACT,
  AGENT_COMPOSER_NO_TOOLS_NOTE,
  AGENT_COMPOSER_ZERO_AUTHORITY_NOTE,
  agentComposerSpeaker,
  type AgentComposerTaskView,
} from "./agentComposerProjection.js";

const SPEAKER_LABELS: Readonly<Record<string, string>> = {
  you: "You",
  agent: "Agent",
  system: "Composer",
};

function AgentComposerLine({ entry }: { readonly entry: AgentComposerTranscriptEntry }) {
  const speaker = agentComposerSpeaker(entry.kind);
  return (
    <p className={`ps-agent-line ps-agent-line--${speaker}`}>
      <span className="ps-agent-line-speaker">{SPEAKER_LABELS[speaker]}</span>
      <span className="ps-agent-line-text">{entry.text}</span>
    </p>
  );
}

function AgentComposerTaskCard({
  task,
  controller,
}: {
  readonly task: AgentComposerTaskView;
  readonly controller: AgentComposerController;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyId = `${task.id}-history`;
  return (
    <li className="ps-agent-task">
      <div className="ps-agent-task-head">
        <p className="ps-agent-task-title">{task.title}</p>
        <StatusPill tone={task.statusView.tone}>{task.statusView.label}</StatusPill>
      </div>
      <p className="ps-agent-task-meta ps-num">
        {task.intentLine} · updated {task.updatedAt}
      </p>
      <div className="ps-agent-task-actions">
        <button
          type="button"
          className="ps-agent-task-action"
          aria-expanded={historyOpen}
          aria-controls={historyId}
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? "Hide history" : "Show history"}
        </button>
        {task.resumable ? (
          <button
            type="button"
            className="ps-agent-task-action"
            onClick={() => void controller.cancelTask(task.id)}
          >
            Cancel task
          </button>
        ) : null}
      </div>
      {historyOpen ? (
        <ol className="ps-agent-task-events" id={historyId}>
          {task.events.map((event) => (
            <li key={event.id} className="ps-agent-task-event">
              <span className="ps-num">{event.at}</span>{" "}
              <strong>{event.kind}</strong> <span>{event.summary}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** The brand mark of the embedded panel (presentation-only). */
function AgentBrandMark(): React.ReactNode {
  return (
    <span className="ps-agent-brand-mark" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M4 8l6-6 6 6" />
        <path d="M20 16l-6 6-6-6" />
        <path d="M10 2h10M4 22h10" />
      </svg>
    </span>
  );
}

export function AgentComposerPanel({
  state,
  controller,
  onMinimize,
  variant = "floating",
}: {
  readonly state: AgentComposerState;
  readonly controller: AgentComposerController;
  readonly onMinimize?: () => void;
  /**
   * floating (default): the fixed overlay panel the workspace mount
   * shows. inline: the embedded variant a surface renders INSIDE its
   * own layout (e.g. the connections page's agent panel) — static
   * positioning, the surface-context header, no minimize/close chrome
   * and no focus steal on mount.
   */
  readonly variant?: "floating" | "inline";
}) {
  const inline = variant === "inline";
  const panelId = inline ? "ps-connections-agent-panel" : "ps-agent-composer-panel";
  const inputId = inline ? "ps-connections-agent-input" : "ps-agent-composer-input";
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Opening the FLOATING composer puts the user in the input (a
  // user-initiated focus move — the dock click / entry action asked for
  // this panel). The inline variant never steals page focus on mount.
  useEffect(() => {
    if (!inline) {
      inputRef.current?.focus();
    }
  }, [inline]);

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    void controller.send();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void controller.send();
    }
  };

  const draftEmpty = state.draftText.trim().length === 0;

  // The embedded panel's surface-context subtitle (the P13 concept's
  // "Stripe setup · resumable mission"): the latest resumable task's
  // people-language title, or the honest standing invitation.
  const latestResumable = state.tasks.find((task) => task.resumable);
  const inlineSubtitle =
    latestResumable !== undefined
      ? `${latestResumable.title.split(" — ")[0]} · resumable mission`
      : "Ask about payments or connections";

  return (
    <section
      id={panelId}
      className={inline ? "ps-agent-panel ps-agent-panel--inline" : "ps-agent-panel"}
      aria-label="PaySwap agent composer"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !inline && onMinimize !== undefined) {
          event.preventDefault();
          onMinimize();
        }
      }}
    >
      {inline ? (
        <header className="ps-agent-panel-head ps-agent-panel-head--inline">
          <AgentBrandMark />
          <div>
            <h2 className="ps-agent-panel-title">PaySwap Agent</h2>
            <p className="ps-agent-panel-subtitle">{inlineSubtitle}</p>
          </div>
        </header>
      ) : (
        <header className="ps-agent-panel-head">
          <div>
            <p className="ps-agent-panel-eyebrow">PaySwap agent</p>
            <h2 className="ps-agent-panel-title">Ask about payments or connections</h2>
          </div>
          <div className="ps-agent-panel-actions">
            <button
              type="button"
              className="ps-agent-panel-action"
              aria-expanded="true"
              aria-controls={panelId}
              onClick={onMinimize}
            >
              Minimize
            </button>
            <button type="button" className="ps-agent-panel-action" onClick={() => controller.close()}>
              Close
            </button>
          </div>
        </header>
      )}
      {state.entryArea !== null ? (
        <p className="ps-agent-panel-entry">Opened from the {state.entryArea} area.</p>
      ) : null}
      <p className="ps-agent-panel-law">{AGENT_COMPOSER_ZERO_AUTHORITY_NOTE}</p>

      <div className="ps-agent-transcript" role="log" aria-live="polite" aria-label="Composer conversation">
        {state.entries.length === 0 ? (
          inline ? (
            <p className="ps-agent-guidance">
              I can guide you through the setup. First, are you connecting an existing Stripe
              account, or creating a marketplace using Stripe Connect? Reply with text or describe
              your goal — for other providers I will answer honestly with what is declared.
            </p>
          ) : (
            <p className="ps-agent-line ps-agent-line--empty">{AGENT_COMPOSER_EMPTY_TRANSCRIPT_NOTE}</p>
          )
        ) : (
          state.entries.map((entry) => <AgentComposerLine key={entry.id} entry={entry} />)
        )}
      </div>

      <div className="ps-agent-tasks">
        <h3 className="ps-agent-tasks-title">Tasks</h3>
        {state.tasksPhase === "loading" ? (
          <p className="ps-agent-line" role="status">
            Loading tasks…
          </p>
        ) : state.tasksPhase === "error" && state.tasksError !== null ? (
          <p className="ps-agent-line ps-agent-line--error" role="alert">
            {state.tasksError}
          </p>
        ) : state.tasks.length === 0 ? (
          <p className="ps-agent-line ps-agent-line--empty">
            No tasks yet — a request from the box below or an area action records the first one.
          </p>
        ) : (
          <ul className="ps-agent-task-list">
            {state.tasks.map((task) => (
              <AgentComposerTaskCard key={task.id} task={task} controller={controller} />
            ))}
          </ul>
        )}
      </div>

      {/* The route-planning section (P16-D): its own mount over the same
       * controller — the proceed-or-wait surface, honestly unbound until
       * the platform host binds the real engines (ADR-0009 D2). */}
      <RoutePlanningMount controller={controller} />

      <form className="ps-agent-input" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="ps-sr-only">
          Ask the PaySwap agent
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          className="ps-agent-input-field"
          rows={2}
          value={state.draftText}
          onChange={(event) => controller.setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            inline
              ? "Reply with text or describe your goal…"
              : "Type a request — for example: connect Stripe, or pay the supplier"
          }
        />
        <div className="ps-agent-input-row">
          <p className="ps-agent-input-hint">{AGENT_COMPOSER_INPUT_HINT}</p>
          <button
            type="submit"
            className="ps-agent-send"
            disabled={state.sendPhase === "sending" || draftEmpty}
          >
            {state.sendPhase === "sending" ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>

      <p className="ps-agent-voice-note">{AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN}</p>
      <footer className="ps-agent-panel-foot">
        <p>{AGENT_COMPOSER_NO_TOOLS_NOTE}</p>
        <p>{state.uiPersistence === "browser-profile" ? AGENT_COMPOSER_DURABILITY_FACT : AGENT_COMPOSER_MEMORY_ONLY_FACT}</p>
      </footer>
    </section>
  );
}
