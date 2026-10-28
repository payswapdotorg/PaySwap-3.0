/**
 * PaySwap Desktop (P21-D Gap C, ADR-0014 D4) — the SESSION-MODEL-CATALOG
 * channel member: the host-side read that maps the substrate session
 * settings' model availability onto the wire DTOs for the renderer's
 * model-catalog composition root (the chain-members.ts pattern).
 *
 * THE EDGE LAW (the honest postures, split by seam state):
 * - The member requires the composed substrate session-settings read
 *   (injected at the host composition edge — see
 *   ./session-model-substrate-read.ts for the product wiring over the
 *   agent service's existing read-only surface) and fails closed with
 *   the typed SessionModelCatalogNotConfiguredError when it is absent —
 *   never a silent empty list pretending the seam exists.
 * - A COMPOSED seam whose substrate read resolves undefined (no session
 *   to report settings for, or no live agent runtime — the observer's
 *   existing-only refusal) returns the honest EMPTY catalog: the
 *   substrate reported nothing, so nothing is listed (never an invented
 *   model; the composer then presents its honest empty controls state).
 * - A rejected substrate read RETHROWS — the typed failure surfaces
 *   through the composition's honest ERROR phase, never a masked empty.
 */

import type { ZCodeSessionSettingsState } from "@zcode/shared";

import type { IPaySwapDesktopService } from "./contracts.js";
import { SessionModelCatalogNotConfiguredError } from "./plane-errors.js";
import { sessionModelCatalogFromSettings } from "./session-model-catalog.js";

/** What the session-model-catalog member needs (injected — never ambient). */
export interface SessionModelCatalogChannelDeps {
  /**
   * Reads the substrate session settings (the agent-protocol-fed
   * ZCodeSessionSettingsState). Resolves undefined when the substrate
   * has nothing to report (no session / no live runtime); REJECTS on a
   * real read failure (fail-closed upstream).
   */
  readonly readSettings: () => Promise<ZCodeSessionSettingsState | undefined>;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (level: "info" | "warn" | "error", message: string, ...args: readonly unknown[]) => void;
}

/**
 * The ABSENT-seam posture (the service wiring picks this when the
 * substrate session-settings read was not composed): the member is REAL
 * or absent — it fails closed with the typed error on first use, never
 * a silent empty list pretending the substrate seam exists (the split
 * keeps the service file within the file law).
 */
export function createAbsentSessionModelCatalogChannelMembers(): Pick<
  IPaySwapDesktopService,
  "sessionModelCatalog"
> {
  return {
    async sessionModelCatalog(): Promise<never> {
      throw new SessionModelCatalogNotConfiguredError();
    },
  };
}

/**
 * The service-wiring helper (keeps service.ts within its budget): the
 * composed member when the substrate read was injected, the ABSENT
 * posture otherwise — the same selection the service makes for the
 * chain members, owned here for the file law.
 */
export function sessionModelCatalogMembersOf(
  options: { readonly readSettings: () => Promise<ZCodeSessionSettingsState | undefined> } | undefined,
  log: SessionModelCatalogChannelDeps["log"],
): Pick<IPaySwapDesktopService, "sessionModelCatalog"> {
  return options !== undefined
    ? createSessionModelCatalogChannelMembers({ readSettings: options.readSettings, log })
    : createAbsentSessionModelCatalogChannelMembers();
}

/**
 * Create the session-model-catalog channel member. Returned as a Pick
 * of the service interface so the service can spread it beside the
 * other member families over the same fail-closed posture.
 */
export function createSessionModelCatalogChannelMembers(
  deps: SessionModelCatalogChannelDeps,
): Pick<IPaySwapDesktopService, "sessionModelCatalog"> {
  return {
    async sessionModelCatalog() {
      const settings = await deps.readSettings();
      if (settings === undefined) {
        // The composed seam with nothing to report: the honest EMPTY
        // catalog (never an invented model, never a masked failure).
        deps.log(
          "info",
          "payswap-desktop: session model catalog read — the substrate reports no session settings (the honest empty catalog)",
        );
        return [];
      }
      const entries = sessionModelCatalogFromSettings(settings);
      deps.log(
        "info",
        `payswap-desktop: session model catalog read — ${String(entries.length)} available model(s) from the substrate session settings (model metadata only — no credentials, no secret material)`,
      );
      return entries;
    },
  };
}
