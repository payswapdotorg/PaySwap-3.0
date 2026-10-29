/**
 * @payswap/route-compiler — the PINNED WIRE SHAPES of the onchain lanes
 * (P5-W1, lane R3-W1).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its
 * AUTHORITY: @payswap/onchain-domain (P4-W1 — chain/asset/protocol
 * vocabulary), @payswap/onchain-security (P4-W2 — write pipeline, gate
 * decisions, digests) and @payswap/onchain-extensions (P5-W2 — the
 * DECLARATIVE venue-pack wire forms). The mirrors are deliberately
 * SUBSET-typed; vocabulary VALUES are pinned byte-identical and their
 * cross-lane consistency is asserted by test/pins.test.ts.
 *
 * NOTE ON THE VENUE PORT: on THIS branch the venue pack is DECLARATIVE
 * DATA (@payswap/onchain-extensions carries no executable venue methods —
 * "execution belongs to the best-execution (P5-W1) and adapters (P4-W3)
 * lanes"). The EXECUTION VENUE PORT (quote / observeHealth / planWrite
 * over a registered venue) is therefore THIS package's own contract
 * vocabulary (src/venue-port.ts) — venue-NEUTRAL, registered from the
 * outside; only the pack's wire SHAPES (surface descriptor, swap kinds,
 * quote semantics, slippage protection, native optimization declaration)
 * are pinned here from the extension lane.
 *
 * Pins in this module:
 * - PinnedAssetIdentity + PINNED_SWAP_KINDS / QUOTE_SEMANTICS /
 *   SLIPPAGE_PROTECTION_MODELS (authority: @payswap/onchain-extensions
 *   wire/families.ts — byte-identical venue wire vocabularies)
 * - PinnedVenueSurfaceDescriptor + PinnedPackNativeOptimization
 *   (authority: @payswap/onchain-extensions wire/core.ts)
 * - PinnedChainFinalityModel + PinnedOnchainFailureClass (authority:
 *   @payswap/onchain-domain)
 * - PinnedGateDecision (authority: @payswap/onchain-security)
 * - PinnedPreparedWrite (authority: @payswap/onchain-security)
 * - PinnedOnchainExecutionObservation (authority: @payswap/onchain-domain)
 */

/**
 * VALUE PIN — authority: @payswap/onchain-extensions src/wire/families.ts
 * `SWAP_KINDS`, `QUOTE_SEMANTICS`, `SLIPPAGE_PROTECTION_MODELS`
 * (byte-identical; cross-lane consistency test-enforced). QUOTE_SEMANTICS
 * is load-bearing for the credible-pricing requirement: an INDICATIVE
 * quote is never a credible price for execution comparability.
 */
export const PINNED_SWAP_KINDS = Object.freeze(["EXACT_INPUT", "EXACT_OUTPUT"] as const);
export const PINNED_QUOTE_SEMANTICS = Object.freeze(["INDICATIVE", "EXECUTABLE"] as const);
export const PINNED_SLIPPAGE_PROTECTION_MODELS = Object.freeze([
  "DECLARED_LIMIT",
  "PROVIDER_DEFINED",
] as const);

