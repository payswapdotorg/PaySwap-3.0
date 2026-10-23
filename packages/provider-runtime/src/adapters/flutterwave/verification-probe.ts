/**
 * @payswap/provider-runtime — the Flutterwave read-only verification probe
 * (P14-C, ADR-0008 D5).
 *
 * THE NEVER-ACTIVE LAW: this probe is the ONLY evidence path that can
 * carry a Flutterwave connection to ACTIVE — GET /v3/balances with the
 * sealed secret key, through the real transport, INSIDE the credential
 * seal. A catalogue entry or a pasted key is NEVER ACTIVE.
 *
 * THE SEAL PATTERN (credential-isolation.ts dispatch law): the probe is
 * the consumer that runs INSIDE broker.withMaterial — it receives the
 * sealed material, binds the Authorization header, dispatches, and
 * returns ONLY the clean provider evidence (the currency wallets read).
 * Its own result is escape-scanned (assertNoSecretMaterial) so no string
 * of the material can leak through the probe result.
 *
 * UNKNOWN is not FAILED (INV-04): a timeout/lost-connection/malformed
 * probe is UNKNOWN and reconciles by running the read-only probe again.
 *
 * Flutterwave's /v3/balances answer shape: { status: 'success',
 * data: [{ currency, available_balance, ledger_balance }, …] } — the
 * currency wallets ARE the provider references this probe reports.
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial, secretStringsOf } from '../../redaction.ts';
import type { ExecutionMode, TransportClass } from '../../execution-mode.ts';
import { validateTransportBinding } from '../../execution-mode.ts';
import type { ProviderTransport, ProviderTransportResponse } from '../../transport.ts';
import { classifyTransportOutcome } from '../../result-envelope.ts';
import type { AmbiguityReason, ProviderFailureMetadata } from '../../result-envelope.ts';
import {
  validateFlutterwaveKeyModeBinding,
  validateFlutterwaveSecretKeyMaterial,
} from './capabilities.ts';

/** The probe outcome (mirrors the result-envelope vocabulary, reused). */
export type FlutterwaveProbeOutcomeKind = 'CONFIRMED' | 'UNKNOWN' | 'FAILED';

/** Provider rejection signals that mean the key itself is dead. */
const KEY_REJECTION_CODES = ['invalid_secret_key', 'authorization_error', 'key_revoked_by_operator'];

/** The typed, secret-free result of one verification probe run. */
export interface FlutterwaveProbeResult {
  readonly outcome: FlutterwaveProbeOutcomeKind;
  readonly executionMode: ExecutionMode;
  readonly transportClass: TransportClass;
  readonly transportId: string;
  /** The currency wallets the probe read (e.g. ['NGN','KES','GHS','USD']). */
  readonly providerReferences: readonly string[];
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
export interface FlutterwaveVerificationProbeDeps {
  readonly transport: ProviderTransport;
  readonly clock: RuntimeClock;
  readonly executionMode: ExecutionMode;
}

/**
 * Create the probe driver. The returned function is the consumer that
 * runs INSIDE the credential seal: `(material) => Promise<FlutterwaveProbeResult>`.
 */
export function createFlutterwaveVerificationProbe(
  deps: FlutterwaveVerificationProbeDeps,
): (material: unknown) => Promise<FlutterwaveProbeResult> {
  validateTransportBinding(deps.executionMode, deps.transport.transportClass);
  return async (material: unknown): Promise<FlutterwaveProbeResult> => {
    const dispatchedAt = deps.clock.now();
    const validated = validateFlutterwaveSecretKeyMaterial(material);
    validateFlutterwaveKeyModeBinding(validated.apiKey, deps.executionMode);
    const secrets = secretStringsOf(material);

    const headers = { Authorization: `Bearer ${validated.apiKey}` };
    const balances = await deps.transport.send({
      operationId: 'flutterwave.balances.read',
      idempotencyKey: `probe:balances:${String(dispatchedAt)}`,
      params: {},
      headers,
      correlationId: `flutterwave-probe-balances:${String(dispatchedAt)}`,
    });
    const classification = classifyTransportOutcome(balances);
    if (classification.outcome !== 'CONFIRMED') {
      return sealResult(finishUnconfirmed(balances, classification, deps, dispatchedAt), secrets);
    }

    const body = (balances.body ?? {}) as { status?: unknown; data?: unknown };
    const data = body.data;
    if (body.status !== 'success' || !Array.isArray(data)) {
      // The provider answered 2xx without the canonical balances shape:
      // uninterpretable evidence is UNKNOWN, never a fabricated CONFIRMED.
      return sealResult(
        buildResult({ outcome: 'UNKNOWN', ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH' }, deps, dispatchedAt),
        secrets,
      );
    }
    const currencies: string[] = [];
    for (const wallet of data) {
      if (wallet === null || typeof wallet !== 'object' || Array.isArray(wallet)) {
        continue;
      }
      const currency = (wallet as { currency?: unknown }).currency;
      if (typeof currency === 'string' && currency.length > 0 && !currencies.includes(currency)) {
        currencies.push(currency);
      }
    }
    if (currencies.length === 0) {
      return sealResult(
        buildResult({ outcome: 'UNKNOWN', ambiguityReason: 'MALFORMED_RESPONSE_AFTER_DISPATCH' }, deps, dispatchedAt),
        secrets,
      );
    }
    return sealResult(
      buildResult(
        { outcome: 'CONFIRMED', providerReferences: currencies },
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
    readonly outcome: FlutterwaveProbeOutcomeKind;
    readonly providerReferences?: readonly string[];
    readonly failure?: FlutterwaveProbeResult['failure'];
    readonly ambiguityReason?: AmbiguityReason;
  },
  deps: FlutterwaveVerificationProbeDeps,
  dispatchedAt: TimestampMs,
): FlutterwaveProbeResult {
  const result: {
    -readonly [K in keyof FlutterwaveProbeResult]: FlutterwaveProbeResult[K];
  } = {
    outcome: parts.outcome,
    executionMode: deps.executionMode,
    transportClass: deps.transport.transportClass,
    transportId: deps.transport.transportId,
    providerReferences: Object.freeze([...(parts.providerReferences ?? [])]),
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
 * Fail-closed: a CONFIRMED classification can never reach here.
 */
function finishUnconfirmed(
  response: ProviderTransportResponse,
  classification: {
    readonly outcome: FlutterwaveProbeOutcomeKind;
    readonly ambiguityReason?: AmbiguityReason;
    readonly failure?: ProviderFailureMetadata;
  },
  deps: FlutterwaveVerificationProbeDeps,
  dispatchedAt: TimestampMs,
): FlutterwaveProbeResult {
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
  // Key-death detection: 401 (Flutterwave's invalid-secret-key answer) or
  // a provider code naming the key itself. The MESSAGE is deliberately
  // NOT the provider's verbatim text when the key is rejected (provider
  // error text can echo key fragments).
  const keyRejected = status === 401 || KEY_REJECTION_CODES.includes(code);
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
  result: FlutterwaveProbeResult,
  secrets: readonly string[],
): FlutterwaveProbeResult {
  assertNoSecretMaterial(result, secrets, 'flutterwave verification probe result');
  return result;
}
