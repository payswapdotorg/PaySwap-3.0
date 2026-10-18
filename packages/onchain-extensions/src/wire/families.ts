/**
 * @payswap/onchain-extensions — the pack FAMILY wire shapes (Work Order
 * P5-W2, lane R3-W2). NET-NEW vocabulary per spec/dependency/graph.md P5-W2
 * ("DEX, bridge, off-ramp, liquidity, lending/staking and intent protocol
 * packs"): the old repo modelled DEX (AMM/aggregator) and intent venues
 * only (MMP-23); the bridge, off-ramp, liquidity and lending/staking family
 * surfaces are new in PaySwap 3.0. Every field is DECLARED DATA describing
 * what the venue family offers — no execution, no I/O, no financial
 * authority (the DEX/intent fields ADAPT the old DexCapabilityDeclaration
 * and IntentExecutionCapabilityDeclaration flavor vocabulary).
 */

// ---------------------------------------------------------------------------
// The pack-family vocabulary
// ---------------------------------------------------------------------------

export const PACK_FAMILIES = Object.freeze([
  'dex',
  'bridge',
  'off-ramp',
  'liquidity',
  'lending-staking',
  'intent-protocol',
] as const);
export type PackFamily = (typeof PACK_FAMILIES)[number];

export function isPackFamily(value: unknown): value is PackFamily {
  return typeof value === 'string' && (PACK_FAMILIES as readonly unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// DEX (ADAPT of the old DexCapabilityDeclaration)
// ---------------------------------------------------------------------------

export const DEX_PACK_KINDS = Object.freeze(['AMM', 'ORDER_BOOK', 'RFQ', 'AGGREGATOR'] as const);
export type DexPackKind = (typeof DEX_PACK_KINDS)[number];

export const SWAP_KINDS = Object.freeze(['EXACT_INPUT', 'EXACT_OUTPUT'] as const);
export type SwapKind = (typeof SWAP_KINDS)[number];

export const QUOTE_SEMANTICS = Object.freeze(['INDICATIVE', 'EXECUTABLE'] as const);
export type QuoteSemantics = (typeof QUOTE_SEMANTICS)[number];

export const SLIPPAGE_PROTECTION_MODELS = Object.freeze(['DECLARED_LIMIT', 'PROVIDER_DEFINED'] as const);
export type SlippageProtectionModel = (typeof SLIPPAGE_PROTECTION_MODELS)[number];

export const DEX_FEE_MODELS = Object.freeze([
  'EMBEDDED_POOL_FEE',
  'EXPLICIT_COMPONENT',
  'PROVIDER_SCHEDULE',
  'HYBRID',
] as const);
export type DexFeeModel = (typeof DEX_FEE_MODELS)[number];

export const DEX_AGGREGATOR_SOURCE_KINDS = Object.freeze(['RFQ_MAKER', 'AMM_POOL', 'ONCHAIN_ROUTER'] as const);
export type DexAggregatorSourceKind = (typeof DEX_AGGREGATOR_SOURCE_KINDS)[number];

/** The DEX family surface: swap execution on a single chain. */
export interface DexPackExtension {
  readonly family: 'dex';
  readonly dexKind: DexPackKind;
  readonly supportedSwapKinds: readonly SwapKind[];
  readonly supportedChains: readonly string[];
  readonly quoteSemantics: QuoteSemantics;
  readonly slippageProtection: SlippageProtectionModel;
  readonly feeModel: DexFeeModel;
  readonly supportsSimulation: boolean;
  /** REQUIRED when dexKind is AGGREGATOR; forbidden otherwise. */
  readonly aggregatorSources?: readonly DexAggregatorSourceKind[];
}

// ---------------------------------------------------------------------------
// Bridge (NET-NEW)
// ---------------------------------------------------------------------------

export const BRIDGE_MODELS = Object.freeze([
  'LOCK_AND_MINT',
  'BURN_AND_MINT',
  'LIQUIDITY_POOL',
  'MESSAGE_PASSING',
] as const);
export type BridgeModel = (typeof BRIDGE_MODELS)[number];

export const BRIDGE_FINALITY_REQUIREMENTS = Object.freeze([
  'SOURCE_FINALITY',
  'DESTINATION_FINALITY',
  'BOTH',
] as const);
export type BridgeFinalityRequirement = (typeof BRIDGE_FINALITY_REQUIREMENTS)[number];

export const BRIDGE_REORG_HANDLING = Object.freeze(['WAIT_FOR_FINALITY', 'REPLAY_PROTECTED', 'PROVIDER_DEFINED'] as const);
export type BridgeReorgHandling = (typeof BRIDGE_REORG_HANDLING)[number];

export const BRIDGE_MESSAGE_VERIFICATION = Object.freeze([
  'LIGHT_CLIENT',
  'ORACLE_ATTESTATION',
  'TRUSTED_SIGNER_SET',
  'NOT_APPLICABLE',
] as const);
export type BridgeMessageVerification = (typeof BRIDGE_MESSAGE_VERIFICATION)[number];

export const BRIDGE_REFUND_MODELS = Object.freeze([
  'REFUNDABLE_PRE_CONFIRMATION',
  'MANUAL_RESCUE',
  'PROVIDER_DEFINED',
] as const);
export type BridgeRefundModel = (typeof BRIDGE_REFUND_MODELS)[number];

/** One declared cross-chain corridor (source ≠ destination, both canonical). */
export interface BridgeCorridorDescriptor {
  readonly sourceChain: string;
  readonly destinationChain: string;
  /** Optional corridor-scoped asset binding, e.g. `ethereum:mainnet/asset:USC`. */
  readonly assetRef?: string;
  /** Declared directionality of this corridor. */
  readonly direction: 'ONE_WAY' | 'TWO_WAY';
}

/** The bridge family surface: cross-chain asset movement. */
export interface BridgePackExtension {
  readonly family: 'bridge';
  readonly bridgeModel: BridgeModel;
  /** ≥1 declared corridor; source ≠ destination on every corridor. */
  readonly supportedCorridors: readonly BridgeCorridorDescriptor[];
  readonly destinationFinalityRequirement: BridgeFinalityRequirement;
  readonly reorgHandling: BridgeReorgHandling;
  readonly messageVerification: BridgeMessageVerification;
  readonly refundModel: BridgeRefundModel;
}

// ---------------------------------------------------------------------------
// Off-ramp (NET-NEW)
// ---------------------------------------------------------------------------

export const OFFRAMP_PAYOUT_HANDOFF_MODELS = Object.freeze([
  'DIRECT_TRANSFER',
  'CUSTODIAL_SETTLEMENT',
  'HYBRID',
] as const);
export type OffRampPayoutHandoffModel = (typeof OFFRAMP_PAYOUT_HANDOFF_MODELS)[number];

export const OFFRAMP_KYC_REQUIREMENTS = Object.freeze(['REQUIRED', 'PROVIDER_DEFINED'] as const);
export type OffRampKycRequirement = (typeof OFFRAMP_KYC_REQUIREMENTS)[number];

export const OFFRAMP_QUOTE_VALIDITY_MODELS = Object.freeze(['EXPIRING_QUOTE', 'INDICATIVE_RATE'] as const);
export type OffRampQuoteValidityModel = (typeof OFFRAMP_QUOTE_VALIDITY_MODELS)[number];

/** The off-ramp family surface: onchain assets handed off to fiat payout. */
export interface OffRampPackExtension {
  readonly family: 'off-ramp';
  readonly payoutHandoffModel: OffRampPayoutHandoffModel;
  /** Provider payout method refs the venue serves (≥1), e.g. 'SEPA'. */
  readonly supportedPayoutMethods: readonly string[];
  /** ISO-3166-1 alpha-2 jurisdictions the venue declares (≥1). */
  readonly supportedJurisdictions: readonly string[];
  readonly kycRequirement: OffRampKycRequirement;
  readonly quoteValidityModel: OffRampQuoteValidityModel;
  /** The fiat settlement rail the venue hands off to (declarative). */
  readonly settlementRailHandoff: string;
}

// ---------------------------------------------------------------------------
// Liquidity (NET-NEW)
// ---------------------------------------------------------------------------

export const LIQUIDITY_MODELS = Object.freeze([
  'CONSTANT_PRODUCT_AMM',
  'CONCENTRATED_LIQUIDITY',
  'ORDER_BOOK',
  'PEER_POOL',
] as const);
export type LiquidityModel = (typeof LIQUIDITY_MODELS)[number];

export const IMPERMANENT_LOSS_DISCLOSURES = Object.freeze([
  'DISCLOSED',
  'NOT_APPLICABLE',
  'PROVIDER_DEFINED',
] as const);
export type ImpermanentLossDisclosure = (typeof IMPERMANENT_LOSS_DISCLOSURES)[number];

export const LIQUIDITY_LOCKUP_MODELS = Object.freeze(['NO_LOCKUP', 'WITHDRAWAL_DELAY', 'BONDED_TERM'] as const);
export type LiquidityLockupModel = (typeof LIQUIDITY_LOCKUP_MODELS)[number];

/** The liquidity family surface: liquidity provision positions. */
export interface LiquidityPackExtension {
  readonly family: 'liquidity';
  readonly liquidityModel: LiquidityModel;
  /** Position shapes the venue offers (≥1), e.g. 'RANGE_POSITION'. */
  readonly positionShapes: readonly string[];
  /** Fee tiers in basis points: ≥1, each 0..10000, no duplicates. */
  readonly feeTiersBasisPoints: readonly number[];
  readonly impermanentLossDisclosure: ImpermanentLossDisclosure;
  readonly lockupModel: LiquidityLockupModel;
  /** REQUIRED when lockupModel is WITHDRAWAL_DELAY; forbidden otherwise. */
  readonly withdrawalDelayDescription?: string;
}

// ---------------------------------------------------------------------------
// Lending/staking (NET-NEW)
// ---------------------------------------------------------------------------

export const LENDING_STAKING_POSITION_KINDS = Object.freeze([
  'SUPPLY',
  'BORROW',
  'STAKE',
  'NATIVE_STAKING',
  'LIQUID_STAKING',
] as const);
export type LendingStakingPositionKind = (typeof LENDING_STAKING_POSITION_KINDS)[number];

export const COLLATERAL_MODELS = Object.freeze(['OVER_COLLATERALIZED', 'UNDER_COLLATERALIZED', 'NONE'] as const);
export type CollateralModel = (typeof COLLATERAL_MODELS)[number];

export const RATE_MODELS = Object.freeze(['VARIABLE', 'FIXED', 'PROVIDER_DEFINED'] as const);
export type RateModel = (typeof RATE_MODELS)[number];

export const RATE_VARIABILITY = Object.freeze([
  'DETERMINISTIC_FORMULA',
  'GOVERNANCE_SET',
  'PROVIDER_DEFINED',
] as const);
export type RateVariability = (typeof RATE_VARIABILITY)[number];

export const UNBONDING_MODELS = Object.freeze(['INSTANT', 'DELAYED', 'PROVIDER_DEFINED'] as const);
export type UnbondingModel = (typeof UNBONDING_MODELS)[number];

/** The lending/staking family surface: yield-bearing positions. */
export interface LendingStakingPackExtension {
  readonly family: 'lending-staking';
  readonly positionKind: LendingStakingPositionKind;
  readonly collateralModel: CollateralModel;
  readonly rateModel: RateModel;
  readonly rateVariability: RateVariability;
  /** Reward streams (asset refs / stream ids); may be empty for pure native yield. */
  readonly rewardStreams: readonly string[];
  readonly unbondingModel: UnbondingModel;
  /** REQUIRED when unbondingModel is DELAYED; forbidden otherwise. */
  readonly unbondingDelayDescription?: string;
  /** REQUIRED for staking position kinds; forbidden otherwise. */
  readonly slashingConditions?: readonly string[];
}

// ---------------------------------------------------------------------------
// Intent protocol (ADAPT of the old IntentExecutionCapabilityDeclaration)
// ---------------------------------------------------------------------------

export const INTENT_SETTLEMENT_MODELS = Object.freeze(['FULFILLER_SETTLED', 'BATCH_AUCTION', 'HYBRID'] as const);
export type IntentSettlementModel = (typeof INTENT_SETTLEMENT_MODELS)[number];

export const SOLVER_COMPETITION_MODELS = Object.freeze(['OPEN', 'RESTRICTED', 'SINGLE_FULFILLER'] as const);
export type SolverCompetitionModel = (typeof SOLVER_COMPETITION_MODELS)[number];

export const INTENT_ESCROW_MODELS = Object.freeze(['ONCHAIN_ESCROW', 'OFFCHAIN_CUSTODY', 'NONE'] as const);
export type IntentEscrowModel = (typeof INTENT_ESCROW_MODELS)[number];

export const INTENT_BATCH_CADENCE = Object.freeze(['CONTINUOUS', 'BATCHED', 'PROVIDER_DEFINED'] as const);
export type IntentBatchCadence = (typeof INTENT_BATCH_CADENCE)[number];

export const INTENT_SURPLUS_MODELS = Object.freeze([
  'RETURNED_TO_USER',
  'KEPT_BY_SOLVER',
  'SHARED',
  'PROVIDER_DEFINED',
] as const);
export type IntentSurplusModel = (typeof INTENT_SURPLUS_MODELS)[number];

/** The intent-protocol family surface: solver-settled intent domains. */
export interface IntentProtocolPackExtension {
  readonly family: 'intent-protocol';
  readonly settlementModel: IntentSettlementModel;
  readonly solverCompetition: SolverCompetitionModel;
  /** The auction/settlement domain: ≥1 canonical chain key. */
  readonly supportedDomains: readonly string[];
  readonly escrowModel: IntentEscrowModel;
  readonly batchCadence: IntentBatchCadence;
  readonly surplusModel: IntentSurplusModel;
}

// ---------------------------------------------------------------------------
// The family-extension union + guards
// ---------------------------------------------------------------------------

export type PackFamilyExtension =
  | DexPackExtension
  | BridgePackExtension
  | OffRampPackExtension
  | LiquidityPackExtension
  | LendingStakingPackExtension
  | IntentProtocolPackExtension;

export function isDexPackExtension(
  value: unknown,
): value is DexPackExtension {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).family === 'dex'
  );
}

export function isBridgePackExtension(
  value: unknown,
): value is BridgePackExtension {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).family === 'bridge'
  );
}

export function isOffRampPackExtension(
  value: unknown,
): value is OffRampPackExtension {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).family === 'off-ramp'
  );
}

export function isLiquidityPackExtension(
  value: unknown,
): value is LiquidityPackExtension {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).family === 'liquidity'
  );
}

export function isLendingStakingPackExtension(
  value: unknown,
): value is LendingStakingPackExtension {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).family === 'lending-staking'
  );
}

export function isIntentProtocolPackExtension(
  value: unknown,
): value is IntentProtocolPackExtension {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Readonly<Record<string, unknown>>).family === 'intent-protocol'
  );
}
