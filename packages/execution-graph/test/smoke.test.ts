import { describe, expect, it } from 'vitest';
import {
  PACKAGE_NAME,
  SIMULATION_NAMESPACE,
  STRATEGY_DIRECTIVE_KINDS,
  MATERIAL_TERM_AXES,
  EXECUTION_EVIDENCE_KINDS,
  ATTEMPT_TERMINAL_STATES,
  EXECUTION_MODES_LOCAL,
} from '../src/index.ts';

/**
 * Smoke: the package surface loads and the pinned wire vocabularies are
 * the closed sets the contracts declare (full battery in the test suite
 * commit; this file keeps every intermediate commit battery-complete).
 */
describe('smoke: @payswap/execution-graph', () => {
  it('exposes the package identity', () => {
    expect(PACKAGE_NAME).toBe('@payswap/execution-graph');
  });

  it('pins the three encoded laws as exported contract surfaces', () => {
    // LAW 1: observation-version preservation types load with the pin keys.
    // LAW 2: the material term axis vocabulary is closed and sorted.
    expect([...MATERIAL_TERM_AXES]).toEqual([
      'ROUTE',
      'DESTINATION',
      'ASSET',
      'AMOUNT',
      'RISK',
      'CAPABILITY_OBSERVATIONS',
      'QUOTE',
    ]);
    // LAW 3: strategies answer WHAT — the directive vocabulary is closed.
    expect([...STRATEGY_DIRECTIVE_KINDS]).toEqual([
      'SETTLE_NOW',
      'BATCH',
      'NET_LATER',
      'HOLD_FOR_REVIEW',
    ]);
  });

  it('pins the attempt terminal states and the evidence taxonomy', () => {
    expect([...ATTEMPT_TERMINAL_STATES]).toEqual([
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'COMPENSATED',
      'RECOVERED',
    ]);
    expect([...EXECUTION_EVIDENCE_KINDS]).toEqual([
      'AUTHORIZATION',
      'FUNDING',
      'CONVERSION',
      'PAYOUT',
      'OBSERVATION',
      'FINALITY',
      'RECONCILIATION',
    ]);
  });

  it('pins the execution-mode vocabulary to the capability lane contract', () => {
    expect([...EXECUTION_MODES_LOCAL]).toEqual([
      'PASS_THROUGH_NATIVE',
      'COMPOSED_PAYSWAP',
      'OPTIMIZED_MULTI_PROVIDER',
    ]);
  });

  it('carries the simulation namespace brand (INV-11)', () => {
    expect(SIMULATION_NAMESPACE).toBe('PAYSWAP_EXECUTION_GRAPH_SIMULATION');
  });
});
