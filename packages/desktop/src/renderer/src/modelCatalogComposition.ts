/**
 * PaySwap Desktop renderer (P21-B run 3 + P21-D Gap C, ADR-0014 D4) —
 * the MODEL-CATALOG composition root: binds a REAL model catalogue into the
 * app's shared ModelCatalogPort seam (bindSharedModelCatalog) at the
 * desktop renderer's business-root initialization — the
 * missionIntakeComposition.ts pattern.
 *
 * THE SEAM (P21-D Gap C, CLOSED): the substrate's REAL
 * model-availability catalogue is the session-settings state
 * (ZCodeSessionSettingsState.model.available, fed by the agent
 * protocol — see packages/ui/src/lib/zcodeSessionProjection.ts). The
 * payswap-desktop channel now exposes it through the HOST-SIDE
 * sessionModelCatalog member (the 1:1 settings→DTO mapping in
 * src/host/payswap/shell/session-model-catalog.ts), and
 * channelSessionModelCatalogSource below adapts that member onto this
 * composition's `source` seam — the product default binds the REAL
 * catalogue (main.tsx); an OLDER host that does not expose the member
 * yields NO source and the honest unbound-catalog note stands (the
 * ADR-0014 D4 law — never a fabricated model list).
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
import type { DesktopConsoleChannelServices } from "./consoleWorkspaceMount.js";
import type { PaySwapSessionModelCatalogEntryDto } from "./consoleSessionModelWire.js";

/** The catalogue source this composition rides (the DI seam). */
export type ModelCatalogSource = () => Promise<readonly CatalogModel[]>;

/** The composed binding handle (the port + the reset for the bridge-tier battery). */
export interface ModelCatalogComposition {
  readonly catalog: ModelCatalogPort;
  /** Restore the seam's honest default (unbound — the honest unbound note). */
  readonly reset: () => void;
}

/* ------------- the channel client surface this composition rides ------------- */

/**
 * The session-model-catalog member the source rides (the channel
 * client's surface — the drift-tested member set; see
 * consoleWorkspaceMount.tsx).
 */
export interface SessionModelCatalogChannelClient {
  sessionModelCatalog(): Promise<readonly PaySwapSessionModelCatalogEntryDto[]>;
}

/**
 * Adapt the channel services (the payswap-desktop proxy) onto this
 * composition's `source` seam: the member's DTO list mapped 1:1 onto
 * the app's CatalogModel (the label is the app's displayName; the
 * model metadata fields the controls read cross, nothing else).
 * Returns NULL when the channel client does not expose the member (an
 * older host) — the caller then keeps the honest unbound-catalog
 * posture (composeModelCatalogBinding({}) fails closed and the
 * composer renders the unbound note; nothing crashes, nothing is
 * fabricated).
 */
export function channelSessionModelCatalogSource(
  services: DesktopConsoleChannelServices,
): ModelCatalogSource | null {
  const client =
    services.payswapDesktopService as unknown as Partial<SessionModelCatalogChannelClient>;
  if (typeof client.sessionModelCatalog !== "function") {
    // An older host without the member — the honest unbound posture.
    return null;
  }
  const read = client.sessionModelCatalog.bind(client);
  return async () => {
    const entries = await read();
    return entries.map((entry) => ({
      providerId: entry.providerId,
      modelId: entry.modelId,
      displayName: entry.label,
      reasoningLevels: [...entry.reasoningLevels],
    }));
  };
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
