/**
 * @payswap/provider-runtime — Stripe key capabilities → connection scope
 * mapping (P13-B, ADR-0007 D1/D5).
 *
 * LAWS:
 * - FAIL-CLOSED SCOPE DERIVATION: the U1 use case grants read-only
 *   operation classes (READ_PROVIDER_STATE / OBSERVE_EXTERNAL_FUNDS /
 *   MANAGE_CONNECTION) and observation-only effect classes. A restricted
 *   key without write scopes carries NO CREATE_EXTERNAL_EFFECT and NO
 *   CANCEL_OR_REVERSE_EFFECT — any attempt to derive a consequential
 *   grant from the read-only use case THROWS (never silently narrowed,
 *   never silently widened).
 * - KEY MODE LAW (INV-25): Stripe key PREFIXES select the mode
 *   (rk_test_/sk_test_ = test, rk_live_/sk_live_ = live). A test key can
 *   never bind a LIVE runtime and a live key can never bind the SANDBOX
 *   test-mode slice — mismatch THROWS. Key MODE is not a UI choice.
 * - Stripe restricted keys do not expose their permission set through the
 *   API; the scope here is the DECLARED use-case grant, and the read-only
 *   verification probe is the real-world evidence that the read paths
 *   work. Write flows are out of the P13-B slice and cannot be derived.
 */

import { SandboxLiveBoundaryError, ValidationError } from '../../errors.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import type { ConnectionScope, EffectClass, OperationClass } from '../../connection-scope.ts';

/** The Stripe key prefixes and their execution mode. */
export const STRIPE_TEST_KEY_PREFIXES = ['rk_test_', 'sk_test_'] as const;
export const STRIPE_LIVE_KEY_PREFIXES = ['rk_live_', 'sk_live_'] as const;

/** The mode a Stripe key prefix selects. */
export type StripeKeyMode = 'test' | 'live';

/** The secret-shaped credential material the U1 broker seals. */
export interface StripeRestrictedKeyMaterial {
  readonly apiKey: string;
}

/** The data classes the read-only U1 scope grants (provider-neutral). */
export const STRIPE_READ_ONLY_DATA_CLASSES = ['ACCOUNT_READ', 'BALANCE_READ'] as const;

/** The operation classes the U1 use case grants (explicit, closed set). */
export const STRIPE_READ_ONLY_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
]);

/** The effect classes the U1 use case permits (never STATE_CHANGING). */
export const STRIPE_READ_ONLY_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
]);

/** The consequential operation classes the U1 slice can NEVER grant. */
export const CONSEQUENTIAL_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'CREATE_EXTERNAL_EFFECT',
  'CANCEL_OR_REVERSE_EFFECT',
]);

/**
 * The mode a Stripe key prefix selects, or null when the string does not
 * carry a canonical Stripe key prefix (shape check only — this NEVER
 * validates the key against Stripe; the verification probe does that).
 */
export function stripeKeyMode(apiKey: string): StripeKeyMode | null {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return null;
  }
  if (STRIPE_TEST_KEY_PREFIXES.some((prefix) => apiKey.startsWith(prefix))) {
    return 'test';
  }
  if (STRIPE_LIVE_KEY_PREFIXES.some((prefix) => apiKey.startsWith(prefix))) {
    return 'live';
  }
  return null;
}

/** Structural validation of the sealed U1 material (never echoes the key). */
export function validateStripeRestrictedKeyMaterial(material: unknown): StripeRestrictedKeyMaterial {
  if (material === null || typeof material !== 'object' || Array.isArray(material)) {
    throw new ValidationError(
      'Stripe SCOPED_API_CREDENTIAL material must be an object with an apiKey field',
    );
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new ValidationError('Stripe credential material requires a non-empty apiKey');
  }
  if (stripeKeyMode(apiKey) === null) {
    // The message deliberately carries the SHAPE expectation and the
    // offending PREFIX class, never the key material itself.
    throw new ValidationError(
      'the Stripe apiKey does not carry a canonical key prefix (rk_test_/sk_test_ for test mode; rk_live_/sk_live_ for live mode)',
      { keyMode: null },
    );
  }
  return material as StripeRestrictedKeyMaterial;
}

/**
 * KEY MODE BINDING LAW: the runtime's declared execution mode must equal
 * the key prefix's mode. A test key never serves a LIVE runtime; a live
 * key never serves the SANDBOX test-mode slice (INV-25 mechanical
 * separation — a sandbox verification can never certify a live corridor).
 */
export function validateStripeKeyModeBinding(apiKey: string, executionMode: ExecutionMode): void {
  const keyMode = stripeKeyMode(apiKey);
  if (keyMode === null) {
    throw new ValidationError('the Stripe apiKey does not carry a canonical key prefix');
  }
  const runtimeMode: StripeKeyMode = executionMode === 'SANDBOX' ? 'test' : 'live';
  if (keyMode !== runtimeMode) {
    // The canonical INV-25 violation class (POLICY_BLOCKED) — a mode
    // mismatch is the sandbox/live mechanical-separation law, exactly what
    // SandboxLiveBoundaryError exists for (errors.ts taxonomy).
    throw new SandboxLiveBoundaryError(
      `INV-25: a ${keyMode}-mode Stripe key cannot bind a ${executionMode} runtime (test keys serve SANDBOX; live keys serve LIVE)`,
      { keyMode, executionMode },
    );
  }
}

