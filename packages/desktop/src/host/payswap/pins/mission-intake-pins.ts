/**
 * PaySwap Desktop (P10-B) — structural pins of the console workspace
 * mission-intake contracts (spec/surface/CONSOLE-WORKSPACE.md §3/§5,
 * mirrored from the TL-registered cross-lane seam stub at commit
 * 645a56c2fe8b6580370da4d14ff435f1414a3c82 —
 * packages/payswap-app/src/console/PaySwapAgentWorkspace.tsx; the
 * canonical contract home is @payswap/surface console contracts, lane
 * P10-A). Pins surface.console-mission-intake +
 * surface.console-workspace-store.
 *
 * PIN LAW (pin-registry.ts): shapes and closed vocabularies mirror the
 * accepted contract EXACTLY — field-for-field, same literals, same
 * unions — including the §4 typed-prerequisite ladder strings carried
 * VERBATIM as pinned constants. The desktop re-derives nothing and
 * invents nothing; guards are structural only; the mirrored packages own
 * the semantics. The store built on these pins holds DEMAND-SIDE INTENT
 * ONLY — never financial truth, never authorization, never capability
 * state (AGENTS.md financial boundary; INV-1/INV-23).
 */

import type { DesktopPinProvenance } from "./pin-registry.js";
import {
  DESKTOP_PIN_PROVENANCE,
  PAYSWAP_CONSOLE_WORKSPACE_PIN_SOURCE_COMMIT,
} from "./pin-registry.js";
import type { PinnedAmountSpec } from "./surface-pins.js";

// ---------------------------------------------------------------------------
// Mirrored-source provenance (the console workspace contract family)
// ---------------------------------------------------------------------------

/** The mission-intake pin stamp (provenance carried by the store views). */
export interface ConsoleWorkspacePinStamp {
  readonly pinSetVersion: DesktopPinProvenance["pinSetVersion"];
  readonly consoleContractCommit: typeof PAYSWAP_CONSOLE_WORKSPACE_PIN_SOURCE_COMMIT;
  readonly workOrder: "P10-B";
}

/** The stamp every console-workspace desktop view carries. */
export const CONSOLE_WORKSPACE_PIN_STAMP: ConsoleWorkspacePinStamp = Object.freeze({
  pinSetVersion: DESKTOP_PIN_PROVENANCE.pinSetVersion,
  consoleContractCommit: PAYSWAP_CONSOLE_WORKSPACE_PIN_SOURCE_COMMIT,
  workOrder: "P10-B",
});

// ---------------------------------------------------------------------------
// Mission vocabulary (CONSOLE-WORKSPACE.md §3 — pinned)
// ---------------------------------------------------------------------------

/** Mirrors MissionIntentDirection. */
export const PINNED_MISSION_INTENT_DIRECTIONS = ["PAY", "RECEIVE", "MOVE", "CONVERT"] as const;
export type PinnedMissionIntentDirection = (typeof PINNED_MISSION_INTENT_DIRECTIONS)[number];

/** Mirrors MissionIntakeInput (AmountSpec is the pinned surface wire form). */
export interface PinnedMissionIntakeInput {
  /** Non-empty after trim, at most 2000 characters. */
  readonly goalStatement: string;
  readonly direction: PinnedMissionIntentDirection;
  /** Optional until known; when present it must satisfy the AmountSpec law. */
  readonly amount?: PinnedAmountSpec;
  /** Optional free-text location hints, at most 200 characters each. */
  readonly fundingLocationHint?: string;
  readonly payoutLocationHint?: string;
  /** Optional note, at most 2000 characters. */
  readonly note?: string;
}

/** Mirrors the §3 intake field bounds (trimmed-length law). */
export const PINNED_MISSION_INTAKE_BOUNDS = Object.freeze({
  goalStatementMaxLength: 2000,
  locationHintMaxLength: 200,
  noteMaxLength: 2000,
} as const);

/** Mirrors MissionDraftStatus. */
export const PINNED_MISSION_DRAFT_STATUSES = ["DRAFT", "INTENT_RECORDED", "ARCHIVED"] as const;
export type PinnedMissionDraftStatus = (typeof PINNED_MISSION_DRAFT_STATUSES)[number];

