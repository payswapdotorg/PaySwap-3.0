/**
 * @zcode/web — the WEB navigation adapter for @payswap/app (P9-A).
 *
 * Implements the PaySwapNavigation seam over the real browser history
 * API: pushState for in-app navigation (no full reloads), popstate for
 * back/forward. The product package itself never touches the window —
 * this adapter is the single place web routing meets the product.
 */

import type { PaySwapNavigation } from "@payswap/app";

export interface WebNavigationRuntime {
  getPath(): string;
  pushState(path: string): void;
  addPopStateListener(listener: () => void): () => void;
}

function createBrowserRuntime(): WebNavigationRuntime {
  return {
    getPath: () => window.location.pathname,
    pushState: (path) => {
      window.history.pushState(null, "", path);
    },
    addPopStateListener: (listener) => {
      window.addEventListener("popstate", listener);
      return () => window.removeEventListener("popstate", listener);
    },
  };
}

/** The web navigation adapter (history-driven, reload-free). */
export function createWebNavigation(
  runtime: WebNavigationRuntime = createBrowserRuntime(),
): PaySwapNavigation {
  return {
    getPath: () => runtime.getPath(),
    subscribe: (listener) => runtime.addPopStateListener(listener),
    navigate: (to) => {
      runtime.pushState(to);
    },
  };
}
