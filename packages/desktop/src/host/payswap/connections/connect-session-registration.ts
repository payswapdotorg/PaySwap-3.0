/**
 * PaySwap Desktop (P27-E, the P27-A lane report §8) — the CONNECT-LANE
 * SESSION REGISTRATION: the registration point that wires the P27-A
 * connect-connection-views (the U2/U3 connection-plane surface) INTO the
 * connection session authority's own seeding law.
 *
 * WHY A SEPARATE MODULE (the record-store.ts precedent): the authority
 * file sits at the ≤400-line law's cap — the connect-lane registration
 * is composed OVER the authority (it holds the authority's own seeding
 * verb) instead of growing the authority's file. The lane never edited
 * the authority; this registration never rewrites it either — it DELEGATES
 * to the authority's own `seedConnectionSetup`, so the demand-side task
 * adopts the authority's connection-record law (which honestly REFUSES
 * while the registry form is UNCONFIGURED — the registry pin and the
 * platform gates agree; when §B arrives both flip together).
 *
 * THE STATUSOVERRIDE SEAM (the lane's own words): "the statusOverride seam
 * on seedConnectSetupTask is where the CONFIGURED flip lands when §B
 * arrives". The default derivation reads the composed platform gates —
 * CONFIGURED only when EVERY §B item the form needs is SATISFIED (the
 * §B.5 written approval is never satisfiable by code, so today's honest
 * answer stays UNCONFIGURED); the composition may inject its own
 * derivation (the battery exercises the flip through the seam).
 *
 * ZERO FINANCIAL AUTHORITY: seeding a connect setup TASK is demand-side
 * only; the typed OPERATOR_GATED verdict is the honest answer while the
 * operator gates stand (never a dead button, never a simulated flow).
 */

import type { ConnectionSessionAuthority } from "./session-authority.js";
import type { DesktopConnectionSetupOutcome } from "./contracts.js";
import {
  CONNECT_LANE_FORM_VIEWS,
  connectLaneViewAsProviderFormView,
  seedConnectSetupTask,
  type ConnectLaneFormId,
  type ConnectLaneFormView,
  type ConnectLaneMachineryState,
} from "./connect-connection-views.js";
import type {
  StripeConnectGateVerdict,
  StripeConnectPlatformGateRecord,
} from "../stripe/connect-platform-gates.js";

/** The registration's input (the authority + the composed gates' read). */
export interface ConnectSessionRegistrationInput {
  /** The connection session authority (the ONLY writer of connection lifecycle states). */
  readonly authority: Pick<ConnectionSessionAuthority, "seedConnectionSetup">;
  /** The composed platform gates (the §B-mapped live state). */
  readonly gates: () => StripeConnectPlatformGateRecord;
  /** The live-status derivation (defaults to the gates-derived honest status; the §B flip's seam). */
  readonly statusOf?: (view: ConnectLaneFormView, gates: StripeConnectPlatformGateRecord) => "CONFIGURED" | "UNCONFIGURED";
  readonly nowIso: () => string;
}

/** The typed connect-lane seed outcome (the lane's verdict + the authority's own adoption). */
export type ConnectLaneSeedOutcome =
  | {
      readonly kind: "OPERATOR_GATED";
      readonly formId: ConnectLaneFormId;
      readonly missingItems: readonly string[];
      readonly machineryState: ConnectLaneMachineryState;
    }
  | { readonly kind: "UNKNOWN_FORM"; readonly formId: string }
  | {
      readonly kind: "SEEDED";
      readonly task: {
        readonly formId: ConnectLaneFormId;
        readonly useCaseRef: string;
        readonly machineryState: ConnectLaneMachineryState;
        readonly seededAt: string;
      };
      /**
       * The authority's OWN adoption outcome for the demand-side task
       * (providerId "stripe" + the view's useCaseRef): while the registry
       * form is UNCONFIGURED this is the authority's typed REFUSED —
       * recorded verbatim, never bypassed; when §B arrives it becomes
       * CREATED/RESUMED through the authority's own law.
       */
      readonly connectionSeed: DesktopConnectionSetupOutcome;
    };

