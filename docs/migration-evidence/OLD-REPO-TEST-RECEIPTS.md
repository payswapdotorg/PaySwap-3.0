# Old-Repo Test Receipts (P0-W3)

Old repository: `payswapdotorg/payswap.org` @ `8a735bf1639198c43115087a2992555166a9acf9`, cloned read-only to `/home/z/my-project/payswap-org-ref`, dependencies installed with `npm ci` (package-lock v3, 681 lockfile entries).

## Discovery

- 36 workspace packages (`packages/*`), each with a default deterministic `vitest` config (`environment: node`, includes `test/**/*.test.ts`, excludes `test/live/**` where present).
- Test files discovered: **406** (369 `*.test.ts` + 37 `*.test.tsx`), of which **13 are live-gated** (see Skipped).
- External test tooling: `vitest` ^3.2.4 everywhere; `jsdom` + React Testing Library only in `design`; the `web` suite runs in node environment with `next/link` / `next/navigation` stubs.
- Every default suite completes in seconds (max 26.2 s); all are "runnable cheaply" per the Work Order.

## Run receipts (default deterministic suites, all PASS)

`npx vitest run --reporter=basic` per package; `f` = test files, `t` = tests.

| Package | Files | Tests | Elapsed |
| --- | --- | --- | --- |
| protocol | 20 | 237 | ~4.9 s |
| payment | 8 | 60 | ~2.6 s |
| settlement | 8 | 53 | ~3.2 s |
| trust | 6 | 79 | ~2.2 s |
| capabilities | 10 | 111 | ~3.2 s |
| connectors | 11 | 170 | ~3.8 s |
| execution | 6 | 41 | ~2.6 s |
| agents | 11 | 92 | ~3.5 s |
| lab | 11 | 109 | ~3.9 s |
| mixed-rail | 8 | 71 | ~4.2 s |
| route-compiler | 13 | 165 | ~6.5 s |
| best-execution | 7 | 81 | ~3.4 s |
| onchain-domain | 11 | 145 | ~4.0 s |
| onchain-security | 11 | 155 | ~3.8 s |
| onchain-adapters | 9 | 90 | ~4.2 s |
| onchain-opportunities | 10 | 153 | ~4.3 s |
| onchain-venues | 7 | 61 | ~3.6 s |
| onchain-threat-intel | 14 | 162 | ~4.5 s |
| merchant-crypto | 10 | 191 | ~3.6 s |
| merchant-checkout | 13 | 170 | ~6.7 s |
| surface | 3 | 44 | ~2.1 s |
| adapters | 7 | 70 | ~3.1 s |
| recourse | 8 | 65 | ~3.5 s |
| security | 8 | 72 | ~3.0 s |
| api | 6 | 99 | ~2.5 s |
| interfaces | 5 | 64 | ~1.9 s |
| participation | 9 | 74 | ~3.2 s |
| campaigns | 8 | 78 | ~2.9 s |
| operations | 11 | 194 | ~6.9 s |
| certification | 13 | 154 | ~12.1 s |
| journeys | 15 | 90 | ~9.6 s |
| adversarial | 12 | 61 | ~11.9 s |
| rails | 18 | 620 | ~6.9 s |
| design | 14 | 218 | ~10.9 s (jsdom) |
| ux | 14 | 332 | ~5.7 s |
| web | 38 | 561 | ~26.2 s (node env, next stubs) |
| **Total** | **393** | **5,192** | — |

**Result: 393/393 default test files PASS, 5,192/5,192 tests PASS, 0 failures, 0 skipped-in-runner.**

## Typecheck receipt

```text
$ npm run typecheck --workspaces --if-present   (tsc --noEmit × 36 workspaces)
0 TypeScript errors ("error TS|Failed" match count = 0)
```

## Skipped suites (13 files, with reasons)

| Suite | Files | Why skipped |
| --- | --- | --- |
| `rails/test/live/*.live.test.ts` | 10 (stripe, flutterwave, paystack, paypal-direct, stellar, crypto, fx-source, credential-gated-rails, wave2-global-reach, wave2-provider-neutral) | Credential- and network-gated by the old repo's own default config (`exclude: test/live/**`); run explicitly via `npm run test:live` with real provider credentials, which do not exist in this environment. Secrets must never enter context/logs/artifacts. |
| `onchain-adapters/test/live/{evm,solana,utxo}.live.test.ts` | 3 | Public-RPC network-dependent read-only suites, excluded by the package's own default config; would hit live chain endpoints. |

Nothing else was skipped: every default suite was run and passed. No expensive suite was hidden behind the live gate — the deterministic suites cover the full contract surface with injected transports/fixtures (per the packages' own config comments).

## Honest observations

- The old repo's test discipline is unusually strong: deterministic offline-by-default configs, live tests explicitly quarantined with their own configs, adversarial fault-injection suites, and journey-composition suites that compose all subsystems.
- `web`'s suite asserts server-rendered markup through stubs; the package's own comments state navigation is exercised only in real browser deployment — a known, self-declared limitation of that suite (not a PaySwap 3.0 claim).
- Test counts are as reported by vitest at the pinned commit with `npm ci`-installed lockfile dependencies; no test was modified.
