/**
 * PaySwap Desktop (P27-E, the P27-B lane report §8 — THE COMPOSITION SEAM
 * BATTERY) — the GLOBAL PAYOUTS PLANE COMPOSITION: the TL's typed records
 * (the pin decision, the tier-drift note, the unpinned-adjacent operations),
 * the durable operator entitlement channel (the ONLY proof source), the
 * REAUTH proof seam (§8.5 / ADR-0018 — verify + consume BEFORE the wire) and
 * the lane + seal dispatch law.
 *
 * HERMETIC: zero network, zero credentials (the transports are scripted;
 * every key-shaped fixture is clearly a fixture — the boundary battery's
 * law). The REAL pinned census adapter (realCensusPort), the REAL product
 * journey driver and the REAL reauthentication service + proof store are
 * composed — never parallel kernels.
 */

import { describe, expect, it } from "vitest";
import { realCensusPort } from "../../src/host/payswap/stripe/stripe-plane-adapters.js";
import {
  composeStripeGlobalPayoutsPlane,
  STRIPE_GLOBAL_PAYOUTS_PIN_DECISION,
  STRIPE_GLOBAL_PAYOUTS_TIER_DRIFT,
  STRIPE_GLOBAL_PAYOUTS_UNPINNED_ADJACENT_OPERATIONS,
} from "../../src/host/payswap/stripe/payouts-plane-composition.js";
import { GlobalPayoutsEntitlementStore } from "../../src/host/payswap/stripe/payouts-entitlements.js";
import {
  createStripeReauthenticationService,
  reauthenticationPortOf,
  StripeReauthenticationStore,
} from "../../src/host/payswap/stripe/reauthentication.js";
import type { StripeReauthenticationPort } from "../../src/host/payswap/stripe/action-seams.js";
import type {
  StripeActionAccountContext,
} from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import type {
  StripeActionAccountContextResolver,
  StripeDispatchResponse,
  StripeDispatchTransport,
} from "../../src/host/payswap/stripe/action-seams.js";
import { STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP } from "../../../provider-runtime/src/adapters/stripe/catalogue/payouts-product.js";
import type { StripeGlobalPayoutsJourneyInput } from "../../../provider-runtime/src/adapters/stripe/catalogue/payouts-eligibility.js";

/* ---------------- the fixtures (clearly fixtures — D11) ---------------- */

const NOW_ISO = "2026-11-03T21:30:00Z";
const CONNECTION_ID = "conn:stripe-sandbox-1";
const PRINCIPAL_ID = "principal:operator-1";
const ACCOUNT_REF = "acct_test_fixture";
const FRESH_CREDENTIAL = "sk_test_" + "FRESHFIXTURECREDENTIAL000000";
const SEALED_API_KEY = "sk_test_" + "SEALEDSTOREDFIXTURE00000";

/** A maximally-proven US→KE contractor journey (the lane's ELIGIBLE baseline, proofs stripped — the channel supplies them). */
function journeyBaseline(overrides: Partial<Omit<StripeGlobalPayoutsJourneyInput, "proofs">> = {}): Omit<StripeGlobalPayoutsJourneyInput, "proofs"> {
  return {
    originCountry: "US",
    purposeClass: "ContractorSupplierPayment",
    recipientCountryCode: "KE",
    recipientCurrency: "KES",
    payoutMethodId: "bank_accounts.local",
    amountMinorUnits: 500_000,
    sendingCurrency: "USD",
    sendingLimitPayoutMethod: "Standard",
    ...overrides,
  };
}

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

