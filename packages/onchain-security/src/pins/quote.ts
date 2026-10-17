/**
 * @payswap/onchain-security — structural pin: the execution-quote
 * disclosure shapes (R2-W2).
 *
 * LAYER LAW: zero sibling imports. The best-execution quote-disclosure
 * vocabulary is owned by the execution lane (Work Order P5-W1,
 * payswap.org@8a735bf packages/best-execution/src/outcome-dimensions.ts
 * is the reference; no best-execution package exists in PaySwap 3.0 at
 * this base). The threat-intel MEV/sandwich detector consumes these
 * typed disclosures, so they are pinned HERE structurally — identical
 * members — and the execution lane's real disclosures satisfy the pin by
 * construction when P5-W1 lands (TL integration).
 *
 * All amounts are exact minor-unit strings / integer basis points —
 * never floating point (INV-2 discipline).
 */

import type { AmountSpec } from "./money.ts";
import type { SmartContractExtension } from "./smart-contract.ts";

/**
 * An asset-denominated exact amount (the output-asset denomination of a
 * quote impact). `asset` is structurally the capability lane's
 * AssetIdentity-shaped declaration; pinned here as the minimal
 * chain-scoped identity the detectors compare.
 */
export interface AssetDenominatedAmount {
  readonly asset: {
    readonly chain: string;
    readonly assetId: string;
    readonly symbol: string;
  };
  /** Exact integer minor units (canonical decimal string). */
  readonly minorUnits: string;
}

/** How a venue declares slippage protection on a quote. */
export interface SlippageDisclosure {
  readonly protection: "DECLARED_LIMIT" | "PROVIDER_DEFINED";
  /** The guaranteed worst-case received amount in the OUTPUT asset. */
  readonly worstCaseOutput: AmountSpec;
  /** The declared slippage limit in basis points, when the venue declares one. */
  readonly limitBasisPoints?: number;
  /** The expected (mid-estimate) output, when the venue discloses one. */
  readonly expectedOutput?: AmountSpec;
}

/** How a venue declares liquidity impact on a quote. */
export interface LiquidityImpactDisclosure {
  /** The declared impact cost in the OUTPUT asset (exact minor units). */
  readonly declaredImpactCost: AssetDenominatedAmount;
  /** Declared price impact in basis points, when the venue discloses it. */
  readonly priceImpactBasisPoints?: number;
  readonly description: string;
}
