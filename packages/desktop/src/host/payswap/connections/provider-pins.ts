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
    "a registered Stripe platform client_id (the operator's Stripe platform app)",
    "the platform client_secret delivered through the host secret channel",
    "a registered redirect URI carrying zcode://provider/callback",
  ]);

/** Mirrors STRIPE_U3_MISSING_OPERATOR_CONFIGURATION (verbatim honesty). */
export const PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION: readonly string[] =
  Object.freeze([
    "platform credentials for connected-account creation",
    "a publicly reachable webhook endpoint with its signing secret",
    "the operator's Connect country/fees configuration",
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
      executionModes: Object.freeze(["SANDBOX" as const, "LIVE" as const]),
      summary:
        "Delegate scoped PaySwap access to an existing Stripe account through Stripe OAuth. Requires operator platform registration that does not exist in this deployment — the exact missing configuration is stated, never simulated.",
    }),
    Object.freeze({
      useCaseRef: "marketplace-connected-account",
      form: "CONNECTED_ACCOUNT" as const,
      status: "UNCONFIGURED" as const,
      missingOperatorConfiguration: PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION,
      authMechanism: "connect-account-links-hosted-onboarding",
      credentialKind: "PROVIDER_DEFINED" as const,
      executionModes: Object.freeze(["SANDBOX" as const, "LIVE" as const]),
      summary:
        "Onboard sellers as Stripe Connect accounts (Account Links hosted onboarding). Requires platform credentials and a webhook endpoint that do not exist in this deployment — the exact missing configuration is stated, never simulated.",
    }),
  ]),
});

/** The canonical desktop registry view: Stripe is the one declared provider. */
export const PINNED_PAYMENT_PROVIDER_REGISTRY: readonly [
  typeof PINNED_STRIPE_REGISTRY_ENTRY,
] = Object.freeze([PINNED_STRIPE_REGISTRY_ENTRY]);
