/**
 * @payswap/journey-verification — acceptance flow 10: ACCESSIBILITY
 * (JOURNEY-MAP.md §3.10: "axe-core pass on core pages for WCAG 2.2 AA
 * critical rules; reduced-motion respected").
 *
 * Tier 1: axe on the five base product pages + the reduced-motion law
 * (the design system's motion tokens collapse under
 * prefers-reduced-motion — tokens.css; WCAG 2.3.3 posture).
 *
 * Tier 2 (@contract): the same scan on the contract home + app routes
 * (gates at TL integration once Lane P9-A lands the new route space).
 */

import { test, expect } from "@playwright/test";
import { BASE_ROUTES, CONTRACT_ROUTES } from "../journeys.manifest.js";
import { analyzeWithKnownFindings, axeScan, KNOWN_BASE_FINDINGS } from "../support/axe.js";
import { expectZeroConsoleDefects, trackConsole } from "../support/helpers.js";

const BASE_PAGES: ReadonlyArray<{ readonly name: string; readonly route: string }> = [
  { name: "home", route: BASE_ROUTES.home },
  { name: "app-entry", route: BASE_ROUTES.appEntry },
  { name: "capabilities", route: BASE_ROUTES.capabilities },
  { name: "security", route: BASE_ROUTES.security },
  { name: "developers", route: BASE_ROUTES.developers },
];

test("[J1][J2][J8][J10][J12] axe-core: WCAG 2.2 AA critical rules pass on the base product pages", async ({
  page,
}) => {
  const record = trackConsole(page);

  for (const surface of BASE_PAGES) {
    await page.goto(surface.route);
    await expect(page.locator("main").first()).toBeVisible();

    // Full critical rule set, minus ONLY the pinned base findings
    // (support/axe.ts KNOWN_BASE_FINDINGS — each one a REAL recorded
    // defect with an owner; drift-checked in both directions below).
    const outcome = await analyzeWithKnownFindings(page, surface.route);

    const described = outcome.newViolations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      page: surface.name,
    }));
    expect(described, `axe violations on ${surface.name} (beyond the pinned base findings)`).toEqual(
      [],
    );

    // Drift check, direction 1: a pinned finding that no longer
    // reproduces means the pin is stale — remove it (the tree got
    // better; the allowlist must shrink, never linger).
    expect(
      outcome.stalePins.map((pin) => `${pin.rule}@${pin.route}`),
      `stale pins on ${surface.name} — the finding is FIXED, remove it from KNOWN_BASE_FINDINGS`,
    ).toEqual([]);

    // Drift check, direction 2: the pinned findings observed are exactly
    // the ones pinned for this route (no silent scope growth).
    expect(
      outcome.observedKnown.map((pin) => `${pin.rule}@${pin.route}`).sort(),
    ).toEqual(
      KNOWN_BASE_FINDINGS.filter((pin) => pin.route === surface.route)
        .map((pin) => `${pin.rule}@${pin.route}`)
        .sort(),
    );
  }

  await expectZeroConsoleDefects(record);
});

test("[J1] reduced motion is respected: the motion tokens collapse under prefers-reduced-motion", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(BASE_ROUTES.home);
  await expect(page.locator("main").first()).toBeVisible();

  // Baseline: the product theme's motion tokens carry real durations.
  const baseline = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".ps-theme-light") ?? document.documentElement)
      .getPropertyValue("--ps-duration-fast")
      .trim(),
  );
  expect(baseline).toBe("150ms");

  // With the user's reduced-motion preference emulated, the tokens
  // collapse to (effectively) zero — the CSS-side law (tokens.css
  // @media (prefers-reduced-motion: reduce); the JS side is the
  // useReducedMotion hook, mirrored here by the emulation itself).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".ps-theme-light") ?? document.documentElement)
      .getPropertyValue("--ps-duration-fast")
      .trim(),
  );
  expect(reduced).toBe("0.01ms");

  // The page still renders fully under reduced motion.
  await expect(page.locator("#hero-heading")).toBeVisible();

  await expectZeroConsoleDefects(record);
});

test("[J1][J2][@contract] axe-core: the contract home and app surfaces pass the same critical rules", async ({
  page,
}) => {
  const record = trackConsole(page);

  for (const route of [CONTRACT_ROUTES.home, CONTRACT_ROUTES.app]) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();

    // The @contract scan is FULL strictness — no pinned-base-finding
    // subtractions. Any violation on the new route space is a finding
    // against the P9-A acceptance, never an allowlist entry.
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
