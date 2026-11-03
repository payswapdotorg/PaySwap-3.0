/**
 * @payswap/provider-runtime — Paystack key capabilities → connection
 * scope mapping (P14-C, ADR-0008 D5; AMENDED by P22-H, ADR-0016 D8;
 * GROWN by P27-C, ADR-0020 D4 — the recipient + collection grants).
 *
 * LAWS:
 * - FAIL-CLOSED SCOPE DERIVATION: the own-store use case grants read-only
 *   operation classes and observation-only effect classes. NO consequential
 *   grant can be derived from the read-only slice — any attempt THROWS.
 *   The read-only slice's refusal law is UNCHANGED by the D8 amendment:
 *   the slice never grows a write class (the P27-C growth does not touch
 *   it either — D4: new operations never widen the read-only scope).
 * - THE PAYOUT LANE (ADR-0016 D8): a `sk_test_` secret key bound to a
 *   SANDBOX runtime may derive the SANDBOX PAYOUT GRANT (the transfer
 *   surface's CREATE_EXTERNAL_EFFECT — the corridor's KES off-ramp lane)
 *   through `derivePaystackSandboxPayoutGrant`, NEVER from the read-only
 *   slice. The payout derivation is separate from the use-case scope
 *   fold, exactly as Stripe's `deriveStripeSandboxExecutionGrant`
 *   (ADR-0008 D2) is separate from `refuseConsequentialStripeGrant`.
 *   `sk_live_` never derives a payout grant (refused at the seal verb
 *   AND at the derivation, INV-25 — this deployment is SANDBOX-only).
 * - THE RECIPIENT + COLLECTION LANES (ADR-0020 D4 — the P27-C growth):
 *   the SAME law, one derivation per product surface. Creating a
 *   transfer recipient (`derivePaystackSandboxRecipientGrant`) and
 *   initializing a collection request / hosted payment page
 *   (`derivePaystackSandboxCollectionGrant`) are each SEPARATE
 *   dispatch-time SANDBOX grants derived from the full test secret key
 *   inside the seal — never a connection-scope growth, never cached, and
 *   the read-only connection form's probe stays the only path to ACTIVE.
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

/** The consequential operation classes the read-only slice can NEVER grant. */
export const PAYSTACK_CONSEQUENTIAL_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'CREATE_EXTERNAL_EFFECT',
  'CANCEL_OR_REVERSE_EFFECT',
]);

// ---------------------------------------------------------------------------
// The P22-H payout grant (ADR-0016 D8 — the transfer surface's SANDBOX
// grant, derived from the FULL test secret key only, fail-closed).
// ---------------------------------------------------------------------------

/** The operation classes the SANDBOX payout grant carries (closed set). */
export const PAYSTACK_SANDBOX_PAYOUT_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
  'CREATE_EXTERNAL_EFFECT',
]);

/** The effect classes the SANDBOX payout grant permits. */
export const PAYSTACK_SANDBOX_PAYOUT_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
  'STATE_CHANGING',
]);

/** The data classes the SANDBOX payout grant carries (the transfer write). */
export const PAYSTACK_SANDBOX_PAYOUT_DATA_CLASSES = ['TRANSACTION_READ', 'TRANSFER_WRITE'] as const;

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

/** The connection scope the SANDBOX payout grant carries (frozen — ADR-0016 D8). */
export function paystackSandboxPayoutScope(): ConnectionScope {
  return Object.freeze({
    allowedOperations: Object.freeze([...PAYSTACK_SANDBOX_PAYOUT_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...PAYSTACK_SANDBOX_PAYOUT_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...PAYSTACK_SANDBOX_PAYOUT_DATA_CLASSES]),
  });
}

/**
 * FAIL-CLOSED write-grant refusal for the READ-ONLY SLICE: no code path
 * may derive a consequential operation class from the Paystack read-only
 * use-case slice. The D8 payout lane did NOT amend this law — the payout
 * grant derives ONLY through `derivePaystackSandboxPayoutGrant`, never
 * from the read-only slice (the Stripe refuse/derive split, ADR-0008 D2).
 */
