/**
 * @payswap/app — the MISSION DETAIL view (missions section, console
 * surface).
 *
 * §6: summary + the full record + the lifecycle ladder (§4: INTENT
 * reached or its verbatim typed prerequisite; downstream rungs verbatim)
 * + the real event timeline + the honest evidence note, with revise and
 * archive controls. Archived missions render VISIBLY archived (and their
 * controls retire — an archived record is done, never edited).
 *
 * The ladder is folded HERE from the record (foldMissionLadder — the §4
 * law applied at the view boundary): a store projection can never mark
 * a rung reached in this rendering.
 */

import { ActivityTimeline, Card, KeyValue, StatusPill } from "@zcode/ui/payswap";
import type { MissionDetail, MissionDraftStatus } from "../contracts.js";
import {
  foldMissionLadder,
  missionEvidenceNote,
} from "../mission-ladder.js";
import type { WorkspaceStoreError } from "../useWorkspaceStore.js";
import { ErrorBlock } from "./shared.js";

function StatusPillFor({ status }: { readonly status: MissionDraftStatus }) {
  if (status === "INTENT_RECORDED") {
    return <StatusPill tone="ok">Intent recorded</StatusPill>;
  }
  if (status === "ARCHIVED") {
    return <StatusPill tone="disabled">Archived</StatusPill>;
  }
  return <StatusPill tone="attention">Draft — intent not recorded</StatusPill>;
}

function intakeEntries(detail: MissionDetail) {
  const intake = detail.record.intake;
  return [
    { key: "Mission id", value: detail.record.id, mono: true },
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
    { key: "Created", value: detail.record.createdAt },
    { key: "Last updated", value: detail.record.updatedAt },
    {
      key: "Structural validation",
      value: detail.record.structuralValidation.ok
        ? "Passed — no findings"
        : `Findings: ${detail.record.structuralValidation.findings.join(" ")}`,
    },
  ];
}

export interface MissionDetailViewProps {
  readonly detail: MissionDetail;
  readonly pending: boolean;
  readonly error?: WorkspaceStoreError;
  readonly onBack: () => void;
  readonly onRevise: () => void;
  readonly onArchive: () => void;
  /** Two-step archive confirmation state (owned by the section). */
  readonly archiveArmed: boolean;
  readonly onArchiveArmedChange: (armed: boolean) => void;
}

export function MissionDetailView({
  detail,
  pending,
  error,
  onBack,
  onRevise,
  onArchive,
  archiveArmed,
  onArchiveArmedChange,
}: MissionDetailViewProps) {
  const record = detail.record;
  const ladder = foldMissionLadder(record);
  const evidenceNote = missionEvidenceNote(record);
  const archived = record.status === "ARCHIVED";

  return (
    <div className="ps-console-mission-detail">
      <p className="ps-console-backrow">
        <button type="button" className="ps-console-link" onClick={onBack}>
          All missions
        </button>
      </p>

      <header className="ps-console-mission-header">
        <div className="ps-console-mission-header-main">
          <h2 className="ps-console-mission-goal">{record.intake.goalStatement}</h2>
          <p className="ps-console-mission-meta ps-num">
            {record.intake.direction}
            {record.intake.amount !== undefined
              ? ` · ${record.intake.amount.minorUnits} ${record.intake.amount.currency}`
              : ""}{" "}
            · updated {record.updatedAt}
          </p>
        </div>
        <StatusPillFor status={record.status} />
      </header>

      {archived ? (
        <Card className="ps-console-archived-note">
          <p className="ps-console-line">
            This mission is archived. The reached rungs at archive time are
            preserved; the record stays readable and is no longer editable.
          </p>
        </Card>
      ) : null}

      <section aria-labelledby="ps-console-ladder-heading" className="ps-console-block">
        <h2 id="ps-console-ladder-heading" className="ps-console-block-title">
          Lifecycle ladder
        </h2>
        <p className="ps-console-block-note">
          The authority chain — Goal/Intent → Eligibility → Planning →
          Approval → Execution → Observation → Evidence. A rung is reached
          only by its plane; every unreached rung states its typed
          prerequisite verbatim.
        </p>
        <ol className="ps-console-ladder">
          {ladder.map((rung) => (
            <li
              key={rung.rung}
              className={
                rung.state === "REACHED"
                  ? "ps-console-ladder-item ps-console-ladder-item--reached"
                  : "ps-console-ladder-item"
              }
            >
              <div className="ps-console-ladder-head">
                <span className="ps-console-ladder-rung">{rung.rung}</span>
                {rung.state === "REACHED" ? (
                  <StatusPill tone="ok">Reached</StatusPill>
                ) : (
                  <StatusPill tone="disabled">Not reached — prerequisite</StatusPill>
                )}
              </div>
              {rung.state === "NOT_REACHED_PREREQUISITE" ? (
                <p className="ps-console-ladder-prerequisite">{rung.prerequisite}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ps-console-events-heading" className="ps-console-block">
        <h2 id="ps-console-events-heading" className="ps-console-block-title">
          Event timeline
        </h2>
        <p className="ps-console-block-note">
          The real, append-only mission record — newest first, never rewritten.
        </p>
        <ActivityTimeline
          entries={record.events.map((event) => ({
            id: event.id,
            description: event.summary,
            timestamp: event.at,
          }))}
          empty={<p className="ps-console-line">No events are recorded.</p>}
        />
      </section>

      <section aria-labelledby="ps-console-evidence-heading" className="ps-console-block">
        <h2 id="ps-console-evidence-heading" className="ps-console-block-title">
          Evidence
        </h2>
        <Card className="ps-console-card">
          <p className="ps-console-line">{evidenceNote}</p>
        </Card>
      </section>

      <section aria-labelledby="ps-console-record-heading" className="ps-console-block">
        <h2 id="ps-console-record-heading" className="ps-console-block-title">
          The full record
        </h2>
        <KeyValue entries={intakeEntries(detail)} />
      </section>

      {error !== undefined ? <ErrorBlock error={error} /> : null}

      {archived ? null : (
        <section aria-labelledby="ps-console-controls-heading" className="ps-console-block">
          <h2 id="ps-console-controls-heading" className="ps-console-block-title">
            Controls
          </h2>
          <div className="ps-console-controls">
            <button
              type="button"
              className="ps-console-action"
              onClick={onRevise}
              disabled={pending}
            >
              Revise intake
            </button>
            {archiveArmed ? (
              <span className="ps-console-archive-confirm">
                <span className="ps-console-line">
                  Archive this mission? The reached rungs are preserved and the
                  record becomes read-only.
                </span>
                <button
                  type="button"
                  className="ps-console-action ps-console-action--danger"
                  onClick={onArchive}
                  disabled={pending}
                >
                  Confirm archive
                </button>
                <button
                  type="button"
                  className="ps-console-link"
                  onClick={() => onArchiveArmedChange(false)}
                  disabled={pending}
                >
                  Keep the mission
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="ps-console-link"
                onClick={() => onArchiveArmedChange(true)}
                disabled={pending}
              >
                Archive…
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
