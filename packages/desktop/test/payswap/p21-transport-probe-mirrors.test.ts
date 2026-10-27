/**
 * PaySwap Desktop (P21-A) — the TRANSPORT + PROBE MIRROR-FIDELITY
 * battery: the host-side REAL HTTPS transports + verification probes
 * (connections/host-https-transports.ts + verification-probes.ts) are
 * STRUCTURAL MIRRORS of the canonical @payswap/provider-runtime
 * contracts (the desktop host layer law: no @payswap/* imports at
 * runtime — the payments-contract-mirrors precedent). This test imports
 * the REAL contracts from the TEST TIER (where cross-package source
 * imports are lawful) and asserts behavioral fidelity: drift between a
 * mirror and its source is a DEFECT, caught here.
 *
 * The fidelity laws:
 * - ENDPOINT PARITY: the same operation id drives the same URL + HTTP
 *   method through the canonical transport and the host mirror (the
 *   fake fetch records every call).
 * - RESPONSE PARITY: identical fake-fetch answers classify to
 *   structurally identical transport responses (delivered/status/body/
 *   provider error code+message/failure kind).
 * - PROBE PARITY: the canonical probes and the host probes classify
 *   the same transport answers to the same outcome/provider references/
 *   account ref/livemode/failure/ambiguity — the caller-trust fix rides
 *   a mirror that cannot drift from the canonical evidence semantics.
 */

import { describe, expect, it } from "vitest";

import {
  FlutterwaveHttpsTransport,
  PaystackHttpsTransport,
  StripeHttpsTransport,
  createFlutterwaveVerificationProbe,
  createPaystackVerificationProbe,
  createStripeVerificationProbe,
} from "../../../provider-runtime/src/index.js";
import {
  createFlutterwaveHostTransport,
  createPaystackHostTransport,
  createStripeHostTransport,
  createHostFlutterwaveVerificationProbe,
  createHostPaystackVerificationProbe,
  createHostStripeVerificationProbe,
  type HostFetch,
  type HostTransport,
} from "../../src/host/payswap/connections/index.js";

/** One recorded fetch call (URL + method — never the headers: they carry the secret). */
interface RecordedCall {
  readonly url: string;
  readonly method: string;
}

/** A scripted fetch: answers by URL, records every call. */
function scriptedFetch(script: Record<string, { status: number; body: string } | "REJECT">): {
  readonly fetchImpl: HostFetch;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (
    url: string,
    init: { readonly method: "GET" | "POST" },
  ): Promise<{ status: number; text(): Promise<string> }> => {
    calls.push({ url, method: init.method });
    const answer = script[url];
    if (answer === undefined) {
      throw new Error(`no scripted answer for ${url}`);
    }
    if (answer === "REJECT") {
      throw new Error("connection lost (scripted)");
    }
    return { status: answer.status, text: async () => answer.body };
  };
  return { fetchImpl, calls };
}

/** The classification-relevant projection of a transport response (no free-text detail). */
function projectResponse(response: {
  readonly delivered: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly failure?: { readonly kind: string };
}): unknown {
  return {
    delivered: response.delivered,
    ...(response.status !== undefined ? { status: response.status } : {}),
    ...(response.body !== undefined ? { body: response.body } : {}),
    ...(response.providerErrorCode !== undefined ? { providerErrorCode: response.providerErrorCode } : {}),
    ...(response.providerErrorMessage !== undefined
      ? { providerErrorMessage: response.providerErrorMessage }
      : {}),
    ...(response.failure !== undefined ? { failureKind: response.failure.kind } : {}),
  };
}

const STRIPE_BALANCE_URL = "https://api.stripe.com/v1/balance";
const STRIPE_ACCOUNT_URL = "https://api.stripe.com/v1/account";
const FLW_BALANCES_URL = "https://api.flutterwave.com/v3/balances";
const PAYSTACK_TRANSACTIONS_URL = "https://api.paystack.co/transaction";

const CALL = {
  operationId: "stub",
  idempotencyKey: "idem-1",
  params: {},
  headers: {},
  correlationId: "corr-1",
} as const;

