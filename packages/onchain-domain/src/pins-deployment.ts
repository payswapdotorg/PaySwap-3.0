/**
 * @payswap/onchain-domain — the CONTRACT-DEPLOYMENT EVIDENCE RECORD and the
 * pin construction law (P22-A, lane 3-a; ADR-0016 D4/D7).
 *
 * A deployment is a consequential onchain write (the `onchain.contract_deploy`
 * operation kind — ./operations.ts) whose OBSERVED result is a deployed
 * contract. The DEPLOYMENT EVIDENCE RECORD is the frozen four-field record
 * the adapter lifecycle's evidence stage produces for a real deployment:
 *
 *   { txHash, contractId, sourceHash, bytecodeHash }
 *
 * THE PIN CONSTRUCTION LAW (ADR-0016 D7): a SmartContractExtensionPin — the
 * declaration surface for what a deployment produced — derives ONLY from a
 * REAL deployment record. A record missing any field is a TYPED rejection:
 * the pin is never fabricated, guessed or defaulted (the declaration-
 * completeness law of ./pins-smart-contract.ts applies unchanged to every
 * other field of the derived pin).
 *
 * Split from ./pins-smart-contract.ts to honor the <=400-line file law (the
 * asset.ts / asset-observation.ts precedent).
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString, isRecord } from "./shared.ts";
import type {
  PinnedSmartContractAuthority,
  PinnedSmartContractCustodyProperties,
  PinnedSmartContractOracleDependency,
  PinnedSmartContractPausePower,
  SmartContractExtensionPin,
} from "./pins-smart-contract.ts";
import { validateSmartContractExtensionPin } from "./pins-smart-contract.ts";

// ---------------------------------------------------------------------------
// The deployment evidence record (ADR-0016 D4 — the frozen field set)
// ---------------------------------------------------------------------------

/**
 * The deployment evidence record: what a REAL contract deployment produced.
 * Exactly the ADR-0016 appendix field set — `txHash`, `contractId`,
 * `sourceHash`, `bytecodeHash` — every field mandatory and non-empty (an
 * incomplete record is never a deployment, and never the source of a pin).
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

/**
 * Validates a deployment evidence record (fail closed, completeness law):
 * every one of the four ADR-0016 fields must be present and non-empty. A
 * record with ANY gap is rejected with the typed error naming every missing
 * field — a deployment record is never partially accepted.
 */
export function validateContractDeploymentEvidence(
  candidate: unknown,
): ContractDeploymentEvidence {
  if (!isRecord(candidate)) {
    throw new ValidationError(
      "a deployment evidence record must be an object { txHash, contractId, sourceHash, bytecodeHash }",
    );
  }
  const errors: string[] = [];
  for (const field of ["txHash", "contractId", "sourceHash", "bytecodeHash"] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(
        `${field} must be a non-empty string — a deployment record without the complete evidence set ({ txHash, contractId, sourceHash, bytecodeHash }) is never a deployment (ADR-0016 D4/D7)`,
      );
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid deployment evidence record: ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return Object.freeze({
    txHash: candidate.txHash as string,
    contractId: candidate.contractId as string,
    sourceHash: candidate.sourceHash as string,
    bytecodeHash: candidate.bytecodeHash as string,
  });
}

// ---------------------------------------------------------------------------
// The pin construction law (ADR-0016 D7 — never fabricated)
// ---------------------------------------------------------------------------

/** The declaration inputs the deployment record alone cannot supply. */
export interface SmartContractPinDeploymentDeclaration {
  /** The chain the contract was deployed on (canonical chain key). */
  readonly chainRef: string;
  readonly upgradeAuthority: PinnedSmartContractAuthority;
  readonly adminAuthority: PinnedSmartContractAuthority;
  readonly pausePowers: readonly PinnedSmartContractPausePower[];
  readonly oracleDependencies: readonly PinnedSmartContractOracleDependency[];
  readonly custody: PinnedSmartContractCustodyProperties;
  readonly searchableByLabAfterCertification: boolean;
}

/**
 * THE ONLY LAWFUL WAY a SmartContractExtensionPin enters the world for a
 * DEPLOYED contract (ADR-0016 D4/D7): derive it from a REAL deployment
 * evidence record. The record is validated FIRST (a typed rejection names
 * every missing field — the pin is never fabricated); the derived pin then
 * passes the full declaration-completeness validation (the authorities,
 * pause powers, oracle dependencies and custody are declared inputs, never
 * guessed). The pin's `contractAddress` IS the deployed contract id, and
 * its source/bytecode hashes ARE the record's — carried, never re-derived.
 */
export function smartContractExtensionPinFromDeployment(
  input: {
    readonly deployment: unknown;
  } & SmartContractPinDeploymentDeclaration,
): SmartContractExtensionPin {
  // The pin construction law: validate the REAL deployment record first —
  // an incomplete record is a typed rejection and the pin never forms.
  const deployment = validateContractDeploymentEvidence(input.deployment);
  return validateSmartContractExtensionPin({
    kind: "smart_contract_extension",
    chainRef: input.chainRef,
    contractAddress: deployment.contractId,
    sourceHash: deployment.sourceHash,
    bytecodeHash: deployment.bytecodeHash,
    upgradeAuthority: input.upgradeAuthority,
    adminAuthority: input.adminAuthority,
    pausePowers: input.pausePowers,
    oracleDependencies: input.oracleDependencies,
    custody: input.custody,
    searchableByLabAfterCertification: input.searchableByLabAfterCertification,
  });
}