export function refuseConsequentialPaystackGrant(operationClass: OperationClass): void {
  if (PAYSTACK_CONSEQUENTIAL_OPERATION_CLASSES.includes(operationClass)) {
    throw new ValidationError(
      'a Paystack read-only secret key carries no CREATE_EXTERNAL_EFFECT or CANCEL_OR_REVERSE_EFFECT grant (fail-closed; the payout grant derives only through the ADR-0016 D8 SANDBOX derivation, never from the read-only slice)',
      { operationClass },
    );
  }
}

/**
 * THE PAYOUT GRANT DERIVATION (ADR-0016 D8):
 * - SANDBOX-only by name and by law: any other execution mode is refused
 *   (a live payout lane is never derived in this deployment, INV-25);
 * - the key-mode binding runs first — an `sk_live_` key can never bind a
 *   SANDBOX runtime (refused at the seal verb AND here, INV-25);
 * - an `sk_test_` key bound to a SANDBOX runtime derives the payout
 *   grant: the transfer surface's CREATE_EXTERNAL_EFFECT (the corridor's
 *   KES off-ramp lane). CANCEL_OR_REVERSE_EFFECT is NOT granted — a
 *   Paystack transfer, once initiated, is not cancellable through this
 *   surface (the honest read-back/reconcile path is `transfer verify`).
 */
export function derivePaystackSandboxPayoutGrant(
  apiKey: string,
  executionMode: ExecutionMode,
): ConnectionScope {
  if (executionMode !== 'SANDBOX') {
    throw new SandboxLiveBoundaryError(
      `INV-25: the Paystack payout grant derivation is SANDBOX-only (a live payout lane is never derived in this deployment; got ${executionMode})`,
      { keyMode: paystackKeyMode(apiKey), executionMode },
    );
  }
  validatePaystackKeyModeBinding(apiKey, executionMode);
  return paystackSandboxPayoutScope();
}

/**
 * The full scope-mapping fold for the own-store use case: validates the
 * material shape, enforces the key-mode binding, refuses any requested
 * consequential class, and returns the frozen read-only scope. UNCHANGED
 * by the D8 amendment and by the P27-C growth — the use-case connection
 * scope stays read-only; the payout/recipient/collection grants are
 * dispatch-time derivations (the kernel), never a connection-scope growth.
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

// ---------------------------------------------------------------------------
// THE P27-C GRANTS (ADR-0020 D4): the recipient plane + the collection
// surface — each its OWN dispatch-time SANDBOX derivation, fail-closed,
// never cached, `sk_live_` refused at the derivation exactly like the
// payout grant. The read-only slice's refusal law is UNCHANGED above.
// ---------------------------------------------------------------------------

/** The operation classes the SANDBOX recipient grant carries (closed set). */
export const PAYSTACK_SANDBOX_RECIPIENT_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
  'CREATE_EXTERNAL_EFFECT',
]);

/** The effect classes the SANDBOX recipient grant permits. */
export const PAYSTACK_SANDBOX_RECIPIENT_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
  'STATE_CHANGING',
]);

/** The data classes the SANDBOX recipient grant carries (the recipient write). */
export const PAYSTACK_SANDBOX_RECIPIENT_DATA_CLASSES = ['TRANSACTION_READ', 'RECIPIENT_WRITE'] as const;

/** The connection scope the SANDBOX recipient grant carries (frozen). */
export function paystackSandboxRecipientScope(): ConnectionScope {
  return Object.freeze({
    allowedOperations: Object.freeze([...PAYSTACK_SANDBOX_RECIPIENT_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...PAYSTACK_SANDBOX_RECIPIENT_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...PAYSTACK_SANDBOX_RECIPIENT_DATA_CLASSES]),
  });
}