describe("the host HTTPS transports mirror the canonical transports (endpoint + response parity)", () => {
  it("stripe: the same operation drives the same URL + method, and identical answers classify identically", async () => {
    for (const [operationId, url] of [
      ["stripe.balance.read", STRIPE_BALANCE_URL],
      ["stripe.account.read", STRIPE_ACCOUNT_URL],
    ] as const) {
      const script = { [url]: { status: 200, body: '{"object":"balance"}' } };
      const canonicalScript = scriptedFetch(script);
      const hostScript = scriptedFetch(script);
      const canonical = new StripeHttpsTransport({ fetchImpl: canonicalScript.fetchImpl });
      const host = createStripeHostTransport(hostScript.fetchImpl);
      const canonicalAnswer = await canonical.send({ ...CALL, operationId });
      const hostAnswer = await host.send({ ...CALL, operationId });
      expect(projectResponse(hostAnswer)).toEqual(projectResponse(canonicalAnswer));
      expect(hostScript.calls).toEqual(canonicalScript.calls);
      expect(hostScript.calls[0]!.method).toBe("GET");
      expect(host.transportId).toBe(canonical.transportId);
    }
  });

  it("stripe: an error status carries the provider error envelope identically (the canonical error reader)", async () => {
    const script = {
      [STRIPE_BALANCE_URL]: {
        status: 401,
        body: JSON.stringify({ error: { type: "invalid_request_error", code: "invalid_api_key", message: "Invalid API Key provided" } }),
      },
    };
    const canonical = new StripeHttpsTransport({ fetchImpl: scriptedFetch(script).fetchImpl });
    const host = createStripeHostTransport(scriptedFetch(script).fetchImpl);
    const canonicalAnswer = await canonical.send({ ...CALL, operationId: "stripe.balance.read" });
    const hostAnswer = await host.send({ ...CALL, operationId: "stripe.balance.read" });
    expect(projectResponse(hostAnswer)).toEqual(projectResponse(canonicalAnswer));
    expect(hostAnswer.providerErrorCode).toBe("invalid_api_key");
  });

  it("flutterwave + paystack: endpoint + response parity over the read-only operations", async () => {
    const flwScript = { [FLW_BALANCES_URL]: { status: 200, body: '{"status":"success","data":[]}' } };
    const canonicalFlw = new FlutterwaveHttpsTransport({ fetchImpl: scriptedFetch(flwScript).fetchImpl });
    const hostFlw = createFlutterwaveHostTransport(scriptedFetch(flwScript).fetchImpl);
    expect(
      projectResponse(await hostFlw.send({ ...CALL, operationId: "flutterwave.balances.read" })),
    ).toEqual(
      projectResponse(await canonicalFlw.send({ ...CALL, operationId: "flutterwave.balances.read" })),
    );

    const paystackScript = {
      [PAYSTACK_TRANSACTIONS_URL]: { status: 401, body: JSON.stringify({ status: false, message: "Invalid key" }) },
    };
    const canonicalPaystack = new PaystackHttpsTransport({
      fetchImpl: scriptedFetch(paystackScript).fetchImpl,
    });
    const hostPaystack = createPaystackHostTransport(scriptedFetch(paystackScript).fetchImpl);
    expect(
      projectResponse(await hostPaystack.send({ ...CALL, operationId: "paystack.transactions.read" })),
    ).toEqual(
      projectResponse(
        await canonicalPaystack.send({ ...CALL, operationId: "paystack.transactions.read" }),
      ),
    );
    expect(hostPaystack.transportId).toBe(canonicalPaystack.transportId);
  });

  it("an unknown operation id is refused before dispatch identically (fail-closed endpoint maps)", async () => {
    const canonical = new StripeHttpsTransport({ fetchImpl: scriptedFetch({}).fetchImpl });
    const host = createStripeHostTransport(scriptedFetch({}).fetchImpl);
    expect(
      projectResponse(await host.send({ ...CALL, operationId: "stripe.nonsense.read" })),
    ).toEqual(projectResponse(await canonical.send({ ...CALL, operationId: "stripe.nonsense.read" })));
  });

  it("a lost connection is UNDELIVERED with the same ambiguity kind (INV-04 parity)", async () => {
    const canonical = new FlutterwaveHttpsTransport({
      fetchImpl: scriptedFetch({ [FLW_BALANCES_URL]: "REJECT" }).fetchImpl,
    });
    const host = createFlutterwaveHostTransport(scriptedFetch({ [FLW_BALANCES_URL]: "REJECT" }).fetchImpl);
    const canonicalAnswer = await canonical.send({ ...CALL, operationId: "flutterwave.balances.read" });
    const hostAnswer = await host.send({ ...CALL, operationId: "flutterwave.balances.read" });
    expect(projectResponse(hostAnswer)).toEqual(projectResponse(canonicalAnswer));
    expect(hostAnswer.failure?.kind).toBe("CONNECTION_LOST_AFTER_DISPATCH");
  });
});

