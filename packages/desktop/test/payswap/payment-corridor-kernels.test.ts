/**
 * PaySwap Desktop (P22-H, ADR-0016 D2/D4/D8/D9) — the CORRIDOR KERNELS
 * battery: the Paystack payout kernel + the Stellar onchain kernel +
 * their read-backs + the per-provider kernel table.
 *
 * Machine-checks the laws against the REAL kernels over scripted
 * transport seams + fake connection authorities (the
 * payment-execution-kernel precedent — the fake seal mirrors the
 * broker's escape-scan THROW):
 *
 * - THE PAYSTACK GRANT (D8): sk_test_ in SANDBOX derives the payout
 *   grant (the transfer initiate reaches the transport with the leg's
 *   planned amount + recipient); sk_live_ is MODE_NOT_OFFERED (INV-25);
 *   CANCEL is not offered (the honest read-back law); a 2xx without
 *   the transfer shape is UNKNOWN (never a guessed success).
 * - THE STELLAR GRANT (D9/INV-25): the kernel is SANDBOX on
 *   stellar:testnet only (any other mode is MODE_NOT_OFFERED — a
 *   pubnet-shaped target is never offered); the StrKey shapes
 *   re-validate inside the seal on every dispatch; the TRANSFER path
 *   submits the issuer-scoped asset payment; the DEPLOY path requires
 *   its plan refs (sourceHash + bytecodeHash) and submits the
 *   contract-deployment operation.
 * - THE READ-BACKS: the Paystack transfer-verify and the Stellar
 *   transaction read (+ the deployment evidence derivation — the
 *   observed C… contract id, never a plan guess).
 * - THE KERNEL TABLE (D8): stripe + paystack + stellar:testnet carry
 *   kernels; an ACTIVE SANDBOX flutterwave lane is honestly
 *   NO_AUTHORITY_WIRED (F3 stays byte-identical).
 */

import { describe, expect, it } from "vitest";

import {
  createPaystackExecutionKernel,
  KERNEL_PAYSTACK_OPERATION_IDS,
} from "../../src/host/payswap/payments/paystack-execution-kernel.js";
import {
  createPaystackTransferReadBack,
} from "../../src/host/payswap/payments/paystack-read-back.js";
import {
  createStellarExecutionKernel,
  KERNEL_STELLAR_OPERATION_IDS,
} from "../../src/host/payswap/payments/stellar-execution-kernel.js";
import {
  createStellarReadBack,
  deploymentEvidenceOf,
} from "../../src/host/payswap/payments/stellar-read-back.js";
import {
  createLaneAwareExecutionAuthority,
} from "../../src/host/payswap/payments/execution-lane-composition.js";
import type { PaymentDispatchCommand } from "../../src/host/payswap/payments/execution-authority.js";
import type { KernelTransportResponse } from "../../src/host/payswap/payments/execution-kernel.js";

/** Fake test keys (non-contiguous construction — never real keys). */
const FAKE_PAYSTACK_KEY = "sk" + "_test_FAKE51paystackDoNotUse07";
const FAKE_PAYSTACK_LIVE_KEY = "sk" + "_live_FAKE51liveDoNotUse0012";
const FAKE_G_ACCOUNT = "G" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
const FAKE_S_SECRET = "S" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".repeat(2).slice(0, 55);
const FAKE_G_DESTINATION = "G" + "BCDEFGHIJKLMNOPQRSTUVWXYZA234567".repeat(2).slice(0, 55);
const FAKE_C_CONTRACT = "C" + "DEFGHIJKLMNOPQRSTUVWXYZAB234567".repeat(2).slice(0, 55);
const FAKE_ISSUER = "G" + "EFGHIJKLMNOPQRSTUVWXYZABC234567".repeat(2).slice(0, 55);

/** A scripted transport seam (captures calls; replays scripted responses). */
function scriptedTransport(script: KernelTransportResponse[]) {
  const calls: unknown[] = [];
  let index = 0;
  return {
    transportId: "scripted-seam",
    calls,
    async send(call: unknown): Promise<KernelTransportResponse> {
      calls.push(call);
      const response = script[Math.min(index, script.length - 1)];
      index += 1;
      return response ?? { delivered: false, failure: { kind: "CONNECTION_LOST_AFTER_DISPATCH" } };
    },
  };
}

