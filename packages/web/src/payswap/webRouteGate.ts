/**
 * @zcode/web — the WEB ROUTE GATE (P9-A route flip; console split P10-B).
 *
 * PRODUCT-IDENTITY.md §3 decides which surface owns a browser pathname.
 * This module is the PURE decision — no DOM, fully testable — the entry
 * (main.tsx) executes it:
 *
 * | Decision         | Pathnames                                            |
 * |------------------|------------------------------------------------------|
 * | oauth-callback   | /share/callback, /cn/share/callback + state + code/error (UNTOUCHED) |
 * | product          | /, /app, /app/<area>, /capabilities, /security, /developers |
 * | legacy-redirect  | /payswap, /payswap/* → permanent redirect to the top-level route (J15) |
 * | share            | /share/*, /cn/share/* (UNTOUCHED substrate routes)   |
 * | console          | /console + /console/<section> — the PaySwap Agent Workspace (CONSOLE-WORKSPACE.md §2; unknown sections are the workspace's own honest not-found) |
 * | console-advanced | /console/advanced + any deeper path UNDER it — the ZCode-derived developer workspace (the Root mount; NOT a workspace section) |
 *
 * The advanced split (P10-B) follows §2's letter exactly: "/console/advanced
 * (and any deeper path under it)" — "/console/advancedfoo" is NOT under
 * /console/advanced, it is an unknown section path owned by the workspace.
 * The console decision is the fail-open default: any substrate path the
 * ZCode-derived client ever owned (deep links, ?remote= entries) keeps
 * rendering a console mount — only the product's OWN top-level routes left.
 */

import {
  isPaySwapLegacyPath,
  isPaySwapProductPath,
  resolvePaySwapLegacyRedirect,
} from "@payswap/app";

export type WebSurfaceDecision =
  | { readonly kind: "oauth-callback" }
  | { readonly kind: "product" }
  | { readonly kind: "legacy-redirect"; readonly target: string }
  | { readonly kind: "share" }
  | { readonly kind: "console" }
  | { readonly kind: "console-advanced" };

/** The conversation-share substrate paths (never the product's to own). */
export function isConversationShareRoute(pathname: string): boolean {
  return pathname === "/share" || pathname.startsWith("/share/") ||
    pathname === "/cn/share" || pathname.startsWith("/cn/share/");
}

/** The OAuth callback pages (state + code|error arrive via query). */
export function isOAuthCallbackRoute(
  pathname: string,
  hasState: boolean,
  hasCodeOrError: boolean,
): boolean {
  return (
    (pathname === "/share/callback" || pathname === "/cn/share/callback") &&
    hasState &&
    hasCodeOrError
  );
}

/** Resolve which surface owns this pathname (pure; total; deterministic). */
export function resolveWebSurface(params: {
  readonly pathname: string;
  readonly hasState: boolean;
  readonly hasCodeOrError: boolean;
}): WebSurfaceDecision {
  const { pathname, hasState, hasCodeOrError } = params;
  if (isOAuthCallbackRoute(pathname, hasState, hasCodeOrError)) {
    return { kind: "oauth-callback" };
  }
  if (isPaySwapLegacyPath(pathname)) {
    const target = resolvePaySwapLegacyRedirect(pathname);
    /*
     * INTEGRATION FIX (J7, found by the journey suite): the legacy fold
     * must not strand a console target — "/payswap/console" redirects
     * to "/console", which the console owns, not the product router.
     * (P10-B: a legacy console-advanced target keeps the advanced mount.)
     */
    if (isConsoleAdvancedRoute(target)) {
      return { kind: "console-advanced" };
    }
    return isConsoleRoute(target)
      ? { kind: "console" }
      : { kind: "legacy-redirect", target };
  }
  if (isPaySwapProductPath(pathname)) {
    return { kind: "product" };
  }
  if (isConversationShareRoute(pathname)) {
    return { kind: "share" };
  }
  if (isConsoleAdvancedRoute(pathname)) {
    return { kind: "console-advanced" };
  }
  if (isConsoleRoute(pathname)) {
    return { kind: "console" };
  }
  /*
   * INTEGRATION FIX (J7, found by the journey suite — the route contract
   * owns this): an unknown top-level pathname is NOT a console path. The
   * product owns the top-level namespace now; its router renders the
   * honest not-found answer (routes.ts: "…which renders the honest
   * not-found when it is not a real route") — sending unknowns to the
   * console mount strands the user on a bootstrap error in any
   * deployment without a live console backend (exactly what the suite
   * caught: "Web bootstrap failed" instead of the honest answer). The
   * console remains reachable at /console and /console/* (deep links,
   * ?remote= entries land there).
   */
  return { kind: "product" };
}

/** The agent-console paths (the supporting surface's own namespace). */
export function isConsoleRoute(pathname: string): boolean {
  return pathname === "/console" || pathname.startsWith("/console/");
}

/**
 * The ADVANCED developer workspace paths (P10-B): "/console/advanced"
 * and any deeper path UNDER it — never a bare prefix ("/console/
 * advancedfoo" is an unknown SECTION path, the workspace's not-found).
 */
export function isConsoleAdvancedRoute(pathname: string): boolean {
  return pathname === "/console/advanced" || pathname.startsWith("/console/advanced/");
}
