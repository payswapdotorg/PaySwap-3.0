/**
 * @payswap/app — the CONNECT FORM PINS mirror verification (P27-A,
 * NET-NEW). Same law as provider-connection-pins-mirror.test.ts: the app
 * pins (src/pins/connect-form-pins.ts) are pinned STRUCTURALLY; THIS test
 * imports the REAL desktop host source directly (test-only) and asserts
 * field-for-field equality — drift fails here.
 *
 * Also machine-checks the honesty laws the pins carry:
 * - the two-half state (UNCONFIGURED + KEY_READY) on BOTH forms;
 * - the §B-mapped items (§B.1/§B.2/§B.3/§B.4/§B.5 references);
 * - the INV-30 purpose-gate disclosure on U3 only;
 * - the seed projection: UNCONFIGURED → the typed OPERATOR_GATED verdict.
 */
import { describe, expect, it } from "vitest";
import {
  CONNECT_LANE_FORM_VIEWS,
  CONNECT_LANE_U2_VIEW,
  CONNECT_LANE_U3_VIEW,
  CONNECT_PURPOSE_GATE_DISCLOSURE,
} from "../../../desktop/src/host/payswap/connections/connect-connection-views.js";

import {
  CONNECT_LANE_FORM_VIEWS_PIN,
  CONNECT_LANE_U2_VIEW_PIN,
  CONNECT_LANE_U3_VIEW_PIN,
  CONNECT_PURPOSE_GATE_DISCLOSURE_PIN,
  seedConnectSetupTaskPin,
} from "../../src/pins/connect-form-pins.js";

describe("the connect-form pins mirror the desktop host source (field-for-field)", () => {
  it("the U2 pin mirrors the host's CONNECT_LANE_U2_VIEW", () => {
    expect(CONNECT_LANE_U2_VIEW_PIN.formId).toBe("stripe-u2-existing-account-grant");
    expect(CONNECT_LANE_U2_VIEW_PIN.useCaseRef).toBe(CONNECT_LANE_U2_VIEW.useCaseRef);
    expect(CONNECT_LANE_U2_VIEW_PIN.form).toBe(CONNECT_LANE_U2_VIEW.form);
    expect(CONNECT_LANE_U2_VIEW_PIN.status).toBe(CONNECT_LANE_U2_VIEW.status);
    expect(CONNECT_LANE_U2_VIEW_PIN.machineryState).toBe(CONNECT_LANE_U2_VIEW.machineryState);
    expect([...CONNECT_LANE_U2_VIEW_PIN.missingOperatorConfiguration]).toEqual([
      ...CONNECT_LANE_U2_VIEW.missingOperatorConfiguration,
    ]);
    expect(CONNECT_LANE_U2_VIEW_PIN.purposeGateDisclosure).toBe(
      CONNECT_LANE_U2_VIEW.purposeGateDisclosure,
    );
    expect(CONNECT_LANE_U2_VIEW_PIN.summary).toBe(CONNECT_LANE_U2_VIEW.summary);
  });

  it("the U3 pin mirrors the host's CONNECT_LANE_U3_VIEW", () => {
    expect(CONNECT_LANE_U3_VIEW_PIN.formId).toBe("stripe-u3-marketplace-connected-accounts");
    expect(CONNECT_LANE_U3_VIEW_PIN.useCaseRef).toBe(CONNECT_LANE_U3_VIEW.useCaseRef);
    expect(CONNECT_LANE_U3_VIEW_PIN.form).toBe(CONNECT_LANE_U3_VIEW.form);
    expect(CONNECT_LANE_U3_VIEW_PIN.status).toBe(CONNECT_LANE_U3_VIEW.status);
    expect(CONNECT_LANE_U3_VIEW_PIN.machineryState).toBe(CONNECT_LANE_U3_VIEW.machineryState);
    expect([...CONNECT_LANE_U3_VIEW_PIN.missingOperatorConfiguration]).toEqual([
      ...CONNECT_LANE_U3_VIEW.missingOperatorConfiguration,
    ]);
    expect(CONNECT_LANE_U3_VIEW_PIN.purposeGateDisclosure).toBe(
      CONNECT_LANE_U3_VIEW.purposeGateDisclosure,
    );
    expect(CONNECT_LANE_U3_VIEW_PIN.summary).toBe(CONNECT_LANE_U3_VIEW.summary);
  });

  it("the pinned order matches the host's order (U2 then U3); the purpose-gate disclosure is verbatim", () => {
    expect(CONNECT_LANE_FORM_VIEWS_PIN.map((view) => view.formId)).toEqual(
      CONNECT_LANE_FORM_VIEWS.map((view) => view.formId),
    );
    expect(CONNECT_PURPOSE_GATE_DISCLOSURE_PIN).toBe(CONNECT_PURPOSE_GATE_DISCLOSURE);
  });
});

describe("the honesty laws the pins carry", () => {
  it("both forms stay honestly UNCONFIGURED with KEY_READY machinery (the two-half state)", () => {
    for (const view of CONNECT_LANE_FORM_VIEWS_PIN) {
      expect(view.status).toBe("UNCONFIGURED");
      expect(view.machineryState).toBe("KEY_READY");
      expect(view.missingOperatorConfiguration.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("the items map 1:1 to the P27 run card §B rows", () => {
    const u2 = CONNECT_LANE_U2_VIEW_PIN.missingOperatorConfiguration.join(" ");
    expect(u2).toContain("STRIPE_PLATFORM_CLIENT_ID");
    expect(u2).toContain("STRIPE_PLATFORM_CLIENT_SECRET");
    expect(u2).toContain("redirect/callback URL");
    expect(u2).toContain("§B.5");
    const u3 = CONNECT_LANE_U3_VIEW_PIN.missingOperatorConfiguration.join(" ");
    expect(u3).toContain("STRIPE_CONNECT_WEBHOOK_SECRET");
    expect(u3).toContain("account model");
    expect(u3).toContain("charge model");
    expect(u3).toContain("merchant-of-record");
    expect(u3).toContain("§B.2");
  });

  it("the INV-30 purpose-gate disclosure rides the U3 pin only", () => {
    expect(CONNECT_LANE_U3_VIEW_PIN.purposeGateDisclosure).toBe(
      CONNECT_PURPOSE_GATE_DISCLOSURE_PIN,
    );
    expect(CONNECT_PURPOSE_GATE_DISCLOSURE_PIN).toContain("Connect is not unrestricted P2P");
    expect(CONNECT_LANE_U2_VIEW_PIN.purposeGateDisclosure).toBeNull();
  });

  it("the seed projection answers OPERATOR_GATED with the exact items while UNCONFIGURED (never a simulated seed)", () => {
    const result = seedConnectSetupTaskPin(
      CONNECT_LANE_U3_VIEW_PIN,
      "2026-11-03T12:00:00.000Z",
    );
    expect(result.kind).toBe("OPERATOR_GATED");
    if (result.kind !== "OPERATOR_GATED") return;
    expect(result.machineryState).toBe("KEY_READY");
    expect([...result.missingItems]).toEqual([
      ...CONNECT_LANE_U3_VIEW_PIN.missingOperatorConfiguration,
    ]);
  });
});
