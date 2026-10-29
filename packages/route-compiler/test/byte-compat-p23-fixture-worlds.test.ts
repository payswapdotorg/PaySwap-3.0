import { describe, expect, it } from "vitest";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import { contentDigest, canonicalJsonStringify } from "../src/canonical.ts";
import { baseCompilerInput } from "./compiler-fixtures.ts";
import { ROUTE_SHAPE_IDS } from "../src/shapes.ts";
import { route1Intent, route2Intent, route3Intent, route4Intent } from "./fixtures.ts";

/**
 * THE P22-C BYTE-COMPAT GATE (ADR-0016 D5): every one of the nine
 * pre-existing shapes' compilation over the P23 fixture worlds is
 * BYTE-IDENTICAL before/after the cross-provider-corridor growth.
 *
 * The pinned digests below were captured at the P22 base commit 694b87d
 * (PRE-change, 2026-10-29) by compiling the P23 fixture worlds — the four
 * route fixture intents (route-1 crypto-dex-offramp, route-2
 * fiat-psp-chain, route-3 dex-bridge, route-4 merchant-balance) plus
 * route-3's same-chain variant (the onchain-direct-transfer world of
 * route-3's own battery) — through compileMoneyMovementRoute and digesting
 * the FULL canonical result. Together the five worlds exercise all nine
 * pre-existing shapes. The battery's law: the corridor growth (the tenth
 * shape, the one new location-pair admission, the observed-middle
 * dispatch) leaves every one of these compilations byte-identical — same
 * compilationDigest, same full-result digest, same per-plan digests, same
 * canonical byte length, same (empty) exclusion set. Any drift in an
 * existing shape's output is a migration failure.
 */

/** One fixture world's pinned pre-change compilation output. */
interface PinnedWorldDigest {
  readonly compilationDigest: string;
  readonly fullResultDigest: string;
  readonly canonicalBytes: number;
  readonly plans: readonly { readonly shapeId: string; readonly planDigest: string }[];
}

const PINNED_PRE_CHANGE_DIGESTS: Readonly<Record<string, PinnedWorldDigest>> = Object.freeze({
  "route-1": Object.freeze({
    compilationDigest: "fnv1a64:21efcd3005561512",
    fullResultDigest: "fnv1a64:7750962a60f26210",
    canonicalBytes: 19989,
    plans: Object.freeze([
      Object.freeze({ shapeId: "mixed-dex-offramp", planDigest: "fnv1a64:baf7f87998d90ff0" }),
      Object.freeze({ shapeId: "provider-native-offramp", planDigest: "fnv1a64:d622c6bbf9cb861b" }),
    ]),
  }),
  "route-2": Object.freeze({
    compilationDigest: "fnv1a64:5c9d4de27b7465fd",
    fullResultDigest: "fnv1a64:860c34f67cd5fd27",
    canonicalBytes: 11709,
    plans: Object.freeze([
      Object.freeze({ shapeId: "mixed-psp-onramp", planDigest: "fnv1a64:7ee1a3c0f50d8014" }),
      Object.freeze({ shapeId: "provider-native-onramp", planDigest: "fnv1a64:a693007d503aa126" }),
    ]),
  }),
  "route-3": Object.freeze({
    compilationDigest: "fnv1a64:f560ad8b39a7738b",
    fullResultDigest: "fnv1a64:2d90c327813faa04",
    canonicalBytes: 10624,
    plans: Object.freeze([
      Object.freeze({ shapeId: "mixed-dex-bridge", planDigest: "fnv1a64:95b676fb8310283d" }),
      Object.freeze({ shapeId: "provider-native-bridge", planDigest: "fnv1a64:0dd75e846a0d0857" }),
    ]),
  }),
  "route-4": Object.freeze({
    compilationDigest: "fnv1a64:3f276c0a84490fdc",
    fullResultDigest: "fnv1a64:5be7d31f3e8db2b6",
    canonicalBytes: 15800,
    plans: Object.freeze([
      Object.freeze({ shapeId: "merchant-external-payswap-route", planDigest: "fnv1a64:e165a2cc3568971a" }),
      Object.freeze({ shapeId: "merchant-native-settlement", planDigest: "fnv1a64:125193ab10050c80" }),
    ]),
  }),
  // The same-chain direct-transfer world (route-3's own battery's variant).
  "route-3s": Object.freeze({
    compilationDigest: "fnv1a64:9e120c7d785e302c",
    fullResultDigest: "fnv1a64:51cba84235ce9723",
    canonicalBytes: 3811,
    plans: Object.freeze([
      Object.freeze({ shapeId: "onchain-direct-transfer", planDigest: "fnv1a64:d0fd4e6fb345aae7" }),
    ]),
  }),
});

