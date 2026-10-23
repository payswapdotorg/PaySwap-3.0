/**
 * @payswap/app — the in-memory console NAVIGATION adapter.
 *
 * [P15 shell bridge] When the PaySwap console sections render INSIDE a
 * host shell (the ZCode workspace main area), there is no product-owned
 * URL to route: the host owns navigation. This adapter keeps the
 * section-to-section path space ("/console", "/console/<section>")
 * alive in memory so the sections' ProductLink navigation works
 * unmodified — the host subscribes (or polls via the bridge's sync
 * effect) and mirrors the active section into its own chrome.
 *
 * Pure contract implementation: no DOM, no history, no hash.
 */

import type { PaySwapNavigation } from "../shell/navigation.js";

/** Create an in-memory navigation starting at `initialPath`. */
export function createMemoryNavigation(initialPath: string): PaySwapNavigation {
  let path = initialPath;
  const listeners = new Set<() => void>();
  return {
    getPath: () => path,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(to: string): void {
      if (to === path) {
        return;
      }
      path = to;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
