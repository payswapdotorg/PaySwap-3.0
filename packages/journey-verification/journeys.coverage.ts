/**
 * @payswap/journey-verification — the spec ↔ journey COVERAGE REGISTRY.
 *
 * The no-orphans law, both directions (the operations package's pattern,
 * applied to the journey map): every journey J1–J19 must be covered by at
 * least one test in the suite, and every test must declare the journey
 * id(s) it covers. This registry is the file-level half; the test-level
 * half is the `[Jn]` title convention (every `test(...)` title carries at
 * least one `[Jn]` token), enforced together by specs/manifest.spec.ts:
 *
 *   1. every spec file on disk is registered here (no orphan test files);
 *   2. every registered spec file exists on disk;
 *   3. every journey id used here exists in the manifest (no invented ids);
 *   4. every manifest journey is covered by at least one spec (no orphan
 *      journeys);
 *   5. every test title in every spec carries `[Jn]` tokens, all of them
 *      valid and all of them declared for that file;
 *   6. every journey declared for a file appears in at least one test
 *      title in that file (a declared-but-untested journey is an orphan);
 *   7. tier-1 journeys have at least one NON-@contract covering test;
 *      tier-2-only journeys (J14, J15) have at least one @contract test.
 *
 * The manifest cross-check spec itself is registered as kind
 * "enforcement": it enforces the law rather than covering a journey, and
 * it is the single documented exemption from the title convention.
 */

import type { JourneyId } from "./journeys.manifest.js";

/** What a registered spec file is for. */
export type SpecKind = "journey" | "enforcement";

export interface SpecCoverage {
  /** Basename of the spec file inside specs/. */
  readonly spec: string;
  /** Journey ids the tests in this file cover (empty for enforcement). */
  readonly journeys: readonly JourneyId[];
  readonly kind: SpecKind;
}

export const SPEC_COVERAGE: readonly SpecCoverage[] = [
  {
    spec: "first-launch.spec.ts",
    journeys: ["J1"],
    kind: "journey",
  },
  {
    spec: "navigation.spec.ts",
    journeys: ["J1", "J2", "J8", "J10", "J12", "J14"],
    kind: "journey",
  },
  {
    spec: "journey-entry.spec.ts",
    journeys: ["J1", "J2", "J7", "J9", "J11"],
    kind: "journey",
  },
  {
    spec: "setup-required.spec.ts",
    journeys: ["J2", "J3", "J4", "J5", "J6"],
    kind: "journey",
  },
  {
    spec: "error-unknown.spec.ts",
    journeys: ["J7", "J10"],
    kind: "journey",
  },
  {
    spec: "settings-about.spec.ts",
    journeys: ["J13"],
    kind: "journey",
  },
  {
    spec: "branding.spec.ts",
    journeys: ["J1", "J2", "J8", "J13"],
    kind: "journey",
  },
  {
    spec: "legacy-redirect.spec.ts",
    journeys: ["J15"],
    kind: "journey",
  },
  {
    spec: "responsive.spec.ts",
    journeys: ["J1", "J2", "J8"],
    kind: "journey",
  },
  {
    spec: "accessibility.spec.ts",
    journeys: ["J1", "J2", "J8", "J10", "J12"],
    kind: "journey",
  },
  {
    spec: "console-workspace.spec.ts",
    journeys: ["J14"],
    kind: "journey",
  },
  {
    spec: "console-mission-lifecycle.spec.ts",
    journeys: ["J14"],
    kind: "journey",
  },
  {
    spec: "console-honest-empties.spec.ts",
    journeys: ["J14"],
    kind: "journey",
  },
  {
    spec: "console-advanced.spec.ts",
    journeys: ["J14"],
    kind: "journey",
  },
  {
    spec: "console-a11y-responsive.spec.ts",
    journeys: ["J14"],
    kind: "journey",
  },
  {
    spec: "payments-discovery.spec.ts",
    journeys: ["J16"],
    kind: "journey",
  },
  {
    spec: "onchain-discovery.spec.ts",
    journeys: ["J17"],
    kind: "journey",
  },
  {
    spec: "psp-connection.spec.ts",
    journeys: ["J18"],
    kind: "journey",
  },
  {
    spec: "advanced-workspace-access.spec.ts",
    journeys: ["J19"],
    kind: "journey",
  },
  {
    spec: "manifest.spec.ts",
    journeys: [],
    kind: "enforcement",
  },
] as const;
