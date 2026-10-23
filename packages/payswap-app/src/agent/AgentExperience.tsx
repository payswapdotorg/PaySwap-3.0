/**
 * @payswap/app — the AGENT EXPERIENCE mount for the ZCode shell (the
 * P15 integration per the P13 UX reference).
 *
 * The reference's shared-entrypoints law, mounted over the ORIGINAL
 * ZCode UI: the Pay / Receive / Move / Convert entry actions and the
 * Connect-provider action all seed the ONE shared typed-intent task
 * orchestration (the same controller the composer text path drives —
 * card click and chat text converge on the same task, never a
 * duplicate), and the shared agent composer (dock + panel) rides
 * alongside as the persistent transcript/task surface.
 *
 * Mounting law: this component is a SIBLING of the substrate Root (the
 * web/desktop mounts compose it), never a child — the substrate stays
 * payswap-free (module ownership). It renders nothing but the fixed
 * entry rail + the composer chrome; every surface it shows carries the
 * P13 honest states (zero authority, no tools, voice
 * declared-unsupported) inherited from the panel.
 *
 * A11y laws (inherited posture):
 * - Every entry action is a real <button> with a visible focus ring.
 * - The rail is a labelled <nav> landmark with a list semantics.
 * - The rail hides while the composer panel is OPEN (the panel is the
 *   entry context then); it never traps focus and adds no dialogs.
 */

import { useSyncExternalStore } from "react";
import { AgentComposer } from "./AgentComposer.js";
import { sharedAgentComposerController } from "./agentComposerController.js";
import { AGENT_PAYMENT_DIRECTION_ENTRIES } from "../lib/agent-payment-entries.js";
import { agentProviderSetupCards } from "../lib/agent-provider-entries.js";

export interface PaySwapAgentExperienceProps {
  /**
   * The area id this mount lives on (labels the seeded tasks' entry
   * context honestly, e.g. "zcode-workspace" on the substrate shell).
   */
  readonly area?: string;
}

/** The chip glyph (presentation-only, hidden from AT). */
function EntryGlyph(): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function PaySwapAgentExperience({
  area = "workspace",
}: PaySwapAgentExperienceProps): React.ReactNode {
  const controller = sharedAgentComposerController();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  const seedPayment = (entry: (typeof AGENT_PAYMENT_DIRECTION_ENTRIES)[number]): void => {
    void controller.seedFromSurface({
      intent: {
        kind: "PAYMENT_MISSION",
        direction: entry.direction,
        goalStatement: entry.goalStatement,
      },
      originNote: entry.cardActionLabel,
      area,
    });
  };

  const seedConnection = (card: ReturnType<typeof agentProviderSetupCards>[number]): void => {
    void controller.seedFromSurface({
      intent: {
        kind: "CONNECTION_SETUP",
        providerId: card.providerId,
        form: card.form,
        useCaseRef: card.useCaseRef,
      },
      originNote: card.cardActionLabel,
      area,
    });
  };

  // The primary provider card only (the declared primary setup form;
  // qualifier forms stay in the connections catalogue where they belong).
  const primarySetupCard = agentProviderSetupCards()[0];

  return (
    <>
      {state.mode !== "open" ? (
        <nav className="ps-agent-entry-rail" aria-label="PaySwap agent entry actions">
          <ul className="ps-agent-entry-rail-list">
            {AGENT_PAYMENT_DIRECTION_ENTRIES.map((entry) => (
              <li key={entry.actionId}>
                <button
                  type="button"
                  className="ps-agent-entry-chip"
                  onClick={() => seedPayment(entry)}
                >
                  <span className="ps-agent-entry-chip-glyph" aria-hidden="true">
                    <EntryGlyph />
                  </span>
                  <span className="ps-agent-entry-chip-label">
                    {entry.cardTitle.split(" — ")[0]}
                  </span>
                </button>
              </li>
            ))}
            {primarySetupCard ? (
              <li>
                <button
                  type="button"
                  className="ps-agent-entry-chip"
                  onClick={() => seedConnection(primarySetupCard)}
                >
                  <span className="ps-agent-entry-chip-glyph" aria-hidden="true">
                    <EntryGlyph />
                  </span>
                  <span className="ps-agent-entry-chip-label">
                    Connect {primarySetupCard.providerLabel}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
          <p className="ps-agent-entry-rail-note">
            Guided intake — the agent drafts, you authorize. Nothing here moves money.
          </p>
        </nav>
      ) : null}
      <AgentComposer area={area} />
    </>
  );
}
