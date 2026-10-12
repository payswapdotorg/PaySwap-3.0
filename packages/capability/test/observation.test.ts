import { describe, expect, it } from 'vitest';
import {
  ValidationError,
  observeCapability,
  unknownReachabilityObservation,
  validateCapabilityObservation,
} from '../src/index.ts';
import type { CapabilityObservation } from '../src/index.ts';
import type { Equal, Expect } from './type-utils.ts';
import { healthyObservation } from './fixtures.ts';

/**
 * CapabilityObservation (layer 4) — PORTED from old connectors
 * observations.test.ts + NET-NEW freshness-stamp law. The availability
 * field is DERIVED from the two axes, never caller-supplied; observations
 * are evidence, never authorization.
 */

const provenance = {
  providerName: 'psp-a',
  source: 'PROVIDER_API' as const,
  capturedAt: '2026-10-01T12:00:00Z',
};

function observationInput(
  overrides: Partial<Parameters<typeof observeCapability>[0]> = {},
): Parameters<typeof observeCapability>[0] {
  return {
    instanceId: 'inst:acct-1-payments',
    observedAt: '2026-10-01T12:00:05Z',
    observationVersion: 1,
    capabilityState: 'AVAILABLE',
    sourceAvailability: 'REACHABLE',
    eligibility: 'ELIGIBLE',
    health: { status: 'HEALTHY', lastCheckedAt: '2026-10-01T12:00:04Z' },
    provenance,
    ...overrides,
  };
}

describe('observeCapability derives availability (never caller-supplied)', () => {
  it('constructs a validated observation with the DERIVED availability', () => {
    const observation = observeCapability(observationInput());
    expect(observation.availability).toBe('AVAILABLE');
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.health)).toBe(true);
  });

  it('an unreachable source yields UNKNOWN — never success, never failure', () => {
    const observation = observeCapability(
      observationInput({ sourceAvailability: 'UNREACHABLE', capabilityState: 'AVAILABLE' }),
    );
    expect(observation.availability).toBe('UNKNOWN');
  });

  it('carries quota and terms observations when supplied', () => {
    const observation = observeCapability(
      observationInput({
        quota: { limit: 1000, remaining: 42, windowSeconds: 60 },
        terms: { version: '2026-01', changePending: true },
      }),
    );
    expect(observation.quota?.remaining).toBe(42);
    expect(observation.terms?.changePending).toBe(true);
  });

  it('rejects malformed inputs (version, states, provenance)', () => {
    expect(() => observeCapability(observationInput({ observationVersion: 0 }))).toThrow(
      /observationVersion/,
    );
    expect(() =>
      observeCapability(observationInput({ capabilityState: 'BROKEN' as never })),
    ).toThrow(/capabilityState/);
    expect(() => observeCapability(observationInput({ eligibility: 'MAYBE' as never }))).toThrow(
      /eligibility/,
    );
    expect(() =>
      observeCapability(observationInput({ provenance: { ...provenance, source: 'GOSSIP' as never } })),
    ).toThrow(/provenance/);
  });
});

describe('freshness stamping (net-new law: observedAt is strict ISO-8601 UTC data)', () => {
  it('accepts a strict ISO-8601 UTC timestamp with milliseconds', () => {
    expect(() =>
      observeCapability(observationInput({ observedAt: '2026-10-01T12:00:05.123Z' })),
    ).not.toThrow();
  });

  it('rejects non-UTC offsets, date-only strings and non-timestamps (format law)', () => {
    for (const bad of [
      '2026-10-01T12:00:05+02:00',
      '2026-10-01T12:00:05',
      '2026-10-01',
      'not-a-timestamp',
    ]) {
      expect(() => observeCapability(observationInput({ observedAt: bad }))).toThrow(
        /ISO-8601/,
      );
    }
  });

  it('rejects calendar-invalid dates and times (range law)', () => {
    for (const bad of ['2026-13-01T12:00:05Z', '2026-02-30T12:00:05Z', '2026-10-01T25:00:05Z']) {
      expect(() => observeCapability(observationInput({ observedAt: bad }))).toThrow(
        /out of range/,
      );
    }
  });
});

describe('unknownReachabilityObservation (INV-4 discipline)', () => {
  it('carries the last-known state with UNKNOWN reachability and UNKNOWN eligibility', () => {
    const observation = unknownReachabilityObservation({
      instanceId: 'inst:acct-1-payments',
      observedAt: '2026-10-01T12:00:05Z',
      observationVersion: 2,
      lastKnownCapabilityState: 'DEGRADED',
      reason: 'timeout',
      provenance,
    });
    expect(observation.capabilityState).toBe('DEGRADED');
    expect(observation.sourceAvailability).toBe('UNKNOWN');
    expect(observation.availability).toBe('UNKNOWN');
    expect(observation.eligibility).toBe('UNKNOWN');
    expect(observation.health.status).toBe('UNKNOWN');
  });
});

describe('validateCapabilityObservation (untyped sources)', () => {
  it('rejects a FABRICATED availability that disagrees with the two axes', () => {
    const fabricated = {
      ...healthyObservation(),
      capabilityState: 'AVAILABLE',
      sourceAvailability: 'UNREACHABLE',
      availability: 'AVAILABLE',
    } as unknown;
    expect(() => validateCapabilityObservation(fabricated)).toThrow(/two axes/);
  });

  it('accepts a consistent record', () => {
    const validated = validateCapabilityObservation(healthyObservation());
    expect(validated.availability).toBe('AVAILABLE');
  });

  it('rejects records missing an axis', () => {
    const partial = { ...healthyObservation() } as Record<string, unknown>;
    delete partial.sourceAvailability;
    expect(() => validateCapabilityObservation(partial)).toThrow(/availability axes/);
  });
});

// Type-level: observations carry a DERIVED availability field (never optional).
type _assertObservation = Expect<
  Equal<CapabilityObservation['availability'], 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN'>
>;
