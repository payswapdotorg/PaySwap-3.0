// @vitest-environment jsdom
/**
 * @zcode/web/payswap — route table + app shell oracle (NET-NEW, P7-W1).
 *
 * The additive-mount law: /payswap* renders the PaySwap product and
 * NOTHING ELSE is touched (the substrate's own routes stay out); the
 * route table is total (every known path resolves; unknown paths resolve
 * to the honest not-found); and the shell mounts with the repository's
 * honest deployment facts (jsdom — the router reads window.location).
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isPaySwapProductPath,
  resolvePaySwapRoute,
} from "../../src/payswap/routes.js";
import { PaySwapWebApp } from "../../src/payswap/shell/PaySwapWebApp.js";
import {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
} from "../../src/payswap/contracts/harness.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

describe("the additive product mount predicate", () => {
  it("/payswap* belongs to the PaySwap product", () => {
    expect(isPaySwapProductPath("/payswap")).toBe(true);
    expect(isPaySwapProductPath("/payswap/")).toBe(true);
    expect(isPaySwapProductPath("/payswap/capabilities")).toBe(true);
    expect(isPaySwapProductPath("/payswap/app")).toBe(true);
  });

  it("substrate routes are NOT PaySwap product paths (the mount is additive only)", () => {
    expect(isPaySwapProductPath("/")).toBe(false);
    expect(isPaySwapProductPath("/share/abc")).toBe(false);
    expect(isPaySwapProductPath("/cn/share/callback")).toBe(false);
    expect(isPaySwapProductPath("/payswapX")).toBe(false);
    expect(isPaySwapProductPath("/api/v1/health")).toBe(false);
  });
});

describe("the route table is total", () => {
  it("every known product path resolves to its page", () => {
    expect(resolvePaySwapRoute("/payswap")).toEqual({ kind: "home" });
    expect(resolvePaySwapRoute("/payswap/")).toEqual({ kind: "home" });
    expect(resolvePaySwapRoute("/payswap/capabilities")).toEqual({ kind: "capabilities" });
    expect(resolvePaySwapRoute("/payswap/security")).toEqual({ kind: "security" });
    expect(resolvePaySwapRoute("/payswap/developers")).toEqual({ kind: "developers" });
    expect(resolvePaySwapRoute("/payswap/app")).toEqual({ kind: "app-entry" });
  });

  it("unknown paths resolve to the honest not-found (never a throw)", () => {
    expect(resolvePaySwapRoute("/payswap/nowhere")).toEqual({
      kind: "not-found",
      path: "/payswap/nowhere",
    });
    expect(resolvePaySwapRoute("/payswap/app/payments")).toEqual({
      kind: "not-found",
      path: "/payswap/app/payments",
    });
  });
});

describe("the product shell mounts with the honest deployment facts", () => {
  it("renders the home page with the honest no-evidence state at /payswap", () => {
    window.history.replaceState(null, "", "/payswap");
    const { container, unmount } = render(<PaySwapWebApp input={INPUT} />);
    try {
      expect(container.textContent).toContain("non-custodial economic operating system");
      expect(container.textContent).toContain("No provider evidence is recorded in this deployment");
      expect(container.textContent).toContain("No outcome action is dispatchable in this deployment yet");
    } finally {
      unmount();
    }
  });

  it("renders the honest authenticated entry boundary at /payswap/app", () => {
    window.history.replaceState(null, "", "/payswap/app");
    const { container, unmount } = render(<PaySwapWebApp input={INPUT} />);
    try {
      expect(container.textContent).toContain("Authentication required");
      expect(container.textContent).toContain("eleven operational areas");
      // The eleven-area IA renders with honest empty states.
      for (const label of ["Overview", "Payments", "Accounts", "Settings"]) {
        expect(container.textContent).toContain(label);
      }
      expect(container.textContent).toContain("empty by design");
    } finally {
      unmount();
    }
  });

  it("renders the honest not-found for an unknown product route", () => {
    window.history.replaceState(null, "", "/payswap/nowhere");
    const { container, unmount } = render(<PaySwapWebApp input={INPUT} />);
    try {
      expect(container.textContent).toContain("Nothing was found at this address");
      expect(container.textContent).toContain("/payswap/nowhere");
    } finally {
      unmount();
    }
  });

  it("the static render of the shell is deterministic (no throw, no network)", () => {
    expect(() => renderToStaticMarkup(<PaySwapWebApp input={INPUT} />)).not.toThrow();
  });
});

afterEach(() => {
  cleanup();
});
