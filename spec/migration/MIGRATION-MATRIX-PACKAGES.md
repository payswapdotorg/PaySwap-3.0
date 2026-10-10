# PaySwap 3.0 Migration Matrix — Old-Repo Packages (36/36)

Status: CANONICAL (P0-W3 inventory). Machine-readable source: `spec/migration/migration-matrix.json` (`old_repo_packages[]`).
Preserve-list item matrix: `spec/migration/MIGRATION-MATRIX.md`.

Old repository: `payswapdotorg/payswap.org` @ `8a735bf1639198c43115087a2992555166a9acf9` — an npm-workspace TypeScript **contract/test library**: 36 packages, no runtime services, external deps only `typescript` + `vitest` (plus React/Next for `design`/`web`).

Test status legend: `Nf/Mt` = N test files / M tests, run via each package's default deterministic `vitest` config. All 36 default suites PASS (5,192 tests total); 13 live-gated suites skipped (see `docs/migration-evidence/OLD-REPO-TEST-RECEIPTS.md`). Typecheck: `tsc --noEmit` 36/36 workspaces, 0 errors.

## Package matrix

Counts: REUSE 0 · ADAPT 1 · PORT 32 · REWRITE 1 · RETIRE 2 · unmapped 0.

| ID | Package | Tests (default suite) | Class | Authority owner | ZCode-equiv |
| --- | --- | --- | --- | --- | --- |
| MMP-01 | adapters | 7f/70t PASS | PORT | P2-W2 | NONE |
| MMP-02 | adversarial | 12f/61t PASS | PORT | P8-W2 (+P6-W3) | NONE |
| MMP-03 | agents | 11f/92t PASS | PORT | P3-W1 | PARTIAL (subagents/workflows) |
| MMP-04 | api | 6f/99t PASS | PORT | P7-W3 | PARTIAL (rpc/server transport) |
| MMP-05 | best-execution | 7f/81t PASS | PORT | P5-W1 | NONE |
| MMP-06 | campaigns | 8f/78t PASS | RETIRE | NONE — no canonical owner | NONE |
| MMP-07 | capabilities | 10f/111t PASS | PORT | P2-W1 | PARTIAL (tool registry/MCP) |
| MMP-08 | certification | 13f/154t PASS | PORT | P8-W1 + P8-W2 | NONE |
| MMP-09 | connectors | 11f/170t PASS | PORT | P2-W1 + P2-W2 | NONE |
| MMP-10 | design | 14f/218t PASS (jsdom) | ADAPT | P7-W1 | packages/ui (PAYSWAP-ADAPT) |
| MMP-11 | execution | 6f/41t PASS | PORT | P3-W2 | NONE |
| MMP-12 | interfaces | 5f/64t PASS | PORT | P2-W3 (+P3-W3 MCP) | PARTIAL (MCP surface) |
| MMP-13 | journeys | 15f/90t PASS | PORT | P8-W1 + P8-W2 | NONE |
| MMP-14 | lab | 11f/109t PASS | PORT | P6-W1 | PARTIAL (workflow-runtime/telemetry) |
| MMP-15 | merchant-checkout | 13f/170t PASS | PORT | P5-W3 | NONE |
| MMP-16 | merchant-crypto | 10f/191t PASS | PORT | P5-W3 | NONE |
| MMP-17 | mixed-rail | 8f/71t PASS | PORT | P5-W1 (+P6-W1) | NONE |
| MMP-18 | onchain-adapters | 9f/90t PASS; 3 live skipped | PORT | P4-W3 | NONE |
| MMP-19 | onchain-domain | 11f/145t PASS | PORT | P4-W1 | NONE |
| MMP-20 | onchain-opportunities | 10f/153t PASS | PORT | P6-W2 | NONE |
| MMP-21 | onchain-security | 11f/155t PASS | PORT | P4-W2 | NONE |
| MMP-22 | onchain-threat-intel | 14f/162t PASS | PORT | P6-W3 | NONE |
| MMP-23 | onchain-venues | 7f/61t PASS | PORT | P5-W2 | NONE |
| MMP-24 | operations | 11f/194t PASS | PORT | P8-W3 | PARTIAL (telemetry substrate) |
| MMP-25 | participation | 9f/74t PASS | RETIRE | NONE — no canonical owner | NONE |
| MMP-26 | payment | 8f/60t PASS | PORT | P2-W1 (+P5-W3) | NONE |
| MMP-27 | protocol | 20f/237t PASS | PORT | P1-W2 | NONE |
| MMP-28 | rails | 18f/620t PASS; 10 live skipped | PORT | P2-W2 | NONE |
| MMP-29 | recourse | 8f/65t PASS | PORT | P1-W2 | NONE |
| MMP-30 | route-compiler | 13f/165t PASS | PORT | P5-W1 | NONE |
| MMP-31 | security | 8f/72t PASS | PORT | P6-W3 (+P1-W3 epoch) | NONE |
| MMP-32 | settlement | 8f/53t PASS | PORT | P1-W2 | NONE |
| MMP-33 | surface | 3f/44t PASS | PORT | P2-W3 | PARTIAL (client/web/desktop/cli) |
| MMP-34 | trust | 6f/79t PASS | PORT | P1-W3 | PARTIAL (approval UX) |
| MMP-35 | ux | 14f/332t PASS | PORT | P7-W1 + P7-W3 | PARTIAL (command center/ui) |
| MMP-36 | web | 38f/561t PASS | REWRITE | P7-W1 | packages/web (KEEP substrate) |

