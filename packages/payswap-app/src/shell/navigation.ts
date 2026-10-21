/**
 * @payswap/app — the platform NAVIGATION ADAPTER contract.
 *
 * The product package is presentational: it never reads the ambient
 * window, history or hash. The platform mount (web: browser history;
 * desktop: hash-based routing) injects this adapter and the product's
 * links + route resolution run against it. Pure contract — no DOM here.
 */

/** The navigation seam every platform mount implements. */
export interface PaySwapNavigation {
  /** The current product path (e.g. "/", "/app", "/app/payments"). */
  getPath(): string;
  /** Subscribe to path changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Navigate to a product path (same-surface navigation). */
  navigate(to: string): void;
}

/**
 * A static navigation for deterministic renders (tests, static markup):
 * the path is fixed and navigation is recorded, never performed.
 */
export function createStaticNavigation(initialPath: string): PaySwapNavigation & {
  readonly visits: readonly string[];
} {
  const visits: string[] = [];
  return {
    getPath: () => initialPath,
    subscribe: () => () => {},
    navigate: (to: string) => {
      visits.push(to);
    },
    get visits(): readonly string[] {
      return visits;
    },
  };
}
