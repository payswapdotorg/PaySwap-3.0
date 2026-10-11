/**
 * Deterministic in-memory fake transport for the P2-W2 battery.
 *
 * THE SANDBOX/LIVE LAW (INV-25): this transport declares
 * transportClass 'FAKE_DETERMINISTIC' — it CAN NEVER execute production
 * effects (it touches no network, no filesystem, no process boundaries;
 * every "provider answer" is a caller-scripted in-memory value) and a LIVE
 * runtime refuses to bind it mechanically (validateTransportBinding).
 *
 * ISOLATION PROOF SURFACE: the transport records each call's operationId,
 * idempotencyKey, idempotencyField, params and correlationId — and the
 * NAMES of the headers only. Header VALUES (which may carry credential
 * material) are NEVER recorded anywhere: the fake demonstrates by
 * construction that the transport edge can use secrets without any
 * artifact retaining them (INV-19).
 */

import type {
  ProviderTransport,
  ProviderTransportCall,
  ProviderTransportResponse,
} from '../src/transport.ts';
import {
  deliveredResponse,
  providerErrorResponse,
  undeliveredResponse,
} from '../src/transport.ts';

/** One scripted outcome for the next send(). */
export type ScriptStep =
  | { readonly kind: 'DELIVERED'; readonly status: number; readonly body: unknown }
  | {
      readonly kind: 'PROVIDER_ERROR';
      readonly status: number;
      readonly code: string;
      readonly message: string;
    }
  | { readonly kind: 'TIMEOUT' }
  | { readonly kind: 'CONNECTION_LOST' }
  | { readonly kind: 'MALFORMED' }
  | { readonly kind: 'REFUSED' };

/** The recorded (secret-free) view of one transport call. */
export interface RecordedCall {
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly idempotencyField?: string;
  readonly params: unknown;
  readonly correlationId: string;
  /** Header NAMES only — header VALUES are never recorded (INV-19). */
  readonly headerNames: readonly string[];
  /** True when an Authorization header was present (the seal was opened). */
  readonly authorizationHeaderPresent: boolean;
}

/** The deterministic fake provider transport. */
export class ScriptedFakeTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId: string;
  private readonly script: ScriptStep[] = [];
  private readonly calls: RecordedCall[] = [];
  private readonly deliveredBodies: unknown[] = [];

  constructor(transportId = 'fake-transport:test') {
    this.transportId = transportId;
  }

  /** Queue the next outcomes (in order). */
  scriptSteps(...steps: readonly ScriptStep[]): this {
    this.script.push(...steps);
    return this;
  }

  async send(call: ProviderTransportCall): Promise<ProviderTransportResponse> {
    const headerNames = Object.keys(call.headers).sort();
    const recorded: {
      -readonly [K in keyof RecordedCall]: RecordedCall[K];
    } = {
      operationId: call.operationId,
      idempotencyKey: call.idempotencyKey,
      params: call.params,
      correlationId: call.correlationId,
      headerNames: Object.freeze(headerNames),
      authorizationHeaderPresent: 'Authorization' in call.headers,
    };
    if (call.idempotencyField !== undefined) {
      recorded.idempotencyField = call.idempotencyField;
    }
    this.calls.push(Object.freeze(recorded));

    const step = this.script.shift();
    if (step === undefined) {
      // Fail-closed default: an unscripted call is a pre-dispatch refusal,
      // never an invented provider answer (INV-24 — no fabricated effects).
      return undeliveredResponse(
        'REFUSED_BEFORE_DISPATCH',
        'fake transport: no scripted outcome for this call',
      );
    }
    switch (step.kind) {
      case 'DELIVERED': {
        this.deliveredBodies.push(step.body);
        return deliveredResponse(step.status, step.body);
      }
      case 'PROVIDER_ERROR': {
        return providerErrorResponse(step.status, step.code, step.message);
      }
      case 'TIMEOUT': {
        return undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'fake transport: scripted timeout');
      }
      case 'CONNECTION_LOST': {
        return undeliveredResponse('CONNECTION_LOST_AFTER_DISPATCH', 'fake transport: scripted loss');
      }
      case 'MALFORMED': {
        return undeliveredResponse('MALFORMED_RESPONSE', 'fake transport: scripted malformed bytes');
      }
      case 'REFUSED': {
        return undeliveredResponse('REFUSED_BEFORE_DISPATCH', 'fake transport: scripted refusal');
      }
      default: {
        return undeliveredResponse('REFUSED_BEFORE_DISPATCH', 'unreachable script step');
      }
    }
  }

  /** The recorded calls (secret-free views). */
  recordedCalls(): readonly RecordedCall[] {
    return [...this.calls];
  }

  /** Bodies actually delivered by the provider script. */
  providerDeliveredBodies(): readonly unknown[] {
    return [...this.deliveredBodies];
  }

  get callCount(): number {
    return this.calls.length;
  }
}

/**
 * The deterministic fake webhook signature verifier (signatures stay
 * OPAQUE at this layer — the real cryptography belongs to the
 * platform/capability lane per P1-W3 finding F-2; this fake only decides
 * validity per the test's script).
 */
export class FakeSignatureVerifier {
  readonly verifierId = 'fake-verifier:test';
  private readonly invalidEventIds = new Set<string>();
  private readonly invalidSignatures = new Set<string>();

  verify(input: {
    readonly delivery: {
      readonly eventId: string;
      readonly signature: string;
    };
    readonly canonicalBody: string;
  }): { readonly valid: true } | { readonly valid: false; readonly reason: string } {
    if (this.invalidEventIds.has(input.delivery.eventId)) {
      return { valid: false, reason: 'SIGNATURE_INVALID' };
    }
    if (this.invalidSignatures.has(input.delivery.signature)) {
      return { valid: false, reason: 'SIGNATURE_INVALID' };
    }
    return { valid: true };
  }

  /** Mark an event id as signature-invalid (scripted attack). */
  rejectEventId(eventId: string): this {
    this.invalidEventIds.add(eventId);
    return this;
  }

  /** Mark a signature value as invalid (scripted forgery). */
  rejectSignature(signature: string): this {
    this.invalidSignatures.add(signature);
    return this;
  }
}
