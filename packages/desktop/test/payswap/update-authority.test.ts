/**
 * PaySwap update-authority contract laws (the v1.0.0 release-defect
 * regression) — the desktop side of spec/productization/PRODUCT-IDENTITY.md
 * §1 + §5 as applied to update/force-update authority.
 *
 * Defect being locked out: the packaged v1.0.0 app consulted the upstream
 * ZCode service's client-config endpoint at startup, compared PaySwap
 * `1.0.0` against the live ZCode floor `3.5.3` (a cross-version-space
 * comparison against a service that has no authority over the PaySwap
 * product) and BLOCKED MAIN-WINDOW CREATION for every online user. The
 * same endpoint fed the auto-updater's manifest provider.
 *
 * The law: while no PaySwap update authority is configured, BOTH the
 * startup force-update gate and the auto-updater stay inert — the same
 * honest inertness P9-B applied to the update feed (dev-app-update.yml).
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PAYSWAP_UPDATE_AUTHORITY_CONFIGURED,
  shouldEnablePaySwapDesktopAutoUpdate,
  shouldRunStartupForceUpdateGate,
} from "../../src/main/payswapUpdateAuthority.js";
import { resolveForceUpdateRequirement } from "@zcode/shared";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mainIndexSource = readFileSync(join(packageRoot, "src/main/index.ts"), "utf8");

describe("PaySwap update authority (v1.0.0 release-defect regression)", () => {
  it("is inert while no PaySwap update feed is configured", () => {
    // The single flip-point: when the operator configures a real PaySwap
    // release channel, this constant — and only this — changes.
    expect(PAYSWAP_UPDATE_AUTHORITY_CONFIGURED).toBe(false);
    expect(shouldEnablePaySwapDesktopAutoUpdate()).toBe(false);
    expect(shouldRunStartupForceUpdateGate()).toBe(false);
  });

  it("the main process wires BOTH gates through the authority module", () => {
    // The startup force-update gate call site must be gated by the authority.
    expect(mainIndexSource).toContain("shouldRunStartupForceUpdateGate()");
    // The auto-updater enable flag must be gated by the authority.
    expect(mainIndexSource).toContain("shouldEnablePaySwapDesktopAutoUpdate()");
  });

  it("proves the comparator alone would still fire — the call-site gate is the safety boundary", () => {
    // resolveForceUpdateRequirement is version-space pure: PaySwap 1.0.0
    // compared against the upstream ZCode floor 3.5.3 DOES resolve to a
    // blocking requirement. This is intentional: it proves the defect class
    // is real and that the protection is the authority gate at the call
    // site (wrong authority + wrong version space), not a comparator tweak
    // that would silently change meaning when a PaySwap feed exists.
    const requirement = resolveForceUpdateRequirement({
      currentVersion: "1.0.0",
      forceUpdate: { minimalVersion: "3.5.3" },
    });
    expect(requirement).not.toBeNull();
    expect(requirement?.minimalVersion).toBe("3.5.3");
  });
});
