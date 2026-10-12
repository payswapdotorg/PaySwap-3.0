/**
 * Smart-contract extension representation (P2-W1; PORT of
 * payswap.org@8a735bf packages/capabilities/src/smart-contract.ts).
 *
 * A capability that is (partly) realized by a smart contract must declare
 * its code/address/chain/authority/pause/oracle/custody properties in full:
 * every property below is REQUIRED — an undeclared property is a
 * validation error, never an assumption.
 *
 * Canonical citation mapping: old INV-SC01 (full declaration) and INV-SC04
 * (upgrade/governance risk is part of certification) transfer as the
 * declaration-completeness laws below; generic contract-write safety is
 * canonical INV-20 territory (P4-W2 owns execution gates). Blockchain is
 * one settlement rail family (canonical INV-17) — a smart-contract
 * extension is a provider-implementation surface, never a parallel
 * financial authority.
 *
 * Certification treats the contract's upgrade/governance risk as part of
 * the capability's certification: `assessSmartContractRisk` derives a
 * deterministic risk profile from the declared authorities, and
 * certification of a smart-contract-backed capability requires that
 * profile (see certification.ts).
 *
 * The extension carries `searchableByLabAfterCertification` so the Lab can
 * find certified smart-contract capabilities; the flag alone grants no
 * authority.
 */

import { ValidationError } from './errors.ts';
import { cloneAndFreeze, isNonEmptyString, isNonEmptyStringArray, isRecord } from './shared.ts';

/** Who can change the contract's logic. */
export const SMART_CONTRACT_AUTHORITY_KINDS = [
  'IMMUTABLE',
  'PROVIDER_GOVERNED',
  'MULTISIG',
  'UPGRADEABLE',
  'DAO',
] as const;
export type SmartContractAuthorityKind = (typeof SMART_CONTRACT_AUTHORITY_KINDS)[number];

/** One declared authority over a smart contract. */
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

/** Declared custody properties (fund-holding declarations). */
export interface SmartContractCustodyProperties {
  readonly custodial: boolean;
  /** Who actually holds funds when custodial; must be declared when true. */
  readonly custodianRef?: string;
  /** How the contract's withdrawal/recovery authority is exercised. */
  readonly withdrawalAuthority: string;
  readonly keyManagement: string;
}

/**
 * A smart-contract extension declaration. Every field is a declared
 * property — the validator below rejects any omission.
 */
export interface SmartContractExtension {
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
   * authority (see isSearchableByLab).
   */
  readonly searchableByLabAfterCertification: boolean;
}

/** Deterministic upgrade/governance risk profile. */
export interface SmartContractRiskProfile {
  readonly upgradeRisk: 'NONE' | 'BOUNDED' | 'UNBOUNDED';
  readonly governanceRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly pauseRisk: 'NONE' | 'PRESENT';
  readonly oracleRisk: 'NONE' | 'PRESENT';
  readonly custodyRisk: 'CUSTODIAL' | 'NON_CUSTODIAL';
  readonly notes: readonly string[];
}

