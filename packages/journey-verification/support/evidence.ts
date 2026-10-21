/**
 * @payswap/journey-verification — the console-flow EVIDENCE capture
 * (P10-D, JOURNEY-MAP.md §4 evidence obligations).
 *
 * The suite's default is screenshots-on-failure only (playwright.config);
 * the acceptance flows additionally capture EXPLICIT decision-point
 * screenshots. They land under the package's gitignored
 * test-results/evidence/ directory (next to the JSON/HTML reports — the
 * same per-run artifacts location), one stable file name per decision
 * point so a receipts run can archive them (the delivery/p10-screenshots
 * convention, mirrored from the P9 wave's delivery/p9-screenshots).
 *
 * Honest by construction: the helper never swallows errors — a failed
 * screenshot fails the test (evidence that cannot be captured is a
 * finding, not a skip).
 */

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_DIR = join(PACKAGE_ROOT, "test-results", "evidence");

/**
 * Capture one decision-point screenshot into test-results/evidence/.
 * `name` is a stable, flow-ordered file name (e.g.
 * "03-mission-detail-ladder.png") — the evidence receipt cites them.
 */
export async function evidenceShot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: join(EVIDENCE_DIR, name),
    fullPage: true,
  });
}

/** The BROWSER_PROFILE workspace store's namespaced localStorage key
 * (CONSOLE-WORKSPACE.md §5 — pinned byte-exact in packages/web). */
export const WORKSPACE_STORE_LOCALSTORAGE_KEY = "payswap.console.workspace.v1";

/** The persisted snapshot shape (the store's own schema — read-only). */
interface WorkspaceSnapshot {
  readonly schemaVersion: number;
  readonly records: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
    readonly intake?: { readonly goalStatement?: string };
  }>;
}

/** Read the persisted workspace store (null when nothing is recorded). */
export async function readWorkspaceStore(page: Page): Promise<WorkspaceSnapshot | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as WorkspaceSnapshot);
  }, WORKSPACE_STORE_LOCALSTORAGE_KEY);
}