/** Mirrors MissionLifecycleRung (the §4 authority chain, in order). */
export const PINNED_MISSION_LIFECYCLE_RUNGS = [
  "INTENT",
  "ELIGIBILITY",
  "PLANNING",
  "APPROVAL",
  "EXECUTION",
  "OBSERVATION",
  "EVIDENCE",
] as const;
export type PinnedMissionLifecycleRung = (typeof PINNED_MISSION_LIFECYCLE_RUNGS)[number];

/** Mirrors MissionRungState. */
export type PinnedMissionRungState =
  | { readonly rung: "INTENT"; readonly state: "REACHED" }
  | {
      readonly rung: PinnedMissionLifecycleRung;
      readonly state: "NOT_REACHED_PREREQUISITE";
      /** The typed prerequisite, carried verbatim from §4. */
      readonly prerequisite: string;
    };

/** Mirrors MissionEventKind. */
export const PINNED_MISSION_EVENT_KINDS = ["CREATED", "REVISED", "INTENT_VALIDATED", "ARCHIVED"] as const;
export type PinnedMissionEventKind = (typeof PINNED_MISSION_EVENT_KINDS)[number];

/** Mirrors MissionEvent. */
export interface PinnedMissionEvent {
  /** Stable within the store; assigned by the store adapter. */
  readonly id: string;
  /** ISO-8601 UTC instant, explicit input — never an ambient clock. */
  readonly at: string;
  readonly kind: PinnedMissionEventKind;
  readonly summary: string;
}

/** Mirrors MissionStructuralValidation. */
export interface PinnedMissionStructuralValidation {
  readonly ok: boolean;
  /** Empty iff ok; human-readable findings otherwise. */
  readonly findings: readonly string[];
}

/** Mirrors MissionRecord. */
export interface PinnedMissionRecord {
  /** Stable, store-assigned, never reused, non-empty. */
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: PinnedMissionDraftStatus;
  readonly intake: PinnedMissionIntakeInput;
  readonly structuralValidation: PinnedMissionStructuralValidation;
  /** Reverse-chronological (newest first), never rewritten. */
  readonly events: readonly PinnedMissionEvent[];
}

/** Mirrors MissionSummary. */
export interface PinnedMissionSummary {
  readonly id: string;
  readonly goalStatement: string;
  readonly direction: PinnedMissionIntentDirection;
  readonly amount?: PinnedAmountSpec;
  readonly status: PinnedMissionDraftStatus;
  readonly updatedAt: string;
}

/** Mirrors MissionDetail. */
export interface PinnedMissionDetail {
  readonly summary: PinnedMissionSummary;
  readonly record: PinnedMissionRecord;
  /** The §4 ladder fold result for this record. */
  readonly ladder: readonly PinnedMissionRungState[];
  /** Honest evidence line — verbatim from §4 EVIDENCE when unreached. */
  readonly evidenceNote: string;
}

// ---------------------------------------------------------------------------
// Lifecycle ladder law (§4 typed prerequisites — VERBATIM pinned constants)
// ---------------------------------------------------------------------------

/** Mirrors the §4 INTENT prerequisite (when not reached), verbatim. */
export const PINNED_LADDER_INTENT_PREREQUISITE =
  "The intent has not been recorded yet — complete the intake review to record it." as const;

/** Mirrors the §4 ELIGIBILITY prerequisite, verbatim. */
export const PINNED_LADDER_ELIGIBILITY_PREREQUISITE =
  "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility." as const;

/** Mirrors the §4 PLANNING prerequisite, verbatim. */
export const PINNED_LADDER_PLANNING_PREREQUISITE =
  "No planning plane is configured. Candidate plans are compiled by the economic execution graph when a planning plane exists; this deployment has none — the honest state is planning unavailable, never an invented plan." as const;

/** Mirrors the §4 APPROVAL prerequisite, verbatim. */
export const PINNED_LADDER_APPROVAL_PREREQUISITE =
  "No approval plane is configured. Consequential actions require PaySwap authorization — material terms and authority scope — before execution; with no trust plane configured there is nothing to approve and nothing approved." as const;