/** A shared fake transport both the canonical and host probes ride (scripted by operation id).
 *  Typed to satisfy BOTH transport contracts: the canonical ProviderTransport
 *  (the frozen failure-kind union) and the host HostTransport (whose failure.kind
 *  is the wider string — a canonical-typed response satisfies both structurally). */
function fakeTransport(script: Record<string, unknown>): import("../../../provider-runtime/src/index.js").ProviderTransport & HostTransport {
  const send = async (call: { readonly operationId: string }): Promise<import("../../../provider-runtime/src/index.js").ProviderTransportResponse> => {
    const answer = script[call.operationId];
    if (answer === "REJECT") {
      return { delivered: false, failure: { kind: "CONNECTION_LOST_AFTER_DISPATCH" } };
    }
    return answer as import("../../../provider-runtime/src/index.js").ProviderTransportResponse;
  };
  return { transportId: "fake-mirror", transportClass: "PRODUCTION_HTTP", send };
}

/** The canonical clock ({now(), monotonic()} — the RuntimeClock shape; TimestampMs is bigint). */
const canonicalClock = { now: () => 1_000_000n, monotonic: () => 1n };

/** The host probe clock (millisecond number — the host-side edge shape). */
const nowMs = () => 1_000_000;

/** The common-field projection of a probe result (the mirror's fidelity surface). */
function projectProbe(result: {
  readonly outcome: string;
  readonly providerReferences: readonly string[];
  readonly accountRef?: string | null;
  readonly providerLiveMode?: boolean | null;
  readonly transportId: string;
  readonly failure?: { readonly code: string; readonly message: string; readonly retryable: boolean; readonly keyRejected: boolean };
  readonly ambiguityReason?: string;
}): unknown {
  return {
    outcome: result.outcome,
    providerReferences: [...result.providerReferences],
    ...(result.accountRef ? { accountRef: result.accountRef } : {}),
    ...(typeof result.providerLiveMode === "boolean" ? { providerLiveMode: result.providerLiveMode } : {}),
    ...(result.failure !== undefined ? { failure: result.failure } : {}),
    ...(result.ambiguityReason !== undefined ? { ambiguityReason: result.ambiguityReason } : {}),
  };
}

const STRIPE_MATERIAL = { apiKey: "sk" + "_test_FAKE51mirrorDoNotUse01" };
const FLW_MATERIAL = { apiKey: "FLWSECK_TEST-" + "FAKE51mirrorDoNotUse02" };
const PAYSTACK_MATERIAL = { apiKey: "sk" + "_test_FAKE51mirrorDoNotUse03" };

