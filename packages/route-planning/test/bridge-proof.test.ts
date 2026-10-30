import { describe, expect, it } from "vitest";
import {
  BridgeProofError,
  PINNED_BRIDGE_ANSWERABLE_EXCLUSION_CODES,
  compileAssumedElementBridge,
  type AssumedElementBridgeInput,
} from "../src/bridge-proof.ts";
import { corridorViewDigest, deriveHypotheticalView } from "../src/hypothetical-views.ts";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { mergedCorridorView } from "../src/candidates.ts";
import { assertHypothesisIsNotARoutePlan } from "../src/hypothesis-stage.ts";
import type { PinnedHypotheticalCorridorView } from "../src/pins/hypotheses.ts";
import type { GroundedExclusionFact } from "../src/conditional-stage.ts";
import {
  flwSenderChain,
  noRouteCorridorQuery,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { realCorridorProjectionPort } from "./fixtures.ts";

/**
 * THE TYPED BRIDGE PROOF (the P23 correctness patch, 2026-10-29): the
 * deterministic proof that ONE hypothetical view's EXACT assumed element
 * provably participates in a composed candidate. The proof holds only
 * when the element spans the corridor's declared currency pair AND every
 * remaining REAL blocker is answered by the element's augmentation kind;
 * anything less is the honest no-proof result the hypothesis stage maps
 * onto UNVERIFIED. Fail-closed on every shape law; deterministic
 * (byte-identical proof digests); NEVER a RoutePlan.
 */

const OPERATOR_ID = "repair:bridge-via-intermediary-rail";

function baseWorld(): { view: PinnedHypotheticalCorridorView; query: ReturnType<typeof noRouteCorridorQuery> } {
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
  const baseView = mergedCorridorView(pair.sender, pair.recipient, {
    sourceCountry: "NG",
    destinationCountry: "US",
    sourceCurrency: "NGN",
    destinationCurrency: "USD",
    asOf: "2026-10-05T00:00:00Z",
  });
  const view = deriveHypotheticalView({
    baseView,
    declaredBaseViewDigest: corridorViewDigest(baseView),
    operatorId: OPERATOR_ID,
    augmentations: [
      {
        kind: "ADD_ASSUMED_RAIL",
        rail: {
          assumed: true,
          assumedRailId: "assumed-rail:fixture-intermediary",
          providerName: "assumed:fixture-intermediary",
          railKind: "FIAT",
          sourceCurrency: "NGN",
          destinationCurrency: "USD",
          summary: "a verified intermediary rail bridges the corridor",
        },
      },
    ],
  });
  return { view, query: noRouteCorridorQuery() };
}

function countryBlockers(): readonly GroundedExclusionFact[] {
  return [
    { side: "SENDER", routeId: "route:sender-1", code: "SOURCE_COUNTRY_NOT_SERVED", message: "does not serve source country" },
    { side: "RECIPIENT", routeId: "route:recipient-1", code: "DESTINATION_COUNTRY_NOT_SERVED", message: "does not serve destination country" },
  ];
}

function proofInput(overrides: Partial<AssumedElementBridgeInput> = {}): AssumedElementBridgeInput {
  const { view, query } = baseWorld();
  return { view, corridorQuery: query, blockers: countryBlockers(), ...overrides };
}

describe("the typed bridge proof (the P23 correctness patch)", () => {
  it("the POSITIVE CONTROL: an element that spans the corridor's declared pair over only country-code blockers PROVES the bridge and mints the namespaced advisory plan id", () => {
    const compilation = compileAssumedElementBridge(proofInput());
    expect(compilation.proof).not.toBeNull();
    expect(compilation.assumedElementPlanIds).toEqual([`hypothesis-plan:${baseWorld().view.variantId}`]);
    expect(compilation.proof?.assumedElementId).toBe("assumed-rail:fixture-intermediary");
    expect(compilation.proof?.augmentationKind).toBe("ADD_ASSUMED_RAIL");
    expect(compilation.proof?.spansSourceCurrency).toBe("NGN");
    expect(compilation.proof?.spansDestinationCurrency).toBe("USD");
    expect(compilation.proof?.answeredBlockerCodes).toEqual([
      "SOURCE_COUNTRY_NOT_SERVED",
      "DESTINATION_COUNTRY_NOT_SERVED",
    ]);
  });

  it("THE REGRESSION LAW: an UNRELATED element (a pair that does not span the corridor) proves NOTHING — even with a valid real route elsewhere", () => {
    const { view } = baseWorld();
    // The assumed element declares KES->GHS inside an NGN->USD corridor:
    // it does not span the corridor's declared pair, so no proof issues.
    const unrelated = deriveHypotheticalView({
      baseView: view.baseView as never,
      declaredBaseViewDigest: view.baseViewDigest,
      operatorId: OPERATOR_ID,
      augmentations: [
        {
          kind: "ADD_ASSUMED_RAIL",
          rail: {
            assumed: true,
            assumedRailId: "assumed-rail:unrelated",
            providerName: "assumed:unrelated",
            railKind: "FIAT",
            sourceCurrency: "KES",
            destinationCurrency: "GHS",
            summary: "an unrelated rail that does not span this corridor",
          },
        },
      ],
    });
    const compilation = compileAssumedElementBridge({
      view: unrelated,
      corridorQuery: noRouteCorridorQuery(),
      blockers: countryBlockers(),
    });
    expect(compilation.proof).toBeNull();
    expect(compilation.assumedElementPlanIds).toEqual([]);
  });

  it("a blocker the element's augmentation kind cannot answer is an unproven precondition — no proof (the honest conservative direction)", () => {
    // The no-route world's REAL blockers: the read-only FLW rail and the
    // unserved funding method. An assumed rail answers NEITHER code — the
    // corridor would not compose with only this element assumed.
    const compilation = compileAssumedElementBridge({
      ...proofInput(),
      blockers: [
        { side: "SENDER", routeId: "route:sender-1", code: "NOT_EXECUTABLE_CAPABILITY", message: "read-only test-mode keys" },
        { side: "RECIPIENT", routeId: "route:recipient-1", code: "FUNDING_METHOD_NOT_SERVED", message: "the funding method is not served" },
      ],
    });
    expect(compilation.proof).toBeNull();
    expect(compilation.assumedElementPlanIds).toEqual([]);
  });

  it("an empty blocker set proves NOTHING — the element must bridge something real (never a vacuous proof over a clean corridor)", () => {
    const compilation = compileAssumedElementBridge({ ...proofInput(), blockers: [] });
    expect(compilation.proof).toBeNull();
    expect(compilation.assumedElementPlanIds).toEqual([]);
  });

  it("the answerable sets are the frozen per-kind pins (the repair catalogue's own operator semantics)", () => {
    expect(PINNED_BRIDGE_ANSWERABLE_EXCLUSION_CODES.ADD_ASSUMED_RAIL).toEqual([
      "SOURCE_COUNTRY_NOT_SERVED",
      "DESTINATION_COUNTRY_NOT_SERVED",
    ]);
    expect(PINNED_BRIDGE_ANSWERABLE_EXCLUSION_CODES.ADD_ASSUMED_CONVERSION_ASSET).toEqual([
      "SOURCE_CURRENCY_NOT_SUPPORTED",
      "DESTINATION_CURRENCY_NOT_SUPPORTED",
    ]);
    expect(PINNED_BRIDGE_ANSWERABLE_EXCLUSION_CODES.ADD_ASSUMED_CONNECTOR_OPERATION).toEqual([
      "AMOUNT_ABOVE_MAXIMUM",
    ]);
  });

  it("the conversion-asset and connector-operation kinds prove over their OWN answerable codes", () => {
    const { view } = baseWorld();
    const assetView = deriveHypotheticalView({
      baseView: view.baseView as never,
      declaredBaseViewDigest: view.baseViewDigest,
      operatorId: "repair:convert-through-supported-asset",
      augmentations: [
        {
          kind: "ADD_ASSUMED_CONVERSION_ASSET",
          asset: {
            assumed: true,
            assumedAssetId: "assumed-asset:fixture-conversion",
            fromCurrency: "NGN",
            toCurrency: "USD",
            summary: "the corridor converts through a supported asset",
          },
        },
      ],
    });
    const assetProof = compileAssumedElementBridge({
      view: assetView,
      corridorQuery: noRouteCorridorQuery(),
      blockers: [
        { side: "SENDER", routeId: "route:sender-1", code: "SOURCE_CURRENCY_NOT_SUPPORTED", message: "source currency not supported" },
      ],
    });
    expect(assetProof.proof?.augmentationKind).toBe("ADD_ASSUMED_CONVERSION_ASSET");
    expect(assetProof.assumedElementPlanIds).toEqual([`hypothesis-plan:${assetView.variantId}`]);

    const operationView = deriveHypotheticalView({
      baseView: view.baseView as never,
      declaredBaseViewDigest: view.baseViewDigest,
      operatorId: "repair:split-below-maximum",
      augmentations: [
        {
          kind: "ADD_ASSUMED_CONNECTOR_OPERATION",
          operation: {
            assumed: true,
            assumedOperationId: "assumed-operation:fixture-split",
            providerName: "assumed:split",
            operationKind: "split-transfer",
            sourceCurrency: "NGN",
            destinationCurrency: "USD",
            summary: "the payment splits below the rail's declared maximum",
          },
        },
      ],
    });
    const operationProof = compileAssumedElementBridge({
      view: operationView,
      corridorQuery: noRouteCorridorQuery(),
      blockers: [
        { side: "SENDER", routeId: "route:sender-1", code: "AMOUNT_ABOVE_MAXIMUM", message: "amount above the rail maximum" },
      ],
    });
    expect(operationProof.proof?.augmentationKind).toBe("ADD_ASSUMED_CONNECTOR_OPERATION");
    expect(operationProof.assumedElementPlanIds).toEqual([`hypothesis-plan:${operationView.variantId}`]);
  });

  it("the determinism law: identical inputs produce byte-identical proof digests", () => {
    const first = compileAssumedElementBridge(proofInput());
    const second = compileAssumedElementBridge(proofInput());
    expect(second.proof?.proofDigest).toBe(first.proof?.proofDigest);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("the distinct-type law: the proof object is NEVER a RoutePlan — the structural marker-field scan passes clean", () => {
    const compilation = compileAssumedElementBridge(proofInput());
    expect(() => assertHypothesisIsNotARoutePlan(compilation.proof)).not.toThrow();
    expect(() => assertHypothesisIsNotARoutePlan(compilation)).not.toThrow();
    expect(compilation.proof?.proofKind).toBe("ASSUMED_ELEMENT_BRIDGE_PROOF");
  });

  it("fail-closed on malformed inputs: a non-view, a non-query and malformed blockers are the typed error", () => {
    expect(() => compileAssumedElementBridge({ ...proofInput(), view: { variantId: "" } as never })).toThrow(BridgeProofError);
    expect(() => compileAssumedElementBridge({ ...proofInput(), corridorQuery: {} as never })).toThrow(BridgeProofError);
    expect(() =>
      compileAssumedElementBridge({
        ...proofInput(),
        blockers: [{ side: "SENDER", routeId: "", code: "SOURCE_COUNTRY_NOT_SERVED", message: "m" } as never],
      }),
    ).toThrow(BridgeProofError);
    expect(() => compileAssumedElementBridge({ ...proofInput(), blockers: "nope" as never })).toThrow(BridgeProofError);
  });
});
