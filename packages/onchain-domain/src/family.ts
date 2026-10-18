/**
 * @payswap/onchain-domain — chain family vocabulary (P4-W1, lane R2-W1;
 * PORT of payswap.org@8a735bf packages/onchain-domain/src/family.ts).
 *
 * A chain family is a peer settlement-rail family classification (INV-17:
 * blockchain is ONE settlement rail family — chains, wallets, signers,
 * smart accounts, DEXs, bridges, intent networks, smart-contract
 * protocols — never a parallel financial system). Family classification is
 * provider-neutral and chain-agnostic: it exists so non-EVM family
 * semantics are first-class, never an afterthought bolted onto an
 * EVM-shaped core (INV-16: provider implementations never leak into
 * provider-neutral domain contracts).
 *
 * Family-specific SHAPES (family address encodings, execution-cost
 * parameters, token standards…) never appear here or in any other neutral
 * contract of this package — they live exclusively in the OPTIONAL
 * family-scoped extension contracts (./family-extensions.ts) which are
 * additive and never required by the core (adversarially guarded by
 * test/adversarial.test.ts).
 */

import { ValidationError } from "./errors.ts";

/**
 * The declared chain families. `OTHER` requires a declared family label on
 * every chain descriptor (an undeclared family is never assumed).
 */
export const CHAIN_FAMILIES = [
  "EVM",
  "SOLANA",
  "UTXO",
  "MOVE",
  "COSMOS",
  "SUBSTRATE",
  "OTHER",
] as const;

export type ChainFamily = (typeof CHAIN_FAMILIES)[number];

/** Neutral account/holding model of a chain family. */
export type ChainAddressModel =
  | "ACCOUNT_BASED"
  | "UTXO_BASED"
  | "OBJECT_BASED"
  | "OTHER";

/** Neutral finality model of a chain family (guidance default only). */
export type ChainFinalityModel =
  | "PROBABILISTIC"
  | "DETERMINISTIC"
  | "INSTANT"
  | "HYBRID";

/** Neutral reorg/reorganization risk classification. */
export type ChainReorgRisk = "NONE" | "PRESENT";

/**
 * Deterministic family semantics: the neutral guidance defaults a family
 * carries. These defaults are DESCRIPTIVE ONLY — every ChainDefinition
 * declares its own finality semantics and that declaration always governs
 * (see ./chain.ts). No family default is execution authority.
 */
export interface ChainFamilySemantics {
  readonly family: ChainFamily;
  readonly addressModel: ChainAddressModel;
  readonly finalityModel: ChainFinalityModel;
  readonly reorgRisk: ChainReorgRisk;
}

/**
 * The frozen family guidance-default table. Deterministic and total: every
 * declared family has exactly one entry.
 * - EVM: account-based, probabilistic finality, reorgs possible;
 * - SOLANA: account-based, probabilistic-to-committed slots, forks possible
 *   before final commitment;
 * - UTXO: UTXO-based, probabilistic finality, reorgs possible;
 * - MOVE: object-based, BFT-style deterministic finality;
 * - COSMOS: account-based, BFT-style deterministic finality;
 * - SUBSTRATE: account-based, hybrid finality gadget, reorgs possible
 *   before finality;
 * - OTHER: conservative default — hybrid model with reorg risk PRESENT.
 */
export const CHAIN_FAMILY_SEMANTICS: Readonly<
  Record<ChainFamily, ChainFamilySemantics>
> = Object.freeze({
  EVM: Object.freeze({
    family: "EVM",
    addressModel: "ACCOUNT_BASED",
    finalityModel: "PROBABILISTIC",
    reorgRisk: "PRESENT",
  }),
  SOLANA: Object.freeze({
    family: "SOLANA",
    addressModel: "ACCOUNT_BASED",
    finalityModel: "PROBABILISTIC",
    reorgRisk: "PRESENT",
  }),
  UTXO: Object.freeze({
    family: "UTXO",
    addressModel: "UTXO_BASED",
    finalityModel: "PROBABILISTIC",
    reorgRisk: "PRESENT",
  }),
  MOVE: Object.freeze({
    family: "MOVE",
    addressModel: "OBJECT_BASED",
    finalityModel: "DETERMINISTIC",
    reorgRisk: "NONE",
  }),
  COSMOS: Object.freeze({
    family: "COSMOS",
    addressModel: "ACCOUNT_BASED",
    finalityModel: "DETERMINISTIC",
    reorgRisk: "NONE",
  }),
  SUBSTRATE: Object.freeze({
    family: "SUBSTRATE",
    addressModel: "ACCOUNT_BASED",
    finalityModel: "HYBRID",
    reorgRisk: "PRESENT",
  }),
  OTHER: Object.freeze({
    family: "OTHER",
    addressModel: "OTHER",
    finalityModel: "HYBRID",
    reorgRisk: "PRESENT",
  }),
});

/**
 * Canonical chain key format: `${namespace}:${network}` (both lowercase
 * alphanumeric-with-hyphens), e.g. `ethereum:mainnet`, `solana:mainnet-beta`,
 * `bitcoin:mainnet`. The chain key is the NEUTRAL chain identity used by
 * every onchain-domain contract; family-specific numeric identities live in
 * the optional family extensions.
 */
export const CHAIN_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Vocabulary guards + deterministic dispatch (implementation)
// ---------------------------------------------------------------------------

/** Guard: a declared chain family (an undeclared family is never assumed). */
export function isChainFamily(value: unknown): value is ChainFamily {
  return (
    typeof value === "string" &&
    (CHAIN_FAMILIES as readonly unknown[]).includes(value)
  );
}

/**
 * Deterministic family dispatch (total: every declared family has exactly
 * one entry in the frozen guidance-default table).
 */
export function chainFamilySemantics(family: ChainFamily): ChainFamilySemantics {
  const semantics = CHAIN_FAMILY_SEMANTICS[family];
  if (semantics === undefined) {
    throw new ValidationError(
      `no declared semantics for chain family '${family}' — undeclared families never validate`,
    );
  }
  return semantics;
}

/**
 * Deterministic finality consistency rule shared by the chain validator:
 * a probabilistic or hybrid finality model implies reorg risk PRESENT; a
 * deterministic or instant model implies NONE. A declaration that violates
 * the coupling is rejected — reorg risk is never assumed away.
 */
export function finalityReorgConsistency(
  finalityModel: ChainFinalityModel,
  reorgRisk: ChainReorgRisk,
): boolean {
  switch (finalityModel) {
    case "PROBABILISTIC":
    case "HYBRID":
      return reorgRisk === "PRESENT";
    case "DETERMINISTIC":
    case "INSTANT":
      return reorgRisk === "NONE";
  }
}

/** Guard: a canonical `${namespace}:${network}` chain key. */
export function isValidChainKey(value: unknown): value is string {
  return typeof value === "string" && CHAIN_KEY_PATTERN.test(value);
}
