/**
 * PaySwap Desktop (P23-D, ADR-0015 D10 — the E2E law's enabling wire fix)
 * — THE RPC BIGINT WIRE ROUND-TRIP PIN: the substrate serializer's Object
 * branch rides JSON.stringify, which THROWS on a nested BigInt ("Do not
 * know how to serialize a BigInt") — the channel reply was lost wholesale
 * and the caller's promise never settled (the CDP journey's finding: the
 * corridor capability chains — whose connected-account cost models carry
 * `bps: bigint` — never reached the renderer's engine, so the rails
 * derived 'unobserved' and the opportunity cards never composed).
 *
 * The fix follows the serializer's OWN nested-Uint8Array precedent: a
 * marked string round-trip (additive, backward compatible). This pin
 * proves the law at the tier that needs it: a chains-shaped payload
 * round-trips byte-faithfully — the BigInt survives, the plain values
 * stay untouched, and the marker never leaks as data.
 */

import { describe, expect, it } from "vitest";

import { BufferReader, BufferWriter, deserialize, serialize } from "@zcode/rpc";

/** The chains-shaped wire payload (the connected-account cost model carries BigInt bps). */
interface WireChain {
  readonly definition: {
    readonly id: string;
    readonly version: string;
    readonly cost: readonly { readonly componentId: string; readonly kind: string; readonly bps: bigint }[];
  };
  readonly implementation: { readonly implementationId: string; readonly corridors: readonly { readonly currencies: readonly string[] }[] };
  readonly instance: { readonly instanceId: string; readonly providerName: string; readonly authorization: { readonly status: string } };
  readonly observation: { readonly instanceId: string; readonly observedAt: string; readonly observationVersion: number };
}

function chainsShapedPayload(): WireChain[] {
  return [
    {
      definition: {
        id: "capability:connected-account:stripe",
        version: "1.0.0",
        cost: [
          { componentId: "fixed", kind: "per_use_fee", bps: 0n },
          { componentId: "variable", kind: "variable_fee_bps", bps: 29n },
        ],
      },
      implementation: { implementationId: "implementation:https:stripe", corridors: [{ currencies: ["USD"] }] },
      instance: { instanceId: "instance:conn:test-1", providerName: "Stripe", authorization: { status: "ACTIVE" } },
      observation: { instanceId: "instance:conn:test-1", observedAt: "2026-10-29T09:00:00.000Z", observationVersion: 1 },
    },
    {
      definition: { id: "capability:connected-account:flutterwave", version: "1.0.0", cost: [] },
      implementation: { implementationId: "implementation:https:flutterwave", corridors: [{ currencies: ["NGN", "KES"] }] },
      instance: { instanceId: "instance:conn:test-2", providerName: "Flutterwave", authorization: { status: "ACTIVE" } },
      observation: { instanceId: "instance:conn:test-2", observedAt: "2026-10-29T09:00:00.000Z", observationVersion: 1 },
    },
  ];
}

function roundTrip(value: unknown): unknown {
  const writer = new BufferWriter();
  serialize(writer, value);
  return deserialize(new BufferReader(writer.buffer));
}

describe("the RPC BigInt wire round-trip (P23-D — the E2E law's enabling fix, the nested-Uint8Array precedent)", () => {
  it("a chains-shaped payload with nested BigInt bps round-trips FAITHFULLY (the cost models survive the wire)", () => {
    const payload = chainsShapedPayload();
    const result = roundTrip(payload) as WireChain[];
    expect(result).toHaveLength(2);
    expect(result[0]!.definition.cost).toEqual([
      { componentId: "fixed", kind: "per_use_fee", bps: 0n },
      { componentId: "variable", kind: "variable_fee_bps", bps: 29n },
    ]);
    expect(typeof result[0]!.definition.cost[1]!.bps).toBe("bigint");
    expect(result[0]!.definition.cost[1]!.bps).toBe(29n);
    expect(result[1]!.definition.cost).toEqual([]);
    expect(result[0]!.instance.providerName).toBe("Stripe");
    expect(result[1]!.implementation.corridors[0]!.currencies).toEqual(["NGN", "KES"]);
  });

  it("plain payloads stay byte-identical (no marker leakage, no shape drift)", () => {
    const plain = { ok: true, count: 2, name: "payswap-desktop", nested: { list: [1, "two", null, false] } };
    expect(roundTrip(plain)).toEqual(plain);
    // The marker shape itself NEVER round-trips as data (a user payload that
    // happens to carry the marker key stays a plain record — the decoder only
    // revives the exact two-key marker shape).
    const spoof = { __zcode_rpc_nested_bigint_v1: true, bigint: "29", extra: true };
    expect(roundTrip(spoof)).toEqual(spoof);
  });

  it("a top-level BigInt rides the Object branch (the args path never throws)", () => {
    expect(roundTrip(29n)).toBe(29n);
    expect(roundTrip([1n, "two", { three: 3n }])).toEqual([1n, "two", { three: 3n }]);
  });
});
