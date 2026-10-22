/**
 * PaySwap Desktop (P13-B) — the provider CONNECTION PLANE contracts.
 *
 * ADR-0007 D3/D4/D5: the connection session authority lives in the
 * desktop host process, extending the IPaySwapDesktopService seam. It
 * is the ONLY writer of connection lifecycle states and the ONLY holder
 * of credential-broker runtime keys. These are the renderer-facing
 * typed views + the task verbs the seam exposes (additive, B-exclusive
 * during the P13 wave).
 *
 * LAWS (violations are defects):
 * - NEVER-ACTIVE: a catalogue entry, an opened browser or a redirect
 *   return is NEVER an ACTIVE connection. ACTIVE requires a successful
 *   read-only verification probe through the real transport with the
 *   sealed credential, recorded as provider evidence.
 * - NO MATERIAL renderer-ward: no view or verb below carries credential
 *   material or the broker's sealed payload — only opaque handle refs
 *   and lifecycle evidence. The ONE material-carrying verb is the U1
 *   key-entry submission (renderer → host, once, sealed immediately);
 *   it returns a non-returnable handle and nothing else ever flows
 *   renderer-ward.
 * - U2/U3 honesty: declared forms whose entries state the EXACT missing
 *   operator configuration; their views render the typed prerequisite;
 *   never a dead button, never simulated OAuth.
 * - SANDBOX ≠ LIVE (INV-25): the execution mode is a field of every
 *   connection view and every piece of evidence; a SANDBOX
 *   verification never certifies a LIVE corridor.
 */

import type {
  PinnedConnectionForm,
  PinnedCredentialKind,
  PinnedConnectionLifecycleState,
  PinnedConnectionExecutionMode,
} from "./provider-pins.js";

// ---------------------------------------------------------------------------
// The registry catalogue view (typed data — never a connection instance)
// ---------------------------------------------------------------------------

/** One provider form as the renderer renders it (the honest catalogue). */
export interface DesktopProviderFormView {
  readonly useCaseRef: string;
  readonly form: PinnedConnectionForm;
  /** CONFIGURED = mechanically usable in THIS deployment (U1 test mode). */
  readonly status: "CONFIGURED" | "UNCONFIGURED";
  /** The exact missing operator configuration (verbatim, UNCONFIGURED only). */
  readonly missingOperatorConfiguration: readonly string[];
  readonly authMechanism: string;
  readonly credentialKind: PinnedCredentialKind;
  /** Test/live support as declared (INV-25 separation surface). */
  readonly executionModes: readonly PinnedConnectionExecutionMode[];
  readonly summary: string;
}

/** One provider's catalogue entry (never a connection — the registry data). */
export interface DesktopProviderRegistryView {
  readonly providerId: string;
  readonly displayName: string;
  readonly summary: string;
  readonly forms: readonly DesktopProviderFormView[];
}

// ---------------------------------------------------------------------------
// The connection instance views (evidence-backed lifecycle records)
// ---------------------------------------------------------------------------

/** One append-only transition as the renderer sees it (evidence-backed). */
export interface DesktopConnectionTransitionView {
  readonly at: string;
  readonly from: PinnedConnectionLifecycleState;
  readonly to: PinnedConnectionLifecycleState;
  readonly cause: string;
  /** People-language evidence summary (escape-scanned — no material). */
  readonly evidence: string;
}

/** A persisted connection instance (identity + lifecycle + evidence). */
export interface DesktopConnectionStatusView {
  readonly connectionId: string;
  readonly providerId: string;
  readonly useCaseRef: string;
  readonly form: PinnedConnectionForm;
  readonly credentialKind: PinnedCredentialKind;
  readonly executionMode: PinnedConnectionExecutionMode;
  readonly state: PinnedConnectionLifecycleState;
  /** The opaque credential handle REF (broker-owned; no material — INV-19). */
  readonly credentialHandleRef: string;
  readonly createdAt: string;
  readonly lastTransitionAt: string;
  readonly transitionHistory: readonly DesktopConnectionTransitionView[];
}

/** The honest no-connections-yet fact (typed, rendered verbatim). */
export const DESKTOP_NO_CONNECTIONS_STATEMENT =
  "No provider connection exists yet. A connection appears here only after real provider evidence is recorded — a catalogue entry, an opened browser or a redirect return is never a connected provider." as const;

// ---------------------------------------------------------------------------
// The connection-setup task verbs (the seam's additive surface)
// ---------------------------------------------------------------------------

/** The U1 key-entry receipt (the ONE material-carrying verb's answer). */
export interface DesktopCredentialSealReceipt {
  readonly connectionId: string;
  /** The opaque handle ref — non-returnable, no material ever flows back. */
  readonly credentialHandleRef: string;
  /** How many secret strings were sealed (audit surface, not the strings). */
  readonly sealedSecretCount: number;
  /** The honest next state (verification is still required for ACTIVE). */
  readonly nextState: PinnedConnectionLifecycleState;
}

/** The typed outcome of a setup-seed verb (create or resume, honestly). */
export type DesktopConnectionSetupOutcome =
  | {
      readonly kind: "CREATED";
      readonly connectionId: string;
      readonly state: PinnedConnectionLifecycleState;
    }
  | {
      readonly kind: "RESUMED";
      readonly connectionId: string;
      readonly state: PinnedConnectionLifecycleState;
    }
  | { readonly kind: "REFUSED"; readonly reason: string };

/** The provider deep-link return as the authority validates it (D3). */
export interface DesktopProviderCallbackView {
  readonly accepted: boolean;
  /** The honest refusal reason (unknown/expired/consumed state; user-denied). */
  readonly reason: string | null;
  readonly connectionId: string | null;
  readonly providerId: string | null;
}
