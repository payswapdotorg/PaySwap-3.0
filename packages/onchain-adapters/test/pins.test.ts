import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.ts';
import { canonicalString, contentDigest, fnv1a64Hex } from '../src/digest.ts';
import { assertNoSecretMaterial, looksLikeRawKeyMaterial } from '../src/secrets.ts';
import { validateOnchainExecutionDirective } from '../src/pins/onchain-domain/directive.ts';
import { validateOnchainExecutionObservation } from '../src/pins/onchain-domain/observation.ts';
import { assertOnchainExecutionScope, chainCapabilityId, isChainCatalogueShape } from '../src/pins/onchain-domain/instance.ts';
import { mapObservationToRailOutcome, onchainRailId, settlementAttemptEventCandidate, mapToRailOperation, validateOnchainSettlementLinkage } from '../src/pins/onchain-domain/settlement-mapping.ts';
import { validateOnchainWriteRequest } from '../src/pins/onchain-security/write-request.ts';
import { recordSimulation } from '../src/pins/onchain-security/signing.ts';
import {
  CHAIN,
  ETHEREUM_ASSET_ID,
  MERCHANT,
  NOW_ISO,
  PAYER,
  connectedChainInstance,
  evmTransferDirective,
} from './fixtures/world.ts';

/**
 * NET-NEW for the 3.0 laws: the STRUCTURAL PINS are law-bearing mirrors of
 * the in-flight P4-W1/P4-W2 contracts. This suite machine-checks the pin
 * laws themselves (directive coupling, observation outcome couplings,
 * catalogue-never-authorizes, the settlement mapping totality, the secret
 * boundary and the canonical digest discipline).
 */
