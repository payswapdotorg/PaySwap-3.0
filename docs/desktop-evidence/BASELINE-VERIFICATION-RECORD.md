# P7-W2 Baseline Verification Record — PaySwap Desktop

Work order: P7-W2 (spec/dependency/work-orders.md: "PaySwap Desktop on
the ZCode-derived native shell using shared Surface/backend contracts.");
re-dispatch r2 (the original lane was lost to an orchestrator-side
sandbox reset — no fault of the worker; built fresh on current main).
Lane: experience/product (Phase 7 = product).
Branch: `work/p7-w2-r2` (base `2999bbb1658443b72ce9644f32cabbebdbecaa37`,
the Phase-2-complete STATE).
Write surface: `packages/desktop/**`, `spec/desktop/**`,
`docs/desktop-evidence/**` (verified — see §6; zero files touched
outside the write surface).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087
a2992555166a9acf9` (read-only; see §2 for the NO-OLD-REPO-DESKTOP
disposition and what WAS taken).

## 1. Battery receipts (exact commands, exit codes, counts)

Environment: Node v24.21.0, pnpm 10.33.2 (the ZCode Platform Baseline
tooling pin), Linux x64. All commands run from the worktree root
(`/home/z/payswap3-0`) unless noted.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `pnpm install --frozen-lockfile` | 0 | clean install in 51s; lockfile untouched (no dependency changes made to any package — the desktop product adds ZERO deps, honoring both the substrate law and the frozen-lockfile battery) |
| 2 | `pnpm run typecheck` (root; includes `packages/desktop/tsconfig.host.json` per the root script `tsc -b …`) | 0 | zero diagnostics — the desktop typecheck path passes with the new `src/host/payswap/**` tree (11 source modules + host wiring) |
| 3 | `pnpm --filter @zcode/desktop lint` (oxlint) | 0 | **0 errors**, 14 warnings — the SAME 14 warnings as the pre-change baseline (baseline: 14 warnings on 296 files; final: 14 warnings on 330 files; verified warning-for-warning that all 14 are pre-existing substrate warnings in `electron-builder.config.js`, `scripts/*.mjs`, `src/main/index.ts`; none in payswap files) |
| 4 | `pnpm --filter @zcode/desktop test` (vitest run, node-env) | 0 | **10 files / 85 tests, all PASS** in ~9s (8 ported/adapted + 77 net-new; §4) |
| 5 | baseline re-verification | 0 | commands 2–3 were ALSO run on the untouched base (before any change): typecheck 0 diagnostics; lint 0 errors / 14 warnings — the lane introduced no regression |

Per-file test counts (vitest): pin-fidelity 11, delegation 8,
shell-integration 9, honest-states 11, quote-terms 9, progress-timeline
10, security-gate 6, mission-surface 7, money-view 6,
ported-ux-vocabulary 8. Sum: 85.

Determinism receipts: every suite is pure-function testing over pinned
shapes and recorded fixtures — no clock (explicit `now` inputs), no
network, no electron runtime, no filesystem writes, no randomness
(session ids are injected in tests). Re-running the battery reproduces
identical counts.

## 2. Old-repo evidence: NO-OLD-REPO-DESKTOP disposition (verified)

The work order states there is no old-repo desktop package. VERIFIED at
`payswap.org@8a735bf`: the repository contains 38 packages under
`packages/` (adapters, adversarial, agents, api, best-execution,
campaigns, capabilities, certification, connectors, design, execution,
interfaces, journeys, lab, merchant-checkout, merchant-crypto,
mixed-rail, onchain-*, operations, participation, payment, protocol,
rails, recourse, route-compiler, security, settlement, surface, trust,
ux, web) and NO `apps/` directory; NO package named or shaped as
desktop/electron/native (grep over all package.json files finds zero
electron dependencies); `packages/web` is the old React web app, the
closest old product surface, and is NOT a desktop shell. **The old repo
is a contract/test library — no desktop code exists to port.**

Evidence sources used instead (per the work order):

(a) The accepted 3.0 contract packages — pin shapes. The product's
pinned wire shapes mirror `packages/surface/src` (P2-W3), 
`packages/protocol/src` (P1-W2), `packages/provider-runtime/src` (P2-W2)
at base 2999bbb. Pin fidelity is machine-checked against RECORDED
fixtures (§3).

(b) The old repo's `packages/ux` command-center UI vocabulary —
product-facing interaction patterns. What was TAKEN (8 test titles
ported/adapted — classification in §4): the honest UNKNOWN/error-state
patterns, the no-dead-buttons affordance pattern, the honest empty-state
pattern, the exact-money verbatim-string law, the only-failed-renders-as-
failure tone law. What was NOT taken (P7-W3 command-surface CONTRACT
share — receipt): the command grammar (COMMAND_VERBS/chords/parse), the
search/command palette surface, the no-result intent turn, the create
menu, inbox urgency vocabulary, Work-Graph context, economic controls,
provider-plane views, operator route outcomes. These belong to the P7-W3
universal interaction lane and were left untouched.

(c) The substrate's own desktop architecture (packages/desktop/src —
main/renderer/host/process boundaries, platform DI) — composed through,
never modified beyond the single additive host wiring receipt (§5).

## 3. Pin-fidelity recording method (auditable)

`test/fixtures/recorded-contract-vocabulary.json` was RECORDED by
importing the accepted packages' source (tsx ESM import of
`packages/{surface,protocol,provider-runtime}/src/index.ts` at base
2999bbb) and dumping the canonical vocabularies verbatim (script:
workspace `scripts/record-payswap-pins.mjs`, kept outside the repo write
surface). Type-union vocabularies with no runtime export (StageStatus,
QuoteFeeBasis, DeliveryEstimateKind, EvidenceNodeKind, ExecutionMode)
were READ from the declared unions in the accepted source files at the
same commit and recorded in
`test/fixtures/recorded-contract-vocabulary.ts` with the method cited in
its header. The pin-fidelity battery asserts pins === recording for
every vocabulary and registry datum (including area law-citation
ordering — one citation-order drift was caught and fixed DURING the lane
by exactly this battery: the `connections` area's citations are
`["…INVARIANTS.md#13", "…CAPABILITY-MODEL.md"]` in the accepted source).

## 4. Classification accounting (by test title)

85 total = **8 PORTED-ADAPTED** (old repo `payswap.org@8a735bf`
`packages/ux`) + **77 NET-NEW**.

| # | New title (test/payswap/ported-ux-vocabulary.test.ts) | Old source title | Adaptation |
|---|--------------------------------------------------------|------------------|------------|
| 1 | "UNKNOWN renders as reconciling with a warning tone and a reconciliation path (never failed)" | honest-states.test.ts:25 "UNKNOWN renders as reconciling with a NEUTRAL tone and a reconciliation path (never failed)" | old HonestTone neutral → accepted 3.0 surface stage-tone warning; LAW unchanged |
| 2 | "OUTCOME_UNKNOWN renders as reconciling, NEVER as failed (INV-X01 -> canonical INV-04)" | command-center.test.ts:77 + honest-states.test.ts:67 | INV-X01 → canonical INV-04 |
| 3 | "FAILED offers retry only as a NEW intent (never a blind re-run of the same attempt)" | honest-states.test.ts:57 "FAILED offers retry only as a NEW intent with a fresh idempotency key" | idempotency-key wording dropped (desktop has no key surface; provider-runtime owns endpoint idempotency) |
| 4 | "ONLY failed renders as failure — no state masquerades as failure" | outcome-vocabulary.test.ts:63 | verbatim law |
| 5 | "in-flight renders as still-watching with a NEUTRAL tone (never danger)" | outcome-vocabulary.test.ts:69 "dropped and processing render as \"still watching\" with a NEUTRAL tone (never red)" | processing/dropped → PENDING_OBSERVATION |
| 6 | "every entry carries at least one available action (no dead mission rows)" | command-center.test.ts:348 "every entry carries at least one AVAILABLE action (no dead inbox items)" | inbox entries → mission board rows |
| 7 | "every surface carries an honest-state contract: empty data is an EMPTY STATE, UNKNOWN never renders as failure" | product-ia.test.ts:47 | verbatim |
| 8 | "the amount stays a VERBATIM string — never float-parsed (exact-money law)" | command-grammar.test.ts:183 | verbatim law at the delegation boundary |

Net-new 77 = the composition-law batteries over the accepted 3.0 pinned
contracts and the substrate shell seams: pin-fidelity 11 + delegation 8 +
shell-integration 9 + honest-states 11 + quote-terms 9 + progress-timeline
10 + security-gate 6 + mission-surface 7 + money-view 6 = 77; the ported
8 live in the dedicated ported-vocabulary file. 77 + 8 = 85.

## 5. Substrate integration receipts

- Host wiring (the ONLY change to a pre-existing substrate file):
  `src/host/index.ts` — one import + one additive registration block
  (`registerPaySwapDesktopService(services, { scope: { kind: "local" },
  log: writeHostLog-seam })`) inside `InitLocal.initializeServices`
  after `wireLocalResourceTelemetry`. No existing line was modified or
  removed; the file's inherited safeguards are untouched; typecheck and
  lint over the whole package remain green.
- Service exposure path: the product registers into the host
  ServiceCollection (descriptor `IPaySwapDesktopService` on channel
  `payswap-desktop`); exposure follows the host's existing
  `exposeOnChannelServer` → `ProxyChannel.fromService` path with the
  Logging + NetworkTelemetry middleware chain (inherited, required).
- Dependency surface: ZERO changes to `packages/desktop/package.json`
  dependencies (only the additive `"test": "vitest run"` script). The
  workspace lockfile is untouched — `pnpm install --frozen-lockfile`
  verifies green. The deterministic suite runs on the workspace-hoisted
  vitest (node-linker=hoisted), adding no dependency.
- File law: every NEW file ≤ 400 lines (largest: 373-line
  surface-areas-pins.ts — under the repo oxlint max-lines rule of 400
  with skipBlankLines/skipComments; all other files ≤ 256). Pre-existing
  substrate files were not split or rewritten.

## 6. Write-surface verification

`git diff --name-only 2999bbb..HEAD` (4 commits) contains ONLY:

- `packages/desktop/src/host/payswap/**` (new product tree),
- `packages/desktop/src/host/index.ts` (the additive wiring receipt, §5),
- `packages/desktop/test/**` (new deterministic suites + recorded
  fixtures),
- `packages/desktop/vitest.config.ts` (new),
- `packages/desktop/package.json` (additive test script only),
- `spec/desktop/DESKTOP.md` (new),
- `docs/desktop-evidence/BASELINE-VERIFICATION-RECORD.md` (new).

Zero files outside `packages/desktop/**` + `spec/desktop/**` +
`docs/desktop-evidence/**`.

## 7. Findings

- F-1 (substrate): `tsconfig.host.json` covers ONLY `src/host` — the
  root typecheck battery exercises the host-side product code exactly
  where the PaySwap product lives; renderer-side code is outside the
  battery, which is consistent with this lane's deterministic-suites
  battery definition.
- F-2 (substrate/dependency): the hoisted workspace already provides
  vitest at the root `node_modules/.bin`, so a substrate package can run
  a deterministic vitest suite WITHOUT dependency changes — this lane
  used that fact to keep the frozen-lockfile battery green while still
  shipping real tests.
- F-3 (pins): one citation-order drift between the initial pin and the
  accepted source was caught by the pin-fidelity battery itself
  (connections area law-citations) and fixed — the recorded-fixture
  approach works as intended.
- F-4 (old repo): confirmed no old-repo desktop package exists (§2);
  the old `packages/ux` interaction vocabulary ports cleanly onto the
  3.0 pinned surface contracts (8 titles) with the P7-W3 command-surface
  share explicitly left for that lane.

## 8. Limitations (receipted)

- **Electron build/bundle limitation**: full electron builds, bundles and
  runtime-asset preparation were NOT attempted (network/runtime-asset
  heavy: electron binary download, node-pty native rebuild, agent node
  bundles, mock CDN assets). Per the work order, this lane's battery is
  `pnpm install --frozen-lockfile` + the desktop typecheck path (root
  `pnpm run typecheck`) + `pnpm --filter @zcode/desktop lint` +
  deterministic vitest suites — all green (§1). A real electron window
  smoke test is deferred to the platform/release lanes (P8-W3) or a
  follow-up work order with an authorized asset pipeline.
- **Renderer composition deferred**: the mission surface's React
  composition inside the `@zcode/ui` shell is not part of this lane
  (`packages/ui` is outside the write surface). The host-side service
  (channel `payswap-desktop`) is registered and exposed through the
  substrate's standard service-port path, so the renderer consumer is a
  pure additive follow-up.
- **Structural pins are local by law**: no @payswap/* imports were added
  to the substrate package (hard constraint 5). The pins mirror the
  accepted shapes exactly (machine-checked §3); TL integration may swap
  them for real imports under a future law change without behavior
  change.
