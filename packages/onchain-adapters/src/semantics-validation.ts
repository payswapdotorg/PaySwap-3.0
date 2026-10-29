/**
 * @payswap/onchain-adapters — family semantics VALIDATION (Work Order
 * P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/semantics.ts validation half).
 *
 * Deterministic, fail closed: a family adapter with implicit or
 * unexpressible-without-reason semantics is unconstructible. Split from
 * semantics.ts to honor the <=400-line file law.
 */

import { ValidationError } from './errors.ts';
import type { ChainFamily } from './pins/onchain-domain/family.ts';
import type {
  FamilyFeeSemantics,
  FamilyFinalitySemantics,
  FamilySemanticsProfile,
  InexpressibleFeeSemantics,
  UtxoMempoolPolicy,
} from './semantics.ts';

// ---------------------------------------------------------------------------
// Validation (deterministic, fail closed)
// ---------------------------------------------------------------------------

const EXACT_DECIMAL = /^(0|[1-9][0-9]*)$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function requireExactDecimal(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'string' || !EXACT_DECIMAL.test(value)) {
    errors.push(
      `${label} must be a non-negative exact integer decimal string (money exactness — no floating-point fees), got '${String(value)}'`,
    );
  }
}

function requirePositiveInteger(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    errors.push(`${label} must be a positive integer`);
  }
}

