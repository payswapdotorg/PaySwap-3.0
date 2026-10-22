/**
 * @payswap/app — the OVERVIEW workspace section (console surface).
 *
 * §6 overview fold, P11 — the OUTCOME-FIRST HOME per the operator's
 * target design: the outcome question ("What should PaySwap
 * accomplish?"), the mission INTAKE ENTRY CARD (a real goal-statement
 * textarea whose content prefills the missions creation intake — never
 * a decorative search box), the four outcome shortcuts
 * (PAY/RECEIVE/MOVE/CONVERT, each prefills the direction), and the
 * "Your workspace" honest note carrying the live mission count and —
 * when no in-progress mission exists — the two-reason designed-empty
 * line (zero missions ≠ all-archived). The honest approvals-plane
 * attention line stays on the home; when in-progress missions exist
 * they list below (in-progress only, the fold's order); recent activity
 * = real mission events (reverse-chronological, capped at 20). Loading
 * is a skeleton; failure is the typed error; nothing is ever fabricated
 * between them. `foldWorkspaceOverview` is UNCHANGED — only this
 * rendering is redesigned.
 */

import { useState } from "react";
import { ActivityTimeline, Card, StatusPill } from "@zcode/ui/payswap";
import type {
  ConsoleSectionRecord,
  MissionIntentDirection,
  MissionSummary,
} from "../contracts.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { ProductLink } from "../../shell/ProductLink.js";
import {
  OVERVIEW_ALL_ARCHIVED_STATE,
  OVERVIEW_ATTENTION,
  OVERVIEW_EMPTY_STATE,
} from "../section-vocabulary.js";
import type { WorkspaceStoreBinding } from "../useWorkspaceStore.js";
import { ErrorBlock, LoadingBlock, SectionScaffold } from "./shared.js";
import { AgentComposer } from "../../agent/AgentComposer.js";

/** The §6 overview activity cap. */
export const OVERVIEW_ACTIVITY_CAP = 20;

/** The prefill an overview intake-entry action hands to the missions intake. */
export interface OverviewIntakePrefill {
  readonly goalStatement?: string;
  readonly direction?: MissionIntentDirection;
}

/**
 * In-progress order (the §6 fold law, matching the P10-A
 * foldWorkspaceOverview): newest-updated first, id ascending as the
 * deterministic tie-break — never the adapter's incidental order.
 */
