/**
 * @payswap/onchain-security — structural pin: the smart-contract
 * extension declaration (R2-W2).
 *
 * LAYER LAW: zero sibling imports. The smart-contract declaration model
 * is owned by the capability lane (packages/capability/src/
 * smart-contract.ts, P2-W1). This file pins its contract shapes
 * STRUCTURALLY (identical members, identical literals — no parallel
 * vocabulary): every consequential onchain write that targets a protocol
 * contract must carry the FULL INV-SC01-style declaration — an
 * undeclared property is a validation error, never an assumption
 * (canonical INV-20: generic contract writes never execute silently
 * without sufficient identity/semantics/security/authority).
 *
 * A real capability SmartContractExtension satisfies this pin by
 * construction; the Tech Lead wires the capability lane at integration.
 */

/** Who can change the contract's logic (capability-lane literals, verbatim). */
export const SMART_CONTRACT_AUTHORITY_KINDS = [
  "IMMUTABLE",
  "PROVIDER_GOVERNED",
  "MULTISIG",
  "UPGRADEABLE",
  "DAO",
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

/** Declared custody properties (NON-CUSTODY boundary: full declaration required). */
export interface SmartContractCustodyProperties {
  readonly custodial: boolean;
  /** Who actually holds funds when custodial; required when true. */
  readonly custodianRef?: string;
  /** How the contract's withdrawal/recovery authority is exercised. */
  readonly withdrawalAuthority: string;
  readonly keyManagement: string;
}

/**
 * A smart-contract extension declaration — every field is a declared
 * property; validators reject any omission. The deterministic gates and
 * the threat-intel proxy/admin detectors compare these declarations
 * EXACTLY (chain + address + source/bytecode hashes + authorities +
 * custody): any drift is a different protocol surface (proxy-swap /
 * address-poisoning defense; fail closed).
 */
export interface SmartContractExtension {
  readonly kind: "smart_contract_extension";
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
  /** Lab searchability flag — never execution authority. */
  readonly searchableByLabAfterCertification: boolean;
}
