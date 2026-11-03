/**
 * PaySwap Desktop (P27-E, the P27-A lane report §8 composition seams) — the
 * CONNECT PLANE COMPOSITION: the production binding of the P27-A connect
 * modules' INJECTED SEAMS at the host composition edge (the
 * stripe-plane-composition precedent):
 *
 * - THE STATION CREDENTIAL SOURCE (§B.1/§B.3/§B.4): the connect modules
 *   take `credentials: () => StripeConnectPlatformCredentialsInput` as an
 *   injected seam — this composition binds the STATION SECRET STORE's
 *   env-keyed convention (STRIPE_PLATFORM_CLIENT_ID / SECRET,
 *   STRIPE_CONNECT_WEBHOOK_SECRET, the registered redirect + webhook
 *   endpoint URLs), NEVER a hardcoded secret, never a fixture default.
 *   The env source is INJECTED (the node edge binds process.env; tests
 *   inject fakes) and absent values surface as the lane's typed
 *   UNCONFIGURED gates downstream (the honest two-half state).
 * - THE §B.2 DECISION CHANNEL: the gates read the durable
 *   StripeConnectOperatorDecisionStore (UNCONFIGURED until the operator
 *   supplies — never a default guess).
 * - THE REAUTH PLANE (ADR-0018): the U3 connected-account lifecycle is
 *   composed over the EXISTING desktop reauthentication machinery — the
 *   StripeReauthenticationPort that composeStripeActionPlane already
 *   binds (reauthenticationPortOf over the REAL proof store + transport).
 *   An uncomposed plane still refuses REAUTH_REQUIRED honestly (the
 *   lifecycle's own law); with the plane composed, the proof discipline
 *   (digest-scoped, single-use, consumed BEFORE the wire) is the REAL
 *   machinery's.
 *
 * ZERO FINANCIAL AUTHORITY: the composition binds gates, credentials
 * READERS and lifecycle SERVICES; no dispatch happens here, no proof is
 * minted here, and no LIVE key ever binds (INV-25 — the gates refuse
 * live-shaped platform secrets at this edge).
 */

import type {
  StripeConnectPlatformCredentialsInput,
  StripeConnectPlatformGateRecord,
} from "./connect-platform-gates.js";
import { evaluateStripeConnectPlatformGates } from "./connect-platform-gates.js";
import { createStripeConnectAccountLifecycle } from "./connect-account-lifecycle.js";
import type { StripeConnectIdentityBinding } from "./connect-observations.js";
import type {
  StripeDispatchTransport,
  StripeOperationCensusPort,
  StripeReauthenticationPort,
} from "./action-seams.js";
import type { StripeConnectOperatorDecisionChannel } from "./connect-operator-decisions.js";

/**
 * THE STATION SECRET STORE'S ENV-KEY CONVENTION (the run card §B.4 + the
 * a1 harness's own law — the exact keys, pinned once here so the harness
 * channel and the product channel can never drift).
 */
export const STRIPE_CONNECT_PLATFORM_ENV_KEYS = Object.freeze({
  platformClientId: "STRIPE_PLATFORM_CLIENT_ID",
  platformClientSecret: "STRIPE_PLATFORM_CLIENT_SECRET",
  connectWebhookSecret: "STRIPE_CONNECT_WEBHOOK_SECRET",
  registeredRedirectUri: "STRIPE_U2_REDIRECT_URI",
  registeredWebhookEndpointUrl: "STRIPE_CONNECT_WEBHOOK_ENDPOINT_URL",
} as const);

/** The station secret environment (injected; the node edge binds process.env). */
export type StationSecretEnvironment = Readonly<Record<string, string | undefined>>;

