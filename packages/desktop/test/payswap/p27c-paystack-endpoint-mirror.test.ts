/**
 * PaySwap Desktop (P27-E, seam C1 — the P27-C lane report §7.1) — the
 * P27-C PAYSTACK ENDPOINT-MIRROR battery: the desktop host's Paystack
 * endpoint map (connections/host-https-transports.ts) must carry the
 * five P27-C operation rows (the recipient plane, the collection
 * surface, the hosted page product) field-for-field against the
 * canonical @payswap/provider-runtime PAYSTACK_OPERATION_ENDPOINTS —
 * the p21-transport-probe-mirrors precedent, scoped to the growth so
 * the big mirror battery stays untouched.
 *
 * THE FIDELITY LAWS (endpoint parity, response parity — hermetic, zero
 * network): the same operation id + params drive the same URL + HTTP
 * method through the canonical transport and the host mirror, and
 * identical scripted answers classify to structurally identical
 * transport responses. A drift between the mirror and the canonical
 * map is a DEFECT, caught here (never a silent divergence).
 */

import { describe, expect, it } from "vitest";

import { PaystackHttpsTransport } from "../../../provider-runtime/src/index.js";
import {
  createPaystackHostTransport,
  type HostFetch,
} from "../../src/host/payswap/connections/index.js";

/** One recorded fetch call (URL + method — never the headers: they carry the secret). */
interface RecordedCall {
  readonly url: string;
  readonly method: string;
}

/** A scripted fetch: answers by URL, records every call (hermetic — zero network). */
function scriptedFetch(script: Record<string, { status: number; body: string }>): {
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
    return { status: answer.status, text: async () => answer.body };
  };
  return { fetchImpl, calls };
}

/** The classification-relevant projection (no free-text detail — the p21 precedent). */
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

const CALL = {
  operationId: "stub",
  idempotencyKey: "idem-p27c",
  params: {},
  headers: {},
  correlationId: "corr-p27c",
} as const;

/** The five P27-C rows: operation id, the params that reach the wire, the expected URL shape. */
const P27C_ROWS = [
  {
    operationId: "paystack.transfer_recipient.create",
    params: { type: "nuban", name: "Fixture Recipient", account_number: "0123456789", bank_code: "058" },
    url: "https://api.paystack.co/transferrecipient",
    method: "POST",
  },
  {
    operationId: "paystack.transfer_recipient.list",
    params: {},
    url: "https://api.paystack.co/transferrecipient",
    method: "GET",
  },
  {
    operationId: "paystack.transaction.initialize",
    params: { email: "fixture@example.test", amount: "50000" },
    url: "https://api.paystack.co/transaction/initialize",
    method: "POST",
  },
  {
    operationId: "paystack.transaction.verify",
    params: { reference: "ref_fixture_0001" },
    url: "https://api.paystack.co/transaction/verify/ref_fixture_0001",
    method: "GET",
  },
  {
    operationId: "paystack.page.create",
    params: { name: "Fixture Store Page" },
    url: "https://api.paystack.co/page",
    method: "POST",
  },
] as const;

describe("the P27-C Paystack endpoint growth mirrors the canonical map (host ↔ provider-runtime)", () => {
  for (const row of P27C_ROWS) {
    it(`${row.operationId}: the same params drive the same URL + method, and identical answers classify identically`, async () => {
      const body = JSON.stringify({ status: true, message: "fixture", data: { reference: "ref_fixture_0001" } });
      const script = { [row.url]: { status: 200, body } };
      const canonicalScript = scriptedFetch(script);
      const hostScript = scriptedFetch(script);
      const canonical = new PaystackHttpsTransport({ fetchImpl: canonicalScript.fetchImpl });
      const host = createPaystackHostTransport(hostScript.fetchImpl);
      const canonicalAnswer = await canonical.send({ ...CALL, operationId: row.operationId, params: { ...row.params } });
      const hostAnswer = await host.send({ ...CALL, operationId: row.operationId, params: { ...row.params } });
      expect(projectResponse(hostAnswer)).toEqual(projectResponse(canonicalAnswer));
      expect(hostScript.calls).toEqual(canonicalScript.calls);
      expect(hostScript.calls[0]!.method).toBe(row.method);
      expect(host.transportId).toBe(canonical.transportId);
    });
  }

  it("the error envelope (the Paystack worded-error reader) classifies identically on the new rows", async () => {
    const script = {
      "https://api.paystack.co/transferrecipient": {
        status: 401,
        body: JSON.stringify({ status: false, message: "Invalid key" }),
      },
    };
    const canonical = new PaystackHttpsTransport({ fetchImpl: scriptedFetch(script).fetchImpl });
    const host = createPaystackHostTransport(scriptedFetch(script).fetchImpl);
    const canonicalAnswer = await canonical.send({ ...CALL, operationId: "paystack.transfer_recipient.create" });
    const hostAnswer = await host.send({ ...CALL, operationId: "paystack.transfer_recipient.create" });
    expect(projectResponse(hostAnswer)).toEqual(projectResponse(canonicalAnswer));
    expect(hostAnswer.providerErrorCode).toBe("error");
  });

  it("an unknown Paystack operation is refused BEFORE dispatch on both sides (fail-closed parity)", async () => {
    const canonical = new PaystackHttpsTransport({ fetchImpl: scriptedFetch({}).fetchImpl });
    const host = createPaystackHostTransport(scriptedFetch({}).fetchImpl);
    const canonicalAnswer = await canonical.send({ ...CALL, operationId: "paystack.not_a_real_operation" });
    const hostAnswer = await host.send({ ...CALL, operationId: "paystack.not_a_real_operation" });
    expect(hostAnswer.delivered).toBe(false);
    expect(hostAnswer.failure?.kind).toBe("REFUSED_BEFORE_DISPATCH");
    expect(canonicalAnswer.delivered).toBe(false);
  });
});
