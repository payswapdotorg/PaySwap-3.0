/**
 * @payswap/app — NAVIGATION TOTALITY tests (P12 Lane C, C2/C7).
 *
 * The desktop-first IA law, machine-checked on the REAL shell:
 * - TOTALITY: every navigable product route renders (the five public
 *   pages + /app + all eleven pinned areas), and every href the shell
 *   emits resolves to a REAL route — a product route, a console route
 *   (the workspace sections or the advanced mount), or an in-page
 *   anchor. No dead menus, no orphan pages.
 * - SPA ROUTING (no renderer reload / no durable-state loss): in-product
 *   links route through the platform navigation adapter — verified
 *   behaviorally (jsdom): clicking an area link / an action deep-link /
 *   the developers advanced entry performs adapter navigation, never a
 *   document navigation.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaySwapApp } from "../../src/shell/PaySwapApp.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import {
  isPaySwapProductPath,
  resolvePaySwapRoute,
} from "../../src/routes.js";
import { foldNavigation } from "../../src/lib/navigation.js";
import { CONSOLE_SECTION_IDS } from "../../src/console/contracts.js";
import { CONSOLE_ADVANCED_PATH } from "../../src/console/contracts.js";
import { HONEST_DEPLOYMENT_CONTEXT, NO_EVIDENCE_COVERAGE } from "../../src/contracts/harness.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

/** Every route the shell can navigate to (the totality set). */
const ALL_ROUTES: readonly string[] = [
  "/",
  "/capabilities",
  "/security",
  "/developers",
  "/app",
  ...foldNavigation().areas.map((area) => area.route),
];

function staticShell(path: string): string {
  return renderToStaticMarkup(
    <PaySwapApp
      input={INPUT}
      navigation={createStaticNavigation(path)}
      console={{ href: "/console" }}
    />,
  );
}

/** The set of REAL hrefs the product may emit. */
function realHrefSet(): Set<string> {
  const productRoutes = new Set<string>(ALL_ROUTES);
  // The console is a real platform mount: the workspace root, its eight
  // sections, and the advanced developer-workspace mount.
  productRoutes.add("/console");
  for (const sectionId of CONSOLE_SECTION_IDS) {
    productRoutes.add(`/console/${sectionId}`);
  }
  productRoutes.add(CONSOLE_ADVANCED_PATH);
  return productRoutes;
}

function extractHrefs(markup: string): string[] {
  const hrefs: string[] = [];
  for (const match of markup.matchAll(/href="([^"]+)"/g)) {
    hrefs.push(match[1] ?? "");
  }
  return hrefs;
}

afterEach(() => {
  cleanup();
});

describe("navigation totality — every route renders, every href is real", () => {
  it("every route in the totality set is a product path that resolves (never not-found)", () => {
    for (const route of ALL_ROUTES) {
      expect(isPaySwapProductPath(route), route).toBe(true);
      const resolved = resolvePaySwapRoute(route);
      expect(resolved.kind, route).not.toBe("not-found");
    }
  });

  it("every route in the totality set renders the full shell (header, area nav on app routes, footer)", () => {
    for (const route of ALL_ROUTES) {
      const markup = staticShell(route);
      expect(markup, route).toContain("<header");
      expect(markup, route).toContain("<footer");
      expect(markup, route).toContain("Skip to main content");
      const isAppRoute = route === "/app" || route.startsWith("/app/");
      if (isAppRoute) {
        for (const area of foldNavigation().areas) {
          expect(markup, `${route} → ${area.id}`).toContain(`href="${area.route}"`);
        }
      }
    }
  });

  it("every href emitted anywhere in the product shell resolves to a REAL route (no dead menus)", () => {
    const realRoutes = realHrefSet();
    const broken: string[] = [];
    for (const route of ALL_ROUTES) {
      const markup = staticShell(route);
      for (const href of extractHrefs(markup)) {
        if (href.startsWith("#")) {
          // In-page anchors (skip link) are legal.
          continue;
        }
        if (!href.startsWith("/")) {
          // The only non-absolute href the shell emits is the external
          // none; fail on anything unexpected.
          broken.push(`${route}: ${href}`);
          continue;
        }
        if (!realRoutes.has(href)) {
          broken.push(`${route}: ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("the primary navigation makes the payments action set + the rails discoverable from /app", () => {
    const markup = staticShell("/app");
    // The eleven-area nav carries payments/connections/accounts.
    for (const areaId of ["payments", "connections", "accounts", "activity"]) {
      const area = foldNavigation().areas.find((entry) => entry.id === areaId);
      expect(area, areaId).toBeDefined();
      expect(markup, areaId).toContain(`href="${area!.route}"`);
    }
    // The overview board names every outcome action.
    const overview = staticShell("/app").replace(/<[^>]+>/g, " ");
    for (const label of ["Pay", "Receive", "Move", "Convert", "Checkout"]) {
      expect(overview, label).toContain(label);
    }
  });
});

describe("SPA routing — in-product links route through the adapter (no reload)", () => {
  function mountApp(path: string) {
    const navigation = createStaticNavigation(path);
    const app = render(
      <PaySwapApp input={INPUT} navigation={navigation} console={{ href: "/console" }} />,
    );
    return { navigation, ...app };
  }

  it("an area link on /app navigates via the adapter (never a document navigation)", async () => {
    const { navigation } = mountApp("/app");
    const link = screen.getAllByRole("link", { name: "Open Payments" })[0];
    expect(link).toBeDefined();
    await act(async () => {
      fireEvent.click(link);
    });
    expect(navigation.visits).toContain("/app/payments");
  });

  it("the payments action deep-links navigate via the adapter", async () => {
    const { navigation } = mountApp("/app/payments");
    const configure = screen.getAllByRole("link", { name: "Configure connections" })[0];
    expect(configure.getAttribute("href")).toBe("/app/connections");
    await act(async () => {
      fireEvent.click(configure);
    });
    expect(navigation.visits).toContain("/app/connections");
    const ledger = screen.getAllByRole("link", { name: "Open the Activity ledger" })[0];
    await act(async () => {
      fireEvent.click(ledger);
    });
    expect(navigation.visits).toContain("/app/activity");
  });

  it("the connections onchain cross-links navigate via the adapter", async () => {
    const { navigation } = mountApp("/app/connections");
    const accounts = screen.getAllByRole("link", {
      name: "See how balances would be observed (Accounts)",
    })[0];
    await act(async () => {
      fireEvent.click(accounts);
    });
    expect(navigation.visits).toContain("/app/accounts");
  });

  it("the developers advanced-workspace entry navigates via the adapter (the console mount route)", async () => {
    const { navigation } = mountApp("/developers");
    const advanced = screen.getAllByRole("link", { name: "Advanced developer workspace" })[0];
    expect(advanced.getAttribute("href")).toBe("/console/advanced");
    await act(async () => {
      fireEvent.click(advanced);
    });
    expect(navigation.visits).toContain("/console/advanced");
  });
});