export function orderInProgressMissions(
  summaries: readonly MissionSummary[],
): readonly MissionSummary[] {
  return summaries
    .filter((mission) => mission.status !== "ARCHIVED")
    .slice()
    .sort(
      (a, b) =>
        (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

function MissionStatusPill({ status }: { readonly status: string }) {
  if (status === "INTENT_RECORDED") {
    return <StatusPill tone="ok">Intent recorded</StatusPill>;
  }
  return <StatusPill tone="attention">Draft — intent not recorded</StatusPill>;
}

/* ------------- the outcome-shortcut icons (presentation-only) -------- */

function outcomeIcon(path: React.ReactNode): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

const OUTCOME_SHORTCUTS: readonly {
  readonly direction: MissionIntentDirection;
  readonly title: string;
  readonly description: string;
  readonly glyph: React.ReactNode;
}[] = [
  {
    direction: "PAY",
    title: "Pay",
    description: "Prepare a payment",
    glyph: outcomeIcon(<path d="M4 12h15M13 6l6 6-6 6" />),
  },
  {
    direction: "RECEIVE",
    title: "Receive",
    description: "Set up incoming funds",
    glyph: outcomeIcon(<path d="M12 4v15M6 13l6 6 6-6" />),
  },
  {
    direction: "MOVE",
    title: "Move",
    description: "Coordinate a transfer",
    glyph: outcomeIcon(
      <>
        <path d="M4 8h12M12 4l4 4-4 4" />
        <path d="M20 16H8M12 12l-4 4 4 4" />
      </>,
    ),
  },
  {
    direction: "CONVERT",
    title: "Convert",
    description: "Compare conversion routes",
    glyph: outcomeIcon(
      <>
        <path d="M8 4v16M8 8l-3 3 3 3M16 20V4M16 16l3-3-3-3" />
      </>,
    ),
  },
];

export function OverviewSection({
  section,
  workspace,
  navigation,
  onOpenMission,
  onStartMission,
}: {
  readonly section: ConsoleSectionRecord;
  readonly workspace: WorkspaceStoreBinding;
  readonly navigation: PaySwapNavigation;
  /** Opens the mission detail (the workspace also routes to missions). */
  readonly onOpenMission: (id: string) => void;
  /** Starts a mission from the home: navigates to the missions intake PREFILLED (§8 zero-dead-actions). */
  readonly onStartMission: (prefill: OverviewIntakePrefill) => void;
}) {
  const { list, activity } = workspace;
  const [draftGoal, setDraftGoal] = useState("");
  const inProgress =
    list.phase === "ready" ? orderInProgressMissions(list.summaries) : [];
  // The honest two-reason empty line (§6): zero missions is a different
  // fact from every-mission-archived — the reason must not lie either way.
  const emptySpec =
    list.phase === "ready" && list.summaries.length > 0
      ? OVERVIEW_ALL_ARCHIVED_STATE
      : OVERVIEW_EMPTY_STATE;

  return (
    <SectionScaffold section={section}>
      <section aria-labelledby="ps-console-overview-question" className="ps-console-block">
        <h2 id="ps-console-overview-question" className="ps-console-question">
          What should PaySwap accomplish?
        </h2>
        <p className="ps-console-question-sub">
          Describe an outcome. Review the proposed plan before any consequential action.
        </p>

        <Card className="ps-console-intake-entry" id="overview-intake-entry">
          <label htmlFor="ps-console-overview-goal" className="ps-sr-only">
            Tell your agents what you need
          </label>
          <textarea
            id="ps-console-overview-goal"
            className="ps-console-intake-entry-input"
            rows={2}
            value={draftGoal}
            onChange={(event) => setDraftGoal(event.target.value)}
            placeholder="Tell your agents what you need ..."
          />
          <p className="ps-console-intake-entry-suggestion">
            Move money to a recipient, find the best eligible route, or prepare a payment
            for approval.
          </p>
          <div className="ps-console-intake-entry-actions">
            <button
              type="button"
              className="ps-console-action ps-console-action--primary ps-console-intake-entry-cta"
              onClick={() =>
                onStartMission({
                  goalStatement: draftGoal.trim() !== "" ? draftGoal : undefined,
                })
              }
            >
              New mission
            </button>
          </div>
        </Card>

        <h3 className="ps-console-outcomes-title">Start with an outcome</h3>
        <div className="ps-console-outcome-grid">
          {OUTCOME_SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.direction}
              type="button"
              className="ps-console-outcome-card"
              onClick={() => onStartMission({ direction: shortcut.direction })}
            >
              <span className="ps-console-outcome-glyph" aria-hidden="true">
                {shortcut.glyph}
              </span>
              <span className="ps-console-outcome-title">{shortcut.title}</span>
              <span className="ps-console-outcome-description">
                {shortcut.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="ps-console-overview-workspace" className="ps-console-block">
        <h3 id="ps-console-overview-workspace" className="ps-console-block-title">
          Your workspace
        </h3>
        <p className="ps-console-workspace-note">
          Missions, agent activity, and approvals will appear here when real records
          exist. Connected services and prerequisites remain visible, rather than being
          replaced with demo data.
        </p>
        {list.phase === "loading" ? (
          <LoadingBlock count={2} />
        ) : list.phase === "error" && list.error !== undefined ? (
          <ErrorBlock error={list.error} onRetry={() => void workspace.reload()} />
        ) : inProgress.length > 0 ? (
          <p className="ps-console-workspace-count ps-num">
            {inProgress.length} mission{inProgress.length === 1 ? "" : "s"} in progress —
            see Missions.
          </p>
        ) : (
          <p className="ps-console-workspace-count">{emptySpec.reason}</p>
        )}
      </section>

      <Card className="ps-console-attention" raised>
        <div className="ps-console-attention-head">
          <StatusPill tone="attention">Attention</StatusPill>
          <h2 className="ps-console-attention-title">Decisions needing attention</h2>
        </div>
        <p className="ps-console-line">{OVERVIEW_ATTENTION.reason}</p>
        <p className="ps-console-line-actions">
          <ProductLink
            to="/console/approvals"
            navigation={navigation}
            className="ps-console-action"
          >
            {OVERVIEW_ATTENTION.nextAction.label}
          </ProductLink>
        </p>
      </Card>

      {inProgress.length > 0 ? (
        <section aria-labelledby="ps-console-overview-missions" className="ps-console-block">
          <h2 id="ps-console-overview-missions" className="ps-console-block-title">
            Missions in progress
          </h2>
          <ul className="ps-console-mission-list">
            {inProgress.map((mission) => (
              <li key={mission.id} className="ps-console-mission-row">
                <div className="ps-console-mission-main">
                  <p className="ps-console-mission-goal">{mission.goalStatement}</p>
                  <p className="ps-console-mission-meta ps-num">
                    {mission.direction}
                    {mission.amount !== undefined
                      ? ` · ${mission.amount.minorUnits} ${mission.amount.currency}`
                      : ""}{" "}
                    · updated {mission.updatedAt}
                  </p>
                </div>
                <MissionStatusPill status={mission.status} />
                <button
                  type="button"
                  className="ps-console-action"
                  onClick={() => onOpenMission(mission.id)}
                >
                  Open mission
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="ps-console-overview-agent" className="ps-console-block">
        <h3 id="ps-console-overview-agent" className="ps-console-block-title">
          The shared PaySwap agent composer
        </h3>
        <p className="ps-console-workspace-note">
          The same composer that lives on the product areas (Connections,
          Payments, Accounts) is exposed here in the Agent Workspace: type
          a request in plain words and it becomes the SAME resumable task
          a card click creates — one task list, one history. The composer
          records requests and progress only; it holds zero financial
          authority, and voice input is not supported in this deployment —
          stated, never simulated.
        </p>
        <AgentComposer area="console-overview" />
      </section>

      <section aria-labelledby="ps-console-overview-activity" className="ps-console-block">
        <h2 id="ps-console-overview-activity" className="ps-console-block-title">
          Recent activity
        </h2>
        <p className="ps-console-block-note">
          Real mission events from this store, newest first — the{" "}
          {OVERVIEW_ACTIVITY_CAP} most recent.
        </p>
        {activity.phase === "loading" || activity.phase === "idle" ? (
          <LoadingBlock />
        ) : activity.phase === "error" && activity.error !== undefined ? (
          <ErrorBlock error={activity.error} onRetry={() => void workspace.reload()} />
        ) : (
          <ActivityTimeline
            entries={activity.events.slice(0, OVERVIEW_ACTIVITY_CAP).map((event) => ({
              id: event.id,
              description: event.summary,
              timestamp: event.at,
            }))}
            empty={
              <p className="ps-console-line">No mission events are recorded yet.</p>
            }
          />
        )}
      </section>
    </SectionScaffold>
  );
}
