/**
 * @payswap/provider-runtime — branded identifiers (P2-W2).
 *
 * Identifiers are branded strings: structurally strings at runtime, distinct
 * at the type level so a `CommandId` can never be passed where a
 * `ProviderEventId` is expected. Everything is minted through explicit
 * constructors (`as<X>Id`) that enforce non-empty shape; the runtime never
 * invents identifiers from entropy (deterministic battery requirement).
 *
 * INV-05 evidence lineage: the correlation/idempotency identifier set
 * persisted by every effect attempt lives here as types (command id,
 * provider reference, correlation id, event id, fetch id).
 */

import { ValidationError } from './errors.ts';

declare const ConnectionIdBrand: unique symbol;
declare const OperationIdBrand: unique symbol;
declare const CommandIdBrand: unique symbol;
declare const CorrelationIdBrand: unique symbol;
declare const ProviderEventIdBrand: unique symbol;
declare const ProviderReferenceBrand: unique symbol;
declare const RawStateRecordIdBrand: unique symbol;
declare const FetchIdBrand: unique symbol;
declare const AttemptIdBrand: unique symbol;
declare const EffectAttemptIdBrand: unique symbol;

/** Branded id of a connection (one authorized bridge to one provider context). */
export type ConnectionId = string & { readonly [ConnectionIdBrand]: 'ConnectionId' };
/** Branded id of a provider operation contract (endpoint-specific idempotency owner). */
export type OperationId = string & { readonly [OperationIdBrand]: 'OperationId' };
/** Branded id of a PaySwap command/request (the idempotency derivation input). */
export type CommandId = string & { readonly [CommandIdBrand]: 'CommandId' };
/** Branded id tying one economic flow's commands, events and retrievals together. */
export type CorrelationId = string & { readonly [CorrelationIdBrand]: 'CorrelationId' };
/** Branded id of a provider-issued event (webhook dedupe key). */
export type ProviderEventId = string & { readonly [ProviderEventIdBrand]: 'ProviderEventId' };
/** Branded reference to a provider-side object (e.g. `pi_...`, `trf_...`). */
export type ProviderReference = string & { readonly [ProviderReferenceBrand]: 'ProviderReference' };
/** Branded id of one retained raw provider-state record. */
export type RawStateRecordId = string & { readonly [RawStateRecordIdBrand]: 'RawStateRecordId' };
/** Branded id of one controlled provider retrieval (provenance key). */
export type FetchId = string & { readonly [FetchIdBrand]: 'FetchId' };
/** Branded id of one external-effect attempt record. */
export type AttemptId = string & { readonly [AttemptIdBrand]: 'AttemptId' };
/** Alias kept for external naming clarity (same brand as AttemptId). */
export type EffectAttemptId = AttemptId & { readonly [EffectAttemptIdBrand]: 'EffectAttemptId' };

const MAX_ID_LENGTH = 256;

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty string`, { label });
  }
  if (value.length > MAX_ID_LENGTH) {
    throw new ValidationError(`${label} exceeds ${MAX_ID_LENGTH} characters`, { label });
  }
  if (value.trim() !== value) {
    throw new ValidationError(`${label} must not carry surrounding whitespace`, { label });
  }
  return value;
}

function branded<T extends string>(value: string, label: string): T {
  requireNonEmpty(value, label);
  return value as T;
}

/** Construct a branded ConnectionId (validates non-empty, bounded, trimmed). */
export function asConnectionId(value: string): ConnectionId {
  return branded<ConnectionId>(value, 'connectionId');
}
/** Construct a branded OperationId. */
export function asOperationId(value: string): OperationId {
  return branded<OperationId>(value, 'operationId');
}
/** Construct a branded CommandId. */
export function asCommandId(value: string): CommandId {
  return branded<CommandId>(value, 'commandId');
}
/** Construct a branded CorrelationId. */
export function asCorrelationId(value: string): CorrelationId {
  return branded<CorrelationId>(value, 'correlationId');
}
/** Construct a branded ProviderEventId. */
export function asProviderEventId(value: string): ProviderEventId {
  return branded<ProviderEventId>(value, 'providerEventId');
}
/** Construct a branded ProviderReference (external object id). */
export function asProviderReference(value: string): ProviderReference {
  return branded<ProviderReference>(value, 'providerReference');
}
/** Construct a branded RawStateRecordId. */
export function asRawStateRecordId(value: string): RawStateRecordId {
  return branded<RawStateRecordId>(value, 'rawStateRecordId');
}
/** Construct a branded FetchId. */
export function asFetchId(value: string): FetchId {
  return branded<FetchId>(value, 'fetchId');
}
/** Construct a branded AttemptId. */
export function asAttemptId(value: string): AttemptId {
  return branded<AttemptId>(value, 'attemptId');
}
/** Construct a branded EffectAttemptId (same runtime shape as AttemptId). */
export function asEffectAttemptId(value: string): EffectAttemptId {
  return branded<EffectAttemptId>(value, 'effectAttemptId');
}

/** Structural validity predicate for any branded id (untyped sources). */
export function isValidOpaqueId(value: unknown, label: string): boolean {
  try {
    if (typeof value !== 'string') return false;
    requireNonEmpty(value, label);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic FNV-1a 64-bit content fingerprint (hex, 16 chars).
 * BINDING-NEVER-SECURITY (same law as the P1 protocol lanes): used for
 * command-body hashes, replay equality and redaction fingerprints — exact
 * and deterministic, NOT tamper-resistant. Cryptographic strength arrives
 * with the platform/capability crypto owner (P1-W3 finding F-2 lineage).
 */
export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Deterministic canonical JSON (stable key order) for hashing arbitrary JSON-ish values. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Deterministic content hash over the canonical JSON form. */
export function contentHash(value: unknown): string {
  return fnv1a64Hex(canonicalJson(value));
}
