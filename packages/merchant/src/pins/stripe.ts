/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the Stripe PSP surface
 * (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — the old payswap.org Stripe rail /
 * PSP-connector evidence (packages/rails/src/stripe.ts and
 * packages/adapters/src/credential-broker.ts @ 8a735bf; probe record
 * spec/development-state/provider-probes-20261002.json). The pins are
 * BYTE-VERIFIED against that evidence (values, path strings, status
 * mapping rows, idempotency-key derivation and key-kind patterns —
 * asserted by test/stripe-paths.test.ts).
 *
 * THE NO-NETWORK LAW (pinned as the port's own type): NO Stripe network
 * call exists in this package. The typed `PinnedStripePspContract`
 * below is the CONTRACT SURFACE the provider runtime implements; this
 * package only constructs typed request descriptors (pure data) and
 * consumes typed response evidence. Credentials NEVER appear in any
 * artifact of this package (the secret-detector law in src/secrets.ts
 * rejects sk_/rk_ live and test key shapes everywhere; the lawful
 * reference is the opaque credential-ref pin).
 */

// ---------------------------------------------------------------------------
// The provider identity + wire constants (byte-verified vs old rails)
// ---------------------------------------------------------------------------

/** VALUE PIN — authority: old rails `STRIPE_PROVIDER_NAME` (byte-identical). */
export const PINNED_STRIPE_PROVIDER_NAME = "stripe" as const;

/** VALUE PIN — authority: old rails `STRIPE_API_VERSION` (byte-identical). */
export const PINNED_STRIPE_API_VERSION = "2025-08-27.basil" as const;

/** VALUE PIN — authority: old rails `STRIPE_DEFAULT_API_BASE` (byte-identical). */
export const PINNED_STRIPE_DEFAULT_API_BASE = "https://api.stripe.com" as const;

/** VALUE PIN — authority: old rails `STRIPE_RAIL_ADAPTER_ID` (byte-identical). */
export const PINNED_STRIPE_RAIL_ADAPTER_ID = "rail.stripe" as const;

/**
 * VALUE PIN — authority: old rails `STRIPE_CREDENTIAL_CONFIG_KEY`
 * derivation: the control-plane credential configuration key
 * `PROVIDER_STRIPE_CREDENTIAL_REF` (vault-backed reference — never key
 * material in artifacts).
 */
export const PINNED_STRIPE_CREDENTIAL_REF_KEY = "PROVIDER_STRIPE_CREDENTIAL_REF" as const;

// ---------------------------------------------------------------------------
// Resource paths (byte-verified vs the old rail's provider calls)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the old Stripe rail's resource paths
 * (byte-identical path shapes). MERCHANT-RELEVANT SURFACE ONLY: the
 * account/balance observation paths, the PaymentIntent CRUD paths
 * (create / confirm / capture / cancel), refunds, disputes, payouts,
 * charges and balance transactions. A path template's `{id}` segment
 * is the provider object id (percent-encoded by the rail — never
 * interpolated here).
 */
export const PINNED_STRIPE_RESOURCE_PATHS = Object.freeze({
  account: "/v1/account",
  balance: "/v1/balance",
  payouts: "/v1/payouts",
  charges: "/v1/charges",
  paymentIntents: "/v1/payment_intents",
  paymentIntentConfirm: "/v1/payment_intents/{id}/confirm",
  paymentIntentCapture: "/v1/payment_intents/{id}/capture",
  paymentIntentCancel: "/v1/payment_intents/{id}/cancel",
  refunds: "/v1/refunds",
  disputes: "/v1/disputes",
  subscriptions: "/v1/subscriptions",
  balanceTransactions: "/v1/balance_transactions",
} as const);

/** STRUCTURAL PIN — one pinned resource path template. */
export type PinnedStripeResourcePath = (typeof PINNED_STRIPE_RESOURCE_PATHS)[keyof typeof PINNED_STRIPE_RESOURCE_PATHS];

// ---------------------------------------------------------------------------
// The PaymentIntent provider-state mapping (byte-verified rows)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: old rails
 * `STRIPE_PAYMENT_INTENT_STATUS_MAPPING` (byte-identical rows — every
 * Stripe PaymentIntent status with its additive classification; the
 * provider-state vocabulary this surface maps). Exported as data so
 * the conformance surfaces can diff the mapping without reading any
 * implementation.
 */
export const PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING = Object.freeze([
  {
    providerState: "requires_payment_method",
    family: "other",
    lifecycleStep: "requires_payment_method",
    isTerminal: false,
    requiresCustomerAction: false,
  },
  {
    providerState: "requires_confirmation",
    family: "customer_action_required",
    lifecycleStep: "requires_confirmation",
    isTerminal: false,
    requiresCustomerAction: true,
  },
  {
    providerState: "requires_action",
    family: "customer_action_required",
    lifecycleStep: "requires_action",
    isTerminal: false,
    requiresCustomerAction: true,
  },
  {
    providerState: "processing",
    family: "async_processing",
    lifecycleStep: "processing",
    isTerminal: false,
    requiresCustomerAction: false,
  },
  {
    providerState: "requires_capture",
    family: "capture",
    lifecycleStep: "requires_capture",
    isTerminal: false,
    requiresCustomerAction: false,
  },
  {
    providerState: "succeeded",
    family: "other",
    lifecycleStep: "succeeded",
    isTerminal: true,
    requiresCustomerAction: false,
  },
  {
    providerState: "canceled",
    family: "other",
    lifecycleStep: "canceled",
    isTerminal: true,
    requiresCustomerAction: false,
  },
] as const);

/**
 * VALUE PIN — the terminal PaymentIntent provider states (derived from
 * the pinned mapping — `succeeded` and `canceled` only).
 */
export const PINNED_STRIPE_TERMINAL_PAYMENT_INTENT_STATES = Object.freeze(
  PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING.filter(
    (row) => row.isTerminal,
  ).map((row) => row.providerState),
);

/**
 * The pinned mapping law (pure projection over the pinned rows): the
 * classification of one provider state, or undefined when the state is
 * not declared by the mapping (an undeclared provider state is FOREIGN
 * — never guessed, never defaulted).
 */
export function pinnedStripePaymentIntentClassification(providerState: string):
  | {
      readonly family: string;
      readonly lifecycleStep: string;
      readonly isTerminal: boolean;
      readonly requiresCustomerAction: boolean;
    }
  | undefined {
  const row = PINNED_STRIPE_PAYMENT_INTENT_STATUS_MAPPING.find(
    (candidate) => candidate.providerState === providerState,
  );
  if (row === undefined) {
    return undefined;
  }
  return {
    family: row.family,
    lifecycleStep: row.lifecycleStep,
    isTerminal: row.isTerminal,
    requiresCustomerAction: row.requiresCustomerAction,
  };
}

// ---------------------------------------------------------------------------
// Idempotency (byte-verified derivation law)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: old rails `stripeIdempotencyKey` derivation
 * (byte-identical law): the Stripe Idempotency-Key header derived from
 * the protocol idempotency key, namespaced so a protocol key can never
 * collide with an unrelated provider-side key. Deterministic: the same
 * protocol key maps to the same header on every retry (INV-6).
 */
export function pinnedStripeIdempotencyKey(protocolIdempotencyKey: string): string {
  if (typeof protocolIdempotencyKey !== "string" || protocolIdempotencyKey.length === 0) {
    throw new Error(
      "pinnedStripeIdempotencyKey: a protocol idempotency key is required (INV-6)",
    );
  }
  return `payswap:${protocolIdempotencyKey}`;
}

// ---------------------------------------------------------------------------
// Key-kind vocabulary (byte-verified shapes — never literals in artifacts)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: old adapters/src/credential-broker.ts key
 * patterns (byte-identical regex bodies, structure only). The secret
 * key kinds (live + test) and restricted key kinds (live + test); the
 * publishable and webhook-secret kinds appear in the old banned-key
 * evidence. NO over-broad bearer pattern is pinned anywhere (the
 * accepted-kernel law): a 20-byte PUBLIC address or any other
 * non-secret hex-shaped value must never be flagged by these shapes.
 */
export const PINNED_STRIPE_KEY_KIND_PATTERNS = Object.freeze({
  liveSecretKey: /sk_live_[A-Za-z0-9]{16,}/,
  testSecretKey: /sk_test_[A-Za-z0-9]{16,}/,
  liveRestrictedKey: /rk_live_[A-Za-z0-9]{16,}/,
  testRestrictedKey: /rk_test_[A-Za-z0-9]{16,}/,
  livePublishableKey: /pk_live_[A-Za-z0-9]{16,}/,
  testPublishableKey: /pk_test_[A-Za-z0-9]{16,}/,
  webhookSigningSecret: /whsec_[A-Za-z0-9]{16,}/,
} as const);

/** STRUCTURAL PIN — the declared Stripe key kinds (never key material). */
export type PinnedStripeKeyKind =
  | "SECRET_KEY"
  | "RESTRICTED_KEY"
  | "PUBLISHABLE_KEY"
  | "WEBHOOK_SIGNING_SECRET";

/**
 * The pinned key-shape law (pure predicate, structure only — no
 * realistic literal ever appears in this source or its fixtures):
 * which declared kind a value's SHAPE matches, or undefined for a
 * non-key shape. The secret-detector (src/secrets.ts) consumes this
 * law to reject sk_/rk_ (and whsec_) key shapes wherever they appear.
 */
export function pinnedStripeKeyKindOf(value: string): PinnedStripeKeyKind | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const patterns = PINNED_STRIPE_KEY_KIND_PATTERNS;
  if (patterns.liveSecretKey.test(value) || patterns.testSecretKey.test(value)) {
    return "SECRET_KEY";
  }
  if (patterns.liveRestrictedKey.test(value) || patterns.testRestrictedKey.test(value)) {
    return "RESTRICTED_KEY";
  }
  if (patterns.livePublishableKey.test(value) || patterns.testPublishableKey.test(value)) {
    return "PUBLISHABLE_KEY";
  }
  if (patterns.webhookSigningSecret.test(value)) {
    return "WEBHOOK_SIGNING_SECRET";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The typed PSP contract surface (THE NO-NETWORK LAW)
// ---------------------------------------------------------------------------

/** The HTTP verbs the pinned Stripe surface declares. */
export const PINNED_STRIPE_HTTP_METHODS = Object.freeze([
  "GET",
  "POST",
] as const) as readonly ("GET" | "POST")[];

/**
 * STRUCTURAL PIN — a typed Stripe request DESCRIPTOR (pure data; never
 * executed here). The provider runtime receives descriptors of this
 * shape, binds the vault-backed credential reference and performs the
 * call. `idempotencyKey` is the protocol key (the rail derives the
 * header through the pinned law above); `body` is the typed request
 * body the runtime serializes.
 */
export interface PinnedStripeRequestDescriptor {
  readonly provider: typeof PINNED_STRIPE_PROVIDER_NAME;
  readonly method: (typeof PINNED_STRIPE_HTTP_METHODS)[number];
  readonly path: PinnedStripeResourcePath;
  /** The vault-backed credential reference (never key material). */
  readonly credentialRef: string;
  readonly idempotencyKey?: string;
  readonly body?: Readonly<Record<string, unknown>>;
}

/**
 * STRUCTURAL PIN — a typed Stripe response EVIDENCE record (pure data
 * consumed by the merchant surface): the HTTP status, the provider
 * request id, the idempotency-replayed marker and the raw JSON payload
 * preserved verbatim (INV-14 — the lossless provider-state record).
 * A response is EVIDENCE, never authority: the work-item machines
 * settle only from the attempt's own state.
 */
export interface PinnedStripeResponseEvidence {
  readonly httpStatus: number;
  readonly requestId: string;
  /** True iff the provider answered an idempotent REPLAY of the original request. */
  readonly idempotentReplay: boolean;
  /** Raw provider JSON payload, preserved verbatim. */
  readonly payload: unknown;
}

/**
 * The pinned no-network law (pure predicate): a descriptor must be
 * provider `stripe`, carry a declared method over a pinned resource
 * path, and reference credentials through the opaque ref (NEVER key
 * material). This package NEVER executes a descriptor — the provider
 * runtime does; the merchant surface only constructs and inspects them.
 */
export function pinnedStripeRequestDescriptorIsShaped(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedStripeRequestDescriptor>;
  if (record.provider !== PINNED_STRIPE_PROVIDER_NAME) {
    return false;
  }
  if (
    typeof record.method !== "string" ||
    !(PINNED_STRIPE_HTTP_METHODS as readonly string[]).includes(record.method)
  ) {
    return false;
  }
  const path = record.path;
  const declared = Object.values(PINNED_STRIPE_RESOURCE_PATHS) as readonly string[];
  if (typeof path !== "string" || !declared.includes(path)) {
    return false;
  }
  return typeof record.credentialRef === "string" && record.credentialRef.length > 0;
}
