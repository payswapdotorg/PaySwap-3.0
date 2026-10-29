/**
 * PaySwap Desktop (P22-H, ADR-0016 appendix) — the CORRIDOR PIN-MIRROR
 * battery: the host's onchain-rail pins asserted byte-identical against
 * the REAL sibling authorities (the layer law: the host never imports
 * @payswap/*, the TESTS may — the payments-contract-mirrors precedent).
 *
 * The ADR-0016 appendix is the frozen cross-lane vocabulary: the A lane
 * (onchain-domain) and the C lane (route-planning/merchant) landed the
 * authorities; the H lane pinned the SAME literals by value — this
 * battery proves the fidelity (never a re-invention).
 */

import { describe, expect, it } from "vitest";

import {
  PINNED_STELLAR_CHAIN_KEY,
  PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN,
  PINNED_STELLAR_STRKEY_SECRET_PATTERN,
  PINNED_STELLAR_STRKEY_CONTRACT_PATTERN,
  PINNED_CORRIDOR_RELAY_RAIL,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  PINNED_CORRIDOR_LEG_SKELETON,
  PINNED_CORRIDOR_LEG_OUTCOMES,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
  PINNED_CORRIDOR_DIRECTION_CLASSES,
  PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS,
  PINNED_CONTRACT_DEPLOYMENT_EVIDENCE_FIELDS,
  PINNED_ONCHAIN_OPERATION_KINDS,
} from "../../src/host/payswap/connections/onchain-rail-pins.js";

// The REAL sibling authorities (test-tier cross-package imports are lawful).
import {
  STELLAR_STRKEY_ACCOUNT_PATTERN as REAL_ACCOUNT_PATTERN,
  STELLAR_STRKEY_SECRET_PATTERN as REAL_SECRET_PATTERN,
  STELLAR_STRKEY_CONTRACT_PATTERN as REAL_CONTRACT_PATTERN,
} from "../../../onchain-domain/src/family-extensions-stellar.js";
import { CHAIN_FAMILIES } from "../../../onchain-domain/src/family.js";
import { CHAIN_ENVIRONMENT_REGISTRY } from "../../../onchain-adapters/src/environment.js";
import {
  PINNED_STELLAR_CHAIN_KEY as REAL_CHAIN_KEY,
  PINNED_CORRIDOR_RELAY_RAIL as REAL_RELAY_RAIL,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD as REAL_GHS_METHOD,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD as REAL_KES_METHOD,
  PINNED_CORRIDOR_LEG_SKELETON as REAL_SKELETON,
  PINNED_CORRIDOR_LEG_OUTCOMES as REAL_OUTCOMES,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID as REAL_SHAPE_ID,
  PINNED_CORRIDOR_DIRECTION_CLASSES as REAL_DIRECTIONS,
  PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS as REAL_MAX_HOPS,
} from "../../../route-planning/src/pins/corridor.js";
import { PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD as REAL_MERCHANT_KES_METHOD } from "../../../merchant/src/kes-receiving.js";
import { ContractDeploymentEvidence } from "../../../onchain-domain/src/pins-deployment.js";
import { PAYSTACK_OPERATION_ENDPOINTS, PAYSTACK_OPERATION_IDS } from "../../../provider-runtime/src/index.js";
import { KERNEL_PAYSTACK_OPERATION_IDS } from "../../src/host/payswap/payments/paystack-execution-kernel.js";

describe("the D8 lane mirror (provider-runtime — the Paystack transfer surface)", () => {
  it("the host kernel's operation ids mirror the canonical provider-runtime endpoint map", () => {
    expect([...PAYSTACK_OPERATION_IDS]).toContain(KERNEL_PAYSTACK_OPERATION_IDS.initiate);
    expect([...PAYSTACK_OPERATION_IDS]).toContain(KERNEL_PAYSTACK_OPERATION_IDS.finalize);
    expect([...PAYSTACK_OPERATION_IDS]).toContain(KERNEL_PAYSTACK_OPERATION_IDS.verify);
    expect(PAYSTACK_OPERATION_ENDPOINTS.get(KERNEL_PAYSTACK_OPERATION_IDS.initiate)).toEqual({
      method: "POST",
      path: "/transfer",
    });
    expect(PAYSTACK_OPERATION_ENDPOINTS.get(KERNEL_PAYSTACK_OPERATION_IDS.finalize)).toEqual({
      method: "POST",
      path: "/transfer/finalize_transfer",
    });
    expect(PAYSTACK_OPERATION_ENDPOINTS.get(KERNEL_PAYSTACK_OPERATION_IDS.verify)).toEqual({
      method: "GET",
      path: "/transfer",
      pathParam: "id",
    });
  });
});

