import { describe, expect, it } from 'vitest';
import {
  CertificateConflictError,
  CertificateIssuanceError,
  EvidenceGraph,
  FinalityAuthority,
  SettlementAttemptLedger,
  SettlementCertificateAuthority,
  SettlementReconciliationAuthority,
  USD,
  asClearingRecordId,
  asNettingSetId,
  asPartyId,
  asSettlementAttemptId,
  certificateDocumentRefs,
  defineProofPolicy,
  deriveObligations,
  deriveSettlementInstruction,
  fromMinorUnits,
  netPositions,
  settlementInstructions,
  type AuthorizationRef,
  type NettingSet,
  type Obligation,
} from '../src/index.ts';

const DUE_WINDOW = { opensAt: 1_500n, closesAt: 9_000n };
const NETTING_WINDOW = { opensAt: 1_000n, closesAt: 9_000n };

const authRef: AuthorizationRef = {
  artifactId: 'art-1',
  mandateRef: 'mandate-1',
  approverRef: 'approver-1',
  epoch: 3n,
};

function proofInputs(): { nettingSet: NettingSet; obligations: Obligation[] } {
  const derived = deriveObligations(
    [
      {
        id: asClearingRecordId('clr-1'),
        activities: [
          {
            id: 'act-1' as never,
            activityType: 'PAYMENT_FULFILLED',
            debtor: asPartyId('alice'),
            creditor: asPartyId('bob'),
            amount: fromMinorUnits(USD, 100n),
            occurredAt: 1_000n,
          },
        ],
        netted: false,
      },
    ],
    { dueWindow: DUE_WINDOW },
  );
  const obligations = [...derived];
  const nettingSet: NettingSet = {
    id: asNettingSetId('ns-1'),
    obligations: obligations.map((o) => o.id),
    window: NETTING_WINDOW,
    createdAt: 1_200n,
  };
  return { nettingSet, obligations };
}

function buildWorld() {
  const ledger = new SettlementAttemptLedger();
  const reconciliation = new SettlementReconciliationAuthority(ledger);
  const finality = new FinalityAuthority(ledger, reconciliation);
  const evidence = new EvidenceGraph();
  const certificates = new SettlementCertificateAuthority(finality, evidence, reconciliation, ledger);

  const { nettingSet, obligations } = proofInputs();
  const positions = netPositions(nettingSet, obligations);
  const protocolInstruction = settlementInstructions(positions)[0]!;
  const instruction = deriveSettlementInstruction({
    protocolInstruction,
    remittance: [
      { documentKind: 'INVOICE', documentId: 'inv-1', allocatedAmount: protocolInstruction.amount },
    ],
    settlementDestinationId: 'merchant-external-1',
    authorizationRefs: [authRef],
    issuedAt: 2_000n,
  });

  ledger.begin({
    attemptId: asSettlementAttemptId('att-1'),
    instructionId: instruction.id,
    rail: 'WISE',
    idempotencyKey: 'key-1',
    principal: { principalType: 'svc', principalId: 'runner' },
    now: 2_500n,
  });
  ledger.start('att-1', 2_600n);
  ledger.recordExternalOutcome('att-1', 'SUCCEEDED', ['ev-outcome'], 2_700n);

  evidence.record({
    nodeId: 'ev-outcome',
    kind: 'OBSERVATION',
    actionRef: 'att-1',
    claimedLevel: 'P3',
    provenance: { source: 'AUTHENTICATED_PROVIDER', providerName: 'wise' },
    payload: 'transfer.state=executed',
    links: [],
    recordedAt: 2_700n,
  });

  const policy = defineProofPolicy({
    policyId: 'default',
    currency: USD,
    baselineLevel: 'P2',
    highRiskThresholdMinorUnits: 1_000_000n,
    highRiskLevel: 'P4',
  });

  const finalityRecord = finality.declareFinality({
    finalityId: 'fin-1',
    instruction,
    authorization: { nettingSet, obligations },
    policy,
    proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
    evidence: [evidence.node('ev-outcome')!],
    now: 3_000n,
  });

  return { certificates, instruction, finalityRecord, evidence, ledger, reconciliation };
}

