/**
 * @payswap/app — the OVERVIEW workspace section (console surface).
 *
 * §6 overview fold, rendered honestly: in-progress missions (real, from
 * the store; status !== ARCHIVED), the attention line carrying the
 * honest approvals-plane fact (typed reason + route to the approvals
 * section), recent activity (real mission events, reverse-chronological,
 * capped at 20) and — when no missions exist — the designed-empty state
 * whose create-first-mission next action actually navigates to the
 * missions intake. Loading is a skeleton; failure is the typed error;
 * nothing is ever fabricated between them.
 */

import { ActivityTimeline, Card, StatusPill } from "@zcode/ui/payswap";
import type { ConsoleSectionRecord } from "../contracts.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { ProductLink } from "../../shell/ProductLink.js";
import {
  OVERVIEW_ATTENTION,
  OVERVIEW_EMPTY_STATE,
} from "../section-vocabulary.js";
import type { WorkspaceStoreBinding } from "../useWorkspaceStore.js";
import {
  ConsoleEmptyStateView,
  ErrorBlock,
  LoadingBlock,
  SectionScaffold,
} from "./shared.js";

/** The §6 overview activity cap. */
export const OVERVIEW_ACTIVITY_CAP = 20;

function MissionStatusPill({ status }: { readonly status: string }) {
  if (status === "INTENT_RECORDED") {
    return <StatusPill tone="ok">Intent recorded</StatusPill>;
  }
  return <StatusPill tone="attention">Draft — intent not recorded</StatusPill>;
}

export function OverviewSection({
  section,
  workspace,
  navigation,
  onOpenMission,
}: {
  readonly section: ConsoleSectionRecord;
  readonly workspace: WorkspaceStoreBinding;
  readonly navigation: PaySwapNavigation;
  /** Opens the mission detail (the workspace also routes to missions). */
  readonly onOpenMission: (id: string) => void;
}) {
  const { list, activity } = workspace;
  const inProgress =
    list.phase === "ready" ? list.summaries.filter((m) => m.status !== "ARCHIVED") : [];

  return (
    <SectionScaffold section={section}>
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

      <section aria-labelledby="ps-console-overview-missions" className="ps-console-block">
        <h2 id="ps-console-overview-missions" className="ps-console-block-title">
          Missions in progress
        </h2>
        {list.phase === "loading" ? (
          <LoadingBlock />
        ) : list.phase === "error" && list.error !== undefined ? (
          <ErrorBlock error={list.error} onRetry={() => void workspace.reload()} />
        ) : inProgress.length === 0 ? (
          <ConsoleEmptyStateView
            spec={OVERVIEW_EMPTY_STATE}
            navigation={navigation}
            title="No missions yet — the honest state"
          />
        ) : (
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
        )}
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
