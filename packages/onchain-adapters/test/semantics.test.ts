import { describe, expect, it } from 'vitest';
import { validateFamilySemanticsProfile } from '../src/semantics-validation.ts';
import { ValidationError } from '../src/errors.ts';
import type { EvmSemanticsProfile, FamilySemanticsProfile } from '../src/semantics.ts';

/**
 * EXPLICIT family semantics profiles (ported from the old contract.test.ts
 * semantics half + environment-adjacent fee shapes): fee/finality/reorg
 * semantics are DATA with provenance; a profile that cannot express its
 * family's semantics is REJECTED at construction; an inexpressible
 * semantic REQUIRES an explicit reason — never approximated.
 */
describe('explicit family semantics (fail closed, never approximated)', () => {
  it('an EVM fee shape without exact integers is rejected (the money-exactness law)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'EVM',
        fee: {
          family: 'EVM',
          expressible: true,
          feeModel: 'GAS_AUCTION',
          baseFeePerGasMinorUnits: '1.5e7',
          gasLimit: '21000',
          eip1559: true,
        },
        finality: {
          family: 'EVM',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: 12,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'EVM',
        fee: {
          family: 'EVM',
          expressible: true,
          feeModel: 'GAS_AUCTION',
          baseFeePerGasMinorUnits: '100000000',
          gasLimit: 21000 as unknown as string,
          eip1559: true,
        },
        finality: {
          family: 'EVM',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: 12,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(ValidationError);
  });

  it('an inexpressible fee REQUIRES an explicit reason (the limitation is recorded)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'EVM',
        fee: { expressible: false },
        finality: {
          family: 'EVM',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: 12,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(/explicit reason/);
    const profile = validateFamilySemanticsProfile({
      family: 'EVM',
      fee: { expressible: false, reason: 'fee parameters not yet observed' },
      finality: {
        family: 'EVM',
        finalityModel: 'PROBABILISTIC',
        confirmationDepthTarget: 12,
        reorgDetection: 'BLOCK_HASH_OBSERVATION',
      },
    });
    expect(profile.fee.expressible).toBe(false);
  });

  it('a UTXO fee rate is an exact decimal string (verbatim provider text)', () => {
    const profile = validateFamilySemanticsProfile({
      family: 'UTXO',
      fee: {
        family: 'UTXO',
        expressible: true,
        feeModel: 'SATOSHI_PER_VBYTE',
        feeRateSatPerVByte: '2.5',
        estimateTargetBlocks: 6,
        mempoolPolicy: {
          replacement: 'BIP125_OPT_IN',
          cpfp: 'SUPPORTED',
          declaredBy: 'BIP-125 documentation',
        },
      },
      finality: {
        family: 'UTXO',
        finalityModel: 'PROBABILISTIC',
        confirmationDepthTarget: 6,
        reorgDetection: 'BLOCK_HASH_OBSERVATION',
      },
    });
    expect(profile.fee.expressible).toBe(true);
    // Float-shaped rates beyond the declared precision are rejected.
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'UTXO',
        fee: {
          family: 'UTXO',
          expressible: true,
          feeModel: 'SATOSHI_PER_VBYTE',
          feeRateSatPerVByte: '2.5000000001',
          estimateTargetBlocks: 6,
          mempoolPolicy: {
            replacement: 'BIP125_OPT_IN',
            cpfp: 'SUPPORTED',
            declaredBy: 'BIP-125 documentation',
          },
        },
        finality: {
          family: 'UTXO',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: 6,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(ValidationError);
  });

  it('a mempool policy claim without provenance is rejected', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'UTXO',
        fee: {
          family: 'UTXO',
          expressible: true,
          feeModel: 'SATOSHI_PER_VBYTE',
          feeRateSatPerVByte: '2.5',
          estimateTargetBlocks: 6,
          mempoolPolicy: {
            replacement: 'BIP125_OPT_IN',
            cpfp: 'SUPPORTED',
            declaredBy: '',
          },
        },
        finality: {
          family: 'UTXO',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: 6,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(/provenance/);
  });

  it('family/semantics mismatch fails closed (EVM semantics under a SOLANA profile)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'SOLANA',
        fee: {
          family: 'EVM',
          expressible: true,
          feeModel: 'GAS_AUCTION',
          baseFeePerGasMinorUnits: '100000000',
          gasLimit: '21000',
          eip1559: true,
        },
        finality: {
          family: 'SOLANA',
          finalityModel: 'PROBABILISTIC',
          slotConfirmationTarget: 32,
          finalizedCommitment: 'finalized',
          forkDetection: 'SIGNATURE_STATUS_OBSERVATION',
        },
      }),
    ).toThrow(ValidationError);
  });

  it('undeclared families have no semantics shape (MOVE fails closed)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'MOVE',
        fee: { expressible: false, reason: 'n/a' },
        finality: {
          family: 'MOVE',
          finalityModel: 'DETERMINISTIC',
        },
      }),
    ).toThrow(/EVM, SOLANA or UTXO/);
  });

  it('the frozen profile validates for every family (fee + finality + reorg/fork)', () => {
    const evm = validateFamilySemanticsProfile({
      family: 'EVM',
      fee: {
        family: 'EVM',
        expressible: true,
        feeModel: 'GAS_AUCTION',
        baseFeePerGasMinorUnits: '100000000',
        gasLimit: '21000',
        eip1559: true,
      },
      finality: {
        family: 'EVM',
        finalityModel: 'PROBABILISTIC',
        confirmationDepthTarget: 12,
        reorgDetection: 'BLOCK_HASH_OBSERVATION',
      },
    });
    if (evm.finality.family === 'EVM') {
      expect(evm.finality.confirmationDepthTarget).toBe(12);
    } else {
      throw new Error('the validated EVM profile must carry EVM finality semantics');
    }
    const solana = validateFamilySemanticsProfile({
      family: 'SOLANA',
      fee: {
        family: 'SOLANA',
        expressible: true,
        feeModel: 'SIGNATURE_FEE',
        lamportsPerSignature: '5000',
      },
      finality: {
        family: 'SOLANA',
        finalityModel: 'PROBABILISTIC',
        slotConfirmationTarget: 32,
        finalizedCommitment: 'finalized',
        forkDetection: 'SIGNATURE_STATUS_OBSERVATION',
      },
    });
    expect(solana.fee.expressible).toBe(true);
    expect(Object.isFrozen(solana)).toBe(true);
  });

  it('finality guidance must be a positive integer (never approximated)', () => {
    expect(() =>
      validateFamilySemanticsProfile({
        family: 'EVM',
        fee: { expressible: false, reason: 'not observed' },
        finality: {
          family: 'EVM',
          finalityModel: 'PROBABILISTIC',
          confirmationDepthTarget: 0,
          reorgDetection: 'BLOCK_HASH_OBSERVATION',
        },
      }),
    ).toThrow(ValidationError);
  });
});
