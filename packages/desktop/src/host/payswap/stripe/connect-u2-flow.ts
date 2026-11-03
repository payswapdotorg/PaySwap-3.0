/**
 * PaySwap Desktop (P27-A, ADR-0020 D4) — the U2 DELEGATED-OAUTH FLOW: the
 * host-side composition of the real provider-runtime OAuth machinery into
 * the connection lifecycle (browser authorization → typed return handling
 * → code→token exchange → credential seal → read-back probe).
 *
 * THE FLOW LAWS:
 * - STATE/REPLAY PROTECTION (ADR-0007 D3): every outbound authorization
 *   mints a SINGLE-USE state through the REAL StripeOAuthStateRegistry
 *   (crypto-random entropy injected at the host edge, 600-second default
 *   lifetime); a return with an unknown/consumed/expired state is refused
 *   with the truthful reason; a replay can never re-drive the flow.
 * - THE TYPED ERROR PATH: an `error` return param (access_denied = the
 *   user denied) is surfaced VERBATIM and the task stays resumable — never
 *   silently retried, never swallowed.
 * - NEVER-ACTIVE: the redirect return alone is NEVER an ACTIVE connection.
 *   ACTIVE requires the provider's own answer to the read-back probe
 *   (GET /v1/account) executed INSIDE the credential seal with the derived
 *   OAuth token. The connection records PENDING_VERIFICATION until a
 *   CONFIRMED probe answers.
 * - KEY-READY (D11): without the operator-gated platform configuration
 *   every verb refuses with the typed UNCONFIGURED verdict carrying the
 *   exact §B-mapped items; the harness exits 2. Never a simulated OAuth.
 * - INV-25: a live-shaped platform secret AND a live-issued token are
 *   refused at this edge (the provider-runtime edges refuse them again).
 * - ESCAPE LAW: no result shape carries the access/refresh token material
 *   (fail-closed scan — a leak THROWS).
 */

import {
  StripeOAuthStateRegistry,
  buildStripeAuthorizeUrl,
  readStripeReturnParams,
} from "../../../../../provider-runtime/src/adapters/stripe/oauth-state.js";
import {
  buildStripeDeauthorizeRequest,
  buildStripeTokenExchangeRequest,
  parseStripeOAuthTokenResponse,
  requireStripePlatformOAuthConfiguration,
  validateStripeOAuthTokenMaterial,
} from "../../../../../provider-runtime/src/adapters/stripe/oauth-token-exchange.js";
import { MissingStripePlatformConfigurationError } from "../../../../../provider-runtime/src/adapters/stripe/oauth-state.js";
import { SandboxLiveBoundaryError } from "../../../../../provider-runtime/src/errors.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";
import type { StripeConnectPlatformCredentialsInput } from "./connect-platform-gates.js";

/** The narrow injected transport for the connect.stripe.com OAuth endpoints (NOT the api.stripe.com census surface). */
export interface StripeConnectOAuthTransport {
  /** POST a form-encoded body; the authorization header exists only inside the transport frame. */
  postForm(input: {
    readonly url: string;
    readonly bodyFields: Readonly<Record<string, string>>;
    readonly authorizationHeader: string;
  }): Promise<{ readonly status: number; readonly body: unknown }>;
}

/** The injected credential-seal seam (the broker's withSealedMaterial law). */
export interface StripeConnectU2Seal {
  seal(
    material: unknown,
    context: string,
  ): Promise<{ readonly credentialHandleRef: string }>;
}

/** The injected read-back probe (runs INSIDE the seal; returns only clean evidence). */
export interface StripeConnectU2Probe {
  probe(material: unknown): Promise<{
    readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
    readonly accountRef: string | null;
    readonly failureCode?: string;
  }>;
}

/** The deps (all injected; no ambient clock/env/network — the composition edge binds them). */
export interface StripeConnectU2FlowDeps {
  /** The secret-channel source for the platform credentials (absent values = the typed gate). */
  readonly credentials: () => StripeConnectPlatformCredentialsInput;
  readonly stateRegistry: StripeOAuthStateRegistry;
  readonly oauthTransport: StripeConnectOAuthTransport;
  readonly seal: StripeConnectU2Seal;
  readonly probe: StripeConnectU2Probe;
  readonly now: () => number;
  /** Crypto-random state entropy (the host edge binds node:crypto). */
  readonly newState: () => string;
  /** Where the browser is sent (the composition edge opens the system browser). */
  readonly openExternal?: (url: string) => void;
}