describe("the A-lane mirrors (onchain-domain — the StrKey + family + evidence pins)", () => {
  it("the StrKey patterns are byte-identical to the A lane's", () => {
    expect(PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.source).toBe(REAL_ACCOUNT_PATTERN.source);
    expect(PINNED_STELLAR_STRKEY_SECRET_PATTERN.source).toBe(REAL_SECRET_PATTERN.source);
    expect(PINNED_STELLAR_STRKEY_CONTRACT_PATTERN.source).toBe(REAL_CONTRACT_PATTERN.source);
    expect(PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.test("G" + "A".repeat(55))).toBe(true);
    expect(PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.test("S" + "A".repeat(55))).toBe(false);
  });

  it("the STELLAR family member + the stellar:testnet environment entry exist on the REAL authorities", () => {
    expect((CHAIN_FAMILIES as readonly string[]).includes("STELLAR")).toBe(true);
    expect(CHAIN_ENVIRONMENT_REGISTRY["stellar:testnet"]).toBe("TESTNET");
    expect(CHAIN_ENVIRONMENT_REGISTRY["stellar:pubnet"]).toBeUndefined();
  });

  it("the deployment evidence record's field set mirrors the REAL type's keys (D4)", () => {
    const sample: ContractDeploymentEvidence = {
      txHash: "tx_1",
      contractId: "C" + "A".repeat(55),
      sourceHash: "src_1",
      bytecodeHash: "wasm_1",
    };
    expect(Object.keys(sample).sort()).toEqual([...PINNED_CONTRACT_DEPLOYMENT_EVIDENCE_FIELDS].sort());
  });

  it("the onchain operation kinds mirror the REAL vocabulary (transfer + contract_deploy)", () => {
    expect([...PINNED_ONCHAIN_OPERATION_KINDS]).toEqual(["onchain.transfer", "onchain.contract_deploy"]);
  });
});

describe("the C-lane mirrors (route-planning + merchant — the frozen appendix)", () => {
  it("the chain key + the relay rail are byte-identical", () => {
    expect(PINNED_STELLAR_CHAIN_KEY).toBe(REAL_CHAIN_KEY);
    expect(PINNED_STELLAR_CHAIN_KEY).toBe("stellar:testnet");
    expect(PINNED_CORRIDOR_RELAY_RAIL).toEqual(REAL_RELAY_RAIL);
    expect(PINNED_CORRIDOR_RELAY_RAIL).toEqual({ railKind: "ONCHAIN", railKey: "stellar:testnet" });
  });

  it("the funding/payout method pins are byte-identical (never invented twice)", () => {
    expect(PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD).toBe(REAL_GHS_METHOD);
    expect(PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD).toBe("flutterwave_ghs_mobile_money");
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe(REAL_KES_METHOD);
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe(REAL_MERCHANT_KES_METHOD);
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe("paystack_kes_bank_transfer");
  });

  it("the leg skeleton + outcomes + shape id + direction classes + hop bound are byte-identical", () => {
    expect([...PINNED_CORRIDOR_LEG_SKELETON]).toEqual([...REAL_SKELETON]);
    expect([...PINNED_CORRIDOR_LEG_SKELETON]).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect([...PINNED_CORRIDOR_LEG_OUTCOMES]).toEqual([...REAL_OUTCOMES]);
    expect(PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID).toBe(REAL_SHAPE_ID);
    expect([...PINNED_CORRIDOR_DIRECTION_CLASSES]).toEqual([...REAL_DIRECTIONS]);
    expect(PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS).toBe(REAL_MAX_HOPS);
    expect(PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS).toBe(1);
  });
});
