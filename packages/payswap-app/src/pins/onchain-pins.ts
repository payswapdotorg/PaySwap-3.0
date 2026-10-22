/**
 * @payswap/app — STRUCTURAL PINS of the accepted @payswap/onchain-*
 * vocabulary (P12 Lane C).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml, the established pins pattern — see
 * ./surface-pins.ts + ./provider-runtime-pins.ts): the substrate mounts
 * (@zcode/web, @zcode/desktop) depend on @zcode/* workspace packages
 * ONLY and never import @payswap/*. The onchain vocabulary this product
 * renders as clearly-labeled REFERENCE is therefore pinned STRUCTURALLY
 * here (same literals, same order) from:
 *
 * - packages/onchain-domain/src/family.ts — CHAIN_FAMILIES, address /
 *   finality / reorg models;
 * - packages/onchain-domain/src/operations.ts — ONCHAIN_OPERATION_KINDS;
 * - packages/onchain-domain/src/execution-observation.ts —
 *   ONCHAIN_EXECUTION_OUTCOMES, ONCHAIN_FAILURE_CLASSES;
 * - packages/onchain-domain/src/wallet.ts — WALLET_CUSTODY_MODELS;
 * - packages/onchain-domain/src/onchain-capabilities.ts —
 *   ONCHAIN_CAPABILITY_KINDS;
 * - packages/onchain-domain/src/asset-observation.ts —
 *   ONCHAIN_OBSERVER_KINDS;
 * - packages/onchain-adapters/src/environment.ts —
 *   RAIL_ENVIRONMENT_CLASSES, CHAIN_ENVIRONMENT_REGISTRY;
 * - packages/onchain-adapters/src/semantics.ts — the per-family fee
 *   models;
 * - packages/onchain-security/src/simulation.ts — SimulationStatus.
 *
 * PRODUCT LAW (C3, honest evidence only): these pins are CATALOGUE and
 * VOCABULARY data — a chain registry entry is never a wallet connection,
 * a custody-model word is never a connected signer, and a synthetic venue
 * pack is never a live venue. The mirror is verified against the sources
 * by test/payswap/onchain-pins-mirror.test.ts.
 */

/* ====================================================================
 * onchain-domain family.ts pins
 * ==================================================================== */

/** The declared chain families — same literals, same order. */
export const CHAIN_FAMILIES_PIN = [
  "EVM",
  "SOLANA",
  "UTXO",
  "MOVE",
  "COSMOS",
  "SUBSTRATE",
  "OTHER",
] as const;

export type ChainFamilyPin = (typeof CHAIN_FAMILIES_PIN)[number];

/** Neutral finality models a chain family may declare. */
export const CHAIN_FINALITY_MODELS_PIN = [
  "PROBABILISTIC",
  "DETERMINISTIC",
  "INSTANT",
  "HYBRID",
] as const;

export type ChainFinalityModelPin = (typeof CHAIN_FINALITY_MODELS_PIN)[number];

/** Neutral reorg risk classification. */
export const CHAIN_REORG_RISK_PIN = ["NONE", "PRESENT"] as const;

export type ChainReorgRiskPin = (typeof CHAIN_REORG_RISK_PIN)[number];

/* ====================================================================
 * onchain-domain operations.ts pins
 * ==================================================================== */

/** The consequential-write operation vocabulary — same literals, same order. */
export const ONCHAIN_OPERATION_KINDS_PIN = [
  "onchain.transfer",
  "onchain.approval",
  "onchain.contract_call",
  "onchain.swap",
  "onchain.bridge",
  "onchain.intent",
] as const;

export type OnchainOperationKindPin = (typeof ONCHAIN_OPERATION_KINDS_PIN)[number];

/* ====================================================================
 * onchain-domain execution-observation.ts pins
 * ==================================================================== */

/**
 * The onchain execution observation outcomes — same literals, same order.
 * BROADCAST is not finality; OUTCOME_UNKNOWN never becomes FAILED or
 * success (INV-4).
 */
export const ONCHAIN_EXECUTION_OUTCOMES_PIN = [
  "BROADCAST",
  "CONFIRMED",
  "FAILED",
  "OUTCOME_UNKNOWN",
] as const;

export type OnchainExecutionOutcomePin = (typeof ONCHAIN_EXECUTION_OUTCOMES_PIN)[number];

/** The definitive failure classes — same literals, same order. */
export const ONCHAIN_FAILURE_CLASSES_PIN = [
  "REJECTED",
  "REVERTED",
  "INSUFFICIENT_FUNDS",
  "EXPIRED",
  "POLICY_BLOCKED",
  "SECURITY_BLOCKED",
  "PROVIDER_DEFINED",
] as const;

export type OnchainFailureClassPin = (typeof ONCHAIN_FAILURE_CLASSES_PIN)[number];

/** Deterministic retry guidance for definitive failures. */
export const ONCHAIN_RETRY_GUIDANCE_PIN = [
  "SAFE_TO_RETRY",
  "REQUIRES_RECONCILIATION",
  "NOT_RETRYABLE",
] as const;

export type OnchainRetryGuidancePin = (typeof ONCHAIN_RETRY_GUIDANCE_PIN)[number];

/* ====================================================================
 * onchain-domain wallet.ts pins
 * ==================================================================== */

/** The wallet custody models — same literals, same order. */
export const WALLET_CUSTODY_MODELS_PIN = [
  "NON_CUSTODIAL_EXTERNAL",
  "SELF_CUSTODIAL",
  "SMART_ACCOUNT",
  "CUSTODIAL_PROVIDER",
  "HARDWARE",
  "HYBRID",
] as const;

