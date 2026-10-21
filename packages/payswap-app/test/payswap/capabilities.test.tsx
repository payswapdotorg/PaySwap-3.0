/**
 * @payswap/app — capabilities page oracle (ADAPT of
 * payswap.org@8a735bf packages/web/test/capabilities.test.tsx, MMP-36
 * behavioral oracle).
 *
 * The honest coverage explorer: VERIFIED / BLOCKED / not-connected are
 * visually and semantically distinct, dates are visible, and MTN MoMo
 * renders as BLOCKED-unavailable. A provider must never appear connected
 * when the recorded evidence says otherwise (the old suite's law, kept
 * verbatim — driven through recorded-evidence-shaped INPUT).
 *
 * ADAPTED ADDITION: the no-evidence state of THIS repository phase (the
 * canonical product has no committed provider evidence) renders the
 * honest empty state — never invented providers.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CapabilitiesPage } from "../../src/pages/CapabilitiesPage.js";
import { foldCoverage } from "../../src/lib/coverage.js";
import { NO_EVIDENCE_COVERAGE } from "../../src/contracts/harness.js";
import { RECORDED_COVERAGE_FIXTURE } from "./fixtures.js";

function renderCapabilities(source = RECORDED_COVERAGE_FIXTURE): string {
  return renderToStaticMarkup(<CapabilitiesPage view={foldCoverage(source)} />);
}

function text(html: string): string {
  return html.replace(/<!--.*?-->/g, "");
}

describe("capabilities page (recorded evidence input)", () => {
  it("distinguishes the three verified connections with verdicts and dates", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("Verified connections");
    expect(html).toContain("Stripe");
    expect(html).toContain("VERIFIED · test-mode");
    expect(html).toContain("Paystack");
    expect(html).toContain("ELIGIBLE · test-mode");
    expect(html).toContain("Flutterwave");
    const raw = renderCapabilities();
    expect(raw).toContain('dateTime="2026-10-02T06:37:38Z"');
    expect(html).toContain("2026-10-02 06:37 UTC");
  });

  it("renders certification numbers and recorded limitations", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("13/13 scenarios passed");
    expect(html).toContain("9/9 scenarios passed");
    expect(html).toContain("P2-W2-003-cross-provider-conformance");
    expect(html).toContain("GHS not routable on this account");
    expect(html).toContain("no payout-execution family");
  });

  it("renders MTN MoMo as BLOCKED and unavailable — never connected", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("Blocked at the provider gate");
    expect(html).toContain("MTN MoMo");
    expect(html).toContain("BLOCKED · unavailable");
    expect(html).toContain("subscription key rejected (HTTP 401)");
    // The blocked provider is not listed among the verified connections.
    const verifiedSection = html.slice(
      html.indexOf("Verified connections"),
      html.indexOf("Blocked at the provider gate"),
    );
    expect(verifiedSection).not.toContain("MTN MoMo");
  });

  it("renders the seven not-connected connectors honestly", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("Built and certified — not connected");
    for (const label of [
      "PayPal Direct",
      "Rapyd",
      "dLocal",
      "Thunes",
      "Adyen",
      "Airwallex",
      "EBANX",
    ]) {
      expect(html).toContain(label);
    }
    const badges = html.match(/not connected · awaiting credentials/g);
    expect(badges?.length).toBe(7);
    expect(html).toContain("no credential exists in the vault");
  });

  it("renders the Stellar local rail as not-a-provider-connection", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("The local rail");
    expect(html).toContain("Stellar (local rail)");
    expect(html).toContain("local rail · not a provider connection");
    expect(html).toContain("user-authorized session path");
  });

  it("renders the supporting services as non-rails with their verdicts", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("Supporting platform services");
    expect(html).toContain("WhatsApp Cloud API");
    expect(html).toContain("SANDBOX-GRADE VERIFIED");
    expect(html).toContain("Resend");
    expect(html).toContain("UNVERIFIED-SEND");
    expect(html).toContain("OpenSanctions");
    expect(html).toContain("VERIFIED for screening integration");
    expect(html).toContain("Not a payment rail");
  });

  it("carries the honesty rules the explorer follows", () => {
    const html = text(renderCapabilities());
    expect(html).toContain("Statuses are rendered verbatim and never upgraded");
    expect(html).toContain("BLOCKED stays BLOCKED");
    expect(html).toContain("never represented as proof of live behavior");
  });
});

describe("capabilities page (the honest no-evidence state of this repository)", () => {
  it("renders the honest empty state — never invented providers", () => {
    const html = text(renderCapabilities(NO_EVIDENCE_COVERAGE));
    expect(html).toContain("No provider evidence is recorded in this deployment");
    expect(html).toContain("invents nothing in the gap");
    // No provider names appear when no evidence is recorded.
    for (const label of ["Stripe", "Paystack", "Flutterwave", "MTN MoMo"]) {
      expect(html).not.toContain(label);
    }
  });
});
