/**
 * @payswap/command — the developer session contract (P7-W3).
 *
 * ADAPTED from the old repository's multi-tenant identity/session flows
 * (@payswap/api identity.ts) onto the typed-contract doctrine:
 *
 * - the CONTRACTS are the wire shapes (Tenant, IdentityRecord, Session,
 *   SessionLookup with its fail-closed reason vocabulary) plus the
 *   deterministic decision table (`evaluateSessionStatus`) — the
 *  stateful SessionManager store is NOT ported (D-record: the
 *   composition root owns stores; the decision LAWS are the contract);
 * - a session binds principal + tenant + security epoch AT ISSUE TIME; a
 *   session whose principal's credential epoch has been raised (a
 *   revocation event) is stale and fails closed on lookup — a stale
 *   credential can never authorize a sensitive action;
 * - token issuance is DETERMINISTIC: the canonical session material is
 *   HMAC-SHA256-signed via the INJECTED HmacPort using an injected key,
 *   the injected clock's strictly increasing monotonic sequence and the
 *   injected issuance time — ambient entropy and host randomness are
 *   never used. Same inputs + same clock state => same token;
 * - agent principals authenticate via agent keys, NOT tenant sessions;
 * - timestamps (issuedAtMs/expiresAtMs/registeredAtMs) are bigint DATA.
 */

import { ValidationError } from './errors.ts';
import { canonicalJson } from './canonical.ts';
import type { HmacPort } from './ports.ts';
import type { PrincipalRef, SessionToken } from './identifiers.ts';
import { validatePrincipalRef } from './identifiers.ts';

/** A tenant of the multi-tenant developer API surface. */
export interface Tenant {
  readonly tenantId: string;
  readonly name: string;
}

/** A registered identity: a tenant-local principal mapping (user or service). */
export interface IdentityRecord {
  readonly tenantId: string;
  /** The trust principal this identity maps to (user or service kind). */
  readonly principal: PrincipalRef;
  readonly displayName: string;
  /** Registration time as bigint DATA. */
  readonly registeredAtMs: bigint;
}

/**
 * An issued session. Binds principal + tenant + security epoch at issue
 * time — the epoch is the principal's credential epoch the session was
 * minted under.
 */
export interface Session {
  readonly token: SessionToken;
  readonly tenantId: string;
  readonly principal: PrincipalRef;
  /** Security epoch of the principal's credential at issue time. */
  readonly securityEpoch: bigint;
  readonly issuedAtMs: bigint;
  readonly expiresAtMs: bigint;
}

/**
 * Result of a session lookup. Invalid sessions fail closed, with a reason:
 * UNKNOWN_TOKEN | REVOKED | EXPIRED | STALE_SECURITY_EPOCH (the vocabulary
 * is the contract; the order of checks is the contract).
 */
export type SessionLookup =
  | { readonly valid: true; readonly session: Session }
  | {
      readonly valid: false;
      readonly reason: 'UNKNOWN_TOKEN' | 'REVOKED' | 'EXPIRED' | 'STALE_SECURITY_EPOCH';
    };

/**
 * The session manager CONTRACT (typed shape — the port a composition root
 * fulfills with a real store). Fail-closed lookup, revocation by token and
 * by principal.
 */
export interface SessionManagerContract {
  issueSession(input: {
    readonly tenantId: string;
    readonly principal: PrincipalRef;
    readonly ttlMs: bigint | number;
  }): Session;
  lookupSession(token: string): SessionLookup;
  revokeSession(token: string): boolean;
  revokePrincipalSessions(principal: PrincipalRef): number;
}

// ---------------------------------------------------------------------------
// Validation laws (fail closed)
// ---------------------------------------------------------------------------

function requireNonEmpty(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
}

/** Validate a Tenant shape. */
export function validateTenant(tenant: Tenant): Tenant {
  requireNonEmpty(tenant.tenantId, 'tenant.tenantId');
  requireNonEmpty(tenant.name, 'tenant.name');
  return tenant;
}

/**
 * Validate an identity for session issuance. The agent-principal law: an
 * `agent` principalRef is rejected — agents authenticate via agent keys,
 * not tenant sessions.
 */
