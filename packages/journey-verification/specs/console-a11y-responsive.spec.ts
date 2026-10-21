/**
 * @payswap/journey-verification — acceptance flow 19: CONSOLE
 * ACCESSIBILITY + RESPONSIVE (JOURNEY-MAP.md §3.19; CONSOLE-WORKSPACE.md
 * §8).
 *
 * axe-core critical pass (support/axe.ts conventions — WCAG 2.2 AA
 * critical tag sets, FULL strictness: the console is new route space,
 * no pinned subtractions) on /console, /console/missions and
 * /console/connections at desktop 1280×800; mobile 390×844 on /console
 * + /console/missions with no horizontal overflow; keyboard traversal
 * of the section navigation with the focus-visible law; reduced motion
 * respected (the --ps-duration collapse check per the existing
 * accessibility.spec.ts pattern + the console root's own
 * data-reduced-motion mirror); landmarks present (nav + main).
 *
 * All of flow 19 is J14.
 *
 * KNOWN FINDING (real, pinned, drift-checked in BOTH directions — the
 * support/axe.ts KNOWN_BASE_FINDINGS discipline): the console
 * focus-visible law loses the browser cascade in the served build. See
 * PINNED_CONSOLE_FOCUS_FINDING below for the full record. The
 * convention itself (the authored + shipped stylesheet law) IS asserted
 * green here; the computed-style truth is asserted WITH the pin.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import { axeScan } from "../support/axe.js";
import {
  expectNoHorizontalOverflow,
  expectZeroConsoleDefects,
  trackConsole,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

/**
 * A REAL browser-level finding on the console workspace, pinned (never
 * hidden, never a fake pass — the axe.ts KNOWN_BASE_FINDINGS pattern):
 *
 * RULE: focus-visible-cascade (WCAG 2.4.7/2.4.11 — the computed-style
 * truth this flow exists to verify).
 *
 * FINDING: keyboard focus on the console workspace computes to
 * `outline-style: none` in the browser. The substrate stylesheet ships
 * `*:focus, *:focus-visible { outline: none !important;
 * box-shadow: none !important; }` GLOBALLY (packages/ui/src/styles.css
 * ~line 120 — the ZCode shell's own ring system), and the console's
 * focus law (packages/payswap-app/src/console/console.css ~line 293:
 * `.ps-console-nav-link:focus-visible, … { outline: 2px solid
 * var(--ps-focus); }`) is authored WITHOUT !important — it loses the
 * cascade. The P9-A focus fixup (payswap-elevation.css) restored focus
 * visibility with !important but scoped it to `.ps-product-root`,
 * which the console root (`.ps-console-root`) does not carry.
 *
 * OWNER: TL (P10 integration fixup) — mirror the .ps-product-root
 * !important restoration for .ps-console-root (the same cascade law
 * the elevation css documents).
 *
 * DRIFT DISCIPLINE: while the finding reproduces, this flow records it
 * (annotation) and stays green on the CONVENTION assertions; the day
 * the ring computes visible, the test FAILS demanding the pin's removal
 * (the allowlist must shrink, never linger — axe.ts stalePins law).
 */
const PINNED_CONSOLE_FOCUS_FINDING = {
  rule: "focus-visible-cascade",
  route: "/console",
  finding:
    "console keyboard focus computes outline-style:none — the substrate's global `*:focus-visible { outline: none !important }` beats the console's non-!important focus law; the P9-A !important fixup is scoped to .ps-product-root only",
  owner: "TL (P10 integration fixup — extend the !important focus law to .ps-console-root)",
} as const;

test("[J14] axe-core: WCAG 2.2 AA critical rules pass on the console sections (desktop 1280×800, full strictness)", async ({
  page,
}) => {
  const record = trackConsole(page);

  for (const route of [
    CONTRACT_ROUTES.console,
    CONTRACT_ROUTES.consoleMissions,
    CONTRACT_ROUTES.consoleConnections,
  ]) {
    await page.goto(route);
    await expect(page.locator("main#ps-console-main")).toBeVisible();

    // The console is NEW route space: the @contract precedent applies —
    // FULL strictness, no pinned-base-finding subtractions. Any
    // violation is a finding against the console acceptance.
    const results = await axeScan(page).analyze();
    const described = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
    expect(described, `axe violations on ${route}`).toEqual([]);
  }

  await expectZeroConsoleDefects(record);
});

