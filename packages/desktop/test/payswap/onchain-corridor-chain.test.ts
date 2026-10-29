/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D5/D8) — the CORRIDOR CHAIN
 * battery: the onchain rail's four-layer derivation + the bridge's
 * honest fold growths + the merchant KES receiving entry.
 *
 * Machine-checks the laws over the REAL derivation modules + the REAL
 * channel member (the fixtures build the planes directly — statuses +
 * probe evidence):
 *
 * - THE ONCHAIN CHAIN DERIVATION: an ACTIVE stellar:testnet connection
 *   whose latest account-read evidence is CONFIRMED with positions
 *   derives the four-layer relay chain (the definition's own catalogue —
 *   NEVER the PSP registry; the implementation claims ONLY the observed
 *   currencies + issuer-scoped assets; the instance's credential scope
 *   carries the OPAQUE connection ref + the STELLAR_KEYPAIR kind; the
 *   observation's two-axis law). No evidence / not ACTIVE / not
 *   CONFIRMED ⇒ NO chain (the honest-empty law).
 * - THE PSP SEPARATION: the rail chain's provider ref never joins the
 *   PSP triple; the bridge loop never derives it (disjoint by
 *   construction — the channel composes BOTH derivations).
 * - THE PAYSTACK FOLD GROWTHS: the funding fold derives a LOCATION per
 *   transaction-observed currency (never a balance claim); the
 *   destination fold maps the KES merchant entry onto the paystack
 *   connection rail (the connection ref — the honest ref when the read
 *   surface carries no account id).
 */

import { describe, expect, it } from "vitest";

import {
  onchainsFromPlanes,
  stellarRailCapabilityDefinition,
} from "../../src/host/payswap/connections/onchain-chain-derivation.js";
import { deriveConnectionCapabilityBridge } from "../../src/host/payswap/connections/capability-bridge.js";
import {
  listMerchantDirectoryEntries,
  findMerchantDirectoryEntry,
} from "../../src/host/payswap/payments/merchant-directory.js";
import { PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD, PINNED_STELLAR_CHAIN_KEY } from "../../src/host/payswap/connections/onchain-rail-pins.js";
import { PAYSWAP_PROBE_PROVIDER_IDS } from "../../src/host/payswap/connections/probe-contracts.js";
import type { DesktopConnectionStatusView } from "../../src/host/payswap/connections/contracts.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";

const FAKE_G_ISSUER = "G" + "EFGHIJKLMNOPQRSTUVWXYZABC234567".repeat(2).slice(0, 55);

function status(overrides: Partial<DesktopConnectionStatusView> = {}): DesktopConnectionStatusView {
  return {
    connectionId: "conn:stellar-relay",
    providerId: PINNED_STELLAR_CHAIN_KEY,
    useCaseRef: "testnet-keypair-wallet",
    form: "PROVIDERLESS_RAIL",
    credentialKind: "PROVIDER_DEFINED",
    executionMode: "SANDBOX",
    state: "ACTIVE",
    credentialHandleRef: "payswap-cred:conn:stellar-relay",
    createdAt: "2026-10-29T12:00:00Z",
    lastTransitionAt: "2026-10-29T12:05:00Z",
    transitionHistory: [],
    ...overrides,
  };
}

function stellarEvidence(overrides: Partial<ProbeEvidenceRecord> = {}): ProbeEvidenceRecord {
  return {
    connectionId: "conn:stellar-relay",
    providerId: PINNED_STELLAR_CHAIN_KEY,
    probedOperation: "stellar.account.read",
    outcome: "CONFIRMED",
    providerReferences: [`stellar:testnet/asset:USDC:${FAKE_G_ISSUER}`],
    accountRef: null,
    providerLiveMode: null,
    keyClass: "READ_ONLY_TEST",
    balanceCurrencies: ["XLM", "USDC"],
    assetPositions: [`stellar:testnet/asset:USDC:${FAKE_G_ISSUER}`],
    transportId: "stellar-horizon-https",
    executionMode: "SANDBOX",
    observedAt: "2026-10-29T12:05:00Z",
    evidenceTier: "PROVIDER_OBSERVATION",
    observationVersion: 1,
    ...overrides,
  };
}

function paystackEvidence(overrides: Partial<ProbeEvidenceRecord> = {}): ProbeEvidenceRecord {
  return {
    connectionId: "conn:paystack-kes",
    providerId: "paystack",
    probedOperation: "paystack.transactions.read",
    outcome: "CONFIRMED",
    providerReferences: ["txn_1001"],
    accountRef: null,
    providerLiveMode: null,
    keyClass: "READ_ONLY_TEST",
    balanceCurrencies: ["KES"],
    transportId: "paystack-https",
    executionMode: "SANDBOX",
    observedAt: "2026-10-29T12:05:00Z",
    evidenceTier: "PROVIDER_OBSERVATION",
    observationVersion: 1,
    ...overrides,
  };
}

function paystackStatus(overrides: Partial<DesktopConnectionStatusView> = {}): DesktopConnectionStatusView {
  return status({
    connectionId: "conn:paystack-kes",
    providerId: "paystack",
    useCaseRef: "own-store-test-mode",
    form: "SCOPED_API_CREDENTIAL",
    credentialKind: "API_KEY",
    ...overrides,
  });
}

describe("the onchain rail chain derivation (D2/D5 — the four-layer law)", () => {
  it("an ACTIVE stellar:testnet connection with CONFIRMED account-read evidence derives the relay chain", () => {
    const chains = onchainsFromPlanes({
      statuses: [status()],
      evidence: [stellarEvidence()],
    });
    expect(chains).toHaveLength(1);
    const chain = chains[0]!;
    // Layer 1: the definition — its OWN catalogue, never the PSP registry.
    expect(chain.definition.id).toBe(`capability:onchain-rail:${PINNED_STELLAR_CHAIN_KEY}`);
    expect(chain.definition.executable).toBe(true);
    expect(stellarRailCapabilityDefinition().id).not.toContain("connected-account");
    // Layer 2: the implementation — ONLY the observed currencies + assets.
    expect(chain.implementation.providerName).toBe(PINNED_STELLAR_CHAIN_KEY);
    expect(chain.implementation.adapterRef).toBe("adapter:stellar/horizon@1");
    expect(chain.implementation.corridors[0]?.currencies).toContain("USDC");
    // Layer 3: the instance — the OPAQUE connection ref + the keypair kind.
    expect(chain.instance.connectionRef).toBe("conn:stellar-relay");
    expect(chain.instance.credentialScope.credentialRef).toBe("conn:stellar-relay");
    expect(chain.instance.credentialScope.credentialKind).toBe("STELLAR_KEYPAIR");
    expect(chain.instance.providerId).toBe(PINNED_STELLAR_CHAIN_KEY);
    // Layer 4: the observation — the two-axis law (CONFIRMED ⇒ AVAILABLE).
    expect(chain.observation.availability).toBe("AVAILABLE");
    expect(chain.observation.sourceAvailability).toBe("REACHABLE");
    expect(chain.observation.provenance.providerName).toBe(PINNED_STELLAR_CHAIN_KEY);
  });

  it("the honest-empty law: not ACTIVE, no evidence, or a non-CONFIRMED read derives NO chain", () => {
    expect(onchainsFromPlanes({ statuses: [status({ state: "PENDING_VERIFICATION" })], evidence: [stellarEvidence()] })).toHaveLength(0);
    expect(onchainsFromPlanes({ statuses: [status()], evidence: [] })).toHaveLength(0);
    expect(onchainsFromPlanes({ statuses: [status()], evidence: [stellarEvidence({ outcome: "UNKNOWN" })] })).toHaveLength(0);
    // The PSP records never feed the onchain derivation.
    expect(onchainsFromPlanes({ statuses: [status()], evidence: [paystackEvidence()] })).toHaveLength(0);
  });

  it("the PSP separation: the rail's provider ref never joins the PSP triple; the bridge loop never derives it", () => {
    expect(PAYSWAP_PROBE_PROVIDER_IDS).toEqual(["stripe", "flutterwave", "paystack"]);
    const bridge = deriveConnectionCapabilityBridge({
      statuses: [status(), paystackStatus()],
      evidence: [stellarEvidence(), paystackEvidence()],
    });
    // The bridge's own loop SKIPS the rail (the ADR-0008 D5 skip stays).
    expect(bridge.instances.every((instance) => instance.providerId !== PINNED_STELLAR_CHAIN_KEY)).toBe(true);
    // The bridge DOES derive the paystack instance (the PSP fold).
    expect(bridge.instances.some((instance) => instance.connectionRef === "conn:paystack-kes")).toBe(true);
  });
});

describe("the bridge's corridor fold growths (D8 — honest about what the probe derives)", () => {
  it("the Paystack funding fold: a LOCATION per transaction-observed currency (never a balance claim)", () => {
    const bridge = deriveConnectionCapabilityBridge({
      statuses: [paystackStatus()],
      evidence: [paystackEvidence()],
    });
    const funding = bridge.fundingSources.find(
      (source) => source.locationRef === "conn:paystack-kes:transactions:KES",
    );
    expect(funding).toBeDefined();
    expect(funding?.currency).toBe("KES");
    expect(funding?.displayName).toContain("transaction-observed");
    expect(funding?.observationRef).toBe("probe:conn:paystack-kes:KES");
  });

  it("the destination fold: the KES merchant entry maps onto the paystack connection rail (the honest ref)", () => {
    const bridge = deriveConnectionCapabilityBridge({
      statuses: [paystackStatus()],
      evidence: [paystackEvidence()],
    });
    const destination = bridge.destinations.find(
      (entry) => entry.observationRef === "merchant-directory:merchant:kes-paystack-test",
    );
    expect(destination).toBeDefined();
    expect(destination?.currency).toBe("KES");
    // The rail-ref law: the Paystack read surface carries no account id —
    // the honest ref is the provider-scoped connection account
    // (`paystack:account:<connectionId>`), never a fabricated account.
    expect(destination?.locationRef).toBe("merchant:kes-paystack-test@paystack:account:conn:paystack-kes");
    expect(destination?.displayName).toContain("Paystack KES");
    // The Stripe destination fold stays byte-identical (the account-ref law).
    expect(
      bridge.destinations.some((entry) => entry.observationRef === "merchant-directory:merchant:stripe-only-test"),
    ).toBe(false); // no ACTIVE stripe instance in this world — the fold skips honestly
  });

  it("the merchant directory: the KES entry carries the pinned payout method (the C-lane pin, mirrored by value)", () => {
    const entry = findMerchantDirectoryEntry("Merchant Y (Paystack KES bank-transfer test)");
    expect(entry).not.toBeNull();
    expect(entry?.receivingContext.providerId).toBe("paystack");
    expect(entry?.receivingContext.receivingCurrency).toBe("KES");
    expect(entry?.receivingContext.payoutMethod).toBe(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD);
    expect(listMerchantDirectoryEntries()).toHaveLength(2);
  });
});
