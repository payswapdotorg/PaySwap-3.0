/**
 * @payswap/journey-verification — the JOURNEY ROW TYPES (the P22-D
 * file-law split from ./journeys.manifest.ts at the ≤400-line law, along
 * the module's own documented seam: the manifest owns the J-ROWS, this
 * file owns their type contracts). Re-exported from the manifest so
 * every consumer's import path stays unchanged.
 */

/** A journey id from the J1–J25 map (JOURNEY-MAP.md §1 + the P21-D J24 row + the P22-D J25 row). */
export type JourneyId = `J${number}`;

/** Where a journey's acceptance can run green. */
export type JourneyTier = 1 | 2;

/** One row of the canonical journey map, made machine-checkable. */
export interface JourneyRow {
  readonly id: JourneyId;
  /** Journey name (JOURNEY-MAP.md §1 column 2). */
  readonly title: string;
  /** Canonical CONTRACT route (PRODUCT-IDENTITY.md §3 — post-P9-A). */
  readonly route: string;
  /** Primary control (JOURNEY-MAP.md §1 column 4). */
  readonly control: string;
  /** Prerequisite state shown (JOURNEY-MAP.md §1 column 5). */
  readonly prerequisite: string;
  /** The honest-state law this journey must satisfy (column 6, condensed). */
  readonly honestState: string;
  /** 1 = base-green via baseSurface; 2 = contract-only (see file header). */
  readonly tier: JourneyTier;
  /** The route tier-1 tests drive at the lane base; null for tier 2. */
  readonly baseSurface: string | null;
  /** What remains contract-gated even for tier-1 rows. */
  readonly integrationNote: string;
  /**
   * (P21-D reconciliation) Present when the journey's WEB surface was
   * retired by the P15 strip (the web entry boots the ZCode substrate
   * Root for every pathname — spec/productization/JOURNEY-MAP.md §5).
   * A retired row is exempt from the coverage law (law 4): its spec
   * files retired with it; the law itself lives on at the named
   * successor tier. NEVER a silent deletion — the row stays REGISTERED
   * with its reason.
   */
  readonly retirement?: {
    readonly at: string;
    readonly successor: string;
    readonly reason: string;
  };
}
