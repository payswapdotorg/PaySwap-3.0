/**
 * @zcode/web/payswap mount — the WEB platform adapter for @payswap/app.
 *
 * P9-A: the product surface lives in the @payswap/app package; this module
 * is the web-side seam — everything platform-specific (vite env reads,
 * browser history) stays in the web package so the product package itself
 * stays presentational (no import.meta.env, no ambient window reads).
 */

import type { DevelopersPageView } from "@payswap/app";

/** The honest API runtime state (no fabricated URL when unconfigured). */
export function resolveApiRuntimeInput(): DevelopersPageView["apiRuntime"] {
  const baseUrl = import.meta.env.VITE_PAYSWAP_API_URL?.trim() || null;
  return {
    configured: baseUrl !== null,
    baseUrl,
    envVar: "VITE_PAYSWAP_API_URL",
  };
}
