/**
 * PaySwap app scroll-contract laws (P12-B, Issue #2 Lane B) — the
 * viewport/overflow contract for every product surface class.
 *
 * Defect being locked out: the inherited substrate stylesheet
 * (packages/ui/src/styles.css — required by the advanced ZCode workspace
 * mount) traps the document with `body { overflow: hidden }` and
 * `#root { height: 100dvh; overflow: hidden }`. In the v1.2.0 packaged
 * app the marketing home page was cropped at the fold with NO way to
 * scroll past it.
 *
 * The contract:
 *   - marketing surfaces (home/capabilities/security/developers — marked
 *     by .ps-product-root WITHOUT .ps-area-nav) get true document
 *     scrolling via the `:has()` unlock, which beats the substrate
 *     globals without touching them (they stay in force for the bounded
 *     workspace shells that need them);
 *   - the /app/* eleven-area surfaces (marked by .ps-area-nav) are
 *     BOUNDED 100dvh shells whose .ps-product-main owns the vertical
 *     scroll, with min-height:0 flex hygiene;
 *   - the Agent Workspace console (.ps-console-root) is a bounded 100dvh
 *     shell whose .ps-console-main owns the vertical scroll;
 *   - horizontal scrolling stays confined to the section nav / wide
 *     table wrappers.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const productCss = readFileSync(join(appRoot, "src/payswap-product.css"), "utf8");
const consoleCss = readFileSync(join(appRoot, "src/console/console.css"), "utf8");

describe("PaySwap app scroll contract (P12-B)", () => {
  it("marketing surfaces unlock true document scrolling against the substrate trap", () => {
    expect(productCss).toContain("body:has(.ps-product-root)");
    expect(productCss).toMatch(/body:has\(\.ps-product-root\)\s*{\s*overflow:\s*auto/);
    expect(productCss).toMatch(
      /#root:has\(\.ps-product-root\)\s*{\s*height:\s*auto;\s*min-height:\s*100dvh;\s*overflow:\s*visible/,
    );
  });

  it("the /app/* area surfaces are bounded shells with internal scroll", () => {
    expect(productCss).toMatch(/\.ps-product-root:has\(\.ps-area-nav\)\s*{\s*height:\s*100dvh/);
    expect(productCss).toMatch(
      /\.ps-product-root:has\(\.ps-area-nav\) \.ps-product-main\s*{\s*min-height:\s*0;\s*overflow-y:\s*auto/,
    );
  });

  it("the Agent Workspace console is a bounded shell with internal scroll", () => {
    expect(consoleCss).toMatch(/\.ps-console-root\s*{\s*height:\s*100dvh;\s*min-height:\s*0/);
    expect(consoleCss).toMatch(
      /\.ps-console-main\s*{\s*flex:\s*1 1 auto;\s*min-width:\s*0;\s*min-height:\s*0;\s*overflow-y:\s*auto/,
    );
  });

  it("no owned stylesheet traps the whole document", () => {
    for (const [name, css] of [
      ["payswap-product.css", productCss],
      ["console.css", consoleCss],
    ] as const) {
      expect(css, name).not.toMatch(/(^|\n)\s*html,\s*body\s*{[^}]*overflow:\s*hidden/);
      expect(css, name).not.toMatch(/(^|\n)\s*body\s*{[^}]*overflow:\s*hidden/);
    }
  });

  it("horizontal scrolling stays confined to nav/table wrappers", () => {
    // The only overflow-x:auto rules in the console stylesheet are the
    // section nav row and explicit table wrappers.
    const selectors = consoleCss
      .split("}")
      .filter((block) => /overflow-x:\s*auto/.test(block))
      .map((block) => block.slice(0, block.indexOf("{")).replace(/\/\*[\s\S]*?\*\//g, "").trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(/^\.ps-console-sectionnav\b|^\.ps-tablewrap\b|table/i);
    }
  });
});
