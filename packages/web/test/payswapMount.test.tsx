// @vitest-environment jsdom
/**
 * @zcode/web — the WEB-MOUNT suite (P9-A route flip; console split P10-B).
 *
 * What lives at this seam (and only here): the platform adapters that
 * read the vite env + browser history for the product, and the route
 * gate — which browser pathname owns which surface (the PaySwap product,
 * the J15 legacy redirect, the PaySwap Agent Workspace at /console, the
 * advanced developer workspace at /console/advanced, the
 * conversation-share substrate route and the OAuth callback). The
 * product's own laws are tested in @payswap/app (packages/payswap-app/
 * test) — this file proves the WEB package wires that product correctly.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
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
import { PaySwapSurfaces } from "../src/payswap/webSurfaces.js";

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

  it("the P10-B console split: /console + /console/<section> → the Agent Workspace; /console/advanced… → the developer workspace (CONSOLE-WORKSPACE §2)", () => {
    // The workspace owns the console root and every section path — known
    // sections AND unknown ones (an unknown section is the workspace's
    // own honest not-found, inside the workspace chrome).
    for (const pathname of ["/console", "/console/missions", "/console/agents", "/console/nonsense"]) {
      expect(resolveWebSurface({ pathname, hasState: false, hasCodeOrError: false }), pathname).toEqual({
        kind: "console",
      });
    }
    // The advanced developer workspace (the ZCode Root mount): the exact
    // path and any deeper path UNDER it.
    for (const pathname of ["/console/advanced", "/console/advanced/deeper", "/console/advanced/deep/still"]) {
      expect(resolveWebSurface({ pathname, hasState: false, hasCodeOrError: false }), pathname).toEqual({
        kind: "console-advanced",
      });
    }
    // §2's letter: "any deeper path under it" — "/console/advancedfoo"
    // is an unknown SECTION path (the workspace's not-found), NOT the
    // advanced mount.
    for (const pathname of ["/console/advancedfoo", "/console/advancedish/x"]) {
      expect(resolveWebSurface({ pathname, hasState: false, hasCodeOrError: false }), pathname).toEqual({
        kind: "console",
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

  it("legacy /payswap/console targets stay console surface; /payswap/console/advanced keeps the advanced mount (J15 + P10-B)", () => {
    expect(
      resolveWebSurface({ pathname: "/payswap/console", hasState: false, hasCodeOrError: false }),
    ).toEqual({ kind: "console" });
    expect(
      resolveWebSurface({ pathname: "/payswap/console/missions", hasState: false, hasCodeOrError: false }),
    ).toEqual({ kind: "console" });
    expect(
      resolveWebSurface({ pathname: "/payswap/console/advanced", hasState: false, hasCodeOrError: false }),
    ).toEqual({ kind: "console-advanced" });
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

describe("the PaySwap web surfaces switch (P10-B — product ↔ workspace without a reload)", () => {
  it("renders the product at / with the console entry as an IN-TREE push (a button, not a leaving anchor)", () => {
    window.history.replaceState(null, "", "/");
    const { container, unmount } = render(<PaySwapSurfaces apiRuntime={resolveApiRuntimeInput()} />);
    try {
      expect(container.textContent).toContain("non-custodial economic operating system");
      // The console entry is wired to the shared history adapter (§2:
      // product → workspace is a pushState, never a reload) — so it is a
      // BUTTON (the onOpen branch of PaySwapConsoleEntry), not an <a>.
      const entry = container.querySelector<HTMLButtonElement>("button.ps-site-console");
      expect(entry).not.toBeNull();
      expect(entry!.textContent).toContain("Agent console");
    } finally {
      unmount();
    }
  });

  it("clicking the console entry swaps to the Agent Workspace in-place — same document, no reload", () => {
    window.history.replaceState(null, "", "/");
    const { container, unmount } = render(<PaySwapSurfaces apiRuntime={resolveApiRuntimeInput()} />);
    try {
      const entry = container.querySelector<HTMLButtonElement>("button.ps-site-console")!;
      act(() => {
        entry.click();
      });
      // The URL moved to the console namespace...
      expect(window.location.pathname).toBe(PAYSWAP_CONSOLE_PATH);
      // ...and the SAME tree now renders the Agent Workspace — the
      // REAL P10-C component (merged at integration): PaySwap chrome +
      // the eight-section navigation + honest loading states (the store
      // port loads asynchronously; "Loading…" is the truthful state).
      expect(container.textContent).toContain("PaySwap Agent Console");
      expect(container.textContent).toContain("Overview");
      expect(container.textContent).toContain("Missions");
      expect(container.textContent).toContain("Settings");
      expect(container.textContent).not.toContain("Welcome to ZCode");
      // The document title follows the surface (CONSOLE-WORKSPACE §1).
      expect(document.title).toBe("PaySwap — Agent Console");
    } finally {
      unmount();
    }
  });

  it("history back returns to the product without a reload (the shared adapter re-renders the tree)", () => {
    window.history.replaceState(null, "", "/");
    const { container, unmount } = render(<PaySwapSurfaces apiRuntime={resolveApiRuntimeInput()} />);
    try {
      act(() => {
        container.querySelector<HTMLButtonElement>("button.ps-site-console")!.click();
      });
      expect(window.location.pathname).toBe("/console");
      // Browser back: the URL returns to the product path and popstate
      // fires (jsdom's history.back is async — simulated exactly as the
      // P9-A adapter tests do: the URL change + the popstate event).
      act(() => {
        window.history.pushState(null, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(window.location.pathname).toBe("/");
      expect(container.textContent).toContain("non-custodial economic operating system");
      expect(document.title).toBe("PaySwap");
    } finally {
      unmount();
    }
  });

  it("boots straight into the workspace at /console/<section> (deep links land in the workspace)", () => {
    window.history.replaceState(null, "", "/console/missions");
    const { container, unmount } = render(<PaySwapSurfaces apiRuntime={resolveApiRuntimeInput()} />);
    try {
      // The REAL workspace deep-links into the Missions section (its
      // intake form renders — the honest first-run state).
      expect(container.textContent).toContain("PaySwap Agent Console");
      expect(container.textContent).toContain("Create a mission");
      expect(window.location.pathname).toBe("/console/missions");
    } finally {
      unmount();
    }
  });
});
