/**
 * @payswap/app — STRUCTURAL PINS of the accepted @payswap/provider-runtime
 * CONNECTION vocabulary (P2-W2 ACCEPTED; P12 Lane C).
 *
 * Same layer law as ./surface-pins.ts + ./onchain-pins.ts: the substrate
 * mounts never import @payswap/*, so the connection vocabulary the
 * connections area renders is pinned STRUCTURALLY here (same literals,
 * same order) from:
 *
 * - packages/provider-runtime/src/connection-forms.ts — CREDENTIAL_KINDS,
 *   CONNECTION_FORMS, CONNECTION_FORM_PROFILES;
 * - packages/provider-runtime/src/connection-scope.ts — OPERATION_CLASSES,
 *   EFFECT_CLASSES;
 * - packages/provider-runtime/src/connection-lifecycle.ts —
 *   CONNECTION_LIFECYCLE_STATES, CONNECTION_TRANSITION_CAUSES;
 * - packages/provider-runtime/src/execution-mode.ts — the SANDBOX/LIVE
 *   execution-mode union (INV-25).
 *
 * PRODUCT LAW (C4, honest evidence only): a connection form is a
 * DECLARED capability shape — never a connected provider; the catalogue
 * is not a connection (INV-13). providerCount stays honestly 0 until a
 * real connection exists. The mirror is verified against the sources by
 * test/payswap/provider-connection-pins-mirror.test.ts.
 */

/* ====================================================================
 * connection-forms.ts pins
 * ==================================================================== */

/** The credential material kinds the broker can seal — same literals, same order. */
export const CREDENTIAL_KINDS_PIN = [
  "OAUTH",
  "DELEGATED_TOKEN",
  "API_KEY",
  "SESSION",
  "PROVIDER_DEFINED",
] as const;

export type CredentialKindPin = (typeof CREDENTIAL_KINDS_PIN)[number];

/** The five canonical connection forms — same literals, same order. */
export const CONNECTION_FORMS_PIN = [
  "DELEGATED_OAUTH",
  "CONNECTED_ACCOUNT",
  "SCOPED_API_CREDENTIAL",
  "ISOLATED_INTERACTIVE_BROWSER_SESSION",
  "PROVIDERLESS_RAIL",
] as const;

export type ConnectionFormPin = (typeof CONNECTION_FORMS_PIN)[number];

/**
 * The declared profile of one connection form (mirrors
 * ConnectionFormProfile field-for-field — declarative data, never
 * behavior).
 */
export interface ConnectionFormProfilePin {
  readonly form: ConnectionFormPin;
  /** Human-readable framing of the form for the catalogue surface. */
  readonly summary: string;
}

/** The catalogue rows the connections area renders (reference, not connections). */
export const CONNECTION_FORM_CATALOGUE_PIN: readonly ConnectionFormProfilePin[] = [
  {
    form: "DELEGATED_OAUTH",
    summary:
      "Delegated OAuth authorization — you approve a scoped grant at the provider; PaySwap never holds your password.",
  },
  {
    form: "CONNECTED_ACCOUNT",
    summary:
      "A connected provider account — account-level authorization established through the provider's own flow.",
  },
  {
    form: "SCOPED_API_CREDENTIAL",
    summary:
      "A scoped API credential — an explicit key sealed by the credential broker under a declared scope.",
  },
  {
    form: "ISOLATED_INTERACTIVE_BROWSER_SESSION",
    summary:
      "An isolated interactive browser session — interactive logins run in an isolated browser context whose cookies never cross the isolation boundary.",
  },
  {
    form: "PROVIDERLESS_RAIL",
    summary:
      "A providerless rail — no external counterparty to call; the local rail still passes through the same scope and lifecycle discipline.",
  },
];

/* ====================================================================
 * connection-scope.ts pins
 * ==================================================================== */

/** The operation classes a connection scope can admit — same literals, same order. */
export const OPERATION_CLASSES_PIN = [
  "READ_PROVIDER_STATE",
  "OBSERVE_EXTERNAL_FUNDS",
  "CREATE_EXTERNAL_EFFECT",
  "CANCEL_OR_REVERSE_EFFECT",
  "MANAGE_CONNECTION",
] as const;

export type OperationClassPin = (typeof OPERATION_CLASSES_PIN)[number];

/** The effect classes — same literals, same order. */
export const EFFECT_CLASSES_PIN = ["NONE", "OBSERVATION_ONLY", "STATE_CHANGING"] as const;

export type EffectClassPin = (typeof EFFECT_CLASSES_PIN)[number];

/* ====================================================================
 * connection-lifecycle.ts pins
 * ==================================================================== */

/** The canonical connection lifecycle states — same literals, same order. */
export const CONNECTION_LIFECYCLE_STATES_PIN = [
  "PROPOSED",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "DEGRADED",
  "SUSPENDED",
  "EXPIRED",
  "REVOKED",
  "DISCONNECTED",
] as const;

export type ConnectionLifecycleStatePin =
  (typeof CONNECTION_LIFECYCLE_STATES_PIN)[number];

/** Lifecycle transition causes — same literals, same order. */
export const CONNECTION_TRANSITION_CAUSES_PIN = [
  "PRINCIPAL_REQUEST",
  "VERIFICATION_SUCCEEDED",
  "VERIFICATION_FAILED",
  "PROVIDER_SIGNAL",
  "POLICY_DECISION",
  "CREDENTIAL_EXPIRY",
  "OPERATOR_ACTION",
] as const;

export type ConnectionTransitionCausePin =
  (typeof CONNECTION_TRANSITION_CAUSES_PIN)[number];

/* ====================================================================
 * execution-mode.ts pins
 * ==================================================================== */

/**
 * The SANDBOX/LIVE execution-mode union (INV-25): sandbox is mechanically
 * distinct and can never be represented as proof of live behavior. Two
 * literals, no third state.
 */
export const EXECUTION_MODES_PIN = ["SANDBOX", "LIVE"] as const;

export type ExecutionModePin = (typeof EXECUTION_MODES_PIN)[number];