describe("the host verification probes mirror the canonical probes (classification + extraction parity)", () => {
  it("stripe CONFIRMED: the same balance+account answers classify to the same evidence", async () => {
    const script = {
      "stripe.balance.read": { delivered: true, status: 200, body: { object: "balance", available: [{ amount: 1, currency: "usd" }] } },
      "stripe.account.read": { delivered: true, status: 200, body: { id: "acct_FAKE0001", livemode: false } },
    };
    const canonical = createStripeVerificationProbe({ transport: fakeTransport(script), clock: canonicalClock, executionMode: "SANDBOX" });
    const host = createHostStripeVerificationProbe({ transport: fakeTransport(script), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await host(STRIPE_MATERIAL))).toEqual(projectProbe(await canonical(STRIPE_MATERIAL)));
  });

  it("stripe livemode mismatch: the same FAILED classification (INV-25 separation)", async () => {
    const script = {
      "stripe.balance.read": { delivered: true, status: 200, body: {} },
      "stripe.account.read": { delivered: true, status: 200, body: { id: "acct_FAKE0001", livemode: true } },
    };
    const canonical = createStripeVerificationProbe({ transport: fakeTransport(script), clock: canonicalClock, executionMode: "SANDBOX" });
    const host = createHostStripeVerificationProbe({ transport: fakeTransport(script), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await host(STRIPE_MATERIAL))).toEqual(projectProbe(await canonical(STRIPE_MATERIAL)));
  });

  it("stripe 401: the same FAILED key-rejection classification (sanitized message, both sides)", async () => {
    const script = {
      "stripe.balance.read": {
        delivered: true,
        status: 401,
        body: { error: { code: "invalid_api_key", message: "Invalid API Key provided" } },
        providerErrorCode: "invalid_api_key",
        providerErrorMessage: "Invalid API Key provided",
      },
    };
    const canonical = createStripeVerificationProbe({ transport: fakeTransport(script), clock: canonicalClock, executionMode: "SANDBOX" });
    const host = createHostStripeVerificationProbe({ transport: fakeTransport(script), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await host(STRIPE_MATERIAL))).toEqual(projectProbe(await canonical(STRIPE_MATERIAL)));
    const hostResult = await host(STRIPE_MATERIAL);
    expect(hostResult.failure?.keyRejected).toBe(true);
    expect(hostResult.failure?.message).not.toContain("Invalid API Key provided");
  });

  it("stripe malformed account body: the same UNKNOWN classification (never a fabricated CONFIRMED)", async () => {
    const script = {
      "stripe.balance.read": { delivered: true, status: 200, body: {} },
      "stripe.account.read": { delivered: true, status: 200, body: { no: "id" } },
    };
    const canonical = createStripeVerificationProbe({ transport: fakeTransport(script), clock: canonicalClock, executionMode: "SANDBOX" });
    const host = createHostStripeVerificationProbe({ transport: fakeTransport(script), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await host(STRIPE_MATERIAL))).toEqual(projectProbe(await canonical(STRIPE_MATERIAL)));
  });

  it("flutterwave CONFIRMED: the same currency-wallet extraction", async () => {
    const script = {
      "flutterwave.balances.read": {
        delivered: true,
        status: 200,
        body: { status: "success", data: [{ currency: "NGN" }, { currency: "KES" }] },
      },
    };
    const canonical = createFlutterwaveVerificationProbe({ transport: fakeTransport(script), clock: canonicalClock, executionMode: "SANDBOX" });
    const host = createHostFlutterwaveVerificationProbe({ transport: fakeTransport(script), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await host(FLW_MATERIAL))).toEqual(projectProbe(await canonical(FLW_MATERIAL)));
  });

  it("flutterwave malformed body: the same UNKNOWN classification; paystack CONFIRMED parity", async () => {
    const malformed = {
      "flutterwave.balances.read": { delivered: true, status: 200, body: { status: "success", data: "nope" } },
    };
    const canonical = createFlutterwaveVerificationProbe({ transport: fakeTransport(malformed), clock: canonicalClock, executionMode: "SANDBOX" });
    const host = createHostFlutterwaveVerificationProbe({ transport: fakeTransport(malformed), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await host(FLW_MATERIAL))).toEqual(projectProbe(await canonical(FLW_MATERIAL)));

    const transactions = {
      "paystack.transactions.read": {
        delivered: true,
        status: 200,
        body: { status: true, data: [{ id: 30483271 }, { id: 30483272 }] },
      },
    };
    const canonicalPaystack = createPaystackVerificationProbe({ transport: fakeTransport(transactions), clock: canonicalClock, executionMode: "SANDBOX" });
    const hostPaystack = createHostPaystackVerificationProbe({ transport: fakeTransport(transactions), nowMs, executionMode: "SANDBOX" });
    expect(projectProbe(await hostPaystack(PAYSTACK_MATERIAL))).toEqual(
      projectProbe(await canonicalPaystack(PAYSTACK_MATERIAL)),
    );
  });

  it("the host probe is an additive structural SUPERSET only: the credential class + balance currencies (the bridge facts)", async () => {
    const script = {
      "stripe.balance.read": { delivered: true, status: 200, body: { available: [{ amount: 1, currency: "usd" }] } },
      "stripe.account.read": { delivered: true, status: 200, body: { id: "acct_FAKE0001", livemode: false } },
    };
    const host = createHostStripeVerificationProbe({ transport: fakeTransport(script), nowMs, executionMode: "SANDBOX" });
    const result = await host(STRIPE_MATERIAL);
    // The additive facts (never secret material): the credential class
    // (the grant-derivation input) + the balance currencies read.
    expect(result.keyClass).toBe("FULL_TEST");
    expect(result.balanceCurrencies).toEqual(["USD"]);
    expect(JSON.stringify(result)).not.toContain(STRIPE_MATERIAL.apiKey);
  });
});
