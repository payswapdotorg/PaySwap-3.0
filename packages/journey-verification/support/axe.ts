/**
 * @payswap/journey-verification — the axe-core configuration (the
 * accessibility flow's instrument).
 *
 * "WCAG 2.2 AA critical rules" is defined EXPLICITLY here (the work
 * order's mandate) so the gate is auditable rather than ambient:
 *
 * - the WCAG 2.0/2.1 A + AA tag sets (axe-core's wcag2a/wcag2aa/
 *   wcag21a/wcag21aa — the critical rules: names/roles/values,
 *   contrast, keyboard, alternatives, landmarks, lists);
 * - plus the WCAG 2.2 AA rules axe-core carries under the wcag22aa tag
 *   (e.g. 2.5.8 Target Size, 3.3.7 Redundant Entry, 3.3.8 Accessible
 *   Authentication) — best effort on the rules axe-core implements.
 *
 * TIER DISCIPLINE FOR KNOWN BASE FINDINGS: the tier-1 scan runs the
 * FULL rule set and then subtracts ONLY the entries pinned in
 * KNOWN_BASE_FINDINGS below — each one a REAL defect observed in the
 * base surface, recorded here (never hidden), owned by its lane, and
 * drift-checked in BOTH directions: if the defect disappears, the test
 * fails telling you to remove the entry; if a new violation appears,
 * the test fails with it listed. The @contract scan applies NO
 * subtractions — full strictness gates at integration.
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { AxeResults, Result } from "axe-core";

/** The explicit critical-rule tag set (see module doc). */
export const AXE_CRITICAL_TAGS: readonly string[] = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

/** One REAL defect in the base surface, pinned (rule + route). */
export interface KnownBaseFinding {
  readonly rule: string;
  readonly route: string;
  readonly finding: string;
  readonly owner: string;
}

/**
 * The pinned base findings (observed at the P9-C lane base e6ed008 by
 * the tier-1 battery itself). Empty when the tree is clean.
 */
export const KNOWN_BASE_FINDINGS: readonly KnownBaseFinding[] = [
  {
    rule: "list",
    route: "/payswap/app",
    finding:
      "the app-entry eleven-area grid renders Card <div>s directly inside <ul class='ps-page-grid'> without <li> wrappers (packages/web/src/payswap/pages/AppEntryPage.tsx) — axe 'list', impact serious",
    owner: "Lane P9-A (the route/surface rewrite) / TL",
  },
];

/** A configured axe builder for one page (full critical rule set). */
export function axeScan(page: Page): AxeBuilder {
  return new AxeBuilder({ page }).withTags([...AXE_CRITICAL_TAGS]);
}

export interface ScanOutcome {
  /** Violations that are NOT pinned base findings (must be empty). */
  readonly newViolations: readonly Result[];
  /** The pinned findings actually observed (must match the pin exactly). */
  readonly observedKnown: readonly KnownBaseFinding[];
  /** Pinned findings that did NOT reproduce (drift: the pin is stale). */
  readonly stalePins: readonly KnownBaseFinding[];
}

/**
 * Analyze one route with the full rule set, subtract the pinned base
 * findings, and drift-check the pins in both directions.
 */
export async function analyzeWithKnownFindings(
  page: Page,
  route: string,
): Promise<ScanOutcome> {
  const results: AxeResults = await axeScan(page).analyze();
  const pinsForRoute = KNOWN_BASE_FINDINGS.filter((pin) => pin.route === route);
  const observedKnown: KnownBaseFinding[] = [];
  const newViolations: Result[] = [];
  for (const violation of results.violations) {
    const pin = pinsForRoute.find((candidate) => candidate.rule === violation.id);
    if (pin) {
      observedKnown.push(pin);
    } else {
      newViolations.push(violation);
    }
  }
  const observedRules = new Set(observedKnown.map((pin) => pin.rule));
  const stalePins = pinsForRoute.filter((pin) => !observedRules.has(pin.rule));
  return { newViolations, observedKnown, stalePins };
}