/**
 * THE RECIPIENT GRANT DERIVATION (ADR-0020 D4 — the P27-C plane):
 * SANDBOX-only by name and by law; the key-mode binding runs first (an
 * `sk_live_` key can never bind SANDBOX — INV-25); an `sk_test_` key
 * bound to a SANDBOX runtime derives the recipient-plane grant (the
 * transfer-recipient create/list surface's CREATE_EXTERNAL_EFFECT).
 * Re-derived at dispatch inside the seal on EVERY path — never cached.
 * CANCEL_OR_REVERSE_EFFECT is NOT granted (there is no documented
 * recipient-deletion lane in this slice; the honest read-back is the
 * list read).
 */
export function derivePaystackSandboxRecipientGrant(
  apiKey: string,
  executionMode: ExecutionMode,
): ConnectionScope {
  if (executionMode !== 'SANDBOX') {
    throw new SandboxLiveBoundaryError(
      `INV-25: the Paystack recipient grant derivation is SANDBOX-only (a live recipient lane is never derived in this deployment; got ${executionMode})`,
      { keyMode: paystackKeyMode(apiKey), executionMode },
    );
  }
  validatePaystackKeyModeBinding(apiKey, executionMode);
  return paystackSandboxRecipientScope();
}

/** The operation classes the SANDBOX collection grant carries (closed set). */
export const PAYSTACK_SANDBOX_COLLECTION_OPERATION_CLASSES: readonly OperationClass[] = Object.freeze([
  'READ_PROVIDER_STATE',
  'OBSERVE_EXTERNAL_FUNDS',
  'MANAGE_CONNECTION',
  'CREATE_EXTERNAL_EFFECT',
]);

/** The effect classes the SANDBOX collection grant permits. */
export const PAYSTACK_SANDBOX_COLLECTION_EFFECT_CLASSES: readonly EffectClass[] = Object.freeze([
  'NONE',
  'OBSERVATION_ONLY',
  'STATE_CHANGING',
]);

/** The data classes the SANDBOX collection grant carries (the collection write). */
export const PAYSTACK_SANDBOX_COLLECTION_DATA_CLASSES = ['TRANSACTION_READ', 'COLLECTION_WRITE'] as const;

/** The connection scope the SANDBOX collection grant carries (frozen). */
export function paystackSandboxCollectionScope(): ConnectionScope {
  return Object.freeze({
    allowedOperations: Object.freeze([...PAYSTACK_SANDBOX_COLLECTION_OPERATION_CLASSES]),
    allowedEffectClasses: Object.freeze([...PAYSTACK_SANDBOX_COLLECTION_EFFECT_CLASSES]),
    scopedCapabilities: Object.freeze([]),
    allowedDataClasses: Object.freeze([...PAYSTACK_SANDBOX_COLLECTION_DATA_CLASSES]),
  });
}

/**
 * THE COLLECTION GRANT DERIVATION (ADR-0020 D4 — the P27-C surface):
 * SANDBOX-only; key-mode binding first (INV-25); an `sk_test_` key bound
 * to a SANDBOX runtime derives the collection grant (the transaction-
 * initialize / hosted-payment-page surface's CREATE_EXTERNAL_EFFECT — a
 * payment REQUEST the customer must still authorize on the provider's
 * hosted page; it is never money movement by itself). Re-derived at
 * dispatch inside the seal on EVERY path — never cached.
 * CANCEL_OR_REVERSE_EFFECT is NOT granted (there is no documented
 * collection-void lane in this slice; the honest read-back is the
 * transaction verify read).
 */
export function derivePaystackSandboxCollectionGrant(
  apiKey: string,
  executionMode: ExecutionMode,
): ConnectionScope {
  if (executionMode !== 'SANDBOX') {
    throw new SandboxLiveBoundaryError(
      `INV-25: the Paystack collection grant derivation is SANDBOX-only (a live collection lane is never derived in this deployment; got ${executionMode})`,
      { keyMode: paystackKeyMode(apiKey), executionMode },
    );
  }
  validatePaystackKeyModeBinding(apiKey, executionMode);
  return paystackSandboxCollectionScope();
}
