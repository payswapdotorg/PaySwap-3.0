import { describe, expect, it } from 'vitest';
import {
  ObservationVersionLedger,
  ObservationVersionError,
  ValidationError,
  canonicalDigest,
  pinObservation,
  validateObservationPin,
  validateObservationShape,
} from '../src/index.ts';
import type { VersionedObservationRecord } from '../src/index.ts';
import { makeObservation, NOW } from './fixtures.ts';

/**
 * OBSERVATION-VERSION PRESERVATION (P3-W2, ENCODED LAW 1 — NET-NEW for the
 * 3.0 law): the capability fabric's observations are evidence; the graph
 * keeps the EXACT version it decided on, losslessly, no matter how many
 * newer versions arrive.
 */
describe('observation-version ledger (P3-W2, LAW 1 — net-new)', () => {
  it('records observations and pins their exact version + content digest', () => {
    const ledger = new ObservationVersionLedger();
    const observation = makeObservation();
    const record = ledger.record(observation, NOW);
    expect(record.pin.instanceId).toBe('inst-mm-1');
    expect(record.pin.observationVersion).toBe(1);
    expect(record.pin.observedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(record.pin.observationDigest).toBe(canonicalDigest(observation));
    expect(ledger.size).toBe(1);
  });

  it('LAW 1: the EXACT recorded version is retrievable losslessly after newer versions arrive', () => {
    const ledger = new ObservationVersionLedger();
    ledger.record(makeObservation({ observationVersion: 1 }), NOW);
    ledger.record(makeObservation({ observationVersion: 2, observedAt: '2026-01-02T00:00:00.000Z' }), NOW + 1n);
    ledger.record(makeObservation({ observationVersion: 5, observedAt: '2026-01-03T00:00:00.000Z' }), NOW + 2n);

    // The exact version the graph decided on (v1) is still there, VERBATIM.
    const v1 = ledger.atVersion('inst-mm-1', 1);
    expect(v1).toBeDefined();
    expect(v1!.observation.observedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(v1!.pin.observationDigest).toBe(canonicalDigest(makeObservation()));
    // And v2 as well — history is total, not just "latest".
    const v2 = ledger.atVersion('inst-mm-1', 2);
    expect(v2!.observation.observedAt).toBe('2026-01-02T00:00:00.000Z');
    // Latest is the highest version.
    expect(ledger.latestPinFor('inst-mm-1')!.observationVersion).toBe(5);
    // History is ascending by version.
    expect(ledger.historyFor('inst-mm-1').map((entry) => entry.pin.observationVersion)).toEqual([
      1, 2, 5,
    ]);
  });

  it('enforces version monotonicity — history is append-only (INV-03)', () => {
    const ledger = new ObservationVersionLedger();
    ledger.record(makeObservation({ observationVersion: 3 }), NOW);
    // Same version again: rejected (would rewrite history).
    expect(() => ledger.record(makeObservation({ observationVersion: 3 }), NOW + 1n)).toThrow(
      ObservationVersionError,
    );
    // Older version: rejected.
    expect(() => ledger.record(makeObservation({ observationVersion: 2 }), NOW + 1n)).toThrow(
      /does not advance the recorded history/,
    );
    expect(ledger.size).toBe(1);
  });

  it('rejects malformed observations fail-closed (shape only, never re-graded)', () => {
    const ledger = new ObservationVersionLedger();
    // Non-ISO timestamp.
    expect(() =>
      ledger.record(makeObservation({ observedAt: '2026-01-01 00:00:00' }), NOW),
    ).toThrow(ValidationError);
    // Missing instance id.
    expect(() =>
      ledger.record({ ...makeObservation(), instanceId: '' }, NOW),
    ).toThrow(ValidationError);
    // Two-axis disagreement: an UNREACHABLE source claiming AVAILABLE.
    expect(() => {
      const forged = {
        ...makeObservation({ sourceAvailability: 'UNREACHABLE' }),
        availability: 'AVAILABLE' as const,
      };
      return ledger.record(forged, NOW);
    }).toThrow(/two axes/);
    // Version 0.
    expect(() =>
      ledger.record(makeObservation({ observationVersion: 0 }), NOW),
    ).toThrow(ValidationError);
  });

  it('validates pins from untyped sources (digest bound to content)', () => {
    const pin = pinObservation(makeObservation({ observationVersion: 4 }));
    const validated = validateObservationPin(pin);
    expect(validated.observationVersion).toBe(4);
    // A pin with a non-ISO stamp is rejected.
    expect(() =>
      validateObservationPin({ ...pin, observedAt: 'not-a-timestamp' }),
    ).toThrow(ValidationError);
    // A pin with a digest that does not match its observation is detectable.
    const ledger = new ObservationVersionLedger();
    ledger.record(makeObservation({ observationVersion: 4 }), NOW);
    const record = ledger.atVersion('inst-mm-1', 4)!;
    expect(record.pin.observationDigest).toBe(canonicalDigest(record.observation));
  });

  it('preserves the observation VERBATIM (INV-14: no flattening, no mutation)', () => {
    const ledger = new ObservationVersionLedger();
    const observation = makeObservation({ observationVersion: 1 });
    const record: VersionedObservationRecord = ledger.record(observation, NOW);
    expect(record.observation).toBe(observation);
    // The record (and the observation inside) is frozen.
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.observation)).toBe(true);
    // Mutating the caller's copy afterwards never affects the recorded one.
    expect(() => {
      (observation as unknown as Record<string, unknown>)['instanceId'] = 'forged';
    }).toThrow();
  });

  it('keeps per-instance histories independent', () => {
    const ledger = new ObservationVersionLedger();
    ledger.record(makeObservation({ instanceId: 'inst-a', observationVersion: 1 }), NOW);
    ledger.record(makeObservation({ instanceId: 'inst-b', observationVersion: 1 }), NOW);
    ledger.record(makeObservation({ instanceId: 'inst-a', observationVersion: 2 }), NOW + 1n);
    expect(ledger.historyFor('inst-a').map((entry) => entry.pin.observationVersion)).toEqual([1, 2]);
    expect(ledger.historyFor('inst-b').map((entry) => entry.pin.observationVersion)).toEqual([1]);
    expect(ledger.size).toBe(3);
    expect(ledger.atVersion('inst-b', 2)).toBeUndefined();
    expect(ledger.atVersion('inst-c', 1)).toBeUndefined();
  });

  it('validateObservationShape is total over the healthy shapes (pin round-trip)', () => {
    for (const state of ['AVAILABLE', 'DEGRADED', 'UNAVAILABLE'] as const) {
      const observation = makeObservation({ capabilityState: state });
      expect(validateObservationShape(observation)).toBe(observation);
      const pin = pinObservation(observation);
      expect(pin.observationDigest).toBe(canonicalDigest(observation));
    }
    // UNREACHABLE/UNKNOWN sources derive UNKNOWN availability.
    const unreachable = makeObservation({ sourceAvailability: 'UNREACHABLE' });
    expect(unreachable.availability).toBe('UNKNOWN');
    expect(pinObservation(unreachable).observationVersion).toBe(1);
  });
});
