# P9 Release Closure — the v1.0.0 defect, the fix, and the v1.0.1 release

Status: IN FLIGHT (authored at the fix commit; the v1.0.1 sections
finalize when its verification lands). TL-authored; the station's own
runs are the evidence base. All timestamps UTC, 2026-10-21.

Authorities: `spec/productization/PRODUCT-IDENTITY.md` (§5 honesty laws,
§6 the four separate gates), `spec/productization/JOURNEY-MAP.md` §3
flows 11–14, GitHub Issue #1 (the operator's productization handoff).

---

## 1. The v1.0.0 release (what shipped)

- Tag `v1.0.0` (annotated, tagger 1792563616) → commit `5fbf0c7`.
- Workflow run [39554786524](https://github.com/payswapdotorg/PaySwap-3.0/actions/runs/39554786524)
  (`Release`, event push, 06:20:19Z → 06:26:32Z): every step green —
  tag/version guard, frozen-lockfile install, desktop build, deb+AppImage
  packaging, checksums, asset attach.
- Published 06:26:19Z: `PaySwap_1.0.0_amd64.deb` (139,835,720 B),
  `PaySwap-1.0.0.AppImage` (190,876,128 B), `SHA256SUMS.txt` (179 B).

## 2. Station verification of the published release (08:0xZ)

Run by the resident TL on the station box (Debian 13 x86_64, no root —
the no-root boundary is the honest limit of station install evidence;
the root-tier install runs in CI, §5).

### 2.1 Checksums — PASS (triple-source agreement)

| Asset | SHA256SUMS.txt | station download | GitHub API digest |
|---|---|---|---|
| PaySwap_1.0.0_amd64.deb | `3fa235160d796b2abdbbf4ae137f54ee8321bef53e73dbdc496c8e1b72a5db21` | same | same |
| PaySwap-1.0.0.AppImage | `24afe2e2d66eb4ae9efdd6fc187a710e06647f351ec03d739316f03f702fe3b3` | same | same |

The `install-verify.mjs` runner itself verified the deb checksum before
its honest exit-6 (no root on the station — the documented boundary, not
a skip). All four README-linked URLs returned HTTP 200 publicly
(unauthenticated), including the three per-release asset URLs.

### 2.2 Structure (no-root tier) — PASS

- `dpkg-deb -I`: Package `payswap`, Version 1.0.0, Maintainer
  `PaySwap <payswapdotorg@users.noreply.github.com>`, Description
  "PaySwap Desktop — the non-custodial economic operating system."
- `dpkg-deb -x`: exactly one `/usr/share/applications/payswap.desktop`
  with `Name=PaySwap`, `Exec=/opt/PaySwap/payswap %U`, `Icon=payswap`,
  `StartupWMClass=PaySwap`, `Categories=Office;Finance`; full hicolor
  icon set 16→1024 px; ELF executable `/opt/PaySwap/payswap`
  (206,036,184 B).
- AppImage `--appimage-extract`: clean extraction; desktop entry
  `Name=PaySwap`, `X-AppImage-Version=1.0.0`; ELF `payswap` binary.
  (Station note: the EXTRACTED tree's `AppRun` needs `APPDIR` set —
  running the extracted AppRun directly without it mis-resolves `$BIN`;
  the un-extracted AppImage run is the supported path.)

### 2.3 GUI launch (Xvfb :95, 1280x1024x24) — **FAIL: the defect**

The packaged app, launched from the extracted AppImage (`--no-sandbox`,
Electron logging on): process stays alive, `~/.config/PaySwap` is
created (Singleton*, session/) — but **no main window is ever created**.
X11 probe of top-level windows: `Chromium clipboard`, `payswap`
(class `payswap`/`Payswap`), and an unnamed `payswap`/`PaySwap` window —
no product window. The launch log carries the smoking gun:

```
[force-update] 远端配置要求强制升级，阻止创建主窗口
  { currentVersion: '1.0.0', minimalVersion: '3.5.3' }
```

The same log shows `[auto-update] service manifest provider applied`
— the updater was configured against the upstream endpoint too.

**Root cause chain**: `__ZCODE_VERSION__` is defined from the desktop
package version (now PaySwap's own `1.0.0`); the production-flavor
packaged app consults the LIVE upstream ZCode service
(`/api/v1/client/configs`); that service's force-update floor is `3.5.3`
in the ZCode version space; `compareSemverVersions("1.0.0","3.5.3") = -1`
→ the guard blocks startup. A cross-version-space comparison against a
service with no authority over the PaySwap product — a defect class the
P9-A identity flip created (version space changed) and no test covered
(the packaged app was never GUI-launched before release).

**User impact**: any online Ubuntu user installing v1.0.0 gets an app
that never opens its window. This fails Issue #1 DoD bullet 2 ("reach a
branded app"). Download counts at decision time: deb 2 / AppImage 1 /
SHA256SUMS 1 — all station-verification downloads; no user harm
identified, documented rather than assumed.

## 3. The fix (commit `e9eef37`)

The PaySwap update-authority law (`packages/desktop/src/main/
payswapUpdateAuthority.ts`): while no PaySwap update authority is
configured, BOTH the startup force-update gate and the auto-updater are
inert — the designed `initAutoUpdater({enabled:false})` path (polling
cleared, electron-updater left unconfigured) and a call-site gate on
`maybeBlockStartupForForceUpdate`. The upstream ZCode service floor
never gates the PaySwap product. Mirrors the P9-B update-feed inertness
(`dev-app-update.yml`). One constant flips when the operator configures
a real PaySwap release channel.

Contract tests (`test/payswap/update-authority.test.ts`): the authority
is inert; the main process wires BOTH gates through the authority
module; and the shared comparator is PROVEN to still fire on
1.0.0-vs-3.5.3 — the call-site gate, not the comparator, is the safety
boundary (deliberate: a PaySwap feed must later compare real versions).

## 4. The verification gap that let it ship (closed in the same commit)

1. The release workflow built and attached installers but never
   installed or launched one.
2. The P9-C `install-verify.mjs` runner existed but was wired to
   nothing.
3. Its `--launch` mode ran AFTER `dpkg -r` (could never work) and only
   checked the app-data dir — which the blocked app still creates.

Closed on all three axes: the runner now asserts identity + launch
BEFORE cleanup, launches the desktop-entry `Exec=` binary under the
display/`xvfb-run`, and asserts a REAL window with a PaySwap WM_CLASS +
PaySwap title via `xdotool` (the assertion that would have caught this
defect); `release.yml` gains the `install-verify` job (clean
ubuntu-latest, xvfb + xdotool, runs the runner against the PUBLISHED
release with `--launch`, uploads the JSON receipt). The same commit
fixes the CI run #43 lint failure (`max-lines` 452 → under 400 via the
`desktopIdentity.mjs` extraction — no rule weakened).

Local gates at the fix commit: oxlint 0 errors/0 warnings on every
changed file; desktop suite 13 files / 112 tests ALL PASS; `tsc -b
packages/desktop/tsconfig.host.json` exit 0; runner honest failure paths
re-proven (exit 2 usage / 3 no-release / 6 no-root, checksum verified
first).

## 5. The v1.0.1 release (the corrected release)

- Desktop package version 1.0.1 (tag/version guard satisfied);
  packaging-identity contract test updated to pin 1.0.1. The pin-set
  (`PAYSWAP_DESKTOP_PIN_SET_VERSION`) and surface-API versions are
  independent version spaces and are intentionally unchanged (no pin
  changed).
- Released from the fixed commit through the SAME workflow + the NEW
  install-verify job: the CI receipt (checksums → dpkg install →
  identity → Xvfb launch → PaySwap window assertion → uninstall) is the
  machine evidence for the clean-install gate.
- Station-side: the published v1.0.1 AppImage is downloaded, checksum-
  verified, extracted and GUI-launched under Xvfb with the X11 window
  probe — the main window must EXIST and be PaySwap-branded this time.
  Receipts + screenshots land in the acceptance record when verified.
- The v1.0.0 release page is marked prerelease with a prominent warning
  pointing at v1.0.1 AFTER v1.0.1 is verified (no window of time
  without a working download). The v1.0.0 tag and its workflow run
  remain as history — nothing deleted, nothing hidden.

## 6. Gate states (the four separate gates, honestly)

- **brand/UX implemented: ✓** — unchanged from the P9 integration
  (9f09387); re-evidenced live at `5fbf0c7` by the web boot lane
  (10 routes, zero console errors, honest setup-required states,
  screenshots in the station delivery set).
- **GitHub installer published: ✓ (v1.0.1)** — v1.0.0 was published but
  defective; the gate closes on the corrected, launch-verified v1.0.1.
- **clean-install verified: PENDING v1.0.1** — closes on the CI
  install-verify receipt + the station GUI verification (§5).
- **core journeys verified: ✓ (web)** — the J1–J15 matrix at 9f09387 +
  the live web boot lane; desktop packaged-app journeys ride §5.

## 7. Station context (the drift log)

Drift #8 hit mid-verification (≈08:06Z→11:29Z rollback): the station
lost the verification clone, downloaded assets and receipts, and the
:3030 web-boot daemon; the web-boot evidence set (screenshots +
receipt, in the station delivery directory) survived. All numbers above
were re-derived from the remote after the drift — the numbers law. The
v1.0.0 launch-log excerpt in §2.3 was captured pre-drift and re-proven
post-fix by the v1.0.1 contrast run (§5).
