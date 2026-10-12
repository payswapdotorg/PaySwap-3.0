import { describe, expect, it } from 'vitest';
import { CertificationError, CertificationLedger } from '../src/index.ts';
import { assessSmartContractRisk, validateSmartContractExtension } from '../src/index.ts';
import type { CertificationRecord, SmartContractExtension } from '../src/index.ts';

/**
 * Certification (PORTED from old capabilities certification.test.ts; the
 * append-only ledger discipline: retirement cannot rewrite in-flight
 * history; smart-contract risk is part of certification). Canonical subject
 * kinds: capability_definition / provider_implementation / capability_pack.
 */

const extension: SmartContractExtension = validateSmartContractExtension({
  kind: 'smart_contract_extension',
  chainRef: 'ethereum:mainnet',
  contractAddress: '0xA1',
  sourceHash: 'sha256:source',
  bytecodeHash: 'sha256:bytecode',
  upgradeAuthority: { kind: 'IMMUTABLE', description: 'immutable logic' },
  adminAuthority: { kind: 'MULTISIG', description: 'admin multisig' },
  pausePowers: [],
  oracleDependencies: [],
  custody: {
    custodial: false,
    withdrawalAuthority: 'user keys',
    keyManagement: 'self-custody',
  },
  searchableByLabAfterCertification: true,
});

function certifiedRecord(
  subjectId: string,
  version: string,
  recordId?: string,
): CertificationRecord {
  return {
    recordId: recordId ?? `cert:${subjectId}:${version}`,
    subject: { kind: 'capability_definition', subjectId, version },
    status: 'CERTIFIED',
    evidence: [
      {
        evidenceId: 'ev-1',
        kind: 'TEST_RUN',
        artifactRef: 'artifacts/connector-cert.tgz',
        contentHash: 'sha256:ev1',
      },
    ],
    certifiedAt: '2026-10-01T00:00:00Z',
  };
}

describe('certification records attach with evidence refs', () => {
  it('certifies a capability definition and exposes history', () => {
    const ledger = new CertificationLedger();
    const stored = ledger.certify(certifiedRecord('cap:payments.create', '1.0.0'));
    expect(stored.status).toBe('CERTIFIED');
    expect(ledger.historyFor('cap:payments.create').length).toBe(1);
    expect(ledger.currentStatusFor('cap:payments.create')?.status).toBe('CERTIFIED');
    expect(ledger.isAvailableForNewUse('cap:payments.create')).toBe(true);
  });

  it('certifies a provider implementation subject and a pack subject (canonical kinds)', () => {
    const ledger = new CertificationLedger();
    ledger.certify({
      ...certifiedRecord('impl:psp-a-sepa-1', '1.2.0'),
      subject: { kind: 'provider_implementation', subjectId: 'impl:psp-a-sepa-1', version: '1.2.0' },
    });
    ledger.certify({
      ...certifiedRecord('pack:stripe-payments', '2.3.0'),
      subject: { kind: 'capability_pack', subjectId: 'pack:stripe-payments', version: '2.3.0' },
    });
    expect(ledger.currentStatusFor('impl:psp-a-sepa-1')?.record.subject.kind).toBe(
      'provider_implementation',
    );
    expect(ledger.currentStatusFor('pack:stripe-payments')?.record.subject.kind).toBe(
      'capability_pack',
    );
  });

  it('rejects CERTIFIED records without evidence, duplicate record ids and unknown subjects', () => {
    const ledger = new CertificationLedger();
    expect(() =>
      ledger.certify({ ...certifiedRecord('cap:no-evidence', '1.0.0'), evidence: [] }),
    ).toThrow(CertificationError);
    ledger.certify(certifiedRecord('cap:dup', '1.0.0', 'cert:dup:1'));
    expect(() => ledger.certify(certifiedRecord('cap:dup', '1.0.1', 'cert:dup:1'))).toThrow(
      /already exists/,
    );
    expect(() =>
      ledger.certify({
        ...certifiedRecord('cap:bad-kind', '1.0.0'),
        subject: { kind: 'account' as never, subjectId: 'x', version: '1' },
      }),
    ).toThrow(/subject.kind/);
  });
});

