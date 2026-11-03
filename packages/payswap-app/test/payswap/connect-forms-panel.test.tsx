/**
 * @payswap/app — the CONNECT FORMS PANEL battery (P27-A, NET-NEW;
 * jsdom — no network, no clock; the component is pure presentation over
 * the pins).
 *
 * Machine-checks:
 * - BOTH connect forms render (U2 then U3 — the pinned order) with the
 *   two-half state: the UNCONFIGURED operator gate AND the KEY_READY
 *   machinery line;
 * - the EXACT §B-mapped missing-operator items render verbatim (never a
 *   dead button, never a simulated flow);
 * - the INV-30 purpose-gate disclosure renders on the U3 card only;
 * - the seed action answers the typed OPERATOR_GATED verdict (rendered
 *   verbatim with the item count — the honest answer);
 * - ZERO FINANCIAL AUTHORITY: the panel renders NO key inputs of any
 *   kind (no text/password fields exist on the surface).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { ConnectFormsPanel } from "../../src/console/sections/ConnectFormsPanel.js";
import {
  CONNECT_FORMS_GATE_NOTE,
  CONNECT_LANE_U3_VIEW_PIN,
  CONNECT_PURPOSE_GATE_DISCLOSURE_PIN,
} from "../../src/pins/connect-form-pins.js";

afterEach(() => {
  cleanup();
});

describe("the connect forms panel (both forms, the honest two-half state)", () => {
  it("renders both connect forms in the pinned order with the gate note", () => {
    render(<ConnectFormsPanel />);
    expect(screen.getByTestId("ps-connect-forms-panel")).toBeDefined();
    expect(screen.getByText(CONNECT_FORMS_GATE_NOTE)).toBeDefined();
    const cards = screen.getAllByTestId(/^ps-connect-form-stripe-u[23]-/);
    expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual([
      "ps-connect-form-stripe-u2-existing-account-grant",
      "ps-connect-form-stripe-u3-marketplace-connected-accounts",
    ]);
  });

  it("each card renders the UNCONFIGURED pill, the KEY_READY machinery line and every §B-mapped item verbatim", () => {
    render(<ConnectFormsPanel />);
    const pills = screen.getAllByText("Not connected — operator gated");
    expect(pills.length).toBe(2);
    const u3Machinery = screen.getByTestId(
      "ps-connect-form-machinery-stripe-u3-marketplace-connected-accounts",
    );
    expect(u3Machinery.textContent).toContain("KEY_READY");
    for (const item of CONNECT_LANE_U3_VIEW_PIN.missingOperatorConfiguration) {
      expect(screen.getAllByText(item).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("the INV-30 purpose-gate disclosure renders on the U3 card only", () => {
    render(<ConnectFormsPanel />);
    expect(
      screen.getByTestId("ps-connect-form-purpose-gate-stripe-u3-marketplace-connected-accounts"),
    ).toBeDefined();
    expect(
      screen.getByTestId("ps-connect-form-purpose-gate-stripe-u3-marketplace-connected-accounts")
        .textContent,
    ).toContain("Connect is not unrestricted P2P");
    expect(
      screen.queryByTestId("ps-connect-form-purpose-gate-stripe-u2-existing-account-grant"),
    ).toBeNull();
    expect(screen.getAllByText(CONNECT_PURPOSE_GATE_DISCLOSURE_PIN).length).toBe(1);
  });
});

describe("the seed action (the typed OPERATOR_GATED verdict, never a simulated flow)", () => {
  it("seeding an UNCONFIGURED form renders the honest OPERATOR_GATED answer with the item count", () => {
    render(<ConnectFormsPanel />);
    const seed = screen.getByTestId("ps-connect-form-seed-stripe-u2-existing-account-grant");
    fireEvent.click(seed);
    const result = screen.getByTestId(
      "ps-connect-form-seed-result-stripe-u2-existing-account-grant",
    );
    expect(result.textContent).toContain("OPERATOR_GATED");
    expect(result.textContent).toContain("4 operator items stand open");
    expect(result.textContent).toContain("nothing is simulated");
  });

  it("the U3 seed verdict carries its own item count (the §B.2 model + liability decisions)", () => {
    render(<ConnectFormsPanel />);
    fireEvent.click(
      screen.getByTestId("ps-connect-form-seed-stripe-u3-marketplace-connected-accounts"),
    );
    const result = screen.getByTestId(
      "ps-connect-form-seed-result-stripe-u3-marketplace-connected-accounts",
    );
    expect(result.textContent).toContain("5 operator items stand open");
  });
});

describe("zero financial authority (the surface law)", () => {
  it("the panel renders NO credential inputs of any kind", () => {
    render(<ConnectFormsPanel />);
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });
});
