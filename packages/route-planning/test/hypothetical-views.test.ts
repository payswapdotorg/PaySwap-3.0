import { describe, expect, it } from "vitest";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { mergedCorridorView } from "../src/candidates.ts";
import {
  HypotheticalViewError,
  corridorViewDigest,
  deriveHypotheticalView,
  hypotheticalViewCanonicalJson,
  type HypotheticalViewDerivationInput,
} from "../src/hypothetical-views.ts";
import type { PinnedCorridorView } from "../src/pins/capability.ts";
import type { PinnedHypotheticalAugmentation } from "../src/pins/hypotheses.ts";
import {
  CORRIDOR_RAIL_KEY,
  NOW,
  flwSenderChain,
  noRouteCorridorQuery,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { realCorridorProjectionPort } from "./fixtures.ts";

/**
 * THE HYPOTHETICAL CORRIDOR VIEWS (P23-C, ADR-0015 D5 — the one-change
 * discipline over the merged corridor view): the tamper-check FIRST, the
 * exactly-ONE-augmentation law, the never-chain law, the distinct-type
 * laws (no observation/instance ids on assumed elements), determinism.
 */

const OPERATOR_ID = "repair:intermediary-introduced";

function baseView(): PinnedCorridorView {
  const pair = deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
  return mergedCorridorView(pair.sender, pair.recipient, {
    sourceCountry: "NG",
    destinationCountry: "US",
    sourceCurrency: "NGN",
    destinationCurrency: "USD",
    asOf: "2026-10-05T00:00:00Z",
  });
}

function assumedRail(): PinnedHypotheticalAugmentation {
  return {
    kind: "ADD_ASSUMED_RAIL",
    rail: {
      assumed: true,
      assumedRailId: "assumed-rail:test-intermediary",
      providerName: "assumed:test-intermediary",
      railKind: "FIAT",
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      summary: "a verified intermediary rail bridges the corridor",
    },
  };
}

function viewInput(overrides: Partial<HypotheticalViewDerivationInput> = {}): HypotheticalViewDerivationInput {
  const view = baseView();
  return {
    baseView: view,
    declaredBaseViewDigest: corridorViewDigest(view),
    operatorId: OPERATOR_ID,
    augmentations: [assumedRail()],
    ...overrides,
  };
}

describe("the hypothetical corridor views (P23-C, ADR-0015 D5 — the one-change discipline)", () => {
  it("derives one variant: the identity law + the base view + the ONE assumed element, deep-frozen", () => {
    const view = baseView();
    const digest = corridorViewDigest(view);
    const variant = deriveHypotheticalView(viewInput());
    expect(variant.variantId).toBe(`hypothesis:${digest}:${OPERATOR_ID}`);
    expect(variant.baseViewDigest).toBe(digest);
    expect(variant.operatorId).toBe(OPERATOR_ID);
    expect(variant.augmentation.kind).toBe("ADD_ASSUMED_RAIL");
    expect(variant.baseView.routes.length).toBe(view.routes.length);
    expect(Object.isFrozen(variant)).toBe(true);
    expect(variant.hypotheticalViewDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("LAW 1 — the tamper check FIRST: a mismatched declared digest never proceeds", () => {
    const view = baseView();
    expect(() =>
      deriveHypotheticalView({
        baseView: view,
        declaredBaseViewDigest: "fnv1a64:0000000000000bad",
        operatorId: OPERATOR_ID,
        augmentations: [assumedRail()],
      }),
    ).toThrow(HypotheticalViewError);
    expect(() =>
      deriveHypotheticalView({
        baseView: view,
        declaredBaseViewDigest: "fnv1a64:0000000000000bad",
        operatorId: OPERATOR_ID,
        augmentations: [assumedRail()],
      }),
    ).toThrow(/a tampered base view never proceeds/);
  });

  it("LAW 2 — exactly ONE augmentation per variant: zero and two both fail closed", () => {
    expect(() => deriveHypotheticalView(viewInput({ augmentations: [] }))).toThrow(HypotheticalViewError);
    expect(() => deriveHypotheticalView(viewInput({ augmentations: [assumedRail(), assumedRail()] }))).toThrow(
      /exactly ONE augmentation per variant/,
    );
  });

  it("the never-chain law: an already-hypothetical base is a second change — the typed error", () => {
    // A digest-CONSISTENT base that already carries a variant identity: the canonical projection
    // ignores the extra fields, so the tamper check passes and the never-chain law fires.
    const view = baseView();
    const alreadyHypothetical = { ...view, variantId: "hypothesis:predecessor", augmentation: assumedRail() } as unknown as PinnedCorridorView;
    expect(() =>
      deriveHypotheticalView({
        baseView: alreadyHypothetical,
        declaredBaseViewDigest: corridorViewDigest(alreadyHypothetical),
        operatorId: "repair:bridge-via-intermediary-rail",
        augmentations: [assumedRail()],
      }),
    ).toThrow(HypotheticalViewError);
    expect(() =>
      deriveHypotheticalView({
        baseView: alreadyHypothetical,
        declaredBaseViewDigest: corridorViewDigest(alreadyHypothetical),
        operatorId: "repair:bridge-via-intermediary-rail",
        augmentations: [assumedRail()],
      }),
    ).toThrow(/never a chain/);
  });

  it("the distinct-type laws: an assumed element smuggling an observationId/instanceId fails closed (never a fake real rail)", () => {
    const genuine = assumedRail();
    if (genuine.kind !== "ADD_ASSUMED_RAIL") throw new Error("fixture kind mismatch");
    const smuggled = {
      kind: "ADD_ASSUMED_RAIL",
      rail: {
        ...genuine.rail,
        observationId: "obs:smuggled",
      },
    } as unknown as PinnedHypotheticalAugmentation;
    expect(() => deriveHypotheticalView(viewInput({ augmentations: [smuggled] }))).toThrow(HypotheticalViewError);
    const smuggledInstance = {
      kind: "ADD_ASSUMED_RAIL",
      rail: {
        ...genuine.rail,
        instanceId: "inst:smuggled",
      },
    } as unknown as PinnedHypotheticalAugmentation;
    expect(() => deriveHypotheticalView(viewInput({ augmentations: [smuggledInstance] }))).toThrow(HypotheticalViewError);
  });

  it("the A.5 vocabulary: an unknown augmentation kind fails closed; all three kinds derive", () => {
    expect(() =>
      deriveHypotheticalView(
        viewInput({
          augmentations: [{ kind: "ADD_ASSUMED_MAGIC" } as unknown as PinnedHypotheticalAugmentation],
        }),
      ),
    ).toThrow(HypotheticalViewError);
    const conversionAsset: PinnedHypotheticalAugmentation = {
      kind: "ADD_ASSUMED_CONVERSION_ASSET",
      asset: { assumed: true, assumedAssetId: "assumed-asset:usdc", fromCurrency: "NGN", toCurrency: "USD", summary: "convert through USDC" },
    };
    const connectorOperation: PinnedHypotheticalAugmentation = {
      kind: "ADD_ASSUMED_CONNECTOR_OPERATION",
      operation: {
        assumed: true,
        assumedOperationId: "assumed-operation:split",
        providerName: "assumed:split",
        operationKind: "split-transfer",
        sourceCurrency: "NGN",
        destinationCurrency: "USD",
        summary: "split below the maximum",
      },
    };
    for (const augmentation of [conversionAsset, connectorOperation]) {
      const variant = deriveHypotheticalView(viewInput({ augmentations: [augmentation] }));
      expect(variant.augmentation.kind).toBe(augmentation.kind);
    }
  });

  it("the determinism law: identical inputs produce byte-identical variants (the canonical JSON proof)", () => {
    const first = deriveHypotheticalView(viewInput());
    const second = deriveHypotheticalView(viewInput());
    expect(hypotheticalViewCanonicalJson(second)).toBe(hypotheticalViewCanonicalJson(first));
    expect(second.hypotheticalViewDigest).toBe(first.hypotheticalViewDigest);
  });

  it("the corridorViewDigest is stable and value-formed (fnv1a64:<16-hex>) over the same base", () => {
    const view = baseView();
    expect(corridorViewDigest(view)).toBe(corridorViewDigest(view));
    expect(corridorViewDigest(view)).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(corridorViewDigest(baseView())).toBe(corridorViewDigest(view));
  });
});