function validateFeeShape(
  candidate: unknown,
  family: ChainFamily,
): FamilyFeeSemantics | InexpressibleFeeSemantics {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError(`family '${family}' semantics must declare a fee shape`);
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const expressible = (record as { expressible?: unknown }).expressible;
  if (expressible === false) {
    if (!isNonEmptyString(record.reason)) {
      throw new ValidationError(
        `family '${family}' fee semantics: an inexpressible shape requires an explicit reason — the limitation is recorded, never approximated`,
      );
    }
    return { expressible: false, reason: record.reason };
  }
  const errors: string[] = [];
  switch (family) {
    case 'EVM': {
      requireExactDecimal(record.baseFeePerGasMinorUnits, 'fee.baseFeePerGasMinorUnits', errors);
      if (
        record.priorityFeePerGasMinorUnits !== undefined &&
        (typeof record.priorityFeePerGasMinorUnits !== 'string' ||
          !EXACT_DECIMAL.test(record.priorityFeePerGasMinorUnits))
      ) {
        errors.push(
          'fee.priorityFeePerGasMinorUnits, when present, must be an exact decimal string',
        );
      }
      requireExactDecimal(record.gasLimit, 'fee.gasLimit', errors);
      if (record.eip1559 !== true && record.eip1559 !== false) {
        errors.push('fee.eip1559 must be an explicit boolean');
      }
      if (errors.length > 0) {
        throw new ValidationError(`Invalid EVM fee semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'EVM',
        expressible: true,
        feeModel: 'GAS_AUCTION',
        baseFeePerGasMinorUnits: record.baseFeePerGasMinorUnits as string,
        gasLimit: record.gasLimit as string,
        eip1559: record.eip1559 as boolean,
        ...(isNonEmptyString(record.priorityFeePerGasMinorUnits)
          ? { priorityFeePerGasMinorUnits: record.priorityFeePerGasMinorUnits }
          : {}),
      };
    }
    case 'SOLANA': {
      requireExactDecimal(record.lamportsPerSignature, 'fee.lamportsPerSignature', errors);
      if (errors.length > 0) {
        throw new ValidationError(`Invalid Solana fee semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'SOLANA',
        expressible: true,
        feeModel: 'SIGNATURE_FEE',
        lamportsPerSignature: record.lamportsPerSignature as string,
      };
    }
    case 'UTXO': {
      if (
        typeof record.feeRateSatPerVByte !== 'string' ||
        !/^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/.test(record.feeRateSatPerVByte)
      ) {
        errors.push(
          'fee.feeRateSatPerVByte must be an exact decimal string (sat/vB, verbatim provider text — no float arithmetic)',
        );
      }
      requirePositiveInteger(record.estimateTargetBlocks, 'fee.estimateTargetBlocks', errors);
      const policy = record.mempoolPolicy;
      if (policy === null || typeof policy !== 'object') {
        errors.push('fee.mempoolPolicy must be declared (explicit UTXO mempool policy)');
      } else {
        const policyRecord = policy as Readonly<Record<string, unknown>>;
        const replacement = policyRecord.replacement;
        const cpfp = policyRecord.cpfp;
        if (
          replacement !== 'BIP125_OPT_IN' &&
          replacement !== 'UNSUPPORTED' &&
          replacement !== 'UNDECLARED'
        ) {
          errors.push(
            'fee.mempoolPolicy.replacement must be BIP125_OPT_IN, UNSUPPORTED or UNDECLARED (never guessed)',
          );
        }
        if (cpfp !== 'SUPPORTED' && cpfp !== 'UNSUPPORTED' && cpfp !== 'UNDECLARED') {
          errors.push('fee.mempoolPolicy.cpfp must be SUPPORTED, UNSUPPORTED or UNDECLARED');
        }
        if (!isNonEmptyString(policyRecord.declaredBy)) {
          errors.push(
            'fee.mempoolPolicy.declaredBy must be a non-empty provenance reference — a policy claim without provenance is rejected',
          );
        }
        if (errors.length > 0) {
          throw new ValidationError(`Invalid UTXO fee semantics: ${errors.join('; ')}`);
        }
        return {
          family: 'UTXO',
          expressible: true,
          feeModel: 'SATOSHI_PER_VBYTE',
          feeRateSatPerVByte: record.feeRateSatPerVByte as string,
          estimateTargetBlocks: record.estimateTargetBlocks as number,
          mempoolPolicy: Object.freeze({
            replacement: replacement as UtxoMempoolPolicy['replacement'],
            cpfp: cpfp as UtxoMempoolPolicy['cpfp'],
            declaredBy: policyRecord.declaredBy as string,
          }),
        };
      }
      throw new ValidationError(`Invalid UTXO fee semantics: ${errors.join('; ')}`);
    }
    case 'STELLAR': {
      requireExactDecimal(record.stroopsPerOperation, 'fee.stroopsPerOperation', errors);
      if (errors.length > 0) {
        throw new ValidationError(`Invalid Stellar fee semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'STELLAR',
        expressible: true,
        feeModel: 'STROOPS_PER_OPERATION',
        stroopsPerOperation: record.stroopsPerOperation as string,
      };
    }
    default:
      throw new ValidationError(
        `family '${String(family)}' has no declared semantics shape (declared shapes: EVM, SOLANA, UTXO, STELLAR — fail closed, never guessed)`,
      );
  }
}

function validateFinalityShape(candidate: unknown, family: ChainFamily): FamilyFinalitySemantics {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError(`family '${family}' semantics must declare a finality shape`);
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  switch (family) {
    case 'EVM': {
      requirePositiveInteger(
        record.confirmationDepthTarget,
        'finality.confirmationDepthTarget',
        errors,
      );
      if (record.reorgDetection !== 'BLOCK_HASH_OBSERVATION') {
        errors.push("finality.reorgDetection must be 'BLOCK_HASH_OBSERVATION' for EVM");
      }
      if (record.finalityModel !== 'PROBABILISTIC') {
        errors.push("finality.finalityModel must be 'PROBABILISTIC' for EVM");
      }
      if (errors.length > 0) {
        throw new ValidationError(`Invalid EVM finality semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'EVM',
        finalityModel: 'PROBABILISTIC',
        confirmationDepthTarget: record.confirmationDepthTarget as number,
        reorgDetection: 'BLOCK_HASH_OBSERVATION',
      };
    }
    case 'SOLANA': {
      requirePositiveInteger(
        record.slotConfirmationTarget,
        'finality.slotConfirmationTarget',
        errors,
      );
      if (
        record.finalizedCommitment !== 'finalized' &&
        record.finalizedCommitment !== 'confirmed'
      ) {
        errors.push("finality.finalizedCommitment must be 'finalized' or 'confirmed'");
      }
      if (record.forkDetection !== 'SIGNATURE_STATUS_OBSERVATION') {
        errors.push(
          "finality.forkDetection must be 'SIGNATURE_STATUS_OBSERVATION' for Solana",
        );
      }
      if (record.finalityModel !== 'PROBABILISTIC') {
        errors.push(
          "finality.finalityModel must be 'PROBABILISTIC' for Solana (forks before final commitment)",
        );
      }
      if (errors.length > 0) {
        throw new ValidationError(`Invalid Solana finality semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'SOLANA',
        finalityModel: 'PROBABILISTIC',
        slotConfirmationTarget: record.slotConfirmationTarget as number,
        finalizedCommitment: record.finalizedCommitment as 'finalized' | 'confirmed',
        forkDetection: 'SIGNATURE_STATUS_OBSERVATION',
      };
    }
    case 'UTXO': {
      requirePositiveInteger(
        record.confirmationDepthTarget,
        'finality.confirmationDepthTarget',
        errors,
      );
      if (record.reorgDetection !== 'BLOCK_HASH_OBSERVATION') {
        errors.push("finality.reorgDetection must be 'BLOCK_HASH_OBSERVATION' for UTXO");
      }
      if (record.finalityModel !== 'PROBABILISTIC') {
        errors.push("finality.finalityModel must be 'PROBABILISTIC' for UTXO");
      }
      if (errors.length > 0) {
        throw new ValidationError(`Invalid UTXO finality semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'UTXO',
        finalityModel: 'PROBABILISTIC',
        confirmationDepthTarget: record.confirmationDepthTarget as number,
        reorgDetection: 'BLOCK_HASH_OBSERVATION',
      };
    }
    case 'STELLAR': {
      requirePositiveInteger(
        record.ledgerConfirmationTarget,
        'finality.ledgerConfirmationTarget',
        errors,
      );
      if (record.reorgDetection !== 'NOT_APPLICABLE') {
        errors.push(
          "finality.reorgDetection must be 'NOT_APPLICABLE' for Stellar (closed-ledger consensus has no reorg surface — declared honestly, never approximated)",
        );
      }
      if (record.finalityModel !== 'DETERMINISTIC') {
        errors.push(
          "finality.finalityModel must be 'DETERMINISTIC' for Stellar (closed-ledger consensus — the ~3-second consensus class)",
        );
      }
      if (errors.length > 0) {
        throw new ValidationError(`Invalid Stellar finality semantics: ${errors.join('; ')}`);
      }
      return {
        family: 'STELLAR',
        finalityModel: 'DETERMINISTIC',
        ledgerConfirmationTarget: record.ledgerConfirmationTarget as number,
        reorgDetection: 'NOT_APPLICABLE',
      };
    }
    default:
      throw new ValidationError(
        `family '${String(family)}' has no declared finality shape (declared shapes: EVM, SOLANA, UTXO)`,
      );
  }
}

/**
 * Validates a complete family semantics profile (deterministic, fail closed).
 * Returns the frozen profile; an invalid or incomplete profile throws — a
 * family adapter with implicit semantics is unconstructible.
 */
export function validateFamilySemanticsProfile(candidate: unknown): FamilySemanticsProfile {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('family semantics profile must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const family = record.family;
  if (
    family !== 'EVM' &&
    family !== 'SOLANA' &&
    family !== 'UTXO' &&
    family !== 'STELLAR'
  ) {
    throw new ValidationError(
      'semantics profile family must be EVM, SOLANA or UTXO (or STELLAR — P22-A, ADR-0016 D2) — the declared adapter families; others fail closed',
    );
  }
  const fee = validateFeeShape(record.fee, family);
  const finality = validateFinalityShape(record.finality, family);
  return Object.freeze({
    family,
    fee: Object.freeze(fee),
    finality: Object.freeze(finality),
  }) as FamilySemanticsProfile;
}
