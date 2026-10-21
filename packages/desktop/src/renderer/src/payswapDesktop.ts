/**
 * @zcode/desktop — the DESKTOP navigation adapter + surface switch for
 * @payswap/app (P9-A; extended P10-B).
 *
 * The desktop main window opens the PaySwap product experience
 * (PRODUCT-IDENTITY.md §3 "Desktop"); the agent workspace console stays
 * reachable as a SUPPORTING surface (J14). Routing is HASH-based (the
 * renderer is loaded over file:// in production builds — no
 * history-API paths), and the seam is PURE + INJECTED: every function
 * takes its location as an argument so the whole switch is
 * node-testable without Electron.
 *
 * Hash contract (mirrors the web route contract; P10-B splits the
 * console surface in three):
 * - "" | "#" | "#/"            → product path "/"  (the PaySwap home)
 * - "#/app", "#/app/<area>"…   → the product's top-level routes
 * - "#/console"                → the console surface (the PaySwap Agent
 *                                Workspace — DESKTOP_CONSOLE_HASH)
 * - "#/console/<section>"      → the console surface with a section path
 *                                (e.g. "#/console/missions" →
 *                                "/console/missions")
 * - "#/console/advanced…"      → console-advanced: the ZCode-derived
 *                                developer workspace (the substrate Root
 *                                mount), clearly labeled, never removed
 *
 * The console-advanced hash is checked BEFORE the section paths: the
 * advanced developer workspace is NOT a workspace section
 * (CONSOLE-WORKSPACE.md §2 routing law).
 */

import type { PaySwapNavigation } from "@payswap/app";
import { PAYSWAP_CONSOLE_PATH } from "@payswap/app/routes";

/** The hash that opens the supporting agent-console surface. */
export const DESKTOP_CONSOLE_HASH = `#${PAYSWAP_CONSOLE_PATH}`;

/** The hash prefix that opens the advanced developer workspace. */
export const DESKTOP_CONSOLE_ADVANCED_HASH_PREFIX = `#${PAYSWAP_CONSOLE_PATH}/advanced`;

export type DesktopProductSurface = "product" | "console" | "console-advanced";

/** Strip the leading "#" from a hash ("" for empty/"#"). */
function hashBody(hash: string): string {
  return hash.replace(/^#/, "");
}

/**
 * Is this console-namespace body the ADVANCED developer workspace?
 * §2's letter: "/console/advanced (and any deeper path UNDER it)" —
 * "/console/advancedfoo" is NOT under /console/advanced, it is an unknown
 * SECTION path (the workspace's honest not-found), so the match is exact
 * or slash-prefixed, never a bare prefix.
 */
function isConsoleAdvancedPath(body: string): boolean {
  return (
    body === `${PAYSWAP_CONSOLE_PATH}/advanced` ||
    body.startsWith(`${PAYSWAP_CONSOLE_PATH}/advanced/`)
  );
}

/**
 * Which surface owns this hash? The console namespace is checked FIRST —
 * it is deliberately not a product route (the web gate behaves the same:
 * /console is never a PaySwap product path). Inside the namespace:
 * "/console/advanced…" is the developer workspace; "/console" and every
 * other "/console/<section>" path are the Agent Workspace (unknown
 * sections resolve inside the workspace's honest not-found, never here).
 */
export function resolveDesktopSurface(hash: string): DesktopProductSurface {
  const body = hashBody(hash);
  if (body === PAYSWAP_CONSOLE_PATH || body.startsWith(`${PAYSWAP_CONSOLE_PATH}/`)) {
    return isConsoleAdvancedPath(body) ? "console-advanced" : "console";
  }
  return "product";
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

/**
 * The CONSOLE WORKSPACE path for a hash: the "/console…" body when the
 * hash is in the console namespace, otherwise "/console" (the workspace
 * root → overview). Section paths pass through unchanged
 * ("#/console/missions" → "/console/missions") — the workspace's own
 * router resolves its eight sections and its honest not-found.
 */
export function consoleWorkspacePathFromHash(hash: string): string {
  const body = hashBody(hash);
  return body.startsWith(`${PAYSWAP_CONSOLE_PATH}/`) || body === PAYSWAP_CONSOLE_PATH
    ? body
    : PAYSWAP_CONSOLE_PATH;
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
 * The console WORKSPACE navigation adapter (P10-B): the same injected
 * hash location, but over the "/console…" path space — getPath returns
 * "/console" or "/console/<section>", navigate sets the hash from the
 * workspace path, and subscription rides the existing hash-change
 * listener. Hash navigation never reloads the renderer, so workspace
 * section navigation is reload-free by construction.
 */
export function createConsoleWorkspaceNavigation(
  location: DesktopHashLocation,
): PaySwapNavigation {
  return {
    getPath: () => consoleWorkspacePathFromHash(location.getHash()),
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
