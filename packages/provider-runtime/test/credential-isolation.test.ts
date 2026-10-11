import { describe, expect, it } from 'vitest';
import {
  BrowserSessionBroker,
  InMemoryCredentialBroker,
} from '../src/credential-isolation.ts';
import {
  CredentialIsolationViolationError,
  ValidationError,
} from '../src/errors.ts';
import { redactForArtifact } from '../src/redaction.ts';
import { TEST_SECRET_API_KEY, buildTestWorld } from './world.ts';

const SECRET = TEST_SECRET_API_KEY;

describe('credential broker: opaque handles with no accessor', () => {
  it('material enters once and only the OPAQUE HANDLE crosses back out', () => {
    const broker = new InMemoryCredentialBroker();
    const handle = broker.registerBundle({
      kind: 'API_KEY',
      material: { apiKey: SECRET },
      registeredAt: 1n,
    });
    // The handle is a branded opaque id — no material, no accessor exists.
    expect(String(handle).startsWith('cred:')).toBe(true);
    expect(String(handle)).not.toContain(SECRET);
    const metadata = broker.listBundleMetadata();
    expect(metadata).toHaveLength(1);
    expect(JSON.stringify(metadata, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(
      SECRET,
    );
    expect(metadata[0]?.metadata.kind).toBe('API_KEY');
  });

  it('handles are deterministic (sequence-minted, no entropy)', () => {
    const broker = new InMemoryCredentialBroker();
    const h1 = broker.registerBundle({ kind: 'API_KEY', material: { apiKey: 'a' }, registeredAt: 1n });
    const h2 = broker.registerBundle({ kind: 'API_KEY', material: { apiKey: 'b' }, registeredAt: 1n });
    expect(String(h1)).toBe('cred:1');
    expect(String(h2)).toBe('cred:2');
  });

  it('unknown handles throw; null material is refused at entry', () => {
    const broker = new InMemoryCredentialBroker();
    expect(() => broker.resolve('cred:999' as never)).toThrow(ValidationError);
    expect(() =>
      broker.registerBundle({ kind: 'API_KEY', material: null, registeredAt: 1n }),
    ).toThrow(ValidationError);
    expect(() =>
      broker.registerBundle({ kind: 'API_KEY', material: { apiKey: 'x' }, registeredAt: -1n }),
    ).toThrow(ValidationError);
  });

  it('withMaterial refuses UNREGISTERED runtime keys before any material moves', async () => {
    const broker = new InMemoryCredentialBroker();
    const handle = broker.registerBundle({
      kind: 'API_KEY',
      material: { apiKey: SECRET },
      registeredAt: 1n,
    });
    const foreignKey = 'runtime:foreign:1' as never;
    await expect(
      broker.withMaterial(handle, {
        runtimeKey: foreignKey,
        context: 'test',
        consumer: () => ({ ok: true }),
      }),
    ).rejects.toThrow(CredentialIsolationViolationError);
  });
});

describe('credential broker: the escape scan (material never leaves the seal)', () => {
  it('a callback result carrying the secret is refused — even headers (fail-closed)', async () => {
    const broker = new InMemoryCredentialBroker();
    const key = broker.registerRuntime('adapter');
    const handle = broker.registerBundle({
      kind: 'API_KEY',
      material: { apiKey: SECRET },
      registeredAt: 1n,
    });
    // Returning secret-bearing HEADERS from the seal is a leak: the
    // boundary refuses it — headers are built AND consumed INSIDE.
    await expect(
      broker.withMaterial(handle, {
        runtimeKey: key,
        context: 'bind',
        consumer: (material) => ({ Authorization: `Bearer ${(material as { apiKey: string }).apiKey}` }),
      }),
    ).rejects.toThrow(CredentialIsolationViolationError);
  });

  it('the canonical SAFE pattern: interaction runs INSIDE, only clean output returns', async () => {
    const broker = new InMemoryCredentialBroker();
    const key = broker.registerRuntime('adapter');
    const handle = broker.registerBundle({
      kind: 'API_KEY',
      material: { apiKey: SECRET },
      registeredAt: 1n,
    });
    let usedInCall = '';
    const outbound = await broker.withMaterial(handle, {
      runtimeKey: key,
      context: 'bind',
      // The provider interaction USES the material...
      consumer: (material) => {
        usedInCall = (material as { apiKey: string }).apiKey;
        return { headerName: 'Authorization', scheme: 'Bearer' }; // ...but returns only metadata
      },
    });
    expect(usedInCall).toBe(SECRET); // the edge did receive it
    expect(outbound).toEqual({ headerName: 'Authorization', scheme: 'Bearer' });
    expect(JSON.stringify(outbound)).not.toContain(SECRET);
  });

  it('an ASYNC consumer whose resolved value leaks is caught after await', async () => {
    const broker = new InMemoryCredentialBroker();
    const key = broker.registerRuntime('adapter');
    const handle = broker.registerBundle({
      kind: 'OAUTH',
      material: { accessToken: SECRET },
      registeredAt: 1n,
    });
    await expect(
      broker.withMaterial(handle, {
        runtimeKey: key,
        context: 'leak',
        consumer: async () => ({ rows: [{ cells: [`token=${SECRET}`] }] }),
      }),
    ).rejects.toThrow(CredentialIsolationViolationError);
    // And the clean async path resolves normally.
    const clean = await broker.withMaterial(handle, {
      runtimeKey: key,
      context: 'clean',
      consumer: async () => ({ ok: true }),
    });
    expect(clean).toEqual({ ok: true });
  });

  it('the sealedSecretCount audit surface never exposes the strings', () => {
    const broker = new InMemoryCredentialBroker();
    const handle = broker.registerBundle({
      kind: 'API_KEY',
      material: { apiKey: SECRET, note: 'second string' },
      registeredAt: 1n,
    });
    const sealed = broker.resolve(handle);
    expect(sealed.sealedSecretCount).toBe(2);
    expect(JSON.stringify(sealed.metadata, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(SECRET);
    expect(Object.keys(sealed)).not.toContain('material');
  });
});

describe('browser session isolation (isolated interactive sessions)', () => {
  it('session refs are opaque; cookies/storage never cross boundaries', () => {
    const sessions = new BrowserSessionBroker();
    const ref = sessions.createSession({
      cookies: { session: SECRET, csrf: 'tok-FAKE-2' },
      storage: { walletSeed: 'seed FAKE phrase' },
    });
    expect(String(ref).startsWith('sess:')).toBe(true);
    expect(String(ref)).not.toContain(SECRET);
    expect(sessions.sessionCount).toBe(1);
  });

  it('withSession refuses unregistered keys and scans results for cookie leaks', () => {
    const sessions = new BrowserSessionBroker();
    const key = sessions.registerRuntime('browser-driver');
    const ref = sessions.createSession({ cookies: { session: SECRET } });
    expect(() =>
      sessions.withSession(ref, {
        runtimeKey: 'runtime:nope:1' as never,
        context: 'drive',
        consumer: () => ({ ok: true }),
      }),
    ).toThrow(CredentialIsolationViolationError);
    expect(() =>
      sessions.withSession(ref, {
        runtimeKey: key,
        context: 'drive',
        consumer: (material) => ({ saw: material.cookies.session }),
      }),
    ).toThrow(CredentialIsolationViolationError);
    expect(
      sessions.withSession(ref, {
        runtimeKey: key,
        context: 'drive',
        consumer: () => ({ page: 'loaded', elements: 3 }),
      }),
    ).toEqual({ page: 'loaded', elements: 3 });
  });

  it('unknown session refs throw; malformed material is refused', () => {
    const sessions = new BrowserSessionBroker();
    expect(() => sessions.resolve('sess:404' as never)).toThrow(ValidationError);
    expect(() => sessions.createSession(null as never)).toThrow(ValidationError);
    expect(() => sessions.createSession({} as never)).toThrow(ValidationError);
  });
});

describe('isolation receipts against the composed test world', () => {
  it('the world broker holds exactly one bundle whose metadata is secret-free', () => {
    const world = buildTestWorld();
    const metadata = world.broker.listBundleMetadata();
    expect(metadata).toHaveLength(1);
    expect(JSON.stringify(metadata, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(SECRET);
  });

  it('the connection record carries only the opaque handle reference (INV-19)', () => {
    const world = buildTestWorld();
    const record = world.connections.get(world.connectionId);
    expect(record.credentialHandleRef.startsWith('cred:')).toBe(true);
    expect(JSON.stringify(record, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(SECRET);
  });

  it('redaction proof over every artifact shape the runtime produces', () => {
    const world = buildTestWorld();
    const artifacts = [
      world.connections.get(world.connectionId),
      ...world.connections.list().flatMap((c) => c.transitionHistory),
      world.broker.listBundleMetadata(),
    ];
    for (const artifact of artifacts) {
      const redacted = redactForArtifact(artifact);
      // The artifacts were ALREADY clean: redaction finds nothing to strip.
      expect(redacted.notices).toHaveLength(0);
      expect(JSON.stringify(redacted.value, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(SECRET);
    }
  });
});
