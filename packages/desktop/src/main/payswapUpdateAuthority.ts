/**
 * PaySwap update authority (spec/productization/PRODUCT-IDENTITY.md §1 + §5).
 *
 * PaySwap Desktop ships in its OWN semver space (1.0.0 at first release)
 * and currently has NO update feed and NO force-update authority of its
 * own. The upstream ZCode service's client-config endpoint is NOT a
 * PaySwap authority: its minimalVersion floor lives in the ZCode version
 * space (3.x) and must never gate the PaySwap product.
 *
 * The v1.0.0 release defect this module closes: the packaged app compared
 * PaySwap `1.0.0` against the live upstream ZCode floor `3.5.3` at startup
 * and BLOCKED MAIN-WINDOW CREATION for every online user (found by the
 * station's GUI launch verification of the published AppImage, 2026-10-21).
 * The same foreign endpoint also fed the auto-updater's manifest provider,
 * which could have offered an upstream ZCode build to PaySwap users.
 *
 * The law implemented here mirrors the update-feed inertness P9-B applied
 * to `dev-app-update.yml`: until the operator configures a real PaySwap
 * release channel, BOTH the startup force-update gate and the auto-updater
 * stay inert. When a PaySwap feed exists, flip
 * PAYSWAP_UPDATE_AUTHORITY_CONFIGURED and wire the feed values (the
 * endpoint origin + manifest URL) in one place — here.
 */

export const PAYSWAP_UPDATE_AUTHORITY_CONFIGURED = false;

/** Whether the desktop auto-updater may run (poll + manual checks). */
export function shouldEnablePaySwapDesktopAutoUpdate(): boolean {
  return PAYSWAP_UPDATE_AUTHORITY_CONFIGURED;
}

/**
 * Whether the startup force-update gate may consult a remote
 * force-update config at all. Inert while no PaySwap update authority
 * exists — the upstream ZCode service floor never gates the PaySwap
 * product (wrong authority AND wrong version space).
 */
export function shouldRunStartupForceUpdateGate(): boolean {
  return PAYSWAP_UPDATE_AUTHORITY_CONFIGURED;
}
