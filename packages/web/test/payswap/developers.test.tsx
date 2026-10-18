/**
 * @zcode/web/payswap — developers page oracle (ADAPT of payswap.org@8a735bf
 * packages/web/test/developers.test.tsx, MMP-36 behavioral oracle).
 *
 * The developer entry point: the API is the authority, and the API runtime
 * configuration renders the honest state — "not configured" (with the env
 * var named, never a fabricated URL) when the base URL is absent, the live
 * base URL when it is present. The ADAPTED oracle additionally pins the
 * canonical consumable contracts (the surface contracts) and the honest
 * refusal to document certified commands before P7-W3 lands them.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DevelopersPage } from "../../src/payswap/pages/DevelopersPage.js";
import type { DevelopersPageView } from "../../src/payswap/contracts/view-models.js";

const DEVELOPER_CONTRACTS: readonly string[] = [
  "The five outcome actions with honest dispatchability facts",
  "The quote/terms disclosure projection — fees, rate provenance, expiry, estimate-vs-guarantee labels",
  "The one-truthful-lifecycle progress states (16 stages)",
  "The BLOCK/ALLOW/UNKNOWN security vocabulary in people language",
  "Exact integer minor-unit money display",
];

const unconfigured: DevelopersPageView["apiRuntime"] = {
  configured: false,
  baseUrl: null,
  envVar: "VITE_PAYSWAP_API_URL",
};

const configured: DevelopersPageView["apiRuntime"] = {
  configured: true,
  baseUrl: "https://api.payswap.example",
  envVar: "VITE_PAYSWAP_API_URL",
};

function renderDevelopers(api: DevelopersPageView["apiRuntime"]): string {
  return renderToStaticMarkup(
    <DevelopersPage view={{ apiRuntime: api, consumableContracts: DEVELOPER_CONTRACTS }} />,
  );
}

function text(html: string): string {
  return html.replace(/<!--.*?-->/g, "");
}

describe("developers page", () => {
  it("states that the API is the authority and the site is one client", () => {
    const html = text(renderDevelopers(unconfigured));
    expect(html).toContain("The API is the authority");
    expect(html).toContain("just one client of it");
    expect(html).toContain("financial truth is protocol-owned");
  });

  it("renders the honest unconfigured state — no fabricated URL", () => {
    const html = text(renderDevelopers(unconfigured));
    expect(html).toContain("Not configured — and shown as such");
    expect(html).toContain("VITE_PAYSWAP_API_URL");
    expect(html).toContain("no API base URL to point you at");
    // No URL is invented when the environment is absent.
    expect(html).not.toMatch(/https:\/\/(?!payswap\.test)/);
  });

  it("renders the live base URL when configured", () => {
    const html = text(renderDevelopers(configured));
    expect(html).toContain("Configured");
    expect(html).toContain("https://api.payswap.example");
    expect(html).not.toContain("Not configured");
  });

  it("names the product/API separation honestly", () => {
    const html = text(renderDevelopers(unconfigured));
    expect(html).toContain("never replaces or shadows the API runtime host");
    expect(html).toContain("integration-time work owned by the Tech Lead");
  });

  it("lists the canonical consumable contracts", () => {
    const html = text(renderDevelopers(unconfigured));
    expect(html).toContain("The contracts you build against today");
    expect(html).toContain("five outcome actions with honest dispatchability facts");
    expect(html).toContain("16 stages");
    expect(html).toContain("BLOCK/ALLOW/UNKNOWN");
    expect(html).toContain("integer minor-unit money display");
  });

  it("refuses to document certified commands before they exist", () => {
    const html = text(renderDevelopers(unconfigured));
    expect(html).toContain("What is deliberately NOT here yet");
    expect(html).toContain("P7-W3");
    expect(html).toContain("this page will not invent them");
  });
});