/**
 * The gates-derived honest status (the §B flip's default derivation): a
 * form is CONFIGURED only when EVERY §B item it names is SATISFIED. The
 * §B.5 written approval is never satisfiable by code (the lane's law), so
 * the honest answer stays UNCONFIGURED until the operator's records land.
 */
export function connectLaneStatusOf(
  view: ConnectLaneFormView,
  gates: StripeConnectPlatformGateRecord,
): "CONFIGURED" | "UNCONFIGURED" {
  const verdicts: readonly StripeConnectGateVerdict[] = view.form === "DELEGATED_OAUTH"
    ? [gates.platformCredentials, gates.registeredRedirectUri, gates.businessModelApproval]
    : [
        gates.platformCredentials,
        gates.connectWebhookEndpoint,
        gates.accountModelDecision,
        gates.topologyDecision,
        gates.businessModelApproval,
      ];
  return verdicts.every((verdict) => verdict.kind === "SATISFIED") ? "CONFIGURED" : "UNCONFIGURED";
}

/** The composed connect-lane registration (the authority's connect surface). */
export interface ConnectSessionRegistration {
  /** The connect-lane views (typed data + the shared-form projection — zero authority). */
  connectLaneSetupViews(): readonly ConnectLaneFormView[];
  /** The views projected onto the renderer's shared DesktopProviderFormView contract. */
  connectLaneSetupFormViews(): readonly ReturnType<typeof connectLaneViewAsProviderFormView>[];
  /** Seed one connect-lane setup task through the authority's own law. */
  seedConnectLaneSetup(input: { readonly formId: string }): Promise<ConnectLaneSeedOutcome>;
}

/**
 * Register the connect lane into the session authority's seeding law: the
 * REAL seedConnectSetupTask decides (OPERATOR_GATED while the gates stand;
 * the task seeds only on the CONFIGURED flip), and a SEEDED task is
 * adopted through the authority's OWN seedConnectionSetup verb — the same
 * registry, the same lifecycle states, no parallel record store.
 */
export function registerConnectLaneInSession(
  input: ConnectSessionRegistrationInput,
): ConnectSessionRegistration {
  const statusOf = input.statusOf ?? connectLaneStatusOf;
  return {
    connectLaneSetupViews: () => CONNECT_LANE_FORM_VIEWS,
    connectLaneSetupFormViews: () => CONNECT_LANE_FORM_VIEWS.map(connectLaneViewAsProviderFormView),
    async seedConnectLaneSetup(seed) {
      const view = CONNECT_LANE_FORM_VIEWS.find((entry) => entry.formId === seed.formId);
      if (view === undefined) {
        return { kind: "UNKNOWN_FORM", formId: seed.formId };
      }
      const seedResult = seedConnectSetupTask({
        formId: seed.formId,
        nowIso: input.nowIso(),
        statusOverride: statusOf(view, input.gates()),
      });
      if (seedResult.kind === "UNKNOWN_FORM") {
        return { kind: "UNKNOWN_FORM", formId: seedResult.formId };
      }
      if (seedResult.kind === "OPERATOR_GATED") {
        return {
          kind: "OPERATOR_GATED",
          formId: seedResult.formId,
          missingItems: seedResult.missingItems,
          machineryState: seedResult.machineryState,
        };
      }
      // SEEDED: the demand-side task adopts the authority's own seeding
      // law (providerId "stripe" + the view's registry useCaseRef) — the
      // authority's verdict (REFUSED while the registry form is
      // UNCONFIGURED, CREATED/RESUMED when §B flips the pin) is carried
      // verbatim, never bypassed.
      const connectionSeed = await input.authority.seedConnectionSetup({
        providerId: "stripe",
        useCaseRef: view.useCaseRef,
      });
      return {
        kind: "SEEDED",
        task: seedResult.task,
        connectionSeed,
      };
    },
  };
}