describe('pins: the directive + signer-handle law (P4-W1 structural mirror)', () => {
  it('a valid transfer directive validates (operation table coupling)', () => {
    const directive = validateOnchainExecutionDirective(evmTransferDirective());
    expect(directive.operation).toBe('onchain.transfer');
    expect(directive.chainKey).toBe(CHAIN);
  });

  it('missing required fields per the operation table fail closed', () => {
    expect(() =>
      validateOnchainExecutionDirective(
        evmTransferDirective({ destination: undefined }),
      ),
    ).toThrow(/requires a destination reference/);
    expect(() =>
      validateOnchainExecutionDirective(
        evmTransferDirective({ amount: undefined }),
      ),
    ).toThrow(/requires an exact amount/);
    expect(() =>
      validateOnchainExecutionDirective(evmTransferDirective({ operation: 'onchain.swap' })),
    ).toThrow(/protocolRef/);
    expect(() =>
      validateOnchainExecutionDirective(
        evmTransferDirective({ operation: 'undeclared.op' as never }),
      ),
    ).toThrow(/undeclared operations never validate/);
  });

  it('key-material-shaped signer handles are REJECTED (opaque references only)', () => {
    const rawKey = 'a'.repeat(64); // 32-byte hex-shaped key material
    expect(looksLikeRawKeyMaterial(rawKey)).toBe(true);
    expect(() =>
      validateOnchainExecutionDirective(
        evmTransferDirective({
          signerHandle: {
            handleId: rawKey,
            capabilityInstanceId: 'instance:signer:001',
            custodyModel: 'NON_CUSTODIAL_EXTERNAL',
          },
        }),
      ),
    ).toThrow(/NEVER key material/);
  });

  it('amounts are exact integer minor units denominated in the directive asset', () => {
    expect(() =>
      validateOnchainExecutionDirective(
        evmTransferDirective({ amount: { assetId: ETHEREUM_ASSET_ID, minorUnits: '1.5' } }),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateOnchainExecutionDirective(
        evmTransferDirective({ amount: { assetId: `${CHAIN}/asset:OTHER`, minorUnits: '1' } }),
      ),
    ).toThrow(/match the directive's assetId/);
  });
});

describe('pins: the observation outcome-coupling law (UNKNOWN is not FAILED)', () => {
  function observation(overrides: Record<string, unknown>) {
    return validateOnchainExecutionObservation({
      observationId: 'exec-obs:1',
      executionRef: 'exec-1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'BROADCAST',
      evidenceRefs: ['evidence:1'],
      provenance: { providerName: 'ScriptedProvider', source: 'PROVIDER_API', capturedAt: NOW_ISO },
      ...overrides,
    });
  }

  it('a BROADCAST outcome may not carry finality (submitted is not finality)', () => {
    expect(() =>
      observation({
        finalityCandidate: {
          candidateOnly: true,
          requiresProtocolFinality: true,
          confirmationDepth: 1,
          finalityModel: 'PROBABILISTIC',
          reorgDetected: false,
        },
      }),
    ).toThrow(/not financial finality/);
  });

  it('an OUTCOME_UNKNOWN observation REQUIRES a reason and FORBIDS a failure descriptor', () => {
    expect(() => observation({ outcome: 'OUTCOME_UNKNOWN' })).toThrow(/explicit unknownReason/);
    expect(() =>
      observation({
        outcome: 'OUTCOME_UNKNOWN',
        unknownReason: 'reorg',
        failure: { failureClass: 'REJECTED', description: 'x', retryGuidance: 'SAFE_TO_RETRY' },
      }),
    ).toThrow(/UNKNOWN is not FAILED/);
    expect(() =>
      observation({ outcome: 'OUTCOME_UNKNOWN', unknownReason: 'reorg' }),
    ).not.toThrow();
  });

  it('a FAILED outcome REQUIRES an explained failure descriptor', () => {
    expect(() => observation({ outcome: 'FAILED' })).toThrow(/REQUIRES a failure descriptor/);
    expect(() =>
      observation({
        outcome: 'FAILED',
        failure: { failureClass: 'REVERTED', description: 'reverted on-chain', retryGuidance: 'NOT_RETRYABLE' },
      }),
    ).not.toThrow();
  });

  it('evidence references are MANDATORY on every observation', () => {
    expect(() => observation({ evidenceRefs: [] })).toThrow(/evidenceRefs is MANDATORY/);
  });
});

describe('pins: catalogue never authorizes (the instance-scope law)', () => {
  it('a chain catalogue shape is rejected where a connected instance is required', () => {
    const catalogueShape = { chainKey: CHAIN, family: 'EVM', finalitySemantics: { model: 'PROBABILISTIC' } };
    expect(isChainCatalogueShape(catalogueShape)).toBe(true);
    expect(() => assertOnchainExecutionScope(catalogueShape)).toThrow(/catalogue never authorizes/);
  });

  it('a genuinely connected instance passes and binds the deterministic chain capability', () => {
    const instance = connectedChainInstance(CHAIN, 'EVM');
    expect(() => assertOnchainExecutionScope(instance)).not.toThrow();
    expect(chainCapabilityId(CHAIN)).toBe(`capability:chain:${CHAIN}`);
    // A mismatched capability binding fails closed.
    expect(() =>
      assertOnchainExecutionScope({ ...instance, capabilityId: 'capability:wrong' }),
    ).toThrow(ValidationError);
  });
});

describe('pins: the canonical settlement mapping (reconciled with the protocol vocabulary)', () => {
  it('the deterministic rail id is onchain.<chainKey>', () => {
    expect(onchainRailId(CHAIN)).toBe(`onchain.${CHAIN}`);
    expect(() => onchainRailId('not-a-chain')).toThrow(ValidationError);
  });

  it('the observation → rail outcome mapping is total and never converts UNKNOWN', () => {
    const confirmed = validateOnchainExecutionObservation({
      observationId: 'o1',
      executionRef: 'e1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'CONFIRMED',
      finalityCandidate: {
        candidateOnly: true,
        requiresProtocolFinality: true,
        confirmationDepth: 5,
        finalityModel: 'PROBABILISTIC',
        reorgDetected: false,
      },
      evidenceRefs: ['evidence:1'],
      provenance: { providerName: 'P', source: 'PROVIDER_API', capturedAt: NOW_ISO },
    });
    expect(mapObservationToRailOutcome(confirmed).kind).toBe('RAIL_EFFECT_OBSERVED');
    const unknown = validateOnchainExecutionObservation({
      observationId: 'o2',
      executionRef: 'e1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'OUTCOME_UNKNOWN',
      unknownReason: 'reorg ambiguity',
      evidenceRefs: ['evidence:2'],
      provenance: { providerName: 'P', source: 'PROVIDER_API', capturedAt: NOW_ISO },
    });
    const mapped = mapObservationToRailOutcome(unknown);
    expect(mapped.kind).toBe('RAIL_EFFECT_UNKNOWN');
    if (mapped.kind === 'RAIL_EFFECT_UNKNOWN') {
      expect(mapped.requiresReconciliation).toBe(true);
    }
  });

  it('the event candidates are MEMBERS of the accepted protocol settlement vocabulary', () => {
    const protocolVocabulary = [
      'START',
      'CONFIRM_SUCCEEDED',
      'CONFIRM_FAILED',
      'OUTCOME_UNKNOWN',
      'RECONCILE_RESOLVED_SUCCEEDED',
      'RECONCILE_RESOLVED_FAILED',
    ];
    const broadcast = validateOnchainExecutionObservation({
      observationId: 'o3',
      executionRef: 'e1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'BROADCAST',
      evidenceRefs: ['evidence:3'],
      provenance: { providerName: 'P', source: 'PROVIDER_API', capturedAt: NOW_ISO },
    });
    const noEvent = settlementAttemptEventCandidate(broadcast);
    expect(noEvent.kind).toBe('NO_EVENT');
    const confirmed = validateOnchainExecutionObservation({
      observationId: 'o4',
      executionRef: 'e1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'CONFIRMED',
      finalityCandidate: {
        candidateOnly: true,
        requiresProtocolFinality: true,
        confirmationDepth: 1,
        finalityModel: 'PROBABILISTIC',
        reorgDetected: false,
      },
      evidenceRefs: ['evidence:4'],
      provenance: { providerName: 'P', source: 'PROVIDER_API', capturedAt: NOW_ISO },
    });
    const candidate = settlementAttemptEventCandidate(confirmed);
    expect(candidate.kind).toBe('EVENT_CANDIDATE');
    if (candidate.kind === 'EVENT_CANDIDATE') {
      expect(protocolVocabulary).toContain(candidate.event);
      expect(candidate.event).toBe('CONFIRM_SUCCEEDED');
    }
  });

  it('the rail-operation mapping record references canonical ids and the deterministic rail', () => {
    const confirmed = validateOnchainExecutionObservation({
      observationId: 'o5',
      executionRef: 'e1',
      observedAt: NOW_ISO,
      chainKey: CHAIN,
      outcome: 'CONFIRMED',
      finalityCandidate: {
        candidateOnly: true,
        requiresProtocolFinality: true,
        confirmationDepth: 1,
        finalityModel: 'PROBABILISTIC',
        reorgDetected: false,
      },
      evidenceRefs: ['evidence:5'],
      provenance: { providerName: 'P', source: 'PROVIDER_API', capturedAt: NOW_ISO },
    });
    const mapping = mapToRailOperation({
      observation: confirmed,
      settlementInstructionId: 'si-1',
      settlementAttemptId: 'sa-1',
    });
    expect(mapping.mappingKind).toBe('OBSERVATION_TO_RAIL_OPERATION');
    expect(mapping.railId).toBe(`onchain.${CHAIN}`);
    expect(() =>
      mapToRailOperation({
        observation: confirmed,
        settlementInstructionId: '',
        settlementAttemptId: 'sa-1',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateOnchainSettlementLinkage(
        { settlementInstructionId: 'si-1', settlementAttemptId: 'sa-1', railId: 'wrong' },
        CHAIN,
      ),
    ).toThrow(ValidationError);
  });
});

describe('pins: the write request + simulation law (P4-W2 structural mirror)', () => {
  it('an empty write never validates; one write targets exactly one chain', () => {
    expect(() =>
      validateOnchainWriteRequest({
        writeId: 'w1',
        action: 'onchain.transfer',
        chain: CHAIN,
        approvals: [],
        route: { routeId: 'r', routeHash: 'rh' },
        expiry: NOW_ISO.length,
        requestedBy: 'agent:1',
      } as never),
    ).toThrow(/at least one effect leg/);
    expect(() =>
      validateOnchainWriteRequest({
        writeId: 'w1',
        action: 'onchain.transfer',
        chain: CHAIN,
        transfer: {
          asset: { chain: 'solana:mainnet-beta', assetId: 'x', symbol: 'SOL' },
          amount: { currency: 'SOL', minorUnits: '1' },
          from: PAYER,
          to: MERCHANT,
        },
        approvals: [],
        route: { routeId: 'r', routeHash: 'rh' },
        expiry: 1_776_000_060_000,
        requestedBy: 'agent:1',
      } as never),
    ).toThrow(/one write targets exactly one chain/);
  });

  it('a simulation gas estimate, when present, is exact; UNKNOWN is a first-class status', () => {
    // SUCCEEDED WITHOUT a gas estimate is legal (families without gas meters).
    const bare = recordSimulation({
      simulationId: 'sim:1',
      writeId: 'w1',
      observedAt: 1,
      status: 'SUCCEEDED',
      balanceDeltas: [],
      approvals: [],
      simulator: 'adapter:evm:test',
    });
    expect(bare.status).toBe('SUCCEEDED');
    // A FLOAT-SHAPED gas estimate is rejected (the exactness law).
    expect(() =>
      recordSimulation({
        simulationId: 'sim:2',
        writeId: 'w1',
        observedAt: 1,
        status: 'SUCCEEDED',
        gasEstimate: '21000.5',
        balanceDeltas: [],
        approvals: [],
        simulator: 'adapter:evm:test',
      }),
    ).toThrow(/exact integer decimal string/);
    const unknown = recordSimulation({
      simulationId: 'sim:3',
      writeId: 'w1',
      observedAt: 1,
      status: 'OUTCOME_UNKNOWN',
      balanceDeltas: [],
      approvals: [],
      simulator: 'adapter:evm:test',
    });
    expect(unknown.status).toBe('OUTCOME_UNKNOWN');
    expect(Object.isFrozen(unknown)).toBe(true);
  });
});

describe('pins: the canonical digest + secret boundary (binding, never security)', () => {
  it('canonicalString is stable, key-sorted and structure-sensitive', () => {
    expect(canonicalString({ b: 1, a: 2 })).toBe(canonicalString({ a: 2, b: 1 }));
    expect(canonicalString({ a: 1 })).not.toBe(canonicalString({ a: 2 }));
    expect(canonicalString([1, 2])).toBe('[n:1,n:2]');
    expect(canonicalString(1n)).toBe('b:1');
  });

  it('contentDigest is deterministic and FNV-1a64-shaped', () => {
    expect(contentDigest({ a: 1 })).toBe(contentDigest({ a: 1 }));
    expect(contentDigest({ a: 1 })).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(fnv1a64Hex('x')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('assertNoSecretMaterial rejects secret fields, credential-shaped values and raw key material', () => {
    expect(() => assertNoSecretMaterial({ apiKey: 'value' }, 'probe')).toThrow(/secret boundary violation/);
    expect(() =>
      assertNoSecretMaterial({ note: 'Bearer abcdef1234567890abcdef' }, 'probe'),
    ).toThrow(/secret boundary violation/);
    expect(() => assertNoSecretMaterial({ key: 'a'.repeat(64) }, 'probe')).toThrow(
      /secret boundary violation/,
    );
    expect(() => assertNoSecretMaterial({ correlationId: 'ref-123' }, 'probe')).not.toThrow();
    // Cycles are handled (never a crash vector).
    const cyclic: Record<string, unknown> = { self: null };
    cyclic.self = cyclic;
    expect(() => assertNoSecretMaterial(cyclic, 'probe')).not.toThrow();
  });
});
