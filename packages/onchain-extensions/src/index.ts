/**
 * @payswap/onchain-extensions — the extension-pack vocabulary for onchain
 * venues (Work Order P5-W2, lane R3-W2; rebuild of the accepted-then-lost
 * work/p5-w2).
 *
 * This barrel is the PACK-NEUTRAL vocabulary: the wire shapes, the
 * structural pins and the family semantics tables. It contains NO concrete
 * pack vocabulary (the seven reference packs are the package's subpath
 * exports — the dependency direction is strictly pack → core, mirrored
 * from the onchain-adapters family model and adversarially verified in
 * test/adversarial.test.ts).
 *
 * THE DECLARATIVE LAW: a pack is versioned descriptor DATA + validation +
 * addressing. Never execution, never I/O, never financial authority. A pack
 * may express constraints/assumptions (authorityCarrier: false) but can
 * never authorize; certification is always required and its status is
 * never carried here (the capability fabric's append-only ledger owns it).
 */

export const PACKAGE_NAME = '@payswap/onchain-extensions' as const;

// Package + contract vocabulary versions.
export {
  PACK_FAMILY_CONTRACT_VERSION,
  PACK_WIRE_CONTRACT_VERSION,
  PACK_ADDRESSING_CONTRACT_VERSION,
  PACK_REGISTRY_CONTRACT_VERSION,
} from './version.ts';

// The error taxonomy (self-contained, PaySwapError-shaped).
export {
  OnchainExtensionError,
  ValidationError,
  PackConflictError,
  PackNotFoundError,
} from './errors.ts';
export type {
  ErrorCategory,
  OnchainExtensionErrorDetails,
  OnchainExtensionErrorInit,
  ValidationErrorDetails,
} from './errors.ts';

// Deterministic canonical serialization + content digest (binding-never-security).
export { canonicalString, contentDigest, fnv1a64Hex } from './digest.ts';

// STRUCTURAL PINS — local mirrors of the onchain-domain contracts
// (chain/asset/protocol vocabulary + INV-SC01 smart-contract declarations).
export {
  CHAIN_FAMILIES,
  CHAIN_KEY_PATTERN,
  PROTOCOL_CLASSES,
  PROTOCOL_KEY_PATTERN,
  ONCHAIN_OPERATION_KINDS,
  isChainFamily,
  isValidChainKey,
  isProtocolClass,
  isValidProtocolKey,
  isOnchainOperationKind,
  chainCapabilityId,
  protocolCapabilityId,
  canonicalProtocolRef,
} from './pins/onchain-domain.ts';
export type {
  ChainFamily,
  ProtocolClass,
  OnchainOperationKind,
} from './pins/onchain-domain.ts';
export {
  SMART_CONTRACT_AUTHORITY_KINDS,
  validateSmartContractDeclaration,
  validateProtocolDescriptor,
} from './pins/smart-contract.ts';
export type {
  SmartContractAuthority,
  SmartContractAuthorityKind,
  SmartContractPausePower,
  SmartContractOracleDependency,
  SmartContractCustodyProperties,
  SmartContractDeclaration,
  ProtocolDescriptor,
} from './pins/smart-contract.ts';

// The core pack wire shapes.
export {
  PACK_KEY_PATTERN,
  SEMVER_PATTERN,
  PACK_ID_PATTERN,
  PACK_CONSTRAINT_KINDS,
} from './wire/core.ts';
export type {
  PackNativeOptimizationDeclaration,
  VenueSurfaceDescriptor,
  PackConstraintKind,
  PackConstraint,
  PackCertificationDeclaration,
  PackProvenance,
  PackSubPackRef,
  PackImplementationDescriptor,
  OnchainExtensionPack,
} from './wire/core.ts';

