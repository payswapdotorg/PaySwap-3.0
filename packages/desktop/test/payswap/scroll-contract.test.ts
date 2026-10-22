/**
 * PaySwap desktop renderer scroll-contract laws (P12-B, Issue #2 Lane B).
 *
 * The desktop product-surface switch (ProductSurface.tsx) renders its
 * subtrees as FRAGMENTS — productSurface.css must therefore never
 * introduce a wrapper that imposes a second scroll context or traps
 * wheel events. The scroll behavior is owned by the mounted surfaces:
 * marketing pages scroll the document (unlocked in
 * @payswap/app payswap-product.css), the /app/* areas and the Agent
 * Workspace use bounded shells with internal scroll containers.
 *
 * This test pins the desktop side of that contract at the source level.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const productSurfaceCss = readFileSync(
  join(packageRoot, "src/renderer/src/productSurface.css"),
  "utf8",
);
const productSurfaceSource = readFileSync(
  join(packageRoot, "src/renderer/src/ProductSurface.tsx"),
  "utf8",
);

describe("PaySwap desktop renderer scroll contract (P12-B)", () => {
  it("documents the no-wrapper contract in the stylesheet header", () => {
    expect(productSurfaceCss).toContain("P12-B VIEWPORT/SCROLL CONTRACT");
    expect(productSurfaceCss).toContain("NO");
    expect(productSurfaceCss).toContain("surface wrapper");
  });

  it("never traps scrolling at the desktop surface layer", () => {
    // The only overflow rule allowed in this file is on the floating
    // back-to-product control itself — never on a wrapper element.
    const overflowRules = productSurfaceCss.match(/overflow[^;]*;/g) ?? [];
    for (const rule of overflowRules) {
      expect(rule).not.toMatch(/overflow(-y)?:\s*hidden/);
    }
  });

  it("the surface switch renders fragments (no wrapper div around the mounted surfaces)", () => {
    // The switch component returns its subtrees directly; a wrapper would
    // break the bounded-shell contract of the app surfaces.
    expect(productSurfaceSource).not.toMatch(/className="ps-desktop-surface/);
  });
});