/** Mirrors the §4 EXECUTION prerequisite, verbatim. */
export const PINNED_LADDER_EXECUTION_PREREQUISITE =
  "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment." as const;

/** Mirrors the §4 OBSERVATION prerequisite, verbatim. */
export const PINNED_LADDER_OBSERVATION_PREREQUISITE =
  "No observations exist. Observations are provider-verified facts recorded by the execution plane; with no execution there is nothing to observe, and UNKNOWN is never rendered as success or failure." as const;

/** Mirrors the §4 EVIDENCE prerequisite (the evidenceNote), verbatim. */
export const PINNED_LADDER_EVIDENCE_PREREQUISITE =
  "No evidence records exist. Evidence is produced by reconciliation of executed effects; no effect has been executed." as const;

/** Every §4 prerequisite, keyed by rung (closed; order follows the ladder). */
export const PINNED_LADDER_PREREQUISITES: Readonly<
  Record<PinnedMissionLifecycleRung, string>
> = Object.freeze({
  INTENT: PINNED_LADDER_INTENT_PREREQUISITE,
  ELIGIBILITY: PINNED_LADDER_ELIGIBILITY_PREREQUISITE,
  PLANNING: PINNED_LADDER_PLANNING_PREREQUISITE,
  APPROVAL: PINNED_LADDER_APPROVAL_PREREQUISITE,
  EXECUTION: PINNED_LADDER_EXECUTION_PREREQUISITE,
  OBSERVATION: PINNED_LADDER_OBSERVATION_PREREQUISITE,
  EVIDENCE: PINNED_LADDER_EVIDENCE_PREREQUISITE,
});

// ---------------------------------------------------------------------------
// Workspace store port (CONSOLE-WORKSPACE.md §5 — pinned)
// ---------------------------------------------------------------------------

/** Mirrors WorkspaceStoreDurability. */
export const PINNED_WORKSPACE_STORE_DURABILITY = ["DESKTOP_PROFILE", "BROWSER_PROFILE"] as const;
export type PinnedWorkspaceStoreDurability = (typeof PINNED_WORKSPACE_STORE_DURABILITY)[number];

/**
 * Mirrors the WorkspaceStorePort METHOD NAMES (the §5 mutation surface —
 * the only place mission records change; closed, drift-checked).
 */
export const PINNED_WORKSPACE_STORE_PORT_METHODS = [
  "listMissions",
  "recordMissionDraft",
  "recordMissionIntent",
  "missionDetail",
  "reviseMissionDraft",
  "archiveMissionDraft",
] as const;
export type PinnedWorkspaceStorePortMethod = (typeof PINNED_WORKSPACE_STORE_PORT_METHODS)[number];

// ---------------------------------------------------------------------------
// Guards (closed vocabularies, fail-closed)
// ---------------------------------------------------------------------------

/** Guard: a value is one of the pinned mission intent directions. */
export function isPinnedMissionIntentDirection(
  value: unknown,
): value is PinnedMissionIntentDirection {
  return (
    typeof value === "string" &&
    (PINNED_MISSION_INTENT_DIRECTIONS as readonly unknown[]).includes(value)
  );
}

/** Guard: a value is one of the pinned mission draft statuses. */
export function isPinnedMissionDraftStatus(value: unknown): value is PinnedMissionDraftStatus {
  return (
    typeof value === "string" &&
    (PINNED_MISSION_DRAFT_STATUSES as readonly unknown[]).includes(value)
  );
}

/** Guard: a value is one of the pinned mission event kinds. */
export function isPinnedMissionEventKind(value: unknown): value is PinnedMissionEventKind {
  return (
    typeof value === "string" &&
    (PINNED_MISSION_EVENT_KINDS as readonly unknown[]).includes(value)
  );
}

/** Guard: a value is one of the pinned lifecycle rungs. */
export function isPinnedMissionLifecycleRung(value: unknown): value is PinnedMissionLifecycleRung {
  return (
    typeof value === "string" &&
    (PINNED_MISSION_LIFECYCLE_RUNGS as readonly unknown[]).includes(value)
  );
}