/** The typed U2 flow result vocabulary (never a thrown string). */
export type StripeConnectU2Result =
  | { readonly kind: "UNCONFIGURED"; readonly missingItems: readonly string[] }
  | { readonly kind: "LIVE_REFUSED"; readonly detail: string }
  | {
      readonly kind: "AUTHORIZATION_STARTED";
      readonly authorizeUrl: string;
      readonly stateRef: string;
      readonly expiresAtMs: number;
    }
  | { readonly kind: "RETURN_REFUSED"; readonly reason: "UNKNOWN_STATE" | "STATE_ALREADY_CONSUMED" | "STATE_EXPIRED" | "MISSING_STATE" }
  | { readonly kind: "USER_DENIED"; readonly verbatimError: string; readonly verbatimDescription: string | null }
  | {
      readonly kind: "EXCHANGE_REFUSED";
      readonly classification: string;
      readonly verbatimError: string;
      readonly verbatimDescription: string | null;
    }
  | { readonly kind: "EXCHANGE_MALFORMED"; readonly detail: string }
  | { readonly kind: "EXCHANGE_UNKNOWN"; readonly detail: string }
  | {
      readonly kind: "CONNECTED";
      readonly connectionRef: string;
      readonly credentialHandleRef: string;
      readonly accountRef: string | null;
      /** The provider's own answer — ACTIVE only on CONFIRMED (the never-ACTIVE law). */
      readonly probeOutcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
      readonly state: "ACTIVE" | "PENDING_VERIFICATION";
    }
  | { readonly kind: "DEAUTHORIZED"; readonly stripeUserId: string };

/** Fail-closed escape scan: no result may carry token material. */
function scan(result: StripeConnectU2Result, secrets: readonly string[]): StripeConnectU2Result {
  const serialized = JSON.stringify(result);
  for (const secret of secrets) {
    if (secret.length > 0 && serialized.includes(secret)) {
      throw new Error("stripe-connect-u2-flow: a result shape carried credential material (fail-closed)");
    }
  }
  assertNoStripeSecretShapes(serialized, "stripe-connect-u2-flow-result");
  return result;
}