/** The fake connection authority (the escape-scan law mirrored for BOTH material shapes). */
function fakeAuthority(input: {
  material: unknown;
  providerId?: string;
  state?: string;
  executionMode?: string;
  connectionId?: string;
}) {
  const connectionId = input.connectionId ?? "conn:corridor-kernel-test";
  return {
    connectionId,
    async connectionStatuses() {
      return [
        {
          connectionId,
          providerId: input.providerId ?? "paystack",
          state: input.state ?? "ACTIVE",
          executionMode: input.executionMode ?? "SANDBOX",
        },
      ];
    },
    async withSealedCredential<T>(
      id: string,
      consumer: (material: unknown) => T,
      context: string,
    ): Promise<Awaited<T>> {
      if (id !== connectionId) {
        throw new Error("UNKNOWN_CONNECTION");
      }
      const result = await consumer(input.material);
      const secrets =
        input.material !== null && typeof input.material === "object"
          ? Object.values(input.material as Record<string, unknown>).filter(
              (value): value is string => typeof value === "string" && value.length >= 8,
            )
          : [String(input.material)];
      const text = JSON.stringify(result, (_key, item) =>
        typeof item === "bigint" ? item.toString() : item,
      );
      for (const secret of secrets) {
        if (text.includes(secret)) {
          throw new Error(`a sealed secret string leaked through the consumer result (context: ${context})`);
        }
      }
      return result;
    },
  };
}

/** The dispatch command (minimal lawful shape; leg optional). */
function command(overrides: Partial<PaymentDispatchCommand> = {}): PaymentDispatchCommand {
  return {
    attemptId: "attempt:1",
    operation: "CREATE_EXTERNAL_EFFECT",
    intent: {
      intentId: "intent:1",
      principalRef: "principal:test",
      origin: { locationRef: "flw:wallet:GHS", currency: "GHS", observationRef: "obs:1" },
      destination: { locationRef: "merchant:kes-bank", currency: "KES", observationRef: "obs:2" },
      originAmount: { currency: "GHS", minorUnits: "100000" },
      arrivalCurrency: "KES",
      constraints: { maxSettlementMs: 86_400_000, maxRouteHops: 4 },
      intentAuthorizationRef: "auth:1",
      declaredAt: 1,
      expiresAt: 2,
      commerceRef: "commerce:1",
    },
    authorizationArtifactId: "artifact:1",
    idempotencyKey: "idem:1",
    commandId: "command:1",
    correlationId: "corr:1",
    connectionRef: "conn:corridor-kernel-test",
    executionMode: "SANDBOX",
    ...overrides,
  };
}

const KES_LEG = {
  legIndex: 3,
  legKind: "OFF_RAMP_PAYOUT" as const,
  lane: { kind: "PROVIDER" as const, id: "paystack" },
  plannedAmount: { currency: "KES", minorUnits: "1612500" },
  destinationRef: "RCP_p22_kes_bank",
};

const TRANSFER_LEG = {
  legIndex: 2,
  legKind: "ONCHAIN_TRANSFER" as const,
  lane: { kind: "ONCHAIN_CHAIN" as const, id: "stellar:testnet" },
  plannedAmount: { currency: "USDC", minorUnits: "1250000000" },
  destinationRef: FAKE_G_DESTINATION,
  assetRef: `stellar:testnet/asset:USDC:${FAKE_ISSUER}`,
};

const DEPLOY_LEG = {
  legIndex: 1,
  legKind: "PSP_STABLECOIN_ISSUANCE" as const,
  lane: { kind: "ONCHAIN_CHAIN" as const, id: "stellar:testnet" },
  plannedAmount: { currency: "USDC", minorUnits: "0" },
  destinationRef: FAKE_G_DESTINATION,
  assetRef: `stellar:testnet/asset:USDC:${FAKE_ISSUER}`,
  deploy: { sourceHash: "src_p22_hash_0001", bytecodeHash: "wasm_p22_hash_0001" },
};