/** Raised when a smart-contract declaration is incomplete. */
export class SmartContractValidationError extends ValidationError {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid smart-contract extension: ${errors.join('; ')}`, {
      errors: [...errors],
    });
    this.errors = errors;
  }
}

function isAuthorityKind(value: unknown): value is SmartContractAuthorityKind {
  return (
    typeof value === 'string' &&
    (SMART_CONTRACT_AUTHORITY_KINDS as readonly unknown[]).includes(value)
  );
}

function readAuthority(
  value: unknown,
  field: string,
  errors: string[],
): SmartContractAuthority | undefined {
  if (!isRecord(value)) {
    errors.push(`${field} must be a declared authority { kind, description, delayOrTimelock? }`);
    return undefined;
  }
  if (!isAuthorityKind(value.kind)) {
    errors.push(
      `${field}.kind must be one of [${SMART_CONTRACT_AUTHORITY_KINDS.join(', ')}]`,
    );
    return undefined;
  }
  if (!isNonEmptyString(value.description)) {
    errors.push(`${field}.description must be a non-empty string`);
    return undefined;
  }
  return value as unknown as SmartContractAuthority;
}

/**
 * Runtime validation: every declared property must be present and
 * well-formed. Custodial contracts MUST name their custodian.
 */
export function validateSmartContractExtension(candidate: unknown): SmartContractExtension {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new SmartContractValidationError(['extension must be an object']);
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (record.kind !== 'smart_contract_extension') {
    errors.push("kind must be 'smart_contract_extension'");
  }
  for (const field of ['chainRef', 'contractAddress', 'sourceHash', 'bytecodeHash'] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  const upgrade = readAuthority(record.upgradeAuthority, 'upgradeAuthority', errors);
  readAuthority(record.adminAuthority, 'adminAuthority', errors);
  if (!Array.isArray(record.pausePowers)) {
    errors.push('pausePowers must be an array (may be empty)');
  } else {
    for (const [index, power] of record.pausePowers.entries()) {
      const entry = power as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.actor) ||
        !isNonEmptyString(entry.scope)
      ) {
        errors.push(`pausePowers[${index}] must be { actor, scope }`);
      }
    }
  }
  if (!Array.isArray(record.oracleDependencies)) {
    errors.push('oracleDependencies must be an array (may be empty)');
  } else {
    for (const [index, oracle] of record.oracleDependencies.entries()) {
      const entry = oracle as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !isNonEmptyString(entry.oracleRef) ||
        !isNonEmptyString(entry.usage)
      ) {
        errors.push(`oracleDependencies[${index}] must be { oracleRef, usage }`);
      }
    }
  }
  const custody = record.custody;
  if (!isRecord(custody)) {
    errors.push('custody must be declared in full { custodial, withdrawalAuthority, keyManagement }');
  } else {
    if (typeof custody.custodial !== 'boolean') {
      errors.push('custody.custodial must be a boolean');
    }
    if (custody.custodial === true && !isNonEmptyString(custody.custodianRef)) {
      errors.push('custody.custodianRef is REQUIRED when custodial is true');
    }
    if (!isNonEmptyString(custody.withdrawalAuthority)) {
      errors.push('custody.withdrawalAuthority must be declared');
    }
    if (!isNonEmptyString(custody.keyManagement)) {
      errors.push('custody.keyManagement must be declared');
    }
  }
  if (typeof record.searchableByLabAfterCertification !== 'boolean') {
    errors.push('searchableByLabAfterCertification must be a boolean (never authority)');
  }
  if (errors.length > 0) {
    throw new SmartContractValidationError(errors);
  }
  return cloneAndFreeze(record as unknown as SmartContractExtension);
}

/** True only for certified capabilities carrying a searchable extension. */
export function isSearchableByLab(
  capabilityCertified: boolean,
  extension: SmartContractExtension,
): boolean {
  return capabilityCertified && extension.searchableByLabAfterCertification;
}

/**
 * Deterministic upgrade/governance risk profile derived from the declared
 * authorities (certification requires it for smart-contract-backed
 * subjects).
 */
export function assessSmartContractRisk(
  extension: SmartContractExtension,
): SmartContractRiskProfile {
  const notes: string[] = [];
  const upgradeRisk: SmartContractRiskProfile['upgradeRisk'] =
    extension.upgradeAuthority.kind === 'IMMUTABLE'
      ? 'NONE'
      : extension.upgradeAuthority.kind === 'UPGRADEABLE' || extension.upgradeAuthority.kind === 'DAO'
        ? 'UNBOUNDED'
        : 'BOUNDED';
  if (upgradeRisk === 'UNBOUNDED') {
    notes.push(
      `upgrade authority '${extension.upgradeAuthority.kind}' without a declared timelock is unbounded`,
    );
  } else if (
    upgradeRisk === 'BOUNDED' &&
    extension.upgradeAuthority.delayOrTimelock === undefined
  ) {
    notes.push('bounded upgrade authority without a declared delay/timelock');
  }
  const governanceRisk: SmartContractRiskProfile['governanceRisk'] =
    extension.adminAuthority.kind === 'IMMUTABLE'
      ? 'LOW'
      : extension.adminAuthority.kind === 'DAO' || extension.adminAuthority.kind === 'UPGRADEABLE'
        ? 'HIGH'
        : 'MEDIUM';
  if (governanceRisk === 'HIGH') {
    notes.push(`admin authority '${extension.adminAuthority.kind}' can change contract behavior`);
  }
  return Object.freeze({
    upgradeRisk,
    governanceRisk,
    pauseRisk: extension.pausePowers.length > 0 ? 'PRESENT' : 'NONE',
    oracleRisk: extension.oracleDependencies.length > 0 ? 'PRESENT' : 'NONE',
    custodyRisk: extension.custody.custodial ? 'CUSTODIAL' : 'NON_CUSTODIAL',
    notes: Object.freeze(notes),
  });
}
