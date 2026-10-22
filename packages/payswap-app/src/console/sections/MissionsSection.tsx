/**
 * @payswap/app — the MISSIONS workspace section (console surface).
 *
 * §6 missions fold: the real mission list (summaries) + the creation
 * intake (MissionIntakeForm) + the intent-review step (record draft →
 * review the validated draft → record intent) + the mission detail
 * (MissionDetailView: ladder, timeline, evidence, controls). Loading is
 * a skeleton, failure is the typed error, and the empty list points at
 * the intake that is on the page — no fabricated rows anywhere.
 */

import { useEffect, useState } from "react";
import { Card, KeyValue, StatusPill } from "@zcode/ui/payswap";
import type {
  ConsoleSectionRecord,
  MissionIntakeInput,
  MissionRecord,
} from "../contracts.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import { MISSIONS_EMPTY_STATE } from "../section-vocabulary.js";
import type { WorkspaceStoreBinding } from "../useWorkspaceStore.js";
import {
  ConsoleEmptyStateView,
  ErrorBlock,
  LoadingBlock,
  SectionScaffold,
} from "./shared.js";
import { MissionIntakeForm, type MissionIntakePrefill } from "./MissionIntakeForm.js";
import { MissionDetailView } from "./MissionDetailView.js";

/**
 * An intake request handed from the overview home (P11): the prefill +
 * a monotonically increasing seq. The seq keys the intake form's remount
 * so each new request is consumed as INITIAL state exactly once (two
 * clicks on "New mission" re-prefill — never a stale no-op).
 */
export interface MissionsIntakeRequest {
  readonly seq: number;
  readonly prefill: MissionIntakePrefill;
}

function ListStatusPill({ status }: { readonly status: MissionRecord["status"] }) {
  if (status === "INTENT_RECORDED") {
    return <StatusPill tone="ok">Intent recorded</StatusPill>;
  }
  if (status === "ARCHIVED") {
    return <StatusPill tone="disabled">Archived</StatusPill>;
  }
  return <StatusPill tone="attention">Draft</StatusPill>;
}

/** The intent-review step (§6: record draft → review → record intent). */
function ReviewStep({
  record,
  pending,
  onRecordIntent,
  onKeepAsDraft,
}: {
  readonly record: MissionRecord;
  readonly pending: boolean;
  readonly onRecordIntent: () => void;
  readonly onKeepAsDraft: () => void;
}) {
  const intake = record.intake;
  return (
    <Card className="ps-console-review" id="missions-review">
      <div className="ps-console-reference-head">
        <h2 className="ps-console-card-title">Review the recorded draft</h2>
        <StatusPill tone="attention">Draft — intent not recorded</StatusPill>
      </div>
      <p className="ps-console-card-note">
        The draft passed structural validation ({record.structuralValidation.ok ? "no findings" : "findings rendered in the record"}
        ). Recording the intent marks the INTENT rung of the lifecycle ladder
        reached — the demand-side intent becomes the recorded mission intent.
        Nothing downstream is reachable; the ladder states each typed
        prerequisite.
      </p>
      <KeyValue
        entries={[
          { key: "Mission id", value: record.id, mono: true },
          { key: "Goal statement", value: intake.goalStatement },
          { key: "Direction", value: intake.direction },
          {
            key: "Amount",
            value:
              intake.amount !== undefined
                ? `${intake.amount.minorUnits} ${intake.amount.currency} (minor units)`
                : "—",
          },
          { key: "Funding location hint", value: intake.fundingLocationHint ?? "—" },
          { key: "Payout location hint", value: intake.payoutLocationHint ?? "—" },
          { key: "Note", value: intake.note ?? "—" },
          { key: "Recorded at", value: record.createdAt },
        ]}
      />
      <div className="ps-console-intake-actions">
        <button
          type="button"
          className="ps-console-action ps-console-action--primary"
          onClick={onRecordIntent}
          disabled={pending}
        >
          Record intent
        </button>
        <button
          type="button"
          className="ps-console-link"
          onClick={onKeepAsDraft}
          disabled={pending}
        >
          Keep as draft
        </button>
      </div>
    </Card>
  );
}

