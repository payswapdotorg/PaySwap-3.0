/**
 * @payswap/onchain-domain — onchain capability flavors (P4-W1, lane R2-W1;
 * PORT/ADAPT of payswap.org@8a735bf
 * packages/onchain-domain/src/onchain-capabilities.ts).
 *
 * RECONCILIATION (the work-order duty): every onchain capability flavor is
 * a capability-fabric catalogue definition (the pinned EXECUTABLE arm —
 * src/pins.ts PinnedExecutableDefinition; the fourteen-part executable
 * declaration law and the hierarchy itself are the capability lane's
 * authority, structurally pinned, never re-defined) plus an `onchain`
 * flavor declaration discriminated by `capabilityKind`:
 *
 * - WalletCapability / SignerCapability / SmartAccountCapability
 *   (declarations owned by ./wallet.ts — the onchain smart-account shapes;
 *   the agent-side shapes are the intelligence lane's, never duplicated);
 * - OnchainExecutionCapability — executes consequential onchain writes;
 * - ContractInteractionCapability — the CONTROLLED ESCAPE HATCH:
 *   `controlledEscapeHatch` and `certificationRequired` are literal `true`
 *   types and `unknownWritePolicy` has NO allow-silent member — unknown
 *   generic contract writes never execute silently (INV-20);
 * - DexCapability / BridgeCapability / IntentExecutionCapability.
 *
 * Deterministic flavor discrimination: `validateOnchainCapabilityDefinition`
 * validates the pinned base then dispatches on the declared
 * `capabilityKind`; every flavor has exactly one validator and an unknown
 * discriminant fails closed.
 */

import type { PinnedExecutableDefinition } from "./pins.ts";
import type { ChainFamily } from "./family.ts";
import type { OnchainOperationKind } from "./operations.ts";
import type {
  WalletCapabilityDeclaration,
  SignerCapabilityDeclaration,
  SmartAccountCapabilityDeclaration,
} from "./wallet.ts";

// ---------------------------------------------------------------------------
// Execution capability (consequential onchain writes)
// ---------------------------------------------------------------------------

/**
 * Onchain execution capability declaration. `preBroadcastRecheckRequired`
 * is a literal `true` type: supported consequential onchain writes require
 * simulation (where supported) plus a pre-broadcast re-check (INV-18) — an
 * execution capability without the re-check is unconstructible.
 */
export interface OnchainExecutionCapabilityDeclaration {
  readonly capabilityKind: "onchain_execution";
  readonly supportedOperations: readonly OnchainOperationKind[];
  readonly supportedFamilies: readonly ChainFamily[];
  readonly supportsSimulation: boolean;
  readonly preBroadcastRecheckRequired: true;
}

export interface OnchainExecutionCapability extends PinnedExecutableDefinition {
  readonly onchain: OnchainExecutionCapabilityDeclaration;
}

// ---------------------------------------------------------------------------
// Generic contract interaction (the CONTROLLED escape hatch — INV-20)
// ---------------------------------------------------------------------------

/**
 * ContractInteractionCapability declaration — the controlled escape hatch
 * for contract interactions outside certified domain capabilities.
 *
 * Structural safety (INV-20 — unknown generic contract writes never execute
 * silently):
 * - `controlledEscapeHatch: true` (literal type) — the hatch is always
 *   declared as what it is;
 * - `certificationRequired: true` (literal type) — only certified method
 *   declarations may execute;
 * - `certifiedMethodIds` — the explicit allowlist of certified method ids;
 * - `unknownWritePolicy` — ONLY `BLOCK` or `REQUIRE_ESCALATION`. There is
 *   deliberately no `ALLOW` member anywhere in this vocabulary.
 */
export interface ContractInteractionCapabilityDeclaration {
  readonly capabilityKind: "contract_interaction";
  readonly controlledEscapeHatch: true;
  readonly certificationRequired: true;
  readonly certifiedMethodIds: readonly string[];
  readonly unknownWritePolicy: "BLOCK" | "REQUIRE_ESCALATION";
}

