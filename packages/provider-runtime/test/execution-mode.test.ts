import { describe, expect, it } from 'vitest';
import {
  EXECUTION_MODES,
  TRANSPORT_CLASSES,
  isExecutionMode,
  isLiveBehaviorProof,
  isTransportClass,
  liveBehaviorProof,
  requireExecutionMode,
  validateTransportBinding,
} from '../src/execution-mode.ts';
import { SandboxLiveBoundaryError, ValidationError } from '../src/errors.ts';
import { classifyTransportOutcome } from '../src/result-envelope.ts';
import {
  deliveredResponse,
  providerErrorResponse,
  undeliveredResponse,
} from '../src/transport.ts';
import { ScriptedFakeTransport } from './fake-transport.ts';

describe('the execution-mode vocabulary is explicit and closed', () => {
  it('exposes exactly SANDBOX and LIVE (no default, no third state)', () => {
    expect([...EXECUTION_MODES]).toEqual(['SANDBOX', 'LIVE']);
    expect(isExecutionMode('SANDBOX')).toBe(true);
    expect(isExecutionMode('LIVE')).toBe(true);
    expect(isExecutionMode('TEST')).toBe(false);
    expect(isExecutionMode(undefined)).toBe(false);
  });

  it('transport classes are exactly FAKE_DETERMINISTIC and PRODUCTION_HTTP', () => {
    expect([...TRANSPORT_CLASSES]).toEqual(['FAKE_DETERMINISTIC', 'PRODUCTION_HTTP']);
    expect(isTransportClass('FAKE_DETERMINISTIC')).toBe(true);
    expect(isTransportClass('PRODUCTION_HTTP')).toBe(true);
    expect(isTransportClass('FAKE')).toBe(false);
  });

  it('requireExecutionMode fails closed on unknown values', () => {
    expect(requireExecutionMode('SANDBOX')).toBe('SANDBOX');
    expect(() => requireExecutionMode('production' as never)).toThrow(ValidationError);
    expect(() => requireExecutionMode(null as never)).toThrow(ValidationError);
  });
});

describe('the transport binding law (a fake can never serve live)', () => {
  it('LIVE + FAKE_DETERMINISTIC is mechanically refused (INV-25)', () => {
    expect(() => validateTransportBinding('LIVE', 'FAKE_DETERMINISTIC')).toThrow(
      SandboxLiveBoundaryError,
    );
  });

  it('LIVE + PRODUCTION_HTTP binds; SANDBOX binds either class', () => {
    expect(() => validateTransportBinding('LIVE', 'PRODUCTION_HTTP')).not.toThrow();
    expect(() => validateTransportBinding('SANDBOX', 'FAKE_DETERMINISTIC')).not.toThrow();
    expect(() => validateTransportBinding('SANDBOX', 'PRODUCTION_HTTP')).not.toThrow();
  });

  it('unknown modes/classes fail closed at the binding check too', () => {
    expect(() => validateTransportBinding('TEST' as never, 'PRODUCTION_HTTP')).toThrow(
      ValidationError,
    );
    expect(() => validateTransportBinding('LIVE', 'FAKE' as never)).toThrow(ValidationError);
  });

  it('the fake transport itself declares the class that LIVE refuses', () => {
    const transport = new ScriptedFakeTransport();
    expect(transport.transportClass).toBe('FAKE_DETERMINISTIC');
    expect(() => validateTransportBinding('LIVE', transport.transportClass)).toThrow(
      SandboxLiveBoundaryError,
    );
    expect(() => validateTransportBinding('SANDBOX', transport.transportClass)).not.toThrow();
  });
});

