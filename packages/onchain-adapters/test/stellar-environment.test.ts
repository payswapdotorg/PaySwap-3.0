import { describe, expect, it } from 'vitest';
import {
  CHAIN_ENVIRONMENT_REGISTRY,
  assertEnvironmentClass,
  classifyChainEnvironment,
  railEnvironment,
} from '../src/environment.ts';
import { ValidationError } from '../src/errors.ts';
import { validateFamilySemanticsProfile } from '../src/semantics-validation.ts';
import { assertEndpointProviderDiversity } from '../src/transport.ts';
import {
  STELLAR_NETWORK_PASSPHRASES,
  STELLAR_TESTNET_PUBLIC_ENDPOINTS,
} from '../src/stellar/identities.ts';

/**
 * P22-A (ADR-0016 D2): the `stellar:testnet` environment registry entry —
 * the fail-closed re-pin. Exactly ONE Stellar entry exists (class TESTNET);
 * `stellar:pubnet` is DELIBERATELY NOT REGISTERED (a pubnet wave is a future
 * operator order; the registry stays minimal and honest — an unregistered
 * key classifies FAIL CLOSED, never guessed). The identities table follows
 * the registry exactly, and the STELLAR semantics profile validates in its
 * OWN shape (STROOPS_PER_OPERATION + closed-ledger finality), never another
 * family's.
 */

const STELLAR_CHAIN = 'stellar:testnet';

describe('the stellar:testnet environment registry entry (ADR-0016 D2 — the fail-closed re-pin)', () => {
  it('stellar:testnet classifies TESTNET (the frozen registry)', () => {
    expect(classifyChainEnvironment(STELLAR_CHAIN)).toBe('TESTNET');
    expect(CHAIN_ENVIRONMENT_REGISTRY[STELLAR_CHAIN]).toBe('TESTNET');
  });

  it('stellar:pubnet is DELIBERATELY NOT REGISTERED and fails closed (a pubnet wave is a future operator order)', () => {
    expect(CHAIN_ENVIRONMENT_REGISTRY['stellar:pubnet']).toBeUndefined();
    expect(() => classifyChainEnvironment('stellar:pubnet')).toThrow(ValidationError);
  });

  it('unknown stellar-shaped keys fail closed (never guessed)', () => {
    expect(() => classifyChainEnvironment('stellar:futurenet')).toThrow(ValidationError);
    expect(() => classifyChainEnvironment('stellar:')).toThrow(ValidationError);
  });

  it('the environment token DERIVES from the chain identity (structural, never declared)', () => {
    const environment = railEnvironment(STELLAR_CHAIN);
    expect(environment.chainKey).toBe(STELLAR_CHAIN);
    expect(environment.environmentClass).toBe('TESTNET');
    expect(environment.declaredBy).toContain('CHAIN_ENVIRONMENT_REGISTRY');
  });

  it('runtime re-derivation rejects a forged PRODUCTION class for stellar:testnet', () => {
    expect(() => assertEnvironmentClass(STELLAR_CHAIN, 'PRODUCTION')).toThrow(ValidationError);
    expect(() => assertEnvironmentClass(STELLAR_CHAIN, 'TESTNET')).not.toThrow();
  });
});

describe('the well-known Stellar identities follow the registry exactly (ADR-0016 D2)', () => {
  it('the network passphrase table declares stellar:testnet ONLY (the pubnet passphrase is NOT declared)', () => {
    expect(Object.keys(STELLAR_NETWORK_PASSPHRASES)).toEqual([STELLAR_CHAIN]);
    // PUBLIC: the SDF-defined testnet network passphrase (a public constant).
    expect(STELLAR_NETWORK_PASSPHRASES[STELLAR_CHAIN]).toBe(
      'Test SDF Network ; September 2015',
    );
  });

  it('the public testnet endpoint profile serves a REGISTERED chain', () => {
    expect(STELLAR_TESTNET_PUBLIC_ENDPOINTS).toHaveLength(1);
    for (const profile of STELLAR_TESTNET_PUBLIC_ENDPOINTS) {
      expect(profile.chainKey).toBe(STELLAR_CHAIN);
      expect(profile.protocol).toBe('REST');
      expect(classifyChainEnvironment(profile.chainKey)).toBe('TESTNET');
    }
  });

  it('the single testnet endpoint satisfies the endpoint-diversity law (testnets are exempt)', () => {
    expect(() =>
      assertEndpointProviderDiversity(STELLAR_TESTNET_PUBLIC_ENDPOINTS, 'TESTNET'),
    ).not.toThrow();
  });
});

