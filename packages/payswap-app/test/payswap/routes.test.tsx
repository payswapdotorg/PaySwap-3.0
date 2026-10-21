// @vitest-environment jsdom
/**
 * @payswap/app — route table + product shell oracle (NET-NEW, P7-W1;
 * P9-A FLIP REWRITE).
 *
 * PRODUCT-IDENTITY.md §3 — the canonical route contract after P9-A:
 * - The product OWNS the top-level default experience ("/", "/app",
 *   "/app/<area>", "/capabilities", "/security", "/developers").
 * - "/console" is the supporting agent-console surface (platform mount
 *   territory — never a product route).
 * - "/payswap" + "/payswap/*" fold to permanent client-side redirects
 *   (recorded URLs keep working).
 * - The route table is total: every pathname resolves, unknown paths
 *   resolve to the honest not-found — never a throw.
 * - Document titles follow §1: route-specific "… — PaySwap".
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isPaySwapLegacyPath,
  isPaySwapProductPath,
  resolvePaySwapLegacyRedirect,
  resolvePaySwapRoute,
  routeDocumentTitle,
  PAYSWAP_CONSOLE_PATH,
  PAYSWAP_LEGACY_PREFIX,
} from "../../src/routes.js";
import { PaySwapApp } from "../../src/shell/PaySwapApp.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
} from "../../src/contracts/harness.js";
import { UNIVERSAL_AREAS_MIRROR } from "../../src/lib/areas.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

function renderShell(path: string): string {
  return renderToStaticMarkup(
    <PaySwapApp input={INPUT} navigation={createStaticNavigation(path)} />,
  );
}

describe("the product owns the top-level default experience (mount predicate)", () => {
  it('"/" and the public surfaces belong to the PaySwap product', () => {
    expect(isPaySwapProductPath("/")).toBe(true);
    expect(isPaySwapProductPath("/app")).toBe(true);
    expect(isPaySwapProductPath("/app/payments")).toBe(true);
    expect(isPaySwapProductPath("/capabilities")).toBe(true);
    expect(isPaySwapProductPath("/security")).toBe(true);
    expect(isPaySwapProductPath("/developers")).toBe(true);
  });

  it("the console, the share routes and the OAuth callback are NOT product paths", () => {
    expect(isPaySwapProductPath("/console")).toBe(false);
    expect(isPaySwapProductPath("/share/abc")).toBe(false);
    expect(isPaySwapProductPath("/cn/share/callback")).toBe(false);
    expect(isPaySwapProductPath("/api/v1/health")).toBe(false);
    expect(isPaySwapProductPath("/payswapX")).toBe(false);
  });
});

describe("the legacy /payswap prefix folds to permanent redirects (J15)", () => {
  it("recognizes exactly the legacy prefix", () => {
    expect(isPaySwapLegacyPath("/payswap")).toBe(true);
    expect(isPaySwapLegacyPath("/payswap/app")).toBe(true);
    expect(isPaySwapLegacyPath("/payswapX")).toBe(false);
    expect(isPaySwapLegacyPath("/")).toBe(false);
  });

  it("strips the prefix: every recorded URL keeps working", () => {
    expect(resolvePaySwapLegacyRedirect("/payswap")).toBe("/");
    expect(resolvePaySwapLegacyRedirect("/payswap/app")).toBe("/app");
    expect(resolvePaySwapLegacyRedirect("/payswap/capabilities")).toBe("/capabilities");
    expect(resolvePaySwapLegacyRedirect("/payswap/app/payments")).toBe("/app/payments");
    // A recorded URL to a page that never existed still resolves — the
    // redirect never invents a page, the target renders the honest 404.
    expect(resolvePaySwapLegacyRedirect("/payswap/nowhere")).toBe("/nowhere");
  });

  it("non-legacy paths pass through unchanged", () => {
    expect(resolvePaySwapLegacyRedirect("/app")).toBe("/app");
    expect(resolvePaySwapLegacyRedirect("/console")).toBe("/console");
  });
});

describe("the route table is total (every pathname resolves, never throws)", () => {
  it("every top-level product path resolves to its surface", () => {
    expect(resolvePaySwapRoute("/")).toEqual({ kind: "home" });
    expect(resolvePaySwapRoute("/capabilities")).toEqual({ kind: "capabilities" });
    expect(resolvePaySwapRoute("/security")).toEqual({ kind: "security" });
    expect(resolvePaySwapRoute("/developers")).toEqual({ kind: "developers" });
    expect(resolvePaySwapRoute("/app")).toEqual({ kind: "app-overview" });
  });

  it("one trailing slash normalizes away ('/app/' == '/app'; '/' stays '/')", () => {
    expect(resolvePaySwapRoute("/app/")).toEqual({ kind: "app-overview" });
    expect(resolvePaySwapRoute("/capabilities/")).toEqual({ kind: "capabilities" });
    expect(resolvePaySwapRoute("/")).toEqual({ kind: "home" });
  });

  it("every pinned area route resolves to its area surface (J2–J13)", () => {
    for (const area of UNIVERSAL_AREAS_MIRROR) {
      expect(resolvePaySwapRoute(area.route), area.id).toEqual({
        kind: area.id === "overview" ? "app-overview" : "app-area",
        ...(area.id === "overview" ? {} : { areaId: area.id }),
      });
    }
  });

  it("unknown paths resolve to the honest not-found (never a throw)", () => {
    expect(resolvePaySwapRoute("/nowhere")).toEqual({ kind: "not-found", path: "/nowhere" });
    expect(resolvePaySwapRoute("/app/nowhere")).toEqual({
      kind: "not-found",
      path: "/app/nowhere",
    });
  });

  it("the console path is NOT a product route (it renders not-found inside the product)", () => {
    expect(resolvePaySwapRoute(PAYSWAP_CONSOLE_PATH)).toEqual({
      kind: "not-found",
      path: "/console",
    });
  });
});

describe("document titles follow PRODUCT-IDENTITY §1 ('… — PaySwap')", () => {
  it("the home title is exactly the product name", () => {
    expect(routeDocumentTitle(resolvePaySwapRoute("/"))).toBe("PaySwap");
  });

  it("every other surface carries the suffix", () => {
    expect(routeDocumentTitle(resolvePaySwapRoute("/capabilities"))).toBe(
      "Capabilities — PaySwap",
    );
    expect(routeDocumentTitle(resolvePaySwapRoute("/app"))).toBe("App — PaySwap");
    expect(routeDocumentTitle(resolvePaySwapRoute("/app/payments"))).toBe("Payments — PaySwap");
    expect(routeDocumentTitle(resolvePaySwapRoute("/nowhere"))).toBe("Not found — PaySwap");
  });

  it("the legacy prefix is a redirect surface, not a titled route", () => {
    expect(PAYSWAP_LEGACY_PREFIX).toBe("/payswap");
  });
});

describe("the product shell renders the top-level surfaces (static, deterministic)", () => {
  it("renders the home page with the honest no-evidence state at /", () => {
    const html = renderShell("/");
    expect(html).toContain("non-custodial economic operating system");
    expect(html).toContain("No provider evidence is recorded in this deployment");
    expect(html).toContain("No outcome action is dispatchable in this deployment yet");
  });

  it("renders the honest app overview boundary at /app (J2)", () => {
    const html = renderShell("/app");
    expect(html).toContain("Authentication required");
    expect(html).toContain("eleven operational areas");
    for (const label of ["Overview", "Payments", "Accounts", "Settings"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("empty by design");
  });

  it("renders one focused area surface at /app/payments (J3/J4)", () => {
    const html = renderShell("/app/payments");
    expect(html).toContain("The honest state of this area");
    expect(html).toContain("No connected payment capability yet");
    expect(html).toContain("Not yet dispatchable");
  });

  it("renders the honest not-found for an unknown product route", () => {
    const html = renderShell("/nowhere");
    expect(html).toContain("Nothing was found at this address");
    expect(html).toContain("/nowhere");
  });

  it("the console entry renders as a supporting capability, never as the landing", () => {
    const html = renderShell("/");
    expect(html).toContain("Agent console");
    expect(html).toContain('href="/console"');
  });

  it("mounts live in jsdom with the history navigation adapter", () => {
    window.history.replaceState(null, "", "/app");
    const { container, unmount } = render(
      <PaySwapApp
        input={INPUT}
        navigation={{
          getPath: () => window.location.pathname,
          subscribe: (listener) => {
            window.addEventListener("popstate", listener);
            return () => window.removeEventListener("popstate", listener);
          },
          navigate: (to) => window.history.pushState(null, "", to),
        }}
        console={{ href: "/console" }}
      />,
    );
    try {
      expect(container.textContent).toContain("Authentication required");
    } finally {
      unmount();
    }
  });
});

afterEach(() => {
  cleanup();
});
