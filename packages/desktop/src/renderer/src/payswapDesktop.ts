/**
 * @zcode/desktop — the DESKTOP navigation adapter + surface switch for
 * @payswap/app (P9-A).
 *
 * The desktop main window opens the PaySwap product experience
 * (PRODUCT-IDENTITY.md §3 "Desktop"); the agent workspace console (the
 * ZCode-derived Root mount) stays reachable as a SUPPORTING surface
 * (J14). Routing is HASH-based (the renderer is loaded over file:// in
 * production builds — no history-API paths), and the seam is PURE +
 * INJECTED: every function takes its location as an argument so the
 * whole switch is node-testable without Electron.
 *
 * Hash contract (mirrors the web route contract):
 * - "" | "#" | "#/"            → product path "/"  (the PaySwap home)
 * - "#/app", "#/app/<area>"…   → the product's top-level routes
 * - "#/console"                → the agent console surface (DESKTOP_
 *                                CONSOLE_HASH = "#" + PAYSWAP_CONSOLE_PATH)
 */

import type { PaySwapNavigation } from "@payswap/app";
import { PAYSWAP_CONSOLE_PATH } from "@payswap/app/routes";

/** The hash that opens the supporting agent-console surface. */
export const DESKTOP_CONSOLE_HASH = `#${PAYSWAP_CONSOLE_PATH}`;

export type DesktopProductSurface = "product" | "console";

/** Strip the leading "#" from a hash ("" for empty/"#"). */
function hashBody(hash: string): string {
  return hash.replace(/^#/, "");
}

/**
 * Which surface owns this hash? The console hash is checked FIRST — it
 * is deliberately not a product route (the web gate behaves the same:
 * /console is never a PaySwap product path).
 */
export function resolveDesktopSurface(hash: string): DesktopProductSurface {
  return hashBody(hash) === PAYSWAP_CONSOLE_PATH ? "console" : "product";
}

/**
 * The PRODUCT path for a hash: the body when it starts with "/",
 * otherwise "/" (the home). Unknown product paths are the product's own
 * honest not-found — resolved inside @payswap/app, never here.
 */
export function desktopProductPathFromHash(hash: string): string {
  const body = hashBody(hash);
  return body.startsWith("/") ? body : "/";
}

/** The minimal location seam the hash navigation needs (injectable). */
export interface DesktopHashLocation {
  getHash(): string;
  setHash(hash: string): void;
  addHashChangeListener(listener: () => void): () => void;
}

export function createBrowserHashLocation(): DesktopHashLocation {
  return {
    getHash: () => window.location.hash,
    setHash: (hash) => {
      window.location.hash = hash;
    },
    addHashChangeListener: (listener) => {
      window.addEventListener("hashchange", listener);
      return () => window.removeEventListener("hashchange", listener);
    },
  };
}

/**
 * The desktop navigation adapter for @payswap/app: hash-driven, no
 * reloads (hash changes never reload the document), back/forward via
 * the browser's own hash history.
 */
export function createDesktopHashNavigation(
  location: DesktopHashLocation,
): PaySwapNavigation {
  return {
    getPath: () => desktopProductPathFromHash(location.getHash()),
    subscribe: (listener) => location.addHashChangeListener(listener),
    navigate: (to) => {
      location.setHash(`#${to}`);
    },
  };
}

/**
 * The desktop console entry for the product shell (J14): opens the
 * supporting agent-console surface in-place by moving the hash.
 */
export function createDesktopConsoleEntry(location: DesktopHashLocation): {
  onOpen: () => void;
  label: string;
} {
  return {
    onOpen: () => {
      location.setHash(DESKTOP_CONSOLE_HASH);
    },
    label: "Agent console",
  };
}
