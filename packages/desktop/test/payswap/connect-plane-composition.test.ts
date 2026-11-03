/**
 * PaySwap Desktop (P27-E, the P27-A lane report §8 — THE COMPOSITION SEAM
 * BATTERY) — the CONNECT PLANE COMPOSITION: the station env-keyed
 * credential source, the durable §B.2 operator-decision channel, the U3
 * lifecycle over the EXISTING REAUTH machinery (ADR-0018) and the
 * connect-lane registration into the session authority's own seeding law.
 *
 * HERMETIC: zero network, zero credentials (the transports are scripted;
 * every key-shaped fixture is clearly a fixture — the boundary battery's
 * law). The REAL pinned census adapter (realCensusPort — the
 * stripe-plane-adapters production lift) and the REAL reauthentication
 * service + proof store are composed — never parallel kernels.
 */

import { describe, expect, it } from "vitest";
import { ConnectionSessionAuthority } from "../../src/host/payswap/connections/session-authority.js";
import { DurableConnectionCredentialBroker } from "../../src/host/payswap/connections/credential-broker.js";
import {
  connectLaneStatusOf,
  registerConnectLaneInSession,
} from "../../src/host/payswap/connections/connect-session-registration.js";
import {
  stationStripeConnectPlatformCredentials,
  STRIPE_CONNECT_PLATFORM_ENV_KEYS,
  composeStripeConnectPlane,
} from "../../src/host/payswap/stripe/connect-plane-composition.js";
import {
  StripeConnectOperatorDecisionStore,
} from "../../src/host/payswap/stripe/connect-operator-decisions.js";
import {
  createStripeReauthenticationService,
  reauthenticationPortOf,
  StripeReauthenticationStore,
} from "../../src/host/payswap/stripe/reauthentication.js";
import { realCensusPort } from "../../src/host/payswap/stripe/stripe-plane-adapters.js";
import type {
  StripeActionAccountContext,
} from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import type {
  StripeActionAccountContextResolver,
  StripeDispatchResponse,
  StripeDispatchTransport,
} from "../../src/host/payswap/stripe/action-seams.js";
import type { StripeConnectAccountModelDecision, StripeConnectTopologyDecision } from "../../src/host/payswap/stripe/connect-platform-gates.js";

/* ---------------- the fixtures (clearly fixtures — D11) ---------------- */

const NOW_ISO = "2026-11-03T14:00:00Z";
const AUTH = "Bearer sk_test_PLATFORMSECRET00000000000000";
const API_VERSION = "2025-08-27.basil";
const CONNECTION_ID = "conn:connect-platform-1";
const PRINCIPAL_ID = "principal:operator-1";
const ACCOUNT_REF = "acct_test_123";

const ACCOUNT_MODEL_DECISION: StripeConnectAccountModelDecision = {
  creationModel: "CONTROLLER_PROPERTIES",
  serviceAgreement: "recipient",
  stripeDashboardType: "none",
  feesPayer: "application",
  lossesPayer: "application",
  requirementCollection: "stripe",
  requestedCapabilities: ["transfers"],
  decisionRecordRef: "operator-decision:connect-account-model:2026-11-03",
};

const TOPOLOGY_DECISION: StripeConnectTopologyDecision = {
  chargeModel: "DESTINATION",
  platformCountry: "US",
  merchantOfRecord: "PLATFORM",
  disputeAndRefundLiability: "PLATFORM",
  decisionRecordRef: "operator-decision:connect-topology:2026-11-03",
};

/** The in-memory fs seam (the connection-record-store test pattern). */
function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
    fileSystem: {
      readFile: async (path: string) => {
        const raw = files.get(path);
        if (raw === undefined) throw new Error("missing");
        return raw;
      },
      writeFile: async (path: string, data: string) => {
        files.set(path, data);
      },
      mkdir: async () => {},
    },
  };
}

/** A scripted dispatch transport answering the reauth probe + the Account Link create. */
function scriptedConnectTransport(responses: {
  readonly getAccount?: StripeDispatchResponse;
  readonly postAccountLinks?: StripeDispatchResponse;
  readonly sent: { readonly operationId: string }[];
}): StripeDispatchTransport {
  return {
    transportId: "scripted-connect-transport",
    async send(call) {
      responses.sent.push({ operationId: call.operationId });
      if (call.operationId === "GetAccount") {
        return responses.getAccount ?? { delivered: true, status: 200, body: { id: ACCOUNT_REF } };
      }
      if (call.operationId === "PostAccountLinks") {
        return (
          responses.postAccountLinks ?? {
            delivered: true,
            status: 200,
            body: { url: "https://connect.stripe.com/setup/acct_onboarding", expires_at: 1_762_267_200 },
          }
        );
      }
      return { delivered: false, failure: { kind: "REFUSED_BEFORE_DISPATCH", detail: "unscripted operation" } };
    },
  };
}

