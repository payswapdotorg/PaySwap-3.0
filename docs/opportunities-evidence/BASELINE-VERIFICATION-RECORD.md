# @payswap/opportunities — Baseline Verification Record (P6-W2, lane r4-w2)

Rebuild lane r4-w2. Branch `work/r4-w2`; base `0755624`
(= origin/main at dispatch, P7-E2E accepted). Porting source (evidence,
not authority): payswap.org @ `8a735bf1639198c43115087a2992555166a9acf9`
— packages/onchain-opportunities (P4-W3-002): src 8 files / 2,152 lines;
tests 10 files / 122 titled sites, mechanically recounted: model 20,
eligibility 19, discovery 17, agent-cannot-execute 17, lab-composition
13, vocabulary 9, observation 9, boundary 8, secret-free 5, smoke 5 —
sums to 122 exactly (matches the work-order census).

Prior build (lost to a platform reset; numbers = envelope check only):
src 20f/3,150l; test 19f/3,953l; 12 test files / 181 tests; 85 exports.

---

## 1. Commits (the 4-commit protocol)

| # | Subject | SHA |
|---|--------|-----|
| 1/4 | pinned wire shapes (every external seam as local structural pins) | `acffae1` |
| 2/4 | the full @payswap/opportunities implementation | `3d6d71a` |
| 3/4 | the ported test corpus (12f/181t) | `a247a3b` |
| 4/4 | spec + evidence (this commit) | (see `git log -1`) |

## 2. Battery receipts (hermetic, recorded at 4/4)

| Command | Result |
|---------|--------|
| `cd packages/opportunities && rm -rf node_modules package-lock.json` | clean slate |
| `npm install --no-workspaces` | **exit 0** |
| `npx tsc --noEmit` | **0 diagnostics** |
| `npx vitest run` | **12 test files / 181 tests, ALL PASS** — ~2.8s, fully offline, deterministic |
| plain-Node runtime import (`import('./src/index.ts')`) | **green — 113 exports** (76 functions + 37 consts) |
| census greps | **0** non-relative imports in src; **0** `@payswap/` imports in src AND test; **0** `node:` imports in src; **0** vendor/venue vocabulary in src |
| devDependencies | exactly `typescript` + `vitest` (verified in package.json + the boundary suite) |
| file law | every src AND test file ≤ 400 lines (src max 350 `model.ts`; test max 377 `fixtures.ts`) |

## 3. Census (both trees + the envelope arithmetic)

| Tree | Files | Lines | Max file |
|------|-------|-------|----------|
| `src/` (19 modules + 7 pins) | **26** | **4,253** | 350 (`model.ts`) |
| `test/` (12 test + 4 fixture/decl) | **16** | **3,673** | 377 (`fixtures.ts`) |
| exports (barrel) | **113** | error classes | **10** |
| titled sites → tests | **157 → 181** | test files | **12** |

**The two-build envelope, closed honestly.** Prior build: src 3,150 ±40%
= 1,890–4,410 → this build's 4,253 is INSIDE (+35%). Old build: src 2,152
±40% = 1,291–3,013 → this build is OUTSIDE (+98%), and the deviation is
structural, accounted exactly:

