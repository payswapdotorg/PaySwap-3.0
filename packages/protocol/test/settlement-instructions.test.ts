import { describe, expect, it } from 'vitest';
import {
  USD,
  asClearingRecordId,
  asNettingSetId,
  asObligationId,
  asPartyId,
  asSettlementInstructionId,
  deriveObligations,
  deriveSettlementInstruction,
  fromMinorUnits,
  netPositions,
  remittanceDocumentRefs,
  settlementInstructions,
  ValidationError,
  validateAuthorizationRef,
  type AuthorizationRef,
  type Obligation,
} from '../src/index.ts';

const DUE_WINDOW = { opensAt: 1_500n, closesAt: 9_000n };
const NETTING_WINDOW = { opensAt: 1_000n, closesAt: 9_000n };

const authRef: AuthorizationRef = {
  artifactId: 'art-1',
  mandateRef: 'mandate-1',
  approverRef: 'approver-1',
  epoch: 7n,
  artifactHash: 'deadbeef',
};

function obligations(): Obligation[] {
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
          {
            id: 'act-2' as never,
            activityType: 'PAYMENT_FULFILLED',
            debtor: asPartyId('bob'),
            creditor: asPartyId('alice'),
            amount: fromMinorUnits(USD, 25n),
            occurredAt: 1_000n,
          },
        ],
        netted: false,
      },
    ],
    { dueWindow: DUE_WINDOW },
  );
  return [...derived];
}

function protocolInstruction() {
  const set = {
    id: asNettingSetId('ns-1'),
    obligations: obligations().map((o) => o.id),
    window: NETTING_WINDOW,
    createdAt: 1_200n,
  };
  const positions = netPositions(set, obligations());
  return settlementInstructions(positions)[0]!;
}

describe('settlement instructions (adapted from old instructions.test.ts)', () => {
  it('derives a validated, frozen instruction from a protocol instruction', () => {
    const base = protocolInstruction();
    const instruction = deriveSettlementInstruction({
      protocolInstruction: base,
      remittance: [
        { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 75n) },
      ],
      settlementDestinationId: 'merchant-account-external-1',
      authorizationRefs: [authRef],
      issuedAt: 2_000n,
    });
    expect(instruction.id).toBe(base.id);
    expect(instruction.settlementDestinationId).toBe('merchant-account-external-1');
    expect(instruction.remittance).toHaveLength(1);
    expect(instruction.authorizationRefs).toHaveLength(1);
    expect(instruction.issuedAt).toBe(2000n);
    expect(Object.isFrozen(instruction)).toBe(true);
    // the protocol derivation is consumed verbatim
    expect(instruction.fromNetPosition).toBe(base.fromNetPosition);
  });

  it('INV-05: a settlement instruction without authorization lineage is unconstructible', () => {
    const base = protocolInstruction();
    expect(() =>
      deriveSettlementInstruction({
        protocolInstruction: base,
        remittance: [],
        settlementDestinationId: 'dest',
        authorizationRefs: [],
        issuedAt: 2_000n,
      }),
    ).toThrow(ValidationError);
  });

  it('structurally invalid authorization refs are rejected (opaque structural contract)', () => {
    const base = protocolInstruction();
    expect(() =>
      deriveSettlementInstruction({
        protocolInstruction: base,
        remittance: [],
        settlementDestinationId: 'dest',
        authorizationRefs: [{ ...authRef, epoch: -1n }],
        issuedAt: 2_000n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      deriveSettlementInstruction({
        protocolInstruction: base,
        remittance: [],
        settlementDestinationId: 'dest',
        authorizationRefs: [{ ...authRef, artifactId: '' }],
        issuedAt: 2_000n,
      }),
    ).toThrow(ValidationError);
    expect(validateAuthorizationRef(authRef)).toBeUndefined();
  });

  it('remittance allocations must be unique, positive, in the instruction currency', () => {
    const base = protocolInstruction();
    const input = {
      protocolInstruction: base,
      settlementDestinationId: 'dest',
      authorizationRefs: [authRef],
      issuedAt: 2_000n,
    };
    expect(() =>
      deriveSettlementInstruction({
        ...input,
        remittance: [
          { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 1n) },
          { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 1n) },
        ],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      deriveSettlementInstruction({
        ...input,
        remittance: [{ documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 0n) }],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      deriveSettlementInstruction({
        ...input,
        remittance: [
          { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: { currency: 'EUR' as never, value: 1n } as never },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('remittance refs are preserved end-to-end and deduplicate in first-appearance order', () => {
    const base = protocolInstruction();
    const instruction = deriveSettlementInstruction({
      protocolInstruction: base,
      remittance: [
        { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 50n) },
        { documentKind: 'CREDIT_NOTE', documentId: 'cn-1', allocatedAmount: fromMinorUnits(USD, 25n) },
      ],
      settlementDestinationId: 'dest',
      authorizationRefs: [authRef],
      issuedAt: 2_000n,
    });
    expect(remittanceDocumentRefs(instruction)).toEqual([
      { documentKind: 'INVOICE', documentId: 'inv-42' },
      { documentKind: 'CREDIT_NOTE', documentId: 'cn-1' },
    ]);
    // the projection is defensive: a hand-assembled remittance with a repeated
    // document reference still deduplicates (first-appearance order)
    const defensive = remittanceDocumentRefs({
      ...instruction,
      remittance: [
        { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 1n) },
        { documentKind: 'INVOICE', documentId: 'inv-42', allocatedAmount: fromMinorUnits(USD, 2n) },
      ],
    });
    expect(defensive).toEqual([{ documentKind: 'INVOICE', documentId: 'inv-42' }]);
  });

  it('validates the protocol instruction shape (positive amount, net position present)', () => {
    const base = protocolInstruction();
    expect(() =>
      deriveSettlementInstruction({
        protocolInstruction: { ...base, amount: fromMinorUnits(USD, 0n) },
        remittance: [],
        settlementDestinationId: 'dest',
        authorizationRefs: [authRef],
        issuedAt: 2_000n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      deriveSettlementInstruction({
        protocolInstruction: { ...base, fromNetPosition: null as never },
        remittance: [],
        settlementDestinationId: 'dest',
        authorizationRefs: [authRef],
        issuedAt: 2_000n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      deriveSettlementInstruction({
        protocolInstruction: base,
        remittance: [],
        settlementDestinationId: '',
        authorizationRefs: [authRef],
        issuedAt: 2_000n,
      }),
    ).toThrow(ValidationError);
  });
});