export function MissionsSection({
  section,
  workspace,
  navigation,
  intakeRequest,
}: {
  readonly section: ConsoleSectionRecord;
  readonly workspace: WorkspaceStoreBinding;
  readonly navigation: PaySwapNavigation;
  /** The pending overview-originated intake prefill, if any (P11). */
  readonly intakeRequest?: MissionsIntakeRequest;
}) {
  const { list, detail, mutation } = workspace;
  const [reviewRecord, setReviewRecord] = useState<MissionRecord | null>(null);
  const [reviseTarget, setReviseTarget] = useState<{
    readonly id: string;
    readonly intake: MissionIntakeInput;
  } | null>(null);
  const [archiveArmed, setArchiveArmed] = useState(false);

  const pending = mutation.phase === "pending";

  const handleCreate = (input: MissionIntakeInput): void => {
    void workspace.createDraft(input).then((result) => {
      if (result.ok) {
        setReviewRecord(result.record);
      }
    });
  };

  const handleRecordIntent = (): void => {
    if (reviewRecord === null) {
      return;
    }
    const id = reviewRecord.id;
    void workspace.recordIntent(id).then((result) => {
      if (result.ok) {
        setReviewRecord(null);
        workspace.openDetail(id);
      }
    });
  };

  const handleRevise = (input: MissionIntakeInput): void => {
    if (reviseTarget === null) {
      return;
    }
    const id = reviseTarget.id;
    void workspace.reviseDraft(id, input).then((result) => {
      if (result.ok) {
        setReviseTarget(null);
        // Re-open the (now updated) record — the revision is visible,
        // never silently absorbed.
        workspace.openDetail(id);
      }
    });
  };

  const handleArchive = (): void => {
    if (detail.phase !== "ready" || detail.detail === undefined) {
      return;
    }
    const id = detail.detail.record.id;
    void workspace.archiveDraft(id).then(() => {
      setArchiveArmed(false);
    });
  };

  const detailOpen = detail.phase !== "idle";

  // A prefill arriving from the overview home scrolls the intake into
  // view (the list may be long; the prefill must be visible — §8's
  // zero-dead-actions law). Presentation-only: no state mutation here.
  useEffect(() => {
    if (intakeRequest === undefined || typeof document === "undefined") {
      return;
    }
    document
      .getElementById("missions-intake")
      ?.scrollIntoView?.({ block: "start" });
  }, [intakeRequest?.seq]);

  return (
    <SectionScaffold section={section}>
      {detailOpen ? (
        detail.phase === "loading" ? (
          <LoadingBlock />
        ) : detail.phase === "error" && detail.error !== undefined ? (
          <ErrorBlock error={detail.error} onRetry={() => void workspace.reload()} />
        ) : detail.phase === "missing" ? (
          <Card className="ps-console-card">
            <p className="ps-console-line">
              This mission is not in the store — it may have been removed
              outside this workspace. Nothing is invented in its place.
            </p>
          </Card>
        ) : detail.detail !== undefined ? (
          <MissionDetailView
            detail={detail.detail}
            pending={pending}
            error={mutation.phase === "error" ? mutation.error : undefined}
            onBack={workspace.closeDetail}
            onRevise={() => {
              if (detail.detail !== undefined) {
                // The revise form renders in the intake area: close the
                // detail so the action WORKS (a dead "Revise intake"
                // would violate §8's zero-dead-actions law).
                setReviseTarget({
                  id: detail.detail.record.id,
                  intake: detail.detail.record.intake,
                });
                workspace.closeDetail();
              }
            }}
            onArchive={handleArchive}
            archiveArmed={archiveArmed}
            onArchiveArmedChange={setArchiveArmed}
          />
        ) : null
      ) : (
        <>
          <section aria-labelledby="ps-console-missions-list" className="ps-console-block">
            <h2 id="ps-console-missions-list" className="ps-console-block-title">
              Missions
            </h2>
            {list.phase === "loading" ? (
              <LoadingBlock />
            ) : list.phase === "error" && list.error !== undefined ? (
              <ErrorBlock error={list.error} onRetry={() => void workspace.reload()} />
            ) : list.summaries.length === 0 ? (
              <ConsoleEmptyStateView
                spec={MISSIONS_EMPTY_STATE}
                navigation={navigation}
                title="No missions recorded — the honest state"
              />
            ) : (
              <div className="ps-console-tablewrap">
                <table className="ps-table">
                  <thead>
                    <tr>
                      <th scope="col" className="ps-table__th">Mission</th>
                      <th scope="col" className="ps-table__th">Direction</th>
                      <th scope="col" className="ps-table__th">Status</th>
                      <th scope="col" className="ps-table__th">Updated</th>
                      <th scope="col" className="ps-table__th">
                        <span className="ps-sr-only">Row actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.summaries.map((mission) => (
                      <tr key={mission.id} className="ps-table__row">
                        <td className="ps-table__cell">
                          <span className="ps-console-mission-goal">{mission.goalStatement}</span>
                        </td>
                        <td className="ps-table__cell ps-num">{mission.direction}</td>
                        <td className="ps-table__cell">
                          <ListStatusPill status={mission.status} />
                        </td>
                        <td className="ps-table__cell ps-num">{mission.updatedAt}</td>
                        <td className="ps-table__cell ps-table__cell--menu">
                          <button
                            type="button"
                            className="ps-console-link"
                            onClick={() => workspace.openDetail(mission.id)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="missions-intake-heading" className="ps-console-block" id="missions-intake">
            {reviseTarget !== null ? (
              <MissionIntakeForm
                mode="revise"
                initial={reviseTarget.intake}
                pending={pending}
                error={mutation.phase === "error" ? mutation.error : undefined}
                onSubmit={handleRevise}
                onCancel={() => setReviseTarget(null)}
              />
            ) : reviewRecord !== null ? (
              <ReviewStep
                record={reviewRecord}
                pending={pending}
                onRecordIntent={handleRecordIntent}
                onKeepAsDraft={() => setReviewRecord(null)}
              />
            ) : (
              <MissionIntakeForm
                key={intakeRequest === undefined ? "intake" : `intake-${intakeRequest.seq}`}
                mode="create"
                prefill={intakeRequest?.prefill}
                pending={pending}
                error={mutation.phase === "error" ? mutation.error : undefined}
                onSubmit={handleCreate}
              />
            )}
          </section>
        </>
      )}
    </SectionScaffold>
  );
}
