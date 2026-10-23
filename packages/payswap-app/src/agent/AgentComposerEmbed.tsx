/**
 * @payswap/app — the EMBEDDED agent composer (the inline panel mount).
 *
 * The P13 connections concept's agent panel: the SAME shared
 * typed-intent orchestration the floating composer drives, rendered
 * INSIDE a surface's own layout (static positioning, the surface-context
 * header, no minimize/close chrome, no focus steal). One controller,
 * one task list, one transcript — wherever the panel renders, the state
 * is the same state (the convergence law rendered twice at most, never
 * forked).
 */

import { useEffect, useSyncExternalStore } from "react";
import { AgentComposerPanel } from "./AgentComposerPanel.js";
import { sharedAgentComposerController } from "./agentComposerController.js";

export function AgentComposerEmbed(): React.ReactNode {
  const controller = sharedAgentComposerController();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  // Load/refresh the task list whenever this mount appears (same
  // discipline as the floating mount).
  useEffect(() => {
    void controller.refresh();
  }, [controller]);

  return <AgentComposerPanel state={state} controller={controller} variant="inline" />;
}
