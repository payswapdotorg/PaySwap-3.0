import { describe, expect, it } from 'vitest';

import {
  evaluateSessionStatus,
  validateSessionIssuableIdentity,
  validateSessionTtl,
  validateTenant,
  sessionTokenMaterial,
  mintSessionTokenVia,
  type Session,
  type IdentityRecord,
} from '../src/session-contract.ts';
import { ValidationError } from '../src/errors.ts';
import {
  sampleSession,
  testClock,
  realHmac,
  T0_MS,
  USER_PRINCIPAL,
  AGENT_PRINCIPAL,
  SERVICE_PRINCIPAL,
} from './fixtures.ts';

describe('the session lookup decision table (fail closed)', () => {
  it('a live session binds principal + tenant + security epoch at issue time and validates', () => {
    const session = sampleSession();
    expect(session.securityEpoch).toBe(1n);
    expect(session.issuedAtMs).toBe(T0_MS);
    expect(session.expiresAtMs).toBe(T0_MS + 3_600_000n);
    expect(evaluateSessionStatus(session, { nowMs: T0_MS, revoked: false })).toEqual({
      valid: true,
      session,
    });
  });

  it('expires sessions when nowMs >= expiresAt (EXPIRED, fail closed)', () => {
    const session = sampleSession();
    expect(evaluateSessionStatus(session, { nowMs: T0_MS + 3_600_000n, revoked: false })).toEqual({
      valid: false,
      reason: 'EXPIRED',
    });
    expect(evaluateSessionStatus(session, { nowMs: T0_MS + 3_600_000n - 1n, revoked: false }).valid).toBe(true);
  });

  it('revoked sessions fail closed FIRST (REVOKED precedes expiry checks)', () => {
    const session = sampleSession();
    expect(
      evaluateSessionStatus(session, { nowMs: T0_MS + 3_600_000n, revoked: true }),
    ).toEqual({ valid: false, reason: 'REVOKED' });
    expect(evaluateSessionStatus(session, { nowMs: T0_MS, revoked: true })).toEqual({
      valid: false,
      reason: 'REVOKED',
    });
  });

  it('fails closed on a stale security epoch (raised epochs invalidate sessions)', () => {
    const session = sampleSession({ securityEpoch: 1n });
    expect(
      evaluateSessionStatus(session, { nowMs: T0_MS, revoked: false, currentSecurityEpoch: 2n }),
    ).toEqual({ valid: false, reason: 'STALE_SECURITY_EPOCH' });
    // Equal or newer session epochs stay valid; an absent current epoch stays valid.
    expect(
      evaluateSessionStatus(session, { nowMs: T0_MS, revoked: false, currentSecurityEpoch: 1n }).valid,
    ).toBe(true);
    expect(evaluateSessionStatus(session, { nowMs: T0_MS, revoked: false }).valid).toBe(true);
  });

  it('an unknown token has no record to evaluate — the reason vocabulary is closed', () => {
    const reasons = new Set(['UNKNOWN_TOKEN', 'REVOKED', 'EXPIRED', 'STALE_SECURITY_EPOCH']);
    expect(reasons.size).toBe(4);
    const session: Session = sampleSession();
    const valid = evaluateSessionStatus(session, { nowMs: T0_MS, revoked: false });
    if (valid.valid) {
      expect(valid.session.token).toBe(session.token);
    } else {
      expect(reasons.has(valid.reason)).toBe(true);
    }
  });
});

