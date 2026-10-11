import { describe, expect, it } from 'vitest';
import {
  REDACTED_MARKER,
  isRedactionMarker,
  redactForArtifact,
  redactedValue,
  assertNoSecretMaterial,
  secretStringsOf,
  requireRedacted,
} from '../src/redaction.ts';
import { CredentialIsolationViolationError, ValidationError } from '../src/errors.ts';

// Synthetic fixture, concatenation-built so the source never carries a
// contiguous live-key literal (push-protection false positive, 2026-10-11);
// the runtime value keeps the realistic shape the boundary scan must catch.
const SECRET_API_KEY = 'sk' + '_live_FAKEsecretDoNotEverUse0001';
const SECRET_COOKIE = 'session-cookie-value-FAKE-abcdef123456';

describe('redaction: secret-named fields never survive an artifact boundary', () => {
  it('redacts canonical secret field names at any depth', () => {
    const result = redactForArtifact({
      transfer: {
        id: 'trf_123',
        status: 'processing',
        apiKey: SECRET_API_KEY,
        nested: { client_secret: 'whsec_FAKE_123', note: 'keep' },
      },
    });
    const value = result.value as Record<string, Record<string, unknown>>;
    const transfer = value.transfer as Record<string, unknown>;
    expect(transfer.id).toBe('trf_123');
    expect(transfer.status).toBe('processing');
    expect(String(transfer.apiKey).startsWith(REDACTED_MARKER)).toBe(true);
    const nested = transfer.nested as Record<string, unknown>;
    expect(String(nested.client_secret).startsWith(REDACTED_MARKER)).toBe(true);
    expect(nested.note).toBe('keep');
    expect(result.notices.map((n) => n.reason)).toContain('SECRET_FIELD_NAME');
    expect(result.notices.every((n) => n.fingerprint.length === 16)).toBe(true);
  });

  it('redacts credential-shaped VALUES regardless of field name (INV-19)', () => {
    const result = redactForArtifact({
      auth: `Bearer ${SECRET_API_KEY}`,
      basic: 'Basic dXNlcjpwYXNzFAKE=',
      pem: '-----BEGIN RSA PRIVATE KEY-----FAKE',
      plain: 'not-a-secret',
    });
    const value = result.value as Record<string, string>;
    expect(String(value.auth).startsWith(REDACTED_MARKER)).toBe(true);
    expect(String(value.basic).startsWith(REDACTED_MARKER)).toBe(true);
    expect(String(value.pem).startsWith(REDACTED_MARKER)).toBe(true);
    expect(value.plain).toBe('not-a-secret');
    expect(result.notices.map((n) => n.reason)).toContain('CREDENTIAL_SHAPED_VALUE');
  });

  it('redacts whole secret-named subtrees (containers)', () => {
    const result = redactForArtifact({
      provider: { name: 'test' },
      credentials: { apiKey: SECRET_API_KEY, label: 'primary' },
    });
    const value = result.value as Record<string, Record<string, unknown>>;
    expect(value.provider?.name).toBe('test');
    expect(String(value.credentials).startsWith(REDACTED_MARKER)).toBe(true);
    expect(result.notices.length).toBe(1);
    expect(result.notices[0]?.reason).toBe('SECRET_FIELD_NAME');
  });

  it('reference-shaped fields SURVIVE (lineage ids are not secret material)', () => {
    const result = redactForArtifact({
      eventId: 'evt_123',
      correlationId: 'corr_1',
      commandId: 'cmd_9',
      sessionId: 'sess_4',
      fetchId: 'fetch_2',
      providerReference: 'trf_77',
    });
    const value = result.value as Record<string, string>;
    expect(value.eventId).toBe('evt_123');
    expect(value.correlationId).toBe('corr_1');
    expect(value.commandId).toBe('cmd_9');
    expect(value.sessionId).toBe('sess_4');
    expect(value.fetchId).toBe('fetch_2');
    expect(value.providerReference).toBe('trf_77');
    expect(result.notices).toHaveLength(0);
  });

  it('arrays, primitives, null and undefined pass through structurally intact', () => {
    const result = redactForArtifact({
      list: [1, 'two', { three: null }],
      flag: true,
      nothing: null,
      absent: undefined,
    });
    const value = result.value as Record<string, unknown>;
    expect(value.list).toEqual([1, 'two', { three: null }]);
    expect(value.flag).toBe(true);
    expect(value.nothing).toBe(null);
    expect('absent' in value).toBe(false);
    expect(redactForArtifact('bare string').value).toBe('bare string');
    expect(redactForArtifact(42).value).toBe(42);
    expect(redactForArtifact(null).value).toBe(null);
  });

  it('handles cyclic structures without crashing (never a crash vector)', () => {
    const cyclic: Record<string, unknown> = { name: 'cycle' };
    cyclic.self = cyclic;
    const result = redactForArtifact(cyclic);
    const value = result.value as Record<string, unknown>;
    expect(value.name).toBe('cycle');
    expect(value.self).toBe('[CYCLE]');
    expect(result.notices).toHaveLength(0);
  });

  it('redaction is deterministic (identical input → identical output)', () => {
    const input = { apiKey: SECRET_API_KEY, ok: 'value', list: [{ password: 'p FAKE 1' }] };
    const first = redactForArtifact(input);
    const second = redactForArtifact(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('redaction: the escape proof (fail-closed leak detection)', () => {
  it('assertNoSecretMaterial throws when material leaked into a result', () => {
    expect(() =>
      assertNoSecretMaterial({ token: SECRET_API_KEY }, [SECRET_API_KEY], 'test-escape'),
    ).toThrow(CredentialIsolationViolationError);
    expect(() =>
      assertNoSecretMaterial({ deep: { arr: [{ x: `prefix ${SECRET_API_KEY} suffix` }] } }, [SECRET_API_KEY], 'test-escape'),
    ).toThrow(CredentialIsolationViolationError);
    expect(() =>
      assertNoSecretMaterial({ clean: 'nothing here' }, [SECRET_API_KEY], 'test-escape'),
    ).not.toThrow();
  });

  it('short secrets (<4 chars) are not scanned (false-positive guard)', () => {
    expect(() => assertNoSecretMaterial({ a: 'abc' }, ['abc'], 'short')).not.toThrow();
  });

  it('secretStringsOf extracts every string leaf of a material object', () => {
    expect(secretStringsOf({ apiKey: 'k1', oauth: { token: 't1', refresh: 'r1' } })).toEqual([
      'k1',
      't1',
      'r1',
    ]);
    expect(secretStringsOf('single')).toEqual(['single']);
    expect(secretStringsOf(42)).toEqual([]);
    expect(secretStringsOf(null)).toEqual([]);
  });
});

describe('redaction: markers and requireRedacted', () => {
  it('marker detection is exact', () => {
    expect(isRedactionMarker(`${REDACTED_MARKER}:SECRET_FIELD:apiKey]`)).toBe(true);
    expect(isRedactionMarker('apiKey')).toBe(false);
    expect(isRedactionMarker(null)).toBe(false);
  });

  it('requireRedacted passes clean values and throws on secret-shaped residue', () => {
    expect(requireRedacted({ ok: 1 }, 'ctx')).toEqual({ ok: 1 });
    expect(() => requireRedacted({ apiKey: SECRET_API_KEY }, 'ctx')).toThrow(ValidationError);
    expect(() => requireRedacted({ auth: `Bearer ${SECRET_API_KEY}` }, 'ctx')).toThrow(
      ValidationError,
    );
  });

  it('redactedValue returns only the clean value (convenience form)', () => {
    expect(redactedValue({ apiKey: SECRET_COOKIE, keep: true })).toEqual({
      apiKey: `${REDACTED_MARKER}:SECRET_FIELD:apiKey]`,
      keep: true,
    });
  });
});
