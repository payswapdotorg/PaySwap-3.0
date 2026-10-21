/**
 * @payswap/app — the mission creation/revision INTAKE FORM (missions
 * section, console surface).
 *
 * §6 missions: goal statement, direction, optional amount (currency +
 * minor units), optional location hints, optional note — with the
 * STRUCTURAL VALIDATION FINDINGS rendered verbatim before anything is
 * recorded: the submit validates first (fail-closed, §3 law) and only a
 * clean intake reaches the store. The form records what was entered —
 * no silent trimming or coercion; the validator judges trimmed values.
 */

import { useState } from "react";
import { Button, Field, Input, Select, useId } from "@zcode/ui/payswap";
import type { MissionIntakeInput, MissionIntentDirection } from "../contracts.js";
import {
  MISSION_INTENT_DIRECTIONS,
  validateMissionIntake,
} from "../mission-validation.js";
import type { WorkspaceStoreError } from "../useWorkspaceStore.js";
import { ErrorBlock } from "./shared.js";

/** The raw form fields (strings; optionals empty = absent). */
interface IntakeFields {
  goalStatement: string;
  direction: string;
  amountCurrency: string;
  amountMinorUnits: string;
  fundingLocationHint: string;
  payoutLocationHint: string;
  note: string;
}

function emptyFields(): IntakeFields {
  return {
    goalStatement: "",
    direction: "",
    amountCurrency: "",
    amountMinorUnits: "",
    fundingLocationHint: "",
    payoutLocationHint: "",
    note: "",
  };
}

function fieldsFromIntake(intake: MissionIntakeInput): IntakeFields {
  return {
    goalStatement: intake.goalStatement,
    direction: intake.direction,
    amountCurrency: intake.amount?.currency ?? "",
    amountMinorUnits: intake.amount?.minorUnits ?? "",
    fundingLocationHint: intake.fundingLocationHint ?? "",
    payoutLocationHint: intake.payoutLocationHint ?? "",
    note: intake.note ?? "",
  };
}

/** Assemble the wire input: optional fields are absent when empty. */
function toIntakeInput(fields: IntakeFields): MissionIntakeInput {
  const currency = fields.amountCurrency.trim();
  const minorUnits = fields.amountMinorUnits.trim();
  return {
    goalStatement: fields.goalStatement,
    direction: fields.direction as MissionIntentDirection,
    ...(currency !== "" || minorUnits !== ""
      ? { amount: { currency, minorUnits } }
      : {}),
    ...(fields.fundingLocationHint !== "" ? { fundingLocationHint: fields.fundingLocationHint } : {}),
    ...(fields.payoutLocationHint !== "" ? { payoutLocationHint: fields.payoutLocationHint } : {}),
    ...(fields.note !== "" ? { note: fields.note } : {}),
  };
}

export interface MissionIntakeFormProps {
  readonly mode: "create" | "revise";
  /** Pre-fill (revise mode: the record's current intake). */
  readonly initial?: MissionIntakeInput;
  /** The store mutation pending state (the submit button shows it). */
  readonly pending: boolean;
  /** The honest typed store error, if the last mutation failed. */
  readonly error?: WorkspaceStoreError;
  readonly onSubmit: (input: MissionIntakeInput) => void;
  readonly onCancel?: () => void;
}

export function MissionIntakeForm({
  mode,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: MissionIntakeFormProps) {
  const [fields, setFields] = useState<IntakeFields>(() =>
    initial === undefined ? emptyFields() : fieldsFromIntake(initial),
  );
  const [findings, setFindings] = useState<readonly string[]>([]);
  const goalId = useId("ps-console-goal");
  const noteId = useId("ps-console-note");

  const update = (patch: Partial<IntakeFields>): void => {
    setFields((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input = toIntakeInput(fields);
    const validation = validateMissionIntake(input);
    setFindings(validation.findings);
    if (validation.ok) {
      onSubmit(input);
    }
  };

  const isRevise = mode === "revise";
  return (
    <form
      className="ps-console-intake"
      aria-labelledby="missions-intake-heading"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="ps-console-intake-head">
        <h2 id="missions-intake-heading" className="ps-console-card-title">
          {isRevise ? "Revise the mission intake" : "Create a mission"}
        </h2>
        <p className="ps-console-card-note">
          The intake records demand-side intent only — it is not financial
          truth, not authorization and not capability state. Structural
          validation findings render verbatim before anything is recorded.
        </p>
      </div>

      {findings.length > 0 ? (
        <div className="ps-console-findings" role="alert">
          <p className="ps-console-findings-title">
            Structural validation findings ({findings.length})
          </p>
          <ul className="ps-console-findings-list">
            {findings.map((finding) => (
              <li key={finding} className="ps-console-finding">
                {finding}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field
        id={goalId}
        label="Goal statement"
        required
        hint="What you want to accomplish — non-empty after trimming, at most 2000 characters."
      >
        <textarea
          id={goalId}
          className="ps-input ps-console-textarea"
          rows={3}
          value={fields.goalStatement}
          aria-describedby={`${goalId}-hint`}
          onChange={(event) => update({ goalStatement: event.target.value })}
        />
      </Field>

      <Field label="Direction" required hint="PAY, RECEIVE, MOVE or CONVERT.">
        <Select
          value={fields.direction}
          onChange={(event) => update({ direction: event.target.value })}
        >
          <option value="">Select a direction…</option>
          {MISSION_INTENT_DIRECTIONS.map((direction) => (
            <option key={direction} value={direction}>
              {direction}
            </option>
          ))}
        </Select>
      </Field>

      <div className="ps-console-intake-grid">
        <Field
          label="Amount currency"
          hint="Optional until known — three-letter code, e.g. USD."
        >
          <Input
            value={fields.amountCurrency}
            onChange={(event) =>
              update({ amountCurrency: event.target.value.toUpperCase() })
            }
            autoComplete="off"
          />
        </Field>
        <Field
          label="Amount minor units"
          hint="Optional — canonical non-negative integer, e.g. 1234."
        >
          <Input
            value={fields.amountMinorUnits}
            inputMode="numeric"
            onChange={(event) => update({ amountMinorUnits: event.target.value })}
            autoComplete="off"
          />
        </Field>
      </div>

      <div className="ps-console-intake-grid">
        <Field label="Funding location hint" hint="Optional — at most 200 characters.">
          <Input
            value={fields.fundingLocationHint}
            onChange={(event) => update({ fundingLocationHint: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field label="Payout location hint" hint="Optional — at most 200 characters.">
          <Input
            value={fields.payoutLocationHint}
            onChange={(event) => update({ payoutLocationHint: event.target.value })}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field
        id={noteId}
        label="Note"
        hint="Optional context — at most 2000 characters."
      >
        <textarea
          id={noteId}
          className="ps-input ps-console-textarea"
          rows={2}
          value={fields.note}
          aria-describedby={`${noteId}-hint`}
          onChange={(event) => update({ note: event.target.value })}
        />
      </Field>

      {error !== undefined ? <ErrorBlock error={error} /> : null}

      <div className="ps-console-intake-actions">
        <Button type="submit" variant="primary" loading={pending}>
          {isRevise ? "Validate and record revision" : "Validate and record draft"}
        </Button>
        {onCancel !== undefined ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
