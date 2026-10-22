/**
 * @payswap/provider-runtime — the Stripe read-only verification probe
 * (P13-B, ADR-0007 D1/D5).
 *
 * THE NEVER-ACTIVE LAW: this probe is the ONLY evidence path that can
 * carry a connection to ACTIVE — GET /v1/balance + GET /v1/account with
 * the sealed restricted key, through the real transport, INSIDE the
 * credential seal. A catalogue entry, an opened browser or a redirect
 * return is NEVER ACTIVE.
 *
 * THE SEAL PATTERN (credential-isolation.ts dispatch law): the probe is
 * the consumer that runs INSIDE broker.withMaterial — it receives the
 * sealed material, binds the Authorization header, dispatches, and returns
 * ONLY the clean provider evidence. Its own result is escape-scanned
 * (assertNoSecretMaterial) so no string of the material can leak through
 * the probe result — a leak THROWS, it is never silently sanitized.
 *
 * UNKNOWN is not FAILED (INV-04): a timeout/lost-connection/malformed
 * probe is UNKNOWN and reconciles by running the read-only probe again.
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode } from '../../execution-mode.ts';
import { validateTransportBinding } from '../../execution-mode.ts';
import type { TransportClass } from '../../execution-mode.ts';
import type { ProviderTransport, ProviderTransportResponse } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import type { AmbiguityReason, ProviderFailureMetadata } from '../../result-envelope.ts';
import {
  validateStripeKeyModeBinding,
  validateStripeRestrictedKeyMaterial,
} from './capabilities.ts';

/** The probe outcome (mirrors the result-envelope vocabulary, reused). */
export type StripeProbeOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

/** Provider rejection signals that mean the key itself is dead. */
const KEY_REJECTION_CODES = ['invalid_api_key', 'api_key_expired', 'key_revoked_by_operator'];

/** The typed, secret-free result of one verification probe run. */
export interface StripeProbeResult {
  readonly outcome: StripeProbeOutcomeKind;
  readonly executionMode: ExecutionMode;
  readonly transportClass: TransportClass;
  readonly transportId: string;
  /** Provider object references the probe read (account id first). */
  readonly providerReferences: readonly string[];
  /** The Stripe account id (acct_…) when the account read confirmed. */
  readonly accountRef: string | null;
  /** The provider-reported livemode flag when read (must match the mode). */
  readonly providerLiveMode: boolean | null;
  /** Present iff FAILED — provider failure metadata, never key material. */
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    /** True when the provider rejected the KEY itself (dead credential). */
    readonly keyRejected: boolean;
  };
  /** Present iff UNKNOWN (INV-04 — reconcile before anything else). */
  readonly ambiguityReason?: AmbiguityReason;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
}

/** The deps the probe needs (all injected; no ambient clock or fetch). */
export interface StripeVerificationProbeDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/**
 * Create the probe driver. The returned function is the consumer that
 * runs INSIDE the credential seal: `(material) => Promise<StripeProbeResult>`.
 * The transport binding law is enforced at construction (a LIVE runtime
 * never binds a FAKE_DETERMINISTIC transport).
 */
export function createStripeVerificationProbe(
  deps: StripeVerificationProbeDeps,
): (material: unknown) => Promise<StripeProbeResult> {
  validateTransportBinding(deps.executionMode, deps.transport.transportClass);
  return async (material: unknown): Promise<StripeProbeResult> => {
    const dispatchedAt = deps.clock.now();
    const validated = validateStripeRestrictedKeyMaterial(material);
    validateStripeKeyModeBinding(validated.apiKey, deps.executionMode);
    const secrets = secretStringsOf(material);

    const headers = { Authorization: `Bearer ${validated.apiKey}` };
    const balance = await deps.transport.send({
      operationId: 'stripe.balance.read',
      idempotencyKey: `probe:balance:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `stripe-probe-balance:${String(dispatchedAt)}`,
    });
    const balanceClass = classifyTransportOutcome(balance);
    if (balanceClass.outcome !== 'CONFIRMED') {
      return sealResult(
        finishUnconfirmed(balance, balanceClass, deps, dispatchedAt),
        secrets,
      );
    }

    const account = await deps.transport.send({
      operationId: 'stripe.account.read',
      idempotencyKey: `probe:account:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `stripe-probe-account:${String(dispatchedAt)}`,
    });
    const accountClass = classifyTransportOutcome(account);
    if (accountClass.outcome !== 'CONFIRMED') {
      return sealResult(
        finishUnconfirmed(account, accountClass, deps, dispatchedAt),
        secrets,
      );
    }

    const accountBody = (account.body ?? {}) as { id?: unknown; livemode?: unknown };
    const accountRef = typeof accountBody.id === 'string' ? accountBody.id : null;
    const providerLiveMode = typeof accountBody.livemode === 'boolean' ? accountBody.livemode : null;
    if (accountRef === null) {
      // The provider answered 2xx without an account id: uninterpretable
      // evidence is UNKNOWN, never a fabricated CONFIRMED.
      return sealResult(
        buildResult(
          {
            outcome: 'UNKNOWN',
            ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH',
          },
          deps,
          dispatchedAt,
        ),
        secrets,
      );
    }
    if (providerLiveMode !== null && providerLiveMode !== (deps.executionMode === 'LIVE')) {
      return sealResult(
        buildResult(
          {
            outcome: 'FAILED',
            failure: {
              code: 'STRIPE_LIVE_MODE_MISMATCH',
              message:
                'the provider-reported live/test mode does not match the runtime execution mode (INV-25 separation)',
              retryable: false,
              keyRejected: false,
            },
          },
          deps,
          dispatchedAt,
        ),
        secrets,
      );
    }
    return sealResult(
      buildResult(
        {
          outcome: 'CONFIRMED',
          accountRef,
          providerLiveMode,
          providerReferences: [accountRef, 'balance'],
        },
        deps,
        dispatchedAt,
      ),
      secrets,
    );
  };
}

