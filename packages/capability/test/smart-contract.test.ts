import { describe, expect, it } from 'vitest';
import {
  SmartContractValidationError,
  assessSmartContractRisk,
  isSearchableByLab,
  validateSmartContractExtension,
} from '../src/index.ts';
import type { SmartContractExtension } from '../src/index.ts';

/**
 * Smart-contract extension representation (PORTED from old capabilities
 * smart-contract.test.ts). Declaration-completeness: source/bytecode,
 * chain, address, upgrade, admin, pause, oracle and custody properties are
 * ALL declared — an omission is a validation error, never an assumption.
 * Upgrade/governance risk is part of capability certification.
 */

const validDeclaration: SmartContractExtension = {
  kind: 'smart_contract_extension',
  chainRef: 'ethereum:mainnet',
  contractAddress: '0xA1000000000000000000000000000000000000AA',
  sourceHash: 'sha256:source-hash',
  bytecodeHash: 'sha256:bytecode-hash',
  upgradeAuthority: {
    kind: 'IMMUTABLE',
    description: 'no upgrade path after deployment',
  },
  adminAuthority: {
    kind: 'MULTISIG',
    description: '4-of-7 operations multisig',
  },
  pausePowers: [{ actor: 'operations multisig', scope: 'new settlements only' }],
  oracleDependencies: [{ oracleRef: 'oracle:eth-usd', usage: 'settlement reference price' }],
  custody: {
    custodial: false,
    withdrawalAuthority: 'user-controlled keys only',
    keyManagement: 'user self-custody wallets',
  },
  searchableByLabAfterCertification: true,
};

describe('every property must be declared (declaration-completeness law)', () => {
  it('validates a complete declaration', () => {
    const parsed = validateSmartContractExtension(validDeclaration);
    expect(parsed.contractAddress).toBe(validDeclaration.contractAddress);
    expect(parsed.upgradeAuthority.kind).toBe('IMMUTABLE');
    expect(parsed.custody.custodial).toBe(false);
    expect(parsed.searchableByLabAfterCertification).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('rejects each omission with the missing property named', () => {
    const omittedFields = [
      'chainRef',
      'contractAddress',
      'sourceHash',
      'bytecodeHash',
      'upgradeAuthority',
      'adminAuthority',
      'pausePowers',
      'oracleDependencies',
      'custody',
      'searchableByLabAfterCertification',
    ] as const;
    for (const field of omittedFields) {
      const { [field]: _omitted, ...incomplete } = validDeclaration;
      expect(() => validateSmartContractExtension(incomplete)).toThrow(new RegExp(field));
    }
  });

  it('rejects a custodial contract without a declared custodian', () => {
    expect(() =>
      validateSmartContractExtension({
        ...validDeclaration,
        custody: {
          custodial: true,
          withdrawalAuthority: 'operator multisig with user proof',
          keyManagement: 'operator HSM',
        },
      }),
    ).toThrow(/custodianRef/);
    const custodial = validateSmartContractExtension({
      ...validDeclaration,
      custody: {
        custodial: true,
        custodianRef: 'party:licensed-custodian',
        withdrawalAuthority: 'operator multisig with user proof',
        keyManagement: 'operator HSM',
      },
    });
    expect(custodial.custody.custodial).toBe(true);
    expect(custodial.custody.custodianRef).toBe('party:licensed-custodian');
  });

  it('rejects non-objects, wrong kinds and malformed authorities', () => {
    expect(() => validateSmartContractExtension(null)).toThrow();
    expect(() => validateSmartContractExtension(42)).toThrow();
    expect(() =>
      validateSmartContractExtension({ ...validDeclaration, kind: 'crypto_wallet' as never }),
    ).toThrow(/kind/);
    expect(() =>
      validateSmartContractExtension({
        ...validDeclaration,
        upgradeAuthority: { kind: 'MAGIC' as never, description: 'x' },
      }),
    ).toThrow(SmartContractValidationError);
  });
});

describe('deterministic upgrade/governance risk profile', () => {
  it('maps immutable upgrade authority to NONE', () => {
    const profile = assessSmartContractRisk(validDeclaration);
    expect(profile.upgradeRisk).toBe('NONE');
    expect(profile.governanceRisk).toBe('MEDIUM'); // MULTISIG admin
    expect(profile.pauseRisk).toBe('PRESENT');
    expect(profile.oracleRisk).toBe('PRESENT');
    expect(profile.custodyRisk).toBe('NON_CUSTODIAL');
  });

  it('maps an unbounded upgrade path to UNBOUNDED, a timelocked one to BOUNDED', () => {
    const unbounded = assessSmartContractRisk({
      ...validDeclaration,
      upgradeAuthority: {
        kind: 'UPGRADEABLE',
        description: 'upgradeable proxy without timelock',
      },
    });
    expect(unbounded.upgradeRisk).toBe('UNBOUNDED');
    expect(unbounded.notes.join(' ')).toMatch(/unbounded/);

    const bounded = assessSmartContractRisk({
      ...validDeclaration,
      upgradeAuthority: {
        kind: 'MULTISIG',
        description: 'upgrade council',
        delayOrTimelock: '48h timelock',
      },
    });
    expect(bounded.upgradeRisk).toBe('BOUNDED');
  });

  it('maps DAO admin authority to HIGH governance risk with a note', () => {
    const dao = assessSmartContractRisk({
      ...validDeclaration,
      adminAuthority: { kind: 'DAO', description: 'token-weighted governance' },
    });
    expect(dao.governanceRisk).toBe('HIGH');
    expect(dao.notes.join(' ')).toMatch(/admin authority 'DAO'/);
  });

  it('empty pause/oracle declarations map to NONE risk', () => {
    const quiet = assessSmartContractRisk({
      ...validDeclaration,
      pausePowers: [],
      oracleDependencies: [],
    });
    expect(quiet.pauseRisk).toBe('NONE');
    expect(quiet.oracleRisk).toBe('NONE');
  });

  it('custodial contracts map to CUSTODIAL custody risk', () => {
    const custodial = assessSmartContractRisk(
      validateSmartContractExtension({
        ...validDeclaration,
        custody: {
          custodial: true,
          custodianRef: 'party:licensed-custodian',
          withdrawalAuthority: 'operator multisig',
          keyManagement: 'operator HSM',
        },
      }),
    );
    expect(custodial.custodyRisk).toBe('CUSTODIAL');
  });
});

describe('Lab searchability is a flag, never authority', () => {
  it('requires BOTH certification and the declared flag', () => {
    expect(isSearchableByLab(true, validDeclaration)).toBe(true);
    expect(isSearchableByLab(false, validDeclaration)).toBe(false);
    const unsearchable = validateSmartContractExtension({
      ...validDeclaration,
      searchableByLabAfterCertification: false,
    });
    expect(isSearchableByLab(true, unsearchable)).toBe(false);
  });
});
