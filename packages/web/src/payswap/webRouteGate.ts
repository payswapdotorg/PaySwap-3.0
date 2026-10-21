/**
 * @zcode/web — the WEB ROUTE GATE (P9-A route flip).
 *
 * PRODUCT-IDENTITY.md §3 decides which surface owns a browser pathname.
 * This module is the PURE decision — no DOM, fully testable — the entry
 * (main.tsx) executes it:
 *
 * | Decision        | Pathnames                                            |
 * |-----------------|------------------------------------------------------|
 * | oauth-callback  | /share/callback, /cn/share/callback + state + code/error (UNTOUCHED) |
 * | product         | /, /app, /app/<area>, /capabilities, /security, /developers |
 * | legacy-redirect | /payswap, /payswap/* → permanent redirect to the top-level route (J15) |
 * | share           | /share/*, /cn/share/* (UNTOUCHED substrate routes)   |
 * | console         | EVERYTHING ELSE — the agent workspace console, the old "/" (Root mount, auth flows land here now) |
 *
 * The console decision is the fail-open default: any substrate path the
 * ZCode-derived client ever owned (deep links, ?remote= entries) keeps
 * rendering the console — only the product's OWN top-level routes left.
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
  | { readonly kind: "console" };

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
    return { kind: "legacy-redirect", target: resolvePaySwapLegacyRedirect(pathname) };
  }
  if (isPaySwapProductPath(pathname)) {
    return { kind: "product" };
  }
  if (isConversationShareRoute(pathname)) {
    return { kind: "share" };
  }
  return { kind: "console" };
}
