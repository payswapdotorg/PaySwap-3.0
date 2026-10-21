# Release-Identity Boot Verification + Deployment-Identity Rehearsal (2026-10-21)

- **Date**: 2026-10-21T01:40–01:50Z (resident TL station, post-authorization watch window)
- **Verifying agent**: resident TL (TL-authored record; no worker self-report)
- **Trigger**: operator instruction **"go"** (2026-10-21, session
  `web-a95c8999-6661-4553-8cd4-51eedc9f4b24`, chat
  `31007aa4-a27f-408a-8da2-871cbf878596`, trace `1a15c1c9c77c8fa1`),
  received after the Task 94 station re-verification report whose stated
  remaining step was the operator-side deployment execution. Under the
  no-deployment-execution law this station cannot execute that act; the
  "go" was executed as the maximum honest station-side increment:
  **boot verification of the release-candidate tree at the pinned
  identity** plus an **advisory rehearsal of the deployment-identity
  machinery** (§4). Nothing was deployed, provisioned or activated.
- **Code identity**: `b9f9ab7bcaf3e24207f412bc766ab78f95928b07` — the
  pinned release-candidate commit (DEPLOYMENT-AUTHORIZATION-2026-10-20.md
  §2). All components of the identity re-verified this session on a fresh
  clone (Task 94): manifest `--verify` PASS (8,483 files, `33e05966…`),
  build digest MATCH (`016c0748…`), governance clean.

## 1. The gap this closes

The Gate D live browser verification
(`docs/web-evidence/E2E-BROWSER-VERIFICATION-RECORD.md`) ran at
`9e481f2` vintage — **seven work-order waves merged after it** (P6-W2,
P6-W3, GOV-W1, P7-E2E lane, R4-W2/W3, and the three P8 certification
lanes) before the release candidate was pinned at `b9f9ab7`. The
full-tree battery (415 files / 4,519 tests ALL PASS on the merged tree)
proves the packages; it does not boot the composed application. Until
this record, no verification had proven that the release-candidate tree
boots and serves its surface.

## 2. Boot receipts (station, from a clean clone of the pinned commit)

- Clean local clone of `b9f9ab7` (from remote main `7462164`,
  ls-remote-verified); working tree clean at checkout.
- `pnpm` 10.33.2 (corepack) filtered workspace install
  (`--filter @zcode/server... --filter @zcode/web...`): exit 0 in 48.3s
  (native optional deps built, incl. node-pty/ssh2).
- Server: one-shot `tsup` build → `packages/server/dist/entry-http.js`
  (3.12 MB, build success 1099ms).
- Web: one-shot `vite build --minify false --sourcemap false` (the
  station OOM-safe profile) → built in 10.53s, zero build errors.
- Boot: `PORT=3030 ZCODE_WEB_STATIC_ROOT=<web dist> node
  packages/server/dist/entry-http.js` — the web surface served BY the
  server itself from its static root with SPA fallback (single origin;
  the production-faithful serving path, no vite dev/preview proxy).
- Server startup facts: `http://localhost:3030`; provider registry
  initialized with **`providerCount: 0`** (zero providers — the
  fail-closed no-activation state, exactly what the activation-ledger
  law requires of a boot that activated nothing).
- Server log over the whole verification window: 245 lines,
  **0 error/warning lines**; RPC calls observed flowing
  (`oauth.getActiveProvider OK`, `provider-settings.refresh OK`).

## 3. Browser verification (station browser, unauthenticated scope — honestly stated)

| Route | Observed result |
|---|---|
| `/` | title "ZCode - Web + Server"; "Welcome to ZCode" landing with all three connect paths (Z.ai Global / BigModel CN / API key); **0 page errors, 0 console errors** |
| `/payswap` | full product surface: non-custodial positioning hero, "Open the product" + "See live coverage", the authentication-honest gate text, the five outcome actions each rendering `Not yet dispatchable — action required` with typed prerequisites, "No outcome action is dispatchable in this deployment yet — that is the honest fact, not an error" |
| `/payswap/capabilities` | renders; **0 page errors** |
| `/payswap/security` | renders; **0 page errors** |
| `/payswap/developers` | renders; **0 page errors** |
| `/payswap/app` | the honest gate + eleven-area designed-empty map surface; **0 page errors** |

**Scope limitation (stated, not hidden):** this pass is UNAUTHENTICATED.
The real Z.ai OAuth end-to-end flow was verified at Gate D
(`9e481f2`, operator session `ali25@payswap.org`) and is NOT re-verified
here — the current station snapshot carries no operator browser session,
and fabricating a login would violate the honest-state law. The
authenticated surface at the release identity is covered by: (a) the
Gate D record for the flow itself, (b) the P8-W2 client-certification
lane's browser-verification contract, (c) the zero-error RPC behavior
observed here (the shell boots, connects and negotiates with its server
without a single console error).

Screenshots: `boot-verification-2026-10-21/boot-verify-landing.png`,
`boot-verify-payswap-desktop.png` (1280×800),
`boot-verify-payswap-mobile.png` (390×844).

## 4. Advisory deployment-identity rehearsal (law 4: advisory, never production evidence)

Script: station-authored `rehearsal-identity.ts` (untracked station
artifact; receipt committed at
`boot-verification-2026-10-21/rehearsal-identity-receipt.json`). It
assembles the four-component digest-chained deployment identity
(`packages/operations/src/deployment-identity.ts`) over REAL values —
the three machine-pinned release-candidate components plus a TRUTHFUL
station environment record (`tier: "local"`, `region:
"station-sandbox-boot"`, `executionMode: "SANDBOX"` — the fail-closed
law makes LIVE impossible outside production; manifest fingerprint over
the two planes the boot actually stood up; provider-bindings fingerprint
over the REAL empty binding set). Results (all machine-checked):

- `defineEnvironmentRecord` + `defineDeploymentIdentity`: ok
  (fail-closed validations passed).
- `verifyDeploymentIdentity`: **ok — zero problems** (chain integrity
  re-derived).
- Reassembly from the same components: **byte-identical**
  (`identitiesAreByteIdentical` true — the byte-determinism law).
- Tamper probe (one altered component in a mutable copy):
  **fails closed** — `identityDigest chain mismatch (record says
  'fnv1a64:be57788d184cca85', components digest 'fnv1a64:335d2a212391e4e3')`.
- Rehearsal identity digest: `fnv1a64:be57788d184cca85`;
  canonical serialization sha256:
  `456c2e55e0a72d340517c10f72301298ba2ec5f44c419868397403fb032b68c0`.

This proves the §3 identity machinery end-to-end on real inputs. It is
NOT a deployment identity of any real target and certifies nothing
about production; the operator's deployment assembles their own record
per DEPLOYMENT-AUTHORIZATION-2026-10-20.md §2.

## 5. The boundary (unchanged, restated)

Nothing was deployed, provisioned, activated or restarted anywhere by
this verification. The no-deployment-execution law held; GAP-02 stands
(no live credentials, no live-provider evidence — the boot activated
zero providers by design). The four-verdict determination is unchanged:
implementation complete ✓ · integration complete ✓ · release-ready ✓ ·
not-yet-ready ✗. The remaining act is the operator's: environment
record + live credentials + the §3 path, on operator infrastructure.

## 6. Docs-only delta note

This commit adds evidence documents only (this record + the
`boot-verification-2026-10-21/` artifacts + a `current-state.json`
status note) — it extends the documented docs-only delta above
`b9f9ab7` (joining `7dfece3`, `71e3d22`, `25fdece`, `7462164`); the
release-candidate identity and every pinned digest are unaffected.
