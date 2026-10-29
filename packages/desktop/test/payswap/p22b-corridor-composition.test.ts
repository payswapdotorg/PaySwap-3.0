/**
 * PaySwap Desktop (P22-B, ADR-0016) — the corridor composition battery
 * (renderer tier): the ONCHAIN rail-key branch of the chains-derived
 * wait-recheck observations, the Stellar activation members of the
 * connections-activation composition, and the corridor plan presentation
 * projection over a corridor-shaped compiled plan (the REAL leg-law
 * derivation, fail-closed).
 */

import { describe, expect, it } from "vitest";

import { chainDerivedWaitRecheckObservations } from "../../src/renderer/src/waitRecheckComposition.js";
import { composeConnectionsActivationBinding } from "../../src/renderer/src/connectionsActivationComposition.js";
import { corridorPlanPresentationOf } from "../../src/renderer/src/corridorPlanProjection.js";
import type { PaySwapConnectionCapabilityChainDto } from "../../src/renderer/src/consoleConnectionsWire.js";
import { isConnectionsStellarRailPort } from "@payswap/app";

/* ---------------------- the chain DTO fixtures ---------------------- */

function stellarChainDto(): PaySwapConnectionCapabilityChainDto {
  return {
    definition: { id: "capability:onchain-rail:stellar:testnet", version: "1.0.0", executable: true },
    implementation: {
      implementationId: "impl:stellar:horizon:1",
      providerName: "stellar:testnet",
      providerVersion: "1",
      capabilityId: "capability:onchain-rail:stellar:testnet",
      capabilityVersion: "1.0.0",
      version: "1",
      adapterRef: "adapter:stellar/horizon@1",
      corridors: [
        { currencies: ["USDC"], assets: ["stellar:testnet/asset:USDC:GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3"] },
      ],
      knownDeviations: [],
    },
    instance: {
      instanceId: "inst:stellar:1",
      capabilityId: "capability:onchain-rail:stellar:testnet",
      implementationId: "impl:stellar:horizon:1",
      providerName: "stellar:testnet",
      providerVersion: "1",
      accountRef: "conn:stellar:1",
      tenantRef: "tenant:operator",
      authorization: { status: "ACTIVE" },
      credentialScope: { credentialRef: "conn:stellar:1", credentialKind: "STELLAR_KEYPAIR" },
      geography: { countries: [] },
      currencies: ["USDC"],
      permissionState: { granted: [], requested: [], missing: [] },
      eligibility: { eligible: true, reasons: [] },
      configuration: { executionMode: "SANDBOX", chainKey: "stellar:testnet" },
    },
    observation: {
      instanceId: "inst:stellar:1",
      observedAt: "2026-10-29T12:00:00Z",
      observationVersion: 3,
      capabilityState: "AVAILABLE",
      sourceAvailability: "REACHABLE",
      availability: "AVAILABLE",
      eligibility: "ELIGIBLE",
      health: { status: "ok", lastCheckedAt: "2026-10-29T12:00:00Z" },
      provenance: { providerName: "stellar:testnet", source: "PROVIDER_API", capturedAt: "2026-10-29T12:00:00Z" },
    },
  };
}

function stripeChainDto(): PaySwapConnectionCapabilityChainDto {
  return {
    definition: { id: "capability:provider:stripe", version: "1.0.0", executable: true },
    implementation: {
      implementationId: "impl:stripe:1",
      providerName: "Stripe",
      providerVersion: "1",
      capabilityId: "capability:provider:stripe",
      capabilityVersion: "1.0.0",
      version: "1",
      adapterRef: "adapter:stripe@1",
      corridors: [{ currencies: ["USD"] }],
      knownDeviations: [],
    },
    instance: {
      instanceId: "inst:stripe:1",
      capabilityId: "capability:provider:stripe",
      implementationId: "impl:stripe:1",
      providerName: "Stripe",
      providerVersion: "1",
      accountRef: "conn:stripe:1",
      tenantRef: "tenant:operator",
      authorization: { status: "ACTIVE" },
      credentialScope: { credentialRef: "conn:stripe:1", credentialKind: "API_KEY" },
      geography: { countries: [] },
      currencies: ["USD"],
      permissionState: { granted: [], requested: [], missing: [] },
      eligibility: { eligible: true, reasons: [] },
      configuration: {},
    },
    observation: {
      instanceId: "inst:stripe:1",
      observedAt: "2026-10-29T12:00:00Z",
      observationVersion: 2,
      capabilityState: "AVAILABLE",
      sourceAvailability: "REACHABLE",
      availability: "AVAILABLE",
      eligibility: "ELIGIBLE",
      health: { status: "ok", lastCheckedAt: "2026-10-29T12:00:00Z" },
      provenance: { providerName: "Stripe", source: "PROVIDER_API", capturedAt: "2026-10-29T12:00:00Z" },
    },
  };
}

