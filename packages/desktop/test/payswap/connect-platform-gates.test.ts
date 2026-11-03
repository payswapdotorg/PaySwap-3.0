/**
 * PaySwap Desktop (P27-A) — the CONNECT PLATFORM GATES battery: the typed
 * operator-gate surface for the Stripe U2/U3 forms (run card §B, mapped
 * 1:1). Machine-checks:
 * - the absent platform credentials → the typed UNCONFIGURED verdict
 *   carrying the exact §B.1/§B.4 items;
 * - a live-shaped platform secret → LIVE_REFUSED at THIS edge (INV-25);
 * - the absent §B.2 decisions → typed UNDECIDED gates (never defaults);
 * - the webhook endpoint gate requires BOTH the endpoint URL (§B.3) and
 *   the whsec_-shaped signing secret (§B.4);
 * - §B.5 (business-model approval) is never satisfiable by code — the
 *   standing typed UNCONFIGURED verdict is a deliverable;
 * - the capability-consistency law (recipient service agreement carries
 *   transfers only — the 2026-11-03 live-doc re-verification);
 * - the escape law: no gate record carries secret-shaped material.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateStripeConnectPlatformGates,
  isAccountModelDecision,
  isTopologyDecision,
  validateAccountModelCapabilityConsistency,
  STRIPE_CONNECT_BUSINESS_MODEL_APPROVAL_ITEM,
} from "../../src/host/payswap/stripe/connect-platform-gates.js";

const SATISFIED_CREDENTIALS = {
  platformClientId: "ca_TESTPLATFORM0000000000000000",
  platformClientSecret: "sk_test_PLATFORMSECRET00000000000000",
  connectWebhookSecret: "whsec_TESTCONNECTSECRET00000000000",
  registeredRedirectUri: "https://payswap.example/stripe/u2/return",
  registeredWebhookEndpointUrl: "https://backend.payswap.example/stripe/connect/webhook",
};

const ACCOUNT_MODEL_DECISION: import("../../src/host/payswap/stripe/connect-platform-gates.js").StripeConnectAccountModelDecision = {
  creationModel: "CONTROLLER_PROPERTIES",
  serviceAgreement: "recipient",
  stripeDashboardType: "none",
  feesPayer: "application",
  lossesPayer: "application",
  requirementCollection: "stripe",
  requestedCapabilities: ["transfers"],
  decisionRecordRef: "operator-decision:connect-account-model:2026-11-03",
};

const TOPOLOGY_DECISION: import("../../src/host/payswap/stripe/connect-platform-gates.js").StripeConnectTopologyDecision = {
  chargeModel: "DESTINATION",
  platformCountry: "US",
  merchantOfRecord: "PLATFORM",
  disputeAndRefundLiability: "PLATFORM",
  decisionRecordRef: "operator-decision:connect-topology:2026-11-03",
};

describe("the platform credential gates (§B.1/§B.4)", () => {
  it("no credentials at all → the typed UNCONFIGURED verdict with the exact §B items", () => {
    const gates = evaluateStripeConnectPlatformGates({ credentials: {}, decisions: {} });
    expect(gates.platformCredentials.kind).toBe("UNCONFIGURED");
    if (gates.platformCredentials.kind !== "UNCONFIGURED") return;
    expect(gates.platformCredentials.missingItems).toHaveLength(2);
    expect(gates.platformCredentials.missingItems[0]).toContain("STRIPE_PLATFORM_CLIENT_ID");
    expect(gates.platformCredentials.missingItems[1]).toContain("STRIPE_PLATFORM_CLIENT_SECRET");
    expect(gates.platformCredentials.missingItems[1]).toContain("run card §B.1");
  });

  it("INV-25: a live-shaped platform secret is refused at this edge", () => {
    const gates = evaluateStripeConnectPlatformGates({
      credentials: {
        ...SATISFIED_CREDENTIALS,
        platformClientSecret: "sk_live_" + "PLATFORMSECRET000000000000",
      },
      decisions: {},
    });
    expect(gates.platformCredentials.kind).toBe("LIVE_REFUSED");
  });

  it("satisfied credentials → SATISFIED (verified only by real provider answers)", () => {
    const gates = evaluateStripeConnectPlatformGates({
      credentials: SATISFIED_CREDENTIALS,
      decisions: {},
    });
    expect(gates.platformCredentials.kind).toBe("SATISFIED");
  });
});

describe("the §B.3 registration gates", () => {
  it("the redirect-URL gate carries the §B.3 item when absent", () => {
    const gates = evaluateStripeConnectPlatformGates({ credentials: {}, decisions: {} });
    expect(gates.registeredRedirectUri.kind).toBe("UNCONFIGURED");
    expect(gates.registeredRedirectUri.kind === "UNCONFIGURED" && gates.registeredRedirectUri.missingItems[0]).toContain("run card §B.3");
  });

  it("the webhook gate requires BOTH the endpoint URL and the whsec_-shaped secret", () => {
    const withoutEither = evaluateStripeConnectPlatformGates({ credentials: {}, decisions: {} });
    expect(withoutEither.connectWebhookEndpoint.kind).toBe("UNCONFIGURED");
    if (withoutEither.connectWebhookEndpoint.kind !== "UNCONFIGURED") return;
    expect(withoutEither.connectWebhookEndpoint.missingItems).toHaveLength(2);

    const wrongShape = evaluateStripeConnectPlatformGates({
      credentials: { ...SATISFIED_CREDENTIALS, connectWebhookSecret: "not-a-whsec" },
      decisions: {},
    });
    expect(wrongShape.connectWebhookEndpoint.kind).toBe("UNCONFIGURED");
    if (wrongShape.connectWebhookEndpoint.kind !== "UNCONFIGURED") return;
    expect(wrongShape.connectWebhookEndpoint.missingItems[0]).toContain("whsec_");

    const satisfied = evaluateStripeConnectPlatformGates({
      credentials: SATISFIED_CREDENTIALS,
      decisions: {},
    });
    expect(satisfied.connectWebhookEndpoint.kind).toBe("SATISFIED");
  });
});

describe("the §B.2 decision gates (never a default guess)", () => {
  it("absent decisions → the typed UNDECIDED verdicts with the §B.2 items", () => {
    const gates = evaluateStripeConnectPlatformGates({
      credentials: SATISFIED_CREDENTIALS,
      decisions: {},
    });
    expect(gates.accountModelDecision.kind).toBe("UNCONFIGURED");
    expect(gates.accountModelDecision.kind === "UNCONFIGURED" && gates.accountModelDecision.missingItems[0]).toContain("run card §B.2");
    expect(gates.topologyDecision.kind).toBe("UNCONFIGURED");
    expect(gates.topologyDecision.kind === "UNCONFIGURED" && gates.topologyDecision.missingItems[0]).toContain("charge model");
  });

  it("recorded decisions → SATISFIED with the decision-record reference in the detail", () => {
    const gates = evaluateStripeConnectPlatformGates({
      credentials: SATISFIED_CREDENTIALS,
      decisions: { accountModel: ACCOUNT_MODEL_DECISION, topology: TOPOLOGY_DECISION },
    });
    expect(gates.accountModelDecision.kind).toBe("SATISFIED");
    expect(gates.accountModelDecision.kind === "SATISFIED" && gates.accountModelDecision.detail).toContain("operator-decision:connect-account-model:2026-11-03");
    expect(gates.topologyDecision.kind).toBe("SATISFIED");
    expect(gates.topologyDecision.kind === "SATISFIED" && gates.topologyDecision.detail).toContain("DESTINATION");
  });

  it("malformed decision shapes fail the structural validation (fail-closed)", () => {
    expect(isAccountModelDecision({ ...ACCOUNT_MODEL_DECISION, serviceAgreement: "weird" })).toBe(false);
    expect(isAccountModelDecision({ ...ACCOUNT_MODEL_DECISION, decisionRecordRef: "" })).toBe(false);
    expect(isTopologyDecision({ ...TOPOLOGY_DECISION, platformCountry: "usa" })).toBe(false);
    expect(isTopologyDecision({ ...TOPOLOGY_DECISION, chargeModel: "SHARED" })).toBe(false);
    expect(isAccountModelDecision(ACCOUNT_MODEL_DECISION)).toBe(true);
    expect(isTopologyDecision(TOPOLOGY_DECISION)).toBe(true);
  });

  it("the recipient service agreement cannot request card_payments (2026-11-03 live-doc law)", () => {
    const inconsistent = validateAccountModelCapabilityConsistency({
      ...ACCOUNT_MODEL_DECISION,
      requestedCapabilities: ["transfers", "card_payments"] as ("transfers" | "card_payments")[],
    });
    expect(inconsistent.ok).toBe(false);
    if (!inconsistent.ok) {
      expect(inconsistent.reason).toContain("recipient service agreement");
    }
    expect(validateAccountModelCapabilityConsistency(ACCOUNT_MODEL_DECISION).ok).toBe(true);
    expect(
      validateAccountModelCapabilityConsistency({
        ...ACCOUNT_MODEL_DECISION,
        serviceAgreement: "full",
        requestedCapabilities: ["transfers"] as ("transfers" | "card_payments")[],
      }).ok,
    ).toBe(true);
  });
});

describe("the §B.5 approval gate (never satisfiable by code)", () => {
  it("stays the standing typed UNCONFIGURED verdict — a deliverable, not a failure", () => {
    const gates = evaluateStripeConnectPlatformGates({
      credentials: SATISFIED_CREDENTIALS,
      decisions: { accountModel: ACCOUNT_MODEL_DECISION, topology: TOPOLOGY_DECISION },
    });
    expect(gates.businessModelApproval.kind).toBe("UNCONFIGURED");
    expect(
      gates.businessModelApproval.kind === "UNCONFIGURED" &&
        gates.businessModelApproval.missingItems[0],
    ).toBe(STRIPE_CONNECT_BUSINESS_MODEL_APPROVAL_ITEM);
  });
});

describe("the escape law", () => {
  it("no gate record carries secret-shaped material (fail-closed throw on leak)", () => {
    expect(() =>
      evaluateStripeConnectPlatformGates({
        credentials: { ...SATISFIED_CREDENTIALS, platformClientSecret: "sk_test_" + "A".repeat(40) },
        decisions: {},
      }),
    ).not.toThrow();
    // The record retains only verdicts + non-secret detail — the secret
    // never appears in the serialized record.
    const gates = evaluateStripeConnectPlatformGates({
      credentials: { ...SATISFIED_CREDENTIALS, platformClientSecret: "sk_test_" + "B".repeat(40) },
      decisions: {},
    });
    expect(JSON.stringify(gates)).not.toContain("BBBB");
    expect(JSON.stringify(gates)).not.toContain(SATISFIED_CREDENTIALS.connectWebhookSecret);
  });
});
