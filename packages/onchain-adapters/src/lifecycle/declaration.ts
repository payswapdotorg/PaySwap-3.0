/**
 * @payswap/onchain-adapters — base adapter declaration + lifecycle
 * declaration validation (Work Order P4-W3, lane R2-W3; PORT of
 * payswap.org@8a735bf packages/onchain-adapters/src/lifecycle.ts
 * construction-law half).
 *
 * Shared adapter construction law: family/semantics/lifecycle consistency
 * and STRUCTURAL environment derivation (chain identity classifies — a
 * runtime flag can never claim a different class). The lifecycle
 * declaration must be EXPLICIT for every one of the nine stages: an
 * undeclared stage is never guessed.
 */

import { ValidationError } from '../errors.ts';
import { ADAPTER_LIFECYCLE_STAGES } from '../contract/stages.ts';
import type { AdapterStageSupport } from '../contract/stages.ts';
import type { FamilySemanticsProfile } from '../semantics.ts';

/** The neutral asset identity a family resolves for a directive asset. */
export interface ResolvedAssetIdentity {
  /** 3-letter protocol currency symbol (the money-law). */
  readonly symbol: string;
  /** The family-native asset reference (opaque to the core). */
  readonly nativeAssetRef: string;
}

/**
 * Shared adapter construction declaration: the family, the chain, the
 * validated semantics profile, the EXPLICIT lifecycle support table and
 * the injected onchain-security kernel port.
 */
export interface BaseAdapterDeclaration {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly family: 'EVM' | 'SOLANA' | 'UTXO' | 'STELLAR';
  readonly semantics: FamilySemanticsProfile;
  readonly lifecycle: AdapterStageSupport;
}

/** Validates that every lifecycle stage is explicitly declared true/false. */
export function validateLifecycleDeclaration(lifecycle: unknown): AdapterStageSupport {
  if (lifecycle === null || typeof lifecycle !== 'object') {
    throw new ValidationError('adapter lifecycle declaration must be an object');
  }
  const record = lifecycle as Readonly<Record<string, unknown>>;
  const missing = ADAPTER_LIFECYCLE_STAGES.filter(
    (stage) => typeof record[stage] !== 'boolean',
  );
  if (missing.length > 0) {
    throw new ValidationError(
      `adapter lifecycle declaration must be EXPLICIT for every stage — missing/untyped: [${missing.join(', ')}] (an undeclared stage is never guessed)`,
    );
  }
  return record as AdapterStageSupport;
}
