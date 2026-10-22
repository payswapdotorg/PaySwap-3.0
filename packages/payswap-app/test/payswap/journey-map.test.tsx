/**
 * @payswap/app — the JOURNEY-MAP machine check (P9-A, NET-NEW).
 *
 * spec/productization/JOURNEY-MAP.md is the cross-lane contract: fifteen
 * journeys (J1–J15), each mapped to a REAL route, an accessible control,
 * a prerequisite state and an honest-state law. This test renders the
 * REAL product shell at every journey's entry route (static, no network,
 * no jsdom) and machine-checks the four-part contract — the IA cannot
 * drift from the map without this suite failing. Where a journey is not
 * executable end-to-end in this deployment, the REQUIRED behavior is the
 * honest unavailable/setup-required state — the test asserts THAT state,
 * never a fabricated success.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaySwapApp } from "../../src/shell/PaySwapApp.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import {
  resolvePaySwapLegacyRedirect,
  resolvePaySwapRoute,
  isPaySwapProductPath,
} from "../../src/routes.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
} from "../../src/contracts/harness.js";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { foldNavigation } from "../../src/lib/navigation.js";
import { UNIVERSAL_AREAS_MIRROR } from "../../src/lib/areas.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

/** Render the real shell at a path (deterministic static markup). */
function shell(path: string): string {
  return renderToStaticMarkup(
    <PaySwapApp
      input={INPUT}
      navigation={createStaticNavigation(path)}
      console={{ href: "/console" }}
    />,
  );
}

/** Strip tags for text-content assertions (and decode the entities
 * react-dom/server emits for apostrophes/quotes). */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("J1 — first launch / getting started", () => {
  it("/ renders positioning + the J1 CTA + the honest gate expectation BEFORE the click", () => {
    const html = shell("/");
    expect(html).toContain("non-custodial economic operating system");
    expect(html).toContain('href="/app"');
    expect(html).toContain("Open the product");
    expect(html).toContain("requires authentication");
    expect(html).toContain("honest gate");
    expect(html).toContain("not a demo with fake balances or a pretend login");
  });
});

describe("J2 — overview (authenticated)", () => {
  it("/app renders the honest gate + the eleven-area map with designed-empty reasons", () => {
    const html = text(shell("/app"));
    expect(html).toContain("Authentication required");
    expect(html).toContain("eleven operational areas");
    for (const area of UNIVERSAL_AREAS_MIRROR) {
      expect(html, area.id).toContain(area.label);
      expect(html, area.id).toContain(area.emptyState.reason);
    }
  });
});

describe("J3–J6 — the four money journeys land on real area surfaces with typed prerequisites", () => {
  const CASES: ReadonlyArray<{
    journey: string;
    areaId: string;
    control: string;
    prerequisite: string;
  }> = [
    {
      journey: "J3 pay",
      areaId: "payments",
      control: "Pay",
      prerequisite: "The economic intake plane is not configured in this deployment",
    },
    {
      journey: "J4 receive",
      areaId: "payments",
      control: "Receive",
      prerequisite: "The economic intake plane is not configured in this deployment",
    },
    {
      journey: "J5 convert",
      areaId: "accounts",
      control: "Convert",
      prerequisite: "Quote projection requires fresh capability observations",
    },
    {
      journey: "J6 checkout",
      areaId: "payments",
      control: "Checkout",
      prerequisite: "No merchant checkout plane exists in this deployment",
    },
  ];

  it("every money journey's outcome action is discoverable from / (outcome actions first)", () => {
    const home = text(shell("/"));
    for (const { control } of CASES) {
      expect(home, control).toContain(control);
    }
  });

  it("every money journey lands on its REAL area route with the typed prerequisite + dispatchability verdict", () => {
    for (const { journey, areaId, prerequisite } of CASES) {
      const area = UNIVERSAL_AREAS_MIRROR.find((entry) => entry.id === areaId);
      expect(area, journey).toBeDefined();
      const html = shell(area!.route);
      expect(html, journey).toContain(area!.label);
      expect(html, journey).toContain(prerequisite);
      expect(html, journey).toContain("Not yet dispatchable");
      // Zero dead buttons: the action names its learn route.
      expect(html, journey).toContain('href="/developers"');
    }
  });
});