/** Assemble the result record (single construction path). */
function buildResult(
  parts: {
    readonly outcome: StripeProbeOutcomeKind;
    readonly accountRef?: string | null;
    readonly providerLiveMode?: boolean | null;
    readonly providerReferences?: readonly string[];
    readonly failure?: StripeProbeResult['failure'];
    readonly ambiguityReason?: AmbiguityReason;
  },
  deps: StripeVerificationProbeDeps,
  dispatchedAt: TimestampMs,
): StripeProbeResult {
  const result: {
    -readonly [K in keyof StripeProbeResult]: StripeProbeResult[K];
  } = {
    outcome: parts.outcome,
    executionMode: deps.executionMode,
    transportClass: deps.transport.transportClass,
    transportId: deps.transport.transportId,
    providerReferences: Object.freeze([...(parts.providerReferences ?? [])]),
    accountRef: parts.accountRef ?? null,
    providerLiveMode: parts.providerLiveMode ?? null,
    dispatchedAt,
    completedAt: deps.clock.now(),
  };
  if (parts.failure !== undefined) {
    result.failure = Object.freeze({ ...parts.failure });
  }
  if (parts.ambiguityReason !== undefined) {
    result.ambiguityReason = parts.ambiguityReason;
  }
  return Object.freeze(result);
}

/**
 * Classify a non-CONFIRMED transport answer into the probe result.
 * Fail-closed: a CONFIRMED classification can never reach here (the caller
 * branches on it first) — receiving one is a construction defect.
 */
function finishUnconfirmed(
  response: ProviderTransportResponse,
  classification: {
    readonly outcome: StripeProbeOutcomeKind;
    readonly ambiguityReason?: AmbiguityReason;
    readonly failure?: ProviderFailureMetadata;
  },
  deps: StripeVerificationProbeDeps,
  dispatchedAt: TimestampMs,
): StripeProbeResult {
  if (classification.outcome === 'CONFIRMED') {
    throw new ValidationError(
      'a CONFIRMED transport answer must be handled by the probe, never by the unconfirmed path',
    );
  }
  if (classification.outcome === 'UNKNOWN') {
    if (classification.ambiguityReason === undefined) {
      throw new ValidationError('an UNKNOWN probe requires a canonical ambiguity reason');
    }
    return buildResult(
      { outcome: 'UNKNOWN', ambiguityReason: classification.ambiguityReason },
      deps,
      dispatchedAt,
    );
  }
  const failure = classification.failure;
  const code = failure?.providerErrorCode ?? 'PROBE_FAILED';
  const status = response.delivered ? (response.status ?? 0) : 0;
  // Key-death detection: 401, or a provider code naming the key itself.
  // The MESSAGE is deliberately NOT the provider's verbatim text when the
  // key is rejected (Stripe error text can echo key fragments).
  const keyRejected =
    status === 401 || KEY_REJECTION_CODES.includes(code);
  return buildResult(
    {
      outcome: 'FAILED',
      failure: {
        code,
        message: keyRejected
          ? 'the provider rejected the credential as invalid or expired'
          : (failure?.providerErrorMessage ?? 'the provider answered with an error status'),
        retryable: failure?.retryable ?? false,
        keyRejected,
      },
    },
    deps,
    dispatchedAt,
  );
}

/** The escape-scan gate: the probe result may never carry key material. */
function sealResult(
  result: StripeProbeResult,
  secrets: readonly string[],
): StripeProbeResult {
  assertNoSecretMaterial(result, secrets, 'stripe verification probe result');
  return result;
}
