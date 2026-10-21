/**
 * @payswap/app — the navigation fold over the pinned eleven-area IA.
 *
 * PORT of the P7-W1 share of payswap.org@8a735bf packages/ux
 * src/product-ia.ts (1280L, MMP-35): the old package owned its own
 * navigation vocabulary (role-based nav views, UX-002 command verbs).
 * PaySwap 3.0's CANONICAL navigation vocabulary is the surface package's
 * eleven-area IA (P2-W3 ACCEPTED), mirrored in lib/areas.ts. This fold
 * renders THAT IA — the AREA SET and ORDER are the versioned contract
 * (INV-22); the web product creates no second navigation vocabulary.
 *
 * The P7-W3 share of the old product-ia (command grammar core, palette
 * verbs, messaging navigation) is NOT ported — receipted in
 * docs/web-evidence/BASELINE-VERIFICATION-RECORD.md.
 */

import type { NavigationAreaView } from "../contracts/view-models.js";
import type { UniversalAreaPin } from "../pins/surface-pins.js";
import { UNIVERSAL_AREAS_MIRROR } from "./areas.js";

/**
 * Fold the canonical eleven-area IA into the navigation view. Pure: the
 * areas arrive as an explicit input (default = the mirrored registry) so
 * the fold stays deterministic and testable.
 */
export function foldNavigation(
  areas: readonly UniversalAreaPin[] = UNIVERSAL_AREAS_MIRROR,
): NavigationAreaView {
  return {
    areas,
    areaIds: areas.map((area) => area.id),
  };
}

/** Resolve one area's honest empty-state contract (fail-closed on unknown ids). */
export function areaEmptyState(id: string): UniversalAreaPin["emptyState"] {
  const found = UNIVERSAL_AREAS_MIRROR.find((area) => area.id === id);
  if (found === undefined) {
    throw new Error(`areaEmptyState: unknown universal area id ${JSON.stringify(id)}`);
  }
  return found.emptyState;
}
