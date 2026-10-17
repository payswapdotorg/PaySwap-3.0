/**
 * STRUCTURAL PIN — the onchain-domain execution directive + signer handle
 * (Work Order P4-W3, lane R2-W3; local structural mirror of
 * payswap.org@8a735bf packages/onchain-domain/src/execution.ts + wallet.ts,
 * reduced to the members the adapter contract reads).
 *
 * The provider-neutral onchain execution directive: `destination`/
 * `spenderRef` are OPAQUE external references; `familyPayload` is an
 * opaque, family-scoped payload owned by the family adapters (the core
 * never interprets it); `signerHandle` references the signing instrument
 * OPAQUELY — key material never enters this contract (rule 25). Required-
 * field coupling is enforced against the pinned operation semantics table.
 */

import { ValidationError } from '../../errors.ts';
import { looksLikeRawKeyMaterial } from '../../secrets.ts';
import { isChainFamily, isValidChainKey } from './family.ts';
import type { ChainFamily } from './family.ts';
import {
  isOnchainOperationKind,
  ONCHAIN_OPERATION_KINDS,
  onchainOperationSemantics,
} from './operations.ts';
import type { OnchainOperationKind } from './operations.ts';

// ---------------------------------------------------------------------------
// The signer handle (opaque — never key material)
// ---------------------------------------------------------------------------

/** Custody model of the referenced signing instrument. */
export const WALLET_CUSTODY_MODELS = [
  'NON_CUSTODIAL_EXTERNAL',
  'NON_CUSTODIAL_LOCAL',
  'SMART_ACCOUNT',
  'CUSTODIAL_PARTNER',
] as const;

export type WalletCustodyModel = (typeof WALLET_CUSTODY_MODELS)[number];

export function isWalletCustodyModel(value: unknown): value is WalletCustodyModel {
  return (
    typeof value === 'string' &&
    (WALLET_CUSTODY_MODELS as readonly unknown[]).includes(value)
  );
}

/** An OPAQUE reference to a signing instrument (never key material). */
export interface SignerHandle {
  readonly handleId: string;
  readonly capabilityInstanceId: string;
  readonly custodyModel: WalletCustodyModel;
  /** Reference to the explicit permission envelope bounding this signer. */
  readonly permissionEnvelopeRef?: string;
  readonly expiresAt?: string;
}