describe("the chains-derived wait-recheck observations — the ONCHAIN rail-key branch (P22-B)", () => {
  it("the stellar:testnet chain derives railKind ONCHAIN + railKey stellar:testnet (the corridor relay rail)", async () => {
    const source = chainDerivedWaitRecheckObservations({
      payswapDesktopService: { connectionCapabilityChains: async () => [stellarChainDto(), stripeChainDto()] },
    });
    const observations = await source();
    const stellar = observations.find((o) => o.rail.railKey === "stellar:testnet");
    expect(stellar).toBeDefined();
    expect(stellar?.rail.railKind).toBe("ONCHAIN");
    expect(stellar?.title).toContain("the stellar:testnet onchain rail (the corridor's relay)");
    // The evidence lineage carries the chain-instance observation ref (the primary).
    expect(stellar?.primaryObservation.observationId).toBe("chain-observation:inst:stellar:1");
    // The PSP chain keeps the FIAT branch untouched.
    const stripe = observations.find((o) => o.rail.railKey === "fiat:stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.rail.railKind).toBe("FIAT");
  });

  it("an INACTIVE stellar chain derives nothing (the ACTIVE gate stays)", async () => {
    const chain = stellarChainDto();
    (chain.instance.authorization as { status: unknown }).status = "PENDING";
    const source = chainDerivedWaitRecheckObservations({
      payswapDesktopService: { connectionCapabilityChains: async () => [chain] },
    });
    expect(await source()).toEqual([]);
  });
});

describe("the connections-activation composition — the Stellar rail members (P22-B)", () => {
  it("the composed plane exposes the keypair submit + the account-read probe behind the pinned extension", async () => {
    const submitted: unknown[] = [];
    const probed: number[] = [];
    const client = {
      connectionStatuses: async () => [],
      connectionSeedSetup: async (input: { providerId: string; useCaseRef: string }) => ({
        kind: "CREATED",
        connectionId: "conn:stellar:9",
        state: "UNCONFIGURED",
        providerId: input.providerId,
        useCaseRef: input.useCaseRef,
      }),
      connectionSubmitStripeRestrictedKey: async () => { throw new Error("not under test"); },
      connectionSubmitFlutterwaveSecretKey: async () => { throw new Error("not under test"); },
      connectionSubmitPaystackSecretKey: async () => { throw new Error("not under test"); },
      connectionRunVerificationProbe: async () => { throw new Error("not under test"); },
      connectionSubmitStellarSecretKey: async (input: { connectionId: string; publicKey: string; secretKey: string }) => {
        submitted.push(input);
        return {
          connectionId: input.connectionId,
          credentialHandleRef: "cred:opaque:1",
          sealedSecretCount: 2,
          nextState: "KEY_SEALED",
        };
      },
      connectionRunStellarAccountReadProbe: async () => {
        probed.push(1);
        return {
          providerRef: "stellar:testnet",
          probedOperation: "stellar.account.read",
          results: [
            {
              connectionId: "conn:stellar:9",
              outcome: "CONFIRMED",
              providerReferences: ["stellar:testnet/asset:USDC:GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3"],
              state: "ACTIVE",
              summary: "the wallet is readable and holds the issuer-scoped USDC",
            },
          ],
          evidenceTier: "PROVIDER_OBSERVATION",
          note: "the Horizon testnet account read",
        };
      },
    };
    const { plane, reset } = composeConnectionsActivationBinding({
      payswapDesktopService: client,
    } as never);
    try {
      // The structural guard passes on the composed plane.
      expect(isConnectionsStellarRailPort(plane)).toBe(true);
      // The keypair submit carries EXACTLY the three caller fields (the one-material law).
      const receipt = await plane.submitStellarSecretKey({
        connectionId: "conn:stellar:9",
        publicKey: "GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3",
        secretKey: "SDX_test_secret_key_shape_for_the_battery_only_000000000",
      });
      expect(receipt.sealedSecretCount).toBe(2);
      expect(submitted).toEqual([
        {
          connectionId: "conn:stellar:9",
          publicKey: "GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3",
          secretKey: "SDX_test_secret_key_shape_for_the_battery_only_000000000",
        },
      ]);
      // The account-read probe maps onto the channel member verbatim.
      const outcome = await plane.runStellarAccountReadProbe();
      expect(outcome.providerRef).toBe("stellar:testnet");
      expect(outcome.probedOperation).toBe("stellar.account.read");
      expect(probed).toEqual([1]);
    } finally {
      reset();
    }
  });
});

describe("the corridor plan presentation projection (the REAL leg-law derivation, fail-closed)", () => {
  it("derives the four-leg presentation from a corridor-shaped compiled plan", () => {
    const plan = corridorPlanFixture();
    const presentation = corridorPlanPresentationOf(plan, {
      sourceCurrency: "GHS",
      destinationCurrency: "KES",
    });
    expect(presentation).toBeDefined();
    if (presentation === undefined) return;
    expect(presentation.shapeId).toBe("cross-provider-corridor");
    expect(presentation.legCount).toBe(4);
    expect(presentation.directionClass).toBe("CONVERT");
    expect(presentation.legs.map((leg) => leg.legKind)).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect(presentation.relayChainKey).toBe("stellar:testnet");
    expect(presentation.relayAssetRef).toBe(
      "stellar:testnet/asset:USDC:GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3",
    );
    expect(presentation.fundingMethod).toBe("flutterwave_ghs_mobile_money");
    expect(presentation.payoutMethod).toBe("paystack_kes_bank_transfer");
    // The custody chain is continuous people language (5 points).
    expect(presentation.custodyChain).toHaveLength(5);
    expect(presentation.custodyChain[4]).toContain("bank");
    // The prerequisites carry the grounding observation refs verbatim.
    expect(presentation.legs[0]?.prerequisites[0]).toContain(
      "grounded by the recorded observation obs:flw:transactions:1 (version 4)",
    );
    // The people labels are the pinned vocabulary.
    expect(presentation.legs[2]?.peopleLabel).toBe(
      "Transfer the stablecoin onchain to the off-ramp's receiving address",
    );
  });

  it("a same-currency corridor presents as MOVE (the direction-class derivation)", () => {
    const presentation = corridorPlanPresentationOf(corridorPlanFixture(), {
      sourceCurrency: "USD",
      destinationCurrency: "USD",
    });
    expect(presentation?.directionClass).toBe("MOVE");
  });

  it("a non-corridor shape yields NO projection (never a fabricated corridor card)", () => {
    const plan = corridorPlanFixture();
    (plan as { shapeId: unknown }).shapeId = "provider-native-offramp";
    expect(
      corridorPlanPresentationOf(plan as never, { sourceCurrency: "GHS", destinationCurrency: "KES" }),
    ).toBeUndefined();
  });

  it("a plan whose legs deviate from the skeleton yields NO projection (the typed law error, fail-closed)", () => {
    const plan = corridorPlanFixture();
    // Break the skeleton: drop the payout leg.
    (plan as { legs: unknown }).legs = plan.legs.slice(0, 3);
    expect(
      corridorPlanPresentationOf(plan as never, { sourceCurrency: "GHS", destinationCurrency: "KES" }),
    ).toBeUndefined();
  });
});

/* ---------------- the corridor plan fixture (compiled-plan shaped) ---------------- */

function corridorPlanFixture() {
  const party = (kind: string, providerName?: string, chainKey?: string, externalRef?: string) => {
    if (providerName !== undefined) return { kind, providerName };
    if (chainKey !== undefined) return { kind, chainKey };
    if (externalRef !== undefined) return { kind, externalRef };
    return { kind, accountRef: "ref-unknown" };
  };
  const grounding = (observationId: string) => ({
    observations: [{ observationKind: "AssetObservation", observationId, observationVersion: 4, fresh: true }],
    groundingFailures: [],
  });
  const issuerG = "GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3";
  const relayAssetRef = `stellar:testnet/asset:USDC:${issuerG}`;
  return {
    planId: "plan:corridor:fixture:1",
    shapeId: "cross-provider-corridor" as const,
    intentRef: "intent:corridor:fixture",
    compositionClass: "MULTI_PROVIDER_CORRIDOR",
    executionMode: "SANDBOX",
    isProviderNativeBaseline: false,
    candidateStatus: "EXECUTABLE_CANDIDATE" as const,
    comparability: { comparable: true as const },
    ineligibilityReasons: [],
    legs: [
      {
        legId: "route-plan:intent:corridor:fixture:cross-provider-corridor:hop0:FIAT_PSP_COLLECT",
        legKind: "FIAT_PSP_COLLECT",
        hopIndex: 0,
        intentRef: "intent:corridor:fixture",
        custody: {
          from: party("EXTERNAL_PROVIDER", "flutterwave"),
          to: party("EXTERNAL_PROVIDER", "flutterwave"),
          assetRef: "GHS",
          amount: { currency: "GHS", minorUnits: "2000000" },
          evidenceRefs: [],
        },
        plannedAmount: { basis: "INTENT_DECLARED" },
        stateGrounding: grounding("obs:flw:transactions:1"),
        assumptions: [],
        evidenceRefs: [],
      },
      {
        legId: "route-plan:intent:corridor:fixture:cross-provider-corridor:hop1:PSP_STABLECOIN_ISSUANCE",
        legKind: "PSP_STABLECOIN_ISSUANCE",
        hopIndex: 1,
        intentRef: "intent:corridor:fixture",
        custody: {
          from: party("EXTERNAL_PROVIDER", "flutterwave"),
          to: party("EXTERNAL_PROVIDER", "stripe"),
          assetRef: "USDC",
          amount: { currency: "USDC", minorUnits: "128000" },
          evidenceRefs: [],
        },
        plannedAmount: { basis: "CONVERSION" },
        stateGrounding: grounding("obs:stripe:issuance:1"),
        assumptions: [],
        evidenceRefs: [],
      },
      {
        legId: "route-plan:intent:corridor:fixture:cross-provider-corridor:hop2:ONCHAIN_TRANSFER",
        legKind: "ONCHAIN_TRANSFER",
        hopIndex: 2,
        intentRef: "intent:corridor:fixture",
        custody: {
          from: party("ONCHAIN_WALLET", undefined, "stellar:testnet"),
          to: party("EXTERNAL_PROVIDER", "paystack"),
          assetRef: relayAssetRef,
          amount: { currency: "USDC", minorUnits: "128000" },
          evidenceRefs: [],
        },
        plannedAmount: { basis: "CONVERSION" },
        stateGrounding: grounding("obs:stellar:relay-position:1"),
        assumptions: [],
        evidenceRefs: [],
      },
      {
        legId: "route-plan:intent:corridor:fixture:cross-provider-corridor:hop3:OFF_RAMP_PAYOUT",
        legKind: "OFF_RAMP_PAYOUT",
        hopIndex: 3,
        intentRef: "intent:corridor:fixture",
        custody: {
          from: party("EXTERNAL_PROVIDER", "paystack"),
          to: party("EXTERNAL_BANK_INSTRUMENT", undefined, undefined, "bank:kes:beneficiary:1"),
          assetRef: "KES",
          amount: { currency: "KES", minorUnits: "168900" },
          evidenceRefs: [],
        },
        plannedAmount: { basis: "CONVERSION" },
        stateGrounding: grounding("obs:paystack:transfers:1"),
        assumptions: [],
        evidenceRefs: [],
      },
    ],
    evidenceRefs: [],
    planDigest: "fnv1a64:cafebabefacedead",
    railCrossings: { crossings: 2, legs: [] },
    environmentClasses: ["SANDBOX"],
  };
}
