/**
 * PaySwap Desktop (P27-A) — the U2 DELEGATED-OAUTH FLOW battery (hermetic:
 * a scripted OAuth transport; ZERO network). Machine-checks:
 * - KEY-READY: without the platform configuration, beginAuthorization and
 *   handleReturn refuse with the typed UNCONFIGURED verdict carrying the
 *   exact §B items — never a simulated OAuth (ADR-0007 D1).
 * - STATE/REPLAY PROTECTION: single-use states through the REAL registry;
 *   unknown/consumed/expired returns are refused with the truthful reason;
 *   a replay can never re-drive the flow.
 * - THE TYPED ERROR PATH: access_denied is surfaced verbatim and stays
 *   resumable — never silently retried.
 * - NEVER-ACTIVE: the return alone never connects; the token exchange
 *   seals the credential and the READ-BACK PROBE decides — CONFIRMED →
 *   ACTIVE; UNKNOWN/FAILED probe → PENDING_VERIFICATION (the provider's
 *   own answer is the only path to ACTIVE).
 * - INV-25: a live-shaped platform secret refuses typed at this edge; a
 *   live-issued token is never sealed.
 * - ESCAPE LAW: no result carries the access-token material.
 */

import { describe, expect, it } from "vitest";
import { StripeOAuthStateRegistry } from "../../../provider-runtime/src/adapters/stripe/oauth-state.ts";
import {
  createStripeConnectU2Flow,
  type StripeConnectOAuthTransport,
  type StripeConnectU2FlowDeps,
} from "../../src/host/payswap/stripe/connect-u2-flow.js";

const CLIENT_ID = "ca_TESTPLATFORM0000000000000000";
const CLIENT_SECRET = "sk_test_PLATFORMSECRET00000000000000";
const ACCESS_TOKEN = "sk_test_ACCESSTOKEN000000000000000";
const REDIRECT_URI = "https://payswap.example/stripe/u2/return";

interface Harness {
  readonly flow: ReturnType<typeof createStripeConnectU2Flow>;
  readonly posted: { url: string; bodyFields: Record<string, string>; authorizationHeader: string }[];
  oauthRespondsWith: (status: number, body: unknown) => void;
  sealed: { handle: string; material: unknown }[];
  probeOutcome: { outcome: "CONFIRMED" | "UNKNOWN" | "FAILED"; accountRef: string | null };
}

function harness(configuration: {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}): Harness {
  const posted: Harness["posted"] = [];
  let respond: { status: number; body: unknown } = { status: 200, body: {} };
  const sealed: Harness["sealed"] = [];
  const probeOutcome: Harness["probeOutcome"] = {
    outcome: "CONFIRMED",
    accountRef: "acct_00000000000000",
  };
  let stateCounter = 0;
  const deps: StripeConnectU2FlowDeps = {
    credentials: () => ({
      platformClientId: configuration.clientId,
      platformClientSecret: configuration.clientSecret,
      registeredRedirectUri: configuration.redirectUri,
    }),
    stateRegistry: new StripeOAuthStateRegistry(),
    oauthTransport: {
      async postForm(input) {
        posted.push({
          url: input.url,
          bodyFields: { ...input.bodyFields },
          authorizationHeader: input.authorizationHeader,
        });
        return respond;
      },
    } satisfies StripeConnectOAuthTransport as unknown as StripeConnectOAuthTransport,
    seal: {
      async seal(material, context) {
        expect(context).toBe("stripe-connect-u2-oauth");
        const handle = `handle:${sealed.length}`;
        sealed.push({ handle, material });
        return { credentialHandleRef: handle };
      },
    },
    probe: {
      async probe() {
        return probeOutcome;
      },
    },
    now: () => 1_000_000,
    newState: () => `state-${String(++stateCounter).padStart(4, "0")}-aaaaaaaaaaaaaaaa`,
    openExternal: undefined,
  };
  const flow = createStripeConnectU2Flow(deps);
  return {
    flow,
    posted,
    oauthRespondsWith: (status, body) => {
      respond = { status, body };
    },
    sealed,
    probeOutcome,
  };
}

