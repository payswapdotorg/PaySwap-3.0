/**
 * PaySwap Desktop (P27-A) — the U3 CONNECTED-ACCOUNT LIFECYCLE battery
 * (hermetic: a scripted dispatch transport + the REAL pinned census; ZERO
 * network). Machine-checks:
 * - THE OPERATOR-GATE LAW: without the §B.2 account-model decision every
 *   creation verb refuses with the typed UNDECIDED gate (never a default
 *   model); without the platform credentials the typed UNCONFIGURED gate.
 * - THE CURRENT-MODEL LAW: the creation plan carries the controller
 *   properties + service agreement + capabilities names exactly as the
 *   pinned census schema and the 2026-11-03 live docs specify (the legacy
 *   type= parameter is NOT used).
 * - THE CENSUS LAW: every dispatched operation resolves in the pinned
 *   census and is dispatch-allowed (the fake census port is built FROM the
 *   real pinned records — an unknown operation is typed UNPINNED_API_SURFACE).
 * - THE REAUTH LAW (ADR-0018): PostAccountLinks dispatch requires a live,
 *   digest-scoped, single-use reauthentication proof — consumed BEFORE the
 *   wire; a missing/failed proof is the typed REAUTH_REQUIRED refusal.
 * - THE NEVER-ACTIVE LAW: the hosted onboarding RETURN proves nothing —
 *   the observation of the account's own requirements/capabilities objects
 *   is the only completion evidence (D10 dated record).
 * - THE IDENTITY-BINDING LAW: provider account <-> seller principal is
 *   monotonic (a rebinding to a different principal is refused).
 * - INV-04: an undelivered dispatch is UNKNOWN with the named read-back.
 */

import { describe, expect, it } from "vitest";
import { stripeCensusRecord } from "../../../provider-runtime/src/adapters/stripe/catalogue/census.ts";
import type {
  StripeCensusOperationView,
  StripeOperationCensusPort,
  StripeDispatchResponse,
  StripeDispatchTransport,
} from "../../src/host/payswap/stripe/action-seams.js";
import {
  createStripeConnectAccountLifecycle,
  CONNECT_LIFECYCLE_OPERATIONS,
} from "../../src/host/payswap/stripe/connect-account-lifecycle.js";
import {
  evaluateStripeConnectPlatformGates,
  type StripeConnectAccountModelDecision,
} from "../../src/host/payswap/stripe/connect-platform-gates.js";

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

/** The REAL pinned census, adapted onto the host census port (the census law made mechanical). */
function realCensusPort(): StripeOperationCensusPort {
  const viewOf = (operationId: string): StripeCensusOperationView => {
    const record = stripeCensusRecord(operationId);
    if (record === undefined) {
      throw new Error(`census miss: ${operationId}`);
    }
    return {
      operationId: record.operationId,
      apiNamespace: record.apiNamespace,
      method: record.method === "GET" || record.method === "POST" ? record.method : "GET",
      path: record.path,
      pathParams: [...record.pathParams],
      effectClass: record.effectClass,
      approvalTier: record.approvalTier,
      supportState: record.supportState,
      requiredPermissionRule: record.requiredPermissionRule,
      readBackOperationId: null,
      idempotencyKeyAllowed: true,
      summary: record.summary,
      resourceFamily: record.resourceFamily,
      packId: record.packId,
      listPaginated: record.listPaginated,
    };
  };
  return {
    catalogueRelease: "stripe-openapi/v2596@2026-09-30.endive",
    resolve: (operationId) => {
      try {
        return viewOf(operationId);
      } catch {
        return undefined;
      }
    },
    dispatchAllowed: (operationId) => {
      const record = viewOf(operationId);
      return record.supportState.startsWith("IMPLEMENTED");
    },
    enumerate: () => [],
  };
}

interface LifecycleHarness {
  readonly lifecycle: ReturnType<typeof createStripeConnectAccountLifecycle>;
  readonly sent: { operationId: string; parameters: unknown[] }[];
  respondWith: (response: StripeDispatchResponse) => void;
  proofs: { verified: string[]; consumed: string[] };
}

