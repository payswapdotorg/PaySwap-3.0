import { describe, expect, it } from 'vitest';
import * as core from '../src/index.ts';
import {
  ADAPTER_LIFECYCLE_STAGES,
  lifecycleStageDeclared,
} from '../src/contract/stages.ts';
import { RAIL_ENVIRONMENT_CLASSES } from '../src/environment.ts';
import { assertEndpointProviderDiversity } from '../src/transport.ts';
import { validateFamilySemanticsProfile } from '../src/semantics-validation.ts';
import { adapterObservationPermitsFinalityDeclaration } from '../src/settlement-gate.ts';
import { PACKAGE_NAME } from '../src/version.ts';

/**
 * Smoke: the export surface covers every Work Order scope item (the
 * deterministic adapter contract layer — no live network calls).
 */
describe('smoke: the vendor-neutral core surface', () => {
  it('exports the package identity and the frozen lifecycle vocabulary (nine stages)', () => {
    expect(PACKAGE_NAME).toBe('@payswap/onchain-adapters');
    expect(core.PACKAGE_NAME).toBe('@payswap/onchain-adapters');
    expect(ADAPTER_LIFECYCLE_STAGES).toEqual([
      'observe',
      'prepare',
      'simulate',
      'authorize',
      'broadcast',
      'observeResult',
      'finality',
      'reconcile',
      'evidence',
    ]);
    expect(
      lifecycleStageDeclared({ lifecycle: { observe: true } as never }, 'observe'),
    ).toBe(true);
  });

  it('exports the structural environment vocabulary + transport contracts + settlement gate + semantics validator', () => {
    expect(RAIL_ENVIRONMENT_CLASSES).toEqual(['PRODUCTION', 'TESTNET', 'REGTEST', 'SIMULATION']);
    expect(typeof assertEndpointProviderDiversity).toBe('function');
    expect(typeof validateFamilySemanticsProfile).toBe('function');
    expect(typeof adapterObservationPermitsFinalityDeclaration).toBe('function');
    expect(adapterObservationPermitsFinalityDeclaration()).toBe(false);
    // The structural pins are part of the core surface.
    expect(typeof core.validateOnchainExecutionDirective).toBe('function');
    expect(typeof core.validateOnchainExecutionObservation).toBe('function');
    expect(typeof core.settlementAttemptEventCandidate).toBe('function');
    expect(typeof core.onchainRailId).toBe('function');
    expect(typeof core.assertNoSecretMaterial).toBe('function');
    expect(typeof core.contentDigest).toBe('function');
    // The injected kernel seam + the operation state machine.
    expect(typeof core.runAuthorizeStage).toBe('function');
    expect(typeof core.AdapterOperationTracker).toBe('function');
    expect(typeof core.BaseChainFamilyAdapter).toBe('function');
  });

  it('the family subpaths export the three adapters (contract layer, zero I/O)', async () => {
    const evm = await import('../src/evm/index.ts');
    const solana = await import('../src/solana/index.ts');
    const utxo = await import('../src/utxo/index.ts');
    expect(typeof evm.EvmChainAdapter).toBe('function');
    expect(typeof solana.SolanaChainAdapter).toBe('function');
    expect(typeof utxo.UtxoChainAdapter).toBe('function');
    // The family identities are public constants (never secrets).
    expect(evm.EVM_CHAIN_IDS['ethereum:mainnet']).toBe('1');
    expect(solana.SOLANA_GENESIS_HASHES['solana:mainnet-beta']).toBe(
      '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', // PUBLIC
    );
    expect(utxo.BITCOIN_GENESIS_HASHES['bitcoin:mainnet']).toBe(
      '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
    );
  });
});
