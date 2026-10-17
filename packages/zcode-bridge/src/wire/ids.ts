/**
 * Pinned wire shapes: runtime ID vocabulary (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/interfaces/shared.ts: the
 * substrate brands its runtime identifiers with stable string prefixes —
 * `sess_` (SessionId), `turn_` (TurnId), `evt_` (EventId), `query_`
 * (QueryId), `tool_` (ToolCallId), `msg_` (MessageId), `part_` (PartId),
 * `input_` (InputHistoryId), `proj_` (ProjectId), `ws_` (WorkspaceId).
 *
 * The substrate factories generate the suffix with crypto randomness; THIS
 * bridge is deterministic library code (no ambient randomness), so it pins
 * the PREFIX LAW and the format `kind-prefixed string` — formatting and
 * parsing take the suffix as explicit DATA.
 */

/** The runtime ID kinds this bridge pins (substrate prefix law). */
export type RuntimeIdKind =
  | "session"
  | "turn"
  | "event"
  | "query"
  | "toolCall"
  | "message"
  | "part"
  | "inputHistory"
  | "project"
  | "workspace";

/**
 * The substrate's ID prefixes, frozen. Keys are the bridge's kind names;
 * values are the EXACT substrate prefix strings.
 */
export const RUNTIME_ID_PREFIXES: Readonly<Record<RuntimeIdKind, string>> =
  Object.freeze({
    session: "sess_",
    turn: "turn_",
    event: "evt_",
    query: "query_",
    toolCall: "tool_",
    message: "msg_",
    part: "part_",
    inputHistory: "input_",
    project: "proj_",
    workspace: "ws_",
  });

/** The frozen list of runtime ID kinds (iteration order = declaration order). */
export const RUNTIME_ID_KINDS: readonly RuntimeIdKind[] = Object.freeze([
  "session",
  "turn",
  "event",
  "query",
  "toolCall",
  "message",
  "part",
  "inputHistory",
  "project",
  "workspace",
]);

/** A runtime ID on the wire: a prefixed non-empty string. */
export type RuntimeIdWire = string;

/** Structural description of a parsed runtime ID. */
export interface RuntimeIdParts {
  readonly kind: RuntimeIdKind;
  readonly prefix: string;
  readonly suffix: string;
}
