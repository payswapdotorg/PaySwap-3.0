/**
 * @payswap/journey-verification — P12 journey J18: PSP CONNECTION
 * SETUP FLOW (JOURNEY-MAP.md §1, P12 Lane C).
 *
 * `/app/connections` is the first-class setup flow for payment-service-
 * provider connections: the honest step list (catalogue → corridors →
 * connect → scopes → validation → health → environments → lifecycle),
 * the connection forms catalogue, and the structural laws — a catalogue
 * entry is never a connection; the connect step states its typed
 * prerequisite instead of fabricating a flow; sandbox and live are
 * structurally distinct; health renders only from real observations.
 *
 * ENTIRELY TIER 2 (@contract — gates at TL integration): the PSP setup
 * surface (foldConnectionsSetup + the ConnectionsAreaSurface setup and
 * forms blocks) is Lane P12-C work.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

/** The typed connect prerequisite — VERBATIM from the connections
 * catalogue (the honest gate; drift here = a real finding). */
const CONNECT_PREREQUISITE =
  "Connect requires the provider connection plane — session authority plus the provider registry, wired by the platform mount. This surface is the honest catalogue and lifecycle contract; it refuses to fabricate a connect flow, a login, or a connected provider before that plane exists.";

test("[J18][@contract] the setup flow is honest at zero connections: the count is the recorded truth and the catalogue is never a connection", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);

  await expect(page.getByRole("heading", { name: "PSP connection setup — 0 connected", level: 2 })).toBeVisible();
  const text = await visibleText(page);
  // The catalogue law (INV-13).
  expect(text).toContain("A catalogue entry is never a connection");

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p12-j18-psp-setup.png");
});

test("[J18][@contract] the connect step states its typed prerequisite — never a dead button, never a fabricated login", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);

  // The step title renders as the row name (a span inside the step li).
  const row = page
    .getByText("Connect & authenticate a provider", { exact: true })
    .locator("xpath=ancestor::li[contains(@class,'ps-cap-row')][1]");
  await expect(row).toBeVisible();
  await expect(row.getByText("Setup required — the honest gate")).toBeVisible();
  await expect(row.getByText(CONNECT_PREREQUISITE)).toBeVisible();

  await expectZeroConsoleDefects(record);
});

test("[J18][@contract] scopes, sandbox/live and health render as declared structural laws; the forms catalogue renders as reference", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);
  const text = await visibleText(page);

  // Scopes: the operation-class vocabulary with the degraded-connection law.
  expect(text).toContain("Review scopes & permissions");
  expect(text).toContain("a degraded connection never carries new consequential effects");

  // Sandbox/live: structurally distinct (INV-25).
  expect(text).toContain("Keep sandbox and live distinct");
  expect(text).toContain("a sandbox pass is never proof of live behavior");

  // Health: honest empty at zero connections.
  expect(text).toContain("Health & observations");
  expect(text).toContain("No connection health to observe");

  // Lifecycle: the lawful transition machine, honestly empty.
  expect(text).toContain("Reconnect, disable, or disconnect");

  // The forms catalogue renders as reference (Catalogue pills, never
  // connection claims).
  await expect(page.getByRole("heading", { name: "The connection forms catalogue", level: 2 })).toBeVisible();
  expect(text).toContain("SANDBOX / LIVE");

  await expectZeroConsoleDefects(record);
});
