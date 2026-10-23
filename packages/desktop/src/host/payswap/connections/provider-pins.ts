/**
 * PaySwap Desktop (P13-B) — structural pins of the
 * @payswap/provider-runtime connection vocabularies and the Stripe
 * registry DATA (mirrors packages/provider-runtime/src/
 * {connection-forms,connection-lifecycle,execution-mode}.ts and
 * packages/provider-runtime/src/adapters/stripe/declaration.ts at the
 * P13 base commit; pin provider.connection).
 *
 * PIN LAW: shapes and closed vocabularies mirror the accepted contract
 * EXACTLY — the desktop authority re-derives nothing and invents
 * nothing. Guards are structural only; the mirrored package owns the
 * semantics (scope admission, broker isolation, probe evidence) and the
 * desktop NEVER re-implements those engines — it composes the mirrored
 * vocabulary into host-owned connection records.
 *
 * WHY PINS (not a dependency): the desktop host tsconfig EMITS
 * (tsconfig.host.json) and therefore cannot import the provider-runtime
 * source's .ts-suffixed modules (allowImportingTsExtensions is
 * noEmit-only). The by-value mirror is the established discipline
 * (surface-pins / lifecycle-pins / bridge-pins precedent).
 */

import type { DesktopPinProvenance } from "../pins/pin-registry.js";
import { DESKTOP_PIN_PROVENANCE } from "../pins/pin-registry.js";

/** The pin's provenance (provider.connection). */
export const PROVIDER_CONNECTION_PIN: DesktopPinProvenance = DESKTOP_PIN_PROVENANCE;

// ---------------------------------------------------------------------------
// Connection forms (mirrors connection-forms.ts)
// ---------------------------------------------------------------------------

/** Mirrors CONNECTION_FORMS. */
export const PINNED_CONNECTION_FORMS = [
  "DELEGATED_OAUTH",
  "CONNECTED_ACCOUNT",
  "SCOPED_API_CREDENTIAL",
  "ISOLATED_INTERACTIVE_BROWSER_SESSION",
  "PROVIDERLESS_RAIL",
] as const;

export type PinnedConnectionForm = (typeof PINNED_CONNECTION_FORMS)[number];

export function isPinnedConnectionForm(value: unknown): value is PinnedConnectionForm {
  return (
    typeof value === "string" &&
    (PINNED_CONNECTION_FORMS as readonly unknown[]).includes(value)
  );
}

/** Mirrors CREDENTIAL_KINDS. */
export const PINNED_CREDENTIAL_KINDS = [
  "OAUTH",
  "DELEGATED_TOKEN",
  "API_KEY",
  "SESSION",
  "PROVIDER_DEFINED",
] as const;

export type PinnedCredentialKind = (typeof PINNED_CREDENTIAL_KINDS)[number];

