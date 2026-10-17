/**
 * Pinned wire shapes: RPC transport wire (P3-W3).
 *
 * PIN of packages/rpc/src/protocol.ts (the 13-byte frame header layout and
 * the ProtocolMessageType values), packages/rpc/src/channels.shared.ts (the
 * channel RPC request/response type tags) and packages/rpc/src/
 * serialization.ts (the binary serialization DataType tags). The substrate
 * RPC stack is fully product-neutral transport mechanics (migration map:
 * RPC/transport KEEP).
 *
 * The bridge pins the frame header as a PURE numeric layout — encode and
 * decode operate on plain readonly number[] byte arrays (no Buffer, no
 * node: imports; big-endian 32-bit fields exactly as the substrate writes
 * them).
 */

/** Frame header size in bytes (pin of HEADER_SIZE: 1 + 4 + 4 + 4). */
export const RPC_HEADER_SIZE = 13 as const;

/** Byte offsets of the frame header fields (pin of writeProtocolMessage). */
export const RPC_HEADER_FIELD_OFFSETS: Readonly<
  Record<"type" | "id" | "ack" | "length", number>
> = Object.freeze({
  type: 0,
  id: 1,
  ack: 5,
  length: 9,
});

/** Byte widths of the frame header fields. */
export const RPC_HEADER_FIELD_WIDTHS: Readonly<
  Record<"type" | "id" | "ack" | "length", number>
> = Object.freeze({
  type: 1,
  id: 4,
  ack: 4,
  length: 4,
});

/**
 * Protocol message types (pin of the ProtocolMessageType enum values — note
 * the substrate reserves 4 and never assigns it; the pin preserves the gap).
 */
export const RPC_PROTOCOL_MESSAGE_TYPES: Readonly<
  Record<"None" | "Regular" | "Control" | "Ack" | "Disconnect" | "ReplayRequest" | "Pause" | "Resume" | "KeepAlive", number>
> = Object.freeze({
  None: 0,
  Regular: 1,
  Control: 2,
  Ack: 3,
  Disconnect: 5,
  ReplayRequest: 6,
  Pause: 7,
  Resume: 8,
  KeepAlive: 9,
});

/** The frozen protocol message type names. */
export const RPC_PROTOCOL_MESSAGE_TYPE_NAMES: readonly string[] =
  Object.freeze([
    "None",
    "Regular",
    "Control",
    "Ack",
    "Disconnect",
    "ReplayRequest",
    "Pause",
    "Resume",
    "KeepAlive",
  ]);

/** Channel RPC request type tags (pin of the RequestType const enum). */
export const RPC_REQUEST_TYPES: Readonly<
  Record<"Promise" | "PromiseCancel" | "EventListen" | "EventDispose", number>
> = Object.freeze({
  Promise: 100,
  PromiseCancel: 101,
  EventListen: 102,
  EventDispose: 103,
});

/** Channel RPC response type tags (pin of the ResponseType const enum). */
export const RPC_RESPONSE_TYPES: Readonly<
  Record<
    "Initialize" | "PromiseSuccess" | "PromiseError" | "PromiseErrorObj" | "EventFire",
    number
  >
> = Object.freeze({
  Initialize: 200,
  PromiseSuccess: 201,
  PromiseError: 202,
  PromiseErrorObj: 203,
  EventFire: 204,
});

/** Binary serialization data type tags (pin of the serialization DataType enum). */
export const RPC_SERIALIZATION_DATA_TYPES: Readonly<
  Record<
    "Undefined" | "String" | "Buffer" | "VSBuffer" | "Array" | "Object" | "Int",
    number
  >
> = Object.freeze({
  Undefined: 0,
  String: 1,
  Buffer: 2,
  VSBuffer: 3,
  Array: 4,
  Object: 5,
  Int: 6,
});

/** A parsed RPC frame header. */
export interface RpcFrameHeaderWire {
  readonly type: number;
  readonly id: number;
  readonly ack: number;
  readonly length: number;
}

/** The IChannel capability list (pin of IChannel method names — descriptive only). */
export const RPC_CHANNEL_CAPABILITIES: readonly string[] = Object.freeze([
  "call",
  "listen",
]);
