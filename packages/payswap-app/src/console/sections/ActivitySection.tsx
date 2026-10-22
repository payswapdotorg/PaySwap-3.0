/**
 * @payswap/app — the ACTIVITY workspace section (console surface).
 *
 * §6: real mission events (the store's append-only record, newest
 * first) + the outcome-state reference rendered as clearly-labeled
 * REFERENCE states — never as live activity: UNKNOWN ≠ FAILED with
 * reconciliation-first wording, submission-is-not-finality, and
 * late-returns-possible. The UNKNOWN reference row announces politely
 * (role="status", never alert — SV-3).
 */

import { ActivityTimeline, Card, StatusPill } from "@zcode/ui/payswap";
import type { ConsoleSectionRecord } from "../contracts.js";
import {
  ACTIVITY_EMPTY_STATE,
  ACTIVITY_OUTCOME_REFERENCE,
  REFERENCE_SECTION_ANCHORS,
} from "../section-vocabulary.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import type { WorkspaceStoreBinding } from "../useWorkspaceStore.js";
import {
  ConsoleEmptyStateView,
  ErrorBlock,
  LoadingBlock,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

export function ActivitySection({
  section,
  workspace,
  navigation,
}: {
  readonly section: ConsoleSectionRecord;
  readonly workspace: WorkspaceStoreBinding;
  readonly navigation: PaySwapNavigation;
}) {
  const { activity } = workspace;
  return (
    <SectionScaffold section={section}>
      <section aria-labelledby="ps-console-activity-events" className="ps-console-block">
        <h2 id="ps-console-activity-events" className="ps-console-block-title">
          Mission activity
        </h2>
        <p className="ps-console-block-note">
          The real mission events of this store, newest first — the
          append-only record, never rewritten and never fabricated.
        </p>
        {activity.phase === "loading" || activity.phase === "idle" ? (
          <LoadingBlock />
        ) : activity.phase === "error" && activity.error !== undefined ? (
          <ErrorBlock error={activity.error} onRetry={() => void workspace.reload()} />
        ) : activity.events.length === 0 ? (
          <ConsoleEmptyStateView
            spec={ACTIVITY_EMPTY_STATE}
            navigation={navigation}
            title="No activity yet — the honest state"
          />
        ) : (
          <ActivityTimeline
            entries={activity.events.map((event) => ({
              id: event.id,
              description: event.summary,
              timestamp: event.at,
            }))}
          />
        )}
      </section>

      <ReferenceCard
        id={REFERENCE_SECTION_ANCHORS.activity}
        title="The outcome-state reference"
        note="Reference only — how outcomes are read when execution exists. These are reference states, never live activity: nothing here claims an executed effect."
      >
        <ul className="ps-console-outcome-list">
          {ACTIVITY_OUTCOME_REFERENCE.map((entry) => (
            <li
              key={entry.term}
              className={
                entry.unknown === true
                  ? "ps-console-outcome-row ps-console-outcome-row--unknown"
                  : "ps-console-outcome-row"
              }
              // SV-3: UNKNOWN announces politely — role=status, never alert.
              role={entry.unknown === true ? "status" : undefined}
            >
              <div className="ps-console-outcome-head">
                <span className="ps-console-reference-term">{entry.term}</span>
                {entry.unknown === true ? (
                  <StatusPill tone="unknown">Outcome not yet known</StatusPill>
                ) : null}
              </div>
              <p className="ps-console-reference-line">{entry.line}</p>
            </li>
          ))}
        </ul>
        <Card className="ps-console-card">
          <p className="ps-console-line">
            No executed effects exist in this deployment — there is no
            execution plane, so no live outcome states can be shown here.
          </p>
        </Card>
        <Card className="ps-console-card">
          <div className="ps-console-reference-head">
            <h3 className="ps-console-card-title">Development artifacts</h3>
            <StatusPill tone="disabled">Advanced workspace</StatusPill>
          </div>
          <p className="ps-console-card-note">
            Files, session artifacts and workflow outputs from development
            work live in the advanced developer workspace of the PaySwap
            Agent Console — they are not duplicated into this mission
            activity ledger. This section records mission events only,
            from the real store.
          </p>
        </Card>
      </ReferenceCard>
    </SectionScaffold>
  );
}