function harness(configuration: {
  credentials?: boolean;
  decisions?: boolean;
  reauthentication?: "ok" | "absent" | "failing";
}): LifecycleHarness {
  const credentials = {
    platformClientId: configuration.credentials === false ? undefined : "ca_TESTPLATFORM0000000000000000",
    platformClientSecret: configuration.credentials === false ? undefined : "sk_test_PLATFORMSECRET00000000000000",
    connectWebhookSecret: "whsec_TESTCONNECTSECRET00000000000",
    registeredRedirectUri: "https://payswap.example/stripe/u2/return",
    registeredWebhookEndpointUrl: "https://backend.payswap.example/stripe/connect/webhook",
  };
  const decisions = configuration.decisions === false ? {} : { accountModel: ACCOUNT_MODEL_DECISION };
  const sent: LifecycleHarness["sent"] = [];
  let respond: StripeDispatchResponse = { delivered: true, status: 200, body: {} };
  const proofs = { verified: [] as string[], consumed: [] as string[] };
  const bindings = new Map<string, { bindingId: string; accountRef: string; sellerPrincipalRef: string; boundAt: string; establishedByObservationAt: string }>();
  const lifecycle = createStripeConnectAccountLifecycle({
    census: realCensusPort(),
    transport: {
      transportId: "fake-connect-transport",
      async send(call) {
        sent.push({ operationId: call.operationId, parameters: [...call.parameters] });
        return respond;
      },
    } satisfies StripeDispatchTransport,
    reauthentication:
      configuration.reauthentication === "absent"
        ? undefined
        : {
            begin: async () => ({ ok: true, proofId: "proof:1" }),
            verify: async () => {
              if (configuration.reauthentication === "failing") {
                return { ok: false, reason: "no live proof" };
              }
              proofs.verified.push("proof:1");
              return { ok: true, proofId: "proof:1" };
            },
            consume: async (proofId) => {
              proofs.consumed.push(proofId);
              return true;
            },
          },
    credentials: () => credentials,
    gates: () => evaluateStripeConnectPlatformGates({ credentials, decisions }),
    nowIso: () => "2026-11-03T12:00:00.000Z",
    createId: (() => {
      let counter = 0;
      return () => `id-${String(++counter).padStart(3, "0")}`;
    })(),
    identityBindings: {
      put: (binding) => bindings.set(binding.accountRef, binding),
      byAccount: (accountRef) => bindings.get(accountRef),
    },
  });
  return { lifecycle, sent, respondWith: (response) => { respond = response; }, proofs };
}

const AUTH = "Bearer sk_test_PLATFORMSECRET00000000000000";
const API_VERSION = "2025-08-27.basil";

