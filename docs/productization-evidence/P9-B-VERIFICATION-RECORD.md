# P9-B Verification Record — downloadable/installable GitHub distribution

- **Work order**: `delivery/packets/pkt_p9-b.md` (Task ID 96-b). Lane
  history: the first subagent session died mid-flight after landing the
  identity/builder/workflow/docs work as uncommitted changes; the TL
  verified every file against the packet, completed the build + battery
  + this record (salvage completion, the P6-W1 precedent).
- **Lane worktree**: `/home/z/lanes/p9-b`, branch `work/p9-b`, base
  `e6ed008`.
- **Contracts**: `spec/productization/PRODUCT-IDENTITY.md` §1 (identity
  values), §6 (the installer-published gate).

## 1. Identity flip (packaging side) — receipts

| Field | Old | New (canonical) |
|---|---|---|
| desktop package name | `@zcode/desktop` | `@payswap/desktop` |
| productName | `ZCode` | `PaySwap` |
| description | `ZCode Desktop App` | `PaySwap Desktop — the non-custodial economic operating system.` |
| author | `ZCode` | `PaySwap` |
| version | (root 3.14.3 inherited) | `1.0.0` (desktop-own semver; root stays the upstream pin) |
| appId | `dev.zcode.app` | `org.payswap.PaySwap` |
| preview identity | `ZCode Preview`/`dev.zcode.app.preview`/`zcode-preview` | `PaySwap Preview`/`org.payswap.PaySwap.preview`/`payswap-preview` |
| linux executable/package | `zcode` | `payswap` |
| homepage/maintainer | `zcode.z.ai`/`dev@zcode.z.ai` | `github.com/payswapdotorg/PaySwap-3.0`/`payswapdotorg@users.noreply.github.com` |
| appVersion source | root package.json (3.14.3) | desktop package.json (1.0.0) — build-metadata.mjs re-pointed |

Root-script rename fallout (`@zcode/desktop`→`@payswap/desktop`
filters): root `package.json` (5 scripts), `scripts/dev-desktop-env.mjs`
(2), `scripts/dev-desktop-remote-prod.mjs` (1) — complete grep-verified
list; no other root references remain.

## 2. Icons

`packages/desktop/scripts/generate-payswap-icons.mjs` — deterministic
pure-Node generator (zlib only, SDF-supersampled, no network/native
libs): the canonical PaySwap mark (emerald-gradient rounded tile + the
original swap glyph) → every raster in `build/` (icon.png/icns/ico,
installer variants, the full hicolor set 16→1024, DMG backgrounds).
Re-runnable byte-identically (`pnpm --filter @payswap/desktop run icons`).

## 3. Linux targets — the REAL build receipts (this lane, Debian 13 x86_64 box)

- Full desktop production build (runtime assets + tsup + vite): exit 0.
- `electron-builder --config electron-builder.config.js --linux deb appimage --publish never`:
  exit 0. Targets reduced honestly to **deb + AppImage** (rpm/pacman
  removed — no acceptance evidence for them; comment documents the
  discipline).
- **Artifacts** (packages/desktop/dist/):
  - `PaySwap_1.0.0_amd64.deb` — 143,414,460 bytes — SHA-256 `8cd92ba1ecbc4d782c55caace6f5cdfa55fda80f5fe5a30438dca7fa5d91f6d6`
  - `PaySwap-1.0.0.AppImage` — 192,689,678 bytes — SHA-256 `35a98c3ffb1c97f11ff62daf08131d3e29f52163408d245e535bfd3f79ea5c5b`
