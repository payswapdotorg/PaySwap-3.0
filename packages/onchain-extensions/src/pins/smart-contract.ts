/**
 * STRUCTURAL PIN — the INV-SC01 smart-contract declaration + the protocol
 * descriptor (Work Order P5-W2, lane R3-W2; local structural mirror of
 * payswap.org@8a735bf packages/capabilities/src/smart-contract.ts and
 * packages/onchain-domain/src/onchain-protocol.ts).
 *
 * The canonical @payswap/onchain-domain package (P4-W1) owns these
 * contracts; the shapes below are LOCAL STRUCTURAL MIRRORS pinned so this
 * package's hermetic battery can construct and validate them offline. Same
 * field names, same literals, zero imports — the TL wires the types at
 * integration (structural compatibility by construction).
 */

import { ValidationError } from '../errors.ts';
import { isNonEmptyString } from '../shared.ts';
import type { ProtocolClass } from './onchain-domain.ts';
import { isProtocolClass, isValidChainKey, isValidProtocolKey } from './onchain-domain.ts';

export const SMART_CONTRACT_AUTHORITY_KINDS = Object.freeze([
  'IMMUTABLE',
  'PROVIDER_GOVERNED',
  'MULTISIG',
  'UPGRADEABLE',
  'DAO',
] as const);
export type SmartContractAuthorityKind = (typeof SMART_CONTRACT_AUTHORITY_KINDS)[number];

/** A declared upgrade/admin authority over a smart contract (INV-SC01). */
export interface SmartContractAuthority {
  readonly kind: SmartContractAuthorityKind;
  readonly description: string;
  /** Declared timelock/execution delay (free-form, e.g. '48h timelock'). */
  readonly delayOrTimelock?: string;
}

/** One declared pause power. */
export interface SmartContractPausePower {
  readonly actor: string;
  readonly scope: string;
}

/** One declared oracle dependency. */
export interface SmartContractOracleDependency {
  readonly oracleRef: string;
  readonly usage: string;
}

/** Declared custody properties (INV-SC01; INV-NC02/NC03 for fund-holding). */
export interface SmartContractCustodyProperties {
  readonly custodial: boolean;
  /** Who actually holds funds when custodial; must be declared when true. */
  readonly custodianRef?: string;
  /** How the contract's withdrawal/recovery authority is exercised. */
  readonly withdrawalAuthority: string;
  readonly keyManagement: string;
}

/**
 * A smart-contract extension declaration (INV-SC01). Every field is a
 * declared property — the validator below rejects any omission.
 */
export interface SmartContractDeclaration {
  readonly kind: 'smart_contract_extension';
  /** Chain identifier (e.g. 'ethereum:mainnet'). */
  readonly chainRef: string;
  readonly contractAddress: string;
  /** Hash of the verified source. */
  readonly sourceHash: string;
  /** Hash of the deployed bytecode. */
  readonly bytecodeHash: string;
  readonly upgradeAuthority: SmartContractAuthority;
  readonly adminAuthority: SmartContractAuthority;
  readonly pausePowers: readonly SmartContractPausePower[];
  readonly oracleDependencies: readonly SmartContractOracleDependency[];
  readonly custody: SmartContractCustodyProperties;
  /**
   * Declares that the Lab may index/search this contract once the carrying
   * capability is certified. A searchability flag is never execution
   * authority.
   */
  readonly searchableByLabAfterCertification: boolean;
}

function isAuthorityKind(value: unknown): value is SmartContractAuthorityKind {
  return (
    typeof value === 'string' &&
    (SMART_CONTRACT_AUTHORITY_KINDS as readonly unknown[]).includes(value)
  );
}

