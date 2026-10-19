# @payswap/lab — Baseline Verification Record (P6-W1, lane R4-W1)

Recovery lane R4-W1. Branch `work/r4-w1`;
base `25a8fbb247665aefb2bc76786da0006060ab4352` (= origin/main at
dispatch). Porting source (evidence, not authority): payswap.org @
`8a735bf1639198c43115087a2992555166a9acf9` — packages/lab
(10 src files / 4,433 lines; 109 titled test sites, mechanically
recounted: simulation 21, search 18, promotion 13, replay 11,
director 11, candidates 10, evaluator 9, scenarios 7, smoke 3,
type-contracts 1, boundary 5 — matches the work-order census).

---

## 1. Commits (the 4-commit protocol)

| # | Subject | SHA |
|---|--------|-----|
| 1/4 | pinned wire shapes (every external seam as local structural pins) | `b6f37bd` (salvage bundle verified) |
| 2/4 | the full @payswap/lab implementation | `e3461b8` |
| 3/4 | the ported test corpus (16f/147t) | `60778a8` |
| 4/4 | spec + evidence (this commit — TL-authored, see §7) | (see `git log -1`) |

## 2. Battery receipts (hermetic, recorded at 4/4)

| Command | Result |
|---------|--------|
| `cd packages/lab && rm -rf node_modules package-lock.json` | clean slate |
| `npm install --no-workspaces` | **exit 0** |
| `npx tsc --noEmit` | **0 diagnostics** |
| `npx vitest run` | **16 test files / 147 tests, ALL PASS** — 8.2s, fully offline, deterministic |
| `node --experimental-strip-types -e "import('./src/index.ts')…"` | **101 exports** (67 functions + 34 consts) |
| structural greps | **0** sibling/`@payswap/` imports in src; **0** `node:` imports in src |
| devDependencies | exactly `typescript` + `vitest` (verified in package.json) |

## 3. Census (both trees)

| Tree | Files | Lines | Max file |
|------|-------|-------|----------|
| `src/` (incl. `src/pins/` 6) | **28** | **6,250** | 379 (`domain-packs.ts`) |
| `test/` (16 test + 4 fixture/decl) | **20** | **4,384** | 397 (`simulation.test.ts`) |
| exports (barrel) | **101** | error classes | **10** |

All inside the two-build envelope (src 28 / 6,250; test 20 / 4,384;
exports 101; error classes 10; max file 397 ≤ 400).

## 4. Classification arithmetic — the full old-site account

Definitions (auditable split):
- **PORTED** — an old lab-corpus site's law kept with
  near-identical assertions (mechanical renames only).
- **ADAPTED** — an old-corpus law re-based onto the new surface
  (pins, renamed wire fields: `executionMode`→`execution`,
  SERVICE_ACCESS→DECLARED_CAPABILITY).
- **REWRITTEN** — the old boundary-suite intent rebuilt on the
  STRICTER zero-sibling law.
- **NET-NEW** — a law with no old-corpus ancestor (pins coverage,
  INV-L01..L03 package-invariant sites, vocabulary 2.0 sites).

### 4.1 The old-site account closes on 109 (zero silently dropped)

109 old sites = **99 primary carried** (PORTED 99)
+ **5 ADAPTED** (the renamed-wire sites)
+ **2 REWRITTEN** (boundary zero-sibling sites)
+ **3 folded-duplicate** (old corpus cross-file twins counted once)
+ **0 dropped-with-reason**.

### 4.2 New-test totals

99 P + 5 A + 2 R + **41 NET-NEW** = **147 titled runtime tests**
across 16 vitest files. Per-file allocation (verified by station
count): simulation 26, search 21, promotion 15, director 13,
replay 11, evaluator 8, candidates 8, domain-packs 7, boundary 7,
pins 6, baseline-candidates 6, robustness 5, scenarios 4,
counterfactual 4, type-contracts 3, smoke 3 — sums to 147 exactly.
(Plan-vs-final rebalance: evaluator 9→8, baseline-candidates 4→6,
robustness 4→5, scenarios 6→4 — file totals and the 147 sum held.)

## 5. Structural-law compliance

- Zero runtime dependencies (package.json `dependencies` absent).
- devDependencies exactly `typescript` + `vitest`.
- Zero sibling imports in src (grep-verified; boundary tests
  enforce); zero `node:` imports in src.
- `test/node.d.ts` declares `process` as a FUNCTION global exactly
  once (the accepted convention).
- Deterministic hermetic tests only; no network, no ambient
  clock/randomness (injected instants + seeded PRNG).
- Every file ≤ 400 lines (max observed 397).

## 6. Battery reproduction (any machine)

```
git clone https://github.com/payswapdotorg/PaySwap-3.0
cd PaySwap-3.0/packages/lab
npm install --no-workspaces && npx tsc --noEmit && npx vitest run
```

## 7. Delivery note — the salvage acceptance (honest record)

The worker lane's chat was platform-recycled AFTER commit 3/4
(station watch logged tab/chat GONE 2026-10-19 18:47Z; no worker
fault — the delivery law worked exactly as designed: the per-commit
git bundle + MANIFEST.sha256 salvage captured commits 1–3
completely). The TL harvested the bundle, verified it against base
`25a8fbb` (clean fetch, 51 files / 10,674 insertions), and re-ran
the full hermetic battery station-side from the bundle (§2 receipts
are the TL's own run, not the worker's self-report). Commit 4/4
(this spec + evidence record) was authored by the TL from those
receipts and the worker's salvaged worklog (corpus recount,
allocation plan, classification arithmetic). Lane deviation
recorded: the worker's app-root `worklog.md` mirror was last synced
at the analysis stage (Task 0) — the commit-level worklog sections
lived only in-chat and were lost with the recycled chat; the git
bundle remained the delivery authority throughout (LAW-2 held where
it matters). No COMPLETION-REPORT.md was produced by the worker;
this record is the completion evidence.
