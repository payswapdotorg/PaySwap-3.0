/**
 * @payswap/onchain-domain — smart-contract protocol definitions,
 * implementations and connected instances (P4-W1, lane R2-W1; ADAPT of
 * payswap.org@8a735bf packages/onchain-domain/src/onchain-protocol.ts).
 *
 * A protocol is a deployed smart-contract system on a chain (a DEX, a
 * bridge, a lending market, an intent network…). Protocol contracts reuse
 * the canonical vocabulary through LOCAL STRUCTURAL PINS (zero sibling
 * imports, the v1 rails-layer law):
 *
 * - the smart-contract declaration (source/bytecode provenance,
 *   upgrade/admin/pause/oracle/custody properties — the
 *   declaration-completeness law, NON-CUSTODY.md) is the capability
 *   fabric's `SmartContractExtension`, re-declared as the LOCAL
 *   subset-typed structural pin `SmartContractExtensionPin`
 *   (src/pins-smart-contract.ts) — reused verbatim, never duplicated;
 * - the layer structure is the canonical capability hierarchy via the
 *   src/pins.ts mirrors: ProtocolDefinition extends the pinned EXECUTABLE
 *   definition arm (a protocol's capabilities execute consequential writes —
 *   the fourteen-part executable declaration itself is the capability
 *   lane's law and stays opaque here), ProtocolImplementation extends the
 *   pinned ProviderImplementation subset, ConnectedProtocolInstance extends
 *   the pinned ConnectedInstancePin (the only protocol-shaped authorization
 *   scope).
 *
 * Deterministic identity: a protocol reference is
 * `${chainKey}/protocol:${protocolKey}` and a protocol definition's id is
 * `protocol.${chainKey}:${protocolKey}` — enforced by the validator.
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import { isValidChainKey } from "./family.ts";
import type {
  PinnedExecutableDefinition,
  ProviderImplementationPin,
  ConnectedInstancePin,
} from "./pins.ts";
import {
  validateSmartContractExtensionPin,
} from "./pins-smart-contract.ts";
import type { SmartContractExtensionPin } from "./pins-smart-contract.ts";
import {
  validatePinnedConnectedInstance,
  validatePinnedDefinitionBase,
  validatePinnedProviderImplementation,
} from "./pins-validation.ts";

// ---------------------------------------------------------------------------
// Protocol classes
// ---------------------------------------------------------------------------

export const PROTOCOL_CLASSES = [
  "DEX",
  "BRIDGE",
  "INTENT_NETWORK",
  "LENDING",
  "STAKING",
  "STABLECOIN_ISSUER",
  "ESCROW",
  "OTHER",
] as const;

export type ProtocolClass = (typeof PROTOCOL_CLASSES)[number];

// ---------------------------------------------------------------------------
// The protocol descriptor (composes the pinned smart-contract declaration)
// ---------------------------------------------------------------------------

/** Canonical protocol key format. */
export const PROTOCOL_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * A smart-contract protocol descriptor: canonical identity, class, chain
 * scope and the CANONICAL smart-contract declarations of every contract the
 * protocol comprises. Every contract must declare its full
 * source/bytecode provenance, upgrade/admin/pause/oracle/custody
 * properties — an undeclared property is rejected by the pinned validator,
 * never assumed (the declaration-completeness law).
 */
export interface ProtocolDescriptor {
  /** Canonical protocol identity, e.g. `uniswap:v3`. */
  readonly protocolKey: string;
  readonly displayName: string;
  readonly protocolClass: ProtocolClass;
  readonly chainKey: string;
  /** At least one canonical smart-contract declaration. */
  readonly smartContracts: readonly SmartContractExtensionPin[];
}

/** Deterministic protocol reference: `${chainKey}/protocol:${protocolKey}`. */
export function canonicalProtocolRef(protocolKey: string, chainKey: string): string {
  return `${chainKey}/protocol:${protocolKey}`;
}

/** Deterministic protocol capability id: `protocol.${chainKey}:${protocolKey}`. */
export function protocolCapabilityId(protocolKey: string, chainKey: string): string {
  return `protocol.${chainKey}:${protocolKey}`;
}

// ---------------------------------------------------------------------------
// Layer 1 — ProtocolDefinition (descriptive catalogue; never authority)
// ---------------------------------------------------------------------------

/**
 * A protocol as a descriptive catalogue entry (the pinned EXECUTABLE arm:
 * a protocol's capabilities execute consequential writes; the definition
 * itself carries NO authorization scope — execution requires a
 * ConnectedProtocolInstance). Deterministic identity:
 * id === `protocol.${chainKey}:${protocolKey}`.
 */
export interface ProtocolDefinition extends PinnedExecutableDefinition {
  readonly protocol: ProtocolDescriptor;
}

// ---------------------------------------------------------------------------
// Layer 2 — ProtocolImplementation
// ---------------------------------------------------------------------------

/** A provider's concrete implementation of a protocol capability (layer 2 pin). */
export interface ProtocolImplementation extends ProviderImplementationPin {
  readonly protocolKey: string;
  readonly chainKey: string;
}

// ---------------------------------------------------------------------------
// Layer 3 — ConnectedProtocolInstance (the ONLY protocol-shaped authorization scope)
// ---------------------------------------------------------------------------

/**
 * A genuinely connected protocol instance (layer 3 pin): the full
 * ConnectedInstancePin scope (INV-13) plus the protocol identity.
 * Execution against a protocol requires THIS shape; a ProtocolDefinition
 * never substitutes (the catalogue never authorizes).
 */
