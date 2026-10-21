/**
 * @payswap/journey-verification — shared test support.
 *
 * Honest helpers only: nothing here fabricates state, waits blindly or
 * swallows errors. The console-error tracker is the zero-console-error
 * law's instrument (acceptance flow 1/2): a page that logs errors or
 * throws uncaught exceptions FAILS the journey, including failed
 * resource loads (the static server surfaces genuinely missing assets
 * as 404s, which surface as console errors — nothing is masked).
 */

import { expect, type Page } from "@playwright/test";

/** Everything the zero-console-error law collects for one page session. */
export interface ConsoleRecord {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly failedRequests: readonly string[];
}

/**
 * Attach the collectors BEFORE navigation and read them after. Usage:
 *
 *   const record = trackConsole(page);
 *   await page.goto(...);
 *   ...assertions...
 *   await expectZeroConsoleDefects(record);
 */
export function trackConsole(page: Page): ConsoleRecord {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  return {
    consoleErrors,
    pageErrors,
    failedRequests,
  };
}

/** The zero-console-error law (JOURNEY-MAP.md flow 1: "zero console errors"). */
export async function expectZeroConsoleDefects(record: ConsoleRecord): Promise<void> {
  expect(
    record.consoleErrors,
    "console.error messages (zero-console-error law)",
  ).toEqual([]);
  expect(record.pageErrors, "uncaught page errors (zero-console-error law)").toEqual([]);
  expect(
    record.failedRequests,
    "failed network requests (zero-console-error law — failed asset loads count)",
  ).toEqual([]);
}

/** The visible text of the page (innerText — attributes excluded). */
export async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText ?? "");
}

/**
 * Assert a surface carries NO ZCode product branding in its VISIBLE
 * surfaces (title + body text + image alt/aria-label text). Upstream
 * attribution in legal/about surfaces is EXEMPT by contract
 * (PRODUCT-IDENTITY.md §4) — the exemption is honored by only scanning
 * the surfaces the caller passes; the legal/about exemption is exercised
 * by settings-about.spec.ts, not bypassed here.
 */
export async function expectNoZCodeBranding(
  page: Page,
  scope: { readonly includeTitle: boolean },
): Promise<void> {
  if (scope.includeTitle) {
    await expect.poll(() => page.title()).not.toMatch(/zcode/i);
  }
  const branded = await page.evaluate(() => {
    const texts: string[] = [];
    const body = document.body;
    if (body?.innerText) {
      texts.push(body.innerText);
    }
    for (const image of Array.from(document.querySelectorAll("img[alt], [aria-label]"))) {
      const alt = image.getAttribute("alt");
      const label = image.getAttribute("aria-label");
      if (alt) {
        texts.push(alt);
      }
      if (label) {
        texts.push(label);
      }
    }
    return texts.some((text) => /zcode/i.test(text));
  });
  expect(branded, "no ZCode product branding in normal user surfaces").toBe(false);
}

/** Assert the surface presents the PaySwap product identity. */
export async function expectPaySwapIdentityPresent(
  page: Page,
  scope: { readonly viaTitle: boolean },
): Promise<void> {
  if (scope.viaTitle) {
    await expect.poll(() => page.title()).toContain("PaySwap");
  }
  const text = await visibleText(page);
  expect(text, "the PaySwap wordmark is present on the surface").toContain("PaySwap");
}

/**
 * No horizontal overflow of the document (the responsive law's "no
 * clipped essential content" instrument — a document wider than the
 * viewport means content is clipped off-screen).
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const scrolling = document.scrollingElement ?? document.documentElement;
    return Math.max(0, scrolling.scrollWidth - scrolling.clientWidth);
  });
  expect(overflow, "document horizontal overflow in px (responsive law)").toBe(0);
}
