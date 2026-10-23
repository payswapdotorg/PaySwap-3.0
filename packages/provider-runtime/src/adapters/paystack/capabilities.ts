/**
 * @payswap/provider-runtime — Paystack key capabilities → connection
 * scope mapping (P14-C, ADR-0008 D5).
 *
 * LAWS:
 * - FAIL-CLOSED SCOPE DERIVATION: the own-store use case grants read-only
 *   operation classes and observation-only effect classes. NO
 *   consequential grant can be derived from this slice — any attempt
 *   THROWS. Paystack has NO execution surface in this wave; when a
 *   Paystack execution lane is ordered it will need its own ADR
 *   amendment like ADR-0008 D2.
 * - KEY MODE LAW (INV-25): the Paystack secret-key PREFIX selects the
 *   mode (`sk_test_…` = test; `sk_live_…` = live — IDENTICAL in shape to
 *   Stripe's law, per ADR-0008 D5). A test key can never bind a LIVE
 *   runtime and a live key can never bind the SANDBOX test-mode slice —
 *   mismatch THROWS. Key MODE is not a UI choice.
 */

import { SandboxLiveBoundaryError, ValidationError } from '../../errors.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ConnectionScope, EffectClass, OperationClass } from '../../connection-scope.ts';

/** The Paystack secret-key prefixes and their execution mode. */
export const PAYSTACK_TEST_KEY_PREFIX = 'sk_test_' as const;
export const PAYSTACK_LIVE_KEY_PREFIX = 'sk_live_' as const;

/** The mode a Paystack secret-key prefix selects. */
export type PaystackKeyMode = 'test' | 'live';

/** The secret-shaped credential material the broker seals ({ apiKey }). */
export interface PaystackSecretKeyMaterial {
  readonly apiKey: string;
}

/** The data classes the read-only scope grants (provider-neutral). */
export const PAYSTACK_READ_ONLY_DATA_CLASSES = ['TRANSACTION_READ'] as const;

/** The operation classes the own-store use case grants (closed set). */
export const PAYSTACK_READ_ONLY_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
]);

/** The effect classes the own-store use case permits (never STATE_CHANGING). */
export const PAYSTACK_READ_ONLY_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
]);

/** The consequential operation classes this slice can NEVER grant. */
export const PAYSTACK_CONSEQUENTIAL_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'CREATE_EXTERNAL_EFFECT',
  'CANCEL_OR_REVERSE_EFFECT',
]);

/**
 * The mode a Paystack secret-key prefix selects, or null when the string
 * does not carry a canonical prefix (shape check only — this NEVER
 * validates the key against Paystack; the probe does that).
 */
export function paystackKeyMode(secretKey: string): PaystackKeyMode | null {
  if (typeof secretKey !== 'string' || secretKey.length === 0) {
    return null;
  }
  if (secretKey.startsWith(PAYSTACK_TEST_KEY_PREFIX)) {
    return 'test';
  }
  if (secretKey.startsWith(PAYSTACK_LIVE_KEY_PREFIX)) {
    return 'live';
  }
  return null;
}

/** Structural validation of the sealed material (never echoes the key). */
export function validatePaystackSecretKeyMaterial(material: unknown): PaystackSecretKeyMaterial {
  if (material === null || typeof material !== 'object' || Array.isArray(material)) {
    throw new ValidationError(
      'Paystack SCOPED_API_CREDENTIAL material must be an object with an apiKey field',
    );
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new ValidationError('Paystack credential material requires a non-empty apiKey');
  }
  if (paystackKeyMode(apiKey) === null) {
    // The message carries the SHAPE expectation, never the key material.
    throw new ValidationError(
      'the Paystack secret key does not carry a canonical prefix (sk_test_ for test mode; sk_live_ for live mode)',
      { keyMode: null },
    );
  }
  return material as PaystackSecretKeyMaterial;
}

/**
 * KEY MODE BINDING LAW: the runtime's declared execution mode must equal
 * the key prefix's mode (INV-25 mechanical separation).
 */
export function validatePaystackKeyModeBinding(
  apiKey: string,
  executionMode: ExecutionMode,
): void {
  const keyMode = paystackKeyMode(apiKey);
  if (keyMode === null) {
    throw new ValidationError('the Paystack secret key does not carry a canonical prefix');
  }
  const runtimeMode: PaystackKeyMode = executionMode === 'SANDBOX' ? 'test' : 'live';
  if (keyMode !== runtimeMode) {
    throw new SandboxLiveBoundaryError(
      `INV-25: a ${keyMode}-mode Paystack key cannot bind a ${executionMode} runtime (test keys serve SANDBOX; live keys serve LIVE)`,
      { keyMode, executionMode },
    );
  }
}

/** The connection scope the own-store use case grants (frozen, read-only). */
export function paystackReadOnlyScope(): ConnectionScope {
  return Object.freeze({
    allowedOperations: Object.freeze([...PAYSTACK_READ_ONLY_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...PAYSTACK_READ_ONLY_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...PAYSTACK_READ_ONLY_DATA_CLASSES]),
  });
}

/**
 * FAIL-CLOSED write-grant refusal: no code path may derive a consequential
 * operation class from the Paystack read-only slice (there is no Paystack
 * execution surface in this wave — ADR-0008 D5).
 */
export function refuseConsequentialPaystackGrant(operationClass: OperationClass): void {
  if (PAYSTACK_CONSEQUENTIAL_OPERATION_CLASSES.includes(operationClass)) {
    throw new ValidationError(
      'a Paystack read-only secret key carries no CREATE_EXTERNAL_EFFECT or CANCEL_OR_REVERSE_EFFECT grant (fail-closed; no Paystack execution surface exists in this wave)',
      { operationClass },
    );
  }
}

/**
 * The full scope-mapping fold for the own-store use case: validates the
 * material shape, enforces the key-mode binding, refuses any requested
 * consequential class, and returns the frozen read-only scope.
 */
export function paystackUseCaseScope(
  material: unknown,
  executionMode: ExecutionMode,
  requestedOperations: readonly OperationClass[] = PAYSTACK_READ_ONLY_OPERATION_CLASSES,
): ConnectionScope {
  const validated = validatePaystackSecretKeyMaterial(material);
  validatePaystackKeyModeBinding(validated.apiKey, executionMode);
  for (const requested of requestedOperations) {
    refuseConsequentialPaystackGrant(requested);
  }
  return paystackReadOnlyScope();
}
