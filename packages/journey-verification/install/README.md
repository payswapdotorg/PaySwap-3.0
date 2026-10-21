# Install-verification flow (PaySwap journey acceptance — flows 11–14)

This directory scripts + documents the INSTALL half of the journey
acceptance map (`spec/productization/JOURNEY-MAP.md` §3, flows 11–14).
It is **not** a GitHub workflow by design: the work order routes it as
the verification the TL/CI performs against the **PUBLISHED release**
(the P9-B gate's output), tied to an exact release tag.

## The runner

```
node packages/journey-verification/install/install-verify.mjs \
  --repo <owner/name> --tag <tag|latest> \
  [--workdir <dir>] [--keep] [--skip-appimage] [--launch]
```

What it does, in order (every step is asserted — a skip is a failure,
never a pass):

1. **Release JSON** — fetches `${GITHUB_API_URL}/repos/<repo>/releases/tags/<tag>`
   (or `/releases/latest` for `--tag latest`); `GITHUB_TOKEN` is used
   when present.
2. **Assets** — locates the `.deb`, the `SHA256SUMS` asset and (when
   published) the `.AppImage`.
3. **Downloads + checksums** — downloads each asset and verifies its
   SHA-256 against `SHA256SUMS`. A missing `SHA256SUMS` entry for a
   downloaded asset is a FAILURE (flow 11: "checksum verify" is
   mandatory).
4. **Install** — `dpkg -i` (as root, or via passwordless `sudo -n`;
   neither available → explicit environment failure, never a silent
   skip).
5. **Identity assertions** (PRODUCT-IDENTITY.md §1 owned by Lane P9-B;
   implemented in `desktopIdentity.mjs`):
   - exactly one `/usr/share/applications/*.desktop` with `Name=PaySwap`;
   - the `Icon=` target resolves on disk;
   - the `Exec=` binary exists and is executable;
   - `dpkg -s payswap` reports `install ok installed`;
   - the package file list ships the desktop entry;
   - the app-data path PATTERN: the shipped executable is `payswap`, so
     electron's productName-derived userData default is
     `~/.config/PaySwap` — asserted at runtime under `--launch`.
6. **Launch verification** (`--launch` only; runs BEFORE cleanup, while
   the package is installed): launches the desktop-entry `Exec=` binary
   (directly under a display, or wrapped in `xvfb-run` when available),
   asserts `~/.config/PaySwap` appears, and asserts a real PaySwap
   window exists — `xdotool` polls for a window with a PaySwap WM_CLASS
   and a PaySwap title. This window assertion is the v1.0.0 lesson: the
   broken release created its app-data dir but never a main window
   (the force-update block), so a data-dir check alone proved nothing.
   Without `xdotool` the window identity is recorded as NOT ASSERTED —
   never fabricated.
7. **Cleanup** — `dpkg -r payswap` (always attempted, including on
   failure paths, unless `--keep`).
8. **AppImage** (when published): ELF magic (structure), SHA-256
   (checksum), executable bit (set + recorded as a finding when the
   publisher shipped it without).
9. **Receipt** — `install-verify-receipt.json` in the workdir with the
   release identity, per-asset checksums, the assertion list, observed
   windows and the verdict (`PASS` / `FAIL`). This is the evidence
   `docs/customer-journeys/JOURNEY-ACCEPTANCE-RECORD.md` cites for the
   clean-install gate.

## Flow 13 — upgrade/uninstall

`install-verify.mjs` verifies the fresh-install + uninstall half
(`dpkg -i` → assertions → `dpkg -r`). The upgrade half (install over an
existing version) is a release-operator step: run the runner once at
`v(n-1)` with `--keep`, then again at `v(n)` (the second `dpkg -i`
upgrades in place), then `dpkg -r`. The two receipts together are the
upgrade/uninstall evidence.

## Flow 14 — release-page

The release-page check (README links resolve to the real release
assets) is a documentation check on the repository README — owned by
Lane P9-B's release PR. The runner's receipt pins the asset names +
sizes + checksums the README must link; the TL verifies the links
against the receipt at release acceptance.

## Honest failure modes (exit codes)

| Exit | Meaning |
|---|---|
| 0 | PASS — every assertion held, receipt written |
| 2 | usage / environment error (bad args, API unreachable) |
| 3 | **no release exists** for the tag — the clean explicit error: the P9-B "GitHub installer published" gate has not shipped a release; nothing was verified and nothing was fabricated |
| 4 | release exists but the `.deb` / `SHA256SUMS` assets are missing |
| 5 | checksum verification failed |
| 6 | install environment unusable (no dpkg, no root/sudo) |
| 7 | identity assertion failed (desktop entry / icon / binary / package) |
| 8 | AppImage structural checks failed |
| 9 | `--launch` requested but no display / `xvfb-run` available |

## The launch-verification boundary (documented)

GUI launch verification (PaySwap-branded window + the
`~/.config/PaySwap` app-data path appearing after first launch) needs a
display. The runner performs it only when `--launch` is passed AND the
environment supports it (a `DISPLAY`/`WAYLAND_DISPLAY`, or `xvfb-run`
on PATH). On headless CI without xvfb it exits 9 with the explicit
message rather than pretending. The no-provider launch state (truthful
empty surfaces after first launch) is additionally covered by the
browser tier of this suite once the desktop renderer ships the same
surfaces — the browser evidence stands in for the visual half on
headless hosts.

## Current status

**v1.0.0 is published** (the P9-B gate's first release; 2026-10-21). The
station's own run of this runner against it verified the checksums and
then found the **v1.0.0 launch-blocking defect** (the upstream ZCode
force-update floor gating PaySwap 1.0.0 — see
`docs/productization-evidence/P9-RELEASE-CLOSURE-2026-10-21.md`): the
GUI-launch half of this runner and the CI `install-verify` job in
`release.yml` were added as the direct response, so no future release can
ship without a real install + launch + window-identity receipt.

Historical note (kept for the record): at the P9-C lane base `e6ed008`
no release existed and the runner honestly exited 3 — the no-release
failure mode is still the documented behavior for any tag without a
published release.
