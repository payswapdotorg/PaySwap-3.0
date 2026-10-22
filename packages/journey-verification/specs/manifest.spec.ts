/**
 * @payswap/journey-verification — the NO-ORPHANS CROSS-CHECK (the work
 * order's law, both directions, following the operations package's
 * pattern):
 *
 *   an orphan journey FAILS the suite; a test without a journey row
 *   FAILS too.
 *
 * Seven enforced laws (see journeys.coverage.ts for the registry):
 *   1. every spec file on disk is registered (no orphan test files);
 *   2. every registered spec file exists;
 *   3. every journey id used anywhere exists in the manifest;
 *   4. every manifest journey is covered by at least one spec;
 *   5. every test title carries `[Jn]` tokens, all valid, all declared
 *      for that file;
 *   6. every journey declared for a file appears in at least one test
 *      title in that file (a declared-but-untested journey is an
 *      orphan);
 *   7. tier-1 journeys have at least one NON-@contract covering test;
 *      tier-2-only journeys (J14, J15 + the P12 set J16-J19) have at
 *      least one @contract test.
 *
 * This spec is the single documented exemption from the title
 * convention: it enforces the law, it does not cover a journey
 * (registered as kind "enforcement").
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  isJourneyId,
  JOURNEYS,
  JOURNEY_IDS,
  journeyTier,
  type JourneyId,
} from "../journeys.manifest.js";
import { SPEC_COVERAGE, type SpecCoverage } from "../journeys.coverage.js";

const SPECS_DIR = dirname(fileURLToPath(import.meta.url));

interface ParsedTest {
  readonly spec: string;
  readonly title: string;
  readonly journeys: readonly JourneyId[];
  readonly isContract: boolean;
}

/** Extract `[Jn]` tokens from a test title. */
function journeyTokens(title: string): JourneyId[] {
  const tokens: JourneyId[] = [];
  for (const match of title.matchAll(/\[J(\d+)\]/g)) {
    tokens.push(`J${match[1]}` as JourneyId);
  }
  return tokens;
}

/** Parse one spec file's test titles (static string literals only — the
 * suite's authoring convention; a dynamic title cannot be audited). */
function parseSpecTests(spec: string): ParsedTest[] {
  const source = readFileSync(join(SPECS_DIR, spec), "utf8");
  const tests: ParsedTest[] = [];
  for (const match of source.matchAll(/\btest\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
    const title = (match[2] ?? "").replaceAll("\\'", "'").replaceAll('\\"', '"');
    tests.push({
      spec,
      title,
      journeys: journeyTokens(title),
      isContract: title.includes("@contract"),
    });
  }
  return tests;
}

test("no-orphans law: the manifest, the registry and the spec files agree in both directions", async ({ page }) => {
  expect(page).toBeDefined();

  // The map itself is the canonical J1–J19 (19 unique, ordered — the
  // P12 Lane C wave added J16-J19, JOURNEY-MAP.md §5).
  expect(JOURNEY_IDS).toEqual(
    Array.from({ length: 19 }, (_, index) => `J${index + 1}` as JourneyId),
  );
  expect(new Set(JOURNEY_IDS).size).toBe(19);

  const onDisk = readdirSync(SPECS_DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .sort();
  const registered = SPEC_COVERAGE.map((entry) => entry.spec).sort();

  // Law 1: every spec file on disk is registered (no orphan test files).
  expect(onDisk, "spec files on disk vs registered specs").toEqual(registered);

  // Law 2: every registered spec file exists (no phantom registrations).
  for (const entry of SPEC_COVERAGE) {
    expect(onDisk, `registered spec ${entry.spec} must exist`).toContain(entry.spec);
  }

  // Law 3: every journey id used anywhere exists in the manifest.
  for (const entry of SPEC_COVERAGE) {
    for (const id of entry.journeys) {
      expect(
        isJourneyId(id),
        `${entry.spec} references ${id} which is not a manifest row`,
      ).toBe(true);
    }
  }

  // Law 4: every manifest journey is covered by at least one spec.
  const covered = new Set(SPEC_COVERAGE.flatMap((entry) => entry.journeys));
  for (const row of JOURNEYS) {
    expect(
      covered.has(row.id),
      `journey ${row.id} (${row.title}) has no covering spec — an orphan journey fails the suite`,
    ).toBe(true);
  }

  // Laws 5 + 6: test-level agreement (titles carry tokens; declared
  // journeys are actually tested).
  const parsedBySpec = new Map<string, ParsedTest[]>(
    SPEC_COVERAGE.map((entry) => [entry.spec, parseSpecTests(entry.spec)]),
  );
  for (const entry of SPEC_COVERAGE) {
    const parsed = parsedBySpec.get(entry.spec) ?? [];
    expect(
      parsed.length,
      `${entry.spec} contains no auditable test( calls`,
    ).toBeGreaterThan(0);

    if (entry.kind === "enforcement") {
      // The single documented exemption (this file).
      continue;
    }

    const tested = new Set<string>();
    for (const parsedTest of parsed) {
      expect(
        parsedTest.journeys.length,
        `${entry.spec}: test "${parsedTest.title}" carries no [Jn] journey token — a test without a journey row fails the suite`,
      ).toBeGreaterThan(0);
      for (const id of parsedTest.journeys) {
        expect(
          isJourneyId(id),
          `${entry.spec}: test "${parsedTest.title}" references unknown journey ${id}`,
        ).toBe(true);
        expect(
          entry.journeys.includes(id),
          `${entry.spec}: test "${parsedTest.title}" covers ${id} which is not declared for this file in journeys.coverage.ts`,
        ).toBe(true);
        tested.add(id);
      }
    }
    for (const id of entry.journeys) {
      expect(
        tested.has(id),
        `${entry.spec}: journey ${id} is declared but never tested in this file — an untested declaration is an orphan`,
      ).toBe(true);
    }
  }

  // Law 7: tier discipline. Tier-1 journeys have at least one
  // non-@contract covering test; tier-2-only journeys have at least one
  // @contract test.
  const nonContractCoverage = new Set<string>();
  const contractCoverage = new Set<string>();
  for (const entry of SPEC_COVERAGE) {
    for (const parsedTest of parsedBySpec.get(entry.spec) ?? []) {
      for (const id of parsedTest.journeys) {
        if (parsedTest.isContract) {
          contractCoverage.add(id);
        } else {
          nonContractCoverage.add(id);
        }
      }
    }
  }
  for (const row of JOURNEYS) {
    if (journeyTier(row.id) === 1) {
      expect(
        nonContractCoverage.has(row.id),
        `journey ${row.id} (tier 1) has no base-green (non-@contract) covering test`,
      ).toBe(true);
    }
  }
  const tier2Only = JOURNEYS.filter((row) => journeyTier(row.id) === 2);
  expect(tier2Only.map((row) => row.id)).toEqual(["J14", "J15", "J16", "J17", "J18", "J19"]);
  for (const row of tier2Only) {
    expect(
      contractCoverage.has(row.id),
      `journey ${row.id} (tier 2, contract-only) has no @contract covering test`,
    ).toBe(true);
  }
});