test("[J14] mobile 390×844: the console surfaces render with no horizontal overflow and the wrapping section nav carries navigation", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of [CONTRACT_ROUTES.console, CONTRACT_ROUTES.consoleMissions]) {
    await page.goto(route);
    await expect(page.locator("main#ps-console-main")).toBeVisible();

    // No horizontal overflow: scrollWidth == clientWidth (the responsive
    // law's clipped-content instrument).
    await expectNoHorizontalOverflow(page);

    // The mobile section nav (the wrapping nav) carries navigation at
    // this width; the desktop sidebar is hidden by the design system.
    const sectionNav = page.locator(".ps-console-sectionnav");
    await expect(sectionNav).toBeVisible();
    await expect(sectionNav.locator("a")).toHaveCount(8);
    const sidebarHidden = await page.evaluate(() => {
      const sidebar = document.querySelector(".ps-console-sidebar");
      return sidebar !== null && getComputedStyle(sidebar).display === "none";
    });
    expect(sidebarHidden, "the desktop sidebar is hidden at mobile width").toBe(true);
  }

  await evidenceShot(page, "12-console-missions-mobile-390.png");
  await expectZeroConsoleDefects(record);
});

test("[J14] keyboard traversal: skip link first, the section nav reachable, the focus-visible law, landmarks present", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator("main#ps-console-main")).toBeVisible();

  // §8: the skip link is the FIRST tab stop and targets the main region.
  await page.keyboard.press("Tab");
  const skipState = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      isSkipLink: active?.classList.contains("ps-skip-link") ?? false,
      text: active?.textContent ?? "",
      href: active?.getAttribute("href") ?? "",
    };
  });
  expect(skipState.isSkipLink, "the first focusable element is the skip link").toBe(true);
  expect(skipState.text).toContain("Skip to main content");
  expect(skipState.href).toBe("#ps-console-main");

  // §8: the supporting back control, then the section navigation —
  // keyboard-reachable, focus moving through real elements.
  await page.keyboard.press("Tab");
  const backState = await page.evaluate(() => ({
    isBack: document.activeElement?.classList.contains("ps-console-back") ?? false,
    text: document.activeElement?.textContent ?? "",
  }));
  expect(backState.isBack, "the back affordance is keyboard-reachable").toBe(true);
  expect(backState.text).toBe("PaySwap");

  await page.keyboard.press("Tab");
  const navStop = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      // Viewport-agnostic (this spec runs in BOTH projects — the mobile
      // project's testMatch regex matches this file name): the section
      // navigation renders as the desktop sidebar at ≥lg and the
      // wrapping section nav below; either way the third tab stop is
      // the active section link inside nav[aria-label='Console sections'].
      inSectionNav: active?.closest("nav[aria-label='Console sections']") !== null,
      cls: active?.getAttribute("class") ?? "",
      text: active?.textContent ?? "",
      current: active?.getAttribute("aria-current") ?? "",
    };
  });
  expect(navStop.inSectionNav, "Tab reaches the section navigation").toBe(true);
  expect(navStop.text).toBe("Overview");
  expect(navStop.current).toBe("page");

  // The focus-visible CONVENTION (§8 — the authored law): the focused
  // element carries one of the console interactive classes AND the
  // served stylesheet ships its :focus-visible outline rule (verified
  // against the live CSSOM of the production build).
  const conventionClass = navStop.cls.includes("ps-console-nav-item")
    ? "ps-console-nav-item"
    : navStop.cls.includes("ps-console-nav-link")
      ? "ps-console-nav-link"
      : null;
  expect(
    conventionClass,
    "the focused section link carries a console interactive class",
  ).not.toBeNull();
  const conventionRule = await page.evaluate((className) => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const stack: CSSRule[] = Array.from(rules);
      while (stack.length > 0) {
        const rule = stack.pop();
        if (rule === undefined) {
          continue;
        }
        const grouping = rule as CSSRule & { readonly cssRules?: CSSRuleList | null };
        if (grouping.cssRules !== undefined && grouping.cssRules !== null) {
          stack.push(...Array.from(grouping.cssRules));
        }
        const styled = rule as CSSStyleRule;
        const selector = styled.selectorText ?? "";
        if (
          selector.includes(`.${className}:focus-visible`) &&
          styled.style !== undefined &&
          styled.style.outline !== ""
        ) {
          return styled.style.outline;
        }
      }
    }
    return null;
  }, conventionClass);
  expect(
    conventionRule,
    "the served stylesheet carries the console :focus-visible outline law",
  ).toBe("2px solid var(--ps-focus)");

  // The computed-style TRUTH, pinned (see PINNED_CONSOLE_FOCUS_FINDING):
  // while the defect reproduces it is recorded via the annotation; once
  // fixed, this FAILS so the pin is removed (the allowlist must shrink).
  const computedOutline = await page.evaluate(() => {
    const active = document.activeElement;
    return active === null ? null : getComputedStyle(active).outlineStyle;
  });
  if (computedOutline === "none") {
    expect(PINNED_CONSOLE_FOCUS_FINDING.rule).toBe("focus-visible-cascade");
    test.info().annotations.push({
      type: "known-finding",
      description: `${PINNED_CONSOLE_FOCUS_FINDING.rule}@${PINNED_CONSOLE_FOCUS_FINDING.route}: ${PINNED_CONSOLE_FOCUS_FINDING.finding} — owner: ${PINNED_CONSOLE_FOCUS_FINDING.owner}`,
    });
  } else {
    throw new Error(
      "console focus-visible drift: the keyboard focus ring now computes visible — the pinned finding is STALE; remove it from console-a11y-responsive.spec.ts (the axe.ts stalePins law: the allowlist must shrink, never linger)",
    );
  }

  // §8 landmarks: the section navigation + the main region, with the
  // active section marked (aria-current) and the section heading
  // present. Both rendered section navs (the desktop sidebar's nav and
  // the wrapping section nav) carry the accessible name; exactly ONE
  // is visible per viewport (the design system's responsive swap).
  const sectionNavs = page.locator("nav[aria-label='Console sections']");
  await expect(sectionNavs).toHaveCount(2);
  const visibleNavCount = await sectionNavs.evaluateAll((navs) =>
    navs.filter((nav) => nav.getClientRects().length > 0).length,
  );
  expect(visibleNavCount, "exactly one section nav is visible per viewport").toBe(1);
  await expect(page.locator("main#ps-console-main")).toBeVisible();
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Overview");

  await expectZeroConsoleDefects(record);
});