## Rationale highlights

- **MMP-10 design (ADAPT):** presentation-only (own package law: no financial semantics, no business logic, no network calls; honest UNKNOWN states; emerald/amber accents, no indigo/blue primary). Exact old files for carry-in: `src/tokens.ts`, `src/tokens.css`, `src/tailwind-theme.css`, `src/components/*`, `src/hooks/*`, `src/utils/*` — adapted onto the ZCode-derived UI substrate (`packages/ui`, PAYSWAP-ADAPT).
- **MMP-36 web (REWRITE):** canonical UI law builds a NEW PaySwap web product on the ZCode Web substrate; the old app is content/IA evidence (honest-coverage explorer, non-custody messaging) with a green node-env test suite as behavioral oracle.
- **MMP-06 campaigns + MMP-25 participation (RETIRE, GAP-03):** no canonical Work Order in the P1–P8 catalog owns participation/campaign engineering; the canonical Policy & Governance Authority covers incentives at policy level only. Carrying them forward would create unowned parallel implementation — forbidden by the inventory-only law. Reclassification requires a Work Order/ADR.
- **MMP-27 protocol is the old authority kernel:** 32/36 old packages depend on it; it is the primary behavioral oracle (237 green tests) for the canonical P1-W2 Financial Protocol Authority, never a copy source.
- **MMP-28 rails:** the connector catalogue (Stripe, Adyen, Airwallex, dLocal, Ebanx, Flutterwave, PayPal, Paystack, Rapyd, Stellar, Thunes + mobile money + crypto JSON-RPC + ECB FX) is reference for canonical real-provider adapters (P2-W2); its 620 deterministic tests pass offline with injected transports — the live suites are credential-gated and were skipped (GAP-02).
- **PORT (32 packages) is the dominant classification** because the old repo is a contract/test library whose value is contract shape + test oracle; the canonical implementation is re-authored per phase under `spec/architecture/*` authority. PORT never authorizes copying.

## Dependency shape of the old repo (observed)

- Workspace: npm `packages/*`; every package `type: module`, exports `./src/index.ts` directly (no build step).
- Internal dependency spine: `@payswap/protocol` (32 dependents) → `@payswap/trust` (16) → `@payswap/connectors` (15) → `@payswap/capabilities` (12) → domain packages on top.
- External: `typescript` + `vitest` everywhere; React/Next/tailwind only in `design` and `web`.
- Full lockfile analysis: `docs/migration-evidence/DEPENDENCY-INVENTORY.md`.
