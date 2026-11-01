/**
 * @payswap/app — the STRIPE PREPARED-ACTION PINS mirror verification
 * (P24-3, ADR-0017 D10).
 *
 * The composer lane consumes the FROZEN two-phase action contracts
 * (packages/desktop/src/host/payswap/stripe/
 * prepared-action-contracts.ts — P24-0's frozen seam) and the
 * provider-runtime overlay vocabularies
 * (packages/provider-runtime/src/adapters/stripe/catalogue/overlay.ts —
 * the desktop contracts' own declared single source) through
 * STRUCTURAL PINS in src/agent/stripePreparedActionPins.ts — the
 * substrate layer law keeps @payswap/* imports out of app src (the TL
 * wires real imports at P24-D integration). THIS test imports the
 * accepted sources DIRECTLY (test-only — the established pin-mirror
 * discipline, see agent-task-pin-mirror.test.ts) and asserts the pins
 * match the sources:
 *
 * - every RUNTIME vocabulary (effect classes, approval tiers, support
 *   states) equals the overlay constants EXACTLY (same literals, same
 *   order);
 * - the type-only frozen unions (environments, account models) are
 *   probed with typed members — the probe both compiles against the
 *   frozen union AND equals the pin at runtime (drift fails here);
 * - a COMPLETE frozen-contract StripePreparedAction probe validates
 *   through the app-side requireValidPreparedActionPin (the wiring's
 *   read-side gate) and every malformed drift refuses typed;
 * - all four frozen execution-outcome kinds validate through
 *   requireValidExecutionOutcome (UNKNOWN stays first-class).
 *
 * Drift between a pin and its source fails HERE — detectable at test
 * time, never discovered in production.
 */
import { describe, expect, it } from "vitest";

import {
  STRIPE_APPROVAL_TIERS,
  STRIPE_EFFECT_CLASSES,
  STRIPE_SUPPORT_STATES,
} from "../../../provider-runtime/src/adapters/stripe/catalogue/overlay.ts";
import type {
  StripeActionAccountContext,
  StripeActionAuthorization,
  StripeActionEffectClass,
  StripeActionEnvironment,
  StripeActionExecutionOutcome,
  StripeActionParameter,
  StripePreparedAction,
} from "../../../desktop/src/host/payswap/stripe/prepared-action-contracts.ts";

import {
  requireValidPreparedActionPin,
  STRIPE_ACCOUNT_MODELS_PIN,
  STRIPE_ACTION_APPROVAL_TIERS_PIN,
  STRIPE_ACTION_EFFECT_CLASSES_PIN,
  STRIPE_ACTION_ENVIRONMENTS_PIN,
  STRIPE_SUPPORT_STATES_PIN,
  type StripePreparedActionPin,
} from "../../src/agent/stripePreparedActionPins.js";
import { requireValidExecutionOutcome } from "../../src/agent/conversationLogEvents.js";

/* --------------- the typed probes (compile against the FROZEN unions) --------------- */

/** Both members of the frozen environment union, in pin order. */
const ENVIRONMENT_PROBES: readonly StripeActionEnvironment[] = ["SANDBOX", "LIVE"];
/** Every member of the frozen accountModel union, in pin order. */
const ACCOUNT_MODEL_PROBES: readonly StripeActionAccountContext["accountModel"][] = [
  "OWN_ACCOUNT_RESTRICTED_KEY",
  "DELEGATED_OAUTH",
  "CONNECT_PLATFORM",
  "CONNECT_CONNECTED_ACCOUNT",
  "ORGANIZATION",
];
/** Every member of the frozen effect-class union (the overlay's runtime order). */
const EFFECT_CLASS_PROBES: readonly StripeActionEffectClass[] = [
  "READ_ONLY",
  "STRIPE_CONFIGURATION_WRITE",
  "CUSTOMER_COMMUNICATION",
  "FINANCIAL_CREATE",
  "FINANCIAL_IRREVERSIBLE_OR_REVERSAL",
  "PERMISSION_OR_CREDENTIAL_ADMIN",
];

