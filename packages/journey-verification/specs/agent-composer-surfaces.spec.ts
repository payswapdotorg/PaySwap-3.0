/**
 * @payswap/journey-verification — P13 journey J20: SHARED AGENT
 * ENTRYPOINTS — ONE COMPOSER, EVERY SURFACE (JOURNEY-MAP.md §1, §6).
 *
 * The persistent, toggleable PaySwap agent composer mounts on every
 * integrated surface (home, app overview, payments, connections,
 * accounts AND the Agent Workspace) and every entrypoint drives the ONE
 * shared controller. The panel's honest notes render VERBATIM: the
 * zero-authority law, the no-tools fact, the declared-unsupported VOICE
 * statement. Never a microphone control. Secrets never enter chat.
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

/** The pinned voice statement — VERBATIM from the shared contract
 * (surface agent-tasks.ts, mirrored in the app pins; drift = a real
 * finding, not a test to relax). */
const VOICE_STATEMENT =
  "Voice input is not supported in this deployment — there is no speech-to-text capability to route. Type your request instead; it reaches the same task system.";

/** The dock label (the shared entrypoint on every surface). */
const DOCK_LABEL = "PaySwap agent";

test("[J20][@contract] the composer dock renders on every integrated surface — one shared entrypoint", async ({ page }) => {
  const record = trackConsole(page);
  const surfaces = [
    { name: "home", route: CONTRACT_ROUTES.home },
    { name: "app overview", route: CONTRACT_ROUTES.app },
    { name: "payments", route: CONTRACT_ROUTES.appPayments },
    { name: "connections", route: CONTRACT_ROUTES.appConnections },
    { name: "accounts", route: CONTRACT_ROUTES.appAccounts },
    { name: "Agent Workspace", route: CONTRACT_ROUTES.console },
  ];
  for (const surface of surfaces) {
    await page.goto(surface.route);
    await expect(
      page.getByRole("button", { name: new RegExp(DOCK_LABEL, "i") }),
      `the composer dock on ${surface.name} (${surface.route})`,
    ).toBeVisible();
  }
  await expectZeroConsoleDefects(record);
});

test("[J20][@contract] the open panel renders the pinned honest notes verbatim — zero authority, no tools, voice unsupported, no microphone control", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);

  const dock = page.getByRole("button", { name: new RegExp(DOCK_LABEL, "i") });
  await dock.click();
  const panel = page.locator(".ps-agent-panel");
  await expect(panel).toBeVisible();

  const text = await visibleText(page);
  // The zero-authority law (ADR-0007 D7) — verbatim vocabulary.
  expect(text).toContain("no financial authority");
  // The honest no-tools fact (the session plane is not wired).
  expect(text).toContain("No tools are exposed");
  // The declared-unsupported VOICE statement — VERBATIM.
  expect(text).toContain(VOICE_STATEMENT);
  // Never a microphone control, never a voice simulation.
  expect(text.toLowerCase()).not.toContain("microphone");
  await expect(page.locator(".ps-agent-panel [aria-label*='voice' i]")).toHaveCount(0);

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p13-j20-composer-honest-notes.png");
});

test("[J20][@contract] secret-shaped text is refused before it is recorded — the chat law, no material echoed", async ({ page }) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appPayments);

  const dock = page.getByRole("button", { name: new RegExp(DOCK_LABEL, "i") });
  await dock.click();
  const input = page.locator(".ps-agent-input-field");
  await expect(input).toBeVisible();

  // A clearly secret-shaped test string (NOT a real credential) —
  // constructed non-contiguously so secret scanners never see a live
  // key literal (the established fake-key discipline).
  const SECRET_SHAPED = "sk" + "_test_51FakeDoNotUse0000000000";
  await input.fill(SECRET_SHAPED);
  await input.press("Enter");

  // The refusal lands in the transcript and echoes NO material.
  await expect(page.locator(".ps-agent-panel")).toContainText(/secret|credential|refus/i);
  const text = await visibleText(page);
  expect(text).not.toContain(SECRET_SHAPED);

  await expectZeroConsoleDefects(record);
});
