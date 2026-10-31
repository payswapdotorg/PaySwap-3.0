/**
 * @payswap/journey-verification — the J1–J25 journey manifest.
 *
 * Authority: spec/productization/JOURNEY-MAP.md §1 (the primary journey
 * map, REGISTERED by the TL) + PRODUCT-IDENTITY.md §3 (the route contract
 * this matrix is resolved against). Every row below is carried from that
 * map — id, route, control, prerequisite and the honest-state law — plus
 * the two lane-local fields the suite needs:
 *
 * - `tier`:
 *   - 1 = at least part of this journey's acceptance is verifiable GREEN
 *     at the P9-C lane base (e6ed008) via `baseSurface` — the PaySwap
 *     product surfaces that exist TODAY under `/payswap/*` on the
 *     @zcode/web substrate (P7-W1, additive mount).
 *   - 2 = contract-only: the journey cannot be verified at the base
 *     because its surface is part of the NEW route contract Lane P9-A
 *     implements (`/` = PaySwap home, `/app`, `/console`, legacy
 *     redirects). Coverage exists ONLY as `@contract` tests that gate at
 *     TL integration on the merged tree.
 * - `baseSurface`: the route the tier-1 tests drive at the lane base
 *   (null for contract-only rows). The tier-1 tests assert the SAME
 *   honest-state laws on that surface; the ROUTE MOVE itself is the
 *   contract-gated part, not the honesty of the surface.
 *
 * THE NO-ORPHANS LAW (both directions, enforced by specs/manifest.spec.ts):
 * every manifest row must be covered by at least one test in the suite,
 * and every test must declare the journey id(s) it covers (via the `[Jn]`
 * title convention + journeys.coverage.ts). An orphan journey fails the
 * suite; an unjourneyed test fails it too.
 */

// (P22-D file-law split) The manifest stays the single import surface:
// the living rows + the retired history concatenate in ./journeys.rows.ts;
// the id list + the lookups live in ./journeys.lookup.ts; the row types
// live in ./journeys.types.ts; the route registries live in
// ./journeys.routes.ts. Every consumer's import path is unchanged.
export { JOURNEYS } from "./journeys.rows.js";
export { JOURNEY_IDS, journeyTier, isJourneyId } from "./journeys.lookup.js";
export { BASE_ROUTES, CONTRACT_ROUTES } from "./journeys.routes.js";
export type { JourneyId, JourneyTier, JourneyRow } from "./journeys.types.js";