/* ------- a COMPLETE frozen-contract probe (the pin validator must accept it) ------- */

const FROZEN_ACCOUNT_CONTEXT: StripeActionAccountContext = {
  connectionId: "conn-1",
  stripeAccountId: "acct_test_mirror",
  accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
  environment: "SANDBOX",
};

const FROZEN_PARAMETERS: readonly StripeActionParameter[] = [
  { name: "name", value: "Annual Membership", location: "body" },
  { name: "unit_amount", value: 12000, location: "body" },
  { name: "id", value: "prod_mirror", location: "path" },
];

const FROZEN_ACTION: StripePreparedAction = {
  preparedActionId: "pa-mirror-1",
  operationId: "PostProducts",
  catalogueRelease: "v2596 / 2026-09-30.endive",
  accountContext: FROZEN_ACCOUNT_CONTEXT,
  parameters: FROZEN_PARAMETERS,
  digest: "sha256:mirror-digest",
  effectClass: "STRIPE_CONFIGURATION_WRITE",
  approvalTier: "CONFIRM",
  confirmationInputs: ["Confirm creating this product"],
  idempotencyKeyRef: "idem-ref-1",
  readBackOperationId: "GetProducts",
  expiresAt: "2026-10-31T13:00:00Z",
  createdBy: "model_proposal",
};

const FROZEN_AUTHORIZATION: StripeActionAuthorization = {
  authorizationId: "auth-mirror-1",
  preparedActionId: "pa-mirror-1",
  approvedDigest: "sha256:mirror-digest",
  approvedByPrincipalId: "principal-1",
  accountContext: FROZEN_ACCOUNT_CONTEXT,
  consumedAt: null,
  expiresAt: "2026-10-31T12:59:00Z",
};

const FROZEN_OUTCOMES: readonly StripeActionExecutionOutcome[] = [
  { kind: "CONFIRMED", providerRefs: ["prod_mirror"], readBackDue: false },
  { kind: "UNKNOWN", reconciliationOperationId: "GetProducts", note: "timeout after possible dispatch" },
  { kind: "FAILED", reason: "VALIDATION", detail: "schema mismatch" },
  { kind: "PROVIDER_REJECTED", httpStatus: 402, providerErrorCode: "card_declined" },
];

/* ------------------------------ the laws ------------------------------ */

describe("the pinned vocabularies mirror the overlay (the declared single source)", () => {
  it("the effect classes match EXACTLY (same literals, same order)", () => {
    expect([...STRIPE_ACTION_EFFECT_CLASSES_PIN]).toEqual([...STRIPE_EFFECT_CLASSES]);
    expect([...STRIPE_ACTION_EFFECT_CLASSES_PIN]).toEqual([...EFFECT_CLASS_PROBES]);
  });

  it("the approval tiers match EXACTLY", () => {
    expect([...STRIPE_ACTION_APPROVAL_TIERS_PIN]).toEqual([...STRIPE_APPROVAL_TIERS]);
    expect([...STRIPE_ACTION_APPROVAL_TIERS_PIN]).toEqual(["NONE", "CONFIRM", "STRONG_CONFIRM", "REAUTH"]);
  });

  it("the support states match EXACTLY (all nine honest states)", () => {
    expect([...STRIPE_SUPPORT_STATES_PIN]).toEqual([...STRIPE_SUPPORT_STATES]);
    expect(STRIPE_SUPPORT_STATES_PIN).toContain("PLANNED_P24_INITIAL_RELEASE");
    expect(STRIPE_SUPPORT_STATES_PIN).toContain("NOT_SUPPORTED_WITH_REASON");
  });

  it("the environments and account models mirror the frozen type-only unions", () => {
    expect([...STRIPE_ACTION_ENVIRONMENTS_PIN]).toEqual([...ENVIRONMENT_PROBES]);
    expect([...STRIPE_ACCOUNT_MODELS_PIN]).toEqual([...ACCOUNT_MODEL_PROBES]);
  });
});

