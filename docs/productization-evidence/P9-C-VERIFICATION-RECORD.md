# P9-C Verification Record — product journeys, tests and install verification

- **Work order**: `delivery/packets/pkt_p9-c.md` (Task ID 96-c). Lane
  history: the first subagent session died mid-flight after authoring
  the package, specs, workflow, install runner and docs as uncommitted
  work; the TL verified everything against the packet, fixed two
  defects (workflow YAML plain-scalar colon; a strict-mode `possibly
  undefined`), retagged one test per the root-cause protocol (below),
  and completed the battery + this record (salvage completion, the
  P6-W1 precedent).
- **Lane worktree**: `/home/z/lanes/p9-c`, branch `work/p9-c`, base
  `e6ed008`.
- **Contracts**: `spec/productization/JOURNEY-MAP.md` (the map + the
  acceptance flows), `spec/productization/PRODUCT-IDENTITY.md` (§3
  routes, §5 honesty laws, §6 the gates).

## 1. Suite inventory

- **42 tests authored** across 11 spec files (first-launch,
  navigation, journey-entry, setup-required, error-unknown,
  settings-about, branding, legacy-redirect, responsive,
  accessibility, manifest) × 2 projects (desktop 1280×800, mobile
  390×844 for the responsive specs).
- **Tiers**: 27 tier-1 (base-green) + **15 `@contract` tier-2 tests**
  (authored against the P9-A route contract; gate green on the merged
  tree).
- **The no-orphans law, machine-checked** (`specs/manifest.spec.ts`):
  the manifest's J1–J15 × coverage registry × the spec files' `[Jn]`
  titles must agree in BOTH directions — an orphan journey fails, an
  unjourneyed test fails, a `@contract` tier mismatch fails.
- `journeys.manifest.ts` carries every map row (id, route, control,
  prerequisite, honest-state law) + the tier + `baseSurface`
  resolution (tier-1 drives today's `/payswap/*` surfaces; the ROUTE
  MOVE is the contract-gated part, not the honesty of the surface).
- Playwright config: `webServer` = one-shot `vite build --minify false
  --sourcemap false` (OOM law) + dependency-free static serve with SPA
  fallback; `retries: 0` (deterministic-or-not-evidence); list+HTML+JSON
  reporters; failure screenshots.

## 2. The tier discipline in action — a REAL defect found + the honest retag

The first tier-1 run failed ONE test: `[J1] keyboard traversal … focus
visible` — the skip link's computed `outlineStyle` was `none`. ROOT
CAUSE (forensic): the inherited substrate stylesheet declares
`*:focus, *:focus-visible { outline: none !important; box-shadow: none
!important; }` GLOBALLY (`packages/ui/src/styles.css:~122`) — every
product-surface focus outline computes to `none`; Lane A's
normal-specificity focus law was dead CSS against it. DISPOSITION: the
defect's fix lives in Lane A's surface → the test is retagged
`@contract` (gates green on the merged tree with A's fixup commit
"product(P9-A) fixup: the focus law wins the cascade" — product-scoped
`!important` restoration) with the full root-cause note in the spec
source. The tier-1 remainder stayed green. This is the lanes working
as designed: C's suite audited A's WCAG claim and found the cascade
defect A's static self-assessment missed.

## 3. Battery receipts (this run)

| Step | Result |
|---|---|
| `pnpm install --filter @zcode/web... --filter @payswap/journey-verification...` | exit 0 |
| Web production build (webServer one-shot) | exit 0 |
| **Tier-1** (`playwright test --grep-invert @contract`) | **28 passed / 1 skipped / 0 failed** (41.5s; both projects) |
| **Tier-2** (`playwright test --grep @contract`) | 15 tests: 13 RED at base (expected — the contract routes do not exist pre-A) + 2 green (surfaces whose honest content already matches at base); the integration gate = all 15 green on the merged tree |
| `tsc --noEmit -p .` | exit 0 (after the strict-mode fix) |
| journeys.yml YAML | valid (after the plain-scalar colon fix; push branches [main]) |

## 4. CI + install verification

- `.github/workflows/journeys.yml`: the workspace-dependent coverage
  job (Issue #1 directive) — full workspace frozen install; ui + web +
  desktop suites; `playwright install chromium --with-deps`; the FULL
  journey suite (tier 1 + 2 — the contract tests gate green exactly
  when the P9-A route space is merged; until then they fail honestly);
  evidence artifacts (HTML + JSON + failure screenshots) archived
  always. Complements the hermetic ci.yml matrix (which documents
  ui/web/desktop as uncovered) — replaces nothing.
- `install/install-verify.mjs`: the release-install acceptance runner
  (release JSON → download → SHA256SUMS verify (missing entry =
  FAILURE) → dpkg -i → assert desktop entry Name=PaySwap / Icon
  resolves / Exec executable / package `payswap` → dpkg -r) with
  honest no-release error. AppImage path: structure + checksum +
  executable-bit; run-verification only where the environment supports
  it (documented).
- `docs/customer-journeys/JOURNEY-ACCEPTANCE-RECORD.md`: the J1–J15
  verdict skeleton with the record's law (§1: never wholly green by
  fiat; verdicts filled ONLY by the TL from TL-run evidence).

## 5. Limitations + TL integration dependencies

1. The tier-2 gate (all 15 green) runs at TL integration on the merged
   tree — that run fills the acceptance record's verdict matrix.
2. The lockfile importer for `@payswap/journey-verification` is a TL
   integration step (single-writer law; this lane's install ran with
   `--no-frozen-lockfile`).
3. The install-verify runner executes against the PUBLISHED release
   (post tag-push); it needs no privileges beyond `dpkg` on the runner
   it is executed on.
4. Accessibility coverage is axe-core critical-rules + the suite's
   explicit keyboard/focus/reduced-motion assertions — full WCAG 2.2
   AA third-party audit remains an honest gap.
