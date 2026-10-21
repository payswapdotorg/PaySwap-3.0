// @vitest-environment jsdom
/**
 * @zcode/web — the WEB-MOUNT suite (P9-A route flip).
 *
 * What lives at this seam (and only here): the platform adapters that
 * read the vite env + browser history for the product, and the route
 * gate — which browser pathname owns which surface (the PaySwap product,
 * the J15 legacy redirect, the agent console, the conversation-share
 * substrate route and the OAuth callback). The product's own laws are
 * tested in @payswap/app (packages/payswap-app/test) — this file proves
 * the WEB package wires that product correctly.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  PaySwapApp,
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
  PAYSWAP_CONSOLE_PATH,
  createStaticNavigation,
  routeDocumentTitle,
  resolvePaySwapRoute,
} from "@payswap/app";
import { resolveApiRuntimeInput } from "../src/payswap/apiRuntime.js";
import { createWebNavigation } from "../src/payswap/webNavigation.js";
import { resolveWebSurface } from "../src/payswap/webRouteGate.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: resolveApiRuntimeInput(),
} as const;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("the web platform adapter", () => {
  it("resolves the honest unconfigured API runtime when no env base URL is set", () => {
    delete import.meta.env.VITE_PAYSWAP_API_URL;
    const view = resolveApiRuntimeInput();
    expect(view.configured).toBe(false);
    expect(view.baseUrl).toBeNull();
    expect(view.envVar).toBe("VITE_PAYSWAP_API_URL");
  });
});

describe("the web route gate (PRODUCT-IDENTITY §3 — which surface owns a pathname)", () => {
  it("the product owns the top-level default experience", () => {
    for (const pathname of ["/", "/app", "/app/payments", "/capabilities", "/security", "/developers"]) {
      expect(resolveWebSurface({ pathname, hasState: false, hasCodeOrError: false }), pathname).toEqual({
        kind: "product",
      });
    }
  });

  it("the agent console owns /console and /console/* only; unknown top-level paths render the product's honest not-found (J7 integration fix)", () => {
    for (const pathname of ["/console", "/console/deep/link"]) {
      expect(resolveWebSurface({ pathname, hasState: false, hasCodeOrError: false }), pathname).toEqual({
        kind: "console",
      });
    }
    // The integration fix (found by the journey suite): unknown top-level
    // paths are PRODUCT surface — its router renders the honest not-found
    // answer; the old fail-open console default stranded users on a
    // bootstrap error in deployments without a live console backend.
    for (const pathname of ["/anything", "/workspace/deep/link"]) {
      expect(resolveWebSurface({ pathname, hasState: false, hasCodeOrError: false }), pathname).toEqual({
        kind: "product",
      });
    }
  });

  it("legacy /payswap URLs resolve to permanent redirects (J15)", () => {
    expect(resolveWebSurface({ pathname: "/payswap", hasState: false, hasCodeOrError: false })).toEqual({
      kind: "legacy-redirect",
      target: "/",
    });
    expect(
      resolveWebSurface({ pathname: "/payswap/capabilities", hasState: false, hasCodeOrError: false }),
    ).toEqual({ kind: "legacy-redirect", target: "/capabilities" });
    expect(
      resolveWebSurface({ pathname: "/payswap/app/payments", hasState: false, hasCodeOrError: false }),
    ).toEqual({ kind: "legacy-redirect", target: "/app/payments" });
  });

  it("the OAuth callback + share routes are untouched substrate surfaces", () => {
    expect(
      resolveWebSurface({ pathname: "/share/callback", hasState: true, hasCodeOrError: true }),
    ).toEqual({ kind: "oauth-callback" });
    expect(
      resolveWebSurface({ pathname: "/cn/share/callback", hasState: true, hasCodeOrError: true }),
    ).toEqual({ kind: "oauth-callback" });
    expect(resolveWebSurface({ pathname: "/share/abc123", hasState: false, hasCodeOrError: false })).toEqual({
      kind: "share",
    });
    expect(resolveWebSurface({ pathname: "/cn/share/abc", hasState: false, hasCodeOrError: false })).toEqual({
      kind: "share",
    });
    // A bare callback pathname WITHOUT the OAuth query shape is not the
    // callback page — it stays a share route.
    expect(resolveWebSurface({ pathname: "/share/callback", hasState: false, hasCodeOrError: false })).toEqual({
      kind: "share",
    });
  });
});

describe("the web navigation adapter (history-driven, reload-free)", () => {
  it("navigates via pushState and reports the new path", () => {
    window.history.replaceState(null, "", "/");
    const navigation = createWebNavigation();
    expect(navigation.getPath()).toBe("/");
    navigation.navigate("/app");
    expect(navigation.getPath()).toBe("/app");
    expect(window.location.pathname).toBe("/app");
  });

  it("subscribes to popstate (back/forward keep the shell in sync)", () => {
    window.history.replaceState(null, "", "/");
    const navigation = createWebNavigation();
    let notified = 0;
    const unsubscribe = navigation.subscribe(() => {
      notified += 1;
    });
    window.history.pushState(null, "", "/app");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(notified).toBe(1);
    expect(navigation.getPath()).toBe("/app");
    unsubscribe();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(notified).toBe(1);
  });
});

describe("the workspace product package renders under the web mount", () => {
  it("@payswap/app's shell mounts at / with the honest deployment facts", () => {
    window.history.replaceState(null, "", "/");
    const { container, unmount } = render(
      <PaySwapApp
        input={INPUT}
        navigation={createWebNavigation()}
        console={{ href: PAYSWAP_CONSOLE_PATH }}
      />,
    );
    try {
      expect(container.textContent).toContain("non-custodial economic operating system");
      expect(container.textContent).toContain("No provider evidence is recorded in this deployment");
      // The supporting console entry is reachable from the product (J14).
      expect(container.querySelector<HTMLAnchorElement>('a[href="/console"]')).not.toBeNull();
    } finally {
      unmount();
    }
  });

  it("the mount titles the document per route (PRODUCT-IDENTITY §1)", () => {
    expect(routeDocumentTitle(resolvePaySwapRoute("/"))).toBe("PaySwap");
    expect(routeDocumentTitle(resolvePaySwapRoute("/app"))).toBe("App — PaySwap");
    expect(routeDocumentTitle(resolvePaySwapRoute("/app/payments"))).toBe("Payments — PaySwap");
  });

  it("the static navigation adapter keeps deterministic renders for tests", () => {
    const navigation = createStaticNavigation("/app");
    expect(navigation.getPath()).toBe("/app");
    navigation.navigate("/");
    expect(navigation.visits).toEqual(["/"]);
  });
});