export interface ConnectedProtocolInstance extends ConnectedInstancePin {
  readonly protocolKey: string;
  readonly chainKey: string;
}

// ---------------------------------------------------------------------------
// Validators (implementation)
// ---------------------------------------------------------------------------

/** Guard: a declared protocol class. */
export function isProtocolClass(value: unknown): value is ProtocolClass {
  return (
    typeof value === "string" &&
    (PROTOCOL_CLASSES as readonly unknown[]).includes(value)
  );
}

/**
 * Validates a protocol descriptor. Rules:
 * - protocolKey is canonical; chainKey is canonical;
 * - at least one smart contract is declared;
 * - EVERY contract passes the pinned smart-contract declaration validator
 *   (reused — never duplicated here);
 * - every declared contract's chainRef equals the descriptor's chainKey
 *   (a protocol's contracts live on its chain).
 */
export function validateProtocolDescriptor(candidate: unknown): ProtocolDescriptor {
  if (!isRecord(candidate)) {
    throw new ValidationError("protocol descriptor must be an object");
  }
  const record = candidate;
  if (!isNonEmptyString(record.protocolKey) || !PROTOCOL_KEY_PATTERN.test(record.protocolKey)) {
    throw new ValidationError(
      "protocolKey must match /^[a-z0-9][a-z0-9._-]{0,63}$/ (e.g. 'uniswap:v3')",
    );
  }
  if (!isNonEmptyString(record.displayName)) {
    throw new ValidationError("displayName must be a non-empty string");
  }
  if (!isProtocolClass(record.protocolClass)) {
    throw new ValidationError(`protocolClass must be one of [${PROTOCOL_CLASSES.join(", ")}]`);
  }
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError("chainKey must be a canonical `${namespace}:${network}` chain key");
  }
  const contracts = record.smartContracts;
  if (!Array.isArray(contracts) || contracts.length === 0) {
    throw new ValidationError(
      "a protocol must declare at least one smart contract (smart-contract declarations are never empty)",
    );
  }
  const validated: SmartContractExtensionPin[] = [];
  for (const [index, contract] of contracts.entries()) {
    const declaration = validateSmartContractExtensionPin(contract);
    if (declaration.chainRef !== record.chainKey) {
      throw new ValidationError(
        `smartContracts[${index}] declares chainRef '${declaration.chainRef}' which does not match the protocol chain '${String(record.chainKey)}' — a protocol's contracts live on its chain`,
      );
    }
    validated.push(declaration);
  }
  return Object.freeze({
    protocolKey: record.protocolKey,
    displayName: record.displayName,
    protocolClass: record.protocolClass,
    chainKey: record.chainKey,
    smartContracts: Object.freeze(validated),
  });
}

/**
 * Runtime validation for a protocol definition: the pinned catalogue base
 * (the EXECUTABLE arm — a protocol's capabilities execute consequential
 * writes), the protocol descriptor, and the deterministic identity rule
 * (`id === protocol.${chainKey}:${protocolKey}`).
 */
export function validateProtocolDefinition(candidate: unknown): ProtocolDefinition {
  const base = validatePinnedDefinitionBase(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (base.executable !== true) {
    throw new ValidationError(
      "a ProtocolDefinition is an executable catalogue capability and must declare executable true (its capabilities execute consequential writes; the definition itself still carries no authorization scope)",
    );
  }
  const descriptor = validateProtocolDescriptor(record.protocol);
  const expectedId = protocolCapabilityId(descriptor.protocolKey, descriptor.chainKey);
  if (base.id !== expectedId) {
    throw new ValidationError(
      `protocol definition identity is deterministic: id must be '${expectedId}' for protocol '${descriptor.protocolKey}' on chain '${descriptor.chainKey}'`,
    );
  }
  return Object.freeze({ ...base, executable: true, protocol: descriptor });
}

/** Runtime validation for a protocol implementation (the pinned layer-2 subset + identity). */
export function validateProtocolImplementation(candidate: unknown): ProtocolImplementation {
  const base = validatePinnedProviderImplementation(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!isNonEmptyString(record.protocolKey) || !PROTOCOL_KEY_PATTERN.test(record.protocolKey)) {
    throw new ValidationError("protocolKey must be canonical");
  }
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError("chainKey must be a canonical chain key");
  }
  return Object.freeze({
    ...base,
    protocolKey: record.protocolKey,
    chainKey: record.chainKey,
  }) as ProtocolImplementation;
}

/**
 * Runtime validation for a connected protocol instance: the full pinned
 * INV-13 scope, the protocol identity, and the deterministic protocol
 * capability id linkage.
 */
export function validateConnectedProtocolInstance(
  candidate: unknown,
): ConnectedProtocolInstance {
  const base = validatePinnedConnectedInstance(candidate);
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!isNonEmptyString(record.protocolKey) || !PROTOCOL_KEY_PATTERN.test(record.protocolKey)) {
    throw new ValidationError("protocolKey must be canonical");
  }
  if (!isValidChainKey(record.chainKey)) {
    throw new ValidationError("chainKey must be a canonical chain key");
  }
  const expectedId = protocolCapabilityId(record.protocolKey as string, record.chainKey as string);
  if (base.capabilityId !== expectedId) {
    throw new ValidationError(
      `connected protocol instance must reference the deterministic protocol capability id '${expectedId}'`,
    );
  }
  return Object.freeze({
    ...base,
    protocolKey: record.protocolKey as string,
    chainKey: record.chainKey as string,
  });
}
