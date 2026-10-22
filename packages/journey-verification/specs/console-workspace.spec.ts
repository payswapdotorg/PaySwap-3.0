/**
 * @payswap/journey-verification — acceptance flow 15: CONSOLE WORKSPACE
 * (JOURNEY-MAP.md §3.15, Phase 10 console flows; CONSOLE-WORKSPACE.md
 * §1/§2).
 *
 * `/console` renders the PaySwap Agent Workspace — PaySwap chrome + the
 * eight-section navigation, the workspace root title "PaySwap — Agent
 * Console", zero console errors; navigation between console sections
 * works through the section nav without a renderer reload; returning to
 * the product works (in-tree history push, never a full reload —
 * asserted via a window marker that survives the navigation); an
 * unknown section path renders the workspace's honest not-found INSIDE
 * the workspace chrome (never the ZCode shell, never a blank screen).
 *
 * All of flow 15 is J14. The desktop store path (#/console over the
 * payswap-desktop channel) is a separate mount verified by the desktop
 * suites + the station desktop GUI inspection (CONSOLE-WORKSPACE.md §9);
 * THIS spec verifies the web /console workspace against the served
 * production build.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

/** The eight workspace sections (CONSOLE-WORKSPACE.md §2 — verbatim). */
const EIGHT_SECTIONS: ReadonlyArray<{ readonly id: string; readonly title: string }> = [
  { id: "overview", title: "Overview" },
  { id: "missions", title: "Missions" },
  { id: "agents", title: "Agents" },
  { id: "approvals", title: "Approvals" },
  { id: "connections", title: "Connections" },
  { id: "activity", title: "Activity & receipts" },
  { id: "lab", title: "Lab" },
  { id: "settings", title: "Settings" },
];

test("[J14] /console renders the PaySwap Agent Workspace: PaySwap chrome, the eight-section navigation, the root title, zero console errors", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);

  // §1: the workspace root title (P11 framing rename).
  await expect.poll(() => page.title()).toBe("PaySwap — Agent Workspace");

  // §1: PaySwap chrome — the wordmark + the "Agent Workspace" framing,
  // the ps- design-system theme root, the skip link, the main landmark.
  const root = page.locator(".ps-console-root");
  await expect(root).toBeVisible();
  await expect(page.locator(".ps-console-brand-name")).toHaveText("PaySwap");
  await expect(page.locator(".ps-console-brand-frame")).toHaveText("Agent Workspace");
  await expect(page.locator("a.ps-skip-link")).toHaveText("Skip to main content");
  await expect(page.locator("main#ps-console-main")).toBeVisible();

  // §2: the console root resolves to the OVERVIEW section.
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Overview");

  // §2: the eight-section navigation — every section link exists with
  // its canonical href, in the pinned order, in BOTH rendered navs (the
  // desktop sidebar and the wrapping mobile section nav).
  for (const scope of [".ps-console-sidebar", ".ps-console-sectionnav"]) {
    const nav = page.locator(scope);
    await expect(nav).toHaveCount(1);
    const links = nav.locator("a");
    await expect(links).toHaveCount(8);
    for (let index = 0; index < EIGHT_SECTIONS.length; index += 1) {
      const section = EIGHT_SECTIONS[index] as { readonly id: string; readonly title: string };
      const link = links.nth(index);
      await expect(link).toHaveText(section.title);
      await expect(link).toHaveAttribute("href", `/console/${section.id}`);
    }
  }

  // §8: the ACTIVE section is marked for assistive tech (aria-current).
  await expect(
    page.locator(".ps-console-sidebar a[aria-current='page']"),
  ).toHaveText("Overview");

  // The overview honest attention line is on the starting point (§6).
  const text = await visibleText(page);
  expect(text).toContain("Decisions needing attention");

  // §8 (P11): the outcome-first home — the question, the intake entry
  // card, the four outcome shortcuts, and the workspace footer with the
  // honest store fact + the live mission count.
  await expect(
    page.locator("#ps-console-overview-question"),
  ).toHaveText("What should PaySwap accomplish?");
  await expect(page.locator("#ps-console-overview-goal")).toBeVisible();
  await expect(page.getByRole("button", { name: "New mission" })).toBeVisible();
  const shortcuts = page.locator(".ps-console-outcome-card");
  await expect(shortcuts).toHaveCount(4);
  for (const title of ["Pay", "Receive", "Move", "Convert"]) {
    await expect(shortcuts.filter({ hasText: title })).toHaveCount(1);
  }
  await expect(page.locator("footer.ps-console-footer")).toBeVisible();
  const footerText = await page.locator(".ps-console-footer").innerText();
  expect(footerText).toContain("browser profile");
  expect(footerText).toContain("0 missions recorded");

  await evidenceShot(page, "01-console-overview-empty.png");
  await expectZeroConsoleDefects(record);
});

