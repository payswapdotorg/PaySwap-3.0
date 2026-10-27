/**
 * PaySwap Desktop (P21-A, ADR-0014 D5) — the host-probe CLASSIFICATION
 * CORE: the shared types, the INV-04 transport classification, the result
 * assembly and the credential key-class laws every host-side verification
 * probe rides (split from ./verification-probes.ts at the ≤400-line file
 * law; the per-provider probe factories live there).
 *
 * THE SEAL PATTERN (the credential-isolation dispatch law): each probe is
 * the consumer that runs INSIDE the broker's withMaterial — it receives
 * the sealed material, validates the key shape + the INV-25 mode binding,
 * binds the Authorization header, dispatches through the REAL transport,
 * and returns ONLY the clean provider evidence. The broker's own escape
 * scan guards the way out (a result carrying the secret THROWS —
 * fail-closed, never sanitized).
 *
 * THE NEVER-ACTIVE LAW: a probe is the ONLY evidence path that can carry a
 * connection to ACTIVE — a catalogue entry or a pasted key is NEVER
 * ACTIVE. UNKNOWN is not FAILED (INV-04): a timeout, a lost connection or
 * an uninterpretable body is UNKNOWN and reconciles by running the
 * read-only probe again.
 */

import type {
  ConnectionProbeKeyClass,
  PaySwapProbeProviderId,
} from "./probe-contracts.js";
import type { HostTransport, HostTransportResponse } from "./host-https-transports.js";

/** The probe outcome vocabulary (mirrors the result envelope, reused). */
export type HostProbeOutcomeKind = "CONFIRMED" | "UNKNOWN" | "FAILED";

/** The canonical ambiguity reasons (INV-04 — mirror of the envelope vocabulary). */
export type HostProbeAmbiguityReason =
  | "TRANSPORT_TIMEOUT_AFTER_DISPATCH"
  | "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH"
  | "MALFORMED_RESPONSE_AFTER_DISPATCH";

/** The typed, secret-free failure metadata (never key material). */
export interface HostProbeFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  /** True when the provider rejected the KEY itself (dead credential). */
  readonly keyRejected: boolean;
}

/** The typed, secret-free result of one host probe run. */
export interface HostProbeResult {
  readonly outcome: HostProbeOutcomeKind;
  readonly executionMode: string;
  readonly transportClass: "PRODUCTION_HTTP";
  readonly transportId: string;
  readonly providerReferences: readonly string[];
  readonly accountRef: string | null;
  readonly providerLiveMode: boolean | null;
  /** The credential CLASS observed inside the seal (structural, never secret). */
  readonly keyClass: ConnectionProbeKeyClass;
  /** The balance currencies read (the funding-source denominations). */
  readonly balanceCurrencies: readonly string[];
  readonly failure?: HostProbeFailure;
  readonly ambiguityReason?: HostProbeAmbiguityReason;
  readonly dispatchedAt: number;
  readonly completedAt: number;
}

/** The deps every probe needs (all injected; no ambient clock or fetch). */
export interface HostVerificationProbeDeps {
  readonly transport: HostTransport;
  readonly nowMs: () => number;
  readonly executionMode: "SANDBOX" | "LIVE";
}

/** The material shape every probe validates (never echoes it). */
export function apiKeyOf(material: unknown): string {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    throw new Error("the sealed credential material is malformed");
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("the sealed credential material carries no apiKey");
  }
  return apiKey;
}

