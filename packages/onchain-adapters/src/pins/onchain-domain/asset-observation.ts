/**
 * STRUCTURAL PIN — the onchain-domain asset observation (Work Order P4-W3,
 * lane R2-W3; local structural mirror of payswap.org@8a735bf
 * packages/onchain-domain/src/asset.ts observation contracts).
 *
 * External asset positions are OBSERVATIONS (never custody, never a
 * balance): the non-custody law carried from the old repo and canonical in
 * spec/architecture/NON-CUSTODY.md. The adapter produces these from
 * read-only rail state with freshness + provenance.
 */

import { ValidationError } from '../../errors.ts';
import { isValidChainKey } from './family.ts';

/** How the observation was served. */
export type AssetObserverKind = 'RPC_PROVIDER' | 'INDEXER' | 'EXPLORER';

/** An OBSERVATION of an external asset position (never a balance). */
export interface AssetObservation {
  readonly observationKind: 'AssetObservation';
  readonly observationId: string;
  readonly observedAt: string;
  readonly assetId: string;
  readonly chainKey: string;
  /** Where the position was observed (chain + account). */
  readonly location: {
    readonly chainKey: string;
    readonly accountRef: string;
  };
  /** The observed amount: asset identity + exact integer minor units. */
  readonly observedAmount: {
    readonly currency: string;
    readonly minorUnits: string;
  };
  /** Freshness window (the observation is data, with an expiry). */
  readonly freshness: {
    readonly asOf: string;
    readonly maxAgeSeconds: number;
  };
  readonly provenance: {
    readonly providerName: string;
    readonly source: 'PROVIDER_API' | 'PROVIDER_WEBHOOK' | 'OPERATOR';
    readonly capturedAt: string;
  };
  readonly observer: {
    readonly observerId: string;
    readonly observerKind: AssetObserverKind;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const EXACT_DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Validates an asset observation (fail closed; never fabricates positions). */
export function validateAssetObservation(candidate: unknown): AssetObservation {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('asset observation must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (record.observationKind !== 'AssetObservation') {
    errors.push("observationKind must be 'AssetObservation'");
  }
  for (const field of ['observationId', 'observedAt', 'assetId'] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push('chainKey must be a canonical chain key');
  }
  const location = record.location as Readonly<Record<string, unknown>> | undefined;
  if (
    location === null ||
    typeof location !== 'object' ||
    !isNonEmptyString(location.chainKey) ||
    !isNonEmptyString(location.accountRef)
  ) {
    errors.push('location must carry a canonical chainKey and an accountRef');
  }
  const amount = record.observedAmount as Readonly<Record<string, unknown>> | undefined;
  if (
    amount === null ||
    typeof amount !== 'object' ||
    !isNonEmptyString(amount.currency) ||
    typeof amount.minorUnits !== 'string' ||
    !EXACT_DECIMAL.test(amount.minorUnits)
  ) {
    errors.push(
      'observedAmount must carry a currency and an exact integer minorUnits string (no floating-point positions)',
    );
  }
  const freshness = record.freshness as Readonly<Record<string, unknown>> | undefined;
  if (
    freshness === null ||
    typeof freshness !== 'object' ||
    !isNonEmptyString(freshness.asOf) ||
    typeof freshness.maxAgeSeconds !== 'number' ||
    !Number.isFinite(freshness.maxAgeSeconds) ||
    freshness.maxAgeSeconds < 0
  ) {
    errors.push('freshness must carry an asOf instant and a non-negative maxAgeSeconds');
  }
  const provenance = record.provenance as Readonly<Record<string, unknown>> | undefined;
  if (
    provenance === null ||
    typeof provenance !== 'object' ||
    !isNonEmptyString(provenance.providerName) ||
    !isNonEmptyString(provenance.capturedAt)
  ) {
    errors.push('provenance is MANDATORY on every asset observation');
  }
  const observer = record.observer as Readonly<Record<string, unknown>> | undefined;
  if (
    observer === null ||
    typeof observer !== 'object' ||
    !isNonEmptyString(observer.observerId) ||
    (observer.observerKind !== 'RPC_PROVIDER' &&
      observer.observerKind !== 'INDEXER' &&
      observer.observerKind !== 'EXPLORER')
  ) {
    errors.push('observer must carry an observerId and a declared observerKind');
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid asset observation: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return candidate as AssetObservation;
}
