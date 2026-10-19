/**
 * @payswap/merchant — the merchant Stripe paths (P5-W3, lane R3-W3;
 * NET-NEW module pinning the old rails/adapters Stripe surface EVIDENCE
 * @ 8a735bf into typed, BYTE-VERIFIED request descriptors).
 *
 * THE NO-NETWORK LAW: NO Stripe network call exists in this package.
 * This module constructs typed request DESCRIPTORS (pure data over the
 * pinned PSP surface — paths, idempotency-key derivation, provider
 * state mapping) and consumes typed response EVIDENCE. The provider
 * runtime executes descriptors against the real Stripe API; this
 * package never does. Credentials are referenced through the opaque
 * credential-ref pin — key material can never appear.
 */

import { ValidationError } from "./errors.ts";
import { StripeSurfaceError } from "./errors.ts";
import { canonicalDigest } from "./kernel.ts";
import {
  PINNED_STRIPE_API_VERSION,
  PINNED_STRIPE_CREDENTIAL_REF_KEY,
  PINNED_STRIPE_DEFAULT_API_BASE,
  PINNED_STRIPE_HTTP_METHODS,
  PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING,
  PINNED_STRIPE_PROVIDER_NAME,
  PINNED_STRIPE_RESOURCE_PATHS,
  PINNED_STRIPE_TERMINAL_PAYMENT_INTENT_STATES,
  pinnedStripeIdempotencyKey,
  pinnedStripePaymentIntentClassification,
  pinnedStripeRequestDescriptorIsShaped,
} from "./pins/stripe.ts";
import type {
  PinnedStripeRequestDescriptor,
  PinnedStripeResourcePath,
  PinnedStripeResponseEvidence,
} from "./pins/stripe.ts";
import { requireNonEmptyString } from "./secrets.ts";
import { assertNoSecretMaterial } from "./secrets.ts";

// ---------------------------------------------------------------------------
// The pinned surface (byte-verified re-exports for the merchant paths)
// ---------------------------------------------------------------------------

/** The pinned Stripe API base (byte-verified vs the old rails evidence). */
export const STRIPE_API_BASE = PINNED_STRIPE_DEFAULT_API_BASE;

/** The pinned Stripe API version (byte-verified vs the old rails evidence). */
export const STRIPE_API_VERSION = PINNED_STRIPE_API_VERSION;

/** The pinned Stripe provider name (byte-verified). */
export const STRIPE_PROVIDER = PINNED_STRIPE_PROVIDER_NAME;

/** The pinned credential-ref configuration key (vault-backed, never key material). */
export const STRIPE_CREDENTIAL_REF_KEY = PINNED_STRIPE_CREDENTIAL_REF_KEY;

/** The pinned merchant-relevant resource paths (byte-verified). */
export const STRIPE_RESOURCE_PATHS = PINNED_STRIPE_RESOURCE_PATHS;

/** The pinned terminal PaymentIntent provider states (derived from the pinned mapping). */
export const STRIPE_TERMINAL_PAYMENT_INTENT_STATES = PINNED_STRIPE_TERMINAL_PAYMENT_INTENT_STATES;

/** The pinned idempotency-key derivation (byte-verified: `payswap:<protocol key>`). */
export const stripeIdempotencyKey = pinnedStripeIdempotencyKey;

/**
 * Build a typed Stripe request descriptor for one merchant operation:
 * pure data (provider, method, pinned path, opaque credential
 * reference, protocol idempotency key, typed body). NO network I/O
 * happens here — the provider runtime executes descriptors.
 */