describe("a COMPLETE frozen-contract record validates through the app-side pin", () => {
  it("requireValidPreparedActionPin accepts the frozen StripePreparedAction probe VERBATIM", () => {
    const validated = requireValidPreparedActionPin(FROZEN_ACTION);
    expect(validated.preparedActionId).toBe("pa-mirror-1");
    expect(validated.effectClass).toBe("STRIPE_CONFIGURATION_WRITE");
    expect(validated.parameters).toHaveLength(3);
    // The pinned shape accepts the frozen record field-for-field (the
    // structural mirror: the app reads EXACTLY what the host mints).
    const asPin: StripePreparedActionPin = validated;
    expect(asPin.accountContext.connectionId).toBe("conn-1");
    expect(asPin.readBackOperationId).toBe("GetProducts");
  });

  it("the frozen authorization shape satisfies the pinned reader fields", () => {
    // The app side never mints one — but its pinned type must READ the
    // host-minted artifact field-for-field (the D10 mirror).
    const asRecord: Readonly<Record<string, unknown>> = FROZEN_AUTHORIZATION;
    expect(asRecord.authorizationId).toBe("auth-mirror-1");
    expect(asRecord.consumedAt).toBeNull();
    expect(Object.keys(FROZEN_AUTHORIZATION).sort()).toEqual([
      "accountContext",
      "approvedByPrincipalId",
      "approvedDigest",
      "authorizationId",
      "consumedAt",
      "expiresAt",
      "preparedActionId",
    ]);
  });

  it("malformed drift refuses typed (fail-closed, never a coerced read)", () => {
    expect(() => requireValidPreparedActionPin({ ...FROZEN_ACTION, digest: "" })).toThrow(/digest/);
    expect(() => requireValidPreparedActionPin({ ...FROZEN_ACTION, effectClass: "SUPER_SAFE" })).toThrow(
      /effectClass/,
    );
    expect(() => requireValidPreparedActionPin({ ...FROZEN_ACTION, approvalTier: "WHATEVER" })).toThrow(
      /approvalTier/,
    );
    expect(() => requireValidPreparedActionPin({ ...FROZEN_ACTION, createdBy: "the_model" })).toThrow(
      /createdBy/,
    );
    expect(() => requireValidPreparedActionPin({ ...FROZEN_ACTION, parameters: "nope" })).toThrow(
      /parameters/,
    );
    expect(() => requireValidPreparedActionPin(null)).toThrow(/record/);
  });
});

describe("the frozen execution-outcome kinds validate through the log writer", () => {
  it("all four kinds round-trip (UNKNOWN stays first-class — INV-04)", () => {
    for (const outcome of FROZEN_OUTCOMES) {
      expect(requireValidExecutionOutcome(outcome).kind).toBe(outcome.kind);
    }
    const unknown = requireValidExecutionOutcome(FROZEN_OUTCOMES[1]);
    expect(unknown.kind).toBe("UNKNOWN");
    if (unknown.kind === "UNKNOWN") {
      expect(unknown.reconciliationOperationId).toBe("GetProducts");
    }
  });

  it("malformed outcomes refuse typed", () => {
    expect(() => requireValidExecutionOutcome({ kind: "MAYBE" })).toThrow(/kind/);
    expect(() => requireValidExecutionOutcome({ kind: "CONFIRMED" })).toThrow(/providerRefs/);
    expect(() => requireValidExecutionOutcome({ kind: "FAILED", reason: "JUST_BECAUSE", detail: "x" })).toThrow(
      /reason/,
    );
    expect(() => requireValidExecutionOutcome({ kind: "PROVIDER_REJECTED", httpStatus: "402" })).toThrow(
      /httpStatus/,
    );
    expect(() => requireValidExecutionOutcome("nope")).toThrow(/record/);
  });
});
