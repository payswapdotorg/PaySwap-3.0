import { describe, expect, it } from 'vitest';
import {
  DeterministicClock,
  EvidenceGraph,
  FinalityAuthority,
  FinalityInsufficientProofError,
  FinalityNotProtocolAuthorizedError,
  FinalityPreconditionsUnmetError,
  FinalityRecordConflictError,
  SettlementAttemptLedger,
  SettlementReconciliationAuthority,
  USD,
  asClearingRecordId,
  asNettingSetId,
  asPartyId,
  asSettlementAttemptId,
  defineProofPolicy,
  deriveObligations,
  deriveSettlementInstruction,
  fromMinorUnits,
  netPositions,
  settlementInstructions,
  type AuthorizationRef,
  type EvidenceNode,
  type NettingSet,
  type Obligation,
} from '../src/index.ts';

const DUE_WINDOW = { opensAt: 1_500n, closesAt: 9_000n };
const NETTING_WINDOW = { opensAt: 1_000n, closesAt: 9_000n };
const INSTRUCTION_ID = 'SI:ns-1:alice>bob:USD';

const authRef: AuthorizationRef = {
  artifactId: 'art-1',
  mandateRef: 'mandate-1',
  approverRef: 'approver-1',
  epoch: 3n,
};

function protocolProof(): { nettingSet: NettingSet; obligations: Obligation[] } {
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

function buildInstruction() {
  const { nettingSet, obligations } = protocolProof();
  const positions = netPositions(nettingSet, obligations);
  const protocolInstruction = settlementInstructions(positions)[0]!;
  return deriveSettlementInstruction({
    protocolInstruction,
    remittance: [{ documentKind: 'INVOICE', documentId: 'inv-1', allocatedAmount: protocolInstruction.amount }],
    settlementDestinationId: 'merchant-external-1',
    authorizationRefs: [authRef],
    issuedAt: 2_000n,
  });
}

function succeedAttempt(l: SettlementAttemptLedger, attemptId: string, instructionId = INSTRUCTION_ID) {
  l.begin({
    attemptId,
    instructionId,
    rail: 'WISE',
    idempotencyKey: `key-${attemptId}`,
    principal: { principalType: 'svc', principalId: 'runner' },
    now: 2_500n,
  });
  l.start(attemptId, 2_600n);
  return l.recordExternalOutcome(attemptId, 'SUCCEEDED', [`ev-${attemptId}`], 2_700n);
}

const policy = defineProofPolicy({
  policyId: 'default',
  currency: USD,
  baselineLevel: 'P2',
  highRiskThresholdMinorUnits: 1_000_000n,
  highRiskLevel: 'P4',
  railMinimums: { OFF_NETWORK_CHECK: 'P4' },
  counterpartyRiskMinimums: { UNVERIFIED: 'P3' },
});

function providerEvidence(nodeId: string, actionRef: string): EvidenceNode {
  const graph = new EvidenceGraph();
  return graph.record({
    nodeId,
    kind: 'OBSERVATION',
    actionRef,
    claimedLevel: 'P3',
    provenance: { source: 'AUTHENTICATED_PROVIDER', providerName: 'wise' },
    payload: 'provider-state:executed',
    links: [],
    recordedAt: 2_800n,
  });
}

describe('FinalityAuthority (adapted from old finality.test.ts; INV-01)', () => {
  it('declares finality for a fully reconciled, protocol-authorized, proof-satisfied instruction', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    succeedAttempt(ledger, 'att-1');

    const record = finality.declareFinality({
      finalityId: 'fin-1',
      instruction,
      authorization: protocolProof(),
      policy,
      proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
      evidence: [providerEvidence('ev-att-1', 'att-1')],
      now: 3_000n,
    });
    expect(record.state).toBe('FINAL');
    expect(record.instructionId).toBe(instruction.id);
    expect(record.amount.value).toBe(instruction.amount.value);
    expect(record.proof.required).toBe('P2');
    expect(record.proof.achieved).toBe('P3');
    expect(record.declaredAt).toBe(3_000n);
  });

  it('rejects a hand-minted/tampered instruction (protocol re-derivation mismatch)', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    succeedAttempt(ledger, 'att-1');

    const tampered = {
      ...instruction,
      amount: fromMinorUnits(USD, 999n), // tampered amount
    };
    expect(() =>
      finality.declareFinality({
        finalityId: 'fin-1',
        instruction: tampered,
        authorization: protocolProof(),
        policy,
        proofContext: { direction: 'SETTLE', amount: tampered.amount, rail: 'WISE' },
        evidence: [providerEvidence('ev-att-1', 'att-1')],
        now: 3_000n,
      }),
    ).toThrow(FinalityNotProtocolAuthorizedError);
  });

  it('rejects finality while an OUTCOME_UNKNOWN attempt remains (INV-04 precondition)', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    ledger.begin({
      attemptId: asSettlementAttemptId('att-unknown'),
      instructionId: instruction.id,
      rail: 'WISE',
      idempotencyKey: 'key-u',
      principal: { principalType: 'svc', principalId: 'runner' },
      now: 2_500n,
    });
    ledger.start('att-unknown', 2_600n);
    ledger.recordExternalOutcome('att-unknown', 'OUTCOME_UNKNOWN', ['ev-timeout'], 2_700n);

    expect(() =>
      finality.declareFinality({
        finalityId: 'fin-1',
        instruction,
        authorization: protocolProof(),
        policy,
        proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
        evidence: [providerEvidence('ev-att-unknown', 'att-unknown')],
        now: 3_000n,
      }),
    ).toThrow(FinalityPreconditionsUnmetError);
  });

  it('rejects finality with an OPEN reconciliation case, then accepts after resolution', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    ledger.begin({
      attemptId: asSettlementAttemptId('att-1'),
      instructionId: instruction.id,
      rail: 'WISE',
      idempotencyKey: 'key-1',
      principal: { principalType: 'svc', principalId: 'runner' },
      now: 2_500n,
    });
    ledger.start('att-1', 2_600n);
    ledger.recordExternalOutcome('att-1', 'OUTCOME_UNKNOWN', ['ev-timeout'], 2_700n);

    const opened = reconciliation.openCase({
      caseId: 'case-1',
      subject: { kind: 'SETTLEMENT_ATTEMPT', attemptId: asSettlementAttemptId('att-1') },
      reason: 'EXTERNAL_AMBIGUITY',
      now: 2_800n,
    });
    expect(opened.status).toBe('OPEN');

    expect(() =>
      finality.declareFinality({
        finalityId: 'fin-1',
        instruction,
        authorization: protocolProof(),
        policy,
        proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
        evidence: [providerEvidence('ev-att-1', 'att-1')],
        now: 3_000n,
      }),
    ).toThrow(FinalityPreconditionsUnmetError);

    reconciliation.resolveCase({
      caseId: 'case-1',
      outcome: 'CONFIRMED_SUCCEEDED',
      resolvedBy: { principalType: 'svc', principalId: 'reconciler' },
      evidenceIds: ['ev-provider-retrieval'],
      now: 2_900n,
    });

    const record = finality.declareFinality({
      finalityId: 'fin-1',
      instruction,
      authorization: protocolProof(),
      policy,
      proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
      evidence: [providerEvidence('ev-att-1', 'att-1')],
      now: 3_000n,
    });
    expect(record.state).toBe('FINAL');
    expect(record.reconciliationRefs).toContain('case-1');
  });

  it('rejects finality when the proof level is insufficient (weak paths cannot finalize)', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    succeedAttempt(ledger, 'att-1');

    // UI/browser artifact claiming P5 — capped to P0 (unauthenticated)
    const graph = new EvidenceGraph();
    const weak = graph.record({
      nodeId: 'ev-weak',
      kind: 'OBSERVATION',
      actionRef: 'att-1',
      claimedLevel: 'P5',
      provenance: { source: 'UI_BROWSER_ARTIFACT', authenticated: false },
      payload: 'screenshot',
      links: [],
      recordedAt: 2_800n,
    });
    expect(() =>
      finality.declareFinality({
        finalityId: 'fin-1',
        instruction,
        authorization: protocolProof(),
        policy,
        proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
        evidence: [weak],
        now: 3_000n,
      }),
    ).toThrow(FinalityInsufficientProofError);
  });

  it('finality is declared ONCE per instruction; ids are never reused', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    succeedAttempt(ledger, 'att-1');
    const input = {
      instruction,
      authorization: protocolProof(),
      policy,
      proofContext: { direction: 'SETTLE' as const, amount: instruction.amount, rail: 'WISE' },
      evidence: [providerEvidence('ev-att-1', 'att-1')],
    };
    finality.declareFinality({ finalityId: 'fin-1', ...input, now: 3_000n });
    expect(() => finality.declareFinality({ finalityId: 'fin-2', ...input, now: 3_100n })).toThrow(
      FinalityRecordConflictError,
    );
    expect(() => finality.declareFinality({ finalityId: 'fin-1', ...input, now: 3_200n })).toThrow(
      FinalityRecordConflictError,
    );
  });

  it('REVERSE is the only exit from FINAL and requires a compensating obligation', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    succeedAttempt(ledger, 'att-1');
    const record = finality.declareFinality({
      finalityId: 'fin-1',
      instruction,
      authorization: protocolProof(),
      policy,
      proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
      evidence: [providerEvidence('ev-att-1', 'att-1')],
      now: 3_000n,
    });

    expect(() => finality.reverse('fin-1', { compensatingObligationRef: '', now: 4_000n })).toThrow();
    const reversed = finality.reverse('fin-1', {
      compensatingObligationRef: 'OBL:clr-refund:alice>bob:USD',
      now: 4_000n,
    });
    expect(reversed.state).toBe('REVERSED');
    expect(reversed.compensatingObligationRef).toBe('OBL:clr-refund:alice>bob:USD');
    // the FINAL declaration stays in the append-only history
    expect(reversed.history.map((h) => h.on)).toEqual(['FINALIZE', 'REVERSE']);
    expect(reversed.history[1]?.viaRecovery).toBe(true);
  });

  it('verifyProtocolAuthorization fails closed on invalid proof inputs', async () => {
    const { verifyProtocolAuthorization } = await import('../src/index.ts');
    const instruction = buildInstruction();
    const { nettingSet, obligations } = protocolProof();
    // non-PENDING obligation in the proof -> typed protocol error
    const settled = obligations.map((o) => ({ ...o, state: 'SETTLED' as const }));
    expect(() => verifyProtocolAuthorization(instruction, { nettingSet, obligations: settled })).toThrow();
    // a foreign instruction does not match any derivation
    const foreign = { ...instruction, setId: asNettingSetId('ns-OTHER') };
    const verification = verifyProtocolAuthorization(foreign, { nettingSet, obligations });
    expect(verification.authorized).toBe(false);
    expect(verification.reasons).toContain('NO_PROTOCOL_DERIVATION_MATCHED');
  });

  it('the deterministic clock dependency is honored (declaredAt from input)', () => {
    const ledger = new SettlementAttemptLedger();
    const reconciliation = new SettlementReconciliationAuthority(ledger);
    const finality = new FinalityAuthority(ledger, reconciliation);
    const instruction = buildInstruction();
    succeedAttempt(ledger, 'att-1');
    const clock = new DeterministicClock(123n);
    const record = finality.declareFinality({
      finalityId: 'fin-clock',
      instruction,
      authorization: protocolProof(),
      policy,
      proofContext: { direction: 'SETTLE', amount: instruction.amount, rail: 'WISE' },
      evidence: [providerEvidence('ev-att-1', 'att-1')],
      now: clock.now(),
    });
    expect(record.declaredAt).toBe(123n);
  });
});
