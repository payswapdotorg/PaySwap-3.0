/**
 * @payswap/journey-verification — the spec ↔ journey COVERAGE REGISTRY.
 *
 * The no-orphans law, both directions (the operations package's pattern,
 * applied to the journey map): every journey J1–J24 must be covered by at
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
  // (P21-D reconciliation) The P15-strip retirement: the nineteen
  // product-surface spec files retired with their journeys (J1–J19 +
  // the surface-specific halves of J21/J22 — the pre-strip marketing/app
  // shell no longer exists in the web build; the laws live on at the
  // desktop product tier; see JOURNEY-MAP.md §5 and the manifest's
  // retirement fields). The web tier's living suite: the composer laws
  // (J20–J23, re-scoped to the substrate shell) + the task-tier
  // journey (J24) + this enforcement spec.
  {
    spec: "agent-composer-surfaces.spec.ts",
    journeys: ["J20"],
    kind: "journey",
  },
  {
    spec: "agent-composer-convergence.spec.ts",
    journeys: ["J21", "J22", "J23"],
    kind: "journey",
  },
  {
    spec: "agent-task-tier-journey.spec.ts",
    journeys: ["J24"],
    kind: "journey",
  },
  {
    spec: "manifest.spec.ts",
    journeys: [],
    kind: "enforcement",
  },
] as const;
