/**
 * Desktop renderer strip laws (P15): the desktop main window boots the
 * ORIGINAL ZCode UI — the substrate Root mounts directly in the renderer
 * entry, the PaySwap product/workspace surface switch is GONE from the
 * experience (repo history retains every surface), and the payswap-
 * desktop channel client plumbing survives for the agent-led payment UX
 * integration. Source-scan contract (no Electron runtime here), the
 * same posture the P9-A..P12 surface tests used.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rendererEntry = readFileSync(
  join(packageRoot, "src/renderer/src/main.tsx"),
  "utf8",
);

describe("PaySwap desktop renderer strip (P15)", () => {
  it("the renderer entry mounts the substrate Root directly", () => {
    expect(rendererEntry).toMatch(/<Root\b/);
    expect(rendererEntry).toContain("assistantCodeCommentCardsEnabled");
  });

  it("no product/workspace surface switch stands in front of the Root", () => {
    expect(rendererEntry).not.toContain("ProductSurfaceSwitch");
    expect(rendererEntry).not.toContain("DesktopConsoleWorkspace");
    expect(rendererEntry).not.toContain("createBrowserHashLocation");
  });

  it("the payswap-desktop channel client plumbing survives (the UX integration seam)", () => {
    expect(rendererEntry).toContain("connectDesktopConsoleServices");
  });

  it("the loading title is the original ZCode identity", () => {
    const indexHtml = readFileSync(join(packageRoot, "src/renderer/index.html"), "utf8");
    expect(indexHtml).toContain("<title>ZCode</title>");
  });
});
