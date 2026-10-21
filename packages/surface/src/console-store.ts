/**
 * @payswap/surface — the workspace store port (P10-A, §5 byte-exact).
 *
 * NET-NEW module declaring the PINNED workspace store port and the
 * honest durability labels. The store is the ONLY mutation surface of
 * the console contracts, and it mutates DEMAND-SIDE INTENT RECORDS
 * ONLY — not financial truth, not authorization, not capability state
 * (§5; INV-1/INV-23).
 *
 * ADAPTER LAWS (§5 — implemented by P10-B desktop / P10-C web mount;
 * this module pins the port + labels the adapters must render):
 * - DESKTOP_PROFILE: the store lives in the desktop main-process host,
 *   persisted as JSON under the PaySwap user-data directory; it survives
 *   app restarts; ids are assigned by the host; the renderer reaches it
 *   through the existing `payswap-desktop` service channel.
 * - BROWSER_PROFILE: browser localStorage under a namespaced key, with
 *   the honest label below; ids assigned locally.
 * - Both: structural validation before recording (§3); a malformed
 *   persisted record is surfaced as a typed store finding and NEVER
 *   rendered as a mission; events are append-only; `now` is an explicit
 *   input; `recordMissionIntent` transitions DRAFT → INTENT_RECORDED
 *   exactly when structuralValidation.ok (emitting INTENT_VALIDATED)
 *   and fails closed with a typed error otherwise.
 */

import type {
  MissionDetail,
  MissionIntakeInput,
  MissionRecord,
  MissionSummary,
} from "./console-missions.ts";

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

/** The honest durability labels (§5 honest-labeling law; short, honest). */
export const WORKSPACE_STORE_DURABILITY_LABELS: Readonly<Record<WorkspaceStoreDurability, string>> =
  Object.freeze({
    DESKTOP_PROFILE: "stored in the PaySwap desktop app profile",
    BROWSER_PROFILE: "stored in this browser profile only",
  } as const);

/** §5 final law — the store's demand-side boundary, rendered verbatim. */
export const WORKSPACE_STORE_DEMAND_SIDE_LAW =
  "The workspace store holds demand-side intent only — it is not financial truth, not authorization, not capability state." as const;

/** Raised when a durability value or port shape is invalid (fail-closed). */
export class InvalidWorkspaceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspaceStoreError";
  }
}

/**
 * The honest durability label for one store durability (pure; the label
 * the settings section and the mount chrome render). Fail-closed on an
 * unknown durability value.
 */
export function workspaceStoreDurabilityLabel(durability: WorkspaceStoreDurability): string {
  const label = WORKSPACE_STORE_DURABILITY_LABELS[durability];
  if (typeof label !== "string") {
    throw new InvalidWorkspaceStoreError(
      `unknown workspace store durability ${JSON.stringify(durability)} — the vocabulary is closed`,
    );
  }
  return label;
}
