/**
 * @zcode/web/payswap — the PaySwap web product route table.
 *
 * NET-NEW (P7-W1, MMP-36): the product lives under the /payswap prefix on
 * the @zcode/web substrate (the substrate's own routes — the ZCode client,
 * OAuth callback, conversation share — are UNTOUCHED; the product is
 * mounted additively, exactly like the substrate's share/auth special
 * paths). The public-site routes adapt the old product's IA
 * (/, /capabilities, /security, /developers, /app) into the prefix; the
 * app-plane area routes (/app/*) remain the canonical surface area routes
 * and are NOT remapped — they render inside the authenticated product when
 * that plane is wired (TL accept-time integration).
 */

export const PAYSWAP_PRODUCT_PREFIX = "/payswap" as const;

export type PaySwapRoute =
  | { readonly kind: "home" }
  | { readonly kind: "capabilities" }
  | { readonly kind: "security" }
  | { readonly kind: "developers" }
  | { readonly kind: "app-entry" }
  | { readonly kind: "not-found"; readonly path: string };

/** Does this pathname belong to the PaySwap web product? (Additive mount.) */
export function isPaySwapProductPath(pathname: string): boolean {
  return pathname === PAYSWAP_PRODUCT_PREFIX || pathname.startsWith(`${PAYSWAP_PRODUCT_PREFIX}/`);
}

/** Resolve the product route for a pathname (pure; deterministic). */
export function resolvePaySwapRoute(pathname: string): PaySwapRoute {
  const suffix = pathname.slice(PAYSWAP_PRODUCT_PREFIX.length);
  switch (suffix) {
    case "":
    case "/":
      return { kind: "home" };
    case "/capabilities":
      return { kind: "capabilities" };
    case "/security":
      return { kind: "security" };
    case "/developers":
      return { kind: "developers" };
    case "/app":
      return { kind: "app-entry" };
    default:
      return { kind: "not-found", path: pathname };
  }
}
