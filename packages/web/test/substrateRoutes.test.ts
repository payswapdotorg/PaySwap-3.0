/**
 * @zcode/web — the SUBSTRATE ROUTE law test (the P15 strip).
 *
 * Pins the strip contract: the OAuth callback pages and the
 * conversation-share pages keep their dedicated mounts; EVERY other
 * pathname — including every former PaySwap product/console/advanced
 * path — boots the ORIGINAL ZCode UI (the Root mount). This is the
 * successor of the P9-A route-gate table, reduced to the substrate
 * truth.
 */
import { describe, expect, it } from "vitest";
import { isOAuthCallbackRoute, resolveSubstrateRoute } from "../src/substrateRoutes.js";

const surface = (pathname: string, o = {}) =>
  resolveSubstrateRoute({
    pathname,
    hasState: false,
    hasCodeOrError: false,
    ...o,
  });

describe("the OAuth callback decision", () => {
  it("claims ONLY the two callback paths with state + code|error", () => {
    for (const pathname of ["/share/callback", "/cn/share/callback"]) {
      expect(isOAuthCallbackRoute(pathname, true, true)).toBe(true);
      expect(surface(pathname, { hasState: true, hasCodeOrError: true })).toEqual({
        kind: "oauth-callback",
      });
    }
  });

  it("falls back to the SHARE mount when the query contract is incomplete", () => {
    // /share/callback without state+code|error is still a /share/* path:
    // the share landing page owns it and renders its own honest error
    // for the missing code (the substrate's original behavior).
    for (const pathname of ["/share/callback", "/cn/share/callback"]) {
      expect(surface(pathname)).toEqual({ kind: "share" });
      expect(surface(pathname, { hasState: true })).toEqual({ kind: "share" });
      expect(surface(pathname, { hasCodeOrError: true })).toEqual({ kind: "share" });
    }
  });
});

describe("the conversation-share decision", () => {
  it("claims the share pages (both locales, any depth)", () => {
    for (const pathname of [
      "/share",
      "/share/abc123",
      "/cn/share",
      "/cn/share/abc123",
    ]) {
      expect(surface(pathname)).toEqual({ kind: "share" });
    }
  });

  it("does not claim share-adjacent paths", () => {
    for (const pathname of ["/sharing", "/sharex", "/cn/shares/x"]) {
      expect(surface(pathname)).toEqual({ kind: "zcode-root" });
    }
  });
});

describe("the P15 strip: every other pathname boots the ORIGINAL ZCode UI", () => {
  it("routes the former product, console and advanced paths to the zcode root", () => {
    for (const pathname of [
      "/",
      "/app",
      "/app/payments",
      "/capabilities",
      "/security",
      "/developers",
      "/console",
      "/console/missions",
      "/console/advanced",
      "/console/advanced/deeper",
      "/payswap",
      "/payswap/console",
      "/anything/else",
      "/deep/unknown/link",
    ]) {
      expect(surface(pathname)).toEqual({ kind: "zcode-root" });
    }
  });

  it("keeps ?remote= entries on the zcode root (the substrate client owns them)", () => {
    expect(surface("/", { hasState: false })).toEqual({ kind: "zcode-root" });
    expect(surface("/console", { hasState: false })).toEqual({ kind: "zcode-root" });
  });
});