/** The fake account-context resolver (the verified-evidence seam, fixture-backed). */
const accountContextResolver: StripeActionAccountContextResolver = {
  resolve: async (connectionId: string) => ({
    ok: true as const,
    accountContext: {
      connectionId,
      stripeAccountId: ACCOUNT_REF,
      accountModel: "CONNECT_PLATFORM" as const,
      environment: "SANDBOX" as const,
    } satisfies StripeActionAccountContext,
  }),
};

/** The REAL reauthentication plane over the scripted transport + the in-memory proof store. */
function realReauthenticationPlane(transport: StripeDispatchTransport) {
  const fs = memoryFs();
  const store = new StripeReauthenticationStore(fs.fileSystem, "/tmp/test-stripe-reauth/proofs.json");
  const service = createStripeReauthenticationService({
    census: realCensusPort(),
    transport,
    accountContext: accountContextResolver,
    store,
    nowMs: () => Date.parse(NOW_ISO),
    createId: (() => {
      let seq = 0;
      return () => `proof-${(seq += 1)}`;
    })(),
  });
  return reauthenticationPortOf(service);
}

/** The full composed connect plane (the REAL census; scripted dispatch; injectable env + decisions). */
function composedPlane(input: {
  readonly env?: Record<string, string | undefined>;
  readonly reauthentication?: ReturnType<typeof realReauthenticationPlane>;
  readonly decisions?: StripeConnectOperatorDecisionStore;
  readonly transport?: StripeDispatchTransport;
}) {
  const decisions = input.decisions ?? new StripeConnectOperatorDecisionStore(memoryFs().fileSystem, "/tmp/test-decisions");
  return composeStripeConnectPlane({
    env: () => input.env ?? {},
    ...(input.reauthentication !== undefined ? { reauthentication: input.reauthentication } : {}),
    census: realCensusPort(),
    transport: input.transport ?? scriptedConnectTransport({ sent: [] }),
    decisions: decisions.channel(),
    nowIso: () => NOW_ISO,
    createId: (() => {
      let seq = 0;
      return () => `id-${(seq += 1)}`;
    })(),
  });
}

/* -------- the station credential source (§B.1/§B.4 — the env-keyed binding) -------- */

describe("the station env-keyed credential source (never a hardcoded secret)", () => {
  it("binds every env key onto the connect modules' injected credential seam", () => {
    const credentials = stationStripeConnectPlatformCredentials({
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_test_PLATFORMSECRET00000000000000",
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.connectWebhookSecret]: "whsec_ fixturesecretmaterial0000000000",
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.registeredRedirectUri]: "https://payswap.example/stripe/u2/return",
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.registeredWebhookEndpointUrl]: "https://payswap.example/stripe/connect/webhook",
    });
    expect(credentials.platformClientId).toBe("ca_PLATFORMCLIENTID0000000");
    expect(credentials.platformClientSecret).toBe("sk_test_PLATFORMSECRET00000000000000");
    expect(credentials.connectWebhookSecret).toBe("whsec_ fixturesecretmaterial0000000000");
    expect(credentials.registeredRedirectUri).toBe("https://payswap.example/stripe/u2/return");
    expect(credentials.registeredWebhookEndpointUrl).toBe("https://payswap.example/stripe/connect/webhook");
  });

  it("absent and blank keys stay absent — the typed gates answer downstream, never a default", () => {
    const credentials = stationStripeConnectPlatformCredentials({
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "",
      [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "   ",
    });
    expect(credentials).toEqual({});
    const gates = composedPlane({ env: {} }).gates();
    expect(gates.platformCredentials.kind).toBe("UNCONFIGURED");
    expect(gates.platformCredentials).toMatchObject({
      missingItems: [
        "STRIPE_PLATFORM_CLIENT_ID — the OAuth client_id of a Stripe platform application registered by the operator (run card §B.1)",
        "STRIPE_PLATFORM_CLIENT_SECRET — the platform secret key (the OAuth client_secret), delivered to the host through the operator secret channel, never chat (run card §B.1 and §B.4)",
      ],
    });
  });

  it("INV-25: a live-shaped platform secret is refused by the gates at this edge", () => {
    const plane = composedPlane({
      env: {
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_live_" + "PLATFORMSECRET000000000000",
      },
    });
    expect(plane.gates().platformCredentials).toMatchObject({
      kind: "LIVE_REFUSED",
      detail: expect.stringContaining("INV-25"),
    });
  });
});

