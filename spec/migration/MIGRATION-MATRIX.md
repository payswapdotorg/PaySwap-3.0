# PaySwap 3.0 Migration Matrix — Preserve-List Items

Status: CANONICAL (P0-W3 inventory). Machine-readable source: `spec/migration/migration-matrix.json`.
Companion: `spec/migration/MIGRATION-MATRIX-PACKAGES.md` (all 36 old-repo packages).
Evidence receipts: `docs/migration-evidence/BASELINE-VERIFICATION-RECORD.md`.

Old repository: `payswapdotorg/payswap.org` @ `8a735bf1639198c43115087a2992555166a9acf9`.
Canonical repository: `payswapdotorg/PaySwap-3.0` @ base `e40f2b9cc8da7d5ccfe15c93b43adc2dbf941b6e` (ZCode pin `29628c9acdb81b703bbd4080c207a0e7ce5e276e`, v3.14.3).

## Law

- Old source and tests are **evidence, never authority**. PaySwap 3.0 architecture (`spec/architecture/*`) wins over the old repository.
- This matrix records what exists and what it maps to; **it never authorizes copying**.
- Inventory only: no parallel implementation is created by this record.
- REUSE is never issued without naming the exact old-repo file(s); the same hard rule is applied to ADAPT.
- Every row names an authority owner (a canonical Work Order) and the ZCode-equivalent surface — or **NONE**, meaning net-new.

## Classification vocabulary

| Class | Meaning |
| --- | --- |
| REUSE | Old file(s) carried in substantially verbatim (exact file list mandatory). |
| ADAPT | Old file(s) carried in with bounded modifications (exact file list mandatory). |
| PORT | Concept + contract shape carried to a new authority owner, substantially re-authored; old files are reference contract + test evidence. |
| REWRITE | Net-new implementation; old repo is evidence/reference only. |
| RETIRE | Not carried forward; reclassification requires a Work Order/ADR. |

ZCode-equivalent legend: **NONE** = no equivalent surface at the pin (net-new financial-domain work); **PARTIAL** = a ZCode surface hosts/parallels part of the item, financial semantics stay net-new and authority-disjoint; otherwise concrete canonical paths.

## Item matrix (21 preserve-list items)

Counts: REUSE 0 · ADAPT 1 · PORT 19 · REWRITE 1 · RETIRE 0 · unmapped 0.

