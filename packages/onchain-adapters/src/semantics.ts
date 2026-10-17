/**
 * @payswap/onchain-adapters — EXPLICIT family semantics profiles (Work Order
 * P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/semantics.ts).
 *
 * Canonical law (unchanged from the old work order): "Fee, finality and
 * reorg semantics EXPLICIT per family … An adapter that cannot express a
 * semantic must fail closed, not approximate". Every family adapter declares
 * its fee model, finality model and reorg detection semantics as DATA with
 * provenance — descriptive guidance only: finality itself stays
 * protocol-owned (finality CANDIDATES only). The profiles are validated
 * deterministically; a profile that cannot express its family's semantics is
 * REJECTED at construction, and runtime semantics derivation (from observed
 * rail state) throws SemanticNotExpressibleError rather than approximating.
 *
 * Family models:
 * - EVM:    GAS_AUCTION fee model (EIP-1559 baseFee+priority when
 *           expressible), PROBABILISTIC finality, confirmation-depth
 *           guidance, reorgs detected by BLOCK_HASH observation.
 * - SOLANA: SIGNATURE_FEE model (lamports per signature), slot-depth
 *           confirmation guidance, finalized-commitment guidance, forks
 *           detected by SLOT/signature-status observation.
 * - UTXO:   SATOSHI_PER_VBYTE fee model, declared MempoolPolicy (BIP-125
 *           opt-in RBF / CPFP — declared with provenance, never assumed),
 *           PROBABILISTIC finality, depth guidance, reorgs detected by
 *           BLOCK_HASH observation.
 */

// ---------------------------------------------------------------------------
// Fee semantics (exact integer minor units — the money-exactness law)
// ---------------------------------------------------------------------------

/** EVM GAS_AUCTION fee semantics: EIP-1559 dynamic-fee shape. */
export interface EvmFeeSemantics {
  readonly family: 'EVM';
  readonly expressible: true;
  readonly feeModel: 'GAS_AUCTION';
  /** Exact base fee per gas in wei (integer decimal string). */
  readonly baseFeePerGasMinorUnits: string;
  /** Exact priority fee per gas in wei, when expressible. */
  readonly priorityFeePerGasMinorUnits?: string;
  /** Exact gas limit in gas units (integer decimal string). */
  readonly gasLimit: string;
  /** Whether EIP-1559 fee parameters are expressible on this observation. */
  readonly eip1559: boolean;
}

/** Solana SIGNATURE_FEE semantics: lamports per signature. */
export interface SolanaFeeSemantics {
  readonly family: 'SOLANA';
  readonly expressible: true;
  readonly feeModel: 'SIGNATURE_FEE';
  /** Exact lamports charged per signature (integer decimal string). */
  readonly lamportsPerSignature: string;
}

/** UTXO mempool policy declaration (explicit, provenanced — never assumed). */
export interface UtxoMempoolPolicy {
  readonly replacement: 'BIP125_OPT_IN' | 'UNSUPPORTED' | 'UNDECLARED';
  readonly cpfp: 'SUPPORTED' | 'UNSUPPORTED' | 'UNDECLARED';
  /** Provenance of the declaration (documented policy reference). */
  readonly declaredBy: string;
}

/** UTXO SATOSHI_PER_VBYTE fee semantics. */
export interface UtxoFeeSemantics {
  readonly family: 'UTXO';
  readonly expressible: true;
  readonly feeModel: 'SATOSHI_PER_VBYTE';
  /**
   * Fee rate in satoshi per virtual byte, as an EXACT DECIMAL STRING
   * (verbatim from the provider's numeric text — no float arithmetic). A
   * RATE is not money: fee AMOUNTS are integer satoshi computed downstream by
   * the trusted surface (the exactness law applies to amounts, not to the
   * observed rate quote, which is carried verbatim with provenance).
   */
  readonly feeRateSatPerVByte: string;
  /** Which confirmation-target estimate bucket the rate was derived from. */
  readonly estimateTargetBlocks: number;
  readonly mempoolPolicy: UtxoMempoolPolicy;
}

/** The union of family fee semantics. */
export type FamilyFeeSemantics = EvmFeeSemantics | SolanaFeeSemantics | UtxoFeeSemantics;

/** An inexpressible fee shape: the limitation is RECORDED, never approximated. */
export interface InexpressibleFeeSemantics {
  readonly expressible: false;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Finality + reorg semantics (guidance — finality stays protocol-owned)
// ---------------------------------------------------------------------------

export interface EvmFinalitySemantics {
  readonly family: 'EVM';
  readonly finalityModel: 'PROBABILISTIC';
  /** Declared confirmation-depth guidance (blocks). */
  readonly confirmationDepthTarget: number;
  /** How reorgs are detected: the containing block's hash is re-observed. */
  readonly reorgDetection: 'BLOCK_HASH_OBSERVATION';
}

export interface SolanaFinalitySemantics {
  readonly family: 'SOLANA';
  readonly finalityModel: 'PROBABILISTIC';
  /** Declared slot-depth confirmation guidance. */
  readonly slotConfirmationTarget: number;
  /** Declared commitment level treated as the finality-candidate gate. */
  readonly finalizedCommitment: 'finalized' | 'confirmed';
  /** How forks are detected: signature status disappearance at commitment. */
  readonly forkDetection: 'SIGNATURE_STATUS_OBSERVATION';
}

export interface UtxoFinalitySemantics {
  readonly family: 'UTXO';
  readonly finalityModel: 'PROBABILISTIC';
  /** Declared confirmation-depth guidance (blocks/depth). */
  readonly confirmationDepthTarget: number;
  /** How reorgs are detected: the containing block's hash is re-observed. */
  readonly reorgDetection: 'BLOCK_HASH_OBSERVATION';
}

export type FamilyFinalitySemantics =
  | EvmFinalitySemantics
  | SolanaFinalitySemantics
  | UtxoFinalitySemantics;

// ---------------------------------------------------------------------------
// The family semantics profile (one per family adapter)
// ---------------------------------------------------------------------------

export interface EvmSemanticsProfile {
  readonly family: 'EVM';
  readonly fee: EvmFeeSemantics | InexpressibleFeeSemantics;
  readonly finality: EvmFinalitySemantics;
}

export interface SolanaSemanticsProfile {
  readonly family: 'SOLANA';
  readonly fee: SolanaFeeSemantics | InexpressibleFeeSemantics;
  readonly finality: SolanaFinalitySemantics;
}

export interface UtxoSemanticsProfile {
  readonly family: 'UTXO';
  readonly fee: UtxoFeeSemantics | InexpressibleFeeSemantics;
  readonly finality: UtxoFinalitySemantics;
}

export type FamilySemanticsProfile =
  | EvmSemanticsProfile
  | SolanaSemanticsProfile
  | UtxoSemanticsProfile;
