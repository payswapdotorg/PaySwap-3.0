/**
 * @payswap/command — branded identifiers and the PrincipalRef wire mirror
 * (P7-W3).
 *
 * Ids across the command surface (command proposals, transport request ids,
 * correlation conversations, extension instances, session tokens) are
 * branded nominal types: a command id can never be passed where a request
 * id is expected. Branding is compile-time only; runtime validation checks
 * non-empty bounded trimmed strings.
 *
 * `PrincipalRef` is the STRUCTURAL MIRROR of the protocol/trust lane's
 * principal reference wire shape (`{ principalType, principalId }`), pinned
 * LOCALLY byte-identical because this package has ZERO sibling imports
 * (v1 platform pattern; the Tech Lead wires the real import at
 * integration). `securityEpoch` travels as bigint DATA on sessions —
 * never an ambient lookup.
 */

import { ValidationError } from './errors.ts';

declare const CommandIdBrand: unique symbol;
/** Branded id of one command proposal envelope. */
export type CommandId = string & { readonly [CommandIdBrand]: 'CommandId' };

declare const CommandRequestIdBrand: unique symbol;
/** Branded id of one transport-level request (REST/RPC/extension). */
export type CommandRequestId = string & {
  readonly [CommandRequestIdBrand]: 'CommandRequestId';
};

declare const CorrelationIdBrand: unique symbol;
/** Branded correlation conversation id (survives end to end). */
export type CorrelationId = string & {
  readonly [CorrelationIdBrand]: 'CorrelationId';
};

declare const MessageIdBrand: unique symbol;
/** Branded id of one agent-protocol message (A2A/AG-UI). */
export type MessageId = string & { readonly [MessageIdBrand]: 'MessageId' };

declare const ExtensionInstanceIdBrand: unique symbol;
/** Branded id of one browser Extension instance bound to the host page. */
export type ExtensionInstanceId = string & {
  readonly [ExtensionInstanceIdBrand]: 'ExtensionInstanceId';
};

declare const SessionTokenBrand: unique symbol;
/** Branded, validated session token (opaque credential material — INV-19). */
export type SessionToken = string & { readonly [SessionTokenBrand]: 'SessionToken' };

/** Maximum identifier length (shared guard across all branded ids). */
export const MAX_ID_LENGTH = 256;

/**
 * Runtime validation shared by every branded id: non-empty, bounded,
 * whitespace-trimmed string. Returns the branded type.
 */
function brandId<TBranded extends string>(value: string, kind: string): TBranded {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${kind} must be a non-empty string`, { kind, value });
  }
  if (value.length > MAX_ID_LENGTH) {
    throw new ValidationError(`${kind} exceeds ${MAX_ID_LENGTH} characters`, { kind, value });
  }
  if (value.trim() !== value) {
    throw new ValidationError(`${kind} must not carry surrounding whitespace`, { kind, value });
  }
  return value as TBranded;
}

/** Brand a validated string as a `CommandId`. */
export function asCommandId(value: string): CommandId {
  return brandId(value, 'CommandId');
}

/** Brand a validated string as a `CommandRequestId`. */
export function asCommandRequestId(value: string): CommandRequestId {
  return brandId(value, 'CommandRequestId');
}

/** Brand a validated string as a `CorrelationId`. */
export function asCorrelationId(value: string): CorrelationId {
  return brandId(value, 'CorrelationId');
}

/** Brand a validated string as a `MessageId`. */
export function asMessageId(value: string): MessageId {
  return brandId(value, 'MessageId');
}

/** Brand a validated string as an `ExtensionInstanceId`. */
export function asExtensionInstanceId(value: string): ExtensionInstanceId {
  return brandId(value, 'ExtensionInstanceId');
}

/** Brand a validated string as a `SessionToken` (opaque; never logged). */
export function asSessionToken(value: string): SessionToken {
  return brandId(value, 'SessionToken');
}

// ---------------------------------------------------------------------------
// PrincipalRef — the local structural mirror of the protocol wire shape
// ---------------------------------------------------------------------------

/**
 * The authenticated actor reference a command proposal travels for.
 * STRUCTURAL MIRROR (zero sibling imports): `{ principalType, principalId }`
 * pinned byte-identical to the protocol/trust wire shape. The command
 * surface never INTERPRETS principals — authorization is the trust lane's
 * authority; this is an opaque reference.
 */
export interface PrincipalRef {
  readonly principalType: string;
  readonly principalId: string;
}

/** Validate a PrincipalRef shape (fail closed). */
export function validatePrincipalRef(value: unknown): PrincipalRef {
  if (value === null || typeof value !== 'object') {
    throw new ValidationError('principalRef must be an object', { value });
  }
  const candidate = value as Partial<PrincipalRef>;
  if (
    typeof candidate.principalType !== 'string' ||
    candidate.principalType.length === 0 ||
    candidate.principalType.length > MAX_ID_LENGTH
  ) {
    throw new ValidationError(
      `principalRef.principalType must be a non-empty string of at most ${MAX_ID_LENGTH} characters`,
    );
  }
  if (
    typeof candidate.principalId !== 'string' ||
    candidate.principalId.length === 0 ||
    candidate.principalId.length > MAX_ID_LENGTH
  ) {
    throw new ValidationError(
      `principalRef.principalId must be a non-empty string of at most ${MAX_ID_LENGTH} characters`,
    );
  }
  return Object.freeze({ principalType: candidate.principalType, principalId: candidate.principalId });
}

/**
 * Canonical principal reference key, e.g. `user:alice` — the deterministic
 * string form used by scope keys, session material and directory lookups
 * (mirrors the old repository's `principalRef()` string form).
 */
export function principalRefKey(principal: PrincipalRef): string {
  return `${principal.principalType}:${principal.principalId}`;
}