describe('live behavior proof (sandbox can NEVER be represented as live proof)', () => {
  it('a SANDBOX attempt is mechanically refused (SANDBOX_NOT_LIVE_PROOF)', () => {
    expect(() =>
      liveBehaviorProof({ executionMode: 'SANDBOX', evidenceRef: 'attempt:1' }),
    ).toThrow(SandboxLiveBoundaryError);
    let code = '';
    try {
      liveBehaviorProof({ executionMode: 'SANDBOX', evidenceRef: 'attempt:1' });
    } catch (error) {
      code = (error as SandboxLiveBoundaryError).details?.code as string;
    }
    expect(code).toBe('SANDBOX_NOT_LIVE_PROOF');
  });

  it('a LIVE attempt produces a branded, frozen proof object', () => {
    const proof = liveBehaviorProof({ executionMode: 'LIVE', evidenceRef: 'attempt:9' });
    expect(proof.kind).toBe('LIVE_BEHAVIOR_PROOF');
    expect(proof.executionMode).toBe('LIVE');
    expect(proof.evidenceRef).toBe('attempt:9');
    expect(Object.isFrozen(proof)).toBe(true);
    expect(isLiveBehaviorProof(proof)).toBe(true);
    expect(isLiveBehaviorProof({ kind: 'LIVE_BEHAVIOR_PROOF', executionMode: 'SANDBOX' })).toBe(
      false,
    );
  });

  it('malformed proof inputs fail closed', () => {
    expect(() =>
      liveBehaviorProof({ executionMode: 'LIVE' as never, evidenceRef: 'x' }),
    ).not.toThrow();
    expect(() => liveBehaviorProof({ executionMode: 'SANDBOX', evidenceRef: '' })).toThrow(
      ValidationError,
    );
  });
});

describe('sandbox determinism of the fake transport (cannot execute production effects)', () => {
  it('an unscripted call is a pre-dispatch refusal — never an invented provider answer', async () => {
    const transport = new ScriptedFakeTransport();
    const response = await transport.send({
      operationId: 'op.x' as never,
      idempotencyKey: 'k1',
      params: {},
      headers: {},
      correlationId: 'corr',
    });
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('REFUSED_BEFORE_DISPATCH');
    // And that classification is a retryable FAILED (never UNKNOWN: the
    // command never left the process).
    const outcome = classifyTransportOutcome(response);
    expect(outcome.outcome).toBe('FAILED');
    expect(outcome.failure?.retryable).toBe(true);
  });

  it('scripted outcomes replay deterministically and record header NAMES only', async () => {
    const transport = new ScriptedFakeTransport();
    transport.scriptSteps(
      { kind: 'DELIVERED', status: 200, body: { id: 'trf_1', status: 'processing' } },
    );
    const response = await transport.send({
      operationId: 'op.y' as never,
      idempotencyKey: 'k2',
      params: { amount: 100 },
      headers: { Authorization: 'Bearer SECRET-FAKE' },
      correlationId: 'corr',
    });
    expect(response.delivered).toBe(true);
    const call = transport.recordedCalls()[0];
    expect(call?.headerNames).toEqual(['Authorization']);
    expect(call?.authorizationHeaderPresent).toBe(true);
    expect(JSON.stringify(transport.recordedCalls())).not.toContain('SECRET-FAKE');
  });
});

describe('the sandbox/live law across the transport response helpers', () => {
  it('helpers build canonical responses (delivered / provider error / undelivered)', () => {
    expect(deliveredResponse(200, { ok: true }).delivered).toBe(true);
    expect(providerErrorResponse(402, 'insufficient_funds', 'declined').providerErrorCode).toBe(
      'insufficient_funds',
    );
    expect(undeliveredResponse('TIMEOUT_AFTER_DISPATCH').failure?.kind).toBe(
      'TIMEOUT_AFTER_DISPATCH',
    );
    expect(() => deliveredResponse(1.5 as never, {})).toThrow(ValidationError);
    expect(() => providerErrorResponse(400, '', 'x')).toThrow(ValidationError);
    expect(() => undeliveredResponse('NOPE' as never)).toThrow(ValidationError);
  });
});
