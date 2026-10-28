/**
 * @payswap/journey-verification — P13 journeys J21–J23: the CONVERGENCE
 * + DURABILITY laws of the shared agent composer (JOURNEY-MAP.md §1, §6).
 *
 * - J21: a Connections Stripe-card click and a typed "connect Stripe"
 *   reach the SAME resumable CONNECTION_SETUP task — CREATED then
 *   RESUMED, never a duplicate; nothing is connected (the honest law).
 * - J22: a Payments Pay-card click and a typed "pay the supplier" seed
 *   the SAME resumable PAYMENT_MISSION task; checkout has NO card.
 * - J23: minimize/reopen keeps the draft + transcript; a full reload
 *   keeps the task list (restart resume at the browser-profile tier).
 *
 * ENTIRELY TIER 2 (@contract — gates at TL integration on the merged
 * tree): the composer plane is Lane P13-A work.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";



/**
 * Open the composer on the current page and return the panel locator.
 * A surface-action seed AUTO-OPENS the composer (mode: "open") — so the
 * panel may already be up (the dock does not exist in that state);
 * otherwise click the dock.
 */
async function openComposer(page: import("@playwright/test").Page) {
  const panel = page.locator(".ps-agent-panel");
  const alreadyOpen = await panel.isVisible();
  if (!alreadyOpen) {
    const dock = page.getByRole("button", { name: /PaySwap agent/i });
    await dock.click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

/** Send text through the composer input. */
async function sendText(page: import("@playwright/test").Page, text: string) {
  const input = page.locator(".ps-agent-input-field");
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
}

test("[J21][@contract] the Connections Stripe card seeds a CONNECTION_SETUP task; a typed \"connect Stripe\" RESUMES the same one — never a duplicate", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);

  // 1. The card click (the surface-action entrypoint).
  const card = page.getByRole("button", { name: /Connect Stripe/i }).first();
  await expect(card).toBeVisible();
  await card.click();

  const panel = await openComposer(page);
  await expect(panel).toContainText("Task created");
  await expect(panel).toContainText("Connect Stripe");
  // The honest law: seeding connects nothing.
  await expect(panel).toContainText("not a payment or a connection");

  // 2. The chat-text entrypoint converges on the SAME task.
  await sendText(page, "connect Stripe");
  await expect(panel).toContainText("Task resumed — the same one, not a duplicate");

  // 3. ONE task record (no duplicate).
  await expect(panel.locator(".ps-agent-task")).toHaveCount(1);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p13-j21-connect-convergence.png");
});

test("[J22][@contract] a typed \"pay the supplier\" seeds the ONE payment-intake task — starting a task pays nothing", async ({ page }) => {
  const record = trackConsole(page);
  // (P21-D re-scope) The pre-strip Payments-area direction CARDS retired
  // with the P15 strip (the desktop product tier carries the surface
  // entrypoints); the TEXT path — the convergence law's substance —
  // stands on the substrate shell.
  await page.goto(CONTRACT_ROUTES.appPayments);

  const panel = await openComposer(page);
  await sendText(page, "pay the supplier");
  await expect(panel).toContainText("Task created");
  // The honest law: starting a task pays nothing.
  await expect(panel).toContainText("not a payment or a connection");
  await expect(panel.locator(".ps-agent-task")).toHaveCount(1);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p21-j22-pay-text-seeding.png");
});

test("[J23][@contract] minimize returns focus to the dock and keeps the draft; reopen restores it", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appPayments);

  const panel = await openComposer(page);
  const input = page.locator(".ps-agent-input-field");
  await input.fill("pay the supplier tomorrow");

  // Escape minimizes; the dock keeps focus; the draft is kept.
  await input.press("Escape");
  const dock = page.getByRole("button", { name: /PaySwap agent/i });
  await expect(dock).toBeVisible();
  await expect(page.locator(".ps-agent-panel")).toHaveCount(0);

  // Reopen: the draft survives.
  await dock.click();
  const reopened = page.locator(".ps-agent-input-field");
  await expect(reopened).toHaveValue("pay the supplier tomorrow");

  await expectZeroConsoleDefects(record);
});

test("[J23][@contract] a full page reload keeps the task list and history (restart resume, browser-profile tier)", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);

  // Seed a task first.
  const card = page.getByRole("button", { name: /Connect Stripe/i }).first();
  await card.click();
  const panel = await openComposer(page);
  await expect(panel).toContainText("Task created");

  // The restart: a full reload. (P21-D fix) The boot wait accepts
  // EITHER chrome — isVisible() does not wait, and the dock is ABSENT
  // from the tree while the open panel renders (the app takes ~8s to
  // re-boot; the 5s default raced it — the J24 pattern).
  await page.reload();
  const panelAfterReload = page.locator(".ps-agent-panel");
  const dockAfterReload = page.getByRole("button", { name: /PaySwap agent/i });
  await expect(panelAfterReload.or(dockAfterReload)).toBeVisible({ timeout: 20_000 });
  if (!(await panelAfterReload.isVisible())) {
    await expect(dockAfterReload).toContainText("1");
    await dockAfterReload.click();
  }
  await expect(panelAfterReload).toContainText("Connect Stripe");

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p13-j23-reload-resume.png");
});

test("[J22][@contract] an unresolvable payment text gets the honest UNKNOWN reply — never a guessed provider or direction", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appPayments);

  const panel = await openComposer(page);
  await sendText(page, "please do something vague");
  await expect(panel).toContainText("no route yet");
  await expect(panel).toContainText("I never guess a provider or a direction");

  await expectZeroConsoleDefects(record);
});
