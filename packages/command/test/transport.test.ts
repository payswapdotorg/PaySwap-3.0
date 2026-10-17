import { describe, expect, it } from 'vitest';

import {
  validateRequestEnvelope,
  assertRequestEnvelopeContract,
  mapErrorCategoryToHttpStatus,
  outcomeMarkerForErrorCategory,
  toWireError,
  authenticateRequest,
  isMutatingHttpMethod,
  MUTATING_HTTP_METHODS,
  EXTERNAL_AMBIGUITY_HTTP_STATUS,
  EXTERNAL_AMBIGUITY_OUTCOME_MARKER,
  OUTCOME_HEADER,
  type RequestEnvelope,
  type ResponseMeta,
} from '../src/transport.ts';
import { CommandError, ExternalAmbiguityError, ValidationError } from '../src/errors.ts';
import type { CommandErrorCategory } from '../src/errors.ts';
import { COMMAND_SURFACE_API_VERSION } from '../src/version.ts';
import { evaluateSessionStatus } from '../src/session-contract.ts';
import { sampleSession, T0_MS, USER_PRINCIPAL } from './fixtures.ts';
import { principalRefKey } from '../src/identifiers.ts';

const AUTH = { principal: 'user:alice', scheme: 'SESSION' } as const;

function request(partial: {
  method: RequestEnvelope['method'];
  path: string;
  idempotencyKey?: string;
  apiVersion?: string;
  auth?: { principal: string; scheme: 'SESSION' | 'API_KEY' | 'SERVICE_TOKEN' };
}): RequestEnvelope<unknown> {
  return {
    method: partial.method,
    path: partial.path,
    auth: partial.auth ?? AUTH,
    apiVersion: partial.apiVersion ?? COMMAND_SURFACE_API_VERSION,
    ...(partial.idempotencyKey !== undefined ? { idempotencyKey: partial.idempotencyKey } : {}),
  };
}

describe('request envelope validation (the transport contract, fail closed)', () => {
  it('INV-6: every mutation without an idempotency key is rejected', () => {
    for (const method of MUTATING_HTTP_METHODS) {
      const validation = validateRequestEnvelope(request({ method, path: '/payments' }));
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.violations.join(' ')).toContain('idempotencyKey is REQUIRED');
      }
    }
  });

  it('GET requests do not require an idempotency key', () => {
    const validation = validateRequestEnvelope(request({ method: 'GET', path: '/payments' }));
    expect(validation).toEqual({ ok: true });
    expect(isMutatingHttpMethod('GET')).toBe(false);
    expect(isMutatingHttpMethod('POST')).toBe(true);
  });

  it('missing auth principal and missing apiVersion are violations (explicit external versioning)', () => {
    const validation = validateRequestEnvelope({
      method: 'GET',
      path: '/x',
      auth: { principal: '', scheme: 'SESSION' },
      apiVersion: '',
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.violations.join(' ')).toContain('auth.principal is required');
      expect(validation.violations.join(' ')).toContain('apiVersion is required');
    }
  });

  it('unsupported API versions are violations when the supported list is provided', () => {
    const validation = validateRequestEnvelope(
      request({ method: 'GET', path: '/x', apiVersion: '9.9.9' }),
      { supportedApiVersions: [COMMAND_SURFACE_API_VERSION] },
    );
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.violations.join(' ')).toContain('api.version_unsupported: 9.9.9');
    }
  });

  it('assertRequestEnvelopeContract throws fail-closed on contract violations (total-error)', () => {
    expect(() =>
      assertRequestEnvelopeContract(request({ method: 'POST', path: '/x' }), {
        supportedApiVersions: [COMMAND_SURFACE_API_VERSION],
      }),
    ).toThrow(CommandError);
    expect(() =>
      assertRequestEnvelopeContract(request({ method: 'POST', path: '/x', idempotencyKey: 'ik' }), {
        supportedApiVersions: [COMMAND_SURFACE_API_VERSION],
      }),
    ).not.toThrow();
  });
});

