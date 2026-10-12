import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_STATES,
  SOURCE_AVAILABILITIES,
  resolveEffectiveAvailability,
} from '../src/index.ts';
import type { EffectiveAvailability } from '../src/index.ts';
import type { Equal, Expect } from './type-utils.ts';

/**
 * Two-axis availability (PORTED from old capabilities availability.test.ts;
 * canonical citation: observations are evidence — an unreachable/unknown
 * source means availability UNKNOWN, never success, never failure; UNKNOWN
 * is not FAILED). Exhaustive matrix coverage.
 */

const EXPECTED_MATRIX: Readonly<Record<CapState, Record<Source, Effective>>> = {
  AVAILABLE: { REACHABLE: 'AVAILABLE', UNREACHABLE: 'UNKNOWN', UNKNOWN: 'UNKNOWN' },
  DEGRADED: { REACHABLE: 'DEGRADED', UNREACHABLE: 'UNKNOWN', UNKNOWN: 'UNKNOWN' },
  UNAVAILABLE: { REACHABLE: 'UNAVAILABLE', UNREACHABLE: 'UNKNOWN', UNKNOWN: 'UNKNOWN' },
};

type CapState = (typeof CAPABILITY_STATES)[number];
type Source = (typeof SOURCE_AVAILABILITIES)[number];
type Effective = EffectiveAvailability;

describe('resolveEffectiveAvailability — exhaustive matrix (two-axis law)', () => {
  it('covers all 9 combinations with the mandated result', () => {
    for (const state of CAPABILITY_STATES) {
      for (const source of SOURCE_AVAILABILITIES) {
        const resolved = resolveEffectiveAvailability(state, source);
        expect(resolved, `${state} x ${source}`).toBe(EXPECTED_MATRIX[state][source]);
      }
    }
  });

  it('source UNREACHABLE or UNKNOWN always yields UNKNOWN — never success, never failure', () => {
    for (const state of CAPABILITY_STATES) {
      expect(resolveEffectiveAvailability(state, 'UNREACHABLE')).toBe('UNKNOWN');
      expect(resolveEffectiveAvailability(state, 'UNKNOWN')).toBe('UNKNOWN');
    }
  });

  it('a reachable source defers to the capability state', () => {
    expect(resolveEffectiveAvailability('AVAILABLE', 'REACHABLE')).toBe('AVAILABLE');
    expect(resolveEffectiveAvailability('DEGRADED', 'REACHABLE')).toBe('DEGRADED');
    expect(resolveEffectiveAvailability('UNAVAILABLE', 'REACHABLE')).toBe('UNAVAILABLE');
  });

  it('UNKNOWN never collapses into a terminal verdict (UNKNOWN is not FAILED)', () => {
    const results = new Set<EffectiveAvailability>(
      CAPABILITY_STATES.flatMap((state) =>
        SOURCE_AVAILABILITIES.map((source) => resolveEffectiveAvailability(state, source)),
      ),
    );
    expect(results.has('UNKNOWN')).toBe(true);
    expect(results.has('FAILED' as unknown as EffectiveAvailability)).toBe(false);
  });
});

// Type-level guarantees (enforced by `tsc --noEmit`):
type _assertNoFailed = Expect<
  Equal<EffectiveAvailability, 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN'>
>;
type _assertStates = Expect<Equal<CapState, 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE'>>;
type _assertSources = Expect<Equal<Source, 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN'>>;
