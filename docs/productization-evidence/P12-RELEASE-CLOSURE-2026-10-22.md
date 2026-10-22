# P12 Release Closure — Issue #2 (the desktop experience wave) — 2026-10-22

The release-blocking handoff: PaySwap v1.2.0 shipped green checks but
failed the operator's actual desktop experience — a dead-screen startup
failure mode, a frameless Linux window without working controls, cropped
marketing content, and a "website squeezed into Electron" IA. This wave
fixed, verified and released.

## The lanes (registered at 181d670)

- **P12-A (Lane A)** — startup transport cause taxonomy + recovery
  (6be5c18): the 8-category startupFailure taxonomy with
  workerExitCode/systemCode/migrationPreserved carried in state,
  telemetry and the copy-diagnostics payload; transient transport
  classes (timeout/reset/closed-mid-start) now retryable through the
  renderer's retry admission; exactly-once settling under concurrent
  worker exits; database-file classification decides migration-safe vs
  corruption paths — recovery never requires deleting user data.
- **P12-B (Lane B)** — Linux native window frame + the viewport/scroll
  contract (0dc9615): Linux windows created with exactly `{frame: true}`
  (no transparency, no shadow suppression — the WM provides
  decorations, resize, drag, close/min/max/restore); darwin/win32
  byte-identical; the substrate's `body/#root` scroll trap unlocked for
  marketing surfaces via the `:has(.ps-product-root)` contract; `/app/*`
  and the Agent Workspace bounded as 100dvh shells with internal scroll.
- **P12-C (Lane C)** — the PaySwap-first IA + journey reconciliation
  (43912d2 + 2e8a212 + aeab9e4): FEATURE-MAP.md (the capability survey
  from actual code reads — every family mapped to real
  route/component/service with honest operational states); the typed
  payments action set on `/app/payments`; the onchain rail on
  `/app/connections` (+ the accounts observation anchor); the PSP
  connection setup flow; the advanced developer workspace entry from
  `/developers` (honestly labeled, SPA); J16–J19 in the journey map +
  manifest + four `@contract` specs under the no-orphans law.
  (Execution note: the Lane C subagent dispatch returned a
  context-deadline failure but HAD run — the TL audited the zombie
  lane's committed work, corrected its one real defect — an invented
  `EXECUTION` operation class replaced by the real provider-runtime
  literals — and completed the C6/C7 remainder.)

## TL integration (732da13 + the journey-gate fixes)

Lanes merged clean (disjoint file scopes by design). Batteries on the
integrated tree: desktop 18 files / 179 tests, app 27 files / 287
tests, root `tsc -b` 0, journey-verification typecheck 0, lints 0
errors. The full Playwright journey suite (served production web
build): **77 passed / 1 skipped / 0 failed** — including the 12 new
J16–J19 `@contract` tests gating at integration, the reconciled J14
settings copy, and the no-orphans law updated to the J19 map.

## The packaged-RC verification (the Issue #2 acceptance)

Station: Xvfb + a purpose-built minimal ICCCM window manager (the
window-management layer the native frame relies on), against the
production-identity `PaySwap_1.3.0_amd64.deb` payload. Full record:
`delivery/p12-rc-verification/VERIFICATION-RECORD.md` (receipt JSON +
12 screenshots + run logs). Headlines:

- **Startup**: window + rendered content in ~2.5 s; boots to ready on
  fresh install, after clean close, and after SIGKILL — durable state
  preserved, no dead screen, no lock-out.
- **Window controls (protocol-level)**: `WM_CLASS` `('payswap',
  'PaySwap')`; `_NET_WM_WINDOW_TYPE_NORMAL`; `_MOTIF_WM_HINTS`
  decorations = ALL (the native-frame request — v1.2.0's frameless
  defect's opposite); `WM_DELETE_WINDOW` honored with exit code 0;
  WM-driven resizes at 1280×800, 1440×900, 1024×768, 800×600,
  1920×1080 with content reflow at every size.
- **Scrolling**: the home page keyboard-scrolls with a byte-identical
  top→bottom→top round trip (a real document scroll, not rendering
  noise); the VLM-verified bottom shows the full footer with the ZCode
  attribution, nothing clipped — the v1.2.0 home-crop defect fixed.
  The `/app` bounded shell navigates via keyboard (Tab+Enter → "App —
  PaySwap" per-route title) with internal scroll.
- **IA**: the VLM-verified `/app` shell renders the eleven-area
  navigation + the honest authentication gate; the payments area
  carries the typed action set (J16); onchain + PSP surfaces on
  connections (J17/J18).
- **Honest limitations**: XTEST pointer clicks did not register under
  the minimal WM (keyboard is the verified input path; pointer +
  window-identity are additionally covered by the CI install-verify
  receipt on a clean runner and the Playwright suite on the web
  build); the drag interaction is the WM's with a native frame
  (movability proven — the window is a normal managed toplevel).

## Build finding (recorded)

A local build must export `ZCODE_ENV=production` for BOTH the bundle
build and the packaging steps — the product flavor is baked at the
tsup step from the builtin provider config's environment. The CI
release job sets it at job level (consistent); a first local RC was
rebuilt after this was caught (Preview runtime identity inside
production packaging — never shipped, never published).

## Governance (recorded debt)

The module-ownership report regenerates with 13 violations (base 7):
the +6 are Lane C's mirror TESTS importing onchain/provider-runtime
sources relatively (3 R6 + 3 R3 platform→rails/domain from
`onchain-pins-mirror.test.ts`, 1 R6 provider-connection pins) — the
same test-only mirror pattern the base already records for
surface/provider-runtime. The app's `src/**` still imports no onchain
package (the substrate-layer law holds).

## The release

- Version 1.3.0 (desktop package + packaging-identity law test; the
  pin-set version honestly stays 1.2.0 — no desktop pin changed).
- Tag `v1.3.0` → CI builds the release artifacts with job-level
  `ZCODE_ENV=production` and runs the install + launch +
  window-identity receipt on a clean Ubuntu runner.
- README current-release links move to v1.3.0 with the receipt.