/** The connection scope the U1 use case grants (frozen, read-only). */
export function stripeReadOnlyScope(): ConnectionScope {
  return Object.freeze({
    allowedOperations: Object.freeze([...STRIPE_READ_ONLY_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...STRIPE_READ_ONLY_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...STRIPE_READ_ONLY_DATA_CLASSES]),
  });
}

/**
 * FAIL-CLOSED write-grant refusal: no code path may derive a consequential
 * operation class from the U1 read-only use case. This function is the
 * named enforcement point (the boundary-test style guard callers lean on).
 */
export function refuseConsequentialStripeGrant(operationClass: OperationClass): void {
  if (CONSEQUENTIAL_OPERATION_CLASSES.includes(operationClass)) {
    throw new ValidationError(
      'a restricted read-only Stripe key carries no CREATE_EXTERNAL_EFFECT or CANCEL_OR_REVERSE_EFFECT grant (fail-closed; write flows are out of the P13-B slice)',
      { operationClass },
    );
  }
}

// ---------------------------------------------------------------------------
// The P14-A execution grant (ADR-0008 D2 — amends the P13-B read-only
// default for the FULL test-secret key class only, fail-closed).
// ---------------------------------------------------------------------------

/** The Stripe key classes (the prefix pairs select mode AND class). */
export const STRIPE_FULL_KEY_PREFIXES = ['sk_test_', 'sk_live_'] as const;
export const STRIPE_RESTRICTED_KEY_PREFIXES = ['rk_test_', 'rk_live_'] as const;

/** The key class a Stripe key prefix selects. */
export type StripeKeyClass = 'FULL_SECRET' | 'RESTRICTED';

/** The operation classes the SANDBOX execution grant carries (closed set). */
export const STRIPE_SANDBOX_EXECUTION_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
  'CREATE_EXTERNAL_EFFECT',
  'CANCEL_OR_REVERSE_EFFECT',
]);

/** The effect classes the SANDBOX execution grant permits. */
export const STRIPE_SANDBOX_EXECUTION_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
  'STATE_CHANGING',
]);

/** The key class a canonical Stripe key prefix selects, or null. */
export function stripeKeyClass(apiKey: string): StripeKeyClass | null {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return null;
  }
  if (STRIPE_FULL_KEY_PREFIXES.some((prefix) => apiKey.startsWith(prefix))) {
    return 'FULL_SECRET';
  }
  if (STRIPE_RESTRICTED_KEY_PREFIXES.some((prefix) => apiKey.startsWith(prefix))) {
    return 'RESTRICTED';
  }
  return null;
}

/**
 * THE EXECUTION GRANT DERIVATION (ADR-0008 D2):
 * - INV-25 first: the key mode must bind the runtime (test keys serve
 *   SANDBOX; live keys serve LIVE) — unchanged.
 * - This derivation is SANDBOX-ONLY by name and by law: any other
 *   execution mode is refused (a live corridor is never derived here).
 * - A FULL test secret key (sk_test_…) bound to a SANDBOX runtime may
 *   derive the SANDBOX execution grant — the write operation classes of
 *   the payment-intent surface.
 * - A RESTRICTED key (rk_…) NEVER derives an execution grant from the key
 *   alone: restricted-key grants derive ONLY from their DECLARED scopes
 *   (recorded at connection setup), and the P13-B read-only default +
 *   refuseConsequentialStripeGrant remain the enforcement points.
 */
export function deriveStripeSandboxExecutionGrant(
  apiKey: string,
  executionMode: ExecutionMode,
): ConnectionScope {
  if (executionMode !== 'SANDBOX') {
    throw new SandboxLiveBoundaryError(
      `INV-25: the execution grant derivation is SANDBOX-only (a live corridor is never derived in this deployment; got ${executionMode})`,
      { keyMode: stripeKeyMode(apiKey), executionMode },
    );
  }
  validateStripeKeyModeBinding(apiKey, executionMode);
  const keyClass = stripeKeyClass(apiKey);
  if (keyClass === null) {
    throw new ValidationError('the Stripe apiKey does not carry a canonical key prefix');
  }
  if (keyClass === 'RESTRICTED') {
    throw new ValidationError(
      'a RESTRICTED Stripe key never derives an execution grant from the key alone — restricted-key grants derive only from their DECLARED scopes (the P13-B read-only default and refuseConsequentialStripeGrant remain the enforcement points)',
      { keyClass },
    );
  }
  return Object.freeze({
    allowedOperations: Object.freeze([...STRIPE_SANDBOX_EXECUTION_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...STRIPE_SANDBOX_EXECUTION_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...STRIPE_READ_ONLY_DATA_CLASSES, 'PAYMENT_INTENT_WRITE']),
  });
}

/**
 * The full scope-mapping fold for the U1 use case: validates the material
 * shape, enforces the key-mode binding, refuses any requested consequential
 * class, and returns the frozen read-only scope. This is the ONLY scope the
 * U1 connection can carry in this slice.
 */
export function stripeUseCaseScope(
  material: unknown,
  executionMode: ExecutionMode,
  requestedOperations: readonly OperationClass[] = STRIPE_READ_ONLY_OPERATION_CLASSES,
): ConnectionScope {
  const validated = validateStripeRestrictedKeyMaterial(material);
  validateStripeKeyModeBinding(validated.apiKey, executionMode);
  for (const requested of requestedOperations) {
    refuseConsequentialStripeGrant(requested);
  }
  return stripeReadOnlyScope();
}
