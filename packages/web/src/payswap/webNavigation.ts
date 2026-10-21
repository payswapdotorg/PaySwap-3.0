/**
 * @zcode/web — the WEB navigation adapter for @payswap/app (P9-A).
 *
 * Implements the PaySwapNavigation seam over the real browser history
 * API: pushState for in-app navigation (no full reloads), popstate for
 * back/forward. The product package itself never touches the window —
 * this adapter is the single place web routing meets the product.
 *
 * INTEGRATION FIX (found by the journey suite — a REAL dead-CTA defect):
 * history.pushState NEVER fires popstate (browser law), so an adapter
 * that only listened to popstate left in-app navigation silent — the
 * URL changed and the view never re-rendered (the "Open the product"
 * CTA appeared dead). The runtime now keeps its own listener set and
 * navigate() notifies it explicitly, exactly like popstate does.
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
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  runtime.addPopStateListener(emit);
  return {
    getPath: () => runtime.getPath(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate: (to) => {
      runtime.pushState(to);
      emit();
    },
  };
}
