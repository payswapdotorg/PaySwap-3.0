/**
 * @payswap/onchain-domain — the PINNED WIRE SHAPE of the smart-contract
 * declaration (P4-W1, lane R2-W1).
 *
 * VALUE-HOLDING CONTRACTS MUST BE DECLARED IN FULL (the declaration-
 * completeness law; old INV-SC01/INV-SC04, canonical INV-20 territory for
 * execution gating and NON-CUSTODY.md for custody assessment): a contract
 * that may hold or move value must expose its source/bytecode provenance,
 * upgrade/admin powers, pause powers, custody/withdrawal paths,
 * oracle/bridge dependencies, attack surface and recovery. An undeclared
 * property is a validation error, never an assumption.
 *
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/smart-contract.ts (`SmartContractExtension` and its supporting
 * vocabulary). The onchain protocol descriptor composes these declarations
 * verbatim (never duplicated): this module re-declares the authority's
 * shapes as a LOCAL SUBSET-TYPED STRUCTURAL MIRROR with authority-naming
 * doc comments because this package is v1 hermetic (zero sibling imports).
 * Vocabulary VALUES are pinned byte-identical; cross-lane consistency is
 * asserted by test/pins.test.ts. The deterministic risk profile derivation
 * is mirrored from the authority's `assessSmartContractRisk` (certification
 * treats upgrade/governance risk as part of the capability's certification;
 * the mirror exists so the onchain domain can reconcile without a runtime
 * dependency — the authority lane's own suite owns the semantics).
 */

import { ValidationError } from "./errors.ts";
import { cloneAndFreeze, isNonEmptyString, isRecord } from "./shared.ts";

// ---------------------------------------------------------------------------
// The pinned declaration vocabulary
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability
 * src/smart-contract.ts `SMART_CONTRACT_AUTHORITY_KINDS` (byte-identical).
 */
export const PINNED_SMART_CONTRACT_AUTHORITY_KINDS = [
  "IMMUTABLE",
  "PROVIDER_GOVERNED",
  "MULTISIG",
  "UPGRADEABLE",
  "DAO",
] as const;

/** STRUCTURAL PIN — authority: @payswap/capability `SmartContractAuthorityKind`. */
export type PinnedSmartContractAuthorityKind =
  (typeof PINNED_SMART_CONTRACT_AUTHORITY_KINDS)[number];

/** STRUCTURAL PIN — authority: @payswap/capability `SmartContractAuthority`. */
export interface PinnedSmartContractAuthority {
  readonly kind: PinnedSmartContractAuthorityKind;
  readonly description: string;
  /** Declared timelock/execution delay (free-form, e.g. '48h timelock'). */
  readonly delayOrTimelock?: string;
}

/** STRUCTURAL PIN — authority: @payswap/capability `SmartContractPausePower`. */
export interface PinnedSmartContractPausePower {
  readonly actor: string;
  readonly scope: string;
}

