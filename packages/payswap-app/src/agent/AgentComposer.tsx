/**
 * @payswap/app — the AGENT COMPOSER MOUNT (P13-A UI).
 *
 * The persistent, toggleable composer: a fixed DOCK (minimized) or the
 * full PANEL (open), rendered by every integrated surface — Connections,
 * Pay/Receive/Move (Payments), Move/Convert (Accounts), the app overview
 * and the Agent Workspace overview. All mounts drive the ONE shared
 * controller (./agentComposerController.ts), so mode, draft, transcript
 * and task history are shared across surfaces by construction.
 *
 * A11Y laws:
 * - The dock is a real <button> with aria-expanded (a disclosure
 *   toggle, never a div); the badge count is text (screen-reader read).
 * - Minimizing returns focus to the dock (the toggle that reopens);
 *   opening focuses the input — user-initiated focus moves only.
 * - The panel is a labelled complementary section; the transcript is a
 *   role=log polite live region; Escape minimizes (keyboard path).
 * - Voice is declared-unsupported: the panel renders the pinned
 *   statement VERBATIM where voice would be offered — never a mic
 *   control, never a simulation.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  sharedAgentComposerController,
  type AgentComposerController,
} from "./agentComposerController.js";
import { AgentComposerPanel } from "./AgentComposerPanel.js";
import "./agent-composer.css";

export interface AgentComposerProps {
  /** Injectable controller (tests); default: the ONE shared controller. */
  readonly controller?: AgentComposerController;
  /** The area this mount lives on (labels the entry context honestly). */
  readonly area?: string;
}

/** The shared glyph (presentation-only, hidden from AT). */
function ComposerGlyph(): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

export function AgentComposer({ controller, area }: AgentComposerProps) {
  const resolved = controller ?? sharedAgentComposerController();
  const state = useSyncExternalStore(resolved.subscribe, resolved.getState, resolved.getState);
  const dockRef = useRef<HTMLButtonElement | null>(null);
  const minimizeByUser = useRef(false);

  // Load/refresh the task list whenever this mount appears.
  useEffect(() => {
    void resolved.refresh();
  }, [resolved]);

  const handleMinimize = (): void => {
    minimizeByUser.current = true;
    resolved.minimize();
  };

  // A user-initiated minimize returns focus to the dock (the toggle
  // that reopens the panel) once it has mounted.
  useEffect(() => {
    if (state.mode === "minimized" && minimizeByUser.current) {
      minimizeByUser.current = false;
      dockRef.current?.focus();
    }
  }, [state.mode]);

  if (state.mode === "closed") {
    return null;
  }

  if (state.mode === "minimized") {
    const openCount = state.tasks.filter((task) => task.resumable).length;
    return (
      <button
        ref={dockRef}
        type="button"
        className="ps-agent-dock"
        aria-expanded="false"
        onClick={() => resolved.open(area !== undefined ? { area } : undefined)}
      >
        <span className="ps-agent-dock-glyph" aria-hidden="true">
          <ComposerGlyph />
        </span>
        <span className="ps-agent-dock-label">PaySwap agent</span>
        {openCount > 0 ? (
          <span className="ps-agent-dock-badge ps-num">
            {openCount}
            <span className="ps-sr-only">
              {" "}
              {openCount === 1 ? "task" : "tasks"} in progress
            </span>
          </span>
        ) : null}
      </button>
    );
  }

  return <AgentComposerPanel state={state} controller={resolved} onMinimize={handleMinimize} />;
}
