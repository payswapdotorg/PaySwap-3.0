/**
 * Bridge implementation: RPC frame header codec (P3-W3).
 *
 * The pinned 13-byte frame header as pure numeric functions: encode to a
 * plain number[] byte array (u8 type at 0; big-endian u32 id at 1, ack at
 * 5, length at 9 — exactly how the substrate writes them) and decode back.
 * No Buffer, no node: imports — the bridge pins the LAYOUT, callers apply
 * it to whatever byte medium their transport carries.
 */

import { IssueCollector } from "../errors.ts";
import {
  RPC_HEADER_FIELD_OFFSETS,
  RPC_HEADER_SIZE,
  RPC_PROTOCOL_MESSAGE_TYPES,
  RPC_REQUEST_TYPES,
  RPC_RESPONSE_TYPES,
  RPC_SERIALIZATION_DATA_TYPES,
} from "../wire/rpc-wire.ts";
import type { RpcFrameHeaderWire } from "../wire/rpc-wire.ts";

/** The maximum value of a big-endian unsigned 32-bit field. */
const MAX_U32 = 0xffffffff;

function readUInt32BE(bytes: readonly number[], offset: number): number {
  return (
    ((bytes[offset] as number) * 0x1000000 +
      ((bytes[offset + 1] as number) << 16) +
      ((bytes[offset + 2] as number) << 8) +
      (bytes[offset + 3] as number)) >>>
    0
  );
}

function writeUInt32BE(value: number, offset: number, out: number[]): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

/**
 * Encode a frame header into a fresh 13-byte number array (u8 type; BE u32
 * id, ack, length). The type field must be an unsigned 8-bit value; id,
 * ack and length must be unsigned 32-bit-safe integers (no sign bit).
 */
export function encodeRpcFrameHeader(header: RpcFrameHeaderWire): readonly number[] {
  const issues = new IssueCollector();
  for (const field of ["type", "id", "ack", "length"] as const) {
    const value = header[field];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > MAX_U32
    ) {
      issues.add(field, "must be an unsigned 32-bit-safe integer");
    }
  }
  if (header.type > 0xff) {
    issues.add("type", "must be an unsigned 8-bit value (0..255)");
  }
  issues.throwIfAny("RPC frame header");
  const bytes = new Array<number>(RPC_HEADER_SIZE).fill(0);
  bytes[RPC_HEADER_FIELD_OFFSETS.type] = header.type & 0xff;
  writeUInt32BE(header.id, RPC_HEADER_FIELD_OFFSETS.id, bytes);
  writeUInt32BE(header.ack, RPC_HEADER_FIELD_OFFSETS.ack, bytes);
  writeUInt32BE(header.length, RPC_HEADER_FIELD_OFFSETS.length, bytes);
  return Object.freeze(bytes);
}

/**
 * Decode a frame header from a byte array of at least 13 bytes (extra
 * bytes — the payload — are ignored). Throws a plain Error otherwise.
 */
export function decodeRpcFrameHeader(bytes: readonly number[]): RpcFrameHeaderWire {
  if (!Array.isArray(bytes) || bytes.length < RPC_HEADER_SIZE) {
    throw new Error(
      `decodeRpcFrameHeader: need at least ${RPC_HEADER_SIZE} bytes (got ${Array.isArray(bytes) ? bytes.length : "non-array"})`,
    );
  }
  for (let index = 0; index < RPC_HEADER_SIZE; index += 1) {
    const byte = bytes[index] as number;
    if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throw new Error(
        `decodeRpcFrameHeader: byte at index ${index} is not a byte value (0..255)`,
      );
    }
  }
  return Object.freeze({
    type: bytes[RPC_HEADER_FIELD_OFFSETS.type] as number,
    id: readUInt32BE(bytes, RPC_HEADER_FIELD_OFFSETS.id),
    ack: readUInt32BE(bytes, RPC_HEADER_FIELD_OFFSETS.ack),
    length: readUInt32BE(bytes, RPC_HEADER_FIELD_OFFSETS.length),
  });
}

/** Structural guard: a protocol message type value from the pinned enum. */
export function isRpcProtocolMessageType(candidate: unknown): candidate is number {
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return false;
  return Object.values(RPC_PROTOCOL_MESSAGE_TYPES).includes(candidate);
}

/** Structural guard: a channel request type tag from the pinned enum. */
export function isRpcRequestType(candidate: unknown): candidate is number {
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return false;
  return Object.values(RPC_REQUEST_TYPES).includes(candidate);
}

/** Structural guard: a channel response type tag from the pinned enum. */
export function isRpcResponseType(candidate: unknown): candidate is number {
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return false;
  return Object.values(RPC_RESPONSE_TYPES).includes(candidate);
}

/** Structural guard: a serialization data type tag from the pinned enum. */
export function isRpcSerializationDataType(candidate: unknown): candidate is number {
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return false;
  return Object.values(RPC_SERIALIZATION_DATA_TYPES).includes(candidate);
}

/** The name of a protocol message type value (undefined when unknown). */
export function rpcProtocolMessageTypeName(
  value: number,
): string | undefined {
  for (const [name, tag] of Object.entries(RPC_PROTOCOL_MESSAGE_TYPES)) {
    if (tag === value) return name;
  }
  return undefined;
}
