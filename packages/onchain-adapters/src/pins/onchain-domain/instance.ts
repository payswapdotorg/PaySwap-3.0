/**
 * STRUCTURAL PIN — the onchain-domain connected chain instance + execution
 * scope (Work Order P4-W3, lane R2-W3; local structural mirror of
 * payswap.org@8a735bf packages/onchain-domain/src/chain.ts, reduced to a
 * structural SUPERtype view of the canonical ConnectedChainInstance — the
 * agents-lane AuthorityEpochState pattern: the real instance shape remains
 * assignable to this view, so no drift is possible without a typecheck
 * failure at TL integration).
 *
 * The catalogue-never-authorizes discipline is enforced here: execution
 * against a chain requires a GENUINELY CONNECTED instance; chain catalogue
 * shapes (a chain descriptor without an instance identity) are rejected.
 */

import { ValidationError } from '../../errors.ts';
import { isChainFamily, isValidChainKey } from './family.ts';

/**
 * The structural view of a genuinely connected chain instance: the full
 * connected-capability scope is OPAQUE passthrough here (authorization /
 * credential / eligibility state the capability lane owns); the adapter
 * contract reads only the execution-relevant members — instance identity,
 * capability binding, chain identity, family and the optional family
 * extension.
 */
export interface ConnectedChainInstance {
  /** Instance identity (a catalogue shape carries none — see below). */
  readonly instanceId: string;
  /** The capability this instance binds to (deterministic per chain). */
  readonly capabilityId: string;
  readonly chainKey: string;
  readonly family: 'EVM' | 'SOLANA' | 'UTXO' | (string & {});
  /** Optional family-scoped instance extension — never required. */
  readonly familyExtension?: unknown;
}

/**
 * Deterministic chain-capability id for a chainKey (the capability-lane
 * binding law: one chain, one capability identity).
 */
export function chainCapabilityId(chainKey: string): string {
  if (!isValidChainKey(chainKey)) {
    throw new ValidationError(
      'chainKey must be canonical to derive the chain capability id',
    );
  }
  return `capability:chain:${chainKey}`;
}

/**
 * Structural discrimination: is this value a chain catalogue shape (a chain
 * descriptor) rather than a connected instance? Deterministic rules: it
 * carries chain identity (a canonical chainKey and/or family) but NO
 * instanceId.
 */
export function isChainCatalogueShape(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.instanceId !== undefined) {
    return false;
  }
  const carriesChainIdentity =
    isValidChainKey(record.chainKey) ||
    isChainFamily(record.family) ||
    record.finalitySemantics !== undefined ||
    record.chainDescriptor !== undefined;
  return carriesChainIdentity;
}

/**
 * Runtime validation of a connected chain instance (the structural view):
 * instance identity present, chain key canonical, family declared, and the
 * capability binding is the deterministic chain capability id.
 */
export function validateConnectedChainInstance(candidate: unknown): ConnectedChainInstance {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('connected chain instance must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (typeof record.instanceId !== 'string' || record.instanceId.length === 0) {
    throw new ValidationError(
      'a connected chain instance requires a non-empty instanceId — catalogue shapes never authorize execution',
    );
  }
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError(
      'chainKey must be a canonical `${namespace}:${network}` chain key',
    );
  }
  if (!isChainFamily(record.family)) {
    throw new ValidationError('family must be a declared chain family (see CHAIN_FAMILIES)');
  }
  if (record.capabilityId !== chainCapabilityId(record.chainKey)) {
    throw new ValidationError(
      `connected chain instance must reference the deterministic chain capability id '${chainCapabilityId(record.chainKey)}' for chainKey '${record.chainKey}'`,
    );
  }
  return candidate as ConnectedChainInstance;
}

/**
 * Execution-scope assertion (catalogue never authorizes): the value
 * presented as the executing capability must be a genuinely connected chain
 * instance. Chain catalogue shapes are rejected with the explicit
 * catalogue-never-authorizes error.
 */
export function assertOnchainExecutionScope(
  value: unknown,
): asserts value is ConnectedChainInstance {
  if (isChainCatalogueShape(value)) {
    throw new ValidationError(
      'a chain catalogue shape was presented where a genuinely connected chain instance is required — the catalogue never authorizes execution (INV-C05); connect the instance first',
    );
  }
  validateConnectedChainInstance(value);
}
