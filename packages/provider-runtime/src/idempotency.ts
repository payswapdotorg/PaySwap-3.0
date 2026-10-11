/**
 * @payswap/provider-runtime — per-operation idempotency contracts (P2-W2).
 *
 * Wise §4.4 (advisory, mapped to this Work Order): "Implement idempotency
 * according to each provider operation's actual contract. Do not assume a
 * universal header or one global key scope." This module owns the
 * PER-OPERATION contract registry — there is NO universal mechanism:
 *
 * - KEY SCOPE: which dimensions the provider's idempotency semantics key
 *   on (per-connection/account namespace? per-endpoint? does the provider
 *   dedupe at all?).
 * - KEY DERIVATION: how the outbound key is derived from PaySwap's command
 *   id (namespaced deterministic derivation, caller-supplied provider
 *   field, or provider-assigned echo).
 * - PROVIDER EVIDENCE FIELD: when the provider carries its own per-endpoint
 *   idempotency field (customerTransactionId-style), the field NAME is
 *   provider evidence recorded per operation — never a PaySwap constant.
 * - REPLAY BEHAVIOR: what the provider does on duplicate keys.
 * - CONFLICT REPORTING: same key + different body → a typed conflict, an
 *   error state, never a silent success and never a re-execution.
 *
 * Fail-closed law (INV-06): a STATE_CHANGING command for an operation with
 * NO registered contract is REFUSED — operations do not fall back to any
 * default mechanism. The registrar (the decision point) lives in
 * idempotency-registrar.ts.
 */

import { ValidationError } from './errors.ts';


/** How the outbound idempotency key is derived from PaySwap's command. */
export const IDEMPOTENCY_KEY_DERIVATIONS = [
  'NAMESPACED_COMMAND_ID',
  'CALLER_SUPPLIED_PROVIDER_FIELD',
  'PROVIDER_ASSIGNED_ECHO',
] as const;

export type IdempotencyKeyDerivation = (typeof IDEMPOTENCY_KEY_DERIVATIONS)[number];

export function isIdempotencyKeyDerivation(value: unknown): value is IdempotencyKeyDerivation {
  return (
    typeof value === 'string' && (IDEMPOTENCY_KEY_DERIVATIONS as readonly unknown[]).includes(value)
  );
}

/** What the provider does when the same key is submitted again. */
export const IDEMPOTENCY_REPLAY_BEHAVIORS = [
  'REPLAYS_ORIGINAL_RESULT',
  'HARMLESS_NOOP_ACKNOWLEDGEMENT',
] as const;

export type IdempotencyReplayBehavior = (typeof IDEMPOTENCY_REPLAY_BEHAVIORS)[number];

export function isIdempotencyReplayBehavior(value: unknown): value is IdempotencyReplayBehavior {
  return (
    typeof value === 'string' &&
    (IDEMPOTENCY_REPLAY_BEHAVIORS as readonly unknown[]).includes(value)
  );
}

/**
 * The per-operation idempotency contract. One of these MUST be registered
 * for every state-changing operation the bridge will dispatch.
 */
export interface OperationIdempotencyContract {
  readonly operationId: string;
  /**
   * Key scope dimensions the provider treats the key as unique within.
   * The registrar always folds in the operation id; these name the extra
   * provider-side dimensions (connection = per-account namespace).
   */
  readonly keyScope: {
    /** Key namespace is per connection/account (true for account-scoped providers). */
    readonly connection: boolean;
    /** Key namespace is per endpoint/operation (true when providers scope keys per route). */
    readonly operation: boolean;
  };
  readonly keyDerivation: IdempotencyKeyDerivation;
  readonly replayBehavior: IdempotencyReplayBehavior;
  /** How same-key/different-body is surfaced by the provider. */
  readonly conflictReporting: 'PROVIDER_CONFLICT_SIGNAL' | 'LOCAL_CONFLICT_DETECTION';
  /**
   * The provider's own per-endpoint idempotency field name when one exists
   * (customerTransactionId-style) — PROVIDER EVIDENCE, not a PaySwap
   * constant; absent when the provider has no such field.
   */
  readonly providerEvidenceField?: string;
  readonly notes?: string;
}

