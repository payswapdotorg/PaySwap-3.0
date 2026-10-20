# P8-W2 VERIFICATION RECORD — @payswap/client-certification

- **Work order**: P8-W2 (security/client certification lane; roadmap
  authority `spec/dependency/work-orders.md` P8-W2)
- **Lane**: `work/p8-w2`, base `main` @ `f9392a3` (verified
  `git log --oneline -1` before any work)
- **Date**: 2026-10-20
- **Write surface (strict)**: `packages/client-certification/**`,
  `spec/client-certification/**`,
  `docs/client-certification-evidence/**` — nothing else touched (git
  verified per commit; no root files, no pushes).

## 1. Claims → machine-pinned test sites

| # | Claim (hard law) | Test site (file → class/test) |
|---|---|---|
| 1 | Secret boundary: 4-probe scan BLOCKs secret material; scrubber contract (totality, redaction, markers) | `test/secret-boundary.test.ts` — 8 tests: detectors, forbidden-key law, clean pass, any-probe BLOCK, reference-scrubber redaction, non-conforming scrubber, throwing scrubber, determinism |
| 2 | Dead-action audit: action → contract → effect lineage; dead + fake-success actions FAIL | `test/dead-action.test.ts` — 7 tests: live lineage table, dead action, contract-without-effect, unknown refs, fake success, closed vocabulary, single-action resolution + determinism |
| 3 | Truthful states: {known-success, known-failure, UNKNOWN-with-reason}; no synthetic success / hidden mock path; tone law | `test/state-honesty.test.ts` — 8 tests: closed vocabulary, tone law, honest pass, synthetic success, hidden mock path, bare UNKNOWN/failure, UNKNOWN-styled-as-failure, determinism |
| 4 | Recipient changes invalidate prior authorization (fresh eligibility + fresh quote conditions; never silently carried) | `test/recipient-authorization.test.ts` — law-4 class, 5 tests: INVALIDATED disposition, NO_CHANGE, stale-authorization-carried, reverification-not-fresh, honest pass + determinism |
| 5 | Fresh eligibility/quote conditions carried with the display | `test/recipient-authorization.test.ts` — law-5 class, 6 tests: honest pass, old-recipient eligibility, pre-change observation, old-recipient quote, expired quote, no-change scoping |
| 6 | Sandbox/live separation: pinned per state, never ambient; never presents-as-live; live creds never in test paths | `test/sandbox-live.test.ts` — 6 tests: separated pass, presenting-as-live, live-finality, live-credential-in-test-path, ambient dependency, unbound/non-vault custody |
| 7 | Accessibility contract: name/role/value lineage, announcements, keyboard paths, contrast constants | `test/accessibility.test.ts` — 6 tests: constants, pass + determinism, missing name/role/lineage, keyboard path, announcement, contrast per class |
| 8 | Responsive/device contract: breakpoint + 44px constants, all three device classes resolved | `test/responsive-device.test.ts` — 6 tests: constants, band edges, pass + determinism, touch target at any class, all-classes resolution, non-interactive carry |
| 9 | Browser/device verification: six checks, area map, viewport matrix, console-error law, protocol correlation, INV-E04 ceiling, real wiring | `test/browser-verification.test.ts` — 8 tests: pinned checks + prior art, honest Gate-D-form pass + determinism, missing check, area map, viewport matrix, console law, protocol correlation, screenshot ceiling + wiring |
| 10 | Gate wall: HALT cannot be waived/downgraded; remediation requires a NEW run; tamper receipt | `test/gate-wall.test.ts` — 9 tests: composed PASS (9 gates), ten-law registry, single-violation HALT, severity/digest uniformity, waiver refused, downgrade refused, tamper receipt, fail-closed remediation, accepted remediation still requires new run |
| — | Pins are value-consistent with the authorities read at f9392a3 | `test/pins.test.ts` — 8 tests (all six authorities + closed-vocabulary discipline) |
| — | House boundary: relative-only imports, no `@payswap/*`, no UI machinery in src, determinism, manifest, tsconfig/node.d.ts, ≤400-line file law, census receipts, secret-free + fragments laws | `test/boundary.test.ts` — 10 tests |

**Total: 11 files / 87 tests, ALL PASS.**

## 2. Oracle accounting (assigned slice, 7 files)

Oracle: `/home/z/oldrepo-oracle` @ `8a735bf` (READ-ONLY — evidence,
not authority; PORT never authorizes copying).

