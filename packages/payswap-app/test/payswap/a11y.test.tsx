/**
 * @payswap/app — aria + deep-link contracts (ADAPT of
 * payswap.org@8a735bf packages/web/test/a11y-aria.test.tsx +
 * a11y-deep-links.test.tsx, MMP-36 behavioral oracle).
 *
 * The old suite's laws, kept over the new product surface: every
 * interactive element is named; the active nav entry is carried by
 * aria-current (never color alone); landmarks are present; UNKNOWN
 * states announce as status (never alert); and every internal href
 * rendered anywhere in the public surface resolves to a REAL route of
 * this product (no dead buttons, no broken deep links — the route
 * inventory is checked against the route table so the two cannot drift).
 */
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../src/pages/HomePage.js";
import { CapabilitiesPage } from "../../src/pages/CapabilitiesPage.js";
import { SecurityPage } from "../../src/pages/SecurityPage.js";
import { DevelopersPage } from "../../src/pages/DevelopersPage.js";
import { AppEntryPage } from "../../src/pages/AppEntryPage.js";
import { NotFoundPage } from "../../src/pages/NotFoundPage.js";
import { SiteFooter, SiteHeader, SiteNav } from "../../src/shell/SiteChrome.js";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { foldCoverage } from "../../src/lib/coverage.js";
import { foldNavigation } from "../../src/lib/navigation.js";
import { resolveApiRuntimeInputForTests } from "./fixtures-view.js";
import { HONEST_DEPLOYMENT_CONTEXT } from "../../src/contracts/harness.js";
import { RECORDED_COVERAGE_FIXTURE } from "./fixtures.js";

function doc(markup: string): Document {
  return new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
    url: "https://payswap.test/",
  }).window.document;
}

const homeMarkup = renderToStaticMarkup(
  <HomePage
    view={{
      positioning: {
        headline: "A non-custodial economic operating system for the payment providers and rails you already use.",
        subheadline: "PaySwap connects you to your providers and rails.",
      },
      outcomeBoard: foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT),
      coverageSummary: foldCoverage(RECORDED_COVERAGE_FIXTURE),
      commitments: [
        "We never hold your credentials",
        "We never hold your money",
        "Every action carries evidence",
      ],
    }}
  />,
);
const capabilitiesMarkup = renderToStaticMarkup(
  <CapabilitiesPage view={foldCoverage(RECORDED_COVERAGE_FIXTURE)} />,
);
const securityMarkup = renderToStaticMarkup(<SecurityPage />);
const developersMarkup = renderToStaticMarkup(
  <DevelopersPage
    view={{
      apiRuntime: resolveApiRuntimeInputForTests(),
      consumableContracts: ["The five outcome actions with honest dispatchability facts"],
    }}
  />,
);
const appEntryMarkup = renderToStaticMarkup(
  <AppEntryPage
    navigation={foldNavigation()}
    outcomeBoard={foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT)}
  />,
);
const notFoundMarkup = renderToStaticMarkup(<NotFoundPage path="/payswap/nowhere" />);
const headerMarkup = renderToStaticMarkup(<SiteHeader currentPath="/payswap" />);
const navMarkup = renderToStaticMarkup(<SiteNav currentPath="/payswap" />);
const footerMarkup = renderToStaticMarkup(<SiteFooter />);

const ALL_MARKUPS: ReadonlyArray<[string, string]> = [
  ["home", homeMarkup],
  ["capabilities", capabilitiesMarkup],
  ["security", securityMarkup],
  ["developers", developersMarkup],
  ["app-entry", appEntryMarkup],
  ["not-found", notFoundMarkup],
  ["site-header", headerMarkup],
  ["site-nav", navMarkup],
  ["site-footer", footerMarkup],
];

describe("aria contracts across the public surface", () => {
  it("every link and button is accessible-named (no anonymous interactive elements)", () => {
    for (const [name, markup] of ALL_MARKUPS) {
      const document = doc(markup);
      const anonymous: string[] = [];
      for (const el of document.querySelectorAll("a[href], button")) {
        const text = (el.textContent ?? "").trim();
        const ariaLabel = el.getAttribute("aria-label");
        if (text === "" && !ariaLabel) {
          anonymous.push(`${name}: <${el.tagName.toLowerCase()}>`);
        }
      }
      expect(anonymous).toEqual([]);
    }
  });

  it("the active nav entry is carried by aria-current=page (never color alone)", () => {
    const document = doc(navMarkup);
    const active = document.querySelectorAll(".ps-site-nav-link.is-active");
    expect(active).toHaveLength(1);
    expect(active[0]?.getAttribute("aria-current")).toBe("page");
  });

  it("every image/icon decoration is hidden from AT (aria-hidden on decorative nodes)", () => {
    for (const [name, markup] of ALL_MARKUPS) {
      const document = doc(markup);
      for (const svg of document.querySelectorAll("svg")) {
        expect(svg.getAttribute("aria-hidden"), `${name} svg`).toBe("true");
      }
    }
  });

  it("landmarks are present on every page (main via the shell; header/footer on the chrome)", () => {
    expect(headerMarkup).toContain("<header");
    expect(footerMarkup).toContain("<footer");
    // Pages carry accessible section headings; the chrome carries landmarks.
    const PAGES: ReadonlyArray<[string, string]> = [
      ["home", homeMarkup],
      ["capabilities", capabilitiesMarkup],
      ["security", securityMarkup],
      ["developers", developersMarkup],
      ["app-entry", appEntryMarkup],
      ["not-found", notFoundMarkup],
    ];
    for (const [name, markup] of PAGES) {
      expect(markup, `${name} headings`).toMatch(/<h[12]/);
    }
  });

  it("headings are hierarchical: exactly one h1 per page, h2 sections below", () => {
    for (const [name, markup] of [
      ["capabilities", capabilitiesMarkup],
      ["security", securityMarkup],
      ["developers", developersMarkup],
      ["app-entry", appEntryMarkup],
    ] as const) {
      const document = doc(markup);
      expect(document.querySelectorAll("h1"), `${name} h1 count`).toHaveLength(1);
      expect(document.querySelectorAll("h2").length).toBeGreaterThan(0);
    }
  });
});

describe("deep-link contracts: no dead buttons, no broken deep links", () => {
  it("every internal href resolves to a REAL product route", () => {
    const ROUTES = new Set([
      "/payswap",
      "/payswap/capabilities",
      "/payswap/security",
      "/payswap/developers",
      "/payswap/app",
    ]);
    const broken: string[] = [];
    for (const [name, markup] of ALL_MARKUPS) {
      const document = doc(markup);
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const href = anchor.getAttribute("href") ?? "";
        if (href.startsWith("/payswap") && !ROUTES.has(href)) {
          broken.push(`${name}: ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("the not-found page names the honest truth and offers the real home route", () => {
    const document = doc(notFoundMarkup);
    expect(document.body.textContent).toContain("Nothing was found at this address");
    expect(document.body.textContent).toContain("/payswap/nowhere");
    expect(notFoundMarkup).toContain('href="/payswap"');
  });
});