export function isPinnedCredentialKind(value: unknown): value is PinnedCredentialKind {
  return (
    typeof value === "string" &&
    (PINNED_CREDENTIAL_KINDS as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Execution modes (mirrors execution-mode.ts — INV-25 separation)
// ---------------------------------------------------------------------------

/** Mirrors ExecutionMode. */
export const PINNED_CONNECTION_EXECUTION_MODES = ["SANDBOX", "LIVE"] as const;

export type PinnedConnectionExecutionMode = (typeof PINNED_CONNECTION_EXECUTION_MODES)[number];

export function isPinnedConnectionExecutionMode(value: unknown): value is PinnedConnectionExecutionMode {
  return (
    typeof value === "string" &&
    (PINNED_CONNECTION_EXECUTION_MODES as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Connection lifecycle (mirrors connection-lifecycle.ts)
// ---------------------------------------------------------------------------

/** Mirrors CONNECTION_LIFECYCLE_STATES. */
export const PINNED_CONNECTION_LIFECYCLE_STATES = [
  "PROPOSED",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "DEGRADED",
  "SUSPENDED",
  "EXPIRED",
  "REVOKED",
  "DISCONNECTED",
] as const;

export type PinnedConnectionLifecycleState =
  (typeof PINNED_CONNECTION_LIFECYCLE_STATES)[number];

export function isPinnedConnectionLifecycleState(
  value: unknown,
): value is PinnedConnectionLifecycleState {
  return (
    typeof value === "string" &&
    (PINNED_CONNECTION_LIFECYCLE_STATES as readonly unknown[]).includes(value)
  );
}

/** Mirrors TERMINAL_CONNECTION_STATES (monotonic — no exits). */
export const PINNED_TERMINAL_CONNECTION_STATES: readonly PinnedConnectionLifecycleState[] =
  Object.freeze(["EXPIRED", "REVOKED", "DISCONNECTED"]);

/** Mirrors LAWFUL_TRANSITIONS (field-for-field). */
export const PINNED_LAWFUL_CONNECTION_TRANSITIONS: ReadonlyMap<
  PinnedConnectionLifecycleState,
  ReadonlySet<PinnedConnectionLifecycleState>
> = new Map<
  PinnedConnectionLifecycleState,
  ReadonlySet<PinnedConnectionLifecycleState>
>([
  ["PROPOSED", new Set(["PENDING_VERIFICATION", "DISCONNECTED"])],
  ["PENDING_VERIFICATION", new Set(["ACTIVE", "DISCONNECTED"])],
  ["ACTIVE", new Set(["DEGRADED", "SUSPENDED", "EXPIRED", "REVOKED", "DISCONNECTED"])],
  ["DEGRADED", new Set(["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED", "DISCONNECTED"])],
  ["SUSPENDED", new Set(["ACTIVE", "EXPIRED", "REVOKED", "DISCONNECTED"])],
  ["EXPIRED", new Set()],
  ["REVOKED", new Set()],
  ["DISCONNECTED", new Set()],
]);

export function isPinnedLawfulConnectionTransition(
  from: PinnedConnectionLifecycleState,
  to: PinnedConnectionLifecycleState,
): boolean {
  const exits = PINNED_LAWFUL_CONNECTION_TRANSITIONS.get(from);
  return exits !== undefined && exits.has(to);
}

// ---------------------------------------------------------------------------
// The Stripe registry DATA (mirrors adapters/stripe/declaration.ts)
// ---------------------------------------------------------------------------

/** Mirrors STRIPE_PROVIDER_ID. */
export const PINNED_STRIPE_PROVIDER_ID = "stripe" as const;

/** Mirrors STRIPE_U2_MISSING_OPERATOR_CONFIGURATION (verbatim honesty). */
export const PINNED_STRIPE_U2_MISSING_OPERATOR_CONFIGURATION: readonly string[] =
  Object.freeze([
    "Stripe platform client_id (a registered Stripe platform application owned by the operator)",
    "Stripe platform client_secret (delivered to the host through the operator secret channel, never chat)",
  ]);

/** Mirrors STRIPE_U3_MISSING_OPERATOR_CONFIGURATION (verbatim honesty). */
export const PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION: readonly string[] =
  Object.freeze([
    "Stripe platform credentials (client_id + client_secret for the Connect platform)",
    "A webhook endpoint registered with Stripe for connected-account events, delivered to the operator-run PaySwap backend",
  ]);

/** One provider form as the renderer renders it (mirrors the registry entry fields). */
export interface PinnedProviderFormEntry {
  readonly useCaseRef: string;
  readonly form: PinnedConnectionForm;
  readonly status: "CONFIGURED" | "UNCONFIGURED";
  readonly missingOperatorConfiguration: readonly string[];
  readonly authMechanism: string;
  readonly credentialKind: PinnedCredentialKind;
  readonly executionModes: readonly PinnedConnectionExecutionMode[];
  readonly summary: string;
}

/** Mirrors STRIPE_REGISTRY_ENTRY's catalogue fields (the renderer's data). */
export const PINNED_STRIPE_REGISTRY_ENTRY: {
  readonly providerId: typeof PINNED_STRIPE_PROVIDER_ID;
  readonly displayName: "Stripe";
  readonly summary: string;
  readonly forms: readonly PinnedProviderFormEntry[];
} = Object.freeze({
  providerId: PINNED_STRIPE_PROVIDER_ID,
  displayName: "Stripe",
  summary:
    "Card and bank payment acceptance. Three distinct onboarding mechanisms: a restricted API key for your own store (test mode live in this build), delegated OAuth for an existing account, and Stripe Connect for marketplace sellers.",
  forms: Object.freeze([
    Object.freeze({
      useCaseRef: "own-store-test-mode",
      form: "SCOPED_API_CREDENTIAL" as const,
      status: "CONFIGURED" as const,
      missingOperatorConfiguration: Object.freeze([]),
      authMechanism: "restricted-key-host-broker",
      credentialKind: "API_KEY" as const,
      executionModes: Object.freeze(["SANDBOX" as const]),
      summary:
        "Connect your own Stripe store in test mode with a restricted API key (read-only). The key enters through the host-side secret field once, is sealed, and the connection becomes ACTIVE only after the read-only verification probe answers through the real Stripe transport.",
    }),
    Object.freeze({
      useCaseRef: "existing-account-grant",
      form: "DELEGATED_OAUTH" as const,
      status: "UNCONFIGURED" as const,
      missingOperatorConfiguration: PINNED_STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
      authMechanism: "delegated-oauth-authorize-code",
      credentialKind: "OAUTH" as const,
      executionModes: Object.freeze(["SANDBOX" as const]),
      summary:
        "Delegate scoped PaySwap access to an existing Stripe account through Stripe OAuth. Requires operator platform registration that does not exist in this deployment — the exact missing configuration is stated, never simulated.",
    }),
    Object.freeze({
      useCaseRef: "marketplace-connected-accounts",
      form: "CONNECTED_ACCOUNT" as const,
      status: "UNCONFIGURED" as const,
      missingOperatorConfiguration: PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION,
      authMechanism: "connect-account-links-hosted-onboarding",
      credentialKind: "PROVIDER_DEFINED" as const,
      executionModes: Object.freeze(["SANDBOX" as const]),
      summary:
        "Onboard sellers as Stripe Connect accounts (Account Links hosted onboarding). Requires platform credentials and a webhook endpoint that do not exist in this deployment — the exact missing configuration is stated, never simulated.",
    }),
  ]),
});

// ---------------------------------------------------------------------------
// The Flutterwave registry DATA (mirrors adapters/flutterwave/declaration.ts)
// ---------------------------------------------------------------------------

/** Mirrors FLUTTERWAVE_PROVIDER_ID. */
export const PINNED_FLUTTERWAVE_PROVIDER_ID = "flutterwave" as const;

/** Mirrors FLUTTERWAVE_REGISTRY_ENTRY's catalogue fields (the renderer's data). */
export const PINNED_FLUTTERWAVE_REGISTRY_ENTRY: {
  readonly providerId: typeof PINNED_FLUTTERWAVE_PROVIDER_ID;
  readonly displayName: "Flutterwave";
  readonly summary: string;
  readonly forms: readonly PinnedProviderFormEntry[];
} = Object.freeze({
  providerId: PINNED_FLUTTERWAVE_PROVIDER_ID,
  displayName: "Flutterwave",
  summary:
    "Pan-African card, bank-transfer and mobile-money acceptance across NGN, KES, GHS and more. One onboarding mechanism in this build: your own store in test mode with a secret API key, sealed host-side and verified by a read-only balances probe.",
  forms: Object.freeze([
    Object.freeze({
      useCaseRef: "own-store-test-mode",
      form: "SCOPED_API_CREDENTIAL" as const,
      status: "CONFIGURED" as const,
      missingOperatorConfiguration: Object.freeze([]),
      authMechanism: "restricted-key-host-broker",
      credentialKind: "API_KEY" as const,
      executionModes: Object.freeze(["SANDBOX" as const]),
      summary:
        "Connect your own Flutterwave store in test mode with a secret API key (read-only). The key enters through the host-side secret field once, is sealed, and the connection becomes ACTIVE only after the read-only balances probe answers through the real Flutterwave transport.",
    }),
  ]),
});

// ---------------------------------------------------------------------------
// The Paystack registry DATA (mirrors adapters/paystack/declaration.ts)
// ---------------------------------------------------------------------------

/** Mirrors PAYSTACK_PROVIDER_ID. */
export const PINNED_PAYSTACK_PROVIDER_ID = "paystack" as const;

/** Mirrors PAYSTACK_REGISTRY_ENTRY's catalogue fields (the renderer's data). */
export const PINNED_PAYSTACK_REGISTRY_ENTRY: {
  readonly providerId: typeof PINNED_PAYSTACK_PROVIDER_ID;
  readonly displayName: "Paystack";
  readonly summary: string;
  readonly forms: readonly PinnedProviderFormEntry[];
} = Object.freeze({
  providerId: PINNED_PAYSTACK_PROVIDER_ID,
  displayName: "Paystack",
  summary:
    "Nigerian and pan-African card, bank-transfer and mobile-money acceptance. One onboarding mechanism in this build: your own store in test mode with a secret API key, sealed host-side and verified by a read-only transactions probe.",
  forms: Object.freeze([
    Object.freeze({
      useCaseRef: "own-store-test-mode",
      form: "SCOPED_API_CREDENTIAL" as const,
      status: "CONFIGURED" as const,
      missingOperatorConfiguration: Object.freeze([]),
      authMechanism: "restricted-key-host-broker",
      credentialKind: "API_KEY" as const,
      executionModes: Object.freeze(["SANDBOX" as const]),
      summary:
        "Connect your own Paystack store in test mode with a secret API key (read-only). The key enters through the host-side secret field once, is sealed, and the connection becomes ACTIVE only after the read-only transactions probe answers through the real Paystack transport.",
    }),
  ]),
});

// ---------------------------------------------------------------------------
// The MTN MoMo registry DATA (mirrors adapters/mtn-momo/declaration.ts —
// the typed-prerequisite law: UNCONFIGURED with the EXACT missing items)
// ---------------------------------------------------------------------------

/** Mirrors MTN_MOMO_PROVIDER_ID. */
export const PINNED_MTN_MOMO_PROVIDER_ID = "mtn-momo" as const;

/** Mirrors MTN_MOMO_MISSING_OPERATOR_CONFIGURATION (verbatim honesty). */
export const PINNED_MTN_MOMO_MISSING_OPERATOR_CONFIGURATION: readonly string[] =
  Object.freeze([
    "A valid MTN MoMo Ocp-Apim-Subscription-Key for the sandbox product (the delivered key answers 401 \"invalid subscription key\" on the collection, disbursement and remittance token endpoints and on the apiuser provisioning read)",
    "A provisioned MTN MoMo API user (X-Reference-Id) for the target product",
    "The MTN MoMo API key issued for that API user (delivered through the operator secret channel, never chat)",
  ]);

/** Mirrors MTN_MOMO_REGISTRY_ENTRY's catalogue fields (the renderer's data). */
export const PINNED_MTN_MOMO_REGISTRY_ENTRY: {
  readonly providerId: typeof PINNED_MTN_MOMO_PROVIDER_ID;
  readonly displayName: "MTN MoMo";
  readonly summary: string;
  readonly forms: readonly PinnedProviderFormEntry[];
} = Object.freeze({
  providerId: PINNED_MTN_MOMO_PROVIDER_ID,
  displayName: "MTN MoMo",
  summary:
    "MTN Mobile Money collection for Ghana and other MTN markets. Not configurable in this deployment: the delivered sandbox credentials are rejected by every MoMo product endpoint — the exact missing configuration is stated, never simulated.",
  forms: Object.freeze([
    Object.freeze({
      useCaseRef: "own-collection-test-mode",
      form: "SCOPED_API_CREDENTIAL" as const,
      status: "UNCONFIGURED" as const,
      missingOperatorConfiguration: PINNED_MTN_MOMO_MISSING_OPERATOR_CONFIGURATION,
      authMechanism: "provider-defined-handshake",
      credentialKind: "API_KEY" as const,
      executionModes: Object.freeze(["SANDBOX" as const]),
      summary:
        "Collect payments into your own MTN Mobile Money merchant account (Ghana sandbox first). Requires a valid MoMo subscription key and a provisioned API user + API key — the delivered sandbox credentials are invalid (401 on every product endpoint), so the exact missing configuration is stated and nothing is simulated.",
    }),
  ]),
});

/** The canonical desktop registry view: the declared providers (P14-C). */
export const PINNED_PAYMENT_PROVIDER_REGISTRY: readonly [
  typeof PINNED_STRIPE_REGISTRY_ENTRY,
  typeof PINNED_FLUTTERWAVE_REGISTRY_ENTRY,
  typeof PINNED_PAYSTACK_REGISTRY_ENTRY,
  typeof PINNED_MTN_MOMO_REGISTRY_ENTRY,
] = Object.freeze([
  PINNED_STRIPE_REGISTRY_ENTRY,
  PINNED_FLUTTERWAVE_REGISTRY_ENTRY,
  PINNED_PAYSTACK_REGISTRY_ENTRY,
  PINNED_MTN_MOMO_REGISTRY_ENTRY,
]);
