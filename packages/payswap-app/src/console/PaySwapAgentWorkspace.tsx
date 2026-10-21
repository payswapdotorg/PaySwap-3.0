/**
 * @payswap/app — the PaySwap Agent Workspace (console surface).
 *
 * TL SEAM STUB (registered with Phase 10, commit-level contract:
 * spec/surface/CONSOLE-WORKSPACE.md). Lane P10-C replaces this
 * implementation with the real workspace views; the EXPORTED NAMES on
 * this module path are the cross-lane seam the desktop renderer mount
 * and the web console mount (Lane P10-B) compile against. The shapes
 * are PINNED byte-exact to CONSOLE-WORKSPACE.md §3/§5 — drift is a
 * defect.
 *
 * Until P10-C lands, this stub renders an honest integration-holding
 * state — never a fabricated workspace.
 */

import type { PaySwapNavigation } from "../shell/navigation.js";
import type { AmountSpecPin } from "../pins/surface-pins.js";

/** The pinned money wire shape (surface AmountSpec, mirrored). */
export type MissionAmountSpec = AmountSpecPin;

/* ====================================================================
 * Mission vocabulary (CONSOLE-WORKSPACE.md §3 — pinned)
 * ==================================================================== */

export type MissionIntentDirection = "PAY" | "RECEIVE" | "MOVE" | "CONVERT";

export interface MissionIntakeInput {
  /** Non-empty after trim, at most 2000 characters. */
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  /** Optional until known; when present it must satisfy the AmountSpec law. */
  readonly amount?: MissionAmountSpec;
  /** Optional free-text location hints, at most 200 characters each. */
  readonly fundingLocationHint?: string;
  readonly payoutLocationHint?: string;
  /** Optional note, at most 2000 characters. */
  readonly note?: string;
}

export type MissionDraftStatus = "DRAFT" | "INTENT_RECORDED" | "ARCHIVED";

export type MissionLifecycleRung =
  | "INTENT"
  | "ELIGIBILITY"
  | "PLANNING"
  | "APPROVAL"
  | "EXECUTION"
  | "OBSERVATION"
  | "EVIDENCE";

export type MissionRungState =
  | { readonly rung: "INTENT"; readonly state: "REACHED" }
  | {
      readonly rung: MissionLifecycleRung;
      readonly state: "NOT_REACHED_PREREQUISITE";
      /** The typed prerequisite, carried verbatim from §4. */
      readonly prerequisite: string;
    };

export type MissionEventKind =
  | "CREATED"
  | "REVISED"
  | "INTENT_VALIDATED"
  | "ARCHIVED";

export interface MissionEvent {
  readonly id: string;
  /** ISO-8601 UTC instant, explicit input — never an ambient clock. */
  readonly at: string;
  readonly kind: MissionEventKind;
  readonly summary: string;
}

export interface MissionStructuralValidation {
  readonly ok: boolean;
  readonly findings: readonly string[];
}

export interface MissionRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: MissionDraftStatus;
  readonly intake: MissionIntakeInput;
  readonly structuralValidation: MissionStructuralValidation;
  /** Reverse-chronological (newest first), never rewritten. */
  readonly events: readonly MissionEvent[];
}

export interface MissionSummary {
  readonly id: string;
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  readonly amount?: MissionAmountSpec;
  readonly status: MissionDraftStatus;
  readonly updatedAt: string;
}

export interface MissionDetail {
  readonly summary: MissionSummary;
  readonly record: MissionRecord;
  readonly ladder: readonly MissionRungState[];
  readonly evidenceNote: string;
}

/* ====================================================================
 * Workspace store port (CONSOLE-WORKSPACE.md §5 — pinned)
 * ==================================================================== */

export type WorkspaceStoreDurability = "DESKTOP_PROFILE" | "BROWSER_PROFILE";

export interface WorkspaceStorePort {
  readonly durability: WorkspaceStoreDurability;
  listMissions(): Promise<readonly MissionSummary[]>;
  recordMissionDraft(
    input: MissionIntakeInput,
    now: string,
  ): Promise<MissionRecord>;
  /** The intent-review step: DRAFT → INTENT_RECORDED. */
  recordMissionIntent(id: string, now: string): Promise<MissionRecord>;
  missionDetail(id: string): Promise<MissionDetail | null>;
  reviseMissionDraft(
    id: string,
    input: MissionIntakeInput,
    now: string,
  ): Promise<MissionRecord>;
  archiveMissionDraft(id: string, now: string): Promise<MissionRecord>;
}

/* ====================================================================
 * The workspace component seam (P10-C implements; P10-B mounts)
 * ==================================================================== */

/** Optional honest projection of real substrate model-provider state. */
export interface ModelProviderStatus {
  readonly id: string;
  readonly label: string;
  readonly connected: boolean;
}

export interface PaySwapAgentWorkspaceProps {
  /**
   * The console navigation adapter. Path space: "/console" (root →
   * overview) and "/console/<section>" for the eight section ids.
   */
  readonly navigation: PaySwapNavigation;
  /** The workspace store port (DESKTOP_PROFILE or BROWSER_PROFILE). */
  readonly store: WorkspaceStorePort;
  /** The supporting-control back to the PaySwap product surface. */
  readonly backToProduct: {
    readonly label: string;
    readonly onActivate: () => void;
  };
  /** Optional real model-provider connection state; absent = honest none. */
  readonly modelProviders?: readonly ModelProviderStatus[];
}

/**
 * The seam stub implementation. P10-C replaces this with the real
 * PaySwap Agent Workspace (eight sections per CONSOLE-WORKSPACE.md §2);
 * the exported name and props are the stable cross-lane contract.
 */
export function PaySwapAgentWorkspace(_props: PaySwapAgentWorkspaceProps) {
  return (
    <section aria-labelledby="ps-agent-workspace-title" className="ps-console">
      <h1 id="ps-agent-workspace-title">PaySwap — Agent Console</h1>
      <p role="status">
        The Agent Workspace view is being integrated in this build. It never
        fabricates missions, agents, approvals, connections or activity —
        the integrated workspace renders real state and honest empty states
        only.
      </p>
    </section>
  );
}