export function validateSessionIssuableIdentity(identity: IdentityRecord): IdentityRecord {
  requireNonEmpty(identity.tenantId, 'identity.tenantId');
  requireNonEmpty(identity.displayName, 'identity.displayName');
  validatePrincipalRef(identity.principal);
  if (typeof identity.registeredAtMs !== 'bigint') {
    throw new ValidationError('identity.registeredAtMs must be bigint DATA (milliseconds)');
  }
  if (identity.principal.principalType === 'agent') {
    throw new ValidationError(
      'agent principals authenticate via agent keys, not tenant sessions (the agent-interaction boundary owns agent authentication)',
    );
  }
  return identity;
}

/** Validate a session TTL: a positive integer number of milliseconds. */
export function validateSessionTtl(ttlMs: bigint | number): bigint {
  if (typeof ttlMs === 'number') {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new ValidationError('ttlMs must be a positive integer number of milliseconds');
    }
    return BigInt(ttlMs);
  }
  if (ttlMs <= 0n) {
    throw new ValidationError('ttlMs must be a positive bigint of milliseconds');
  }
  return ttlMs;
}

// ---------------------------------------------------------------------------
// The fail-closed decision table (pure)
// ---------------------------------------------------------------------------

/**
 * THE SESSION LOOKUP DECISION TABLE (pure, deterministic — the order of
 * checks is the contract):
 * 1. REVOKED — a revoked token fails closed before anything else;
 * 2. EXPIRED — `nowMs >= expiresAt` fails closed;
 * 3. STALE_SECURITY_EPOCH — the session was minted under a superseded
 *    credential epoch (a revocation event raised the principal's epoch):
 *    a stale credential can never authorize a sensitive action;
 * 4. otherwise valid.
 * An unknown token is the caller's UNKNOWN_TOKEN (there is no record to
 * evaluate).
 */
export function evaluateSessionStatus(
  session: Session,
  state: {
    readonly nowMs: bigint;
    readonly revoked: boolean;
    /** The principal's CURRENT credential epoch, when known. */
    readonly currentSecurityEpoch?: bigint;
  },
): SessionLookup {
  if (state.revoked) {
    return { valid: false, reason: 'REVOKED' };
  }
  if (state.nowMs >= session.expiresAtMs) {
    return { valid: false, reason: 'EXPIRED' };
  }
  if (
    state.currentSecurityEpoch !== undefined &&
    session.securityEpoch < state.currentSecurityEpoch
  ) {
    return { valid: false, reason: 'STALE_SECURITY_EPOCH' };
  }
  return { valid: true, session };
}

// ---------------------------------------------------------------------------
// Deterministic token material (the wire contract for HMAC minting)
// ---------------------------------------------------------------------------

/** The canonical session-token material (deterministic; versioned). */
export function sessionTokenMaterial(input: {
  readonly tenantId: string;
  /** Canonical principal reference key (`type:id`). */
  readonly principalKey: string;
  readonly securityEpoch: bigint;
  readonly issuedAtMs: bigint;
  /** The injected clock's strictly increasing monotonic reading. */
  readonly monotonic: bigint;
}): string {
  requireNonEmpty(input.tenantId, 'session.tenantId');
  requireNonEmpty(input.principalKey, 'session.principalKey');
  return canonicalJson([
    'payswap.session.v1',
    input.tenantId,
    input.principalKey,
    input.securityEpoch.toString(),
    input.issuedAtMs.toString(),
    input.monotonic.toString(),
  ]);
}

/**
 * Mint a session token via the injected HMAC port:
 * `sess_` + hex(HMAC-SHA256(key, canonical material)). Uniqueness within
 * one clock comes from the strictly increasing monotonic sequence — never
 * entropy. Same inputs + same clock state => same token.
 */
export function mintSessionTokenVia(
  mac: HmacPort,
  signingKey: string,
  material: string,
): SessionToken {
  requireNonEmpty(signingKey, 'session signingKey');
  requireNonEmpty(material, 'session material');
  const digest = mac.signUtf8(signingKey, material);
  return `sess_${digest}` as SessionToken;
}