test("[J14] console section navigation works in-tree: overview → missions → settings → overview without a renderer reload", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator("main#ps-console-main")).toBeVisible();

  // §2 no-reload law: a window marker set BEFORE the first navigation
  // must survive every in-tree section switch (a reload clears it).
  await page.evaluate(() => {
    (window as { __p10dNoReloadMarker?: boolean }).__p10dNoReloadMarker = true;
  });

  const sidebar = page.locator(".ps-console-sidebar");

  // overview → missions
  await sidebar.locator("a[href='/console/missions']").click();
  await expect(page).toHaveURL(/\/console\/missions$/);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Missions");
  await expect(page.locator(".ps-console-sidebar a[aria-current='page']")).toHaveText("Missions");
  // §1: the route-specific document title (the workspace's own title
  // effect once navigation happens inside the mounted tree).
  await expect.poll(() => page.title()).toBe("Missions — PaySwap Agent Workspace");

  // missions → settings
  await sidebar.locator("a[href='/console/settings']").click();
  await expect(page).toHaveURL(/\/console\/settings$/);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Settings");
  await expect(page.locator(".ps-console-sidebar a[aria-current='page']")).toHaveText("Settings");

  // settings → overview (the section nav keeps working round-trip)
  await sidebar.locator("a[href='/console/overview']").click();
  await expect(page).toHaveURL(/\/console\/overview$/);
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Overview");

  // The renderer was never reloaded across the whole traversal.
  const marker = await page.evaluate(
    () => (window as { __p10dNoReloadMarker?: boolean }).__p10dNoReloadMarker === true,
  );
  expect(marker, "the section navigation never reloaded the renderer (§2)").toBe(true);

  await expectZeroConsoleDefects(record);
});

test("[J14] returning to the product works without a renderer reload: the back affordance lands on the PaySwap home", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.console);
  await expect(page.locator("main#ps-console-main")).toBeVisible();

  await page.evaluate(() => {
    (window as { __p10dNoReloadMarker?: boolean }).__p10dNoReloadMarker = true;
  });

  // §1/§2: the supporting-control back affordance (the topbar button).
  const back = page.locator("button.ps-console-back");
  await expect(back).toBeVisible();
  await expect(back).toHaveText("PaySwap");
  await back.click();

  // The product surface: the PaySwap home hero (J1's surface).
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expect.poll(() => page.title()).toBe("PaySwap");

  // §2: product ← workspace is an in-tree history push, never a reload.
  const marker = await page.evaluate(
    () => (window as { __p10dNoReloadMarker?: boolean }).__p10dNoReloadMarker === true,
  );
  expect(marker, "returning to the product never reloaded the renderer (§2)").toBe(true);

  await expectZeroConsoleDefects(record);
});

test("[J14] an unknown section path renders the workspace's honest not-found inside the workspace chrome", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.consoleUnknownSection);

  // The workspace chrome STAYS (never the ZCode shell, never blank).
  await expect(page.locator(".ps-console-root")).toBeVisible();
  await expect(page.locator(".ps-console-brand-name")).toHaveText("PaySwap");
  await expect(page.locator("main#ps-console-main")).toBeVisible();

  // The honest not-found: a real answer, the real path, the real set of
  // sections, and a working route back to the overview.
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Section not found");
  const text = await visibleText(page);
  expect(text).toContain(
    "No workspace section exists at /console/does-not-exist. The eight sections are overview, missions, agents, approvals, connections, activity, lab and settings.",
  );
  const backToOverview = page.locator("main a[href='/console']");
  await expect(backToOverview).toHaveText("Go to the workspace overview");
  await evidenceShot(page, "02-console-notfound.png");
  await backToOverview.click();
  await expect(page.locator("main#ps-console-main h1").first()).toHaveText("Overview");

  await expectZeroConsoleDefects(record);
});