export type WalletCustodyModelPin = (typeof WALLET_CUSTODY_MODELS_PIN)[number];

/* ====================================================================
 * onchain-domain onchain-capabilities.ts pins
 * ==================================================================== */

/** The onchain capability flavor discriminants — same literals, same order. */
export const ONCHAIN_CAPABILITY_KINDS_PIN = [
  "wallet",
  "signer",
  "smart_account",
  "onchain_execution",
  "contract_interaction",
  "dex",
  "bridge",
  "intent",
] as const;

export type OnchainCapabilityKindPin = (typeof ONCHAIN_CAPABILITY_KINDS_PIN)[number];

/* ====================================================================
 * onchain-domain asset-observation.ts pins
 * ==================================================================== */

/** Who can observe an external onchain position — same literals, same order. */
export const ONCHAIN_OBSERVER_KINDS_PIN = [
  "CHAIN_NODE",
  "INDEXER",
  "RPC_PROVIDER",
  "WALLET_PROVIDER",
  "OPERATOR",
  "OTHER",
] as const;

export type OnchainObserverKindPin = (typeof ONCHAIN_OBSERVER_KINDS_PIN)[number];

/* ====================================================================
 * onchain-adapters environment.ts pins
 * ==================================================================== */

/** The structural rail environment classes — same literals, same order. */
export const RAIL_ENVIRONMENT_CLASSES_PIN = [
  "PRODUCTION",
  "TESTNET",
  "REGTEST",
  "SIMULATION",
] as const;

export type RailEnvironmentClassPin = (typeof RAIL_ENVIRONMENT_CLASSES_PIN)[number];

/**
 * The frozen chain-environment registry, mirrored entry-for-entry (same
 * chainKeys, same classes): chain identity IS the environment — a testnet
 * chain can never carry a PRODUCTION token (structural, fail-closed).
 */
export const CHAIN_ENVIRONMENT_REGISTRY_PIN: Readonly<
  Record<string, RailEnvironmentClassPin>
> = Object.freeze({
  // EVM family
  "ethereum:mainnet": "PRODUCTION",
  "ethereum:sepolia": "TESTNET",
  "ethereum:holesky": "TESTNET",
  // SOLANA family
  "solana:mainnet-beta": "PRODUCTION",
  "solana:devnet": "TESTNET",
  "solana:testnet": "TESTNET",
  // UTXO family (Bitcoin)
  "bitcoin:mainnet": "PRODUCTION",
  "bitcoin:testnet": "TESTNET",
  "bitcoin:signet": "TESTNET",
  "bitcoin:regtest": "REGTEST",
});

/* ====================================================================
 * onchain-adapters semantics.ts pins (the per-family fee models)
 * ==================================================================== */

/**
 * The declared per-family fee models (GAS_AUCTION = EIP-1559
 * baseFee+priority on EVM; SIGNATURE_FEE on Solana; SATOSHI_PER_VBYTE on
 * UTXO). Fee AMOUNTS are computed downstream from observations — the
 * models are declared semantics, never a quote.
 */
export const ONCHAIN_FEE_MODELS_PIN = [
  "GAS_AUCTION",
  "SIGNATURE_FEE",
  "SATOSHI_PER_VBYTE",
] as const;

export type OnchainFeeModelPin = (typeof ONCHAIN_FEE_MODELS_PIN)[number];

/* ====================================================================
 * onchain-security simulation.ts pins
 * ==================================================================== */

/**
 * Simulation observation statuses — same literals, same order. An
 * inconclusive simulation is OUTCOME_UNKNOWN: never silently converted
 * into BLOCK or ALLOW (INV-4/INV-11).
 */
export const SIMULATION_STATUSES_PIN = [
  "SUCCEEDED",
  "REVERTED",
  "FAILED",
  "OUTCOME_UNKNOWN",
] as const;

export type SimulationStatusPin = (typeof SIMULATION_STATUSES_PIN)[number];

/* ====================================================================
 * onchain-extensions packs pins (the synthetic venue catalogue)
 * ==================================================================== */

/** One synthetic venue pack declaration (model deployment — never live). */
export interface SyntheticVenuePackPin {
  /** The pack's protocol key (same literal as the source module). */
  readonly protocolKey: string;
  /** The venue family this pack models. */
  readonly family: "dex" | "aggregator" | "intent" | "bridge" | "off-ramp" | "lending" | "liquidity";
  /** The chain the synthetic deployment is declared on. */
  readonly chainKey: string;
}

/**
 * The onchain-extension venue packs — every one a SYNTHETIC MODEL
 * DEPLOYMENT (a venue-STYLE declarative shape, "no claim about any
 * specific real venue" per the pack headers). Pinned structurally; the
 * surface renders them AS synthetic, never as live venues.
 */
export const SYNTHETIC_VENUE_PACKS_PIN: readonly SyntheticVenuePackPin[] = [
  { protocolKey: "uniswap-v2", family: "dex", chainKey: "ethereum:mainnet" },
  { protocolKey: "zeroswap-aggregator", family: "aggregator", chainKey: "ethereum:mainnet" },
  { protocolKey: "solverbatch-intents", family: "intent", chainKey: "ethereum:mainnet" },
  { protocolKey: "lockport-bridge", family: "bridge", chainKey: "ethereum:mainnet" },
  { protocolKey: "coinramp-offramp", family: "off-ramp", chainKey: "ethereum:mainnet" },
  { protocolKey: "meridian-lending", family: "lending", chainKey: "ethereum:mainnet" },
  { protocolKey: "tidalpools-liquidity", family: "liquidity", chainKey: "ethereum:mainnet" },
];
