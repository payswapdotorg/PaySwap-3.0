/**
 * Pinned wire shapes: session port and collaboration modes (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/interfaces/session.port.ts:
 * the session status vocabulary, the session manager port surface
 * (createSession/resumeSession/forkSession/getSession/listSessions — pinned
 * as a DESCRIPTIVE capability list, never a callable), and the substrate's
 * collaboration modes.
 *
 * ADAPTATION (migration map: GENERALIZE coding-specific concepts;
 * PAYSWAP-ADAPT applies to the agent/permission UX): the substrate's
 * collaboration modes ("plan" | "build" | "edit" | "yolo" | "auto") are
 * coding-product flavored. The bridge pins them as the OBSERVED vocabulary
 * and projects each onto a product-neutral posture
 * ("PROPOSE" | "ACT" | "AUTO"). The projection is a LABEL ONLY: even the
 * AUTO posture (the substrate's yolo/auto application-permission
 * auto-approval) is APPLICATION permission — it can never represent
 * PaySwap financial authorization (the critical migration-map boundary).
 */

/** Session statuses (pin of SessionStatus). */
export type SessionStatusWire =
  | "idle"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "error";

/** The frozen session-status vocabulary. */
export const SESSION_STATUSES: readonly SessionStatusWire[] = Object.freeze([
  "idle",
  "running",
  "waiting",
  "paused",
  "completed",
  "error",
]);

/** The substrate's collaboration modes (pin of CollaborMode, OBSERVED). */
export type ObservedCollaborationModeWire =
  | "plan"
  | "build"
  | "edit"
  | "yolo"
  | "auto";

/** The frozen observed collaboration-mode vocabulary. */
export const OBSERVED_COLLABORATION_MODES: readonly ObservedCollaborationModeWire[] =
  Object.freeze(["plan", "build", "edit", "yolo", "auto"]);

/**
 * Product-neutral posture projection of a collaboration mode:
 * - PROPOSE: the agent proposes before acting (plan).
 * - ACT: the agent acts within its application permission envelope (build, edit).
 * - AUTO: application-level auto-approval of substrate permissions (yolo, auto).
 *
 * NONE of these postures is financial authority — see the module header.
 */
export type CollaborationPostureWire = "PROPOSE" | "ACT" | "AUTO";

/** The frozen posture vocabulary. */
export const COLLABORATION_POSTURES: readonly CollaborationPostureWire[] =
  Object.freeze(["PROPOSE", "ACT", "AUTO"]);

/** The frozen observed-mode -> neutral-posture projection map. */
export const COLLABORATION_MODE_POSTURES: Readonly<
  Record<ObservedCollaborationModeWire, CollaborationPostureWire>
> = Object.freeze({
  plan: "PROPOSE",
  build: "ACT",
  edit: "ACT",
  yolo: "AUTO",
  auto: "AUTO",
});

/** A session snapshot on the wire (descriptive slice of the substrate Session). */
export interface SessionWire {
  readonly id: string;
  readonly status: SessionStatusWire;
  readonly mode?: ObservedCollaborationModeWire;
  readonly projectedPosture: CollaborationPostureWire;
}

/**
 * The session manager capability list (pin of SessionManagerPort's method
 * names — descriptive only): what the substrate port surface offers.
 */
export const SESSION_MANAGER_CAPABILITIES: readonly string[] = Object.freeze([
  "createSession",
  "resumeSession",
  "forkSession",
  "getSession",
  "listSessions",
]);
