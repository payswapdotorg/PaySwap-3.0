/**
 * Desktop product-surface laws (P9-A): the hash-routing seam that makes
 * the desktop main window open the PaySwap product experience with the
 * agent console reachable as a supporting surface (PRODUCT-IDENTITY.md
 * §3 "Desktop", JOURNEY-MAP J14), the About-panel identity + upstream
 * attribution (§4), and the renderer identity (title/boot).
 *
 * Node-environment contract tests over the PURE seam (payswapDesktop.ts)
 * + the importable About dialog template (aboutWindow.ts) + source-scan
 * assertions for the Electron-importing modules (about.ts,
 * desktopRuntimeEnv.ts, the renderer entry — no Electron runtime here).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DESKTOP_CONSOLE_HASH,
  createDesktopConsoleEntry,
  createDesktopHashNavigation,
  desktopProductPathFromHash,
  resolveDesktopSurface,
  type DesktopHashLocation,
} from "../../src/renderer/src/payswapDesktop.js";
import { createCustomAboutDialogHtml } from "../../src/main/aboutWindow.js";
import { PAYSWAP_CONSOLE_PATH } from "@payswap/app/routes";

/** A fake hash location (records writes, notifies listeners). */
function fakeLocation(initialHash: string): DesktopHashLocation & {
  readonly hashes: readonly string[];
  notify(): void;
} {
  let hash = initialHash;
  const hashes: string[] = [];
  const listeners = new Set<() => void>();
  return {
    getHash: () => hash,
    setHash: (next) => {
      hash = next;
      hashes.push(next);
      for (const listener of listeners) listener();
    },
    addHashChangeListener: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
    get hashes() {
      return hashes;
    },
  };
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("the desktop surface switch (hash contract, PRODUCT-IDENTITY §3 Desktop)", () => {
  it("the product is the DEFAULT surface: empty/home/app hashes all open the product", () => {
    expect(resolveDesktopSurface("")).toBe("product");
    expect(resolveDesktopSurface("#")).toBe("product");
    expect(resolveDesktopSurface("#/")).toBe("product");
    expect(resolveDesktopSurface("#/app")).toBe("product");
    expect(resolveDesktopSurface("#/app/payments")).toBe("product");
  });

  it("the console opens ONLY on its dedicated hash — a supporting surface (J14)", () => {
    expect(DESKTOP_CONSOLE_HASH).toBe(`#${PAYSWAP_CONSOLE_PATH}`);
    expect(resolveDesktopSurface(DESKTOP_CONSOLE_HASH)).toBe("console");
    // Not a product path shape accident: /console is not a product route.
    expect(resolveDesktopSurface("#/console/x")).toBe("product");
  });

  it("hashes map onto the product's top-level route paths", () => {
    expect(desktopProductPathFromHash("")).toBe("/");
    expect(desktopProductPathFromHash("#")).toBe("/");
    expect(desktopProductPathFromHash("#/")).toBe("/");
    expect(desktopProductPathFromHash("#/app")).toBe("/app");
    expect(desktopProductPathFromHash("#/app/payments")).toBe("/app/payments");
    expect(desktopProductPathFromHash("#/capabilities")).toBe("/capabilities");
  });
});

describe("the desktop navigation adapter (hash-driven, reload-free)", () => {
  it("reports the product path and navigates by setting the hash", () => {
    const location = fakeLocation("#/");
    const navigation = createDesktopHashNavigation(location);
    expect(navigation.getPath()).toBe("/");
    navigation.navigate("/app");
    expect(location.hashes).toEqual(["#/app"]);
    expect(navigation.getPath()).toBe("/app");
  });

  it("subscribes to hash changes (back/forward + programmatic switches)", () => {
    const location = fakeLocation("#/");
    const navigation = createDesktopHashNavigation(location);
    let notified = 0;
    const unsubscribe = navigation.subscribe(() => {
      notified += 1;
    });
    location.setHash("#/app");
    expect(notified).toBe(1);
    expect(navigation.getPath()).toBe("/app");
    unsubscribe();
    location.setHash("#/");
    expect(notified).toBe(1);
  });

  it("the console entry opens the supporting surface in-place", () => {
    const location = fakeLocation("#/");
    const entry = createDesktopConsoleEntry(location);
    expect(entry.label).toBe("Agent console");
    entry.onOpen();
    expect(location.hashes).toEqual([DESKTOP_CONSOLE_HASH]);
    expect(resolveDesktopSurface(location.getHash())).toBe("console");
  });
});

describe("the About panel: PaySwap identity + preserved upstream attribution (§4)", () => {
  it("the custom dialog renders the PaySwap application name + the attribution line", () => {
    const html = createCustomAboutDialogHtml({
      applicationName: "PaySwap Desktop",
      appVersion: "1.0.0",
      copyright: "Copyright © 2026 PaySwap.",
      optimizationLine: "",
      versionLabel: "version",
      okButtonLabel: "OK",
      attribution: "Built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).",
    });
    expect(html).toContain("PaySwap Desktop");
    expect(html).toContain("Copyright © 2026 PaySwap.");
    // Attribution is preserved AS ATTRIBUTION (its own muted line class).
    expect(html).toContain("Built on the ZCode open-source platform");
    expect(html).toContain('class="attribution"');
    // The PaySwap mark (not the ZCode logo) in the dialog icon.
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).not.toContain('viewBox="0 0 256 218"');
  });

  it("about.ts carries the PaySwap identity constants (source-scan: Electron module)", () => {
    const source = readSource("src/main/about.ts");
    expect(source).toContain('ABOUT_APPLICATION_NAME = "PaySwap Desktop"');
    expect(source).toContain('aboutTitle: "About PaySwap"');
    expect(source).toContain('aboutTitle: "关于 PaySwap"');
    expect(source).toContain("Copyright © ${year} PaySwap.");
    expect(source).toContain("版权所有 © ${year} PaySwap。");
    // The attribution block is wired into the dialog for BOTH locales.
    expect(source).toContain("attribution: aboutMessages.attribution");
    expect(source).toContain("zai-org/ZCode");
  });
});