describe('SettlementCertificateAuthority (adapted from old certificates.test.ts)', () => {
  it('issues an immutable certificate for the finalized instruction', () => {
    const world = buildWorld();
    const certificate = world.certificates.issue({
      certificateId: 'cert-1',
      finalityId: 'fin-1',
      instruction: world.instruction,
      evidenceChain: ['ev-outcome'],
      reconciliationRefs: [],
      now: 4_000n,
    });
    expect(certificate.certificateId).toBe('cert-1');
    expect(certificate.instructionId).toBe(world.instruction.id);
    expect(certificate.finalityId).toBe('fin-1');
    expect(certificate.amount.value).toBe(world.instruction.amount.value);
    expect(certificate.evidenceChain).toEqual(['ev-outcome']);
    expect(certificate.canonical).toContain('settlement-certificate|id:cert-1');
    expect(Object.isFrozen(certificate)).toBe(true);
  });

  it('re-issuing identical content is an idempotent replay; different content conflicts', () => {
    const world = buildWorld();
    world.certificates.issue({
      certificateId: 'cert-1',
      finalityId: 'fin-1',
      instruction: world.instruction,
      evidenceChain: ['ev-outcome'],
      reconciliationRefs: [],
      now: 4_000n,
    });
    // a second valid node on the same instruction makes the chain pass checks
    // but differ from the recorded canonical content -> conflict
    world.evidence.record({
      nodeId: 'ev-extra',
      kind: 'FUNDING',
      actionRef: world.instruction.id,
      claimedLevel: 'P2',
      provenance: { source: 'PROTOCOL_LEDGER' },
      payload: 'funding leg',
      links: [],
      recordedAt: 3_600n,
    });
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-1',
        finalityId: 'fin-1',
        instruction: world.instruction,
        evidenceChain: ['ev-outcome', 'ev-extra'], // different content
        reconciliationRefs: [],
        now: 4_000n,
      }),
    ).toThrow(CertificateConflictError);
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-1',
        finalityId: 'fin-1',
        instruction: world.instruction,
        evidenceChain: ['ev-outcome'],
        reconciliationRefs: [],
        now: 5_000n, // different timestamp -> different canonical
      }),
    ).toThrow(CertificateConflictError);
  });

  it('refuses an unknown finality record (certificates issue only from protocol-authorized finality)', () => {
    const world = buildWorld();
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-x',
        finalityId: 'fin-NONE',
        instruction: world.instruction,
        evidenceChain: [],
        reconciliationRefs: [],
        now: 4_000n,
      }),
    ).toThrow(CertificateIssuanceError);
  });

  it('refuses when the finality record names a different instruction (mismatch)', () => {
    const world = buildWorld();
    const foreign = deriveSettlementInstruction({
      protocolInstruction: {
        ...world.instruction,
        id: 'SI:ns-OTHER:carol>dave:USD' as never,
        setId: 'ns-OTHER' as never,
        debtor: asPartyId('carol'),
        creditor: asPartyId('dave'),
      },
      remittance: [{ documentKind: 'INVOICE', documentId: 'inv-9', allocatedAmount: world.instruction.amount }],
      settlementDestinationId: 'other-dest',
      authorizationRefs: [authRef],
      issuedAt: 2_000n,
    });
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-x',
        finalityId: 'fin-1',
        instruction: foreign,
        evidenceChain: [],
        reconciliationRefs: [],
        now: 4_000n,
      }),
    ).toThrow(CertificateIssuanceError);
  });

  it('refuses evidence nodes that are not linked to this instruction or its attempts', () => {
    const world = buildWorld();
    world.evidence.record({
      nodeId: 'ev-foreign',
      kind: 'OBSERVATION',
      actionRef: 'SI:some-other-instruction',
      claimedLevel: 'P3',
      provenance: { source: 'AUTHENTICATED_PROVIDER', providerName: 'wise' },
      payload: 'foreign',
      links: [],
      recordedAt: 3_500n,
    });
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-x',
        finalityId: 'fin-1',
        instruction: world.instruction,
        evidenceChain: ['ev-foreign'],
        reconciliationRefs: [],
        now: 4_000n,
      }),
    ).toThrow(CertificateIssuanceError);
    // unknown node
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-x2',
        finalityId: 'fin-1',
        instruction: world.instruction,
        evidenceChain: ['ev-NOT-RECORDED'],
        reconciliationRefs: [],
        now: 4_000n,
      }),
    ).toThrow(CertificateIssuanceError);
  });

  it('refuses while a reconciliation case for the instruction is OPEN; accepts RESOLVED refs', () => {
    const world = buildWorld();
    // Open a case on a second ambiguous attempt for the same instruction
    world.ledger.begin({
      attemptId: asSettlementAttemptId('att-2'),
      instructionId: world.instruction.id,
      rail: 'WISE',
      idempotencyKey: 'key-2',
      principal: { principalType: 'svc', principalId: 'runner' },
      now: 3_100n,
    });
    world.ledger.start('att-2', 3_110n);
    world.ledger.recordExternalOutcome('att-2', 'OUTCOME_UNKNOWN', ['ev-timeout-2'], 3_200n);
    world.reconciliation.openCase({
      caseId: 'case-2',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId: asSettlementAttemptId('att-2') },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 3_300n,
    });

    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-x',
        finalityId: 'fin-1',
        instruction: world.instruction,
        evidenceChain: ['ev-outcome'],
        reconciliationRefs: [],
        now: 4_000n,
      }),
    ).toThrow(CertificateIssuanceError);

    // unresolved refs are refused too
    expect(() =>
      world.certificates.issue({
        certificateId: 'cert-x',
        finalityId: 'fin-1',
        instruction: world.instruction,
        evidenceChain: ['ev-outcome'],
        reconciliationRefs: ['case-2'],
        now: 4_000n,
      }),
    ).toThrow(CertificateIssuanceError);

    world.reconciliation.resolveCase({
      caseId: 'case-2',
      outcome: 'CONFIRMED_FAILED',
      resolvedBy: { principalType: 'svc', principalId: 'reconciler' },
      evidenceIds: ['ev-retrieval-2'],
      now: 3_400n,
    });

    const certificate = world.certificates.issue({
      certificateId: 'cert-1',
      finalityId: 'fin-1',
      instruction: world.instruction,
      evidenceChain: ['ev-outcome'],
      reconciliationRefs: ['case-2'],
      now: 4_000n,
    });
    expect(certificate.reconciliationRefs).toEqual(['case-2']);
  });

  it('certificateDocumentRefs preserves the remittance references end-to-end', () => {
    const world = buildWorld();
    const certificate = world.certificates.issue({
      certificateId: 'cert-1',
      finalityId: 'fin-1',
      instruction: world.instruction,
      evidenceChain: ['ev-outcome'],
      reconciliationRefs: [],
      now: 4_000n,
    });
    expect(certificateDocumentRefs(certificate)).toEqual([
      { documentKind: 'INVOICE', documentId: 'inv-1' },
    ]);
    expect(world.certificates.certificate('cert-1')).toBe(certificate);
    expect(world.certificates.allCertificates()).toHaveLength(1);
  });
});