/** STRUCTURAL PIN — authority: the same lane's `SwapKind` etc. */
export type PinnedSwapKind = (typeof PINNED_SWAP_KINDS)[number];
export type PinnedQuoteSemantics = (typeof PINNED_QUOTE_SEMANTICS)[number];
export type PinnedSlippageProtectionModel = (typeof PINNED_SLIPPAGE_PROTECTION_MODELS)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-security
 * src/smart-contract/identity (the asset identity wire: chain + assetId +
 * three-letter symbol; the venue quote's assets live on ONE chain).
 */
export interface PinnedAssetIdentity {
  readonly chain: string;
  readonly assetId: string;
  readonly symbol: string;
}

/**
 * VALUE PIN — the canonical chain-key form (authority:
 * @payswap/onchain-domain `isValidChainKey`: `<network>:<segment>`, both
 * lowercase-alphanumeric-with-dashes/-segments — e.g.
 * `ethereum:mainnet`, `solana:mainnet-beta`, `stellar:testnet`).
 */
export const PINNED_CHAIN_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(:[a-z0-9]+(-[a-z0-9]+)*)+$/;

/** True iff a chain key matches the pinned canonical form. */
export function isPinnedChainKey(value: string): boolean {
  return PINNED_CHAIN_KEY_PATTERN.test(value);
}

/**
 * VALUE PIN — authority: @payswap/onchain-domain src/asset.ts
 * `SYMBOL_PATTERN` = /^[A-Z0-9][A-Z0-9._-]{0,31}$/. The canonical asset
 * symbol format (uppercase-led, 1..32 chars, digits/dots/hyphens/
 * underscores) — byte-identical. P22-C growth: an onchain position's
 * symbol and observed amount are denominated in the ASSET (e.g. the
 * issuer-scoped `USDC` of `stellar:testnet/asset:USDC:<issuerG>`,
 * ADR-0016 D3), never a three-letter ISO currency code — the asset-symbol
 * law is the honest bound (the old three-character bound was only ever
 * coincidentally sufficient for ETH/USC-class fixtures).
 */
export const PINNED_ASSET_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

/** True iff an asset symbol matches the pinned canonical form. */
export function isPinnedAssetSymbol(value: string): boolean {
  return PINNED_ASSET_SYMBOL_PATTERN.test(value);
}

/**
 * VALUE PIN — authority: @payswap/onchain-extensions src/wire/core.ts
 * `PACK_KEY_PATTERN` (the venue identity form — one venue per pack key).
 */
export const PINNED_VENUE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

/** True iff a venue key matches the pinned canonical form. */
export function isPinnedVenueKey(value: string): boolean {
  return PINNED_VENUE_KEY_PATTERN.test(value);
}

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-extensions src/wire/core.ts
 * `PackNativeOptimizationDeclaration`: the venue's declared
 * provider-native optimization — the incumbent baseline (INV-C08 / rule
 * 20). `benchmarkBaseline` is a LITERAL true type: a venue declaring an
 * optimization declares it AS the baseline its compositions are compared
 * against.
 */
export interface PinnedPackNativeOptimization {
  readonly optimizationKind: string;
  readonly benchmarkBaseline: true;
  readonly description: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-extensions src/wire/core.ts
 * `VenueSurfaceDescriptor` (SUBSET: the identity surface the route
 * compiler's venue registration consumes — venueKey, displayName, chains,
 * supportsSimulation, nativeOptimization).
 */
export interface PinnedVenueSurfaceDescriptor {
  /** The venue identity; equals the pack id's packKey segment. */
  readonly venueKey: string;
  readonly displayName: string;
  readonly chains: readonly string[];
  readonly supportsSimulation: boolean;
  readonly nativeOptimization?: PinnedPackNativeOptimization;
}

/**
 * VALUE PIN — authority: @payswap/onchain-domain `ChainFinalityModel`
 * vocabulary (byte-identical) and `OnchainFailureClass`.
 */
export const PINNED_CHAIN_FINALITY_MODELS = Object.freeze([
  "PROBABILISTIC",
  "DETERMINISTIC",
  "INSTANT",
  "HYBRID",
] as const);

export const PINNED_ONCHAIN_FAILURE_CLASSES = Object.freeze([
  "REJECTED",
  "REVERTED",
  "INSUFFICIENT_FUNDS",
  "EXPIRED",
  "POLICY_BLOCKED",
  "SECURITY_BLOCKED",
  "PROVIDER_DEFINED",
] as const);

export type PinnedChainFinalityModel = (typeof PINNED_CHAIN_FINALITY_MODELS)[number];
export type PinnedOnchainFailureClass = (typeof PINNED_ONCHAIN_FAILURE_CLASSES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-security
 * src/write-gates `GateDecision` (SUBSET: the decision + reasons +
 * evidence surface; guard-check details are owned by the security lane).
 * BLOCK is terminal (rule 27 — no override); UNKNOWN is an honest state
 * that must be resolved with fresh evidence, never converted.
 */
export type PinnedGateDecision =
  | {
      readonly decision: "ALLOW";
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly decision: "BLOCK";
      readonly reasons: readonly { readonly code: string; readonly message: string }[];
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly decision: "UNKNOWN";
      readonly dimensions: readonly { readonly code: string; readonly message: string }[];
      readonly evidenceRefs: readonly string[];
    };

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-security
 * src/write-pipeline `PreparedWrite` (SUBSET: writeId, action, chain,
 * optional transfer, route binding {routeId, routeHash}, expiry,
 * requestedBy, settlement instruction binding, and the contentDigest of
 * the prepared write — the exact write the gate evaluated). The full
 * approvals/contractCall/protocol surfaces are owned by the security
 * lane; the compiler binds routes to write digests, never to calldata.
 */
export interface PinnedPreparedWrite {
  readonly writeId: string;
  readonly action: string;
  readonly chain: string;
  readonly transfer?: {
    readonly asset: PinnedAssetIdentity;
    readonly amount: { readonly currency: string; readonly minorUnits: string };
    readonly from: string;
    readonly to: string;
  };
  readonly route: {
    readonly routeId: string;
    readonly routeHash: string;
  };
  readonly protocol?: {
    readonly protocolKey: string;
    readonly chainKey: string;
  };
  readonly expiry: number;
  readonly requestedBy: string;
  readonly settlementInstruction?: {
    readonly instructionId: string;
    readonly instructionDigest: string;
  };
  readonly writeDigest: string;
  readonly preparedAt: number;
}

/**
 * STRUCTURAL PIN — authority: @payswap/onchain-domain
 * src/execution-observation `OnchainExecutionObservation` (SUBSET: the
 * outcome vocabulary + finality candidate + failure/unknown coupling +
 * provenance). Outcome couplings are the authority's law and hold on the
 * pin: FAILED requires failure; OUTCOME_UNKNOWN requires unknownReason
 * and forbids failure; BROADCAST forbids finalityCandidate.
 */
export interface PinnedOnchainExecutionObservation {
  readonly observationId: string;
  readonly executionRef: string;
  readonly observedAt: string;
  readonly chainKey: string;
  readonly outcome: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";
  readonly externalOperationRef?: string;
  readonly finalityCandidate?: {
    readonly candidateOnly: true;
    readonly requiresProtocolFinality: true;
    readonly confirmationDepth?: number;
    readonly finalityModel: PinnedChainFinalityModel;
    readonly reorgDetected: boolean;
  };
  readonly failure?: {
    readonly failureClass: PinnedOnchainFailureClass;
    readonly description: string;
    readonly retryGuidance: "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE";
  };
  readonly unknownReason?: string;
  readonly evidenceRefs: readonly string[];
  readonly provenance: {
    readonly providerName: string;
    readonly source: "PROVIDER_API" | "PROVIDER_WEBHOOK" | "OPERATOR" | "INTERNAL";
    readonly capturedAt: string;
  };
}

/**
 * VALUE PIN — the onchain observation OUTCOME vocabulary and the canonical
 * rail/failure-retry guidances (authority: @payswap/onchain-domain —
 * byte-identical; the walk's event-candidate mapping reconciles to these).
 */
export const PINNED_ONCHAIN_OUTCOMES = Object.freeze([
  "BROADCAST",
  "CONFIRMED",
  "FAILED",
  "OUTCOME_UNKNOWN",
] as const);