const TRANSFER_OK: KernelTransportResponse = {
  delivered: true,
  status: 200,
  body: {
    status: true,
    message: "Transfer created",
    data: { reference: "ref_p22_transfer", transfer_code: "TRF_p22x", status: "pending" },
  },
};

const SUBMIT_OK: KernelTransportResponse = {
  delivered: true,
  status: 200,
  body: { id: "tx_p22_hash_0001", success: true },
};

describe("the Paystack payout kernel (D8 — the KES off-ramp lane)", () => {
  it("an sk_test_ key in SANDBOX derives the payout grant: the leg's planned amount + recipient reach the transfer initiate", async () => {
    const transport = scriptedTransport([TRANSFER_OK]);
    const kernel = createPaystackExecutionKernel({
      connectionAuthority: fakeAuthority({ material: { apiKey: FAKE_PAYSTACK_KEY } }),
      transport,
    });
    const answer = await kernel.dispatch(command({ leg: KES_LEG }));
    expect(answer.kind).toBe("ENVELOPE");
    if (answer.kind !== "ENVELOPE") return;
    expect(answer.envelope.outcome).toBe("CONFIRMED");
    expect(answer.envelope.providerReferences).toContain("TRF_p22x");
    expect(answer.envelope.providerReferences).toContain("ref_p22_transfer");
    const call = transport.calls[0] as { operationId: string; params: Record<string, string> };
    expect(call.operationId).toBe(KERNEL_PAYSTACK_OPERATION_IDS.initiate);
    expect(call.params["amount"]).toBe("1612500");
    expect(call.params["recipient"]).toBe("RCP_p22_kes_bank");
    expect(call.params["currency"]).toBe("kes");
    expect(call.params["source"]).toBe("balance");
  });

  it("sk_live_ is MODE_NOT_OFFERED (INV-25 — the second wall behind the seal verb)", async () => {
    const transport = scriptedTransport([TRANSFER_OK]);
    const kernel = createPaystackExecutionKernel({
      connectionAuthority: fakeAuthority({ material: { apiKey: FAKE_PAYSTACK_LIVE_KEY } }),
      transport,
    });
    const answer = await kernel.dispatch(command({ leg: KES_LEG }));
    expect(answer.kind).toBe("REFUSED");
    if (answer.kind !== "REFUSED") return;
    expect(answer.refusal.kind).toBe("MODE_NOT_OFFERED");
    expect(answer.refusal.reason).toContain("INV-25");
    expect(transport.calls).toHaveLength(0);
  });

  it("CANCEL is not offered: a transfer, once initiated, reconciles — never a fabricated reversal", async () => {
    const transport = scriptedTransport([TRANSFER_OK]);
    const kernel = createPaystackExecutionKernel({
      connectionAuthority: fakeAuthority({ material: { apiKey: FAKE_PAYSTACK_KEY } }),
      transport,
    });
    const answer = await kernel.dispatch(command({ operation: "CANCEL_OR_REVERSE_EFFECT" }));
    expect(answer.kind).toBe("REFUSED");
    if (answer.kind !== "REFUSED") return;
    expect(answer.refusal.kind).toBe("COMMAND_REJECTED");
    expect(answer.refusal.reason).toContain("not cancellable");
    expect(transport.calls).toHaveLength(0);
  });

  it("a 2xx without the transfer shape is UNKNOWN (honest finality — never a guessed success)", async () => {
    const transport = scriptedTransport([{ delivered: true, status: 200, body: { status: true, message: "odd" } }]);
    const kernel = createPaystackExecutionKernel({
      connectionAuthority: fakeAuthority({ material: { apiKey: FAKE_PAYSTACK_KEY } }),
      transport,
    });
    const answer = await kernel.dispatch(command({ leg: KES_LEG }));
    expect(answer.kind).toBe("ENVELOPE");
    if (answer.kind !== "ENVELOPE") return;
    expect(answer.envelope.outcome).toBe("UNKNOWN");
  });

  it("the read-back verifies the transfer by reference under the SAME grant law", async () => {
    const transport = scriptedTransport([
      {
        delivered: true,
        status: 200,
        body: {
          status: true,
          message: "Transfer retrieved",
          data: { reference: "ref_p22_transfer", transfer_code: "TRF_p22x", status: "success" },
        },
      },
    ]);
    const readBack = createPaystackTransferReadBack({
      connectionAuthority: fakeAuthority({ material: { apiKey: FAKE_PAYSTACK_KEY } }),
      transport,
    });
    const result = await readBack.readBack({
      connectionRef: "conn:corridor-kernel-test",
      transferReference: "ref_p22_transfer",
      executionMode: "SANDBOX",
    });
    expect(result.outcome).toBe("CONFIRMED");
    expect(result.transferStatus).toBe("success");
    expect(transport.calls[0]).toMatchObject({ operationId: KERNEL_PAYSTACK_OPERATION_IDS.verify });
  });
});