describe('the deterministic category -> HTTP status mapping', () => {
  it('maps every category exhaustively; EXTERNAL_AMBIGUITY -> 409 + outcome marker, never 500', () => {
    const expected: Record<CommandErrorCategory, number> = {
      VALIDATION: 400,
      CONFLICT: 409,
      NOT_FOUND: 404,
      AUTHORIZATION_REQUIRED: 403,
      POLICY_BLOCKED: 422,
      EXTERNAL_AMBIGUITY: 409,
      TERMINAL_STATE: 409,
      UNSUPPORTED_VERSION: 400,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    };
    for (const category of Object.keys(expected) as CommandErrorCategory[]) {
      expect(mapErrorCategoryToHttpStatus(category)).toBe(expected[category]);
    }
    expect(mapErrorCategoryToHttpStatus('EXTERNAL_AMBIGUITY')).not.toBe(500);
    expect(EXTERNAL_AMBIGUITY_HTTP_STATUS).toBe(409);
    expect(EXTERNAL_AMBIGUITY_OUTCOME_MARKER).toBe('unknown');
    expect(OUTCOME_HEADER).toBe('X-PaySwap-Outcome');
  });

  it('outcomeMarkerForErrorCategory: only EXTERNAL_AMBIGUITY carries a marker', () => {
    expect(outcomeMarkerForErrorCategory('EXTERNAL_AMBIGUITY')).toBe('unknown');
    expect(outcomeMarkerForErrorCategory('VALIDATION')).toBeUndefined();
    expect(outcomeMarkerForErrorCategory('INTERNAL')).toBeUndefined();
  });

  it('toWireError maps CommandError onto the ApiError wire model deterministically', () => {
    const wire = toWireError(new ValidationError('bad input'));
    expect(wire).toEqual({ code: 'VALIDATION_FAILED', category: 'VALIDATION', message: 'bad input' });
    expect(toWireError(new ValidationError('x'))).toEqual(toWireError(new ValidationError('x')));
  });

  it('toWireError REQUIRES a reconciliationRef on EXTERNAL_AMBIGUITY (INV-4: reconciliation owns resolution)', () => {
    const ambiguity = new ExternalAmbiguityError('the external outcome is unknown');
    expect(() => toWireError(ambiguity)).toThrow(ExternalAmbiguityError);
    let counter = 0;
    const wire = toWireError(ambiguity, {
      mintReconciliationRef: () => `recon_${(counter += 1)}`,
    });
    expect(wire.category).toBe('EXTERNAL_AMBIGUITY');
    expect(wire.reconciliationRef).toBe('recon_1');
  });

  it('an existing reconciliationRef in details is carried through (no double minting)', () => {
    const ambiguity = new ExternalAmbiguityError('unknown', { reconciliationRef: 'recon_existing' });
    const wire = toWireError(ambiguity);
    expect(wire.reconciliationRef).toBe('recon_existing');
  });
});

describe('the request authentication decision (pure, fail closed)', () => {
  it('an authenticated live session yields the request context (principal + tenant)', () => {
    const session = sampleSession();
    const context = authenticateRequest(AUTH, { valid: true, session });
    expect(context.principal).toEqual(USER_PRINCIPAL);
    expect(context.tenantId).toBe('tenant_1');
  });

  it('rejects unsupported auth schemes (this surface authenticates via session tokens)', () => {
    expect(() =>
      authenticateRequest({ principal: 'user:alice', scheme: 'API_KEY' }, { valid: true, session: sampleSession() }),
    ).toThrow(CommandError);
    try {
      authenticateRequest({ principal: 'user:alice', scheme: 'SERVICE_TOKEN' }, { valid: true, session: sampleSession() });
    } catch (error) {
      const commandError = error as CommandError;
      expect(commandError.code).toBe('AUTH_SCHEME_UNSUPPORTED');
      expect(commandError.category).toBe('AUTHORIZATION_REQUIRED');
    }
  });

  it('rejects invalid sessions fail closed with the reason vocabulary', () => {
    for (const reason of ['UNKNOWN_TOKEN', 'REVOKED', 'EXPIRED', 'STALE_SECURITY_EPOCH'] as const) {
      try {
        authenticateRequest(AUTH, { valid: false, reason });
        throw new Error('expected CommandError');
      } catch (error) {
        const commandError = error as CommandError;
        expect(commandError.code).toBe('AUTH_SESSION_INVALID');
        expect(commandError.details).toEqual({ reason });
      }
    }
  });

  it('rejects a claimed principal that does not match the session (the claim is just a claim)', () => {
    expect(() =>
      authenticateRequest(
        { principal: 'user:bob', scheme: 'SESSION' },
        { valid: true, session: sampleSession() },
      ),
    ).toThrow(CommandError);
    // The comparison is the canonical principalRefKey form.
    expect(principalRefKey(USER_PRINCIPAL)).toBe('user:alice');
  });

  it('revoked, expired and epoch-stale sessions never authenticate (decision-table integration)', () => {
    const session = sampleSession({ securityEpoch: 1n, expiresAtMs: T0_MS + 60_000n });
    const revoked = evaluateSessionStatus(session, { nowMs: T0_MS, revoked: true });
    const expired = evaluateSessionStatus(session, { nowMs: T0_MS + 60_000n, revoked: false });
    const stale = evaluateSessionStatus(session, {
      nowMs: T0_MS,
      revoked: false,
      currentSecurityEpoch: 2n,
    });
    for (const lookup of [revoked, expired, stale]) {
      expect(lookup.valid).toBe(false);
      expect(() => authenticateRequest(AUTH, lookup)).toThrow(CommandError);
    }
  });
});

describe('response envelope wire contracts', () => {
  it('successful response meta carries schemaVersion + requestId (+ evidenceRef on mutations — the evidence-lineage law)', () => {
    const meta: ResponseMeta = {
      schemaVersion: COMMAND_SURFACE_API_VERSION,
      requestId: 'req_0001',
      evidenceRef: 'approval:hash_test_1',
    };
    expect(meta.schemaVersion).toBe('1.0.0');
    expect(meta.requestId).toBe('req_0001');
    expect(meta.evidenceRef).toBe('approval:hash_test_1');
    const replayMeta: ResponseMeta = {
      schemaVersion: COMMAND_SURFACE_API_VERSION,
      requestId: 'req_0002',
      idempotentReplay: true,
    };
    expect(replayMeta.idempotentReplay).toBe(true);
  });
});