/** STRUCTURAL PIN — authority: @payswap/capability `SmartContractOracleDependency`. */
export interface PinnedSmartContractOracleDependency {
  readonly oracleRef: string;
  readonly usage: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `SmartContractCustodyProperties` (declared custody properties —
 * NON-CUSTODY.md: custody/withdrawal paths are DECLARED, never assumed; a
 * custodial contract MUST name its custodian).
 */
export interface PinnedSmartContractCustodyProperties {
  readonly custodial: boolean;
  /** Who actually holds funds when custodial; must be declared when true. */
  readonly custodianRef?: string;
  /** How the contract's withdrawal/recovery authority is exercised. */
  readonly withdrawalAuthority: string;
  readonly keyManagement: string;
}

/**
 * VALUE PIN — authority: @payswap/capability
 * src/smart-contract.ts: the extension discriminant literal
 * ('smart_contract_extension').
 */
export const PINNED_SMART_CONTRACT_KIND = "smart_contract_extension" as const;

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `SmartContractExtension`. Every field is a DECLARED property — the
 * validator (pins-smart-contract validation, below) rejects any omission.
 * A protocol descriptor composes at least one of these declarations; every
 * declared contract's chainRef must equal the protocol's chainKey.
 */
export interface SmartContractExtensionPin {
  readonly kind: typeof PINNED_SMART_CONTRACT_KIND;
  /** Chain identifier (canonical chain key, e.g. 'ethereum:mainnet'). */
  readonly chainRef: string;
  readonly contractAddress: string;
  /** Hash of the verified source. */
  readonly sourceHash: string;
  /** Hash of the deployed bytecode. */
  readonly bytecodeHash: string;
  readonly upgradeAuthority: PinnedSmartContractAuthority;
  readonly adminAuthority: PinnedSmartContractAuthority;
  readonly pausePowers: readonly PinnedSmartContractPausePower[];
  readonly oracleDependencies: readonly PinnedSmartContractOracleDependency[];
  readonly custody: PinnedSmartContractCustodyProperties;
  /**
   * Declares that the Lab may index/search this contract once the carrying
   * capability is certified. A searchability flag is never execution
   * authority.
   */
  readonly searchableByLabAfterCertification: boolean;
}

// ---------------------------------------------------------------------------
// The mirrored deterministic risk profile
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `SmartContractRiskProfile`: the deterministic upgrade/governance risk
 * profile derived from the declared authorities (certification of a
 * smart-contract-backed capability requires it).
 */
export interface PinnedSmartContractRiskProfile {
  readonly upgradeRisk: "NONE" | "BOUNDED" | "UNBOUNDED";
  readonly governanceRisk: "LOW" | "MEDIUM" | "HIGH";
  readonly pauseRisk: "NONE" | "PRESENT";
  readonly oracleRisk: "NONE" | "PRESENT";
  readonly custodyRisk: "CUSTODIAL" | "NON_CUSTODIAL";
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Structural validation of the pinned declaration (completeness law)
// ---------------------------------------------------------------------------

/**
 * Runtime validation of the pinned smart-contract declaration: every
 * declared property must be present and well-formed. Custodial contracts
 * MUST name their custodian (NON-CUSTODY law: custody/withdrawal paths are
 * declared, never assumed). Mirrors the authority lane's
 * validateSmartContractExtension (the capability lane's own suite owns the
 * semantics; cross-lane consistency is asserted by test/pins.test.ts).
 */
export function validateSmartContractExtensionPin(
  candidate: unknown,
): SmartContractExtensionPin {
  const errors: string[] = [];
  if (!isRecord(candidate)) {
    throw new ValidationError("smart-contract declaration must be an object");
  }
  const record = candidate;
  if (record.kind !== PINNED_SMART_CONTRACT_KIND) {
    errors.push(`kind must be '${PINNED_SMART_CONTRACT_KIND}'`);
  }
  for (const field of ["chainRef", "contractAddress", "sourceHash", "bytecodeHash"] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  readAuthority(record.upgradeAuthority, "upgradeAuthority", errors);
  readAuthority(record.adminAuthority, "adminAuthority", errors);
  if (!Array.isArray(record.pausePowers)) {
    errors.push("pausePowers must be an array (may be empty)");
  } else {
    for (const [index, power] of record.pausePowers.entries()) {
      const entry = power as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== "object" ||
        !isNonEmptyString(entry.actor) ||
        !isNonEmptyString(entry.scope)
      ) {
        errors.push(`pausePowers[${index}] must be { actor, scope }`);
      }
    }
  }
  if (!Array.isArray(record.oracleDependencies)) {
    errors.push("oracleDependencies must be an array (may be empty)");
  } else {
    for (const [index, oracle] of record.oracleDependencies.entries()) {
      const entry = oracle as Readonly<Record<string, unknown>> | null;
      if (
        entry === null ||
        typeof entry !== "object" ||
        !isNonEmptyString(entry.oracleRef) ||
        !isNonEmptyString(entry.usage)
      ) {
        errors.push(`oracleDependencies[${index}] must be { oracleRef, usage }`);
      }
    }
  }
  const custody = record.custody;
  if (!isRecord(custody)) {
    errors.push("custody must be declared in full { custodial, withdrawalAuthority, keyManagement }");
  } else {
    if (typeof custody.custodial !== "boolean") {
      errors.push("custody.custodial must be a boolean");
    }
    if (custody.custodial === true && !isNonEmptyString(custody.custodianRef)) {
      errors.push("custody.custodianRef is REQUIRED when custodial is true");
    }
    if (!isNonEmptyString(custody.withdrawalAuthority)) {
      errors.push("custody.withdrawalAuthority must be declared");
    }
    if (!isNonEmptyString(custody.keyManagement)) {
      errors.push("custody.keyManagement must be declared");
    }
  }
  if (typeof record.searchableByLabAfterCertification !== "boolean") {
    errors.push("searchableByLabAfterCertification must be a boolean (never authority)");
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid smart-contract declaration: ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return cloneAndFreeze(candidate as unknown as SmartContractExtensionPin);
}

function readAuthority(
  value: unknown,
  field: string,
  errors: string[],
): PinnedSmartContractAuthority | undefined {
  if (!isRecord(value)) {
    errors.push(`${field} must be a declared authority { kind, description, delayOrTimelock? }`);
    return undefined;
  }
  if (
    typeof value.kind !== "string" ||
    !(PINNED_SMART_CONTRACT_AUTHORITY_KINDS as readonly unknown[]).includes(value.kind)
  ) {
    errors.push(
      `${field}.kind must be one of [${PINNED_SMART_CONTRACT_AUTHORITY_KINDS.join(", ")}]`,
    );
    return undefined;
  }
  if (!isNonEmptyString(value.description)) {
    errors.push(`${field}.description must be a non-empty string`);
    return undefined;
  }
  return value as unknown as PinnedSmartContractAuthority;
}

// ---------------------------------------------------------------------------
// The mirrored deterministic risk profile derivation
// ---------------------------------------------------------------------------

/**
 * Deterministic upgrade/governance risk profile derived from the declared
 * authorities — the structural mirror of the authority lane's
 * assessSmartContractRisk (certification of a smart-contract-backed
 * capability requires the profile). The authority lane's own suite owns
 * the semantics; this mirror exists so the onchain domain can reconcile
 * without a runtime dependency.
 */
export function assessPinnedSmartContractRisk(
  extension: SmartContractExtensionPin,
): PinnedSmartContractRiskProfile {
  const notes: string[] = [];
  const upgradeRisk: PinnedSmartContractRiskProfile["upgradeRisk"] =
    extension.upgradeAuthority.kind === "IMMUTABLE"
      ? "NONE"
      : extension.upgradeAuthority.kind === "UPGRADEABLE" || extension.upgradeAuthority.kind === "DAO"
        ? "UNBOUNDED"
        : "BOUNDED";
  if (upgradeRisk === "UNBOUNDED") {
    notes.push(
      `upgrade authority '${extension.upgradeAuthority.kind}' without a declared timelock is unbounded`,
    );
  } else if (
    upgradeRisk === "BOUNDED" &&
    extension.upgradeAuthority.delayOrTimelock === undefined
  ) {
    notes.push("bounded upgrade authority without a declared delay/timelock");
  }
  const governanceRisk: PinnedSmartContractRiskProfile["governanceRisk"] =
    extension.adminAuthority.kind === "IMMUTABLE"
      ? "LOW"
      : extension.adminAuthority.kind === "DAO" || extension.adminAuthority.kind === "UPGRADEABLE"
        ? "HIGH"
        : "MEDIUM";
  if (governanceRisk === "HIGH") {
    notes.push(`admin authority '${extension.adminAuthority.kind}' can change contract behavior`);
  }
  return Object.freeze({
    upgradeRisk,
    governanceRisk,
    pauseRisk: extension.pausePowers.length > 0 ? "PRESENT" : "NONE",
    oracleRisk: extension.oracleDependencies.length > 0 ? "PRESENT" : "NONE",
    custodyRisk: extension.custody.custodial ? "CUSTODIAL" : "NON_CUSTODIAL",
    notes: Object.freeze(notes),
  });
}