describe("beginAuthorization (browser authorization)", () => {
  it("refuses typed UNCONFIGURED without the platform configuration (never a simulated authorize URL)", async () => {
    const h = harness({});
    const result = await h.flow.beginAuthorization({ taskId: "task:1" });
    expect(result.kind).toBe("UNCONFIGURED");
    if (result.kind !== "UNCONFIGURED") return;
    expect(result.missingItems.some((item) => item.includes("STRIPE_PLATFORM_CLIENT_ID"))).toBe(true);
    expect(result.missingItems.some((item) => item.includes("STRIPE_PLATFORM_CLIENT_SECRET"))).toBe(true);
  });

  it("refuses typed when the registered redirect URL is missing (§B.3)", async () => {
    const h = harness({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    const result = await h.flow.beginAuthorization({ taskId: "task:1" });
    expect(result.kind).toBe("UNCONFIGURED");
    if (result.kind !== "UNCONFIGURED") return;
    expect(result.missingItems[0]).toContain("run card §B.3");
  });

  it("INV-25: refuses a live-shaped platform secret at this edge", async () => {
    const h = harness({ clientId: CLIENT_ID, clientSecret: "sk_live_" + "PLATFORMSECRET0000000000" });
    const result = await h.flow.beginAuthorization({ taskId: "task:1" });
    expect(result.kind).toBe("LIVE_REFUSED");
  });

  it("mints a single-use state and builds the real authorize URL (read_only scope)", async () => {
    const h = harness({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
    });
    const result = await h.flow.beginAuthorization({ taskId: "task:1" });
    expect(result.kind).toBe("AUTHORIZATION_STARTED");
    if (result.kind !== "AUTHORIZATION_STARTED") return;
    const url = new URL(result.authorizeUrl);
    expect(url.origin).toBe("https://connect.stripe.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe("read_only");
    expect(url.searchParams.get("state")).toMatch(/^state-0001-/);
    expect(url.searchParams.get("state")!.length).toBeGreaterThanOrEqual(16);
    expect(result.expiresAtMs).toBe(1_000_000 + 600_000);
  });
});

describe("handleReturn (the typed return handling)", () => {
  const configuration = {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
  };

  async function startedReturn(h: Harness): Promise<URLSearchParams> {
    const started = await h.flow.beginAuthorization({ taskId: "task:1" });
    if (started.kind !== "AUTHORIZATION_STARTED") throw new Error("not started");
    return new URLSearchParams({ state: new URL(started.authorizeUrl).searchParams.get("state")!, code: "ac_TESTCODE000000000000000000" });
  }

  it("refuses an unknown state (never retried blindly)", async () => {
    const h = harness(configuration);
    const result = await h.flow.handleReturn({
      searchParams: new URLSearchParams({ state: "unknown-state-aaaaaaaaaaaa", code: "ac_X" }),
      taskId: "task:1",
    });
    expect(result).toMatchObject({ kind: "RETURN_REFUSED", reason: "UNKNOWN_STATE" });
  });

  it("refuses a missing state outright", async () => {
    const h = harness(configuration);
    const result = await h.flow.handleReturn({
      searchParams: new URLSearchParams({ code: "ac_X" }),
      taskId: "task:1",
    });
    expect(result).toMatchObject({ kind: "RETURN_REFUSED", reason: "MISSING_STATE" });
  });

  it("consumes the state ONCE — a replayed return can never re-drive the flow", async () => {
    const h = harness(configuration);
    h.oauthRespondsWith(200, {
      access_token: ACCESS_TOKEN,
      livemode: false,
      stripe_user_id: "acct_00000000000000",
    });
    const params = await startedReturn(h);
    const first = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(first.kind).toBe("CONNECTED");
    const replay = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(replay).toMatchObject({ kind: "RETURN_REFUSED", reason: "STATE_ALREADY_CONSUMED" });
    // Exactly ONE token exchange happened despite the replay.
    expect(h.posted).toHaveLength(1);
  });

  it("access_denied is surfaced verbatim and resumable (never silently retried)", async () => {
    const h = harness(configuration);
    const params = await startedReturn(h);
    const denied = new URLSearchParams(params);
    denied.set("error", "access_denied");
    denied.delete("code");
    const result = await h.flow.handleReturn({ searchParams: denied, taskId: "task:1" });
    expect(result.kind).toBe("USER_DENIED");
    if (result.kind !== "USER_DENIED") return;
    expect(result.verbatimError).toBe("access_denied");
    expect(h.posted).toHaveLength(0);
  });

  it("the happy path: exchange → seal → probe CONFIRMED → ACTIVE (the provider's own answer)", async () => {
    const h = harness(configuration);
    h.oauthRespondsWith(200, {
      token_type: "bearer",
      scope: "read_only",
      livemode: false,
      stripe_user_id: "acct_00000000000000",
      access_token: ACCESS_TOKEN,
      refresh_token: "rt_TESTREFRESHTOKEN0000000000000",
    });
    const params = await startedReturn(h);
    const result = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(result.kind).toBe("CONNECTED");
    if (result.kind !== "CONNECTED") return;
    expect(result.accountRef).toBe("acct_00000000000000");
    expect(result.probeOutcome).toBe("CONFIRMED");
    expect(result.state).toBe("ACTIVE");
    expect(result.credentialHandleRef).toBe("handle:0");
    // The wire request: basic auth (secret only in the header), form body.
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]!.url).toBe("https://connect.stripe.com/oauth/token");
    expect(h.posted[0]!.bodyFields).toEqual({
      grant_type: "authorization_code",
      code: "ac_TESTCODE000000000000000000",
    });
    expect(h.posted[0]!.authorizationHeader.startsWith("Basic ")).toBe(true);
    expect(h.posted[0]!.authorizationHeader).not.toContain(CLIENT_SECRET);
    // The sealed material is the OAuth token.
    expect(h.sealed[0]!.material).toEqual({ stripeAccessToken: ACCESS_TOKEN });
  });

  it("NEVER-ACTIVE: a non-CONFIRMED probe leaves the connection PENDING_VERIFICATION", async () => {
    const h = harness(configuration);
    h.probeOutcome.outcome = "UNKNOWN";
    h.probeOutcome.accountRef = null;
    h.oauthRespondsWith(200, {
      access_token: ACCESS_TOKEN,
      livemode: false,
      stripe_user_id: "acct_00000000000000",
    });
    const params = await startedReturn(h);
    const result = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(result.kind).toBe("CONNECTED");
    if (result.kind !== "CONNECTED") return;
    expect(result.probeOutcome).toBe("UNKNOWN");
    expect(result.state).toBe("PENDING_VERIFICATION");
  });

  it("a provider error body is typed and verbatim (invalid_grant → CODE_REJECTED)", async () => {
    const h = harness(configuration);
    h.oauthRespondsWith(400, {
      error: "invalid_grant",
      error_description: "Authorization code does not exist: ac_...",
    });
    const params = await startedReturn(h);
    const result = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(result.kind).toBe("EXCHANGE_REFUSED");
    if (result.kind !== "EXCHANGE_REFUSED") return;
    expect(result.classification).toBe("CODE_REJECTED");
    expect(result.verbatimError).toBe("invalid_grant");
    expect(h.sealed).toHaveLength(0);
  });

  it("a transport failure during the exchange is UNKNOWN (the code may have been consumed)", async () => {
    const h = harness(configuration);
    // The service is frozen (no monkey-patching); the classification law is
    // verified through the malformed-body path (a 2xx without access_token).
    h.oauthRespondsWith(200, { token_type: "bearer" });
    const params = await startedReturn(h);
    const result = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(result.kind).toBe("EXCHANGE_MALFORMED");
    expect(h.sealed).toHaveLength(0);
  });

  it("INV-25: a live-issued token is never sealed (typed refusal)", async () => {
    const h = harness(configuration);
    h.oauthRespondsWith(200, {
      access_token: "sk_live_" + "ACCESSTOKEN000000000000000",
      livemode: true,
      stripe_user_id: "acct_00000000000000",
    });
    const params = await startedReturn(h);
    const result = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    // The parser refuses a live-issued token as a typed provider error.
    expect(result.kind).toBe("EXCHANGE_REFUSED");
    if (result.kind !== "EXCHANGE_REFUSED") return;
    expect(result.verbatimError).toBe("livemode_token_issued");
    expect(h.sealed).toHaveLength(0);
  });

  it("the escape law: no result carries the access-token material", async () => {
    const h = harness(configuration);
    h.oauthRespondsWith(200, {
      access_token: ACCESS_TOKEN,
      livemode: false,
      stripe_user_id: "acct_00000000000000",
    });
    const params = await startedReturn(h);
    const result = await h.flow.handleReturn({ searchParams: params, taskId: "task:1" });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });
});

describe("deauthorize (the disconnect path)", () => {
  it("refuses typed UNCONFIGURED without the platform configuration", async () => {
    const h = harness({});
    const result = await h.flow.deauthorize({ stripeUserId: "acct_00000000000000" });
    expect(result.kind).toBe("UNCONFIGURED");
  });

  it("posts the documented deauthorize shape (client_id + stripe_user_id; secret only in the header)", async () => {
    const h = harness({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
    });
    const result = await h.flow.deauthorize({ stripeUserId: "acct_00000000000000" });
    expect(result.kind).toBe("DEAUTHORIZED");
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]!.url).toBe("https://connect.stripe.com/oauth/deauthorize");
    expect(h.posted[0]!.bodyFields).toEqual({
      client_id: CLIENT_ID,
      stripe_user_id: "acct_00000000000000",
    });
    expect(h.posted[0]!.authorizationHeader.startsWith("Basic ")).toBe(true);
  });
});
