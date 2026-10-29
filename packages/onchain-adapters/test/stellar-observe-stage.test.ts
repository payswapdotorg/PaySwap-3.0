import { describe, expect, it } from 'vitest';
import { stellarDecimalToStroops } from '../src/stellar/stroops.ts';
import { stellarObserveAccount } from '../src/stellar/stages-observe.ts';
import { NOW_ISO } from './fixtures/world.ts';
import {
  STELLAR_CHAIN,
  STELLAR_PAYER_ACCOUNT,
  STELLAR_USDC_ASSET_ID,
  STELLAR_OTHER_ISSUER_ASSET_ID,
  STELLAR_NATIVE_ASSET_ID,
  STELLAR_LEDGER_SEQ,
  STELLAR_LEDGER_HASH,
  STELLAR_TESTNET_USDC_ISSUER,
  STELLAR_USDC_BALANCE,
  scriptedStellarHorizon,
  stellarTestAdapter,
} from './fixtures/stellar-world.ts';

/**
 * P22-A (ADR-0016 D2/D3): the Stellar OBSERVE stage over a scripted Horizon
 * (the injected-fetch seam — no SDK, no network) + the exact stroop
 * arithmetic (INV-2). The observe stage parses honestly (the chain head =
 * the latest CLOSED ledger; issuer-scoped asset positions as OBSERVATIONS,
 * exact stroops, never custody); the issuer-collision law (two issuers of
 * the same code are two assets) is asserted at the observe tier. Part 1 of
 * the former lifecycle-stellar battery (the file law split).
 */

