/**
 * @payswap/provider-runtime — payment-provider registry declarations (P13-B).
 *
 * The TYPED DATA contracts a payment-PSP registry entry declares (ADR-0007
 * D5): per provider + per form — the auth mechanism, credential kind,
 * scope requirements, account model, test/live support, the verification
 * probe contract, webhook needs, and revocation/retry rules.
 *
 * LAWS:
 * - TYPED DATA, no UI: this module declares shapes and validates them
 *   fail-closed; rendering belongs to the app lane.
 * - HONEST STATUS: a form whose mechanism requires operator-gated platform
 *   registration is declared UNCONFIGURED with the EXACT missing operator
 *   configuration items — never a dead button, never a simulated flow.
 * - FORM CONSISTENCY: every declared (form, credentialKind) pair must
 *   satisfy the canonical connection-forms consistency law (fail-closed
 *   at declaration-validation time).
 * - SANDBOX/LIVE (INV-25): test-mode support and live-mode support are
 *   declared per form; a sandbox verification never certifies a live
 *   corridor (the execution-mode law stays authoritative).
 * - NO NEW VOCABULARY: forms/credential kinds/operation classes reuse the
 *   canonical connection-forms/connection-scope vocabularies (single-line
 *   relative imports, the boundary law).
 */

import { ValidationError } from '../errors.ts';
import {
  validateFormCredentialConsistency,
  type ConnectionForm,
  type CredentialKind,
} from '../connection-forms.ts';
import {
  isOperationClass,
  isEffectClass,
  type EffectClass,
  type OperationClass,
} from '../connection-scope.ts';
import { isExecutionMode, type ExecutionMode } from '../execution-mode.ts';

/** Whether a declared form is actually configurable in this deployment. */
export const PAYMENT_PROVIDER_FORM_STATUSES = ['CONFIGURED', 'UNCONFIGURED'] as const;
export type PaymentProviderFormStatus = (typeof PAYMENT_PROVIDER_FORM_STATUSES)[number];

export function isPaymentProviderFormStatus(value: unknown): value is PaymentProviderFormStatus {
  return (
    typeof value === 'string' &&
    (PAYMENT_PROVIDER_FORM_STATUSES as readonly unknown[]).includes(value)
  );
}

/**
 * The auth mechanism a form uses (provider-facing vocabulary; the host-side
 * broker/session authority is the only driver of any of these).
 */
export const PAYMENT_PROVIDER_AUTH_MECHANISMS = [
  'restricted-key-host-broker',
  'delegated-oauth',
  'connected-account-links',
  'provider-defined-handshake',
] as const;
export type PaymentProviderAuthMechanism = (typeof PAYMENT_PROVIDER_AUTH_MECHANISMS)[number];

export function isPaymentProviderAuthMechanism(
  value: unknown,
): value is PaymentProviderAuthMechanism {
  return (
    typeof value === 'string' &&
    (PAYMENT_PROVIDER_AUTH_MECHANISMS as readonly unknown[]).includes(value)
  );
}

/** One read-only verification probe step (endpoint + declared effect class). */
export interface VerificationProbeStep {
  /** Operation id (transport-mapped; e.g. 'stripe.balance.read'). */
  readonly operationId: string;
  /** The provider endpoint the probe reads (evidence contract). */
  readonly endpoint: string;
  /** Read-only by construction: the probe NEVER carries STATE_CHANGING. */
  readonly effectClass: Extract<EffectClass, 'NONE' | 'OBSERVATION_ONLY'>;
}

/** The verification-probe contract a form declares (ADR-0007 D1/D5). */
export interface VerificationProbeContract {
  /** Ordered read-only steps; ALL must CONFIRM for the probe to pass. */
  readonly steps: readonly VerificationProbeStep[];
  /** Human-language statement of what the probe proves. */
  readonly proves: string;
}

