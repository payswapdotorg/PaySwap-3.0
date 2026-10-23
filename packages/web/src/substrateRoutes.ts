/**
 * @zcode/web — the SUBSTRATE ROUTES (the P15 strip).
 *
 * The web entry boots the ORIGINAL ZCode UI (the substrate Root) for
 * every pathname except the substrate's own dedicated mounts:
 *
 * | Decision     | Condition                                                        |
 * |--------------|------------------------------------------------------------------|
 * | oauth        | /share/callback or /cn/share/callback WITH state + code|error     |
 * | share        | /share, /share/*, /cn/share, /cn/share/*                          |
 * | zcode-root   | EVERY other pathname (the former product/console/advanced paths   |
 * |              | included — no route gate stands between the browser and the Root) |
 *
 * Pure and total so the law stays testable without a DOM, exactly as
 * the P9-A gate was; the entry (main.tsx) executes this decision.
 */

import { isConversationSharePath } from "./share/conversationShareRoute.js";

export type SubstrateRouteDecision =
  | { readonly kind: "oauth-callback" }
  | { readonly kind: "share" }
  | { readonly kind: "zcode-root" };

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

/** Resolve which substrate mount owns this pathname (pure; total). */
export function resolveSubstrateRoute(params: {
  readonly pathname: string;
  readonly hasState: boolean;
  readonly hasCodeOrError: boolean;
}): SubstrateRouteDecision {
  const { pathname, hasState, hasCodeOrError } = params;
  if (isOAuthCallbackRoute(pathname, hasState, hasCodeOrError)) {
    return { kind: "oauth-callback" };
  }
  if (isConversationSharePath(pathname)) {
    return { kind: "share" };
  }
  return { kind: "zcode-root" };
}
