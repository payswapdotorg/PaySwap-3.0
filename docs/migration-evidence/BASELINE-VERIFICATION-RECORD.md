# Baseline Verification Record — P0-W3 (Migration/Baseline Evidence)

Work Order P0-W3: *"Inspect old PaySwap and ZCode source, tests and dependencies; create a verified migration matrix and baseline verification record. Inventory only; do not create parallel implementation."*

- Worker: 3 (lane: migration, experience and integrations).
- Branch: `work/p0-w3`, base `e40f2b9cc8da7d5ccfe15c93b43adc2dbf941b6e`.
- Old reference repo: `payswapdotorg/payswap.org` @ `8a735bf1639198c43115087a2992555166a9acf9` (cloned read-only).
- Canonical repo: `payswapdotorg/PaySwap-3.0`, ZCode pin `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (v3.14.3).
- Deliverables: `spec/migration/MIGRATION-MATRIX.md`, `spec/migration/MIGRATION-MATRIX-PACKAGES.md`, `spec/migration/migration-matrix.json`, this record and its siblings under `docs/migration-evidence/`.
- Law held: old source and tests are evidence, never authority; PaySwap 3.0 architecture wins; **zero implementation code was created** — the only tooling is the inventory checker under `docs/migration-evidence/tools/`.

## 1. Old PaySwap inspection (what the old repo actually is)

`payswap.org` at the reviewed commit is a **pure TypeScript contract/test library**: 36 npm workspace packages, no runtime services, no build step (every package exports `./src/index.ts` directly), external dependencies only `typescript` + `vitest` (React/Next/tailwind confined to `design` and `web`). Its own governance (`spec/architecture/FROZEN-ARCHITECTURE.md` v1.5, 17 spec docs, staged FINAL-TL handoffs) shows a completed multi-wave program (W1…P4) ending in a §20 UX certification commit.

Tree map (evidence, not authority):

- **Protocol plane (P1 evidence):** `protocol` (22 src: exact money, obligations, netting, reservations, collateral, credit, FX, liquidity, envelopes, idempotency, state machines, aggregates, persistence conventions, error taxonomy, deterministic clock), `settlement` (instructions, finality, reconciliation, evidence graph, proof policies, certificates), `recourse`, `trust`, `payment`.
- **Capability plane (P2 evidence):** `capabilities`, `connectors` (ProviderStateEnvelope, execution modes, connector packs, external funds), `adapters` (RailAdapter/PSP connector SDK, webhook ingestion), `rails` (11 real provider connector references + crypto rail + ECB FX), `execution`, `interfaces`, `surface`.
- **Agent/economic plane (P3 evidence):** `agents` (Body/Instance/Package/Organization), `api`.
- **Onchain (P4 evidence):** `onchain-domain`, `onchain-security`, `onchain-adapters`, `onchain-venues`, `mixed-rail`, `route-compiler`, `best-execution`, `merchant-crypto`, `merchant-checkout`.
- **Intelligence/product (P6/P7 evidence):** `lab`, `onchain-opportunities`, `onchain-threat-intel`, `security`, `ux`, `design`, `web`, `operations`, `certification`, `journeys`, `adversarial`, `participation`, `campaigns`.

Every preserve-list item from `spec/MIGRATION-FROM-PAYSWAP-ORG.md` (21 items) was located in this tree with implementing files + tests — **except EconomicGoal, which has no code implementation anywhere** (spec text only; GAP-01). Full per-item mapping: `spec/migration/MIGRATION-MATRIX.md`.

Test status: all 36 default deterministic suites run and pass — **393 test files / 5,192 tests, 0 failures**; typecheck 36/36 workspaces, 0 errors; 13 live-gated suites skipped with reasons (`docs/migration-evidence/OLD-REPO-TEST-RECEIPTS.md`). Every suite completes in ≤ 26 s; no expensive suite was run or needed to be.

## 2. Classification matrix (summary)

Full matrix: `spec/migration/MIGRATION-MATRIX.md` (21 preserve-list items) + `spec/migration/MIGRATION-MATRIX-PACKAGES.md` (36 packages) + `spec/migration/migration-matrix.json` (machine-readable).

| Scope | REUSE | ADAPT | PORT | REWRITE | RETIRE | unmapped |
| --- | --- | --- | --- | --- | --- | --- |
| Preserve-list items (21) | 0 | 1 | 19 | 1 | 0 | 0 |
| Old-repo packages (36) | 0 | 1 | 32 | 1 | 2 | 0 |

Key calls:

- **PORT dominates (51/57)** because the old repo is a contract/test library whose value is contract shape + a 5,192-test behavioral oracle; the canonical implementation is re-authored per phase under `spec/architecture/*` authority. PORT never authorizes copying.
- **ADAPT (2):** `exact money` (MMI-09: `protocol/src/money.ts`, 419 lines, + the AmountSpec block of `trust/src/mandate.ts`) and the `design` package (MMP-10: presentation-only tokens/components). Both name their exact old files; nothing is classified REUSE.
- **REWRITE (2):** `EconomicGoal` (MMI-01 — no old code exists) and the old `web` package (MMP-36 — new web product on the ZCode Web substrate per the UI law).
- **RETIRE (2):** `participation` and `campaigns` (MMP-25/MMP-06) — no canonical Work Order owns them; the canonical Policy & Governance Authority covers incentives at policy level only. Carrying them forward would create unowned parallel implementation. Reclassification requires a Work Order/ADR (GAP-03).
- Every row names an authority owner (canonical Work Order) and the ZCode-equivalent surface or **NONE** (net-new). PARTIAL equivalents (ZCode approval UX, tool registry/MCP, subagents/workflows, telemetry/artifacts, client substrates) are platform surfaces only — financial semantics stay authority-disjoint, honoring "ZCode permission is not PaySwap financial authorization".

## 3. ZCode baseline verification (verdict: VERIFIED)

Full receipts: `docs/migration-evidence/ZCODE-BASELINE-VERIFICATION.md`.

- `git merge-base --is-ancestor 29628c9… e40f2b9` → **PIN_OK** (battery command 1).
- Pin commit fetched by exact SHA from real `zai-org/ZCode`: identical commit hash and tree (`e7458be…`) — the fork's baseline is byte-identical to real upstream v3.14.3.
- Upstream history unrewritten: fork contains the pin's complete genuine ancestry `77432b6` (ZCode root) → `872ad96` → `29628c9`, plus 25 linear governance commits (no merges, no squashes); base `e40f2b9` is an ancestor of current `origin/main` (P0-W1 accepted on top).
- Old-repo reference commit: cloned HEAD = `8a735bf1639198c43115087a2992555166a9acf9` = `reviewed_reference_commit` in `current-state.json` (battery command 2). **PASS.**

## 4. Dependency inventory (summary)

Full table: `docs/migration-evidence/DEPENDENCY-INVENTORY.md`.

- Old repo: npm lockfile v3, 646 locked packages, direct deps = `typescript` + `vitest` (+ React/Next stack in 2 UI packages). Canonical: pnpm lockfile v9, 1,885 locked packages, 33 importers.
- Shared direct deps: 8 (react, react-dom, @types/react, @types/react-dom, @types/node, typescript, tailwindcss, @vitejs/plugin-react). Version drift is minor everywhere except `@vitejs/plugin-react` (old v4 → canonical v5/v6, tooling-only impact). `typescript` matched at 5.9.3.
- Licensing: all old-repo direct deps MIT/Apache-2.0; repo-wide copyleft scan found only `axe-core` (MPL-2.0, old-repo-unique, dev/test-only) and `lightningcss` (MPL-2.0, present in BOTH repos as a tailwind/vite transitive, build-time only). **No GPL/AGPL/SSPL anywhere — no copyleft blocker.**

## 5. Battery receipts

| Command | Result |
| --- | --- |
| `git -C <canonical> merge-base --is-ancestor 29628c9acdb81b703bbd4080c207a0e7ce5e276e e40f2b9 && echo PIN_OK` | **PIN_OK** (exit 0) |
| `git -C <payswap.org clone> rev-parse HEAD` | `8a735bf1639198c43115087a2992555166a9acf9` — matches recorded reference commit |
| `node docs/migration-evidence/tools/check-matrix-consistency.mjs . <old-repo>` | `matrix consistency check: 550 checks, 0 violations` → **MATRIX_CONSISTENCY_OK** |
| Old-repo suites discovered / run / skipped | 406 test files discovered / 393 run (all PASS, 5,192 tests) / 13 live-gated skipped with reasons (10 rails + 3 onchain-adapters; credential/network-gated by the old repo's own configs — full table in OLD-REPO-TEST-RECEIPTS.md) |

## 6. Gaps register (honest)

| ID | Gap | Impact | Owner of the decision |
| --- | --- | --- | --- |
| GAP-01 | **EconomicGoal has no old-repo implementation** — spec text only (`spec/architecture/DOMAIN-MODEL.md`, `FROZEN-ARCHITECTURE.md` §1). The preserve list implies code exists; it does not. | P1-W1 must author EconomicGoal net-new with no old test oracle; old spec language is the only evidence. | P1-W1 (with TL) |
| GAP-02 | **13 live-gated test suites not run** (rails ×10, onchain-adapters ×3): credential/network-gated by their own configs; real-provider behavior (Stripe, Flutterwave, Paystack, PayPal, Stellar, EVM/Solana/UTXO public RPC, ECB live feed) is therefore unverified in this record. | The canonical `real_provider_integration_evidence` gate cannot lean on this record for live behavior; deterministic evidence (injected transports) is green. | P2-W2 / P8 (later phases) |
| GAP-03 | **participation + campaigns have no canonical authority owner** — classified RETIRE; canonical architecture mentions incentives only under Policy & Governance Authority, and no P1–P8 Work Order owns participation engineering. | Two well-tested old packages (74 + 78 green tests) are deliberately not carried; if the program wants participation economics, a Work Order/ADR must re-classify. | TL (policy) |
| GAP-04 | **Matrix mappings are Phase-0 judgments, not implementation decisions.** Authority-owner assignment (e.g. payment primitives → P2-W1, execution → P3-W2, surface → P2-W3) reflects the Work Order catalog reading; the owning workers may re-scope within their lanes. | Classification drift risk between phases; matrix is versioned evidence to be re-verified at each consuming phase. | Consuming Work Orders |
| GAP-05 | **ZCode-equivalent for the developer API surface is partial**: old `api`/`interfaces` packages (identity/session, REST, webhooks, MCP, A2A, AG-UI) have only the ZCode RPC/server/MCP substrate as host; the canonical developer-API authority (P7-W3) is net-new and its exact boundary with the ZCode platform API is not yet architected. | Boundary risk between platform API and PaySwap developer API; must stay authority-disjoint. | P7-W3 + P3-W3 |

## 7. Write-surface compliance

Touched files (all inside the P0-W3 exclusive surface): `spec/migration/**` (3 files) and `docs/migration-evidence/**` (5 files + 1 tool). Nothing in `README.md`, `docs/platform-lineage/**`, `spec/UPSTREAM-BASE.md`, `spec/architecture/**`, `tools/**`, `package.json`, or any `apps/`/`packages/` source was modified in either repository. Both reference clones are read-only; no pushes were made to GitHub.

## 8. Verdict

Baseline verified, matrix complete and machine-checked, old-repo evidence green and honestly bounded. This record creates no implementation and authorizes no copying. Downstream phases consume it as evidence under the PaySwap 3.0 architecture.