describe("J7–J11 — the operational areas render their honest states", () => {
  const CASES: ReadonlyArray<{ journey: string; route: string; expectation: string }> = [
    {
      journey: "J7 activity",
      route: "/app/activity",
      expectation: "No recorded activity yet",
    },
    {
      journey: "J8 connections",
      route: "/app/connections",
      expectation: "No connected instances yet",
    },
    {
      journey: "J9 opportunities",
      route: "/app/opportunities",
      expectation: "No opportunity observations yet",
    },
    {
      journey: "J10 security area",
      route: "/app/security",
      expectation: "No gate records yet",
    },
    {
      journey: "J11 reports",
      route: "/app/reports",
      expectation: "No reportable records yet",
    },
  ];

  it("each area route is a real product path that renders its designed-empty state", () => {
    for (const { journey, route, expectation } of CASES) {
      expect(isPaySwapProductPath(route), journey).toBe(true);
      const html = shell(route);
      expect(html, journey).toContain("empty by design");
      expect(html, journey).toContain(expectation);
    }
  });

  it("J8/J12 public companions render the coverage + developer surfaces", () => {
    const capabilities = text(shell("/capabilities"));
    expect(capabilities).toContain("No provider evidence is recorded in this deployment");
    expect(capabilities).toContain("recorded probe evidence only");
    const developers = text(shell("/developers"));
    expect(developers).toContain("VITE_PAYSWAP_API_URL");
    expect(developers).toContain("Not configured — and shown as such");
  });

  it("J10 public companion renders the structural security commitments", () => {
    const security = text(shell("/security"));
    expect(security).toContain("PaySwap never holds your money");
    expect(security).toContain("UNKNOWN is never quietly resolved");
    expect(security).toContain("Fail-closed, everywhere");
  });
});

describe("J13 — settings / support / about", () => {
  it("the settings area renders its designed-empty truth; the footer carries identity + attribution", () => {
    const settings = shell("/app/settings");
    expect(settings).toContain("Settings");
    const footer = shell("/");
    expect(footer).toContain("PaySwap");
    // Upstream attribution is preserved as ATTRIBUTION in the legal/about
    // location (PRODUCT-IDENTITY §4) — present, never the brand.
    expect(footer).toContain("built on the ZCode open-source platform");
    expect(footer).toContain("zai-org/ZCode");
  });
});

describe("J14 — the agent console is a supporting capability, never the landing", () => {
  it("/console is NOT a product path; the product links to it as a capability", () => {
    expect(isPaySwapProductPath("/console")).toBe(false);
    const home = shell("/");
    expect(home).toContain('href="/console"');
    expect(home).toContain("Agent console");
    // The default landing is the PaySwap home, never the console.
    expect(resolvePaySwapRoute("/").kind).toBe("home");
  });

  it("the console link is visually secondary: rendered AFTER the product CTA in the header", () => {
    const home = shell("/");
    const consoleIndex = home.indexOf('href="/console"');
    const ctaIndex = home.indexOf('href="/app"');
    expect(consoleIndex).toBeGreaterThan(-1);
    expect(ctaIndex).toBeGreaterThan(-1);
    expect(consoleIndex).toBeGreaterThan(ctaIndex);
  });
});

describe("J15 — legacy /payswap URLs redirect permanently", () => {
  it("every legacy public URL folds to its new top-level route", () => {
    expect(resolvePaySwapLegacyRedirect("/payswap")).toBe("/");
    expect(resolvePaySwapLegacyRedirect("/payswap/app")).toBe("/app");
    expect(resolvePaySwapLegacyRedirect("/payswap/capabilities")).toBe("/capabilities");
    expect(resolvePaySwapLegacyRedirect("/payswap/security")).toBe("/security");
    expect(resolvePaySwapLegacyRedirect("/payswap/developers")).toBe("/developers");
    expect(resolvePaySwapLegacyRedirect("/payswap/app/payments")).toBe("/app/payments");
  });
});

describe("the navigation IA law (JOURNEY-MAP §2)", () => {
  it("primary tasks (J1–J9) are discoverable from / without scrolling-hunting: every outcome action is on the home page", () => {
    const home = text(shell("/"));
    const board = foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT);
    for (const row of board.rows) {
      expect(home, row.actionId).toContain(row.label);
      expect(home, row.actionId).toContain("Not yet dispatchable");
    }
  });

  it("the /app shell renders the full eleven-area navigation (J2–J13 reachable)", () => {
    const html = shell("/app");
    for (const area of foldNavigation().areas) {
      expect(html, area.id).toContain(`href="${area.route}"`);
    }
  });

  it("every area surface renders the area navigation + the site chrome (no orphan pages)", () => {
    const html = shell("/app/payments");
    for (const area of foldNavigation().areas) {
      expect(html, area.id).toContain(`href="${area.route}"`);
    }
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
  });
});
