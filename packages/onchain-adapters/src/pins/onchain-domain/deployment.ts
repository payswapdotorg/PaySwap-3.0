/**
 * STRUCTURAL PIN — the onchain-domain CONTRACT-DEPLOYMENT EVIDENCE RECORD
 * (P22-A, lane 3-a; local structural mirror of
 * @payswap/onchain-domain src/pins-deployment.ts, which the ADR-0016 D4/D7
 * laws govern).
 *
 * The deployment evidence record is what a REAL contract deployment
 * produced — exactly the ADR-0016 appendix field set:
 *
 *   { txHash, contractId, sourceHash, bytecodeHash }
 *
 * THE PIN CONSTRUCTION LAW (ADR-0016 D7): a SmartContractExtensionPin
 * derives ONLY from a complete deployment record — a record missing any
 * field is a TYPED rejection, never a fabricated pin. The adapter's deploy
 * lifecycle path (prepare → authorize → broadcast → observeResult →
 * evidence — see ../../contract/deployment.ts) produces this record from a
 * CONFIRMED deployment observation; nothing else may.
 */

import { ValidationError } from '../../errors.ts';

/**
 * The deployment evidence record: what a REAL contract deployment produced
 * (the frozen ADR-0016 field set — every field mandatory and non-empty).
 */
export interface ContractDeploymentEvidence {
  /** The hash of the deployment transaction (opaque external reference). */
  readonly txHash: string;
  /** The deployed contract's onchain identifier (e.g. the `C…` contract id). */
  readonly contractId: string;
  /** Hash of the verified source artifact the deployment was built from. */
  readonly sourceHash: string;
  /** Hash of the deployed bytecode/artifact (e.g. the wasm hash). */
  readonly bytecodeHash: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates a deployment evidence record (fail closed, completeness law):
 * every one of the four ADR-0016 fields must be present and non-empty —
 * a record with ANY gap is rejected with the typed error naming every
 * missing field (a deployment record is never partially accepted, and a
 * SmartContractExtensionPin is never fabricated from one).
 */
export function validateContractDeploymentEvidence(
  candidate: unknown,
): ContractDeploymentEvidence {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError(
      'a deployment evidence record must be an object { txHash, contractId, sourceHash, bytecodeHash }',
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const { txHash, contractId, sourceHash, bytecodeHash } = record;
  const missing: string[] = [];
  if (!isNonEmptyString(txHash)) missing.push('txHash');
  if (!isNonEmptyString(contractId)) missing.push('contractId');
  if (!isNonEmptyString(sourceHash)) missing.push('sourceHash');
  if (!isNonEmptyString(bytecodeHash)) missing.push('bytecodeHash');
  if (
    !isNonEmptyString(txHash) ||
    !isNonEmptyString(contractId) ||
    !isNonEmptyString(sourceHash) ||
    !isNonEmptyString(bytecodeHash)
  ) {
    const errors = missing.map(
      (field) =>
        `${field} must be a non-empty string — a deployment record without the complete evidence set ({ txHash, contractId, sourceHash, bytecodeHash }) is never a deployment (ADR-0016 D4/D7)`,
    );
    throw new ValidationError(`Invalid deployment evidence record: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return Object.freeze({ txHash, contractId, sourceHash, bytecodeHash });
}