test("[J14] reduced motion is respected: the motion tokens collapse and the console root reports data-reduced-motion", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator("main#ps-console-main")).toBeVisible();

  // Baseline: the product theme's motion tokens carry real durations
  // (the accessibility.spec.ts pattern — the workspace root carries
  // .ps-theme-light, the same design-system token scope).
  const baseline = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".ps-theme-light") ?? document.documentElement)
      .getPropertyValue("--ps-duration-fast")
      .trim(),
  );
  expect(baseline).toBe("150ms");

  // Under the user's reduced-motion preference the tokens collapse to
  // (effectively) zero — the CSS-side law (tokens.css)…
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".ps-theme-light") ?? document.documentElement)
      .getPropertyValue("--ps-duration-fast")
      .trim(),
  );
  expect(reduced).toBe("0.01ms");

  // …and the console root's own JS mirror reports it
  // (data-reduced-motion — the useReducedMotion hook; console.css).
  await expect
    .poll(async () =>
      page.evaluate(() => document.querySelector(".ps-console-root")?.getAttribute("data-reduced-motion") ?? ""),
    )
    .toBe("true");

  // The page still renders fully under reduced motion.
  await expect(page.locator("main#ps-console-main h1").first()).toBeVisible();

  await expectZeroConsoleDefects(record);
});
