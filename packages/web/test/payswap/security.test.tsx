/**
 * @zcode/web/payswap — security page oracle (ADAPT of payswap.org@8a735bf
 * packages/web/test/security.test.tsx, MMP-36 behavioral oracle).
 *
 * The non-custody and session-isolation explanation. Every commitment on
 * the page must match the repository's structural facts — the tests pin
 * the claims so they cannot drift into marketing (the old suite's law,
 * kept verbatim; the canonical authority vocabulary added where the old
 * page spoke of the old repo's specifics).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SecurityPage } from "../../src/payswap/pages/SecurityPage.js";

function renderSecurity(): string {
  return renderToStaticMarkup(<SecurityPage />);
}

function text(html: string): string {
  return html.replace(/<!--.*?-->/g, "");
}

describe("security page", () => {
  it("states the non-custody model up front", () => {
    const html = text(renderSecurity());
    expect(html).toContain("not another");
    expect(html).toContain("place your money lives");
    expect(html).toContain("never PaySwap custody");
  });

  it("carries the six structural commitments", () => {
    const html = text(renderSecurity());
    expect(html).toContain("PaySwap never holds your money");
    expect(html).toContain("PaySwap never holds your credentials");
    expect(html).toContain("Connections are user-authorized sessions");
    expect(html).toContain("Every financial action carries evidence");
    expect(html).toContain("UNKNOWN is never quietly resolved");
    expect(html).toContain("Fail-closed, everywhere");
  });

  it("explains custody of balances as external observation", () => {
    const html = text(renderSecurity());
    expect(html).toContain("External observations");
    expect(html).toContain("never PaySwap custody");
  });

  it("explains the credential model: vault references by name only", () => {
    const html = text(renderSecurity());
    expect(html).toContain("operator vault");
    expect(html).toContain("PROVIDER_NAME_CREDENTIAL_REF");
    expect(html).toContain("never in Git");
  });

  it("explains session isolation and verified re-authentication", () => {
    const html = text(renderSecurity());
    expect(html).toContain("re-authenticate");
    expect(html).toContain("never quietly continue with stale authority");
    expect(html).toContain("actual account authorization");
  });

  it("explains evidence lineage and UNKNOWN handling", () => {
    const html = text(renderSecurity());
    expect(html).toContain("authorization lineage");
    expect(html).toContain("evidence lineage");
    expect(html).toContain("renders UNKNOWN");
    expect(html).toContain("CONFIRMED, UNKNOWN and FAILED");
    expect(html).toContain("Submission is not finality");
    expect(html).toContain("a payout sent is not beneficiary credit");
  });

  it("carries the security-gate vocabulary law in people language", () => {
    const html = text(renderSecurity());
    expect(html).toContain("BLOCK stays BLOCK");
    expect(html).toContain("UNKNOWN stays UNKNOWN");
    expect(html).toContain("ALLOW never claims blanket trust");
  });

  it("states the honest deployment-phase posture with links onward", () => {
    const html = text(renderSecurity());
    expect(html).toContain("not yet available in this deployment phase");
    expect(html).toContain("honest authentication gate");
    expect(html).toContain("not a demo with fake balances or a pretend login");
    expect(html).toContain('href="/payswap/capabilities"');
    expect(html).toContain('href="/payswap/developers"');
  });
});