describe('smart-contract risk is part of certification', () => {
  it('rejects a smart-contract-backed certification without a risk profile', () => {
    const ledger = new CertificationLedger();
    expect(() =>
      ledger.certify(certifiedRecord('cap:onchain-settle', '1.0.0'), {
        subjectDeclaresSmartContract: true,
      }),
    ).toThrow(/smart-contract extension must be certified with an upgrade\/governance risk profile/);
  });

  it('accepts it with the derived upgrade/governance risk profile', () => {
    const ledger = new CertificationLedger();
    const record = ledger.certify(
      {
        ...certifiedRecord('cap:onchain-settle', '1.0.0'),
        smartContractRisk: assessSmartContractRisk(extension),
      },
      { subjectDeclaresSmartContract: true },
    );
    expect(record.smartContractRisk?.upgradeRisk).toBe('NONE');
  });
});

describe('retirement cannot rewrite in-flight history (append-only ledger)', () => {
  it('appends a RETIRED record and preserves prior history untouched', () => {
    const ledger = new CertificationLedger();
    ledger.certify(certifiedRecord('cap:legacy-payouts', '1.0.0'));
    const historyBefore = ledger.historyFor('cap:legacy-payouts');
    const snapshot = JSON.parse(JSON.stringify(historyBefore)) as unknown;

    ledger.retire({
      subjectId: 'cap:legacy-payouts',
      version: '1.0.0',
      retiredAt: '2026-10-02T00:00:00Z',
      note: 'superseded by payouts-v2',
    });

    const historyAfter = ledger.historyFor('cap:legacy-payouts');
    expect(historyAfter.length).toBe(historyBefore.length + 1);
    // Prior records are preserved byte-for-byte — history is immutable.
    expect(JSON.parse(JSON.stringify(historyAfter.slice(0, -1))) as unknown).toEqual(snapshot);
    // The appended record marks going-forward unavailability only.
    expect(historyAfter[historyAfter.length - 1]?.status).toBe('RETIRED');
    expect(ledger.currentStatusFor('cap:legacy-payouts')?.status).toBe('RETIRED');
    expect(ledger.isAvailableForNewUse('cap:legacy-payouts')).toBe(false);
  });

  it('deep-freezes stored records so in-flight history cannot be mutated', () => {
    const ledger = new CertificationLedger();
    ledger.certify(certifiedRecord('cap:frozen', '1.0.0'));
    const record = ledger.historyFor('cap:frozen')[0];
    expect(record).toBeDefined();
    if (record === undefined) {
      throw new Error('unreachable');
    }
    expect(Object.isFrozen(record)).toBe(true);
    expect(() => {
      (record as { status: string }).status = 'RETIRED';
    }).toThrow();
    expect(ledger.currentStatusFor('cap:frozen')?.status).toBe('CERTIFIED');
  });

  it('refuses to retire a subject with no certification history', () => {
    const ledger = new CertificationLedger();
    expect(() =>
      ledger.retire({
        subjectId: 'cap:never-certified',
        version: '1.0.0',
        retiredAt: '2026-10-02T00:00:00Z',
      }),
    ).toThrow(/no certification history exists/);
  });

  it('caller objects are never frozen out from under their owner (clone-on-store)', () => {
    const ledger = new CertificationLedger();
    const input = certifiedRecord('cap:caller-owned', '1.0.0');
    ledger.certify(input);
    expect(Object.isFrozen(input)).toBe(false);
    const stored = ledger.historyFor('cap:caller-owned')[0];
    expect(Object.isFrozen(stored)).toBe(true);
    expect(stored).not.toBe(input);
  });

  it('allRecords preserves append order', () => {
    const ledger = new CertificationLedger();
    ledger.certify(certifiedRecord('cap:a', '1.0.0'));
    ledger.certify(certifiedRecord('cap:b', '1.0.0'));
    ledger.retire({ subjectId: 'cap:a', version: '1.0.0', retiredAt: '2026-10-02T00:00:00Z' });
    const ids = ledger.allRecords().map((record) => record.recordId);
    expect(ids).toEqual(['cert:cap:a:1.0.0', 'cert:cap:b:1.0.0', 'retired:cap:a:1']);
  });
});
