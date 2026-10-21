# Installing PaySwap Desktop on Ubuntu (and Debian)

PaySwap Desktop for Linux is distributed through GitHub Releases as two
artifacts per version, both built by CI from a clean checkout of the release
tag (`.github/workflows/release.yml`):

| Artifact | Purpose |
|---|---|
| `PaySwap_<version>_amd64.deb` | Debian package for Ubuntu/Debian on x86_64 — the recommended install path |
| `PaySwap-<version>.AppImage` | Portable single-file build — no installation, no root |

Download page: **<https://github.com/payswapdotorg/PaySwap-3.0/releases>**

> **Honest status:** until the first release (`v1.0.0`) is published, the
> Releases page is empty and no asset link exists anywhere in this
> documentation. Every URL pattern below shows the exact shape a published
> release uses — this guide never links a nonexistent file.

Product identity (packaging contract, `spec/productization/PRODUCT-IDENTITY.md` §1):
application id `org.payswap.PaySwap`, desktop entry / menu name `PaySwap`,
executable `payswap`, Debian package name `payswap`, installed under
`/opt/PaySwap/`. The product version is PaySwap-own semver starting at
`1.0.0` and release tags are `v<version>`.

## Requirements

- Ubuntu 20.04 or newer, or Debian 11 or newer, on x86_64 (amd64). The
  glibc floor of the bundled binaries is 2.28.
- 8 GB RAM recommended (the desktop app embeds the agent runtime).
- ~2 GB free disk for the installed application.
- The AppImage additionally needs FUSE 2 on systems that ship FUSE 3 only
  (Ubuntu 24.04+): `sudo apt install libfuse2t64` (Ubuntu 22.04:
  `sudo apt install libfuse2`).

## Option A — install the .deb (recommended)

1. Download `PaySwap_<version>_amd64.deb` from the release page, for example
   for `v1.0.0`:

   ```
   https://github.com/payswapdotorg/PaySwap-3.0/releases/download/v1.0.0/PaySwap_1.0.0_amd64.deb
   ```

2. Install it (from the directory containing the file):

   ```bash
   sudo apt install ./PaySwap_1.0.0_amd64.deb
   ```

   `apt` resolves the runtime dependencies from your system repositories
   (GTK3, NSS, X11/XSS, XDamage, alsa, etc. — the same set Electron on
   Debian/Ubuntu needs). `sudo dpkg -i` also works but does not resolve
   dependencies by itself; if it reports missing packages, run
   `sudo apt -f install` afterwards.

3. Launch PaySwap:

   - from your application menu — the entry is named **PaySwap**
     (categories: Office;Finance;), with the PaySwap mark as its icon, or
   - from a terminal: `payswap`.

### What the package installs

| Path | Content |
|---|---|
| `/opt/PaySwap/` | the application (Electron runtime + app + bundled agent and search tools) |
| `/usr/bin/payswap` | launcher symlink |
| `/usr/share/applications/payswap.desktop` | menu entry (`Name=PaySwap`) |
| `/usr/share/icons/hicolor/<N>x<N>/apps/payswap.png` | the PaySwap mark at 16–1024 px |
| `/usr/share/doc/payswap/` | copyright/changelog metadata |

Your data lives under `~/.config/PaySwap` (Electron `app.getPath("appData")`
derives from the `PaySwap` product name). The package never writes there
during install or removal.

### Upgrade

Install the new `.deb` over the old one:

```bash
sudo apt install ./PaySwap_1.0.1_amd64.deb
```

User data under `~/.config/PaySwap` is preserved across upgrades.

### Uninstall

```bash
sudo apt remove payswap        # remove the app, keep your data
sudo apt purge payswap         # also drop dpkg state (still not your data)
rm -rf ~/.config/PaySwap       # only if you also want your local data gone
```

## Option B — run the AppImage (portable)

1. Download `PaySwap-<version>.AppImage` from the release page, for example:

   ```
   https://github.com/payswapdotorg/PaySwap-3.0/releases/download/v1.0.0/PaySwap-1.0.0.AppImage
   ```

2. Make it executable and run it:

   ```bash
   chmod +x PaySwap-1.0.0.AppImage
   ./PaySwap-1.0.0.AppImage
   ```

If your system lacks FUSE 2 support the AppImage refuses to mount itself;
either install the FUSE 2 compatibility package (see Requirements) or run it
extracted, which needs no FUSE at all:

```bash
./PaySwap-1.0.0.AppImage --appimage-extract-and-run
```

The AppImage keeps the same data path (`~/.config/PaySwap`) as the `.deb`, so
the two installs share settings when used by the same user. To "uninstall"
an AppImage, delete the file (and `~/.config/PaySwap` if desired).

## Verifying downloads (checksums)

Every release attaches `SHA256SUMS.txt` covering both installers. Download it
next to the installers and verify:

```bash
sha256sum -c SHA256SUMS.txt
```

Expected output lines end with `: OK` for each file. The checksums are
computed by the release workflow itself, over the exact bytes it uploads —
they are the authoritative integrity reference for the release.

## Troubleshooting

- **Generic gear icon instead of the PaySwap mark** — refresh the desktop
  databases: `sudo update-desktop-database && sudo gtk-update-icon-cache -f
  /usr/share/icons/hicolor`, then log out/in.
- **AppImage fails with a FUSE error** — see Option B above
  (`libfuse2t64`/`libfuse2`, or `--appimage-extract-and-run`).
- **Blank or black window on older GPUs** — launch with
  `payswap --disable-gpu`.
- **`dpkg -i` reported missing dependencies** — run `sudo apt -f install`.
- **Where are the logs?** — application logs are written under
  `~/.config/PaySwap/logs` (create the directory by launching once).

## Building from source (developer path)

The secondary path, for developers working on the repository itself:

```bash
git clone https://github.com/payswapdotorg/PaySwap-3.0.git
cd PaySwap-3.0
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @payswap/desktop build
pnpm --filter @payswap/desktop exec electron-builder --linux deb appimage --publish never
```

Artifacts land in `packages/desktop/dist/`. Set `ZCODE_ENV=production` for
the production identity (`PaySwap`); the default without it is the
test-backend `PaySwap Preview` identity with `_TEST`-suffixed artifacts.
Node 24 and pnpm 10.33.2 are the pinned toolchain (see `.nvmrc` and
`packageManager` in `package.json`).

## Honest boundaries of this distribution

- Linux x86_64 is the only distribution target with build + install
  evidence. macOS and Windows installers are **not** built or signed by the
  release workflow — those remain open gaps, as does code signing/notarization
  in general (Linux installers are not signed; there is no Linux signing
  requirement today).
- In-app auto-update is **not configured**: no PaySwap update feed exists
  yet. Updates arrive by installing a newer `.deb`/AppImage from Releases
  until an operator-configured feed goes live.
- Remote-agent native runtimes (used for SSH/WSL remote sessions) are not
  embedded in the installers; the app fetches them from the operator CDN on
  demand when that feature is used.