export function buildStripeRequestDescriptor(input: {
  readonly method: (typeof PINNED_STRIPE_HTTP_METHODS)[number];
  readonly path: PinnedStripeResourcePath;
  readonly credentialRef: string;
  readonly protocolIdempotencyKey?: string;
  readonly body?: Readonly<Record<string, unknown>>;
}): PinnedStripeRequestDescriptor {
  const method = input.method;
  if (
    typeof method !== "string" ||
    !(PINNED_STRIPE_HTTP_METHODS as readonly string[]).includes(method)
  ) {
    throw new StripeSurfaceError("a Stripe request descriptor requires a declared HTTP method");
  }
  const declaredPaths = Object.values(PINNED_STRIPE_RESOURCE_PATHS) as readonly string[];
  if (typeof input.path !== "string" || !declaredPaths.includes(input.path)) {
    throw new StripeSurfaceError(
      "a Stripe request descriptor must address a pinned resource path (the merchant-relevant surface only)",
      { path: input.path },
    );
  }
  const credentialRef = requireNonEmptyString(input.credentialRef, "credentialRef");
  if (input.protocolIdempotencyKey !== undefined) {
    requireNonEmptyString(input.protocolIdempotencyKey, "protocolIdempotencyKey");
  }
  if (input.body !== undefined) {
    if (input.body === null || typeof input.body !== "object" || Array.isArray(input.body)) {
      throw new StripeSurfaceError("a Stripe request body must be a plain object");
    }
  }
  const descriptor: PinnedStripeRequestDescriptor = Object.freeze({
    provider: PINNED_STRIPE_PROVIDER_NAME,
    method,
    path: input.path,
    credentialRef,
    ...(input.protocolIdempotencyKey !== undefined
      ? { idempotencyKey: input.protocolIdempotencyKey }
      : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
  });
  assertNoSecretMaterial(descriptor, "stripe request descriptor");
  return descriptor;
}

/** Fail-closed descriptor shape guard (the pinned no-network surface law). */
export function assertStripeRequestDescriptor(value: unknown): asserts value is PinnedStripeRequestDescriptor {
  if (!pinnedStripeRequestDescriptorIsShaped(value)) {
    throw new StripeSurfaceError(
      "a Stripe request descriptor must satisfy the pinned surface law: provider 'stripe', a declared method, a pinned resource path and an opaque credential reference",
    );
  }
}

/**
 * The deterministic idempotency HEADER VALUE the provider runtime will
 * send (derived through the pinned law; asserted byte-identical by the
 * stripe-paths tests). Pure derivation — no I/O.
 */
export function stripeIdempotencyHeaderValue(protocolIdempotencyKey: string): string {
  return pinnedStripeIdempotencyKey(protocolIdempotencyKey);
}

/**
 * The deterministic request identity of a descriptor: the canonical
 * digest over provider/method/path/idempotency key/body (content
 * binding for idempotent replays — binding, never security).
 */
export function stripeRequestIdentity(descriptor: PinnedStripeRequestDescriptor): string {
  assertStripeRequestDescriptor(descriptor);
  return canonicalDigest({
    provider: descriptor.provider,
    method: descriptor.method,
    path: descriptor.path,
    idempotencyKey: descriptor.idempotencyKey,
    body: descriptor.body,
  });
}

// ---------------------------------------------------------------------------
// Response evidence consumption (evidence, never authority)
// ---------------------------------------------------------------------------

/**
 * Classify a typed Stripe response's provider state through the pinned
 * PaymentIntent mapping: the classification (family, lifecycle step,
 * terminality, customer-action) or undefined when the state is
 * FOREIGN to the pinned mapping (never guessed, never defaulted).
 */
export function classifyStripePaymentIntentState(
  evidence: PinnedStripeResponseEvidence,
): { readonly providerState: string; readonly classification: ReturnType<typeof pinnedStripePaymentIntentClassification> } {
  if (evidence === null || typeof evidence !== "object") {
    throw new ValidationError("classifyStripePaymentIntentState requires response evidence");
  }
  if (typeof evidence.requestId !== "string" || evidence.requestId.length === 0) {
    throw new ValidationError("response evidence requires a provider request id");
  }
  const payload = evidence.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError(
      "a PaymentIntent classification requires an object payload (the raw provider JSON)",
    );
  }
  const status = (payload as Record<string, unknown>)["status"];
  if (typeof status !== "string" || status.length === 0) {
    throw new ValidationError("a PaymentIntent payload must carry a provider status");
  }
  return {
    providerState: status,
    classification: pinnedStripePaymentIntentClassification(status),
  };
}

/**
 * Whether the response evidence reports a terminal PaymentIntent
 * provider state per the pinned mapping (succeeded / canceled only).
 */
export function stripePaymentIntentIsTerminal(evidence: PinnedStripeResponseEvidence): boolean {
  const { providerState } = classifyStripePaymentIntentState(evidence);
  return (PINNED_STRIPE_TERMINAL_PAYMENT_INTENT_STATES as readonly string[]).includes(providerState);
}

/** The pinned PaymentIntent status mapping rows (byte-verified re-export). */
export const STRIPE_PAYMENT_INTENT_STATUS_MAPPING = PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING;