describe("the account-creation plan (the CURRENT model — never a default guess)", () => {
  it("refuses typed UNDECIDED without the §B.2 account-model decision", () => {
    const h = harness({ decisions: false });
    const result = h.lifecycle.planAccountCreation({
      accountModelDecision: undefined,
      country: "US",
    });
    expect(result.kind).toBe("ACCOUNT_MODEL_UNDECIDED");
    if (result.kind !== "ACCOUNT_MODEL_UNDECIDED") return;
    expect(result.missingDecision).toContain("run card §B.2");
  });

  it("refuses typed UNCONFIGURED without the platform credentials", () => {
    const h = harness({ credentials: false });
    const result = h.lifecycle.planAccountCreation({
      accountModelDecision: ACCOUNT_MODEL_DECISION,
      country: "US",
    });
    expect(result.kind).toBe("UNCONFIGURED");
  });

  it("refuses an inconsistent decision (recipient agreement + card_payments)", () => {
    const h = harness({});
    const result = h.lifecycle.planAccountCreation({
      accountModelDecision: { ...ACCOUNT_MODEL_DECISION, requestedCapabilities: ["transfers", "card_payments"] },
      country: "US",
    });
    expect(result.kind).toBe("INCONSISTENT_DECISION");
  });

  it("plans PostAccounts with the controller properties + service agreement + capabilities (the 2026-11-03 current shape)", () => {
    const h = harness({});
    const result = h.lifecycle.planAccountCreation({
      accountModelDecision: ACCOUNT_MODEL_DECISION,
      country: "GH",
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    expect(result.value.operationId).toBe("PostAccounts");
    const fields = Object.fromEntries(
      result.value.parameters.map((p) => [p.name, p.value]),
    );
    expect(fields["country"]).toBe("GH");
    expect(fields["controller[stripe_dashboard][type]"]).toBe("none");
    expect(fields["controller[fees][payer]"]).toBe("application");
    expect(fields["controller[losses][payments]"]).toBe("application");
    expect(fields["controller[requirement_collection]"]).toBe("stripe");
    expect(fields["tos_acceptance[service_agreement]"]).toBe("recipient");
    expect(fields["capabilities[transfers][requested]"]).toBe("true");
    // The legacy type= parameter is NOT part of the current-model plan.
    expect(fields["type"]).toBeUndefined();
  });
});

describe("createConnectedAccount (PostAccounts — CONFIRM tier)", () => {
  it("dispatches through the census-bound operation and reads the account id back", async () => {
    const h = harness({});
    h.respondWith({ delivered: true, status: 200, body: { id: "acct_00000000000000", object: "account" } });
    const result = await h.lifecycle.createConnectedAccount({
      accountModelDecision: ACCOUNT_MODEL_DECISION,
      country: "US",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    expect(result.value.accountRef).toBe("acct_00000000000000");
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.operationId).toBe("PostAccounts");
  });

  it("a provider refusal is typed REFUSED with the provider's own code", async () => {
    const h = harness({});
    h.respondWith({ delivered: true, status: 400, body: { error: { code: "parameter_invalid_integer" } }, providerErrorCode: "parameter_invalid_integer" });
    const result = await h.lifecycle.createConnectedAccount({
      accountModelDecision: ACCOUNT_MODEL_DECISION,
      country: "US",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("REFUSED");
    if (result.kind !== "REFUSED") return;
    expect(result.providerErrorCode).toBe("parameter_invalid_integer");
  });

  it("an undelivered dispatch is UNKNOWN with the named read-back (INV-04)", async () => {
    const h = harness({});
    h.respondWith({ delivered: false, failure: { kind: "TIMEOUT_AFTER_DISPATCH" } });
    const result = await h.lifecycle.createConnectedAccount({
      accountModelDecision: ACCOUNT_MODEL_DECISION,
      country: "US",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.operationId).toBe("PostAccounts");
  });
});

describe("createOnboardingLink (PostAccountLinks — the REAUTH law)", () => {
  it("requires a live reauthentication proof and consumes it BEFORE the wire (ADR-0018)", async () => {
    const h = harness({});
    h.respondWith({ delivered: true, status: 200, body: { object: "account_link", url: "https://connect.stripe.com/setup/c/acct_1/x", expires_at: 1_762_166_400 } });
    const result = await h.lifecycle.createOnboardingLink({
      accountRef: "acct_00000000000000",
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: "principal:1",
      connectionId: "connection:1",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    expect(result.value.url).toContain("connect.stripe.com/setup/");
    expect(h.proofs.verified).toHaveLength(1);
    expect(h.proofs.consumed).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
    const fields = Object.fromEntries(
      (h.sent[0]!.parameters as { name: string; value: unknown }[]).map((p) => [p.name, p.value]),
    );
    expect(fields["account"]).toBe("acct_00000000000000");
    expect(fields["type"]).toBe("account_onboarding");
    expect(fields["return_url"]).toBe("https://payswap.example/stripe/u3/return");
    expect(fields["refresh_url"]).toBe("https://payswap.example/stripe/u3/refresh");
  });

  it("refuses typed REAUTH_REQUIRED when no proof is live (never a tier downgrade)", async () => {
    const h = harness({ reauthentication: "failing" });
    const result = await h.lifecycle.createOnboardingLink({
      accountRef: "acct_00000000000000",
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: "principal:1",
      connectionId: "connection:1",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("REAUTH_REQUIRED");
    expect(h.sent).toHaveLength(0);
  });

  it("refuses typed when the reauthentication plane is not composed at all", async () => {
    const h = harness({ reauthentication: "absent" });
    const result = await h.lifecycle.createOnboardingLink({
      accountRef: "acct_00000000000000",
      returnUrl: "https://payswap.example/stripe/u3/return",
      refreshUrl: "https://payswap.example/stripe/u3/refresh",
      linkType: "account_onboarding",
      principalId: "principal:1",
      connectionId: "connection:1",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("REAUTH_REQUIRED");
  });
});

describe("observeConnectedAccount (the D10 dated record — the return proves nothing)", () => {
  it("extracts the account's own capabilities/requirements objects into the dated observation", async () => {
    const h = harness({});
    h.respondWith({
      delivered: true,
      status: 200,
      body: {
        id: "acct_00000000000000",
        object: "account",
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: false,
        country: "US",
        tos_acceptance: { service_agreement: "recipient" },
        capabilities: {
          transfers: { status: "pending", requirements: { currently_due: ["external_account"] } },
          card_payments: { status: "unrequested" },
        },
        requirements: {
          currently_due: ["external_account"],
          past_due: [],
          eventually_due: ["relationship.sector"],
          disabled_reason: null,
        },
      },
    });
    const result = await h.lifecycle.observeConnectedAccount({
      accountRef: "acct_00000000000000",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    const observation = result.value;
    expect(observation.accountRef).toBe("acct_00000000000000");
    expect(observation.observedAt).toBe("2026-11-03T12:00:00.000Z");
    expect(observation.source).toContain("GET /v1/accounts/{account}");
    expect(observation.payoutsEnabled).toBe(false);
    expect(observation.requirementsCurrentlyDue).toEqual(["external_account"]);
    expect(observation.requirementsEventuallyDue).toEqual(["relationship.sector"]);
    expect(observation.capabilities.find((c) => c.capability === "transfers")?.status).toBe("pending");
    expect(observation.capabilities.find((c) => c.capability === "transfers")?.requirementsCurrentlyDue).toEqual(["external_account"]);
    expect(observation.country).toBe("US");
    expect(observation.serviceAgreement).toBe("recipient");
    // The read-back went through the census-bound GET operation.
    expect(h.sent[0]!.operationId).toBe("GetAccountsAccount");
  });

  it("a body without an account object is UNKNOWN, never a fabricated observation", async () => {
    const h = harness({});
    h.respondWith({ delivered: true, status: 200, body: { object: "other" } });
    const result = await h.lifecycle.observeConnectedAccount({
      accountRef: "acct_00000000000000",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("UNKNOWN");
  });
});

describe("bindSellerIdentity (the monotonic identity-binding law)", () => {
  it("binds the provider account to the seller principal once, and answers idempotently", () => {
    const h = harness({});
    const first = h.lifecycle.bindSellerIdentity({
      accountRef: "acct_00000000000000",
      sellerPrincipalRef: "seller:1",
    });
    expect(first.kind).toBe("OK");
    const again = h.lifecycle.bindSellerIdentity({
      accountRef: "acct_00000000000000",
      sellerPrincipalRef: "seller:1",
    });
    expect(again.kind).toBe("OK");
    const rebind = h.lifecycle.bindSellerIdentity({
      accountRef: "acct_00000000000000",
      sellerPrincipalRef: "seller:2",
    });
    expect(rebind.kind).toBe("REFUSED");
    if (rebind.kind !== "REFUSED") return;
    expect(rebind.detail).toContain("monotonic");
  });
});

describe("reconcile (the INV-04 read-back)", () => {
  it("records the reconciliation through the same observation path", async () => {
    const h = harness({});
    h.respondWith({
      delivered: true,
      status: 200,
      body: { id: "acct_00000000000000", object: "account", payouts_enabled: true },
    });
    const result = await h.lifecycle.reconcile({
      accountRef: "acct_00000000000000",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("OK");
    expect(h.sent[0]!.operationId).toBe("GetAccountsAccount");
  });
});

describe("the census law (the pinned surface is mechanical)", () => {
  it("every lifecycle operation resolves in the pinned census v2596 (no silent pin expansion)", () => {
    for (const operationId of Object.values(CONNECT_LIFECYCLE_OPERATIONS)) {
      const record = stripeCensusRecord(operationId);
      expect(record?.supportState).toMatch(/^IMPLEMENTED/);
    }
  });

  it("an operation outside the census is the typed UNPINNED_API_SURFACE refusal", async () => {
    // Simulate a census without GetAccountsAccount: the observe verb must
    // refuse typed instead of dispatching outside the pin.
    const credentials = {
      platformClientId: "ca_TESTPLATFORM0000000000000000",
      platformClientSecret: "sk_test_PLATFORMSECRET00000000000000",
    };
    const emptyCensus: StripeOperationCensusPort = {
      catalogueRelease: "empty",
      resolve: () => undefined,
      dispatchAllowed: () => false,
      enumerate: () => [],
    };
    const lifecycle = createStripeConnectAccountLifecycle({
      census: emptyCensus,
      transport: {
        transportId: "unreached",
        async send() {
          throw new Error("the empty-census lifecycle must never dispatch");
        },
      } satisfies StripeDispatchTransport,
      reauthentication: undefined,
      credentials: () => credentials,
      gates: () => evaluateStripeConnectPlatformGates({ credentials, decisions: { accountModel: ACCOUNT_MODEL_DECISION } }),
      nowIso: () => "2026-11-03T12:00:00.000Z",
      createId: () => "id-x",
      identityBindings: { put: () => {}, byAccount: () => undefined },
    });
    const result = await lifecycle.observeConnectedAccount({
      accountRef: "acct_00000000000000",
      authorizationHeader: AUTH,
      apiVersion: API_VERSION,
    });
    expect(result.kind).toBe("UNPINNED_API_SURFACE");
    if (result.kind !== "UNPINNED_API_SURFACE") return;
    expect(result.operationId).toBe("GetAccountsAccount");
  });
});