- **Install verification (no-root tier — this box has no sudo; the
  root-tier `apt install` is the CI job's evidence)**:
  - `dpkg-deb -I`: Package `payswap`, Version `1.0.0`, Maintainer
    `PaySwap <payswapdotorg@users.noreply.github.com>`, Homepage the
    GitHub repo, Depends = the correct Electron runtime set
    (libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils,
    libatspi2.0-0, libuuid1, libsecret-1-0), Description canonical.
  - `dpkg-deb -x`: `/opt/PaySwap/payswap` (ELF x86-64, executable,
    206MB), `usr/share/applications/*.desktop` → **Name=PaySwap,
    Exec=/opt/PaySwap/payswap, Icon=payswap,
    StartupWMClass=PaySwap, Categories=Office;Finance**, full
    `usr/share/icons/hicolor/{16..1024}/apps/payswap.png` set, payload
    `app.asar` + unpacked natives + LICENSEs/THIRD-PARTY-NOTICES.
  - AppImage `--appimage-extract`: desktop entry Name=PaySwap,
    X-AppImage-Version=1.0.0, AppRun present, executable bit set.
  - Honest note: `MimeType=x-scheme-handler/zcode;` — the deep-link
    scheme stays `zcode` (internal identifier class, same law as
    storage keys; renaming it breaks existing links for no user gain).
  - GUI LAUNCH was not executed on this headless box — that evidence
    belongs to the CI install job / Lane C flows.

## 4. The release workflow (CI builds from clean source)

`.github/workflows/release.yml`: tag `v*` + manual dispatch; ubuntu-latest;
pnpm 10.33.2 + node 24 (cache); **tag-vs-version guard** (the tag must
equal the desktop product version); `pnpm install --frozen-lockfile`;
`pnpm --filter @payswap/desktop build`; `pack:linux`
(electron-builder with `--config` explicit — the ESM-config discovery
trap documented); `SHA256SUMS.txt` over the real artifacts;
upload-artifact + softprops/action-gh-release attaching
`PaySwap_<v>_amd64.deb`, `PaySwap-<v>.AppImage`, `SHA256SUMS.txt` with
`fail_on_unmatched_files`, provenance body (tag/commit/run URL/build
recipe/signing honesty). No secrets (default GITHUB_TOKEN,
contents:write). YAML validated (parses; jobs: desktop-linux).

## 5. README + installation docs

README "Download PaySwap for Ubuntu" section at the top: releases-page
link + the per-release asset URL pattern + **the honest status note**
(first release in preparation — NO dead asset links), GUI + `sudo apt
install ./PaySwap_1.0.0_amd64.deb` instructions, AppImage (chmod +
FUSE note), verification (`sha256sum -c`). `docs/installation/README.md`:
the full guide (requirements, install, launch, upgrade, uninstall,
troubleshooting, checksum verification, source-build as the secondary
developer path).

## 6. Battery

| Step | Result |
|---|---|
| `pnpm install --filter @payswap/desktop...` | exit 0 |
| Desktop suite (`pnpm --filter @payswap/desktop test`) | **11 files / 96 tests PASS** (85 base + 11 net-new packaging-identity contract tests) |
| Full production build | exit 0 |
| electron-builder deb+AppImage | exit 0 — real artifacts (§3) |
| Install verification | §3 receipts (no-root tier) |
| release.yml YAML | valid |

## 7. Limitations + TL integration dependencies

1. **The GitHub Release itself is NOT yet published** — the TL pushes
   the tag `v1.0.0` on the integrated tree; the workflow builds from
   clean source and attaches the real CI-built artifacts (better than
   uploading lane-built binaries: the release must be reproducible from
   the repo, per the issue).
2. No macOS/Windows targets; no signing (Linux needs none) — documented
   gaps in the workflow body.
3. No auto-update feed exists (dev-app-update.yml is an honest
   placeholder; the packaged updater stays inert until the operator
   configures a real feed).
4. The root-tier `sudo apt install` GUI-launch verification runs in CI
   (Lane C's journeys workflow may add the install job; the release
   run itself proves the build).
5. `pnpm-lock.yaml` importers for the renamed desktop package: the TL
   integrates the lockfile at merge (single-writer law).
6. Sibling-lane seam: A's `@payswap/app` desktop wiring uses tsconfig
   paths + vite alias; this lane added `@payswap/app: workspace:*` to
   the desktop manifest dependencies per the TL's instruction — the TL
   reconciles the alias at integration.