describe("the desktop runtime identity (source-scan: Electron module)", () => {
  it("runtimeApplicationName defaults to PaySwap (window-title fallback, menus, userData)", () => {
    const source = readSource("src/main/desktopRuntimeEnv.ts");
    expect(source).toContain('"PaySwap Dev"');
    expect(source).toContain('"PaySwap Preview"');
    expect(source).toContain('"PaySwap"');
    // No ZCode default survives.
    expect(source).not.toMatch(/"ZCode( Dev| Preview)?"\s*;/);
  });
});

describe("the renderer identity (title + boot shell + product mount)", () => {
  it("index.html is PaySwap-branded: title, boot mark, wordmark — no ZCode boot art", () => {
    const html = readSource("src/renderer/index.html");
    expect(html).toContain("<title>PaySwap</title>");
    expect(html).toContain('aria-label="Loading PaySwap"');
    expect(html).toContain('class="startup-wordmark"');
    expect(html).toContain("PaySwap</p>");
    // The ZCode logo geometry is gone.
    expect(html).not.toContain('viewBox="0 0 256 218"');
  });

  it("the renderer entry mounts the product switch around the Root console (source-scan)", () => {
    const source = readSource("src/renderer/src/main.tsx");
    expect(source).toContain("ProductSurfaceSwitch");
    expect(source).toContain("createBrowserHashLocation()");
    // The console Root keeps ALL its existing props (wiring untouched).
    expect(source).toMatch(/renderConsole=\{\(\)\s*=>\s*\(\s*<Root/);
    expect(source).toContain("restoreSession={restoreSession}");
    expect(source).toContain("supportsSettings={supportsSettings}");
  });

  it("the surface switch sets PaySwap window titles per surface (source-scan)", () => {
    const source = readSource("src/renderer/src/ProductSurface.tsx");
    expect(source).toContain('"PaySwap — Agent Console"');
    expect(source).toContain("routeDocumentTitle");
    expect(source).toContain("HONEST_DEPLOYMENT_CONTEXT");
    expect(source).toContain("NO_EVIDENCE_COVERAGE");
  });

  it("the renderer build resolves @payswap/app from the workspace (source-scan: vite config)", () => {
    const source = readSource("vite.config.ts");
    expect(source).toContain('"@payswap/app/routes"');
    expect(source).toContain('"@payswap/app"');
    expect(source).toContain("VITE_PAYSWAP_API_URL");
  });
});
