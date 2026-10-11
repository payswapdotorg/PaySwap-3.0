import { describe, expect, it } from 'vitest';
import * as protocol from '../src/index.ts';

describe('package smoke', () => {
  it('exports the financial protocol surface from a single entry point', () => {
    expect(protocol.PACKAGE_NAME).toBe('@payswap/protocol');
    const keys = Object.keys(protocol);
    expect(keys.length).toBeGreaterThanOrEqual(150);
    // Exact-money authority
    expect(keys).toContain('fromMinorUnits');
    expect(keys).toContain('FloatMoneyRejectedError');
    expect(keys).toContain('amountSpecToMoney');
    expect(keys).toContain('moneyToAmountSpec');
    // Kernel
    expect(keys).toContain('defineStateMachine');
    expect(keys).toContain('InMemoryIdempotencyRegistrar');
    expect(keys).toContain('EventSourcedAggregate');
    expect(keys).toContain('createCommandEnvelope');
    // Lifecycle
    expect(keys).toContain('deriveObligations');
    expect(keys).toContain('reserve');
    expect(keys).toContain('netPositions');
    expect(keys).toContain('settlementInstructions');
    expect(keys).toContain('canDelay');
    // Settlement plane
    expect(keys).toContain('SettlementAttemptLedger');
    expect(keys).toContain('FinalityAuthority');
    expect(keys).toContain('SettlementReconciliationAuthority');
    expect(keys).toContain('EvidenceGraph');
    expect(keys).toContain('SettlementCertificateAuthority');
    expect(keys).toContain('ProviderRevisionLedger');
    // INV-04 discipline
    expect(keys).toContain('ExternalAmbiguityError');
    expect(keys).toContain('isFailureOutcome');
    // Authorization lineage boundary
    expect(keys).toContain('validateAuthorizationRef');
  });
});