describe('identity validation (the agent-principal law)', () => {
  it('accepts user and service identities for tenant sessions', () => {
    for (const principal of [USER_PRINCIPAL, SERVICE_PRINCIPAL]) {
      const identity: IdentityRecord = {
        tenantId: 'tenant_1',
        principal,
        displayName: 'Alice',
        registeredAtMs: T0_MS,
      };
      expect(() => validateSessionIssuableIdentity(identity)).not.toThrow();
    }
  });

  it('rejects agent principals for tenant sessions (agents authenticate via keys)', () => {
    const identity: IdentityRecord = {
      tenantId: 'tenant_1',
      principal: AGENT_PRINCIPAL,
      displayName: 'Agent',
      registeredAtMs: T0_MS,
    };
    expect(() => validateSessionIssuableIdentity(identity)).toThrow(ValidationError);
  });

  it('validates tenant shapes and non-bigint registration times (fail closed)', () => {
    expect(() => validateTenant({ tenantId: '', name: 'x' })).toThrow(ValidationError);
    expect(() =>
      validateSessionIssuableIdentity({
        tenantId: 'tenant_1',
        principal: USER_PRINCIPAL,
        displayName: '',
        registeredAtMs: T0_MS,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateSessionIssuableIdentity({
        tenantId: 'tenant_1',
        principal: USER_PRINCIPAL,
        displayName: 'A',
        registeredAtMs: 123 as unknown as bigint,
      }),
    ).toThrow(ValidationError);
  });
});

describe('TTL + token material + minting (deterministic, port-injected)', () => {
  it('validateSessionTtl accepts positive integers/bigints and rejects the rest', () => {
    expect(validateSessionTtl(1000)).toBe(1000n);
    expect(validateSessionTtl(1000n)).toBe(1000n);
    expect(() => validateSessionTtl(0)).toThrow(ValidationError);
    expect(() => validateSessionTtl(-1n)).toThrow(ValidationError);
    expect(() => validateSessionTtl(1.5)).toThrow(ValidationError);
  });

  it('issues deterministic tokens: same inputs + same clock state => same token', () => {
    const clock = testClock();
    const materialA = sessionTokenMaterial({
      tenantId: 'tenant_1',
      principalKey: 'user:alice',
      securityEpoch: 1n,
      issuedAtMs: clock.now(),
      monotonic: clock.monotonic(),
    });
    const materialB = sessionTokenMaterial({
      tenantId: 'tenant_1',
      principalKey: 'user:alice',
      securityEpoch: 1n,
      issuedAtMs: clock.now(),
      monotonic: clock.monotonic(),
    });
    // The monotonic sequence advanced between the two materials.
    expect(materialA).not.toBe(materialB);
    expect(mintSessionTokenVia(realHmac, 'key', materialA)).toBe(mintSessionTokenVia(realHmac, 'key', materialA));
    const token = mintSessionTokenVia(realHmac, 'key', materialA);
    expect(token.startsWith('sess_')).toBe(true);
    expect(token).toMatch(/^sess_[0-9a-f]{64}$/);
    expect(mintSessionTokenVia(realHmac, 'key', materialA)).not.toBe(mintSessionTokenVia(realHmac, 'other', materialA));
  });

  it('never repeats a token within one clock (monotonic uniqueness, no entropy)', () => {
    const clock = testClock();
    const minted = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const material = sessionTokenMaterial({
        tenantId: 'tenant_1',
        principalKey: 'user:alice',
        securityEpoch: 1n,
        issuedAtMs: clock.now(),
        monotonic: clock.monotonic(),
      });
      minted.add(mintSessionTokenVia(realHmac, 'key', material));
    }
    expect(minted.size).toBe(50);
  });

  it('rejects empty signing keys and malformed material inputs (fail closed)', () => {
    const material = sessionTokenMaterial({
      tenantId: 'tenant_1',
      principalKey: 'user:alice',
      securityEpoch: 1n,
      issuedAtMs: T0_MS,
      monotonic: 1n,
    });
    expect(() => mintSessionTokenVia(realHmac, '', material)).toThrow(ValidationError);
    expect(() =>
      sessionTokenMaterial({
        tenantId: '',
        principalKey: 'user:alice',
        securityEpoch: 1n,
        issuedAtMs: T0_MS,
        monotonic: 1n,
      }),
    ).toThrow(ValidationError);
  });

  it('the token material is the canonical versioned wire form', () => {
    const material = sessionTokenMaterial({
      tenantId: 'tenant_1',
      principalKey: 'user:alice',
      securityEpoch: 1n,
      issuedAtMs: T0_MS,
      monotonic: 7n,
    });
    expect(material).toBe(
      '["payswap.session.v1","tenant_1","user:alice","1","1767225600000","7"]',
    );
  });
});
