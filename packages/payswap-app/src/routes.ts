/**
 * @payswap/app — the PaySwap product route table.
 *
 * P9-A FLIP (PRODUCT-IDENTITY.md §3 — the canonical route contract): the
 * product LEFT the /payswap prefix and owns the TOP-LEVEL routes of the
 * default experience. The agent console (the ZCode-derived client) moved
 * to /console as a SUPPORTING capability; the /payswap prefix becomes a
 * permanent client-side redirect surface so recorded URLs keep working.
 *
 * | Route                    | Surface                                    | Was            |
 * |--------------------------|--------------------------------------------|----------------|
 * | /                        | PaySwap product home                       | ZCode client   |
 * | /app, /app/<area>        | product app (eleven-area IA)               | /payswap/app   |
 * | /capabilities            | capabilities + live coverage               | /payswap/...   |
 * | /security                | non-custodial commitments                  | /payswap/...   |
 * | /developers              | developer/API authority surface            | /payswap/...   |
 * | /console                 | agent workspace console (supporting)      | /              |
 * | /payswap, /payswap/*     | permanent redirect (prefix stripped)      | —              |
 *
 * The app-plane area routes (/app/*) are the CANONICAL pinned area routes
 * (lib/areas.ts mirrors @payswap/surface UNIVERSAL_AREAS — same literals,
 * same order; the AREA SET is the versioned contract INV-22) and are NOT
 * remapped. The table is pure and total: every pathname resolves, unknown
 * paths resolve to the honest not-found — never a throw.
 */

import type { UniversalAreaIdPin } from "./pins/surface-pins.js";
import { UNIVERSAL_AREAS_MIRROR } from "./lib/areas.js";

/** The legacy prefix recorded URLs may still carry (permanent redirect). */
export const PAYSWAP_LEGACY_PREFIX = "/payswap" as const;

/** The supporting console route (owned by the platform mounts). */
export const PAYSWAP_CONSOLE_PATH = "/console" as const;

export type PaySwapRoute =
  | { readonly kind: "home" }
  | { readonly kind: "capabilities" }
  | { readonly kind: "security" }
  | { readonly kind: "developers" }
  | { readonly kind: "app-overview" }
  | { readonly kind: "app-area"; readonly areaId: UniversalAreaIdPin }
  | { readonly kind: "not-found"; readonly path: string };

/**
 * Does this pathname belong to the PaySwap product? (The default
 * experience: home, app, capabilities, security, developers — INCLUDING
 * their area routes. The console, the share routes and the OAuth callback
 * are NOT product paths; the legacy prefix is handled by the redirect
 * fold, not by the product mount.)
 */
export function isPaySwapProductPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/capabilities" ||
    pathname === "/security" ||
    pathname === "/developers"
  );
}

/** Does this pathname carry the legacy /payswap prefix? */
export function isPaySwapLegacyPath(pathname: string): boolean {
  return pathname === PAYSWAP_LEGACY_PREFIX || pathname.startsWith(`${PAYSWAP_LEGACY_PREFIX}/`);
}

/**
 * Resolve the permanent redirect target for a legacy /payswap path: the
 * prefix strips and the remainder resolves through the new top-level
 * contract ("/payswap" -> "/", "/payswap/app" -> "/app",
 * "/payswap/capabilities" -> "/capabilities", "/payswap/anything" ->
 * "/anything" — which renders the honest not-found when it is not a real
 * route; recorded URLs keep working either way).
 */
export function resolvePaySwapLegacyRedirect(pathname: string): string {
  if (!isPaySwapLegacyPath(pathname)) {
    return pathname;
  }
  const suffix = pathname.slice(PAYSWAP_LEGACY_PREFIX.length);
  return suffix === "" ? "/" : suffix;
}

/** Normalize one trailing slash away ("/app/" == "/app"; "/" stays "/"). */
function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Resolve the area whose pinned route equals this pathname (if any). */
function resolveAreaByRoute(pathname: string): UniversalAreaIdPin | null {
  for (const area of UNIVERSAL_AREAS_MIRROR) {
    if (area.route === pathname) {
      return area.id;
    }
  }
  return null;
}

/** Resolve the product route for a pathname (pure; deterministic; total). */
export function resolvePaySwapRoute(pathname: string): PaySwapRoute {
  const path = normalizePath(pathname);
  switch (path) {
    case "/":
      return { kind: "home" };
    case "/capabilities":
      return { kind: "capabilities" };
    case "/security":
      return { kind: "security" };
    case "/developers":
      return { kind: "developers" };
    case "/app":
      return { kind: "app-overview" };
    default: {
      if (path.startsWith("/app/")) {
        const areaId = resolveAreaByRoute(path);
        return areaId === null
          ? { kind: "not-found", path: pathname }
          : { kind: "app-area", areaId };
      }
      return { kind: "not-found", path: pathname };
    }
  }
}

/** The document title for a route (PRODUCT-IDENTITY §1: "… — PaySwap"). */
export function routeDocumentTitle(route: PaySwapRoute): string {
  switch (route.kind) {
    case "home":
      return "PaySwap";
    case "capabilities":
      return "Capabilities — PaySwap";
    case "security":
      return "Security — PaySwap";
    case "developers":
      return "Developers — PaySwap";
    case "app-overview":
      return "App — PaySwap";
    case "app-area": {
      const area = UNIVERSAL_AREAS_MIRROR.find((entry) => entry.id === route.areaId);
      return `${area?.label ?? "App"} — PaySwap`;
    }
    case "not-found":
      return "Not found — PaySwap";
  }
}
