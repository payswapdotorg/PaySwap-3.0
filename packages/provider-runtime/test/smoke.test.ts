import { describe, expect, it } from 'vitest';
import * as runtime from '../src/index.ts';
import { PACKAGE_NAME } from '../src/index.ts';

/**
 * Smoke: the package surface is importable, the name law holds and every
 * scope item of the Work Order is represented on the export surface.
 */
describe('smoke: @payswap/provider-runtime surface', () => {
  it('exports the package identity under the canonical name (never "provider")', () => {
    expect(PACKAGE_NAME).toBe('@payswap/provider-runtime');
  });

  it('the export surface covers every Work Order scope item', () => {
    const keys = Object.keys(runtime);
    const expected = [
      // Connection model (scope, forms, lifecycle).
      'CONNECTION_FORMS',
      'CONNECTION_FORM_PROFILES',
      'OPERATION_CLASSES',
      'EFFECT_CLASSES',
      'scopeAdmits',
      'freezeConnectionScope',
      'CONNECTION_LIFECYCLE_STATES',
      'InMemoryConnectionRegistry',
      'lifecycleAdmitsOperation',
      // Credential/browser isolation.
      'InMemoryCredentialBroker',
      'BrowserSessionBroker',
      'SealedCredentialBundle',
      'SealedBrowserSession',
      // Redaction (INV-19).
      'redactForArtifact',
      'assertNoSecretMaterial',
      'REDACTED_MARKER',
      // Execution mode law (INV-25).
      'EXECUTION_MODES',
      'liveBehaviorProof',
      'validateTransportBinding',
      'SandboxLiveBoundaryError',
      // Result envelope (INV-04).
      'EXTERNAL_EFFECT_OUTCOMES',
      'classifyTransportOutcome',
      'envelopeFromClassification',
      'assertInvariantOutcome',
      'AmbiguousOutcomeError',
      'isFailureOutcome',
      // Endpoint-specific idempotency (INV-06).
      'IdempotencyContractRegistry',
      'deriveIdempotencyKey',
      'InMemoryIdempotencyRegistrar',
      'idempotencyScopeKey',
      'IdempotencyKeyConflictError',
      // Raw provider-state retention (INV-03/INV-14).
      'RawProviderStateStore',
      'orderingKey',
      'identityNormalizer',
      'RawStateConflictError',
      // Event/webhook ingestion.
      'ProviderEventIngestor',
      'canonicalWebhookBody',
      'naiveEventObjectExtractor',
      // Retrieval + reconciliation supply.
      'ProviderRetrievalService',
      'RETRIEVAL_REASONS',
      // Execution bridge + attempts.
      'ProviderExecutionBridge',
      'InMemoryEffectAttemptLedger',
      'OperationBindingRegistry',
      'ReconciliationRequiredBeforeRetryError',
      // Opaque cross-lane refs (P1-W2 pattern / P2-W1 in flight).
      'validateAuthorizationRef',
      'validateCapabilityRef',
      'sameCapabilityRef',
      // Kernel.
      'DeterministicClock',
      'fnv1a64Hex',
      'canonicalJson',
      'contentHash',
    ];
    for (const name of expected) {
      expect(keys, `missing export: ${name}`).toContain(name);
    }
  });

  it('the deterministic kernel primitives behave (clock, hashing, canonical json)', () => {
    const clock = new runtime.DeterministicClock(100n);
    expect(clock.now()).toBe(100n);
    clock.advance(5n);
    expect(clock.now()).toBe(105n);
    expect(runtime.fnv1a64Hex('a')).toHaveLength(16);
    expect(runtime.canonicalJson({ b: 1, a: 2 })).toBe(runtime.canonicalJson({ a: 2, b: 1 }));
    expect(runtime.contentHash({ x: 1 })).toBe(runtime.contentHash({ x: 1 }));
    expect(() => clock.advance(-1n)).toThrow();
  });
});
