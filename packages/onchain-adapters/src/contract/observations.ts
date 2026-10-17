/**
 * @payswap/onchain-adapters — adapter observation shapes (Work Order
 * P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/contract.ts observation contracts).
 *
 * Provenance is call-level and sanitized (which endpoint served the
 * observation — never secrets). Unreachable rails surface availability
 * UNKNOWN — never success or failure. External asset positions are
 * OBSERVATIONS (never custody, never a balance).
 */

import type { RailEnvironmentClass } from '../environment.ts';
import type { AssetObservation } from '../pins/onchain-domain/asset-observation.ts';

/** Who served an adapter observation (call-level, sanitized — never secrets). */
export interface AdapterProvenance {
  readonly transportId: string;
  readonly endpointId: string;
  readonly providerName: string;
  readonly capturedAt: string;
  readonly adapterId: string;
  readonly environmentClass: RailEnvironmentClass;
}

/** A neutral chain-head observation (read-only rail state). */
export interface ChainHeadObservation {
  readonly observationKind: 'ChainHeadObservation';
  readonly chainKey: string;
  readonly environmentClass: RailEnvironmentClass;
  /** Neutral height: block number (EVM/UTXO) or slot (SOLANA). */
  readonly height: number;
  /** Opaque external head reference (block hash / blockhash). */
  readonly headHash: string;
  readonly observedAt: string;
  readonly provenance: AdapterProvenance;
  /** Declared maximum age (seconds) before this head is stale for acting. */
  readonly maxAgeSeconds: number;
}

/** An unreachable rail means availability UNKNOWN — never failure. */
export interface UnreachableRailObservation {
  readonly kind: 'RAIL_UNREACHABLE';
  readonly availability: 'UNKNOWN';
  readonly chainKey: string;
  readonly transportId: string;
  readonly attemptedEndpointIds: readonly string[];
  readonly message: string;
  readonly at: string;
}

export type ChainHeadProbe =
  | { readonly kind: 'HEAD_OBSERVED'; readonly head: ChainHeadObservation }
  | UnreachableRailObservation;

/** Why an asset position could not be observed (never fabricated). */
export type AssetPositionUnobservableReason =
  | 'RAIL_UNREACHABLE'
  | 'PROVIDER_REJECTED_ACCOUNT'
  | 'ASSET_BINDING_UNKNOWN';

export type AssetPositionProbe =
  | { readonly kind: 'POSITION_OBSERVED'; readonly observation: AssetObservation }
  | {
      readonly kind: 'POSITION_UNOBSERVABLE';
      readonly reason: AssetPositionUnobservableReason;
      readonly message: string;
      readonly chainKey: string;
      readonly at: string;
    };
