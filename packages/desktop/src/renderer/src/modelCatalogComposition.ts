/**
 * PaySwap Desktop renderer (P21-B run 3, ADR-0014 D4) — the
 * MODEL-CATALOG composition root: binds a REAL model catalogue into the
 * app's shared ModelCatalogPort seam (bindSharedModelCatalog) at the
 * desktop renderer's business-root initialization — the
 * missionIntakeComposition.ts pattern.
 *
 * THE HONEST GAP (named, never papered over): the substrate's REAL
 * model-availability catalogue is the session-settings state
 * (ZCodeSessionSettingsState.model.available + thoughtLevel, fed by the
 * agent protocol — see packages/ui/src/lib/zcodeSessionProjection.ts).
 * No renderer-reachable service seam exposes that state to this
 * composition root today (the substrate Root owns it internally), so the
 * PRODUCT default binds NOTHING: the composer renders the honest
 * unbound-catalog note (never a fabricated model list — the ADR-0014 D4
 * law). The bridge-tier battery (and a future P23 substrate seam) binds
 * a catalogue through the `source` DI option — the only replaced part,
 * always labeled.
 *
 * THE WIRING LAWS: the port maps 1:1 onto the source (listModels → the
 * source read; NO default implementation, NO invented models); the
 * binding MUST run before the first shared-controller construction; a
 * failing source surfaces through the controls' honest ERROR phase,
 * never a masked empty list.
 */

import {
  bindSharedModelCatalog,
  resetSharedModelCatalog,
  type CatalogModel,
  type ModelCatalogPort,
} from "@payswap/app";

/** The catalogue source this composition rides (the DI seam). */
export type ModelCatalogSource = () => Promise<readonly CatalogModel[]>;

/** The composed binding handle (the port + the reset for the bridge-tier battery). */
export interface ModelCatalogComposition {
  readonly catalog: ModelCatalogPort;
  /** Restore the seam's honest default (unbound — the honest unbound note). */
  readonly reset: () => void;
}

/**
 * Compose + bind the model catalogue. Called ONCE at the renderer's
 * business-root initialization (BEFORE the first shared-controller
 * construction); requires a `source` — the substrate's model-availability
 * read. Without one, NOTHING is bound and the honest default stands
 * (the unbound-catalog note; recorded as the named gap above).
 */
export function composeModelCatalogBinding(options: {
  readonly source?: ModelCatalogSource;
}): ModelCatalogComposition {
  if (options.source === undefined) {
    // HONEST FAILURE: no source — the seam stays at its default (unbound)
    // and the composer renders the honest unbound-catalog note. Nothing
    // is masked, no model list is invented.
    throw new Error(
      "the model-catalog composition requires the substrate's model-availability source (the session-settings model list) — nothing is bound, the honest default stands (the composer renders the unbound-catalog note)",
    );
  }
  const read = options.source;
  const catalog: ModelCatalogPort = {
    listModels: () => read(),
  };
  bindSharedModelCatalog(catalog);
  return { catalog, reset: resetSharedModelCatalogBinding };
}

/** Drop the shared binding (test/inspection only, never used in src). */
function resetSharedModelCatalogBinding(): void {
  // The app's own reset seam re-exported for the battery handle.
  resetSharedModelCatalog();
}