/** The same-chain direct-transfer input (route-3's battery variant, verbatim). */
function route3SameChainInput(): ReturnType<typeof baseCompilerInput> {
  const intent = { ...route3Intent(), destination: { ...route3Intent().destination, currency: "ETH" } };
  const input = baseCompilerInput({
    ...intent,
    destination: {
      locationRef: "fundsloc:route-3-destination-wallet",
      currency: "ETH",
      observationRef: "obs:route-3-destination",
    },
    originAmount: { currency: "ETH", minorUnits: "10000000000000000" },
    arrivalCurrency: "ETH",
  });
  const observations = input.locationObservations.map((observation) =>
    observation.observationKind === "ONCHAIN_POSITION" && observation.locationRef === "fundsloc:route-3-destination-wallet"
      ? { ...observation, chainKey: "ethereum:mainnet", assetId: "ethereum:mainnet/asset:ETH", symbol: "ETH" }
      : observation,
  );
  return { ...input, locationObservations: observations, assetObservations: observations };
}

describe("the P22-C byte-compat gate: the nine existing shapes over the P23 fixture worlds", () => {
  it("every existing shape's compilation is byte-identical to the pinned pre-change output (the migration proof)", () => {
    const worlds: readonly (readonly [string, ReturnType<typeof baseCompilerInput>])[] = Object.freeze([
      Object.freeze(["route-1", baseCompilerInput(route1Intent())] as const),
      Object.freeze(["route-2", baseCompilerInput(route2Intent())] as const),
      Object.freeze(["route-3", baseCompilerInput(route3Intent())] as const),
      Object.freeze(["route-4", baseCompilerInput(route4Intent())] as const),
      Object.freeze(["route-3s", route3SameChainInput()] as const),
    ]);
    for (const [label, input] of worlds) {
      const pinned = PINNED_PRE_CHANGE_DIGESTS[label]!;
      const result = compileMoneyMovementRoute(input);
      expect(result.compilationDigest, `${label} compilationDigest`).toBe(pinned.compilationDigest);
      expect(contentDigest(result), `${label} full-result digest`).toBe(pinned.fullResultDigest);
      expect(canonicalJsonStringify(result).length, `${label} canonical byte length`).toBe(pinned.canonicalBytes);
      expect(
        result.plans.map((plan) => ({ shapeId: plan.shapeId, planDigest: plan.planDigest })),
        `${label} per-plan digests`,
      ).toEqual([...pinned.plans]);
      expect(result.exclusions, `${label} exclusions`).toEqual([]);
      expect(result.discoveryPermitsExecution).toBe(false);
    }
  });

  it("the nine pre-existing shapes are all exercised by the pinned worlds (the gate covers the whole vocabulary)", () => {
    const compiled = new Set<string>();
    for (const label of Object.keys(PINNED_PRE_CHANGE_DIGESTS)) {
      const input =
        label === "route-1"
          ? baseCompilerInput(route1Intent())
          : label === "route-2"
            ? baseCompilerInput(route2Intent())
            : label === "route-3"
              ? baseCompilerInput(route3Intent())
              : label === "route-4"
                ? baseCompilerInput(route4Intent())
                : route3SameChainInput();
      for (const plan of compileMoneyMovementRoute(input).plans) {
        compiled.add(plan.shapeId);
      }
    }
    for (const shapeId of ROUTE_SHAPE_IDS) {
      if (shapeId === "cross-provider-corridor") {
        continue;
      }
      expect(compiled.has(shapeId), `the fixture worlds compile '${shapeId}'`).toBe(true);
    }
    expect(compiled.has("cross-provider-corridor")).toBe(false);
    expect(compiled.size).toBe(9);
  });
});
