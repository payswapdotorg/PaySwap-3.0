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
5. **Identity assertions** (PRODUCT-IDENTITY.md §1 owned by Lane P9-B):
   - exactly one `/usr/share/applications/*.desktop` with `Name=PaySwap`;
   - the `Icon=` target resolves on disk;
   - the `Exec=` binary exists and is executable;
   - `dpkg -s payswap` reports `install ok installed`;
   - the package file list ships the desktop entry;
   - the app-data path PATTERN: the shipped executable is `payswap`, so
     electron's productName-derived userData default is
     `~/.config/PaySwap` — asserted at runtime only under `--launch`.
6. **Cleanup** — `dpkg -r payswap` (always attempted, including on
   failure paths, unless `--keep`).
7. **AppImage** (when published): ELF magic (structure), SHA-256
   (checksum), executable bit (set + recorded as a finding when the
   publisher shipped it without). Run-verification only under `--launch`.
8. **Receipt** — `install-verify-receipt.json` in the workdir with the
   release identity, per-asset checksums, the assertion list and the
   verdict (`PASS` / `FAIL`). This is the evidence
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

## Current status at the P9-C lane base

**No release exists yet** (verified at the lane base `e6ed008`: zero
GitHub releases — the TL's Phase 9 register findings). Running the
runner against any tag therefore exits 3 with the clean explicit error
— which is exactly the honest state: the clean-install gate
(PRODUCT-IDENTITY §6, "clean-install verified") is one of the four
SEPARATE gates and closes only on its own evidence at release time.
