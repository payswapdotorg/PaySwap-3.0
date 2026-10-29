/**
 * @payswap/app — the ONCHAIN PINS mirror verification (P12 Lane C, NET-NEW).
 *
 * The substrate layer law keeps this package free of @payswap/* imports
 * in src/**, so the onchain vocabulary the connections area renders is
 * pinned STRUCTURALLY (src/pins/onchain-pins.ts). THIS test imports the
 * accepted onchain source packages' src DIRECTLY (test-only — the same
 * established pattern as pin-mirror.test.ts) and asserts the pins match
 * the sources exactly: same literals, same order, same registry entries,
 * same synthetic venue declarations. Drift between a pin and its source
 * fails HERE — detectable at test time, never discovered in production.
 */
import { describe, expect, it } from "vitest";
import { CHAIN_FAMILIES } from "../../../onchain-domain/src/family.ts";
import { ONCHAIN_OPERATION_KINDS } from "../../../onchain-domain/src/operations.ts";
import {
  ONCHAIN_EXECUTION_OUTCOMES,
  ONCHAIN_FAILURE_CLASSES,
} from "../../../onchain-domain/src/execution-observation.ts";
import { WALLET_CUSTODY_MODELS } from "../../../onchain-domain/src/wallet.ts";
import { ONCHAIN_CAPABILITY_KINDS } from "../../../onchain-domain/src/onchain-capabilities.ts";
import { ONCHAIN_OBSERVER_KINDS } from "../../../onchain-domain/src/asset-observation.ts";
import {
  CHAIN_ENVIRONMENT_REGISTRY,
  RAIL_ENVIRONMENT_CLASSES,
} from "../../../onchain-adapters/src/environment.ts";
import { UNISWAP_V2_PROTOCOL_KEY, UNISWAP_V2_CHAIN_KEY } from "../../../onchain-extensions/src/packs/uniswap-v2.ts";
import { AGGREGATOR_PROTOCOL_KEY } from "../../../onchain-extensions/src/packs/zeroswap-aggregator.ts";
import { INTENTS_PROTOCOL_KEY } from "../../../onchain-extensions/src/packs/solverbatch-intents.ts";
import { LOCKPORT_PROTOCOL_KEY } from "../../../onchain-extensions/src/packs/lockport-bridge.ts";
import { COINRAMP_PROTOCOL_KEY } from "../../../onchain-extensions/src/packs/coinramp-offramp.ts";
import { MERIDIAN_PROTOCOL_KEY } from "../../../onchain-extensions/src/packs/meridian-lending.ts";
import { TIDALPOOLS_PROTOCOL_KEY } from "../../../onchain-extensions/src/packs/tidalpools-liquidity.ts";

import {
  CHAIN_ENVIRONMENT_REGISTRY_PIN,
  CHAIN_FAMILIES_PIN,
  ONCHAIN_CAPABILITY_KINDS_PIN,
  ONCHAIN_EXECUTION_OUTCOMES_PIN,
  ONCHAIN_FAILURE_CLASSES_PIN,
  ONCHAIN_OBSERVER_KINDS_PIN,
  ONCHAIN_OPERATION_KINDS_PIN,
  RAIL_ENVIRONMENT_CLASSES_PIN,
  SYNTHETIC_VENUE_PACKS_PIN,
  WALLET_CUSTODY_MODELS_PIN,
} from "../../src/pins/onchain-pins.js";
import { foldOnchainRail, ONCHAIN_UNAVAILABLE_REASONS } from "../../src/lib/onchain-rail.js";