describe('the STELLAR family semantics profile (ADR-0016 D2 — its own declared shape)', () => {
  it('a well-formed STELLAR profile validates (STROOPS_PER_OPERATION + closed-ledger finality)', () => {
    const profile = validateFamilySemanticsProfile({
      family: 'STELLAR',
      fee: {
        family: 'STELLAR',
        expressible: true,
        feeModel: 'STROOPS_PER_OPERATION',
        stroopsPerOperation: '100',
      },
      finality: {
        family: 'STELLAR',
        finalityModel: 'DETERMINISTIC',
        ledgerConfirmationTarget: 1,
        reorgDetection: 'NOT_APPLICABLE',
      },
    });
    expect(profile.family).toBe('STELLAR');
    // Narrow the family unions to the STELLAR members (the fee union first
    // drops the inexpressible shape on `expressible`, then discriminates on
    // the STELLAR-only feeModel; the finality union discriminates on `family`
    // — every other member would be a validation bug).
    if (!(profile.fee.expressible && profile.fee.feeModel === 'STROOPS_PER_OPERATION')) {
      throw new Error('unreachable: the profile is expressible in stroops');
    }
    expect(profile.fee.stroopsPerOperation).toBe('100');
    if (profile.finality.family !== 'STELLAR') {
      throw new Error('unreachable: a STELLAR profile carries the STELLAR finality member');
    }
    expect(profile.finality.finalityModel).toBe('DETERMINISTIC');
    expect(profile.finality.reorgDetection).toBe('NOT_APPLICABLE');
  });

  it('an inexpressible fee is carried honestly (never approximated)', () => {
    const profile = validateFamilySemanticsProfile({
      family: 'STELLAR',
      fee: { expressible: false, reason: 'fee-stats feed unreachable' },
      finality: {
        family: 'STELLAR',
        finalityModel: 'DETERMINISTIC',
        ledgerConfirmationTarget: 2,
        reorgDetection: 'NOT_APPLICABLE',
      },
    });
    expect(profile.fee.expressible).toBe(false);
  });

  it('reorg detection must be NOT_APPLICABLE (closed-ledger consensus has no reorg surface — never approximated with another family\'s shape)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'STELLAR',
        fee: { expressible: false, reason: 'n/a' },
        finality: {
          family: 'STELLAR',
          finalityModel: 'DETERMINISTIC',
          ledgerConfirmationTarget: 1,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(/reorgDetection must be 'NOT_APPLICABLE' for Stellar/);
  });

  it('the finality model must be DETERMINISTIC (the ~3-second closed-ledger consensus class)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'STELLAR',
        fee: { expressible: false, reason: 'n/a' },
        finality: {
          family: 'STELLAR',
          finalityModel: 'PROBABILISTIC',
          ledgerConfirmationTarget: 1,
          reorgDetection: 'NOT_APPLICABLE',
        },
      }),
    ).toThrow(/finalityModel must be 'DETERMINISTIC' for Stellar/);
  });

  it('the ledger confirmation target must be a positive integer (never guessed)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'STELLAR',
        fee: { expressible: false, reason: 'n/a' },
        finality: {
          family: 'STELLAR',
          finalityModel: 'DETERMINISTIC',
          ledgerConfirmationTarget: 0,
          reorgDetection: 'NOT_APPLICABLE',
        },
      }),
    ).toThrow(/ledgerConfirmationTarget/);
  });

  it('the fee shape is exact (stroopsPerOperation is an exact integer string)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'STELLAR',
        fee: {
          family: 'STELLAR',
          expressible: true,
          feeModel: 'STROOPS_PER_OPERATION',
          stroopsPerOperation: '1.5',
        },
        finality: {
          family: 'STELLAR',
          finalityModel: 'DETERMINISTIC',
          ledgerConfirmationTarget: 1,
          reorgDetection: 'NOT_APPLICABLE',
        },
      }),
    ).toThrow(/stroopsPerOperation/);
  });

  it('undeclared families still fail closed (the MOVE pin stays byte-identical)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'MOVE',
        fee: { expressible: false, reason: 'n/a' },
        finality: { family: 'MOVE', finalityModel: 'DETERMINISTIC' },
      }),
    ).toThrow(/EVM, SOLANA or UTXO/);
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'MOVE',
        fee: { expressible: false, reason: 'n/a' },
        finality: { family: 'MOVE', finalityModel: 'DETERMINISTIC' },
      }),
    ).toThrow(/STELLAR/);
  });
});