/** How a form's credential can stop working, and what PaySwap does then. */
export interface RevocationRules {
  /** Provider-side signals that mean the credential is dead. */
  readonly providerRejectionSignals: readonly string[];
  /** The lifecycle cause recorded on provider-evidenced revocation. */
  readonly onProviderRejection: 'REVOKED_WITH_PROVIDER_EVIDENCE';
  /** Whether PaySwap can re-arm after a definitive rejection (it cannot). */
  readonly reArmsAfterRejection: false;
}

/** Retry rules for transient verification/operation failures. */
export interface RetryRules {
  /** Retryable transport failure positions. */
  readonly retryableFailures: readonly ('REFUSED_BEFORE_DISPATCH' | 'TIMEOUT_AFTER_DISPATCH')[];
  /**
   * UNKNOWN outcomes (INV-04): the record stays occupied and must be
   * reconciled with fresh provider evidence before any consequential retry.
   */
  readonly unknownRequiresReconciliation: true;
  /** Operator-visible guidance line (typed data, rendered by the app lane). */
  readonly guidance: string;
}

/** One declared connection form of one payment provider. */
export interface PaymentProviderFormDeclaration {
  /** The registry use case this form covers (e.g. 'own-store-test-mode'). */
  readonly useCaseRef: string;
  readonly form: ConnectionForm;
  readonly status: PaymentProviderFormStatus;
  readonly authMechanism: PaymentProviderAuthMechanism;
  readonly credentialKind: CredentialKind;
  /** Execution modes this form supports in THIS deployment. */
  readonly executionModes: readonly ExecutionMode[];
  /** Operation classes the form's scope requests (explicit grant only). */
  readonly requiredOperationClasses: readonly OperationClass[];
  /** Effect classes the form's operations may carry. */
  readonly allowedEffectClasses: readonly EffectClass[];
  /** How the provider models the account this connection binds to. */
  readonly accountModel: string;
  /** The read-only verification probe contract (never-ACTIVE law). */
  readonly verificationProbe: VerificationProbeContract;
  /** Whether webhooks are required for this form's slice. */
  readonly webhookRequirement: {
    readonly required: boolean;
    readonly reason: string;
  };
  readonly revocation: RevocationRules;
  readonly retry: RetryRules;
  /**
   * Present iff status is UNCONFIGURED: the EXACT missing operator
   * configuration items (machine-checkable honesty — never paraphrased).
   */
  readonly missingOperatorConfiguration?: readonly string[];
  /** People-language statement of what this form does (typed data). */
  readonly summary: string;
}

/** One payment provider's registry entry (typed data, no UI). */
export interface PaymentProviderRegistryEntry {
  readonly providerId: string;
  readonly displayName: string;
  readonly summary: string;
  readonly forms: readonly PaymentProviderFormDeclaration[];
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) {
    throw new ValidationError(`registry declaration ${field} must be a non-empty string`, {
      field,
    });
  }
}

/**
 * Fail-closed validation of ONE form declaration (the registry-authority
 * construction path; unknown providers/forms are refused by the consumer).
 */