| ID | Preserve-list item | Old-repo evidence anchor | Old tests | Class | Authority owner | ZCode-equiv |
| --- | --- | --- | --- | --- | --- | --- |
| MMI-01 | EconomicGoal | spec/architecture/DOMAIN-MODEL.md; FROZEN-ARCHITECTURE.md §1; route-compiler intent.ts docstring — **no code** | NONE (no implementation exists) | REWRITE | P1-W1 | NONE |
| MMI-02 | MoneyMovementIntent | route-compiler/src/intent.ts; merchant-crypto/src/intent.ts | intent tests PASS (13f/165t; 10f/191t) | PORT | P1-W1 | NONE |
| MMI-03 | payment primitives | payment/src/{method,acceptance,translation,recurring,off-network,remittance}.ts | 8f/60t PASS | PORT | P2-W1 | NONE |
| MMI-04 | Financial Protocol Authority | protocol/src/ (22-file kernel) | 20f/237t PASS | PORT | P1-W2 | NONE |
| MMI-05 | Trust/Authorization | trust/src/{principal,mandate,attenuation,authorization,grants,security-epoch}.ts | 6f/79t PASS | PORT | P1-W3 | PARTIAL (approval UX) |
| MMI-06 | capability hierarchy | capabilities/src/*; connectors/src/packs.ts | 10f/111t + packs PASS | PORT | P2-W1 | PARTIAL (tool registry/MCP) |
| MMI-07 | ProviderStateEnvelope | connectors/src/provider-state.ts | provider-state.test.ts PASS | PORT | P2-W1 | NONE |
| MMI-08 | native/composed/multi-provider execution | connectors/src/execution-modes.ts; execution/src/plans.ts; best-execution engine/venue-port | execution-modes/plans/engine tests PASS | PORT | P2-W1 | NONE |
| MMI-09 | exact money | protocol/src/money.ts; trust/src/mandate.ts (AmountSpec) | money.test.ts PASS | ADAPT | P1-W2 | NONE |
| MMI-10 | UNKNOWN/reconciliation | settlement/src/reconciliation.ts; execution/src/reconciliation.ts; rails reconciliation connectors; adversarial faults | reconciliation tests PASS | PORT | P1-W2 | NONE |
| MMI-11 | non-custody | FROZEN §8A; connectors/src/external-funds.ts; route-compiler leg-contracts+walk; agents/smart-account; capabilities/smart-contract; mixed-rail simulation-tier | custody-continuity, never-production, external-funds PASS | PORT | P1-W2 | NONE |
| MMI-12 | obligations/clearing/netting/settlement/finality | protocol/src/{obligation,netting,reservation}.ts; settlement/src/{instructions,finality}.ts | obligation/netting/reservation/instructions/finality PASS | PORT | P1-W2 | NONE |
| MMI-13 | FX/liquidity/credit | protocol/src/{fx,liquidity,credit,collateral}.ts; rails/src/fx-source.ts | fx/liquidity/credit + fx-source PASS | PORT | P1-W2 | NONE |
| MMI-14 | FinancialOpportunity | onchain-opportunities/src/* (7 files) | 10f/153t PASS | PORT | P6-W2 | NONE |
| MMI-15 | Strategy vs Organization | agents/src/organization.ts + organization/; agents/src/body.ts; lab/src/{search,simulation}.ts; FROZEN §7 | organization + search tests PASS | PORT | P3-W1 + P3-W2 | PARTIAL (subagents/workflows) |
| MMI-16 | Lab | lab/src/* (9 contract files); mixed-rail + onchain-venues Lab registration | lab 11f/109t PASS | PORT | P6-W1 | PARTIAL (workflow-runtime/telemetry) |
| MMI-17 | proof/evidence lineage | settlement/src/{evidence-graph,proof-policies,certificates}.ts; route-compiler/src/evidence.ts; merchant-checkout/src/evidence.ts | evidence tests PASS | PORT | P1-W2 | PARTIAL (telemetry/artifacts) |
| MMI-18 | onchain capability/security | onchain-domain/src/*; onchain-security/src/*; onchain-adapters/src/*; onchain-threat-intel/src/* | 11f/145t + 11f/155t + 9f/90t + 14f/162t PASS | PORT | P4-W1 + P4-W2 | NONE |
| MMI-19 | mixed-rail routing | route-compiler/src/*; mixed-rail/src/*; best-execution/src/*; onchain-venues/src/* | 13f/165t + 8f/71t + 7f/81t + 7f/61t PASS | PORT | P5-W1 | NONE |
| MMI-20 | merchant crypto/Stripe concepts | merchant-crypto/src/*; merchant-checkout/src/*; rails/src/stripe.ts; adapters/src/psp-connector.ts | 10f/191t + 13f/170t + stripe/psp PASS | PORT | P5-W3 | NONE |
| MMI-21 | framework-independent Surface API | surface/src/{outcomes,areas,money-view,security-vocabulary,convert-preview,version}.ts | 3f/44t PASS | PORT | P2-W3 | PARTIAL (client/web/desktop/cli) |

## Rationale highlights

- **MMI-01 EconomicGoal (REWRITE, GAP-01):** repo-wide grep proves the concept exists only in old spec text; P1-W1 authors it net-new. This is the only preserve-list item with no old implementation.
- **MMI-09 exact money (ADAPT):** the single strongest carry-in candidate — pure, product-neutral, zero platform coupling, 1:1 with the canonical "Exact money only" law. Exact old files: `packages/protocol/src/money.ts` (419 lines) and the AmountSpec block of `packages/trust/src/mandate.ts`. ADAPT, not REUSE, because the old protocol error taxonomy and INV numbering must be re-homed under the canonical Financial Protocol Authority.
- **MMI-04/10/12/13 (PORT, protocol plane):** the old `protocol` kernel is the old authority — the most valuable *evidence* body (32/36 old packages depend on it; 237 green tests) — but the canonical Financial Protocol Authority is authored by P1-W2 under `spec/architecture/*`.
- **PARTIAL ZCode equivalents** never transfer authority: ZCode permission UX, tool registry/MCP, subagents/workflows, telemetry/artifacts and client substrates are platform surfaces (KEEP/PAYSWAP-ADAPT per `spec/MIGRATION-FROM-ZCODE.md`); the financial semantics on top of them remain net-new and authority-disjoint.
- **Provider name-collision warning (MMI-07):** ZCode `packages/provider` is AI-model provider selection; it is NOT a ProviderStateEnvelope equivalent. Financial provider-state is net-new (P2-W1).
- **No REUSE was issued.** Nothing in the old repo is carried verbatim without modification; the two ADAPT rows name their exact files.

## Gaps register (top)

1. **GAP-01 — EconomicGoal has no old implementation.** Spec-only evidence; P1-W1 must author net-new. See `docs/migration-evidence/BASELINE-VERIFICATION-RECORD.md`.
2. **GAP-02 — 13 live/network-gated test suites not run** (`rails/test/live/*` ×10, `onchain-adapters/test/live/*` ×3): credential/network-gated by the old repo's own configs. Deterministic evidence (393 files / 5,192 tests) is green.
3. **GAP-03 — participation + campaigns have no canonical authority owner.** Classified RETIRE (MMP-25/MMP-06); reclassification requires a Work Order/ADR.
