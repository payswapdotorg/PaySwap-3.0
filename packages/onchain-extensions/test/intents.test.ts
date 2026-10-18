import { describe, expect, it } from 'vitest';
import { validateOnchainExtensionPack } from '../src/index.ts';
import {
  INTENTS_SETTLEMENT_ADDRESS,
  solverbatchIntentsPack,
} from '../src/packs/solverbatch-intents.ts';
import { variant } from './fixtures.ts';

/**
 * The intent/solver venue, as DECLARATIVE DATA (PORT+ADAPT of the old
 * intents suite: batch-auction quotes and settlement observations belong
 * to the execution/observation lanes; the surface laws — the canonical
 * intent flavor vocabulary (FULFILLER_SETTLED / OPEN), the escrow model,
 * the limit-is-guaranteed-minimum assumption and the
 * settlement-observation-required seam — port here).
 */

const pack = solverbatchIntentsPack();

describe('the intent flavor (the canonical IntentExecutionCapability vocabulary)', () => {
  it('declares FULFILLER_SETTLED settlement with OPEN solver competition', () => {
    if (pack.familyExtension.family !== 'intent-protocol') {
      throw new Error('unreachable');
    }
    expect(pack.familyExtension.settlementModel).toBe('FULFILLER_SETTLED');
    expect(pack.familyExtension.solverCompetition).toBe('OPEN');
    expect(pack.familyExtension.escrowModel).toBe('ONCHAIN_ESCROW');
    expect(pack.familyExtension.batchCadence).toBe('BATCHED');
    expect(pack.familyExtension.surplusModel).toBe('RETURNED_TO_USER');
  });

  it('declares its settlement domain over the canonical chain key', () => {
    if (pack.familyExtension.family !== 'intent-protocol') {
      throw new Error('unreachable');
    }
    expect(pack.familyExtension.supportedDomains).toEqual(['ethereum:mainnet']);
  });

  it('is bound to the INTENT_NETWORK protocol class (the family coupling law)', () => {
    expect(pack.protocol.protocolClass).toBe('INTENT_NETWORK');
  });

  it('an unknown settlement model is rejected (closed vocabulary)', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'intent-protocol' }),
            settlementModel: 'ATOMIC_ESCROW_SWAP',
          };
        }),
      ),
    ).toThrow(/settlementModel/);
  });

  it('a restricted-competition variant stays valid (the vocabulary admits it)', () => {
    expect(() =>
      validateOnchainExtensionPack(
        variant(pack, (draft) => {
          draft.familyExtension = {
            ...(draft.familyExtension as { family: 'intent-protocol' }),
            solverCompetition: 'SINGLE_FULFILLER',
          };
        }),
      ),
    ).not.toThrow();
  });
});

describe('the auction-limit law (ported as declarative constraints)', () => {
  it('the limit is the guaranteed minimum (escrow-returning, atomic)', () => {
    const limit = pack.constraints.find(
      (constraint) => constraint.constraintId === 'limit-is-guaranteed-minimum',
    );
    expect(limit?.kind).toBe('ASSUMPTION');
    expect(limit?.description).toContain('guaranteed minimum');
    expect(limit?.description).toContain('no partial fills');
  });

  it('the quote-to-executed seam requires a settlement observation (a quote is never an outcome)', () => {
    const seam = pack.constraints.find(
      (constraint) => constraint.constraintId === 'settlement-observation-required',
    );
    expect(seam?.kind).toBe('OPERATIONAL_REQUIREMENT');
    expect(seam?.description).toContain('settlement observation');
    expect(seam?.description).toContain('never an outcome');
  });

  it('its batch-settlement contract is a SYNTHETIC model deployment with escrow custody', () => {
    const settlement = pack.protocol.smartContracts[0];
    expect(settlement?.contractAddress).toBe(INTENTS_SETTLEMENT_ADDRESS);
    expect(settlement?.custody.custodial).toBe(false);
    expect(settlement?.custody.withdrawalAuthority).toContain('escrow vault');
    expect(settlement?.pausePowers[0]?.scope).toContain('settled batches are final');
  });
});