- the old package IMPORTED its cross-lane laws from four runtime siblings
  (@payswap/protocol errors, @payswap/onchain-domain validators,
  @payswap/onchain-security secret scans, @payswap/best-execution
  rationals/freshness) and drove three more at dev-time; the P6-W2 hard
  constraint 3 ("ZERO sibling imports... a boundary test asserts every src
  AND test module specifier is relative") forbids every one of those
  imports, forcing: (a) the pins surface — 7 modules / **885 lines**
  with no old-build counterpart; (b) the local value laws — rational +
  freshness + errors + the secret-free scrubber, **~425 lines**
  re-implementing what the old build imported; (c) the NET-NEW hard-law-2
  proposal seam — **~165 lines**.
- Removing (a)+(b)+(c) — ~1,475 lines with no old counterpart — leaves
  **~2,780 lines** of directly comparable ported-adapted logic = **+29%
  of the old 2,152** (inside ±40%), the residual growth being the
  versioned-lineage laws (hard law 1: SupportingObservation, coherence
  validation) and the ≤400-line file-law splits of the old's monolithic
  model.ts/discovery.ts (4 model modules + 2 discovery modules, each with
  its own header/imports).
- Tests: 12 files / 181 tests = the prior build's numbers EXACTLY
  (old 10f/122 titled sites → 157 titled sites here, every old site
  accounted in §4). Exports 113 vs prior 85 (+33%, inside ±40%).

## 4. Classification arithmetic — the full old-site account

Definitions (auditable split): **PORTED** — an old site's law kept with
near-identical assertions (mechanical renames only). **ADAPTED** — an old
law re-based onto the new surface (rails, versioned lineage, pins, honest-
UNKNOWN estimate semantics). **REWRITTEN** — an old boundary/kernel-proof
intent rebuilt on the STRICTER zero-sibling law. **NET-NEW** — a law with
no old-corpus ancestor. **Fold-duplicate** — an old corpus cross-file twin
counted once (its law survives in every echo).

### 4.1 The old-site account closes on 122 (zero silently dropped)

122 old sites = **76 PORTED** + **27 ADAPTED** + **16 REWRITTEN** +
**3 fold-duplicates** + **0 dropped-with-reason**.

- model 20 = 18 P + 2 A (the deterministic identity re-based onto
  railKey; the old chain-key law re-based onto the pinned rail-key law).
- eligibility 19 = 14 P + 3 A (the table-driven sweep carries the
  lineage-stale entry; the unreserved-incentive estimate is honestly
  UNKNOWN; the multi-rule fixture restructured) + 2 folds (the
  families-frozen and healthy-eligible twins counted once — their laws
  live on in model/discovery).
- discovery 17 = 16 P + 1 A (the catalog-construction site re-based onto
  the across-rails 28-entry catalog).
- agent-cannot-execute 17 = 8 P + 1 A (the old REAL-kernel secret-scanner
  site re-based onto the local runtime scrubber, proven in
  secret-free.test.ts) + 8 R (the six REAL-kernel validator/prepare/
  settlement rejection sites and the canonical-write contrast re-based
  onto the pinned INV-13 instance scope, the pinned 18-marker-field scan
  and the structural-incompatibility proof).
- lab-composition 13 = 13 A (every site re-based onto the PINNED Lab wire
  shapes; the test-layer harness implements the Lab's own INV-13
  selection law over the pins — the real Lab is TL-wired).
- vocabulary 9 = 9 P (byte-equivalent law, loop-expanded corpus).
- observation 9 = 8 P + 1 A (the evidence-chain-preservation site now
  asserts the versioned lineage).
- boundary 8 = 8 R (onto the STRICTER zero-sibling law: the old
  workspace-dependency allowlist, the no-Lab-reference, vendor, venue,
  execution-machinery, determinism, package.json-allowlist and
  no-raw-secrets sites).
- secret-free 5 = 5 A (the type-level proof re-declared against the
  local forbidden-key law).
- smoke 5 = 3 P + 1 A (the package identity rename) + 1 fold
  (families-frozen twin counted once).

### 4.2 New-test totals

157 titled sites = 76 P + 27 A + **11 R-sites** (the 16 old REWRITTEN
laws consolidated onto 11 new sites: 3 pinned-surface proofs in
agent-cannot-execute + 8 boundary sites) + **41 NET-NEW** + 2 fold-echoes
(the families-frozen and healthy-eligible laws echoed where the old
corpus carried twins) = **157 titled sites → 181 vitest tests** across
12 files (the 18 adversarial-guarantee and 8 honest-surface loop sites
expand 1:18 and 1:8). Per-file allocation (verified by station count):
model 27 (18P/3A/6N), discovery 22 (17P/1A/4N), eligibility 19
(15P/3A/1N), lab-composition 13 (13A), agent-cannot-execute 13
(8P/3R/2N), observation 10 (8P/1A/1N), boundary 10 (8R/2N), vocabulary 9
(9P), pins 9 (9N), proposal-seam 9 (9N), secret-free 9 (5A/4N), smoke 7
(3P/1A/3N) — sums to 157 titled sites / 181 tests exactly. The NET-NEW
laws: the versioned-lineage coherence family (6), the pins-consistency
suite (9), the proposal-seam suite (9), the runtime secret scrubber (4),
the across-rails laws (5), the rail vocabularies (3), the boundary
census/manifest receipts (2), the export-surface barrel receipt (2), the
seam law restatements (1).

## 5. Structural-law compliance

- Zero runtime dependencies (package.json `dependencies` absent).
- devDependencies exactly `typescript` + `vitest`.
- Zero sibling imports in src AND test (grep-verified; the boundary
  suite enforces every module specifier is relative, with the test-layer
  vitest/node-builtin allowlist); zero `node:` imports in src.
- `tsconfig.json` carries NO paths entries; `test/node.d.ts` declares
  `process.cwd` as a function exactly once (the accepted convention).
- Deterministic hermetic tests only; no network, no ambient
  clock/randomness (caller-supplied instants; the boundary suite greps
  src for Math.random/Date.now/parseFloat/fetch/Node globals with
  string-literals stripped).
- Every file ≤ 400 lines (src max 350, `src/model.ts`; test max 377, `test/fixtures.ts`).
- No complete secret literal anywhere in source or tests (the secret
  patterns are SHAPE patterns; the detection fixtures are assembled at
  RUNTIME from fragments — the GitHub-push-protection discipline).

## 6. Battery reproduction (any machine)

```
git clone https://github.com/payswapdotorg/PaySwap-3.0
cd PaySwap-3.0 && git checkout work/r4-w2
cd packages/opportunities
npm install --no-workspaces && npx tsc --noEmit && npx vitest run
```

## 7. Delivery note (lane r4-w2)

Single-session worker lane, branch `work/r4-w2` from base `0755624`.
The delivery protocol was followed verbatim: the base was verified
before any work (`git log --oneline -1` = `0755624 P7-E2E (Gate D)
accepted...`); the two-build oracle was read in both clones (the old
repo at `8a735bf` for the site census, the lost prior build's numbers
from the work order as the envelope); commits 1–4 landed in order with
the LAW-2 bundle (`r4-w2.bundle`, `main..work/r4-w2`) and the app-root
mirror (`r4-w2-mirror/`, repo-relative paths) refreshed after EVERY
commit; no file outside `packages/opportunities/**`,
`spec/opportunities/**`, `docs/opportunities-evidence/**` was touched
(the generated `package-lock.json` of the hermetic battery was deleted
before every commit — it is a battery artifact, not a deliverable).
