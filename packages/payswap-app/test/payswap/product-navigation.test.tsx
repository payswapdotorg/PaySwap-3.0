// @vitest-environment jsdom
/**
 * @payswap/app — the platform NAVIGATION ADAPTER contracts (P9-A,
 * NET-NEW).
 *
 * The product package is presentational: it never reads the ambient
 * window. Links route through the injected PaySwapNavigation adapter.
 * These tests machine-check the seam:
 * - createStaticNavigation records visits, never navigates (tests);
 * - ProductLink renders a REAL href (deep-linkable) and intercepts only
 *   plain left-clicks; modified clicks (cmd/ctrl/middle/shift/alt) and
 *   non-_self targets always fall through to the browser;
 * - a platform adapter built over the real history API drives the shell.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ProductLink } from "../../src/shell/ProductLink.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import { PaySwapApp } from "../../src/shell/PaySwapApp.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
} from "../../src/contracts/harness.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

afterEach(() => {
  cleanup();
});

describe("createStaticNavigation — the deterministic test adapter", () => {
  it("reports its fixed path and records navigations instead of performing them", () => {
    const navigation = createStaticNavigation("/app");
    expect(navigation.getPath()).toBe("/app");
    expect(navigation.visits).toEqual([]);
    navigation.navigate("/app/payments");
    navigation.navigate("/");
    expect(navigation.visits).toEqual(["/app/payments", "/"]);
    expect(navigation.getPath()).toBe("/app");
  });

  it("subscribers can subscribe and unsubscribe (no-op notifications)", () => {
    const navigation = createStaticNavigation("/");
    const listener = vi.fn();
    const unsubscribe = navigation.subscribe(listener);
    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("ProductLink — real hrefs, honest interception", () => {
  it("renders a real deep-linkable href", () => {
    const { container } = render(<ProductLink to="/app">Open</ProductLink>);
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/app");
  });

  it("routes plain left-clicks through the injected navigation (no reload)", () => {
    const navigation = createStaticNavigation("/");
    const { container } = render(
      <ProductLink to="/app" navigation={navigation}>
        Open
      </ProductLink>,
    );
    const anchor = container.querySelector("a");
    // The interception calls preventDefault (that is the point: no reload);
    // fireEvent returns false when default was prevented.
    fireEvent.click(anchor!, { button: 0 });
    expect(navigation.visits).toEqual(["/app"]);
  });

  it("modified clicks fall through to the browser (never intercepted)", () => {
    for (const modifiers of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      const navigation = createStaticNavigation("/");
      const { container } = render(
        <ProductLink to="/app" navigation={navigation}>
          Open
        </ProductLink>,
      );
      fireEvent.click(container.querySelector("a")!, { button: 0, ...modifiers });
      expect(navigation.visits, JSON.stringify(modifiers)).toEqual([]);
      cleanup();
    }
  });

  it("middle-button and non-_self targets fall through", () => {
    const navigation = createStaticNavigation("/");
    const { container } = render(
      <ProductLink to="/app" navigation={navigation} target="_blank" rel="noopener">
        Open
      </ProductLink>,
    );
    fireEvent.click(container.querySelector("a")!, { button: 0 });
    expect(navigation.visits).toEqual([]);
    cleanup();
    const second = createStaticNavigation("/");
    const rendered = render(
      <ProductLink to="/app" navigation={second}>
        Open
      </ProductLink>,
    );
    fireEvent.click(rendered.container.querySelector("a")!, { button: 1 });
    expect(second.visits).toEqual([]);
  });

  it("external urls are never intercepted (no leading slash)", () => {
    const navigation = createStaticNavigation("/");
    const { container } = render(
      <ProductLink to="https://example.com" navigation={navigation}>
        Away
      </ProductLink>,
    );
    fireEvent.click(container.querySelector("a")!, { button: 0 });
    expect(navigation.visits).toEqual([]);
  });

  it("a consumer-provided onClick that prevents default wins", () => {
    const navigation = createStaticNavigation("/");
    const { container } = render(
      <ProductLink
        to="/app"
        navigation={navigation}
        onClick={(event) => event.preventDefault()}
      >
        Open
      </ProductLink>,
    );
    fireEvent.click(container.querySelector("a")!, { button: 0 });
    expect(navigation.visits).toEqual([]);
  });
});

describe("the shell over a history-backed adapter (the web pattern)", () => {
  function createHistoryNavigation() {
    return {
      getPath: () => window.location.pathname,
      subscribe: (listener: () => void) => {
        window.addEventListener("popstate", listener);
        return () => window.removeEventListener("popstate", listener);
      },
      navigate: (to: string) => {
        window.history.pushState(null, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
    };
  }

  it("in-app navigation moves the route without a reload", () => {
    window.history.replaceState(null, "", "/");
    const navigation = createHistoryNavigation();
    const { container, unmount } = render(
      <PaySwapApp input={INPUT} navigation={navigation} console={{ href: "/console" }} />,
    );
    try {
      expect(container.textContent).toContain("non-custodial economic operating system");
      fireEvent.click(container.querySelector<HTMLAnchorElement>('a[href="/app"]')!);
      expect(window.location.pathname).toBe("/app");
      expect(container.textContent).toContain("Authentication required");
      fireEvent.click(container.querySelector<HTMLAnchorElement>('a[href="/app/payments"]')!);
      expect(window.location.pathname).toBe("/app/payments");
      expect(container.textContent).toContain("The honest state of this area");
    } finally {
      unmount();
      window.history.replaceState(null, "", "/");
    }
  });
});