// The family wire shapes (six families, discriminated on `family`).
export {
  PACK_FAMILIES,
  DEX_PACK_KINDS,
  SWAP_KINDS,
  QUOTE_SEMANTICS,
  SLIPPAGE_PROTECTION_MODELS,
  DEX_FEE_MODELS,
  DEX_AGGREGATOR_SOURCE_KINDS,
  BRIDGE_MODELS,
  BRIDGE_FINALITY_REQUIREMENTS,
  BRIDGE_REORG_HANDLING,
  BRIDGE_MESSAGE_VERIFICATION,
  BRIDGE_REFUND_MODELS,
  OFFRAMP_PAYOUT_HANDOFF_MODELS,
  OFFRAMP_KYC_REQUIREMENTS,
  OFFRAMP_QUOTE_VALIDITY_MODELS,
  LIQUIDITY_MODELS,
  IMPERMANENT_LOSS_DISCLOSURES,
  LIQUIDITY_LOCKUP_MODELS,
  LENDING_STAKING_POSITION_KINDS,
  COLLATERAL_MODELS,
  RATE_MODELS,
  RATE_VARIABILITY,
  UNBONDING_MODELS,
  INTENT_SETTLEMENT_MODELS,
  SOLVER_COMPETITION_MODELS,
  INTENT_ESCROW_MODELS,
  INTENT_BATCH_CADENCE,
  INTENT_SURPLUS_MODELS,
  isPackFamily,
  isDexPackExtension,
  isBridgePackExtension,
  isOffRampPackExtension,
  isLiquidityPackExtension,
  isLendingStakingPackExtension,
  isIntentProtocolPackExtension,
} from './wire/families.ts';
export type {
  PackFamily,
  DexPackKind,
  SwapKind,
  QuoteSemantics,
  SlippageProtectionModel,
  DexFeeModel,
  DexAggregatorSourceKind,
  DexPackExtension,
  BridgeModel,
  BridgeFinalityRequirement,
  BridgeReorgHandling,
  BridgeMessageVerification,
  BridgeRefundModel,
  BridgeCorridorDescriptor,
  BridgePackExtension,
  OffRampPayoutHandoffModel,
  OffRampKycRequirement,
  OffRampQuoteValidityModel,
  OffRampPackExtension,
  LiquidityModel,
  ImpermanentLossDisclosure,
  LiquidityLockupModel,
  LiquidityPackExtension,
  LendingStakingPositionKind,
  CollateralModel,
  RateModel,
  RateVariability,
  UnbondingModel,
  LendingStakingPackExtension,
  IntentSettlementModel,
  SolverCompetitionModel,
  IntentEscrowModel,
  IntentBatchCadence,
  IntentSurplusModel,
  IntentProtocolPackExtension,
  PackFamilyExtension,
} from './wire/families.ts';

// The family semantics tables (declarative; validators + registry read them).
export {
  PACK_FAMILY_SEMANTICS,
  PACK_FAMILY_PROTOCOL_CLASSES,
  PACK_FAMILY_COMPOSITION,
  packFamilySemantics,
  allowedProtocolClasses,
  composableFamilies,
  packFamilyTablesAreTotal,
} from './wire/family-semantics.ts';
export type { PackFamilySemantics } from './wire/family-semantics.ts';

// Canonical pack addressing (deterministic identity + tamper evidence).
export {
  onchainPackId,
  parsePackId,
  packFamilyOf,
  canonicalPackProjection,
  packContentDigest,
} from './addressing.ts';
export type { ParsedPackId } from './addressing.ts';

// Pack validation (fail closed, accumulate law; validate-then-freeze).
export { validateOnchainExtensionPack } from './validation/core.ts';

// The per-family extension validators (the six family surfaces).
export {
  validateDexPackExtension,
  validateIntentProtocolPackExtension,
} from './validation/families-swap.ts';
export {
  validateBridgePackExtension,
  validateOffRampPackExtension,
} from './validation/families-transfer.ts';
export {
  validateLiquidityPackExtension,
  validateLendingStakingPackExtension,
} from './validation/families-yield.ts';

// The declarative registry + composition (never fabricates, never executes).
export {
  OnchainExtensionPackRegistry,
  resolveComposition,
  flattenPackTree,
  findSubPack,
  familyOfPackId,
} from './registry.ts';
export type { ResolvedPackComposition } from './registry.ts';