/* -------- the durable §B.2 operator-decision channel -------- */

describe("the durable §B.2 operator-decision channel (UNCONFIGURED until supplied)", () => {
  it("ships UNSUPPLIED: the decisions are empty and both §B.2 gates stay UNCONFIGURED", async () => {
    const fs = memoryFs();
    const store = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await store.load();
    expect(store.decisions()).toEqual({});
    const gates = composedPlane({ decisions: store }).gates();
    expect(gates.accountModelDecision.kind).toBe("UNCONFIGURED");
    expect(gates.topologyDecision.kind).toBe("UNCONFIGURED");
    expect(store.metadata()).toEqual({ recordedBy: null, recordedAt: null });
  });

  it("records a valid decision (validated + attributed) and the gates flip to SATISFIED", async () => {
    const fs = memoryFs();
    const store = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await store.load();
    const recorded = await store.record({
      accountModel: ACCOUNT_MODEL_DECISION,
      topology: TOPOLOGY_DECISION,
      recordedBy: "operator-1",
      nowIso: NOW_ISO,
    });
    expect(recorded).toEqual({ ok: true });
    const gates = composedPlane({ decisions: store }).gates();
    expect(gates.accountModelDecision).toMatchObject({
      kind: "SATISFIED",
      detail: expect.stringContaining("operator-decision:connect-account-model:2026-11-03"),
    });
    expect(gates.topologyDecision).toMatchObject({
      kind: "SATISFIED",
      detail: expect.stringContaining("operator-decision:connect-topology:2026-11-03"),
    });
    expect(store.metadata()).toEqual({ recordedBy: "operator-1", recordedAt: NOW_ISO });
  });

  it("a malformed decision is the typed refusal and NOTHING is written", async () => {
    const fs = memoryFs();
    const store = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await store.load();
    const refused = await store.record({
      accountModel: { creationModel: "LEGACY_TYPE" },
      recordedBy: "operator-1",
      nowIso: NOW_ISO,
    });
    expect(refused).toEqual({
      ok: false,
      refusal: {
        kind: "MALFORMED_ACCOUNT_MODEL",
        detail: expect.stringContaining("never a default guess") as unknown as string,
      },
    });
    expect(store.decisions()).toEqual({});
    expect([...fs.files.keys()]).toEqual([]);
  });

  it("the persisted record round-trips through load()", async () => {
    const fs = memoryFs();
    const first = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await first.load();
    await first.record({ accountModel: ACCOUNT_MODEL_DECISION, recordedBy: "operator-1", nowIso: NOW_ISO });
    const second = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await second.load();
    expect(second.decisions().accountModel).toEqual(ACCOUNT_MODEL_DECISION);
    expect(second.metadata()).toEqual({ recordedBy: "operator-1", recordedAt: NOW_ISO });
  });

  it("a corrupt store answers UNSUPPLIED (fail-closed, never a crash)", async () => {
    const fs = memoryFs();
    fs.files.set("/tmp/test-decisions/connect-operator-decisions.json", "{corrupt");
    const store = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await store.load();
    expect(store.decisions()).toEqual({});
  });
});

/* -------- the REAUTH plane composition (ADR-0018 over the REAL machinery) -------- */