| Oracle file (old repo) | Lines | Disposition | Where it lives now |
|---|---|---|---|
| `packages/certification/src/security-gates.ts` | 438 | REWRITTEN | `src/gate-wall.ts` — the halt-is-terminal / remediation-is-the-only-path law re-authored for client gates; the immune-system structural views NOT ported (the rebuilt `packages/adversarial` owns that machinery; this package pins its vocabulary) |
| `packages/certification/src/production/audit.ts` | 284 | ADAPTED | `src/dead-action.ts` (marker/evidence fold → action→contract→effect lineage) + `src/state-honesty.ts` (no-simulated-success → synthetic-success/hidden-mock-path codes); the workspace package scan + `@payswap/*` journey imports dropped (zero-sibling law) |
| `packages/certification/test/boundary.test.ts` | 230 | ADAPTED | `test/boundary.test.ts` — via the canonical `packages/opportunities` house pattern (strictly zero-sibling); the old workspace-dependency allowlist law retired |
| `packages/certification/test/security-gates.test.ts` | 326 | REWRITTEN | `test/gate-wall.test.ts` — halt/waiver/remediation behavior on the client-gate model; the drive-the-REAL-immune-objects class is now owned by `packages/adversarial`'s own battery |
| `packages/journeys/src/journeys/customer-action.ts` | 339 | ADAPTED | `src/state-honesty.ts` + `src/recipient-authorization.ts` — the honest customer-action law (challenge preserved verbatim; completion only on external evidence; authorization bound to what was approved) encoded as structural contracts; the journey run machinery not rebuilt (no journeys package exists in the canonical architecture) |
| `packages/journeys/src/harness.ts` | 1188 | ADAPTED | `src/verdict.ts` + `test/fixtures.ts` — the harness discipline carried (static clock → explicit ISO instants; axis assertions → gate results + violation vocabulary; invariant proofs → law-tagged codes); the economic world/settlement machinery intentionally not rebuilt (owned by the canonical economic/settlement planes) |
| `packages/operations/src/browser-verification.ts` | 1489 | REWRITTEN | `src/browser-verification.ts` — six checks, key interactions, protocol correlation, screenshot-strength ceiling and UNKNOWN-handling law re-authored; the 18 old-journey contract catalog dropped (PaySwap 3.0 areas/actions differ — the area-map law re-based on the pinned eleven-area surface vocabulary); secret-exclusion artifact checks folded into the secret-boundary gate |

**Arithmetic: 7 = 4 ADAPTED + 3 REWRITTEN + 0 PORTED + 0 NET-NEW-in-slice
+ 0 SUPERSEDED-BY-SIBLING.** (The slice's net-new surface — pins,
digest, accessibility, responsive, sandbox/live as standalone modules —
is NET-NEW package content, not oracle accounting.)

## 3. Battery receipts (final, at commit 4/4 tree)

```
cd /home/z/lanes/p8-w2/packages/client-certification
npm install --no-workspaces --no-audit --no-fund   # exit 0
npx tsc --noEmit                                   # exit 0
npx vitest run                                     # 11 files / 87 tests ALL PASS
```

- `tsc --noEmit`: **exit 0** (strict, exactOptionalPropertyTypes,
  noUncheckedIndexedAccess, verbatimModuleSyntax — the house base).
- `vitest run`: **11f / 87t ALL PASS** (0 skipped, 0 failed).
- Census (machine-checked by `test/boundary.test.ts`): **src 19 files /
  2,956 lines; test 13 files / 2,387 lines; max file 315 lines**
  (≤400 law). Src volume 2,956 lines is within the ~1,200–3,000
  envelope (near the top because every one of the ten laws carries its
  own gate module + the six pin files).
- Manifest: zero runtime dependencies; devDependencies exactly
  `typescript ^6.0.3` + `vitest ^3.2.7`; exports `./src/index.ts`.
- Secret-free proof: the boundary guard scans all 32 package files
  against the secret-shape patterns (clean) AND proves the fragments
  law (no full hex-key or mnemonic literal anywhere).

## 4. Commit protocol receipt

Four linear commits on `work/p8-w2` (no merges), messages
`cert(P8-W2) 1/4 … 4/4`. Battery re-run green after every commit.

## 5. Explicit limitations (honest-UNKNOWN law)

- **The live browser run remains an operational step.** This package is
  the deterministic CONTRACT a recorded run must satisfy (the Gate D
  form made repeatable) — it does not drive a browser, take
  screenshots, or observe consoles. A passing certification certifies
  the RECORDED observation, not the live world.
- **Accessibility and responsive contracts are contract-level constants
  verified structurally** — name/role/value lineage, keyboard paths,
  contrast ratios and touch targets are checked as DECLARED by the
  surface registry, not measured against a rendering engine. Real
  rendering measurement (axe, computed styles, actual pixels) is an
  experience-layer/operational concern downstream of this gate.
- **Pins are value pins, not imports.** They were read and asserted
  against the sibling sources at base `f9392a3`; integration-time drift
  is caught by re-running `test/pins.test.ts` against the merged tree
  (the assertions encode the published law values).
- **The secret boundary scans structure, not intent.** Detection is
  exact-shape (the onchain-security law): a raw 32-byte key, a 12/24
  word mnemonic, a PEM block, a prefixed provider token. Secret
  material embedded in prose strings without a detectable shape is out
  of this gate's scope (and belongs to log-hygiene review).
- **The dead-action audit certifies declared registries.** It
  guarantees every declared action resolves to a declared, evidenced,
  non-simulated effect — it cannot discover actions a surface failed to
  declare; declaration completeness is owned by the surface package's
  own tests (e.g. the web render assertions).
- **No waiver path exists by design.** `requestGateWaiver` /
  `requestGateDowngrade` always refuse — an operator who wants a
  release must remediate and re-run, per the escalate-only law.
