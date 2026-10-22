/**
 * @payswap/app — the PSP CONNECTION SETUP view fold (P12 Lane C, C4).
 *
 * The honest projection of the provider/PSP connection family onto the
 * connections area: the capability catalogue (declared connection forms
 * + credential kinds — REFERENCE, never connections), the scopes
 * vocabulary, the connection lifecycle (including reconnect/disable/
 * disconnect as LAWFUL TRANSITIONS — reference while zero connections
 * exist), the structural SANDBOX/LIVE distinction, and the typed
 * connect prerequisite. providerCount stays honestly 0 until a real
 * connection exists; the connect step explains exactly what is missing
 * instead of pretending — never a dead button, never a fabricated
 * connected provider (INV-13/INV-25 posture).
 */

import {
  CONNECTION_FORM_CATALOGUE_PIN,
  CONNECTION_LIFECYCLE_STATES_PIN,
  CONNECTION_TRANSITION_CAUSES_PIN,
  CREDENTIAL_KINDS_PIN,
  EFFECT_CLASSES_PIN,
  EXECUTION_MODES_PIN,
  OPERATION_CLASSES_PIN,
} from "../pins/provider-connection-pins.js";

/** One setup-flow step of the PSP connection surface. */
export interface ConnectionSetupStep {
  readonly id: string;
  readonly title: string;
  /** The honest state of this step in THIS deployment. */
  readonly state: "READY_DECLARED" | "BLOCKED_UNWIRED" | "EMPTY_HONEST";
  readonly line: string;
}

/** The PSP connection setup view. */
export interface ConnectionsSetupView {
  /** The honest connected count (providerCount — 0 until real evidence). */
  readonly connectedCount: number;
  /** The declared connection forms (catalogue — never connections). */
  readonly forms: typeof CONNECTION_FORM_CATALOGUE_PIN;
  /** The credential kinds vocabulary (reference). */
  readonly credentialKinds: readonly string[];
  /** The operation classes a scope can admit (reference). */
  readonly operationClasses: readonly string[];
  /** The effect classes (reference). */
  readonly effectClasses: readonly string[];
  /** The lifecycle states (reference — the lawful transition machine). */
  readonly lifecycleStates: readonly string[];
  /** The transition causes (reference). */
  readonly transitionCauses: readonly string[];
  /** The execution modes (INV-25 — structural sandbox/live). */
  readonly executionModes: readonly string[];
  /** The setup-flow steps, in flow order. */
  readonly steps: readonly ConnectionSetupStep[];
}

/** The typed connect prerequisite (verbatim — the honest gate). */
export const CONNECT_PREREQUISITE =
  "Connect requires the provider connection plane — session authority plus the provider registry, wired by the platform mount. This surface is the honest catalogue and lifecycle contract; it refuses to fabricate a connect flow, a login, or a connected provider before that plane exists." as const;

/** The typed health observation line (honest empty at providerCount 0). */
export const CONNECTION_HEALTH_EMPTY =
  "No connection health to observe — zero connected instances exist, so there are no observations, incidents or degradation records. Health renders only from real observations of real connections." as const;

/** The typed corridor line (no corridor observations exist). */
export const CORRIDOR_NOTE =
  "Corridor eligibility (supported rails, currencies, countries and methods per route) is a deterministic projection over recorded route observations — none are recorded in this deployment, so no corridor is claimed." as const;

/**
 * Fold the PSP connection setup view (pure; defaults pin the accepted
 * vocabulary so the fold stays deterministic and testable).
 */
export function foldConnectionsSetup(input?: {
  readonly connectedCount?: number;
}): ConnectionsSetupView {
  return {
    connectedCount: input?.connectedCount ?? 0,
    forms: CONNECTION_FORM_CATALOGUE_PIN,
    credentialKinds: CREDENTIAL_KINDS_PIN,
    operationClasses: OPERATION_CLASSES_PIN,
    effectClasses: EFFECT_CLASSES_PIN,
    lifecycleStates: CONNECTION_LIFECYCLE_STATES_PIN,
    transitionCauses: CONNECTION_TRANSITION_CAUSES_PIN,
    executionModes: EXECUTION_MODES_PIN,
    steps: [
      {
        id: "catalogue",
        title: "Browse the capability catalogue",
        state: "READY_DECLARED",
        line: "The declared connection forms and credential kinds render below as reference — a catalogue entry is never a connection and never authorization (INV-13).",
      },
      {
        id: "corridors",
        title: "See supported rails & corridors",
        state: "EMPTY_HONEST",
        line: CORRIDOR_NOTE,
      },
      {
        id: "connect",
        title: "Connect & authenticate a provider",
        state: "BLOCKED_UNWIRED",
        line: CONNECT_PREREQUISITE,
      },
      {
        id: "scopes",
        title: "Review scopes & permissions",
        state: "READY_DECLARED",
        line: "Connection scopes are declared up front: execution is admitted only by ACTIVE (or read-scoped DEGRADED) connections, and a degraded connection never carries new consequential effects.",
      },
      {
        id: "validate",
        title: "Configuration validation",
        state: "EMPTY_HONEST",
        line: "No connection configuration exists to validate — zero connected instances. The developer surface states the API runtime configuration honestly (it is shown as not configured, never hidden).",
      },
      {
        id: "health",
        title: "Health & observations",
        state: "EMPTY_HONEST",
        line: CONNECTION_HEALTH_EMPTY,
      },
      {
        id: "environments",
        title: "Keep sandbox and live distinct",
        state: "READY_DECLARED",
        line: "Sandbox and live are structurally distinct execution modes (INV-25): a sandbox pass is never proof of live behavior, and the boundary violation is a typed error, not a warning.",
      },
      {
        id: "lifecycle",
        title: "Reconnect, disable, or disconnect",
        state: "EMPTY_HONEST",
        line: "These are lawful lifecycle transitions (ACTIVE ⇄ DEGRADED, SUSPENDED → ACTIVE resume, terminal EXPIRED/REVOKED/DISCONNECTED — monotonic, append-only history). With zero connections there is nothing to reconnect, disable or disconnect; nothing pretends otherwise.",
      },
    ],
  };
}
