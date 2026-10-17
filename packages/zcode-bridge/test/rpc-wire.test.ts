/**
 * RPC transport wire surface tests (P3-W3): the 13-byte frame header
 * codec and the pinned enum tags.
 */

import { describe, expect, it } from "vitest";

import {
  RPC_HEADER_FIELD_OFFSETS,
  RPC_HEADER_FIELD_WIDTHS,
  RPC_HEADER_SIZE,
  RPC_PROTOCOL_MESSAGE_TYPES,
  RPC_PROTOCOL_MESSAGE_TYPE_NAMES,
  RPC_REQUEST_TYPES,
  RPC_RESPONSE_TYPES,
  RPC_SERIALIZATION_DATA_TYPES,
  decodeRpcFrameHeader,
  encodeRpcFrameHeader,
  isRpcProtocolMessageType,
  isRpcRequestType,
  isRpcResponseType,
  isRpcSerializationDataType,
  rpcProtocolMessageTypeName,
} from "../src/index.ts";

describe("RPC transport wire surface", () => {
  it("pins the 13-byte header layout (1 + 4 + 4 + 4)", () => {
    expect(RPC_HEADER_SIZE).toBe(13);
    expect(RPC_HEADER_FIELD_OFFSETS.type).toBe(0);
    expect(RPC_HEADER_FIELD_OFFSETS.id).toBe(1);
    expect(RPC_HEADER_FIELD_OFFSETS.ack).toBe(5);
    expect(RPC_HEADER_FIELD_OFFSETS.length).toBe(9);
    expect(RPC_HEADER_FIELD_WIDTHS.type).toBe(1);
    expect(RPC_HEADER_FIELD_WIDTHS.id).toBe(4);
    expect(RPC_HEADER_FIELD_WIDTHS.ack).toBe(4);
    expect(RPC_HEADER_FIELD_WIDTHS.length).toBe(4);
  });

  it("pins the protocol message types including the reserved gap at 4", () => {
    expect(RPC_PROTOCOL_MESSAGE_TYPES.None).toBe(0);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.Regular).toBe(1);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.Control).toBe(2);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.Ack).toBe(3);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.Disconnect).toBe(5);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.ReplayRequest).toBe(6);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.Pause).toBe(7);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.Resume).toBe(8);
    expect(RPC_PROTOCOL_MESSAGE_TYPES.KeepAlive).toBe(9);
    expect(RPC_PROTOCOL_MESSAGE_TYPE_NAMES.length).toBe(9);
    expect(Object.isFrozen(RPC_PROTOCOL_MESSAGE_TYPES)).toBe(true);
  });

  it("pins the channel request/response and serialization tags", () => {
    expect(RPC_REQUEST_TYPES.Promise).toBe(100);
    expect(RPC_REQUEST_TYPES.PromiseCancel).toBe(101);
    expect(RPC_REQUEST_TYPES.EventListen).toBe(102);
    expect(RPC_REQUEST_TYPES.EventDispose).toBe(103);
    expect(RPC_RESPONSE_TYPES.Initialize).toBe(200);
    expect(RPC_RESPONSE_TYPES.PromiseSuccess).toBe(201);
    expect(RPC_RESPONSE_TYPES.PromiseError).toBe(202);
    expect(RPC_RESPONSE_TYPES.PromiseErrorObj).toBe(203);
    expect(RPC_RESPONSE_TYPES.EventFire).toBe(204);
    expect(RPC_SERIALIZATION_DATA_TYPES.Undefined).toBe(0);
    expect(RPC_SERIALIZATION_DATA_TYPES.String).toBe(1);
    expect(RPC_SERIALIZATION_DATA_TYPES.Buffer).toBe(2);
    expect(RPC_SERIALIZATION_DATA_TYPES.VSBuffer).toBe(3);
    expect(RPC_SERIALIZATION_DATA_TYPES.Array).toBe(4);
    expect(RPC_SERIALIZATION_DATA_TYPES.Object).toBe(5);
    expect(RPC_SERIALIZATION_DATA_TYPES.Int).toBe(6);
  });

  it("encodes a header to exactly 13 bytes with big-endian u32 fields", () => {
    const bytes = encodeRpcFrameHeader({ type: 1, id: 0x01020304, ack: 0x05060708, length: 0x090a0b0c });
    expect(bytes.length).toBe(13);
    expect(bytes[0]).toBe(1);
    expect(bytes[1]).toBe(0x01);
    expect(bytes[2]).toBe(0x02);
    expect(bytes[3]).toBe(0x03);
    expect(bytes[4]).toBe(0x04);
    expect(bytes[5]).toBe(0x05);
    expect(bytes[9]).toBe(0x09);
    expect(bytes[12]).toBe(0x0c);
    expect(Object.isFrozen(bytes)).toBe(true);
  });

  it("decode ignores trailing payload bytes and round-trips exactly", () => {
    const header = { type: 9, id: 42, ack: 7, length: 128 };
    const bytes = [...encodeRpcFrameHeader(header), 0xff, 0xff];
    const decoded = decodeRpcFrameHeader(bytes);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(decoded).toEqual(header);
    expect(decodeRpcFrameHeader(encodeRpcFrameHeader(header))).toEqual(header);
  });

  it("handles max u32 values (no sign-bit overflow)", () => {
    const header = { type: 255, id: 0xffffffff, ack: 0xffffffff, length: 0xffffffff };
    expect(decodeRpcFrameHeader(encodeRpcFrameHeader(header))).toEqual(header);
  });

  it("encode rejects non-integer and u32-unsafe values", () => {
    expect(() =>
      encodeRpcFrameHeader({ type: 1.5, id: 0, ack: 0, length: 0 }),
    ).toThrowError(/type/);
    expect(() =>
      encodeRpcFrameHeader({ type: 256, id: 0, ack: 0, length: 0 }),
    ).toThrowError(/type/);
    expect(() =>
      encodeRpcFrameHeader({ type: 1, id: -1, ack: 0, length: 0 }),
    ).toThrowError(/id/);
    expect(() =>
      encodeRpcFrameHeader({ type: 1, id: 0x100000000, ack: 0, length: 0 }),
    ).toThrowError(/id/);
  });

  it("decode rejects short arrays and non-byte values", () => {
    expect(() => decodeRpcFrameHeader([1, 2, 3])).toThrowError(/at least 13/);
    expect(() => decodeRpcFrameHeader("nope" as never)).toThrowError(/at least 13/);
    expect(() =>
      decodeRpcFrameHeader(new Array(13).fill(256)),
    ).toThrowError(/byte at index 0/);
    expect(() =>
      decodeRpcFrameHeader(new Array(13).fill(1.5)),
    ).toThrowError(/byte at index 0/);
  });

  it("guards and name lookup resolve the pinned enum values", () => {
    expect(isRpcProtocolMessageType(1)).toBe(true);
    expect(isRpcProtocolMessageType(4)).toBe(false); // reserved gap
    expect(isRpcProtocolMessageType("1" as never)).toBe(false);
    expect(isRpcRequestType(102)).toBe(true);
    expect(isRpcRequestType(104)).toBe(false);
    expect(isRpcResponseType(204)).toBe(true);
    expect(isRpcResponseType(205)).toBe(false);
    expect(isRpcSerializationDataType(6)).toBe(true);
    expect(isRpcSerializationDataType(7)).toBe(false);
    expect(rpcProtocolMessageTypeName(1)).toBe("Regular");
    expect(rpcProtocolMessageTypeName(9)).toBe("KeepAlive");
    expect(rpcProtocolMessageTypeName(4)).toBeUndefined();
  });
});