/** Compose the U2 flow service. */
export function createStripeConnectU2Flow(deps: StripeConnectU2FlowDeps): {
  beginAuthorization(input: { readonly taskId: string; readonly redirectUri?: string }): Promise<StripeConnectU2Result>;
  handleReturn(input: { readonly searchParams: URLSearchParams; readonly taskId: string }): Promise<StripeConnectU2Result>;
  deauthorize(input: { readonly stripeUserId: string }): Promise<StripeConnectU2Result>;
} {
  const resolveConfiguration = () => {
    const delivered = deps.credentials();
    // Throws the typed MISSING_STRIPE_PLATFORM_CONFIGURATION (or the
    // INV-25 boundary refusal) — caught and typed below.
    return requireStripePlatformOAuthConfiguration({
      clientId: delivered.platformClientId,
      clientSecret: delivered.platformClientSecret,
    });
  };

  /** The typed gate refusal for a raised configuration error (never a bare rethrow). */
  const gateRefusalOf = (error: unknown): StripeConnectU2Result | null => {
    if (error instanceof SandboxLiveBoundaryError) {
      return {
        kind: "LIVE_REFUSED",
        detail: "INV-25: a live-mode platform secret cannot drive the SANDBOX-only U2 flow",
      };
    }
    if (error instanceof MissingStripePlatformConfigurationError) {
      return unconfigured();
    }
    return null;
  };

  const unconfigured = (): StripeConnectU2Result => {
    const delivered = deps.credentials();
    const missing: string[] = [];
    if (typeof delivered.platformClientId !== "string" || delivered.platformClientId.trim().length === 0) {
      missing.push("STRIPE_PLATFORM_CLIENT_ID — the OAuth client_id of a Stripe platform application registered by the operator (run card §B.1)");
    }
    if (typeof delivered.platformClientSecret !== "string" || delivered.platformClientSecret.trim().length === 0) {
      missing.push("STRIPE_PLATFORM_CLIENT_SECRET — the platform secret key (the OAuth client_secret), delivered to the host through the operator secret channel, never chat (run card §B.1 and §B.4)");
    }
    return { kind: "UNCONFIGURED", missingItems: Object.freeze(missing) };
  };

  return {
    async beginAuthorization(input) {
      let configuration;
      try {
        configuration = resolveConfiguration();
      } catch (error) {
        const refusal = gateRefusalOf(error);
        if (refusal !== null) return scan(refusal, []);
        throw error;
      }
      const redirectUri = input.redirectUri ?? deps.credentials().registeredRedirectUri;
      if (typeof redirectUri !== "string" || redirectUri.length === 0) {
        return scan(
          {
            kind: "UNCONFIGURED",
            missingItems: Object.freeze([
              "The exact redirect/callback URL registered with the Stripe platform application (run card §B.3)",
            ]),
          },
          [],
        );
      }
      const nowMs = deps.now();
      const binding = deps.stateRegistry.mint(
        {
          taskId: input.taskId,
          providerId: "stripe",
          form: "DELEGATED_OAUTH",
          requestedScopes: ["read_only"],
        },
        { now: BigInt(nowMs), newState: deps.newState },
      );
      const authorizeUrl = buildStripeAuthorizeUrl({
        clientId: configuration.clientId,
        redirectUri,
        state: binding.state,
        scope: "read_only",
      });
      deps.openExternal?.(authorizeUrl);
      return scan(
        {
          kind: "AUTHORIZATION_STARTED",
          authorizeUrl,
          stateRef: `u2-state:${binding.state.slice(0, 6)}…`,
          expiresAtMs: Number(binding.expiresAt),
        },
        [],
      );
    },

    async handleReturn(input) {
      const params = readStripeReturnParams(input.searchParams);
      if (params.state === null) {
        return scan({ kind: "RETURN_REFUSED", reason: "MISSING_STATE" }, []);
      }
      const consumption = deps.stateRegistry.consume(params.state, BigInt(deps.now()));
      if (consumption.kind === "REJECTED") {
        return scan({ kind: "RETURN_REFUSED", reason: consumption.reason }, []);
      }
      if (params.error !== null) {
        // The typed error path: user-denied is a reason to record; the
        // task stays resumable — never silently retried.
        return scan(
          {
            kind: "USER_DENIED",
            verbatimError: params.error,
            verbatimDescription: params.errorDescription,
          },
          [],
        );
      }
      if (params.code === null) {
        return scan(
          {
            kind: "USER_DENIED",
            verbatimError: "missing_code",
            verbatimDescription: "the return carried neither an error nor an authorization code",
          },
          [],
        );
      }
      let configuration;
      try {
        configuration = resolveConfiguration();
      } catch (error) {
        const refusal = gateRefusalOf(error);
        if (refusal !== null) return scan(refusal, []);
        throw error;
      }
      const request = buildStripeTokenExchangeRequest({
        code: params.code,
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
      });
      let response;
      try {
        response = await deps.oauthTransport.postForm({
          url: request.url,
          bodyFields: request.bodyFields,
          authorizationHeader: request.basicAuthorization,
        });
      } catch {
        // The exchange may have landed — the code is single-use either way;
        // the honest result is UNKNOWN (INV-04), reconcile by a fresh flow.
        return scan(
          {
            kind: "EXCHANGE_UNKNOWN",
            detail: "the token exchange did not deliver — the authorization code may have been consumed (start a fresh authorization)",
          },
          [],
        );
      }
      const parsed = parseStripeOAuthTokenResponse(response.body);
      if (parsed.kind === "PROVIDER_ERROR") {
        return scan(
          {
            kind: "EXCHANGE_REFUSED",
            classification: parsed.classification.kind,
            verbatimError: parsed.verbatimError,
            verbatimDescription: parsed.verbatimDescription,
          },
          [],
        );
      }
      if (parsed.kind === "MALFORMED_RESPONSE") {
        return scan({ kind: "EXCHANGE_MALFORMED", detail: parsed.detail }, []);
      }
      // TOKEN_ISSUED — the materials exist only in this frame; seal them.
      let material;
      try {
        material = validateStripeOAuthTokenMaterial(parsed.accessTokenMaterial);
      } catch {
        return scan(
          { kind: "LIVE_REFUSED", detail: "INV-25: the provider-issued token is live-shaped for a SANDBOX-only flow — not sealed" },
          [],
        );
      }
      const sealed = await deps.seal.seal(
        { stripeAccessToken: material.stripeAccessToken },
        "stripe-connect-u2-oauth",
      );
      const probe = await deps.probe.probe({ stripeAccessToken: material.stripeAccessToken });
      const accountRef = probe.outcome === "CONFIRMED" ? probe.accountRef : (parsed.stripeUserId ?? null);
      const secrets = [material.stripeAccessToken];
      return scan(
        {
          kind: "CONNECTED",
          connectionRef: `stripe-u2:${parsed.stripeUserId ?? "unresolved"}`,
          credentialHandleRef: sealed.credentialHandleRef,
          accountRef,
          probeOutcome: probe.outcome,
          state: probe.outcome === "CONFIRMED" ? "ACTIVE" : "PENDING_VERIFICATION",
        },
        secrets,
      );
    },

    async deauthorize(input) {
      let configuration;
      try {
        configuration = resolveConfiguration();
      } catch (error) {
        const refusal = gateRefusalOf(error);
        if (refusal !== null) return scan(refusal, []);
        throw error;
      }
      const request = buildStripeDeauthorizeRequest({
        stripeUserId: input.stripeUserId,
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
      });
      try {
        await deps.oauthTransport.postForm({
          url: request.url,
          bodyFields: request.bodyFields,
          authorizationHeader: request.basicAuthorization,
        });
      } catch {
        return scan(
          {
            kind: "EXCHANGE_UNKNOWN",
            detail: "the deauthorize call did not deliver — reconcile with the account.application.deauthorized event before recording the disconnect",
          },
          [],
        );
      }
      return scan({ kind: "DEAUTHORIZED", stripeUserId: input.stripeUserId }, []);
    },
  };
}
