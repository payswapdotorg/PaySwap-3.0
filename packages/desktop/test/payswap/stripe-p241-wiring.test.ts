/**
 * PaySwap Desktop (P24-2) — the P24-1 REAL-WIRING battery, part 1:
 * THE JOIN LAWS + THE REAL SCHEMA VALIDATOR behind the host port.
 *
 * The adapters live in stripe-p241-wiring-adapters.ts (the executable
 * P24-D composition recipe); the transport + the full two-phase flow
 * live in stripe-p241-wiring-flow.test.ts (the file-size law).
 *
 * LAWS PROVEN HERE:
 * - every IMPLEMENTED operation in the real census resolves a REAL
 *   schema record (no dispatch can hit NO_SCHEMA_RECORD);
 * - the read-back routes come from the REAL registry (never a hand
 *   copy), with the honest null for reads;
 * - the idempotency classification rides the census view (v1
 *   state-changing POSTs only);
 * - the REAL strict validator normalizes real parameters (the digest
 *   binds the REAL normalized form) and refuses unknown fields, wrong
 *   types and schema-less operations through the host port.
 */

import { describe, expect, it } from "vitest";
import { stripeOperationSchema } from "../../../provider-runtime/src/adapters/stripe/catalogue/schema-reader.js";
import { STRIPE_P24_IMPLEMENTED_OPERATIONS } from "../../../provider-runtime/src/adapters/stripe/catalogue/implemented-operations.js";
import type { StripeActionParameter } from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import { realCensusPort, realSchemaValidator } from "./stripe-p241-wiring-adapters.js";

const CUSTOMER_PARAMS: readonly StripeActionParameter[] = [
  { name: "email", value: "member@example.test", location: "body" },
  { name: "name", value: "Annual Membership Buyer", location: "body" },
];

describe("the REAL join laws (P24-1 artifacts × the host census port)", () => {
  it("every IMPLEMENTED operation resolves a REAL schema record (no dispatch can hit NO_SCHEMA_RECORD)", () => {
    const census = realCensusPort();
    expect(STRIPE_P24_IMPLEMENTED_OPERATIONS.size).toBeGreaterThan(0);
    for (const operationId of STRIPE_P24_IMPLEMENTED_OPERATIONS) {
      expect(census.resolve(operationId), operationId).toBeDefined();
      expect(census.dispatchAllowed(operationId), operationId).toBe(true);
      expect(stripeOperationSchema(operationId), operationId).toBeDefined();
    }
  });

  it("the read-back routes come from the REAL registry (never the mirrors-test hand copy)", () => {
    const census = realCensusPort();
    expect(census.resolve("PostCustomers")?.readBackOperationId).toBe("GetCustomersCustomer");
    expect(census.resolve("PostRefunds")?.readBackOperationId).toBe("GetRefundsRefund");
    // A read carries the honest null (never an invented verification).
    expect(census.resolve("GetCustomers")?.readBackOperationId).toBeNull();
  });

  it("the idempotency classification rides the census view (v1 state-changing POSTs only)", () => {
    const census = realCensusPort();
    expect(census.resolve("PostCustomers")?.idempotencyKeyAllowed).toBe(true);
    expect(census.resolve("GetCustomers")?.idempotencyKeyAllowed).toBe(false);
    // A DELETE never takes a header key (ambiguity resolves by read-back).
    expect(census.resolve("DeleteProductsId")?.idempotencyKeyAllowed).toBe(false);
    // A v2 POST has no v1 header-replay contract.
    expect(census.resolve("PostV2BillingMeterEventStream")?.idempotencyKeyAllowed).toBe(false);
  });
});

describe("the REAL schema validator behind the host port", () => {
  it("normalizes real parameters (the digest binds the REAL normalized form)", async () => {
    const validator = realSchemaValidator();
    const outcome = await validator.validate("PostCustomers", CUSTOMER_PARAMS);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.normalized.map((p) => `${p.location}:${p.name}`).sort()).toEqual([
        "body:email",
        "body:name",
      ]);
    }
  });

  it("refuses an unknown body field through the port (fail-closed, typed)", async () => {
    const validator = realSchemaValidator();
    const outcome = await validator.validate("PostCustomers", [
      ...CUSTOMER_PARAMS,
      { name: "notARealCustomerField", value: "x", location: "body" },
    ]);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.refusal.kind).toBe("UNKNOWN_PARAMETER");
  });

  it("refuses a wrong-typed value through the port", async () => {
    const validator = realSchemaValidator();
    const outcome = await validator.validate("PostCustomers", [
      { name: "email", value: 42, location: "body" },
    ]);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.refusal.kind).toBe("INVALID_VALUE");
  });

  it("refuses a missing REQUIRED body field through the port", async () => {
    const validator = realSchemaValidator();
    // PostPaymentIntents requires amount (the body schema's required set).
    const outcome = await validator.validate("PostPaymentIntents", [
      { name: "currency", value: "usd", location: "body" },
    ]);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.refusal.kind).toBe("MISSING_REQUIRED_PARAMETER");
  });

  it("refuses an operation with no schema record as UNKNOWN_OPERATION", async () => {
    const validator = realSchemaValidator();
    const outcome = await validator.validate("NotARealOperation", CUSTOMER_PARAMS);
    expect(outcome.ok === false && outcome.refusal.kind).toBe("UNKNOWN_OPERATION");
  });
});
