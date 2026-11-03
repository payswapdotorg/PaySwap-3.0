/**
 * PaySwap Desktop (P27-A) — the CONNECT CONNECTION VIEWS battery: the
 * connection-plane surface for the Stripe U2/U3 forms. Machine-checks:
 * - MIRROR FIDELITY: the connect-lane views mirror the REAL registry rows
 *   field-for-field (the provider-registry-mirror precedent — the pin
 *   never drifts from the canonical declaration).
 * - THE HONEST STATE: both forms stay UNCONFIGURED with the exact §B-mapped
 *   items AND the machinery state KEY_READY (the two-half honesty).
 * - THE SEED VERB: with the form UNCONFIGURED, seeding returns the typed
 *   OPERATOR_GATED verdict (never a dead button, never a simulated flow);
 *   with a CONFIGURED override the same verb seeds the demand-side task.
 * - THE PURPOSE-GATE DISCLOSURE rides the U3 view (INV-30) and never the U2.
 * - The projection onto the shared DesktopProviderFormView contract.
 */

import { describe, expect, it } from "vitest";
import { STRIPE_REGISTRY_ENTRY } from "../../../provider-runtime/src/adapters/stripe/declaration.ts";
import {
  CONNECT_LANE_FORM_VIEWS,
  CONNECT_LANE_U2_VIEW,
  CONNECT_LANE_U3_VIEW,
  CONNECT_PURPOSE_GATE_DISCLOSURE,
  connectLaneViewAsProviderFormView,
  seedConnectSetupTask,
} from "../../src/host/payswap/connections/connect-connection-views.js";

const U2 = STRIPE_REGISTRY_ENTRY.forms.find((f) => f.useCaseRef === "existing-account-grant")!;
const U3 = STRIPE_REGISTRY_ENTRY.forms.find((f) => f.useCaseRef === "marketplace-connected-accounts")!;

describe("mirror fidelity (the pin never drifts from the canonical declaration)", () => {
  it("the U2 view mirrors the registry row field-for-field", () => {
    expect(CONNECT_LANE_U2_VIEW.useCaseRef).toBe(U2.useCaseRef);
    expect(CONNECT_LANE_U2_VIEW.form).toBe(U2.form);
    expect(CONNECT_LANE_U2_VIEW.status).toBe(U2.status);
    expect([...CONNECT_LANE_U2_VIEW.missingOperatorConfiguration]).toEqual([
      ...(U2.missingOperatorConfiguration ?? []),
    ]);
  });

  it("the U3 view mirrors the registry row field-for-field", () => {
    expect(CONNECT_LANE_U3_VIEW.useCaseRef).toBe(U3.useCaseRef);
    expect(CONNECT_LANE_U3_VIEW.form).toBe(U3.form);
    expect(CONNECT_LANE_U3_VIEW.status).toBe(U3.status);
    expect([...CONNECT_LANE_U3_VIEW.missingOperatorConfiguration]).toEqual([
      ...(U3.missingOperatorConfiguration ?? []),
    ]);
  });

  it("the registry order is pinned: U2 then U3", () => {
    expect(CONNECT_LANE_FORM_VIEWS.map((view) => view.formId)).toEqual([
      "stripe-u2-existing-account-grant",
      "stripe-u3-marketplace-connected-accounts",
    ]);
  });
});

describe("the honest two-half state (UNCONFIGURED + KEY_READY)", () => {
  it("both forms stay honestly UNCONFIGURED with the machinery key-ready", () => {
    for (const view of CONNECT_LANE_FORM_VIEWS) {
      expect(view.status).toBe("UNCONFIGURED");
      expect(view.machineryState).toBe("KEY_READY");
      expect(view.missingOperatorConfiguration.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("the U2 items map to run card §B.1/§B.3/§B.4/§B.5; the U3 items to §B.1-§B.5", () => {
    const u2Items = CONNECT_LANE_U2_VIEW.missingOperatorConfiguration.join(" ");
    expect(u2Items).toContain("§B.1");
    expect(u2Items).toContain("§B.3");
    expect(u2Items).toContain("§B.5");
    const u3Items = CONNECT_LANE_U3_VIEW.missingOperatorConfiguration.join(" ");
    expect(u3Items).toContain("§B.2");
    expect(u3Items).toContain("§B.3");
    expect(u3Items).toContain("STRIPE_CONNECT_WEBHOOK_SECRET");
  });

  it("the purpose-gate disclosure rides the U3 view only (INV-30)", () => {
    expect(CONNECT_LANE_U3_VIEW.purposeGateDisclosure).toBe(CONNECT_PURPOSE_GATE_DISCLOSURE);
    expect(CONNECT_PURPOSE_GATE_DISCLOSURE).toContain("Connect is not unrestricted P2P");
    expect(CONNECT_LANE_U2_VIEW.purposeGateDisclosure).toBeNull();
  });
});

describe("the setup-seed verb (never a dead button, never a simulated flow)", () => {
  it("an UNCONFIGURED form returns the typed OPERATOR_GATED verdict with the exact items", () => {
    const result = seedConnectSetupTask({
      formId: "stripe-u2-existing-account-grant",
      nowIso: "2026-11-03T12:00:00.000Z",
    });
    expect(result.kind).toBe("OPERATOR_GATED");
    if (result.kind !== "OPERATOR_GATED") return;
    expect(result.machineryState).toBe("KEY_READY");
    expect(result.missingItems).toEqual(U2.missingOperatorConfiguration);
  });

  it("a CONFIGURED form (the P27-E wiring after the operator configuration lands) seeds the demand-side task", () => {
    const result = seedConnectSetupTask({
      formId: "stripe-u2-existing-account-grant",
      nowIso: "2026-11-03T12:00:00.000Z",
      statusOverride: "CONFIGURED",
    });
    expect(result.kind).toBe("SEEDED");
    if (result.kind !== "SEEDED") return;
    expect(result.task.useCaseRef).toBe("existing-account-grant");
    expect(result.task.machineryState).toBe("KEY_READY");
    expect(result.task.seededAt).toBe("2026-11-03T12:00:00.000Z");
  });

  it("an unknown form id is the typed UNKNOWN_FORM refusal", () => {
    const result = seedConnectSetupTask({ formId: "not-a-form", nowIso: "2026-11-03T12:00:00.000Z" });
    expect(result.kind).toBe("UNKNOWN_FORM");
  });
});

describe("the shared-contract projection", () => {
  it("projects onto the DesktopProviderFormView shape the renderer already consumes", () => {
    const projected = connectLaneViewAsProviderFormView(CONNECT_LANE_U3_VIEW);
    expect(projected.useCaseRef).toBe("marketplace-connected-accounts");
    expect(projected.form).toBe("CONNECTED_ACCOUNT");
    expect(projected.status).toBe("UNCONFIGURED");
    expect(projected.credentialKind).toBe("PROVIDER_DEFINED");
    expect([...projected.missingOperatorConfiguration]).toEqual([...(U3.missingOperatorConfiguration ?? [])]);
  });
});
