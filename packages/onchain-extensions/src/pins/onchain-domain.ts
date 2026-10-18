/**
 * STRUCTURAL PIN — the onchain-domain chain/asset/protocol vocabulary (Work
 * Order P5-W2, lane R3-W2; local structural mirror of
 * payswap.org@8a735bf packages/onchain-domain/src/{chain,onchain-protocol}
 * .ts + packages/capabilities/src/smart-contract.ts, reconciled with the
 * accepted payswap3-0 pins in onchain-adapters/src/pins/onchain-domain/).
 *
 * The canonical @payswap/onchain-domain package (P4-W1) owns these
 * contracts; the shapes below are LOCAL STRUCTURAL MIRRORS pinned so this
 * package's hermetic battery can construct and validate them offline. Same
 * field names, same literals, zero imports — the TL wires the types at
 * integration (structural compatibility by construction).
 *
 * RECONCILIATION (recorded as deviation D-2 in the evidence record): the
 * accepted 3.0 pins renamed the chain capability id from the old
 * `chain.${chainKey}` to `capability:chain:${chainKey}`; the protocol forms
 * below follow the same accepted convention.
 *
 * This file pins the VOCABULARY + addressing forms; the INV-SC01
 * smart-contract declaration and the protocol descriptor live in
 * pins/smart-contract.ts (their old-repo home was
 * packages/capabilities/src/smart-contract.ts and
 * packages/onchain-domain/src/onchain-protocol.ts respectively).
 */

import { ValidationError } from '../errors.ts';

// ---------------------------------------------------------------------------
// Chain vocabulary (old onchain-domain/src/family.ts + chain.ts)
// ---------------------------------------------------------------------------

export const CHAIN_FAMILIES = Object.freeze([
  'EVM',
  'SOLANA',
  'UTXO',
  'MOVE',
  'COSMOS',
  'SUBSTRATE',
  'OTHER',
] as const);
export type ChainFamily = (typeof CHAIN_FAMILIES)[number];

export function isChainFamily(value: unknown): value is ChainFamily {
  return typeof value === 'string' && (CHAIN_FAMILIES as readonly unknown[]).includes(value);
}

/** Canonical chain key: `${namespace}:${network}`, e.g. `ethereum:mainnet`. */
export const CHAIN_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

export function isValidChainKey(value: unknown): value is string {
  return typeof value === 'string' && CHAIN_KEY_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Protocol vocabulary (old onchain-domain/src/onchain-protocol.ts)
// ---------------------------------------------------------------------------

export const PROTOCOL_CLASSES = Object.freeze([
  'DEX',
  'BRIDGE',
  'INTENT_NETWORK',
  'LENDING',
  'STAKING',
  'STABLECOIN_ISSUER',
  'ESCROW',
  'OTHER',
] as const);
export type ProtocolClass = (typeof PROTOCOL_CLASSES)[number];

export function isProtocolClass(value: unknown): value is ProtocolClass {
  return typeof value === 'string' && (PROTOCOL_CLASSES as readonly unknown[]).includes(value);
}

/** Canonical protocol key (a protocolKey). */
export const PROTOCOL_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isValidProtocolKey(value: unknown): value is string {
  return typeof value === 'string' && PROTOCOL_KEY_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Deterministic addressing (old onchain-domain, reconciled with 3.0 pins)
// ---------------------------------------------------------------------------

/** Deterministic chain capability id (accepted 3.0 pin form). */
export function chainCapabilityId(chainKey: string): string {
  if (!isValidChainKey(chainKey)) {
    throw new ValidationError(
      'chainKey must be canonical to derive the chain capability id',
    );
  }
  return `capability:chain:${chainKey}`;
}

/**
 * Deterministic protocol capability id — one protocol on one chain, one
 * capability identity (the accepted `capability:` convention extended to
 * protocols; the old-repo form was `protocol.${chainKey}:${protocolKey}`).
 */
export function protocolCapabilityId(protocolKey: string, chainKey: string): string {
  if (!isValidProtocolKey(protocolKey)) {
    throw new ValidationError(
      'protocolKey must be canonical to derive the protocol capability id',
    );
  }
  if (!isValidChainKey(chainKey)) {
    throw new ValidationError(
      'chainKey must be canonical to derive the protocol capability id',
    );
  }
  return `capability:protocol:${chainKey}:${protocolKey}`;
}

/** Deterministic protocol reference: `${chainKey}/protocol:${protocolKey}`. */
export function canonicalProtocolRef(protocolKey: string, chainKey: string): string {
  if (!isValidProtocolKey(protocolKey)) {
    throw new ValidationError('protocolKey must be canonical to derive the protocol ref');
  }
  if (!isValidChainKey(chainKey)) {
    throw new ValidationError('chainKey must be canonical to derive the protocol ref');
  }
  return `${chainKey}/protocol:${protocolKey}`;
}

// ---------------------------------------------------------------------------
// Onchain operation kinds (old onchain-domain/src/operations.ts)
// ---------------------------------------------------------------------------

export const ONCHAIN_OPERATION_KINDS = Object.freeze([
  'onchain.transfer',
  'onchain.approval',
  'onchain.contract_call',
  'onchain.swap',
  'onchain.bridge',
  'onchain.intent',
] as const);
export type OnchainOperationKind = (typeof ONCHAIN_OPERATION_KINDS)[number];

export function isOnchainOperationKind(value: unknown): value is OnchainOperationKind {
  return (
    typeof value === 'string' && (ONCHAIN_OPERATION_KINDS as readonly unknown[]).includes(value)
  );
}
