/**
 * @payswap/provider-runtime — Flutterwave key capabilities → connection
 * scope mapping (P14-C, ADR-0008 D5).
 *
 * LAWS:
 * - FAIL-CLOSED SCOPE DERIVATION: the own-store use case grants read-only
 *   operation classes and observation-only effect classes. NO
 *   consequential grant can be derived from this slice — any attempt
 *   THROWS (never silently narrowed, never silently widened). Flutterwave
 *   has NO execution surface in this wave (the P14-A kernel is
 *   Stripe-only); when a FLW execution lane is ordered it will need its
 *   own ADR amendment like ADR-0008 D2.
 * - KEY MODE LAW (INV-25): the Flutterwave secret-key PREFIX selects the
 *   mode (`FLWSECK_TEST-…` = test; `FLWSECK-…` without the TEST segment =
 *   live). A test key can never bind a LIVE runtime and a live key can
 *   never bind the SANDBOX test-mode slice — mismatch THROWS. Key MODE is
 *   not a UI choice.
 * - The scope here is the DECLARED use-case grant; the read-only
 *   verification probe is the real-world evidence that the read paths
 *   work.
 */

import { SandboxLiveBoundaryError, ValidationError } from '../../errors.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ConnectionScope, EffectClass, OperationClass } from '../../connection-scope.ts';

/** The Flutterwave secret-key prefixes and their execution mode. */
export const FLUTTERWAVE_TEST_KEY_PREFIX = 'FLWSECK_TEST-' as const;
export const FLUTTERWAVE_LIVE_KEY_PREFIX = 'FLWSECK-' as const;

/** The mode a Flutterwave secret-key prefix selects. */
export type FlutterwaveKeyMode = 'test' | 'live';

/** The secret-shaped credential material the broker seals ({ apiKey }). */
export interface FlutterwaveSecretKeyMaterial {
  readonly apiKey: string;
}

/** The data classes the read-only scope grants (provider-neutral). */
export const FLUTTERWAVE_READ_ONLY_DATA_CLASSES = ['BALANCE_READ'] as const;

/** The operation classes the own-store use case grants (closed set). */
export const FLUTTERWAVE_READ_ONLY_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
]);

/** The effect classes the own-store use case permits (never STATE_CHANGING). */
export const FLUTTERWAVE_READ_ONLY_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
]);

/** The consequential operation classes this slice can NEVER grant. */
export const FLUTTERWAVE_CONSEQUENTIAL_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'CREATE_EXTERNAL_EFFECT',
  'CANCEL_OR_REVERSE_EFFECT',
]);

/**
 * The mode a Flutterwave secret-key prefix selects, or null when the
 * string does not carry a canonical prefix (shape check only — this
 * NEVER validates the key against Flutterwave; the probe does that).
 * NOTE: the live prefix is a PREFIX of the test prefix's family — the
 * test check must win, so `FLWSECK_TEST-…` is test, and `FLWSECK-…`
 * without the TEST segment is live.
 */
export function flutterwaveKeyMode(secretKey: string): FlutterwaveKeyMode | null {
  if (typeof secretKey !== 'string' || secretKey.length === 0) {
    return null;
  }
  if (secretKey.startsWith(FLUTTERWAVE_TEST_KEY_PREFIX)) {
    return 'test';
  }
  if (secretKey.startsWith(FLUTTERWAVE_LIVE_KEY_PREFIX)) {
    return 'live';
  }
  return null;
}

/** Structural validation of the sealed material (never echoes the key). */
export function validateFlutterwaveSecretKeyMaterial(
  material: unknown,
): FlutterwaveSecretKeyMaterial {
  if (material === null || typeof material !== 'object' || Array.isArray(material)) {
    throw new ValidationError(
      'Flutterwave SCOPED_API_CREDENTIAL material must be an object with an apiKey field',
    );
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new ValidationError('Flutterwave credential material requires a non-empty apiKey');
  }
  if (flutterwaveKeyMode(apiKey) === null) {
    // The message carries the SHAPE expectation, never the key material.
    throw new ValidationError(
      'the Flutterwave secret key does not carry a canonical prefix (FLWSECK_TEST- for test mode; FLWSECK- for live mode)',
      { keyMode: null },
    );
  }
  return material as FlutterwaveSecretKeyMaterial;
}

/**
 * KEY MODE BINDING LAW: the runtime's declared execution mode must equal
 * the key prefix's mode (INV-25 mechanical separation — a sandbox
 * verification can never certify a live corridor).
 */
export function validateFlutterwaveKeyModeBinding(
  apiKey: string,
  executionMode: ExecutionMode,
): void {
  const keyMode = flutterwaveKeyMode(apiKey);
  if (keyMode === null) {
    throw new ValidationError('the Flutterwave secret key does not carry a canonical prefix');
  }
  const runtimeMode: FlutterwaveKeyMode = executionMode === 'SANDBOX' ? 'test' : 'live';
  if (keyMode !== runtimeMode) {
    throw new SandboxLiveBoundaryError(
      `INV-25: a ${keyMode}-mode Flutterwave key cannot bind a ${executionMode} runtime (test keys serve SANDBOX; live keys serve LIVE)`,
      { keyMode, executionMode },
    );
  }
}

/** The connection scope the own-store use case grants (frozen, read-only). */
export function flutterwaveReadOnlyScope(): ConnectionScope {
  return Object.freeze({
    allowedOperations: Object.freeze([...FLUTTERWAVE_READ_ONLY_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...FLUTTERWAVE_READ_ONLY_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...FLUTTERWAVE_READ_ONLY_DATA_CLASSES]),
  });
}

/**
 * FAIL-CLOSED write-grant refusal: no code path may derive a consequential
 * operation class from the Flutterwave read-only slice (there is no FLW
 * execution surface in this wave — ADR-0008 D5).
 */
export function refuseConsequentialFlutterwaveGrant(operationClass: OperationClass): void {
  if (FLUTTERWAVE_CONSEQUENTIAL_OPERATION_CLASSES.includes(operationClass)) {
    throw new ValidationError(
      'a Flutterwave read-only secret key carries no CREATE_EXTERNAL_EFFECT or CANCEL_OR_REVERSE_EFFECT grant (fail-closed; no Flutterwave execution surface exists in this wave)',
      { operationClass },
    );
  }
}

/**
 * The full scope-mapping fold for the own-store use case: validates the
 * material shape, enforces the key-mode binding, refuses any requested
 * consequential class, and returns the frozen read-only scope.
 */
export function flutterwaveUseCaseScope(
  material: unknown,
  executionMode: ExecutionMode,
  requestedOperations: readonly OperationClass[] = FLUTTERWAVE_READ_ONLY_OPERATION_CLASSES,
): ConnectionScope {
  const validated = validateFlutterwaveSecretKeyMaterial(material);
  validateFlutterwaveKeyModeBinding(validated.apiKey, executionMode);
  for (const requested of requestedOperations) {
    refuseConsequentialFlutterwaveGrant(requested);
  }
  return flutterwaveReadOnlyScope();
}