/** Validates a signer handle: opaque ids, declared custody, never key material. */
export function validateSignerHandle(candidate: unknown): SignerHandle {
  const errors: string[] = [];
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('signer handle must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (typeof record.handleId !== 'string' || record.handleId.length === 0) {
    errors.push('handleId must be a non-empty opaque string');
  } else {
    if (record.handleId.length > 256) {
      errors.push('handleId must not exceed 256 characters');
    }
    if (/\s/.test(record.handleId)) {
      errors.push('handleId must not contain whitespace (opaque identifiers never do)');
    }
    if (looksLikeRawKeyMaterial(record.handleId)) {
      errors.push(
        'handleId matches raw 32-byte key material and is rejected: a SignerHandle is an opaque reference, NEVER key material (rule 25)',
      );
    }
  }
  if (typeof record.capabilityInstanceId !== 'string' || record.capabilityInstanceId.length === 0) {
    errors.push(
      'capabilityInstanceId must be a non-empty string referencing the connected capability instance that provides the signer',
    );
  }
  if (!isWalletCustodyModel(record.custodyModel)) {
    errors.push(`custodyModel must be one of [${WALLET_CUSTODY_MODELS.join(', ')}]`);
  }
  if (
    record.permissionEnvelopeRef !== undefined &&
    (typeof record.permissionEnvelopeRef !== 'string' || record.permissionEnvelopeRef.length === 0)
  ) {
    errors.push('permissionEnvelopeRef, when present, must be a non-empty string');
  }
  if (
    record.expiresAt !== undefined &&
    (typeof record.expiresAt !== 'string' || record.expiresAt.length === 0)
  ) {
    errors.push('expiresAt, when present, must be a non-empty timestamp string');
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid signer handle: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return candidate as SignerHandle;
}

// ---------------------------------------------------------------------------
// The exact asset amount
// ---------------------------------------------------------------------------

/** An exact amount in integer minor units, denominated in one asset. */
export interface AssetAmount {
  readonly assetId: string;
  readonly minorUnits: string;
}

const EXACT_DECIMAL = /^(0|[1-9][0-9]*)$/;

export function validateAssetAmount(amount: AssetAmount): void {
  if (amount === null || typeof amount !== 'object') {
    throw new ValidationError('amount must be an exact AssetAmount object');
  }
  const record = amount as unknown as Readonly<Record<string, unknown>>;
  if (typeof record.assetId !== 'string' || record.assetId.length === 0) {
    throw new ValidationError('amount.assetId must be a non-empty string');
  }
  if (typeof record.minorUnits !== 'string' || !EXACT_DECIMAL.test(record.minorUnits)) {
    throw new ValidationError(
      `amount.minorUnits must be a non-negative exact integer decimal string (no floating-point money), got '${String(record.minorUnits)}'`,
    );
  }
}

// ---------------------------------------------------------------------------
// The execution directive
// ---------------------------------------------------------------------------

/**
 * The provider-neutral onchain execution directive. `expiresAt` is
 * mandatory: the authorization kernel evaluates expiry before
 * authorization. Required-field coupling is enforced against the pinned
 * operation semantics table.
 */
export interface OnchainExecutionDirective {
  readonly operation: OnchainOperationKind;
  readonly chainKey: string;
  readonly family: ChainFamily;
  /** Opaque external destination account/contract reference (neutral). */
  readonly destination?: string;
  /** Canonical asset reference being moved/approved/swapped. */
  readonly assetId?: string;
  /** Exact amount in integer minor units. */
  readonly amount?: AssetAmount;
  /** Opaque approved-spender reference (approval operations). */
  readonly spenderRef?: string;
  /** Canonical protocol reference (protocol-scoped operations). */
  readonly protocolRef?: string;
  /** Optional route reference (best-execution route identity). */
  readonly routeRef?: string;
  readonly expiresAt: string;
  readonly signerHandle: SignerHandle;
  /** Opaque family-scoped payload (adapter-owned; the core never interprets it). */
  readonly familyPayload?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates an onchain execution directive against the pinned operation
 * semantics table: operation known, chain/family declared and consistent,
 * expiry declared, signer handle validated (opaque, never key material),
 * amounts exact, and every operation-specific required field present.
 */
export function validateOnchainExecutionDirective(
  candidate: unknown,
): OnchainExecutionDirective {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('onchain execution directive must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];

  if (!isOnchainOperationKind(record.operation)) {
    errors.push(
      `operation must be one of [${ONCHAIN_OPERATION_KINDS.join(', ')}] — undeclared operations never validate`,
    );
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push('chainKey must be a canonical `${namespace}:${network}` chain key');
  }
  if (!isChainFamily(record.family)) {
    errors.push(
      'family must be a declared chain family (see CHAIN_FAMILIES) — declared family semantics are required for family dispatch',
    );
  }
  if (!isNonEmptyString(record.expiresAt)) {
    errors.push(
      'expiresAt is mandatory: the authorization kernel evaluates expiry before authorization',
    );
  }

  try {
    validateSignerHandle(record.signerHandle);
  } catch (error) {
    errors.push(
      `signerHandle is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (isOnchainOperationKind(record.operation)) {
    const semantics = onchainOperationSemantics(record.operation);
    if (semantics.requires.destination && !isNonEmptyString(record.destination)) {
      errors.push(`operation '${record.operation}' requires a destination reference`);
    }
    if (semantics.requires.spender && !isNonEmptyString(record.spenderRef)) {
      errors.push(
        `operation '${record.operation}' requires a spenderRef (the approved spender)`,
      );
    }
    if (semantics.requires.asset && !isNonEmptyString(record.assetId)) {
      errors.push(`operation '${record.operation}' requires an assetId`);
    }
    if (
      semantics.requires.amount &&
      (record.amount === null || record.amount === undefined || typeof record.amount !== 'object')
    ) {
      errors.push(`operation '${record.operation}' requires an exact amount`);
    }
    if (semantics.requires.protocol && !isNonEmptyString(record.protocolRef)) {
      errors.push(
        `operation '${record.operation}' requires a protocolRef (canonical protocol reference)`,
      );
    }
  }
  for (const field of [
    'destination',
    'spenderRef',
    'assetId',
    'protocolRef',
    'routeRef',
  ] as const) {
    if (record[field] !== undefined && !isNonEmptyString(record[field])) {
      errors.push(`${field}, when present, must be a non-empty string`);
    }
  }
  // An amount, whenever present (required or optional), must be exact.
  if (record.amount !== undefined) {
    if (record.amount === null || typeof record.amount !== 'object') {
      errors.push('amount, when present, must be an exact AssetAmount object');
    } else {
      try {
        validateAssetAmount(record.amount as AssetAmount);
        const amountAssetId = (record.amount as Readonly<Record<string, unknown>>).assetId;
        if (!isNonEmptyString(amountAssetId)) {
          errors.push('amount.assetId must be a non-empty string');
        } else if (isNonEmptyString(record.assetId) && amountAssetId !== record.assetId) {
          errors.push(
            "amount.assetId must match the directive's assetId (the amount is denominated in the directive's asset)",
          );
        }
      } catch (error) {
        errors.push(
          `amount is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`Invalid onchain execution directive: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return candidate as OnchainExecutionDirective;
}