/** A scripted desktop dispatch transport answering the reauth probe (GetAccount). */
function scriptedReauthTransport(sent: { readonly operationId: string }[]): StripeDispatchTransport {
  return {
    transportId: "scripted-reauth-transport",
    async send(call) {
      sent.push({ operationId: call.operationId });
      if (call.operationId === "GetAccount") {
        return { delivered: true, status: 200, body: { id: ACCOUNT_REF } } satisfies StripeDispatchResponse;
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

/** The REAL reauthentication plane over the scripted probe transport + the in-memory proof store. */
function realReauthenticationPlane(sent: { readonly operationId: string }[]): StripeReauthenticationPort {
  const fs = memoryFs();
  const store = new StripeReauthenticationStore(fs.fileSystem, "/tmp/test-payouts-reauth/proofs.json");
  const service = createStripeReauthenticationService({
    census: realCensusPort(),
    transport: scriptedReauthTransport(sent),
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

/** The scripted globalThis.fetch the journey's REAL catalogue transport rides (the wire observer). */
type WireRequest = { readonly url: string; readonly method: string; readonly authorization: string | undefined; readonly idempotencyKey: string | undefined };
function scriptedJourneyFetch(wire: { readonly requests: readonly WireRequest[] }) {
  return (async (url: string | URL, init?: RequestInit) => {
    const requestInit = init ?? { method: "GET" };
    const headers: Record<string, string> = {};
    const headerRecord = requestInit.headers;
    if (headerRecord !== undefined && typeof headerRecord === "object") {
      for (const [key, value] of Object.entries(headerRecord as Record<string, string>)) {
        headers[key] = value;
      }
    }
    const method = requestInit.method ?? "GET";
    const authorization = Object.entries(headers).find(([key]) => key.toLowerCase() === "authorization")?.[1];
    const idempotencyKey = Object.entries(headers).find(([key]) => key.toLowerCase() === "idempotency-key")?.[1];
    (wire.requests as WireRequest[]).push({ url: String(url), method, authorization, idempotencyKey });
    if (String(url).endsWith("/v2/core/account_links") && method === "POST") {
      return new Response(JSON.stringify({ url: "https://connect.stripe.com/setup/fixture_onboarding", expires_at: 1_762_267_200 }), {
        status: 200,
        headers: { "request-id": "req_fixture_account_links" },
      });
    }
    if (String(url).endsWith("/v1/treasury/outbound_payments") && method === "POST") {
      return new Response(JSON.stringify({ id: "fpo_fixture_1", status: "processing" }), {
        status: 200,
        headers: { "request-id": "req_fixture_outbound" },
      });
    }
    return new Response(JSON.stringify({ error: { message: "unscripted fixture path" } }), { status: 404 });
  }) as typeof globalThis.fetch;
}

/** The fake connection seam (the lane + seal laws, fixture-backed). */
function connectionSeam(statuses: ReadonlyArray<{ readonly connectionId: string; readonly providerId: string; readonly state: string; readonly executionMode: string }>) {
  const sealCalls: string[] = [];
  return {
    sealCalls,
    seam: {
      connectionStatuses: async () => statuses,
      withSealedCredential: async <T>(connectionId: string, consumer: (material: unknown) => T, context: string): Promise<Awaited<T>> => {
        sealCalls.push(`${connectionId}|${context}`);
        return consumer({ apiKey: SEALED_API_KEY }) as Awaited<T>;
      },
    },
  };
}

/** A loaded entitlement store over the in-memory fs. */
async function entitlementStore() {
  const fs = memoryFs();
  const store = new GlobalPayoutsEntitlementStore(fs.fileSystem, "/tmp/test-payouts-entitlements");
  await store.load();
  return { store, files: fs.files };
}

/** The full composed plane (injectable seams; the REAL journey + census underneath). */
function composedPlane(input: {
  readonly entitlements: GlobalPayoutsEntitlementStore;
  readonly reauthentication?: StripeReauthenticationPort;
  readonly connections?: ReturnType<typeof connectionSeam>["seam"];
  readonly fetchImpl?: typeof globalThis.fetch;
}) {
  return composeStripeGlobalPayoutsPlane({
    fetchImpl: input.fetchImpl ?? scriptedJourneyFetch({ requests: [] }),
    entitlements: input.entitlements.channel(),
    ...(input.reauthentication !== undefined ? { reauthentication: input.reauthentication } : {}),
    ...(input.connections !== undefined ? { connections: input.connections } : {}),
  });
}

/* -------- the TL's typed records (§8.1/§8.3/§8.4) -------- */

describe("the TL's typed records (the P27-B lane report §8 integration)", () => {
  it("§8.3 the tier-drift record is TRUE: the census derives CONFIRM, the plan carries the stricter STRONG_CONFIRM", async () => {
    const census = realCensusPort();
    const censusRecord = census.resolve(STRIPE_GLOBAL_PAYOUTS_TIER_DRIFT.operationId);
    expect(censusRecord?.approvalTier).toBe("CONFIRM");
    expect(censusRecord?.approvalTier).toBe(STRIPE_GLOBAL_PAYOUTS_TIER_DRIFT.censusApprovalTier);
    const { store } = await entitlementStore();
    await store.record({
      treasuryEntitlement: { financialAccountId: "fa_test_entitled", entitlementObserved: true },
      funding: { fundedMinorUnits: 10_000_000, currency: "USD" },
      recordedBy: "operator:fixture",
      recordedAt: NOW_ISO,
    });
    const plane = composedPlane({ entitlements: store });
    const planned = plane.buildOutboundPaymentPlan({
      journey: journeyBaseline(),
      financialAccountId: "fa_test_entitled",
      destination: { type: "financial_account", financialAccount: "fa_test_dest" },
      idempotencyKey: "idem-fixture-1",
    });
    expect(planned.kind).toBe("PLAN");
    if (planned.kind !== "PLAN") return;
    expect(planned.plan.approvalRequirement).toBe("STRONG_CONFIRM");
    expect(planned.plan.censusApprovalTier).toBe("CONFIRM");
    expect(STRIPE_GLOBAL_PAYOUTS_TIER_DRIFT.law).toBe("STRICTER_OF");
  });

  it("§8.4 the unpinned-adjacent operations are NOT_PINNED in the real census (recorded, never blocking)", () => {
    const census = realCensusPort();
    for (const row of STRIPE_GLOBAL_PAYOUTS_UNPINNED_ADJACENT_OPERATIONS) {
      if (row.operationId !== null) {
        expect(census.resolve(row.operationId)).toBeUndefined();
      }
    }
    // the Treasury forwarding-accounts family: no census member resolves
    expect(census.enumerate().some((operation) => operation.path.includes("forwarding_accounts"))).toBe(false);
    expect(STRIPE_GLOBAL_PAYOUTS_UNPINNED_ADJACENT_OPERATIONS.every((row) => row.note.startsWith("NOT_PINNED"))).toBe(true);
  });

  it("§8.1 the pin decision keeps the v1 Treasury pin; every census-gap doc-named operation stays unresolvable", () => {
    expect(STRIPE_GLOBAL_PAYOUTS_PIN_DECISION.decision).toBe("KEEP_V1_TREASURY_PIN");
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.status).toBe("NOT_PINNED");
    const census = realCensusPort();
    for (const docOperation of STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.unpinnedDocApiOperations) {
      expect(census.resolve(docOperation)).toBeUndefined();
    }
    expect(STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.unpinnedDocApiOperations).toHaveLength(16);
  });
});

/* -------- the durable operator entitlement channel -------- */

describe("the durable operator entitlement channel (the ONLY proof source)", () => {
  it("ships UNSUPPLIED: the proofs are empty and the eligibility keeps its typed OPERATOR_GATED verdict", async () => {
    const { store } = await entitlementStore();
    expect(store.proofs()).toEqual({});
    const plane = composedPlane({ entitlements: store });
    const verdict = plane.evaluate(journeyBaseline());
    expect(verdict.kind).toBe("OPERATOR_GATED");
    if (verdict.kind === "OPERATOR_GATED") {
      expect(verdict.gate).toBe("TREASURY_ENTITLEMENT");
    }
  });

  it("a valid recorded entitlement flips the verdict to ELIGIBLE (validated + attributed)", async () => {
    const { store } = await entitlementStore();
    const recorded = await store.record({
      treasuryEntitlement: { financialAccountId: "fa_test_entitled", entitlementObserved: true },
      funding: { fundedMinorUnits: 10_000_000, currency: "USD" },
      recordedBy: "operator:fixture",
      recordedAt: NOW_ISO,
    });
    expect(recorded.ok).toBe(true);
    const plane = composedPlane({ entitlements: store });
    expect(plane.evaluate(journeyBaseline()).kind).toBe("ELIGIBLE");
    expect(store.channel().metadata()).toEqual({ recordedBy: "operator:fixture", recordedAt: NOW_ISO });
  });

  it("the channel is the ONLY proof source: buildOutboundPaymentPlan refuses a journey whose entitlements are UNSUPPLIED", async () => {
    const { store } = await entitlementStore();
    const plane = composedPlane({ entitlements: store });
    const planned = plane.buildOutboundPaymentPlan({
      journey: journeyBaseline(),
      financialAccountId: "fa_test_entitled",
      destination: { type: "financial_account", financialAccount: "fa_test_dest" },
      idempotencyKey: "idem-fixture-1",
    });
    expect(planned.kind).toBe("NOT_PLANNED");
    if (planned.kind !== "NOT_PLANNED") return;
    expect(planned.eligibility.kind).toBe("OPERATOR_GATED");
  });

  it("a malformed record refuses typed and writes NOTHING (never a default guess)", async () => {
    const { store, files } = await entitlementStore();
    const refused = await store.record({
      treasuryEntitlement: { financialAccountId: "fa_test", entitlementObserved: false },
      recordedBy: "operator:fixture",
      recordedAt: NOW_ISO,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.kind).toBe("MALFORMED_TREASURY_ENTITLEMENT");
    }
    expect(store.proofs()).toEqual({});
    expect(files.size).toBe(0);
  });

  it("secret-shaped material is refused at the channel's own edge", async () => {
    const { store } = await entitlementStore();
    const refused = await store.record({
      p2pLicenceAndProviderApproval: { licenceEvidenceRef: "sk_live_" + "SECRETSHAPED0000000000000", providerWrittenApprovalRef: "stripe-approval:2026-11-03" },
      recordedBy: "operator:fixture",
      recordedAt: NOW_ISO,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.kind).toBe("SECRET_SHAPED_MATERIAL");
    }
    expect(store.proofs()).toEqual({});
  });

  it("a corrupt persisted store answers UNSUPPLIED fail-closed", async () => {
    const fs = memoryFs();
    fs.files.set("/tmp/test-payouts-entitlements/global-payouts-entitlements.json", "{not json");
    const store = new GlobalPayoutsEntitlementStore(fs.fileSystem, "/tmp/test-payouts-entitlements");
    await store.load();
    expect(store.proofs()).toEqual({});
  });
});

/* -------- the REAUTH proof seam (§8.5 / ADR-0018) -------- */

describe("the REAUTH proof seam (verify + consume BEFORE the wire)", () => {
  it("the hosted recipient form carries the REAUTH tier and the journey refuses it without the host proof reference", async () => {
    const { store } = await entitlementStore();
    const plane = composedPlane({ entitlements: store });
    const plan = plane.journey.buildHostedRecipientInformationFormPlan({
      accountId: ACCOUNT_REF,
      useCaseType: "account_update",
      refreshUrl: "https://payswap.example/refresh",
    });
    expect(plan.approvalRequirement).toBe("REAUTH");
    const executed = await plane.journey.executePlan(plan, {
      apiVersion: "2026-09-30.endive",
      authorizationHeader: `Bearer ${FRESH_CREDENTIAL}`,
    });
    expect(executed.kind).toBe("REFUSED_PRE_DISPATCH");
    if (executed.kind === "REFUSED_PRE_DISPATCH") {
      expect(executed.reason).toBe("REAUTH_PROOF_REQUIRED");
    }
  });

  it("an uncomposed reauthentication plane answers the typed REAUTH_PLANE_UNCOMPOSED refusal", async () => {
    const { store } = await entitlementStore();
    const plane = composedPlane({ entitlements: store });
    const plan = plane.journey.buildHostedRecipientInformationFormPlan({
      accountId: ACCOUNT_REF,
      useCaseType: "account_update",
      refreshUrl: "https://payswap.example/refresh",
    });
    const approval = await plane.hostedFormApproval({ plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(approval.ok).toBe(false);
    if (!approval.ok) {
      expect(approval.refusal.kind).toBe("REAUTH_PLANE_UNCOMPOSED");
    }
  });

  it("a REAL minted proof verifies + consumes for the exact plan digest — and is single-use", async () => {
    const { store } = await entitlementStore();
    const probeSent: { operationId: string }[] = [];
    // ONE reauthentication instance: the proof is minted into the SAME store the plane verifies against
    const reauth = realReauthenticationPlane(probeSent);
    const plane = composedPlane({ entitlements: store, reauthentication: reauth });
    const plan = plane.journey.buildHostedRecipientInformationFormPlan({
      accountId: ACCOUNT_REF,
      useCaseType: "account_update",
      refreshUrl: "https://payswap.example/refresh",
    });
    // mint the proof over the REAL service (the fresh fixture credential probes GetAccount)
    const mint = await reauth.begin({
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      actionDigests: [plane.planDigestOf(plan)],
      freshCredential: FRESH_CREDENTIAL,
    });
    expect(mint.ok).toBe(true);
    expect(probeSent.some((sent) => sent.operationId === "GetAccount")).toBe(true);
    const approval = await plane.hostedFormApproval({ plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    expect(typeof approval.approval.reauthenticationProofRef).toBe("string");
    // single-use: the same scope cannot verify + consume again
    const replay = await plane.hostedFormApproval({ plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.refusal.kind).toBe("REAUTH_REQUIRED");
    }
  });

  it("a proof minted for a DIFFERENT digest does not authorize the hosted form (the digest-scope law)", async () => {
    const { store } = await entitlementStore();
    const probeSent: { operationId: string }[] = [];
    const reauth = realReauthenticationPlane(probeSent);
    const plane = composedPlane({ entitlements: store, reauthentication: realReauthenticationPlane(probeSent) });
    const plan = plane.journey.buildHostedRecipientInformationFormPlan({
      accountId: ACCOUNT_REF,
      useCaseType: "account_update",
      refreshUrl: "https://payswap.example/refresh",
    });
    const mint = await reauth.begin({
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      actionDigests: ["connect-account-link:acct_other:onboarding"],
      freshCredential: FRESH_CREDENTIAL,
    });
    expect(mint.ok).toBe(true);
    const approval = await plane.hostedFormApproval({ plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(approval.ok).toBe(false);
    if (!approval.ok) {
      expect(approval.refusal.kind).toBe("REAUTH_REQUIRED");
      expect(approval.refusal.detail).toContain("digest");
    }
  });
});

/* -------- the lane + seal + dispatch law -------- */

describe("the lane + seal dispatch law (executePlanOnConnection)", () => {
  async function hostedFormPlanOf(plane: ReturnType<typeof composedPlane>) {
    return plane.journey.buildHostedRecipientInformationFormPlan({
      accountId: ACCOUNT_REF,
      useCaseType: "account_update",
      refreshUrl: "https://payswap.example/refresh",
    });
  }

  it("refuses the typed LANE_NOT_ELIGIBLE for absent, wrong-provider, inactive and LIVE connections (INV-25)", async () => {
    const { store } = await entitlementStore();
    const plane = composedPlane({
      entitlements: store,
      connections: connectionSeam([
        { connectionId: "conn:other", providerId: "paystack", state: "ACTIVE", executionMode: "SANDBOX" },
        { connectionId: "conn:inactive", providerId: "stripe", state: "PENDING", executionMode: "SANDBOX" },
        { connectionId: "conn:live", providerId: "stripe", state: "ACTIVE", executionMode: "LIVE" },
      ]).seam,
    });
    const plan = await hostedFormPlanOf(plane);
    for (const connectionId of ["conn:absent", "conn:other", "conn:inactive", "conn:live"]) {
      const dispatched = await plane.executePlanOnConnection({ plan, connectionId, principalId: PRINCIPAL_ID });
      expect(dispatched.ok).toBe(false);
      if (!dispatched.ok) {
        expect(dispatched.refusal.kind).toBe("LANE_NOT_ELIGIBLE");
      }
    }
  });

  it("the full REAUTH dispatch on an ACTIVE SANDBOX connection: verify + consume BEFORE the wire, then EXECUTED", async () => {
    const { store } = await entitlementStore();
    const probeSent: { operationId: string }[] = [];
    const reauth = realReauthenticationPlane(probeSent);
    const wire: { requests: { readonly url: string; readonly method: string; readonly authorization: string | undefined; readonly idempotencyKey: string | undefined }[] } = { requests: [] };
    const connections = connectionSeam([{ connectionId: CONNECTION_ID, providerId: "stripe", state: "ACTIVE", executionMode: "SANDBOX" }]);
    const plane = composedPlane({ entitlements: store, reauthentication: reauth, connections: connections.seam, fetchImpl: scriptedJourneyFetch(wire) });
    const plan = await hostedFormPlanOf(plane);
    const mint = await reauth.begin({
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      actionDigests: [plane.planDigestOf(plan)],
      freshCredential: FRESH_CREDENTIAL,
    });
    expect(mint.ok).toBe(true);
    const dispatched = await plane.executePlanOnConnection({ plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;
    expect(dispatched.result.kind).toBe("EXECUTED");
    expect(wire.requests).toHaveLength(1);
    expect(wire.requests[0]?.url).toContain("/v2/core/account_links");
    // the sealed credential reached the wire as the Bearer header — and never leaks into the result
    expect(wire.requests[0]?.authorization).toBe(`Bearer ${SEALED_API_KEY}`);
    expect(JSON.stringify(dispatched.result)).not.toContain(SEALED_API_KEY);
    // single-use: the replay cannot dispatch again
    const replay = await plane.executePlanOnConnection({ plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(replay.ok).toBe(false);
  });

  it("a STRONG_CONFIRM plan demands the marker (never self-approved); with it the outbound payment executes idempotently", async () => {
    const { store } = await entitlementStore();
    await store.record({
      treasuryEntitlement: { financialAccountId: "fa_test_entitled", entitlementObserved: true },
      funding: { fundedMinorUnits: 10_000_000, currency: "USD" },
      recordedBy: "operator:fixture",
      recordedAt: NOW_ISO,
    });
    const wire: { requests: { readonly url: string; readonly method: string; readonly authorization: string | undefined; readonly idempotencyKey: string | undefined }[] } = { requests: [] };
    const connections = connectionSeam([{ connectionId: CONNECTION_ID, providerId: "stripe", state: "ACTIVE", executionMode: "SANDBOX" }]);
    const plane = composedPlane({ entitlements: store, connections: connections.seam, fetchImpl: scriptedJourneyFetch(wire) });
    const planned = plane.buildOutboundPaymentPlan({
      journey: journeyBaseline(),
      financialAccountId: "fa_test_entitled",
      destination: { type: "financial_account", financialAccount: "fa_test_dest" },
      idempotencyKey: "idem-fixture-outbound-1",
    });
    expect(planned.kind).toBe("PLAN");
    if (planned.kind !== "PLAN") return;
    const refused = await plane.executePlanOnConnection({ plan: planned.plan, connectionId: CONNECTION_ID, principalId: PRINCIPAL_ID });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.kind).toBe("STRONG_CONFIRM_MARKER_REQUIRED");
    }
    const dispatched = await plane.executePlanOnConnection({
      plan: planned.plan,
      connectionId: CONNECTION_ID,
      principalId: PRINCIPAL_ID,
      approval: plane.strongConfirmApproval({ principalId: PRINCIPAL_ID, idempotencyKey: "idem-fixture-outbound-1" }),
    });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;
    expect(dispatched.result.kind).toBe("EXECUTED");
    if (dispatched.result.kind !== "EXECUTED") return;
    expect(dispatched.result.idempotencyKeyBound).toBe(true);
    expect(wire.requests[0]?.url).toContain("/v1/treasury/outbound_payments");
    expect(wire.requests[0]?.idempotencyKey).toBe("idem-fixture-outbound-1");
  });
});