/** The shared classification (mirrors classifyTransportOutcome — INV-04). */
export function classify(
  response: HostTransportResponse,
  keyRejectionCodes: readonly string[],
): {
  readonly outcome: HostProbeOutcomeKind;
  readonly ambiguityReason?: HostProbeAmbiguityReason;
  readonly failure?: HostProbeFailure;
} {
  if (response.delivered) {
    const status = response.status ?? 0;
    if (status >= 200 && status < 300) {
      return { outcome: "CONFIRMED" };
    }
    const code = response.providerErrorCode ?? `HTTP_${String(status)}`;
    // Key-death detection: 401, or a provider code naming the key itself.
    // The MESSAGE is deliberately NOT the provider's verbatim text when
    // the key is rejected (provider error text can echo key fragments).
    const keyRejected = status === 401 || keyRejectionCodes.includes(code);
    return {
      outcome: "FAILED",
      failure: {
        code,
        message: keyRejected
          ? "the provider rejected the credential as invalid or expired"
          : (response.providerErrorMessage ?? "the provider answered with an error status"),
        retryable: status >= 500,
        keyRejected,
      },
    };
  }
  const kind = response.failure?.kind;
  if (kind === "REFUSED_BEFORE_DISPATCH") {
    return {
      outcome: "FAILED",
      failure: {
        code: "NOT_DISPATCHED",
        message: response.failure?.detail ?? "the transport refused before dispatch",
        retryable: true,
        keyRejected: false,
      },
    };
  }
  if (kind === "TIMEOUT_AFTER_DISPATCH") {
    return { outcome: "UNKNOWN", ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" };
  }
  if (kind === "MALFORMED_RESPONSE") {
    return { outcome: "UNKNOWN", ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH" };
  }
  return { outcome: "UNKNOWN", ambiguityReason: "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH" };
}

/** Assemble the result record (single construction path). */
export function buildResult(
  parts: {
    readonly outcome: HostProbeOutcomeKind;
    readonly providerReferences?: readonly string[];
    readonly accountRef?: string | null;
    readonly providerLiveMode?: boolean | null;
    readonly keyClass: ConnectionProbeKeyClass;
    readonly balanceCurrencies?: readonly string[];
    readonly failure?: HostProbeFailure;
    readonly ambiguityReason?: HostProbeAmbiguityReason;
  },
  deps: HostVerificationProbeDeps,
  dispatchedAt: number,
): HostProbeResult {
  const result: {
    -readonly [K in keyof HostProbeResult]: HostProbeResult[K];
  } = {
    outcome: parts.outcome,
    executionMode: deps.executionMode,
    transportClass: deps.transport.transportClass,
    transportId: deps.transport.transportId,
    providerReferences: Object.freeze([...(parts.providerReferences ?? [])]),
    accountRef: parts.accountRef ?? null,
    providerLiveMode: parts.providerLiveMode ?? null,
    keyClass: parts.keyClass,
    balanceCurrencies: Object.freeze([...(parts.balanceCurrencies ?? [])]),
    dispatchedAt,
    completedAt: deps.nowMs(),
  };
  if (parts.failure !== undefined) {
    result.failure = Object.freeze({ ...parts.failure });
  }
  if (parts.ambiguityReason !== undefined) {
    result.ambiguityReason = parts.ambiguityReason;
  }
  return Object.freeze(result);
}

const STRIPE_KEY_REJECTION_CODES = ["invalid_api_key", "api_key_expired", "key_revoked_by_operator"];
const FLW_KEY_REJECTION_CODES = ["invalid_secret_key", "authorization_error", "key_revoked_by_operator"];
const PAYSTACK_KEY_REJECTION_CODES = ["invalid_secret_key", "invalid_key", "key_revoked_by_operator"];

/** The per-provider key-rejection code sets (exported for the probe factories). */
export const HOST_PROBE_KEY_REJECTION_CODES: Readonly<
  Record<PaySwapProbeProviderId, readonly string[]>
> = Object.freeze({
  stripe: STRIPE_KEY_REJECTION_CODES,
  flutterwave: FLW_KEY_REJECTION_CODES,
  paystack: PAYSTACK_KEY_REJECTION_CODES,
});

/** The Stripe key-class law (mirror of the canonical capabilities law). */
export function stripeKeyClassOf(apiKey: string, executionMode: string): ConnectionProbeKeyClass {
  if (executionMode !== "SANDBOX") {
    throw new Error(
      "INV-25: the verification probe is SANDBOX-only in this deployment (a live corridor is never derived here)",
    );
  }
  if (apiKey.startsWith("sk_live_") || apiKey.startsWith("rk_live_")) {
    throw new Error(
      "INV-25: a LIVE Stripe key cannot serve a SANDBOX verification probe (test keys serve SANDBOX; live keys serve LIVE)",
    );
  }
  if (apiKey.startsWith("rk_test_")) {
    return "RESTRICTED_TEST";
  }
  if (apiKey.startsWith("sk_test_")) {
    return "FULL_TEST";
  }
  throw new Error("the sealed Stripe key does not carry a canonical test-mode key prefix");
}

/** The Flutterwave key-class law (read-only by construction — F3). */
export function flutterwaveKeyClassOf(apiKey: string, executionMode: string): ConnectionProbeKeyClass {
  if (executionMode !== "SANDBOX") {
    throw new Error(
      "INV-25: the verification probe is SANDBOX-only in this deployment (a live corridor is never derived here)",
    );
  }
  if (!apiKey.startsWith("FLWSECK_TEST-")) {
    throw new Error(
      "the sealed Flutterwave key does not carry the canonical test-mode prefix (FLWSECK_TEST-…) — LIVE keys are refused: this deployment is SANDBOX-only (INV-25)",
    );
  }
  return "READ_ONLY_TEST";
}

/** The Paystack key-class law (read-only by construction). */
export function paystackKeyClassOf(apiKey: string, executionMode: string): ConnectionProbeKeyClass {
  if (executionMode !== "SANDBOX") {
    throw new Error(
      "INV-25: the verification probe is SANDBOX-only in this deployment (a live corridor is never derived here)",
    );
  }
  if (apiKey.startsWith("sk_live_")) {
    throw new Error(
      "INV-25: a LIVE Paystack key cannot serve a SANDBOX verification probe (test keys serve SANDBOX; live keys serve LIVE)",
    );
  }
  if (!apiKey.startsWith("sk_test_")) {
    throw new Error("the sealed Paystack key does not carry the canonical test-mode prefix (sk_test_…)");
  }
  return "READ_ONLY_TEST";
}