/** Read one env key honestly: absent/blank = undefined (the typed gate downstream). */
function readEnvKey(env: StationSecretEnvironment, key: string): string | undefined {
  const value = env[key]?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

/**
 * The station credential binding (PURE): the env-keyed convention onto the
 * connect modules' injected credential seam. NEVER a hardcoded value — an
 * absent key stays absent and the platform gates answer the typed
 * UNCONFIGURED verdict with the exact §B-mapped items.
 */
export function stationStripeConnectPlatformCredentials(
  env: StationSecretEnvironment,
): StripeConnectPlatformCredentialsInput {
  const platformClientId = readEnvKey(env, STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId);
  const platformClientSecret = readEnvKey(env, STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret);
  const connectWebhookSecret = readEnvKey(env, STRIPE_CONNECT_PLATFORM_ENV_KEYS.connectWebhookSecret);
  const registeredRedirectUri = readEnvKey(env, STRIPE_CONNECT_PLATFORM_ENV_KEYS.registeredRedirectUri);
  const registeredWebhookEndpointUrl = readEnvKey(
    env,
    STRIPE_CONNECT_PLATFORM_ENV_KEYS.registeredWebhookEndpointUrl,
  );
  return Object.freeze({
    ...(platformClientId !== undefined ? { platformClientId } : {}),
    ...(platformClientSecret !== undefined ? { platformClientSecret } : {}),
    ...(connectWebhookSecret !== undefined ? { connectWebhookSecret } : {}),
    ...(registeredRedirectUri !== undefined ? { registeredRedirectUri } : {}),
    ...(registeredWebhookEndpointUrl !== undefined ? { registeredWebhookEndpointUrl } : {}),
  });
}

/** The in-memory identity-binding store (the lifecycle's monotonic binding surface). */
export function createConnectIdentityBindingStore(): {
  put(binding: StripeConnectIdentityBinding): void;
  byAccount(accountRef: string): StripeConnectIdentityBinding | undefined;
} {
  const byAccountRef = new Map<string, StripeConnectIdentityBinding>();
  return {
    put: (binding) => byAccountRef.set(binding.accountRef, binding),
    byAccount: (accountRef) => byAccountRef.get(accountRef),
  };
}

/** What the composition takes (all injected seams — no ambient env/clock/network). */
export interface StripeConnectPlaneCompositionInput {
  /** The station secret environment source (the node edge binds process.env). */
  readonly env: () => StationSecretEnvironment;
  /**
   * The REAUTH plane (ADR-0018) — the composed StripeReauthenticationPort
   * (composeStripeActionPlane's member). OPTIONAL: an uncomposed plane
   * keeps the lifecycle's honest REAUTH_REQUIRED refusal.
   */
  readonly reauthentication?: StripeReauthenticationPort;
  /** The REAL pinned-census port (realCensusPort() — the stripe-plane adapter). */
  readonly census: StripeOperationCensusPort;
  /** The REAL dispatch transport over the host fetch. */
  readonly transport: StripeDispatchTransport;
  /** The durable §B.2 operator-decision channel (UNCONFIGURED until supplied). */
  readonly decisions: StripeConnectOperatorDecisionChannel;
  readonly nowIso: () => string;
  readonly createId: () => string;
  /** The identity-binding store (defaults to the in-memory monotonic store). */
  readonly identityBindings?: {
    put(binding: StripeConnectIdentityBinding): void;
    byAccount(accountRef: string): StripeConnectIdentityBinding | undefined;
  };
  /** The host log (never console; no secret material is ever logged). */
  readonly log?: (level: "info" | "warn" | "error", message: string) => void;
}

/** The composed connect plane (the connect modules' seams, bound). */
export interface ComposedStripeConnectPlane {
  /** The station credential source — the connect modules' injected `credentials` seam, bound. */
  readonly credentials: () => StripeConnectPlatformCredentialsInput;
  /** The platform gates over the station credentials + the durable §B.2 decisions. */
  readonly gates: () => StripeConnectPlatformGateRecord;
  /** The durable §B.2 decision channel's read surface. */
  readonly decisions: () => ReturnType<StripeConnectOperatorDecisionChannel["decisions"]>;
  /** The U3 connected-account lifecycle over the REAL REAUTH plane (when composed). */
  readonly lifecycle: ReturnType<typeof createStripeConnectAccountLifecycle>;
  /** LITERAL: the composition binds services; it never permits execution by itself. */
  readonly compositionPermitsExecution: false;
}

/**
 * Compose the connect plane: bind the station credential source, the
 * platform gates (over the durable §B.2 decision channel) and the U3
 * connected-account lifecycle over the EXISTING REAUTH machinery. Every
 * member is a SERVICE binding — the typed verdicts (UNCONFIGURED /
 * OPERATOR_GATED / REAUTH_REQUIRED / ACCOUNT_MODEL_UNDECIDED) stay the
 * lane modules' own, never weakened, never defaulted.
 */
export function composeStripeConnectPlane(
  input: StripeConnectPlaneCompositionInput,
): ComposedStripeConnectPlane {
  const credentials = (): StripeConnectPlatformCredentialsInput =>
    stationStripeConnectPlatformCredentials(input.env());
  const gates = (): StripeConnectPlatformGateRecord =>
    evaluateStripeConnectPlatformGates({
      credentials: credentials(),
      decisions: input.decisions.decisions(),
    });
  const lifecycle = createStripeConnectAccountLifecycle({
    census: input.census,
    transport: input.transport,
    ...(input.reauthentication !== undefined ? { reauthentication: input.reauthentication } : {}),
    credentials,
    gates,
    nowIso: input.nowIso,
    createId: input.createId,
    identityBindings: input.identityBindings ?? createConnectIdentityBindingStore(),
  });
  input.log?.(
    "info",
    "payswap-desktop: connect plane composed (the station env-keyed credential source + the §B.2 durable decision channel + the U3 lifecycle over the existing REAUTH plane)",
  );
  return Object.freeze({
    credentials,
    gates,
    decisions: () => input.decisions.decisions(),
    lifecycle,
    compositionPermitsExecution: false as const,
  });
}
