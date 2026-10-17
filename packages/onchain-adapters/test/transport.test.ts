import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.ts';
import {
  assertEndpointProviderDiversity,
  hexQuantityToDecimal,
  parseExactDecimal,
  validateEndpoints,
} from '../src/transport.ts';
import { ScriptedRestTransport, ScriptedRpcTransport, fakeEndpoint } from './fixtures/scripted-transport.ts';
import { BITCOIN_CHAIN, CHAIN } from './fixtures/world.ts';

/**
 * The transport CONTRACTS (vendor-neutral ports + endpoint diversity law +
 * exact-integer wire helpers) and the deterministic scripted doubles:
 * an unscripted call is a provider ERROR (never an invented answer — the
 * no-fake-success discipline); unreachability is a reachability FACT.
 */
describe('transport contracts (zero I/O — injected ports only)', () => {
  it('endpoint validation: at least one endpoint, non-empty fields, unique ids', () => {
    expect(() => validateEndpoints([])).toThrow(ValidationError);
    expect(() =>
      validateEndpoints([fakeEndpoint({ endpointId: '', providerName: 'P', chainKey: CHAIN })]),
    ).toThrow(ValidationError);
    const good = [
      fakeEndpoint({ endpointId: 'a', providerName: 'P1', chainKey: CHAIN }),
      fakeEndpoint({ endpointId: 'b', providerName: 'P2', chainKey: CHAIN }),
    ];
    expect(() => validateEndpoints(good)).not.toThrow();
    expect(() =>
      validateEndpoints([
        fakeEndpoint({ endpointId: 'a', providerName: 'P1', chainKey: CHAIN }),
        fakeEndpoint({ endpointId: 'a', providerName: 'P2', chainKey: CHAIN }),
      ]),
    ).toThrow(/duplicate endpointId/);
  });

  it('an endpoint serving an UNCLASSIFIED chainKey fails closed (wiring error)', () => {
    expect(() =>
      validateEndpoints([
        fakeEndpoint({ endpointId: 'x', providerName: 'P', chainKey: 'ethereum:fakenet' }),
      ]),
    ).toThrow(ValidationError);
  });

  it('the PRODUCTION diversity law: >= 2 distinct providers, same provider twice fails', () => {
    expect(() =>
      assertEndpointProviderDiversity(
        [
          fakeEndpoint({ endpointId: 'a', providerName: 'Same', chainKey: CHAIN }),
          fakeEndpoint({ endpointId: 'b', providerName: 'Same', chainKey: CHAIN }),
        ],
        'PRODUCTION',
      ),
    ).toThrow(/two DISTINCT providers/);
  });

  it('parseExactDecimal: non-negative exact integer decimal strings only', () => {
    expect(parseExactDecimal('0', 'x')).toBe('0');
    expect(parseExactDecimal('1000000', 'x')).toBe('1000000');
    expect(() => parseExactDecimal('1.5', 'x')).toThrow(ValidationError);
    expect(() => parseExactDecimal('-1', 'x')).toThrow(ValidationError);
    expect(() => parseExactDecimal('01', 'x')).toThrow(ValidationError);
    expect(() => parseExactDecimal(123 as unknown as string, 'x')).toThrow(ValidationError);
  });

  it('hexQuantityToDecimal: exact 0x-hex quantities to exact decimal strings', () => {
    expect(hexQuantityToDecimal('0x1', 'x')).toBe('1');
    expect(hexQuantityToDecimal('0x7', 'x')).toBe('7');
    expect(hexQuantityToDecimal('0x5f5e100', 'x')).toBe('100000000');
    expect(hexQuantityToDecimal('0xf4240', 'x')).toBe('1000000');
    expect(() => hexQuantityToDecimal('1', 'x')).toThrow(ValidationError);
    expect(() => hexQuantityToDecimal('0x', 'x')).toThrow(ValidationError);
    expect(() => hexQuantityToDecimal('0xZZ', 'x')).toThrow(ValidationError);
  });

  it('the scripted RPC double: an unscripted call is a provider ERROR (never an invented answer)', async () => {
    const transport = new ScriptedRpcTransport({
      transportId: 'transport:scripted:probe',
      endpoints: [fakeEndpoint({ endpointId: 'p1', providerName: 'P', chainKey: CHAIN })],
    });
    const result = await transport.call('eth_blockNumber', []);
    expect(result.kind).toBe('RPC_ERROR');
    if (result.kind === 'RPC_ERROR') {
      expect(result.message).toContain('no scripted response');
      expect(result.servedBy.endpointId).toBe('p1');
    }
  });

  it('the scripted RPC double: a scripted error maps to RPC_ERROR; results carry raw text', async () => {
    const transport = new ScriptedRpcTransport({
      transportId: 'transport:scripted:probe',
      endpoints: [fakeEndpoint({ endpointId: 'p1', providerName: 'P', chainKey: CHAIN })],
      responses: {
        failing: () => ({ scriptedError: 'node rejected the call' }),
        ok: () => '0x1',
      },
    });
    const failure = await transport.call('failing', []);
    expect(failure.kind).toBe('RPC_ERROR');
    if (failure.kind === 'RPC_ERROR') {
      expect(failure.message).toBe('node rejected the call');
    }
    const ok = await transport.call('ok', []);
    expect(ok.kind).toBe('RPC_OK');
    if (ok.kind === 'RPC_OK') {
      expect(ok.result).toBe('0x1');
      expect(ok.raw).toContain('"result":"0x1"');
      expect(ok.servedBy.transportId).toBe('transport:scripted:probe');
    }
  });

  it('the scripted doubles: goUnreachable surfaces TRANSPORT_UNREACHABLE with the attempted endpoints', async () => {
    const rpc = new ScriptedRpcTransport({
      transportId: 'transport:scripted:probe',
      endpoints: [fakeEndpoint({ endpointId: 'p1', providerName: 'P', chainKey: CHAIN })],
      responses: { ok: () => '0x1' },
    });
    rpc.goUnreachable();
    const rpcResult = await rpc.call('ok', []);
    expect(rpcResult.kind).toBe('TRANSPORT_UNREACHABLE');
    if (rpcResult.kind === 'TRANSPORT_UNREACHABLE') {
      expect(rpcResult.attempted.length).toBe(1);
    }

    const rest = new ScriptedRestTransport({
      transportId: 'transport:scripted:rest',
      endpoints: [
        fakeEndpoint({ endpointId: 'r1', providerName: 'E', chainKey: BITCOIN_CHAIN, protocol: 'REST' }),
      ],
      responses: { '/x': () => ({ status: 200, body: 'ok' }) },
    });
    rest.goUnreachable();
    const restResult = await rest.get('/x');
    expect(restResult.kind).toBe('TRANSPORT_UNREACHABLE');
    if (restResult.kind === 'TRANSPORT_UNREACHABLE') {
      expect(restResult.attempted.length).toBe(1);
    }
  });

  it('the scripted REST double: HTTP >= 400 maps to REST_ERROR (with body)', async () => {
    const rest = new ScriptedRestTransport({
      transportId: 'transport:scripted:rest',
      endpoints: [
        fakeEndpoint({ endpointId: 'r1', providerName: 'E', chainKey: BITCOIN_CHAIN, protocol: 'REST' }),
      ],
      responses: {
        '/tx/bad/status': () => ({ status: 400, body: 'invalid txid' }),
        '/ok': () => ({ status: 200, body: 'text-body', raw: 'text-body' }),
      },
    });
    const error = await rest.get('/tx/bad/status');
    expect(error.kind).toBe('REST_ERROR');
    if (error.kind === 'REST_ERROR') {
      expect(error.status).toBe(400);
      expect(error.body).toBe('invalid txid');
    }
    const ok = await rest.get('/ok');
    expect(ok.kind).toBe('REST_OK');
    if (ok.kind === 'REST_OK') {
      expect(ok.raw).toBe('text-body');
    }
  });
});