export function validatePaymentProviderFormDeclaration(
  declaration: PaymentProviderFormDeclaration,
): void {
  if (declaration === null || typeof declaration !== 'object') {
    throw new ValidationError('a form declaration object is required');
  }
  requireNonEmptyString(declaration.useCaseRef, 'useCaseRef');
  requireNonEmptyString(declaration.accountModel, 'accountModel');
  requireNonEmptyString(declaration.summary, 'summary');
  if (!isPaymentProviderFormStatus(declaration.status)) {
    throw new ValidationError('form status must be canonical', { status: declaration.status });
  }
  if (!isPaymentProviderAuthMechanism(declaration.authMechanism)) {
    throw new ValidationError('form authMechanism must be canonical', {
      authMechanism: declaration.authMechanism,
    });
  }
  // Form × credential consistency (the connection-forms law, reused).
  validateFormCredentialConsistency(declaration.form, declaration.credentialKind);
  if (declaration.executionModes.length === 0) {
    throw new ValidationError('a form must declare at least one execution mode', {
      useCaseRef: declaration.useCaseRef,
    });
  }
  for (const mode of declaration.executionModes) {
    if (!isExecutionMode(mode)) {
      throw new ValidationError('form execution mode must be canonical', { mode });
    }
  }
  if (declaration.requiredOperationClasses.length === 0) {
    throw new ValidationError('a form must request at least one operation class', {
      useCaseRef: declaration.useCaseRef,
    });
  }
  for (const operation of declaration.requiredOperationClasses) {
    if (!isOperationClass(operation)) {
      throw new ValidationError('form required operation class must be canonical', { operation });
    }
  }
  for (const effect of declaration.allowedEffectClasses) {
    if (!isEffectClass(effect)) {
      throw new ValidationError('form allowed effect class must be canonical', { effect });
    }
  }
  const probe = declaration.verificationProbe;
  if (probe === null || typeof probe !== 'object' || probe.steps.length === 0) {
    throw new ValidationError('a form must declare a non-empty verification probe', {
      useCaseRef: declaration.useCaseRef,
    });
  }
  for (const step of probe.steps) {
    requireNonEmptyString(step.operationId, 'probe step operationId');
    requireNonEmptyString(step.endpoint, 'probe step endpoint');
    if (step.effectClass !== 'NONE' && step.effectClass !== 'OBSERVATION_ONLY') {
      throw new ValidationError('verification probe steps are read-only by construction', {
        operationId: step.operationId,
        effectClass: step.effectClass,
      });
    }
  }
  requireNonEmptyString(probe.proves, 'verificationProbe.proves');
  if (declaration.status === 'UNCONFIGURED') {
    if (
      !Array.isArray(declaration.missingOperatorConfiguration) ||
      declaration.missingOperatorConfiguration.length === 0
    ) {
      throw new ValidationError(
        'an UNCONFIGURED form must declare the EXACT missing operator configuration items',
        { useCaseRef: declaration.useCaseRef },
      );
    }
    for (const item of declaration.missingOperatorConfiguration) {
      requireNonEmptyString(item, 'missingOperatorConfiguration item');
    }
  }
  if (declaration.revocation.reArmsAfterRejection !== false) {
    throw new ValidationError('a provider-rejected credential never re-arms (monotonic law)');
  }
  if (declaration.retry.unknownRequiresReconciliation !== true) {
    throw new ValidationError('INV-04: UNKNOWN outcomes must reconcile before retry');
  }
}

/** Fail-closed validation of a whole registry entry. */
export function validatePaymentProviderRegistryEntry(
  entry: PaymentProviderRegistryEntry,
): void {
  if (entry === null || typeof entry !== 'object') {
    throw new ValidationError('a registry entry object is required');
  }
  requireNonEmptyString(entry.providerId, 'providerId');
  requireNonEmptyString(entry.displayName, 'displayName');
  requireNonEmptyString(entry.summary, 'summary');
  if (!Array.isArray(entry.forms) || entry.forms.length === 0) {
    throw new ValidationError('a registry entry must declare at least one form', {
      providerId: entry.providerId,
    });
  }
  const seenUseCases = new Set<string>();
  for (const form of entry.forms) {
    validatePaymentProviderFormDeclaration(form);
    if (seenUseCases.has(form.useCaseRef)) {
      throw new ValidationError('a provider cannot declare one use case twice', {
        providerId: entry.providerId,
        useCaseRef: form.useCaseRef,
      });
    }
    seenUseCases.add(form.useCaseRef);
  }
}

/** Look up one (provider, form) declaration (fail-closed on unknown ids). */
export function findPaymentProviderForm(
  registry: readonly PaymentProviderRegistryEntry[],
  providerId: string,
  form: ConnectionForm,
): {
  readonly entry: PaymentProviderRegistryEntry;
  readonly declaration: PaymentProviderFormDeclaration;
} {
  const entry = registry.find((candidate) => candidate.providerId === providerId);
  if (entry === undefined) {
    throw new ValidationError(`unknown payment provider '${providerId}'`);
  }
  const declaration = entry.forms.find((candidate) => candidate.form === form);
  if (declaration === undefined) {
    throw new ValidationError(`provider '${providerId}' does not declare form '${form}'`);
  }
  return { entry, declaration };
}