/** Registry of per-operation contracts (fail-closed lookup). */
export class IdempotencyContractRegistry {
  private readonly contracts = new Map<string, OperationIdempotencyContract>();

  register(contract: OperationIdempotencyContract): OperationIdempotencyContract {
    if (contract === null || typeof contract !== 'object') {
      throw new ValidationError('idempotency contract must be an object');
    }
    if (typeof contract.operationId !== 'string' || contract.operationId.length === 0) {
      throw new ValidationError('idempotency contract requires an operationId');
    }
    if (!isIdempotencyKeyDerivation(contract.keyDerivation)) {
      throw new ValidationError('idempotency contract requires a canonical keyDerivation');
    }
    if (!isIdempotencyReplayBehavior(contract.replayBehavior)) {
      throw new ValidationError('idempotency contract requires a canonical replayBehavior');
    }
    if (
      contract.conflictReporting !== 'PROVIDER_CONFLICT_SIGNAL' &&
      contract.conflictReporting !== 'LOCAL_CONFLICT_DETECTION'
    ) {
      throw new ValidationError('idempotency contract requires canonical conflictReporting');
    }
    if (
      contract.keyDerivation === 'CALLER_SUPPLIED_PROVIDER_FIELD' &&
      (typeof contract.providerEvidenceField !== 'string' || contract.providerEvidenceField.length === 0)
    ) {
      throw new ValidationError(
        'CALLER_SUPPLIED_PROVIDER_FIELD derivation requires the provider field name (provider evidence)',
      );
    }
    const frozen: {
      -readonly [K in keyof OperationIdempotencyContract]: OperationIdempotencyContract[K];
    } = {
      operationId: contract.operationId,
      keyScope: Object.freeze({ ...contract.keyScope }),
      keyDerivation: contract.keyDerivation,
      replayBehavior: contract.replayBehavior,
      conflictReporting: contract.conflictReporting,
    };
    if (contract.providerEvidenceField !== undefined) {
      frozen.providerEvidenceField = contract.providerEvidenceField;
    }
    if (contract.notes !== undefined) {
      frozen.notes = contract.notes;
    }
    const sealed = Object.freeze(frozen);
    const existing = this.contracts.get(contract.operationId);
    if (existing !== undefined) {
      if (JSON.stringify(existing) !== JSON.stringify(sealed)) {
        throw new ValidationError(
          `a DIFFERENT idempotency contract is already registered for operation '${contract.operationId}'`,
        );
      }
      return existing; // idempotent re-registration of the identical contract
    }
    this.contracts.set(contract.operationId, sealed);
    return sealed;
  }

  /** Fail-closed lookup: state-changing operations without contracts cannot run. */
  require(operationId: string): OperationIdempotencyContract {
    const contract = this.contracts.get(operationId);
    if (contract === undefined) {
      throw new ValidationError(
        `INV-06 fail-closed: no idempotency contract registered for operation '${operationId}' (there is NO universal fallback)`,
        { operationId },
      );
    }
    return contract;
  }

  has(operationId: string): boolean {
    return this.contracts.has(operationId);
  }

  list(): readonly OperationIdempotencyContract[] {
    return [...this.contracts.values()];
  }
}

/**
 * Derive the outbound idempotency key per the operation's contract.
 * Deterministic: the same command id always derives the same key under the
 * same contract (NAMESPACED_COMMAND_ID derives `payswap:<commandId>` —
 * namespaced so a protocol key can never collide with an unrelated
 * provider-side key; the old repo's Stripe connector used exactly this
 * discipline for the Stripe Idempotency-Key header).
 */
export function deriveIdempotencyKey(
  contract: OperationIdempotencyContract,
  commandId: string,
): string {
  if (typeof commandId !== 'string' || commandId.length === 0) {
    throw new ValidationError('idempotency key derivation requires a command id');
  }
  switch (contract.keyDerivation) {
    case 'NAMESPACED_COMMAND_ID':
      return `payswap:${commandId}`;
    case 'CALLER_SUPPLIED_PROVIDER_FIELD':
    case 'PROVIDER_ASSIGNED_ECHO':
      // The key equals the caller-supplied command id verbatim: the
      // provider's own field carries it (provider evidence semantics).
      return commandId;
    default:
      throw new ValidationError('unknown key derivation');
  }
}

