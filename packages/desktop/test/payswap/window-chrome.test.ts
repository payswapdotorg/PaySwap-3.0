/**
 * PaySwap window-chrome contract laws (P12-B, Issue #2 Lane B) — the
 * per-platform visual options for the main BrowserWindow.
 *
 * Defect being locked out: the v1.2.0 product shipped Linux as a
 * frameless + TRANSPARENT window (`frame: false, transparent: true,
 * hasShadow: false`). On the actual packaged app the PaySwap surfaces
 * rendered NO window controls at all (the renderer-drawn
 * DesktopWindowControls only mount on the ZCode substrate's
 * advanced-workspace surface), and transparency also strips native
 * edge/corner resize in most Linux window managers — a desktop app that
 * could not be closed from its own chrome, dragged by its titlebar or
 * resized from its edges.
 *
 * The law: Linux uses the NATIVE frame (WM-provided
 * close/minimize/maximize/restore, edge+corner resize, titlebar drag,
 * Alt-menu). darwin keeps the hidden-inset + traffic-light convention;
 * win32 keeps its registered custom overlay — both byte-equivalent to
 * the pre-P12-B composition.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MACOS_TRAFFIC_LIGHT_BASE_POSITION,
  resolveDesktopWindowVisualOptions,
} from "../../src/main/desktopWindowVisualOptions.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const chromeSource = readFileSync(
  join(packageRoot, "src/main/desktopWindowChrome.ts"),
  "utf8",
);

describe("PaySwap desktop window visual options (P12-B)", () => {
  it("Linux uses the native frame — no transparency, no shadow suppression", () => {
    const options = resolveDesktopWindowVisualOptions("linux");
    expect(options.frame).toBe(true);
    expect(options).not.toHaveProperty("transparent");
    expect(options).not.toHaveProperty("hasShadow");
    expect(options).not.toHaveProperty("backgroundColor");
    expect(options).not.toHaveProperty("titleBarStyle");
  });

  it("macOS keeps the hidden-inset + traffic-light convention", () => {
    const options = resolveDesktopWindowVisualOptions("darwin");
    expect(options.titleBarStyle).toBe("hidden");
    expect(options.trafficLightPosition).toEqual(MACOS_TRAFFIC_LIGHT_BASE_POSITION);
    expect(options.vibrancy).toBe("under-window");
    expect(options.visualEffectState).toBe("active");
    expect(options.backgroundColor).toBe("#00000000");
    expect(options).not.toHaveProperty("frame");
  });

  it("Windows keeps the renderer-drawn custom overlay convention", () => {
    const options = resolveDesktopWindowVisualOptions("win32");
    expect(options.frame).toBe(false);
    expect(options.backgroundMaterial).toBe("acrylic");
    expect(options.backgroundColor).toBe("#00000000");
  });

  it("unknown platforms fall back to the native frame (the safe default)", () => {
    const options = resolveDesktopWindowVisualOptions("freebsd" as NodeJS.Platform);
    expect(options.frame).toBe(true);
    expect(options).not.toHaveProperty("transparent");
  });

  it("createBrowserWindow consumes the pure seam (no local visual-options composition)", () => {
    expect(chromeSource).toContain("resolveDesktopWindowVisualOptions(process.platform)");
    expect(chromeSource).not.toContain("buildDesktopWindowVisualOptions");
    expect(chromeSource).not.toMatch(/transparent:\s*true/);
    expect(chromeSource).not.toMatch(/hasShadow:\s*false/);
  });

  it("the Linux menu bar stays auto-hidden (no double menu under the native titlebar)", () => {
    expect(chromeSource).toMatch(/autoHideMenuBar:\s*isLinuxDesktopWindow\(\)/);
  });
});
