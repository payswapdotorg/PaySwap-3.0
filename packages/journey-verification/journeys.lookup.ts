/**
 * @payswap/journey-verification — the JOURNEY LOOKUPS (the P22-D
 * file-law split from ./journeys.manifest.ts at the ≤400-line law, along
 * the module's own documented seam: the manifest owns the J-ROWS, this
 * file owns the derived id list + the tier/id lookups the cross-check
 * consumes). Re-exported from the manifest so every consumer's import
 * path stays unchanged.
 */

import { JOURNEYS, type JourneyId, type JourneyTier } from "./journeys.manifest.js";

/** The ordered id list J1..J25 (the map is total; the cross-check pins it). */
export const JOURNEY_IDS: readonly JourneyId[] = JOURNEYS.map((row) => row.id);

/** Tier lookup for the cross-check (tier-1 journeys need non-@contract tests). */
export function journeyTier(id: JourneyId): JourneyTier {
  const row = JOURNEYS.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`journeys.manifest: unknown journey id ${JSON.stringify(id)}`);
  }
  return row.tier;
}

/** Is `id` a row of the canonical map? (The no-invented-ids half of the law.) */
export function isJourneyId(id: string): id is JourneyId {
  return JOURNEYS.some((row) => row.id === id);
}
