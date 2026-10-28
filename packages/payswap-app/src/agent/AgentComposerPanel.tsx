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
  AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN,
  MODEL_CATALOG_UNBOUND_NOTE,
  type CatalogModel,
} from "./taskModelPins.js";
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

/** One catalog option's value (a stable composite key — never an id guess). */
function modelOptionValue(model: CatalogModel): string {
  return `${model.providerId}/${model.modelId}`;
}

/**
 * The MODEL/DIFFICULTY controls (P21-B, ADR-0014 D4): hydrated from the
 * injected substrate catalog — REAL available models only, never a
 * fabricated list; an UNBOUND catalog renders the honest unbound note
 * and NO list. The selection records on the task record (fail-closed);
 * the disclosure note renders VERBATIM whenever a model is selected.
 */
function AgentModelControls({
  state,
  controller,
}: {
  readonly state: AgentComposerState;
  readonly controller: AgentComposerController;
}): React.ReactNode {
  const controls = state.modelControls;
  const [draftModel, setDraftModel] = useState<string>("");
  const [draftLevel, setDraftLevel] = useState<string>("");
  // Hydrate the REAL catalogue once when the panel mounts (the honest
  // phases surface; an absent port keeps the UNBOUND tier).
  useEffect(() => {
    void controller.loadModelCatalog();
  }, [controller]);
  if (controls.phase === "UNBOUND") {
    return (
      <div className="ps-agent-model-controls" id="ps-agent-model-controls">
        <h3 className="ps-agent-tasks-title">Model &amp; difficulty</h3>
        <p className="ps-agent-line ps-agent-line--empty">{MODEL_CATALOG_UNBOUND_NOTE}</p>
      </div>
    );
  }
  if (controls.phase === "LOADING") {
    return (
      <div className="ps-agent-model-controls" id="ps-agent-model-controls">
        <h3 className="ps-agent-tasks-title">Model &amp; difficulty</h3>
        <p className="ps-agent-line" role="status">Loading models…</p>
      </div>
    );
  }
  if (controls.phase === "ERROR") {
    return (
      <div className="ps-agent-model-controls" id="ps-agent-model-controls">
        <h3 className="ps-agent-tasks-title">Model &amp; difficulty</h3>
        <p className="ps-agent-line ps-agent-line--error" role="alert">{controls.error}</p>
      </div>
    );
  }
  const selectedModel =
    controls.models.find(
      (model) =>
        controls.selection !== undefined && modelOptionValue(model) === `${controls.selection.providerId}/${controls.selection.modelId}`,
    ) ?? undefined;
  const levelOptions = (draftModel !== ""
    ? controls.models.find((model) => modelOptionValue(model) === draftModel)
    : selectedModel)?.reasoningLevels ?? [];
  const currentModel = controls.selection !== undefined ? `${controls.selection.providerId}/${controls.selection.modelId}` : "";
  const currentLevel = controls.selection?.reasoningLevel ?? "";
  const canRecord = draftModel !== "" && draftLevel !== "";
  const record = (): void => {
    const parts = draftModel.split("/");
    const providerId = parts[0] ?? "";
    const modelId = parts.length > 1 ? (parts[1] ?? "") : "";
    void controller
      .selectModel({ providerId, modelId, reasoningLevel: draftLevel })
      .then(() => {
        setDraftModel("");
        setDraftLevel("");
      })
      .catch(() => {
        /* the typed refusal surfaces through the controls' honest error line */
      });
  };
  return (
    <div className="ps-agent-model-controls" id="ps-agent-model-controls">
      <h3 className="ps-agent-tasks-title">Model &amp; difficulty</h3>
      <p className="ps-agent-input-hint">
        Recorded with the task and applied to the routine's budget knobs — never to eligibility or authorization.
      </p>
      <label className="ps-sr-only" htmlFor="ps-agent-model-select">Model</label>
      <select
        id="ps-agent-model-select"
        data-ps-model-select
        className="ps-agent-model-select"
        value={draftModel || currentModel}
        onChange={(event) => {
          setDraftModel(event.target.value);
          setDraftLevel("");
        }}
      >
        <option value="">Select a model…</option>
        {controls.models.map((model) => (
          <option key={modelOptionValue(model)} value={modelOptionValue(model)}>
            {model.displayName}
          </option>
        ))}
      </select>
      <label className="ps-sr-only" htmlFor="ps-agent-difficulty-select">Difficulty (reasoning level)</label>
      <select
        id="ps-agent-difficulty-select"
        data-ps-difficulty-select
        className="ps-agent-model-select"
        value={draftLevel || currentLevel}
        onChange={(event) => setDraftLevel(event.target.value)}
      >
        <option value="">Select a difficulty…</option>
        {levelOptions.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      <button type="button" className="ps-agent-task-action" disabled={!canRecord} onClick={record}>
        Record model &amp; difficulty
      </button>
      {controls.error !== undefined ? (
        <p className="ps-agent-line ps-agent-line--error" role="alert">{controls.error}</p>
      ) : null}
      {controls.selection !== undefined ? (
        <p className="ps-agent-voice-note">{AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN}</p>
      ) : null}
    </div>
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
      {/* (P21-D, the J24 E2E finding) The ONE scrollable panel body: the
       * entry/law notes, the transcript, the tasks, the route-planning
       * section and the model controls scroll TOGETHER when the panel's
       * max-height clips them — the tasks section previously carried
       * flex: 1 1 auto + min-height: 0 and collapsed to ZERO height
       * whenever the sibling sections' min-content exceeded the panel
       * box (the task board rendered into scrollable overflow — present
       * in the a11y tree, invisible and unclickable on screen). The
       * header and the input form stay fixed; the body scrolls. */}
      <div className="ps-agent-panel-body">
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

      {/* The model/difficulty controls (P21-B, D4) — hydrated from the
       * injected substrate catalog; an unbound catalog renders the honest
       * unbound note, never a model list. */}
      <AgentModelControls state={state} controller={controller} />
      </div>

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
