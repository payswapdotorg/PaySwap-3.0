/**
 * Pinned wire shapes: dynamic-workflow runtime protocol (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/dynamic-workflow-runtime/src/protocol.ts:
 * the NDJSON stdio wire between the workflow sandbox child and the host —
 * child->parent messages (create-actor, request, event, complete),
 * parent->child responses, and the serializable WireError form. The
 * protocol is product-neutral transport mechanics (migration map: KEEP).
 */

/** Child -> parent message kinds (pin of the ChildMessage union discriminants). */
export type DwfChildMessageKindWire =
  | "create-actor"
  | "request"
  | "event"
  | "complete";

/** The frozen child message-kind vocabulary. */
export const DWF_CHILD_MESSAGE_KINDS: readonly DwfChildMessageKindWire[] =
  Object.freeze(["create-actor", "request", "event", "complete"]);

/** Host-call request types (pin of RequestMessage.type). */
export type DwfWireRequestTypeWire = "ask" | "world-read" | "publish-artifact";

/** The frozen request-type vocabulary. */
export const DWF_WIRE_REQUEST_TYPES: readonly DwfWireRequestTypeWire[] =
  Object.freeze(["ask", "world-read", "publish-artifact"]);

/** Fire-and-forget event message types (pin of EventMessage discriminants). */
export type DwfWireEventTypeWire =
  | "log"
  | "report"
  | "declare-artifact"
  | "phase-entered";

/** The frozen event-type vocabulary. */
export const DWF_WIRE_EVENT_TYPES: readonly DwfWireEventTypeWire[] =
  Object.freeze(["log", "report", "declare-artifact", "phase-entered"]);

/** Parent -> child message kinds (pin of the ParentMessage union). */
export type DwfParentMessageKindWire = "response";

/** The frozen parent message-kind vocabulary. */
export const DWF_PARENT_MESSAGE_KINDS: readonly DwfParentMessageKindWire[] =
  Object.freeze(["response"]);

/** A create-actor message (pin of CreateActorMessage — fire-and-forget, FIFO-mapped). */
export interface DwfCreateActorMessageWire {
  readonly kind: "create-actor";
  readonly localId: string;
  readonly siteId: string;
  readonly name?: string;
  readonly persona?: unknown;
}

/** A host-call request message (pin of RequestMessage). */
export interface DwfRequestMessageWire {
  readonly kind: "request";
  readonly id: string;
  readonly type: DwfWireRequestTypeWire;
  readonly siteId: string;
  readonly actor?: string;
  readonly instructions?: string;
  readonly op?: string;
  readonly artifactOp?: "file" | "markdown";
  readonly args?: readonly unknown[];
}

/** A log event message (pin of LogEventMessage). */
export interface DwfLogEventMessageWire {
  readonly kind: "event";
  readonly type: "log";
  readonly message: string;
}

/** A report event message (pin of ReportEventMessage). */
export interface DwfReportEventMessageWire {
  readonly kind: "event";
  readonly type: "report";
  readonly siteId: string;
  readonly item: unknown;
  readonly artifactId?: string;
}

/** A declare-artifact event message (pin of DeclareArtifactEventMessage). */
export interface DwfDeclareArtifactEventMessageWire {
  readonly kind: "event";
  readonly type: "declare-artifact";
  readonly siteId: string;
  readonly op: "chart" | "table" | "metrics" | "board";
  readonly args: readonly unknown[];
}

/** A phase-entered event message (pin of PhaseEnteredEventMessage). */
export interface DwfPhaseEnteredEventMessageWire {
  readonly kind: "event";
  readonly type: "phase-entered";
  readonly name: string;
}

/** A child completion message (pin of CompleteMessage). */
export interface DwfCompleteMessageWire {
  readonly kind: "complete";
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: DwfWireErrorWire;
}

/** A serializable wire error (pin of WireError). */
export interface DwfWireErrorWire {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly violations?: readonly {
    readonly path: string;
    readonly expected: string;
    readonly got: string;
  }[];
  readonly finalText?: string;
  readonly stack?: string;
}

/** A parent response message (pin of ResponseMessage). */
export interface DwfResponseMessageWire {
  readonly kind: "response";
  readonly id: string;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: DwfWireErrorWire;
}