describe("the REAUTH plane composition (the U3 lifecycle over the existing machinery)", () => {
  it("an uncomposed plane keeps the lifecycle's honest REAUTH_REQUIRED refusal", async () => {
    const plane = composedPlane({
      env: {
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_test_PLATFORMSECRET00000000000000",
      },
    });
    const result = await plane.lifecycle.createOnboardingLink({
      accountRef: ACCOUNT_REF,
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: PRINCIPAL_ID,
      connectionId: CONNECTION_ID,
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result).toMatchObject({
      kind: "REAUTH_REQUIRED",
      detail: expect.stringContaining("no reauthentication plane is composed"),
    });
  });

  it("the platform credentials gate stands BEFORE the REAUTH tier (UNCONFIGURED first)", async () => {
    const plane = composedPlane({ env: {} });
    const result = await plane.lifecycle.createOnboardingLink({
      accountRef: ACCOUNT_REF,
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: PRINCIPAL_ID,
      connectionId: CONNECTION_ID,
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result).toMatchObject({ kind: "UNCONFIGURED" });
  });

  it("a REAL digest-scoped proof lets the onboarding link dispatch — consumed BEFORE the wire", async () => {
    const sent: { readonly operationId: string }[] = [];
    const transport = scriptedConnectTransport({ sent });
    const reauthentication = realReauthenticationPlane(transport);
    const plane = composedPlane({
      env: {
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_test_PLATFORMSECRET00000000000000",
      },
      reauthentication,
      transport,
    });
    const digest = `connect-account-link:${ACCOUNT_REF}:account_onboarding`;
    const begin = await reauthentication.begin({
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      actionDigests: [digest],
      freshCredential: "sk_test_FRESHOPERATORKEY00000000000",
    });
    expect(begin).toEqual({ ok: true, proofId: "stripe-reauth:proof-1" });
    const result = await plane.lifecycle.createOnboardingLink({
      accountRef: ACCOUNT_REF,
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: PRINCIPAL_ID,
      connectionId: CONNECTION_ID,
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result).toMatchObject({
      kind: "OK",
      value: { url: "https://connect.stripe.com/setup/acct_onboarding" },
    });
    // The probe (GetAccount) then the wire (PostAccountLinks) — both rode the scripted transport.
    expect(sent.map((row) => row.operationId)).toEqual(["GetAccount", "PostAccountLinks"]);
  });

  it("the proof is single-use: a second link creation refuses (the proof was consumed)", async () => {
    const transport = scriptedConnectTransport({ sent: [] });
    const reauthentication = realReauthenticationPlane(transport);
    const plane = composedPlane({
      env: {
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_test_PLATFORMSECRET00000000000000",
      },
      reauthentication,
      transport,
    });
    const digest = `connect-account-link:${ACCOUNT_REF}:account_onboarding`;
    await reauthentication.begin({
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      actionDigests: [digest],
      freshCredential: "sk_test_FRESHOPERATORKEY00000000000",
    });
    const first = await plane.lifecycle.createOnboardingLink({
      accountRef: ACCOUNT_REF,
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: PRINCIPAL_ID,
      connectionId: CONNECTION_ID,
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(first.kind).toBe("OK");
    const second = await plane.lifecycle.createOnboardingLink({
      accountRef: ACCOUNT_REF,
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: PRINCIPAL_ID,
      connectionId: CONNECTION_ID,
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(second).toMatchObject({
      kind: "REAUTH_REQUIRED",
      detail: expect.stringContaining("PROOF_NOT_FOUND"),
    });
  });

  it("a proof for a DIFFERENT digest never authorizes the link (the digest scope law)", async () => {
    const transport = scriptedConnectTransport({ sent: [] });
    const reauthentication = realReauthenticationPlane(transport);
    const plane = composedPlane({
      env: {
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_test_PLATFORMSECRET00000000000000",
      },
      reauthentication,
      transport,
    });
    await reauthentication.begin({
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      actionDigests: ["some-other-action-digest"],
      freshCredential: "sk_test_FRESHOPERATORKEY00000000000",
    });
    const result = await plane.lifecycle.createOnboardingLink({
      accountRef: ACCOUNT_REF,
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: PRINCIPAL_ID,
      connectionId: CONNECTION_ID,
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result).toMatchObject({
      kind: "REAUTH_REQUIRED",
      detail: expect.stringContaining("PROOF_DIGEST_MISMATCH"),
    });
  });
});

/* -------- the session-authority registration (the connect views wired in) -------- */

describe("the connect-lane session registration (the authority's own seeding law)", () => {
  function authorityFixture() {
    const fs = memoryFs();
    return new ConnectionSessionAuthority({
      fileSystem: fs.fileSystem,
      directory: "/tmp/test-connections",
      broker: new DurableConnectionCredentialBroker({
        load: async () => null,
        save: async () => {},
        delete: async () => {},
      }),
      nowIso: () => NOW_ISO,
      createId: (() => {
        let seq = 0;
        return () => `id-${(seq += 1)}`;
      })(),
    });
  }

  it("the seed verb answers the typed OPERATOR_GATED verdict while the gates stand (never a dead button)", async () => {
    const registration = registerConnectLaneInSession({
      authority: authorityFixture(),
      gates: () => composedPlane({ env: {} }).gates(),
      nowIso: () => NOW_ISO,
    });
    const u2 = await registration.seedConnectLaneSetup({ formId: "stripe-u2-existing-account-grant" });
    expect(u2).toMatchObject({
      kind: "OPERATOR_GATED",
      formId: "stripe-u2-existing-account-grant",
      machineryState: "KEY_READY",
    });
    expect(u2.kind === "OPERATOR_GATED" && u2.missingItems.length).toBeGreaterThan(0);
    const u3 = await registration.seedConnectLaneSetup({ formId: "stripe-u3-marketplace-connected-accounts" });
    expect(u3.kind).toBe("OPERATOR_GATED");
  });

  it("a foreign formId is UNKNOWN_FORM (no form is ever guessed)", async () => {
    const registration = registerConnectLaneInSession({
      authority: authorityFixture(),
      gates: () => composedPlane({ env: {} }).gates(),
      nowIso: () => NOW_ISO,
    });
    const result = await registration.seedConnectLaneSetup({ formId: "stripe-u4-does-not-exist" });
    expect(result).toEqual({ kind: "UNKNOWN_FORM", formId: "stripe-u4-does-not-exist" });
  });

  it("the statusOverride seam: on the CONFIGURED flip the task SEEEDS and adopts the authority's own outcome verbatim", async () => {
    const authority = authorityFixture();
    const registration = registerConnectLaneInSession({
      authority,
      gates: () => composedPlane({ env: {} }).gates(),
      statusOf: () => "CONFIGURED",
      nowIso: () => NOW_ISO,
    });
    const result = await registration.seedConnectLaneSetup({ formId: "stripe-u2-existing-account-grant" });
    expect(result.kind).toBe("SEEDED");
    if (result.kind !== "SEEDED") return;
    expect(result.task).toEqual({
      formId: "stripe-u2-existing-account-grant",
      useCaseRef: "existing-account-grant",
      machineryState: "KEY_READY",
      seededAt: NOW_ISO,
    });
    // The authority's own adoption: the registry form is still UNCONFIGURED
    // in this deployment, so its verdict is the typed REFUSED — carried
    // verbatim (the two gates agree; when §B flips the registry pin the
    // same path answers CREATED/RESUMED).
    expect(result.connectionSeed).toMatchObject({ kind: "REFUSED" });
  });

  it("the gates-derived honest status stays UNCONFIGURED today (§B.5 is never satisfiable by code)", async () => {
    const fs = memoryFs();
    const decisions = new StripeConnectOperatorDecisionStore(fs.fileSystem, "/tmp/test-decisions");
    await decisions.load();
    await decisions.record({
      accountModel: ACCOUNT_MODEL_DECISION,
      topology: TOPOLOGY_DECISION,
      recordedBy: "operator-1",
      nowIso: NOW_ISO,
    });
    // Every CODE-SATISFIABLE §B gate is green here (credentials, redirect,
    // webhook endpoint, both §B.2 decisions) — the §B.5 written approval
    // still stands, so the honest derived status stays UNCONFIGURED.
    const gates = composedPlane({
      env: {
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientId]: "ca_PLATFORMCLIENTID0000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.platformClientSecret]: "sk_test_PLATFORMSECRET00000000000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.connectWebhookSecret]: "whsec_ fixturesecretmaterial0000000000",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.registeredRedirectUri]: "https://payswap.example/stripe/u2/return",
        [STRIPE_CONNECT_PLATFORM_ENV_KEYS.registeredWebhookEndpointUrl]: "https://payswap.example/stripe/connect/webhook",
      },
      decisions,
    }).gates();
    const registration = registerConnectLaneInSession({
      authority: authorityFixture(),
      gates: () => gates,
      nowIso: () => NOW_ISO,
    });
    for (const view of registration.connectLaneSetupViews()) {
      expect(connectLaneStatusOf(view, gates)).toBe("UNCONFIGURED");
    }
    const seeded = await registration.seedConnectLaneSetup({ formId: "stripe-u3-marketplace-connected-accounts" });
    expect(seeded.kind).toBe("OPERATOR_GATED");
  });

  it("the views + the shared-form projection surface through the registration (typed data, zero authority)", () => {
    const registration = registerConnectLaneInSession({
      authority: authorityFixture(),
      gates: () => composedPlane({ env: {} }).gates(),
      nowIso: () => NOW_ISO,
    });
    const views = registration.connectLaneSetupViews();
    expect(views.map((view) => view.formId)).toEqual([
      "stripe-u2-existing-account-grant",
      "stripe-u3-marketplace-connected-accounts",
    ]);
    const forms = registration.connectLaneSetupFormViews();
    expect(forms.map((form) => form.useCaseRef)).toEqual(["existing-account-grant", "marketplace-connected-accounts"]);
    expect(forms[0]?.form).toBe("DELEGATED_OAUTH");
    expect(forms[1]?.form).toBe("CONNECTED_ACCOUNT");
  });
});