describe("the Stellar onchain kernel (D2/D4/D9 — the rail's SANDBOX lane)", () => {
  it("the TRANSFER path submits the issuer-scoped asset payment (the leg's asset + stroops + destination)", async () => {
    const transport = scriptedTransport([SUBMIT_OK]);
    const kernel = createStellarExecutionKernel({
      connectionAuthority: fakeAuthority({ material: { publicKey: FAKE_G_ACCOUNT, secretKey: FAKE_S_SECRET }, providerId: "stellar:testnet" }),
      transport,
    });
    const answer = await kernel.dispatch(command({ leg: TRANSFER_LEG }));
    expect(answer.kind).toBe("ENVELOPE");
    if (answer.kind !== "ENVELOPE") return;
    expect(answer.envelope.outcome).toBe("CONFIRMED");
    expect(answer.envelope.providerReferences).toContain("tx_p22_hash_0001");
    const call = transport.calls[0] as { operationId: string; params: { operations: Array<Record<string, unknown>> } };
    expect(call.operationId).toBe(KERNEL_STELLAR_OPERATION_IDS.submit);
    expect(call.params.operations[0]?.["operationKind"]).toBe("onchain.transfer");
    expect(call.params.operations[0]?.["destination"]).toBe(FAKE_G_DESTINATION);
    expect(call.params.operations[0]?.["amount"]).toBe("1250000000");
    expect(call.params.operations[0]?.["assetRef"]).toBe(`stellar:testnet/asset:USDC:${FAKE_ISSUER}`);
  });

  it("the DEPLOY path requires its plan refs and submits the contract-deployment operation (D4)", async () => {
    const transport = scriptedTransport([SUBMIT_OK]);
    const kernel = createStellarExecutionKernel({
      connectionAuthority: fakeAuthority({ material: { publicKey: FAKE_G_ACCOUNT, secretKey: FAKE_S_SECRET }, providerId: "stellar:testnet" }),
      transport,
    });
    const answer = await kernel.dispatch(command({ leg: DEPLOY_LEG }));
    expect(answer.kind).toBe("ENVELOPE");
    if (answer.kind !== "ENVELOPE") return;
    expect(answer.envelope.outcome).toBe("CONFIRMED");
    const call = transport.calls[0] as { operationId: string; params: { operations: Array<Record<string, unknown>> } };
    expect(call.params.operations[0]?.["operationKind"]).toBe("onchain.contract_deploy");
    expect(call.params.operations[0]?.["sourceHash"]).toBe("src_p22_hash_0001");
    expect(call.params.operations[0]?.["bytecodeHash"]).toBe("wasm_p22_hash_0001");
    // A deploy leg WITHOUT its plan refs is refused before any dispatch.
    const { deploy: _omitted, ...bareLeg } = DEPLOY_LEG;
    void _omitted;
    const refused = await kernel.dispatch(command({ leg: bareLeg }));
    expect(refused.kind).toBe("REFUSED");
  });

  it("the mode grant law: any mode except SANDBOX is MODE_NOT_OFFERED (a pubnet-shaped target is never offered)", async () => {
    const transport = scriptedTransport([SUBMIT_OK]);
    const kernel = createStellarExecutionKernel({
      connectionAuthority: fakeAuthority({
        material: { publicKey: FAKE_G_ACCOUNT, secretKey: FAKE_S_SECRET },
        providerId: "stellar:testnet",
        executionMode: "LIVE",
      }),
      transport,
    });
    const answer = await kernel.dispatch(command({ leg: TRANSFER_LEG, executionMode: "LIVE" }));
    expect(answer.kind).toBe("REFUSED");
    if (answer.kind !== "REFUSED") return;
    expect(answer.refusal.kind).toBe("MODE_NOT_OFFERED");
    expect(answer.refusal.reason).toContain("pubnet-shaped target is never offered");
    expect(transport.calls).toHaveLength(0);
  });

  it("the read-back verifies the transaction AND observes the deployed contract id (the D4 evidence inputs)", async () => {
    const transport = scriptedTransport([
      { delivered: true, status: 200, body: { id: "tx_p22_hash_0001", success: true } },
      {
        delivered: true,
        status: 200,
        body: { _embedded: { records: [{ type: "invoke_host_function", address: FAKE_C_CONTRACT }] } },
      },
    ]);
    const readBack = createStellarReadBack({
      connectionAuthority: fakeAuthority({ material: { publicKey: FAKE_G_ACCOUNT, secretKey: FAKE_S_SECRET }, providerId: "stellar:testnet" }),
      transport,
    });
    const result = await readBack.readBack({
      connectionRef: "conn:corridor-kernel-test",
      txHash: "tx_p22_hash_0001",
      executionMode: "SANDBOX",
      expectDeployment: true,
    });
    expect(result.outcome).toBe("CONFIRMED");
    expect(result.txSuccess).toBe(true);
    expect(result.contractId).toBe(FAKE_C_CONTRACT);
    // THE DEPLOYMENT EVIDENCE: the observed contract id + the plan hashes.
    const evidence = deploymentEvidenceOf({
      txHash: "tx_p22_hash_0001",
      contractId: result.contractId,
      sourceHash: "src_p22_hash_0001",
      bytecodeHash: "wasm_p22_hash_0001",
    });
    expect(evidence).toEqual({
      txHash: "tx_p22_hash_0001",
      contractId: FAKE_C_CONTRACT,
      sourceHash: "src_p22_hash_0001",
      bytecodeHash: "wasm_p22_hash_0001",
    });
    // NEVER FABRICATED: an evidence record without the observed contract
    // id is null (the pin derives only from a REAL deployment).
    expect(
      deploymentEvidenceOf({
        txHash: "tx_p22_hash_0001",
        contractId: null,
        sourceHash: "src_p22_hash_0001",
        bytecodeHash: "wasm_p22_hash_0001",
      }),
    ).toBeNull();
  });
});

describe("the per-provider kernel table (D8 — the lane composition generalization)", () => {
  it("stripe + paystack + stellar:testnet carry kernels; an ACTIVE SANDBOX flutterwave lane is honestly NO_AUTHORITY_WIRED (F3)", async () => {
    const authority = createLaneAwareExecutionAuthority({
      connectionAuthority: fakeAuthority({ material: { apiKey: FAKE_PAYSTACK_KEY }, providerId: "flutterwave" }),
      fetchImpl: (async () => {
        throw new Error("the table test never dispatches");
      }) as never,
    });
    const answer = await authority.dispatch(command({ leg: KES_LEG }));
    expect(answer.kind).toBe("REFUSED");
    if (answer.kind !== "REFUSED") return;
    expect(answer.refusal.kind).toBe("NO_AUTHORITY_WIRED");
    // F3 stays byte-identical in substance: Flutterwave is read-only by
    // construction; the Paystack payout lane + the rail are the named growths.
    expect(answer.refusal.reason).toContain("Flutterwave is read-only by construction");
    expect(answer.refusal.reason).toContain("Paystack payout lane");
  });
});