describe('the Stellar observe stage over a scripted Horizon (ADR-0016 D2 — honest parsing)', () => {
  it('the chain head is the latest CLOSED ledger (height, hash, TESTNET provenance)', async () => {
    const adapter = stellarTestAdapter();
    const probe = await adapter.observeChainHead({ at: NOW_ISO });
    expect(probe.kind).toBe('HEAD_OBSERVED');
    if (probe.kind !== 'HEAD_OBSERVED') throw new Error('unreachable');
    expect(probe.head.height).toBe(STELLAR_LEDGER_SEQ);
    expect(probe.head.headHash).toBe(STELLAR_LEDGER_HASH);
    expect(probe.head.chainKey).toBe(STELLAR_CHAIN);
    expect(probe.head.environmentClass).toBe('TESTNET');
    expect(adapter.environment.environmentClass).toBe('TESTNET');
  });

  it('an unparseable ledger stream is RAIL_UNREACHABLE with availability UNKNOWN (never failure)', async () => {
    const adapter = stellarTestAdapter({
      '/ledgers?order=desc&limit=1': () => ({ status: 200, body: { _embedded: { records: [] } } }),
    });
    const probe = await adapter.observeChainHead({ at: NOW_ISO });
    expect(probe.kind).toBe('RAIL_UNREACHABLE');
    if (probe.kind !== 'RAIL_UNREACHABLE') throw new Error('unreachable');
    expect(probe.availability).toBe('UNKNOWN');
  });

  it('an issuer-scoped USDC position observes with EXACT stroops (an OBSERVATION, never custody)', async () => {
    const adapter = stellarTestAdapter();
    const probe = await adapter.observeAssetPosition({
      accountRef: STELLAR_PAYER_ACCOUNT,
      assetId: STELLAR_USDC_ASSET_ID,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_OBSERVED');
    if (probe.kind !== 'POSITION_OBSERVED') throw new Error('unreachable');
    expect(probe.observation.observedAmount.minorUnits).toBe('255000000');
    expect(probe.observation.assetId).toBe(STELLAR_USDC_ASSET_ID);
    expect(probe.observation.location).toEqual({
      chainKey: STELLAR_CHAIN,
      accountRef: STELLAR_PAYER_ACCOUNT,
    });
  });

  it('the native XLM position observes through the same seam', async () => {
    const adapter = stellarTestAdapter();
    const probe = await adapter.observeAssetPosition({
      accountRef: STELLAR_PAYER_ACCOUNT,
      assetId: STELLAR_NATIVE_ASSET_ID,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_OBSERVED');
    if (probe.kind !== 'POSITION_OBSERVED') throw new Error('unreachable');
    expect(probe.observation.observedAmount.minorUnits).toBe('10000000000');
  });

  it('a credit assetId WITHOUT an issuer scope is ASSET_BINDING_UNKNOWN (the issuer-collision law)', async () => {
    const adapter = stellarTestAdapter();
    const probe = await adapter.observeAssetPosition({
      accountRef: STELLAR_PAYER_ACCOUNT,
      assetId: `${STELLAR_CHAIN}/asset:USDC`,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_UNOBSERVABLE');
    if (probe.kind !== 'POSITION_UNOBSERVABLE') throw new Error('unreachable');
    expect(probe.reason).toBe('ASSET_BINDING_UNKNOWN');
    expect(probe.message).toContain('two issuers of the same code are two assets');
  });

  it('a DIFFERENT issuer scope is a DIFFERENT asset (unobserved here — never conflated with the held one)', async () => {
    const adapter = stellarTestAdapter();
    const probe = await adapter.observeAssetPosition({
      accountRef: STELLAR_PAYER_ACCOUNT,
      assetId: STELLAR_OTHER_ISSUER_ASSET_ID,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_UNOBSERVABLE');
    if (probe.kind !== 'POSITION_UNOBSERVABLE') throw new Error('unreachable');
    expect(probe.reason).toBe('ASSET_BINDING_UNKNOWN');
  });

  it('a rejected account observation is POSITION_UNOBSERVABLE (never fabricated)', async () => {
    const adapter = stellarTestAdapter({
      [`/accounts/${STELLAR_PAYER_ACCOUNT}`]: () => ({ status: 404, body: { status: 404 } }),
    });
    const probe = await adapter.observeAssetPosition({
      accountRef: STELLAR_PAYER_ACCOUNT,
      assetId: STELLAR_USDC_ASSET_ID,
      at: NOW_ISO,
    });
    expect(probe.kind).toBe('POSITION_UNOBSERVABLE');
    if (probe.kind !== 'POSITION_UNOBSERVABLE') throw new Error('unreachable');
    expect(probe.reason).toBe('PROVIDER_REJECTED_ACCOUNT');
  });

  it('the account observation parses sequence + balances verbatim (fail closed on malformed)', async () => {
    const observation = await stellarObserveAccount(scriptedStellarHorizon(), STELLAR_PAYER_ACCOUNT);
    expect(observation.sequence).toBe('123456789');
    expect(observation.balances).toHaveLength(2);
    expect(observation.balances[1]).toEqual({
      assetType: 'credit_alphanum4',
      assetCode: 'USDC',
      assetIssuer: STELLAR_TESTNET_USDC_ISSUER,
      balance: STELLAR_USDC_BALANCE,
    });
    await expect(
      stellarObserveAccount(
        scriptedStellarHorizon({
          [`/accounts/${STELLAR_PAYER_ACCOUNT}`]: () => ({ status: 200, body: {} }),
        }),
        STELLAR_PAYER_ACCOUNT,
      ),
    ).rejects.toThrow(/malformed|unobservable/);
  });
});

describe('exact stroop arithmetic (INV-2 — no floating-point money)', () => {
  it('Horizon decimals convert to exact integer stroops by string arithmetic', () => {
    expect(stellarDecimalToStroops('25.5', 'amount')).toBe('255000000');
    expect(stellarDecimalToStroops('0.0000001', 'amount')).toBe('1');
    expect(stellarDecimalToStroops('1000.0000000', 'amount')).toBe('10000000000');
    expect(stellarDecimalToStroops('7', 'amount')).toBe('70000000');
  });

  it('more than 7 fractional digits is LOSSY and rejected (never fabricated)', () => {
    expect(() => stellarDecimalToStroops('1.00000001', 'amount')).toThrow(/7 fractional digits/);
    expect(() => stellarDecimalToStroops(25.5, 'amount')).toThrow(/7 fractional digits/);
    expect(() => stellarDecimalToStroops('', 'amount')).toThrow(/7 fractional digits/);
  });
});