export interface ContractInteractionCapability extends PinnedExecutableDefinition {
  readonly onchain: ContractInteractionCapabilityDeclaration;
}

// ---------------------------------------------------------------------------
// DEX / bridge / intent capabilities
// ---------------------------------------------------------------------------

export type SwapKind = "EXACT_INPUT" | "EXACT_OUTPUT";

/**
 * DEX/aggregator capability declaration. Best execution optimizes the
 * eligible executable economic outcome, never the quoted price alone: the
 * declared quote semantics and slippage protection feed that evaluation.
 */
export interface DexCapabilityDeclaration {
  readonly capabilityKind: "dex";
  readonly supportedSwapKinds: readonly SwapKind[];
  /** Chain keys this DEX capability serves (deterministic identity scope). */
  readonly supportedChains: readonly string[];
  readonly quoteSemantics: "INDICATIVE" | "EXECUTABLE";
  readonly slippageProtection: "DECLARED_LIMIT" | "PROVIDER_DEFINED";
}

export interface DexCapability extends PinnedExecutableDefinition {
  readonly onchain: DexCapabilityDeclaration;
}

/**
 * Bridge capability declaration. `custodialTransit` declares whether value
 * is held in custody during transit — a declared, risk-relevant property
 * (NON-CUSTODY: custody claims are declarations, never assumptions).
 */
export interface BridgeCapabilityDeclaration {
  readonly capabilityKind: "bridge";
  readonly sourceChains: readonly string[];
  readonly destinationChains: readonly string[];
  readonly custodialTransit: boolean;
  readonly destinationFinality: "ATTESTED" | "OBSERVED" | "PROVIDER_DEFINED";
}

export interface BridgeCapability extends PinnedExecutableDefinition {
  readonly onchain: BridgeCapabilityDeclaration;
}

/**
 * Intent-network capability declaration: solver-settled execution intents.
 */
export interface IntentExecutionCapabilityDeclaration {
  readonly capabilityKind: "intent";
  readonly supportedDomains: readonly string[];
  readonly settlementModel: "FULFILLER_SETTLED" | "ESCROWED" | "PROVIDER_DEFINED";
  readonly solverCompetition: "OPEN" | "SINGLE_SOLVER" | "PROVIDER_DEFINED";
}

export interface IntentExecutionCapability extends PinnedExecutableDefinition {
  readonly onchain: IntentExecutionCapabilityDeclaration;
}

// ---------------------------------------------------------------------------
// The wallet/signer/smart-account capability wrappers (flavor payloads)
// ---------------------------------------------------------------------------

export interface WalletCapability extends PinnedExecutableDefinition {
  readonly onchain: WalletCapabilityDeclaration;
}

export interface SignerCapability extends PinnedExecutableDefinition {
  readonly onchain: SignerCapabilityDeclaration;
}

export interface SmartAccountCapability extends PinnedExecutableDefinition {
  readonly onchain: SmartAccountCapabilityDeclaration;
}

/** The discriminated union of all onchain capability flavors. */
export type OnchainCapability =
  | WalletCapability
  | SignerCapability
  | SmartAccountCapability
  | OnchainExecutionCapability
  | ContractInteractionCapability
  | DexCapability
  | BridgeCapability
  | IntentExecutionCapability;

/** The discriminant of an onchain capability flavor declaration. */
export type OnchainCapabilityKind =
  | "wallet"
  | "signer"
  | "smart_account"
  | "onchain_execution"
  | "contract_interaction"
  | "dex"
  | "bridge"
  | "intent";

/**
 * The declared onchain capability flavors (frozen, deterministic): every
 * member has exactly one validator and an unknown discriminant fails
 * closed.
 */
export const ONCHAIN_CAPABILITY_KINDS: readonly OnchainCapabilityKind[] = [
  "wallet",
  "signer",
  "smart_account",
  "onchain_execution",
  "contract_interaction",
  "dex",
  "bridge",
  "intent",
];