function readAuthority(
  record: Readonly<Record<string, unknown>>,
  field: 'upgradeAuthority' | 'adminAuthority',
  errors: string[],
): void {
  const value = record[field];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} must be a declared SmartContractAuthority (INV-SC01)`);
    return;
  }
  const authority = value as Readonly<Record<string, unknown>>;
  if (!isAuthorityKind(authority.kind)) {
    errors.push(`${field}.kind must be one of SMART_CONTRACT_AUTHORITY_KINDS`);
  }
  if (!isNonEmptyString(authority.description)) {
    errors.push(`${field}.description must be a non-empty string`);
  }
  if (
    authority.delayOrTimelock !== undefined &&
    !isNonEmptyString(authority.delayOrTimelock)
  ) {
    errors.push(`${field}.delayOrTimelock, when present, must be a non-empty string`);
  }
}

/**
 * Validates a smart-contract declaration (fail closed, accumulate law).
 * Returns a deep-frozen copy; throws ValidationError with every defect.
 */
export function validateSmartContractDeclaration(
  candidate: unknown,
): Readonly<SmartContractDeclaration> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new ValidationError('smart-contract declaration must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (record.kind !== 'smart_contract_extension') {
    errors.push("kind must be the literal 'smart_contract_extension'");
  }
  if (!isValidChainKey(record.chainRef)) {
    errors.push('chainRef must be a canonical `${namespace}:${network}` chain key');
  }
  if (!isNonEmptyString(record.contractAddress)) {
    errors.push('contractAddress must be a non-empty string');
  }
  if (!isNonEmptyString(record.sourceHash)) {
    errors.push('sourceHash must be a non-empty string');
  }
  if (!isNonEmptyString(record.bytecodeHash)) {
    errors.push('bytecodeHash must be a non-empty string');
  }
  readAuthority(record, 'upgradeAuthority', errors);
  readAuthority(record, 'adminAuthority', errors);
  const pausePowers = record.pausePowers;
  if (!Array.isArray(pausePowers)) {
    errors.push('pausePowers must be an array');
  } else {
    pausePowers.forEach((power, index) => {
      if (power === null || typeof power !== 'object' || Array.isArray(power)) {
        errors.push(`pausePowers[${index}] must be { actor, scope }`);
        return;
      }
      const entry = power as Readonly<Record<string, unknown>>;
      if (!isNonEmptyString(entry.actor) || !isNonEmptyString(entry.scope)) {
        errors.push(`pausePowers[${index}] must carry non-empty actor and scope`);
      }
    });
  }
  const oracleDependencies = record.oracleDependencies;
  if (!Array.isArray(oracleDependencies)) {
    errors.push('oracleDependencies must be an array');
  } else {
    oracleDependencies.forEach((dependency, index) => {
      if (dependency === null || typeof dependency !== 'object' || Array.isArray(dependency)) {
        errors.push(`oracleDependencies[${index}] must be { oracleRef, usage }`);
        return;
      }
      const entry = dependency as Readonly<Record<string, unknown>>;
      if (!isNonEmptyString(entry.oracleRef) || !isNonEmptyString(entry.usage)) {
        errors.push(`oracleDependencies[${index}] must carry non-empty oracleRef and usage`);
      }
    });
  }
  const custody = record.custody;
  if (custody === null || typeof custody !== 'object' || Array.isArray(custody)) {
    errors.push('custody must be declared (SmartContractCustodyProperties)');
  } else {
    const custodyRecord = custody as Readonly<Record<string, unknown>>;
    if (typeof custodyRecord.custodial !== 'boolean') {
      errors.push('custody.custodial must be a boolean');
    }
    if (custodyRecord.custodial === true && !isNonEmptyString(custodyRecord.custodianRef)) {
      errors.push('custody.custodianRef must be declared when custodial is true');
    }
    if (!isNonEmptyString(custodyRecord.withdrawalAuthority)) {
      errors.push('custody.withdrawalAuthority must be a non-empty string');
    }
    if (!isNonEmptyString(custodyRecord.keyManagement)) {
      errors.push('custody.keyManagement must be a non-empty string');
    }
  }
  if (typeof record.searchableByLabAfterCertification !== 'boolean') {
    errors.push('searchableByLabAfterCertification must be a boolean');
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid smart-contract declaration: ${errors.join('; ')}`,
      { errors: [...errors] },
    );
  }
  return Object.freeze({
    ...(candidate as SmartContractDeclaration),
  }) as Readonly<SmartContractDeclaration>;
}

// ---------------------------------------------------------------------------
// The protocol descriptor (old onchain-domain/src/onchain-protocol.ts)
// ---------------------------------------------------------------------------

/**
 * The neutral protocol descriptor: canonical identity, class, chain and the
 * complete INV-SC01 declarations of every contract the venue comprises
 * (router, factory, settlement contract — at least one).
 */
export interface ProtocolDescriptor {
  /** Canonical protocol identity (a protocolKey). */
  readonly protocolKey: string;
  readonly displayName: string;
  readonly protocolClass: ProtocolClass;
  readonly chainKey: string;
  /** At least one canonical smart-contract declaration (INV-SC01). */
  readonly smartContracts: readonly SmartContractDeclaration[];
}

/** Validates a protocol descriptor (fail closed, accumulate law). */
export function validateProtocolDescriptor(
  candidate: unknown,
): Readonly<ProtocolDescriptor> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new ValidationError('protocol descriptor must be an object');
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (!isValidProtocolKey(record.protocolKey)) {
    errors.push('protocolKey must match /^[a-z0-9][a-z0-9._-]{0,63}$/');
  }
  if (!isNonEmptyString(record.displayName)) {
    errors.push('displayName must be a non-empty string');
  }
  if (!isProtocolClass(record.protocolClass)) {
    errors.push('protocolClass must be one of PROTOCOL_CLASSES');
  }
  if (!isValidChainKey(record.chainKey)) {
    errors.push('chainKey must be a canonical `${namespace}:${network}` chain key');
  }
  const contracts = record.smartContracts;
  if (!Array.isArray(contracts) || contracts.length === 0) {
    errors.push('smartContracts must carry at least one INV-SC01 declaration');
  } else {
    contracts.forEach((contract, index) => {
      try {
        const validated = validateSmartContractDeclaration(contract);
        if (validated.chainRef !== record.chainKey) {
          errors.push(
            `smartContracts[${index}].chainRef '${String(validated.chainRef)}' must equal the protocol's chainKey '${String(record.chainKey)}'`,
          );
        }
      } catch (error) {
        errors.push(
          `smartContracts[${index}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }
  if (errors.length > 0) {
    throw new ValidationError(`Invalid protocol descriptor: ${errors.join('; ')}`, {
      errors: [...errors],
    });
  }
  return Object.freeze({
    ...(candidate as ProtocolDescriptor),
  }) as Readonly<ProtocolDescriptor>;
}