describe("the onchain pins mirror the accepted onchain source packages", () => {
  it("chain families, environments and the frozen chain registry match field-for-field", () => {
    expect(CHAIN_FAMILIES_PIN).toEqual(CHAIN_FAMILIES);
    expect(RAIL_ENVIRONMENT_CLASSES_PIN).toEqual(RAIL_ENVIRONMENT_CLASSES);
    expect(CHAIN_ENVIRONMENT_REGISTRY_PIN).toEqual(CHAIN_ENVIRONMENT_REGISTRY);
  });

  it("the domain vocabularies match (operations, outcomes, failures, custody, capability kinds, observers)", () => {
    expect(ONCHAIN_OPERATION_KINDS_PIN).toEqual(ONCHAIN_OPERATION_KINDS);
    expect(ONCHAIN_EXECUTION_OUTCOMES_PIN).toEqual(ONCHAIN_EXECUTION_OUTCOMES);
    expect(ONCHAIN_FAILURE_CLASSES_PIN).toEqual(ONCHAIN_FAILURE_CLASSES);
    expect(WALLET_CUSTODY_MODELS_PIN).toEqual(WALLET_CUSTODY_MODELS);
    expect(ONCHAIN_CAPABILITY_KINDS_PIN).toEqual(ONCHAIN_CAPABILITY_KINDS);
    expect(ONCHAIN_OBSERVER_KINDS_PIN).toEqual(ONCHAIN_OBSERVER_KINDS);
  });

  it("the synthetic venue pack keys match the extension sources (all declared synthetic)", () => {
    const pinnedKeys = SYNTHETIC_VENUE_PACKS_PIN.map((pack) => pack.protocolKey);
    expect(pinnedKeys).toEqual([
      UNISWAP_V2_PROTOCOL_KEY,
      AGGREGATOR_PROTOCOL_KEY,
      INTENTS_PROTOCOL_KEY,
      LOCKPORT_PROTOCOL_KEY,
      COINRAMP_PROTOCOL_KEY,
      MERIDIAN_PROTOCOL_KEY,
      TIDALPOOLS_PROTOCOL_KEY,
    ]);
    for (const pack of SYNTHETIC_VENUE_PACKS_PIN) {
      expect(pack.chainKey).toBe(UNISWAP_V2_CHAIN_KEY);
    }
  });
});

describe("the onchain rail fold is honest by construction (C3 laws)", () => {
  const rail = foldOnchainRail();

  it("every chain catalogue row classifies through the frozen registry (identity IS the environment)", () => {
    expect(rail.chains.length).toBe(Object.keys(CHAIN_ENVIRONMENT_REGISTRY).length);
    for (const chain of rail.chains) {
      expect(CHAIN_ENVIRONMENT_REGISTRY[chain.chainKey]).toBe(chain.environmentClass);
    }
    // The production/testnet split is visible and truthful. DISCLOSED
    // RE-PIN (P22-A merge, ADR-0016 D2): the TESTNET count grew 6 -> 7
    // (stellar:testnet — the corridor wave's one registry entry).
    expect(rail.chains.filter((chain) => chain.environmentClass === "PRODUCTION").length).toBe(3);
    expect(rail.chains.filter((chain) => chain.environmentClass === "TESTNET").length).toBe(7);
    expect(rail.chains.filter((chain) => chain.environmentClass === "REGTEST").length).toBe(1);
  });

  it("the capability checklist carries the full C3 set with honest states", () => {
    const ids = rail.capabilities.map((row) => row.id);
    expect(ids).toEqual([
      "wallet-connection",
      "network-context",
      "balances",
      "transaction-preview",
      "fee-provenance",
      "scoped-signing",
      "simulation-security",
      "state-vocabulary",
      "history-evidence",
    ]);
    // The UNAVAILABLE rows state their typed reasons (never a stub).
    const unavailable = rail.capabilities.filter((row) => row.state === "UNAVAILABLE");
    expect(unavailable.map((row) => row.id).sort()).toEqual(
      ["network-context", "scoped-signing", "transaction-preview", "wallet-connection"].sort(),
    );
    for (const row of unavailable) {
      expect(row.line.length).toBeGreaterThan(40);
    }
  });

  it("the state vocabulary keeps UNKNOWN distinct (never FAILED, never success)", () => {
    expect(rail.executionOutcomes).toContain("OUTCOME_UNKNOWN");
    expect(rail.executionOutcomes).toContain("BROADCAST");
    // The unavailable reasons name what is missing.
    expect(ONCHAIN_UNAVAILABLE_REASONS.walletConnection).toContain(
      "No wallet connection surface exists in this deployment",
    );
    expect(ONCHAIN_UNAVAILABLE_REASONS.balances).toContain(
      "zero asset observations are recorded",
    );
  });

  it("the venue packs render as synthetic model deployments only", () => {
    for (const venue of rail.venues) {
      expect(venue.protocolKey).toMatch(/^(uniswap-v2|zeroswap-aggregator|solverbatch-intents|lockport-bridge|coinramp-offramp|meridian-lending|tidalpools-liquidity)$/);
    }
  });
});
