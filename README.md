# PaySwap 3.0

PaySwap 3.0 is a universal economic operating system built from the ZCode platform substrate and governed by a deterministic PaySwap financial protocol. This repository is a GitHub fork of `zai-org/ZCode` pinned at baseline `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (ZCode v3.14.3); upstream attribution, license and third-party notices are preserved, and upstream history is never rewritten.

## Download PaySwap for Ubuntu

PaySwap Desktop ships as a Debian package (`.deb`, the recommended install) and a portable AppImage for **Linux x86_64 (amd64)**. Both are built by CI from a clean checkout of the release tag and published with SHA-256 checksums on the GitHub Releases page:

**→ <https://github.com/payswapdotorg/PaySwap-3.0/releases>**

> **Status (honest note): `v1.0.0` is published but carries a launch-blocking defect** (the startup force-update gate compared PaySwap `1.0.0` against the upstream ZCode service's version floor and refused to open a window; found by GUI launch verification of the published artifacts, fixed by the PaySwap update-authority law — see [`docs/productization-evidence/P9-RELEASE-CLOSURE-2026-10-21.md`](docs/productization-evidence/P9-RELEASE-CLOSURE-2026-10-21.md)). **Use the latest release from the Releases page above** — the corrected `v1.0.1` is being published from the fixed commit and every tagged release now ships with a CI install + launch + window-identity verification receipt before it is recommended here. This README links only release-asset URL patterns, never a dead download.

Per-release assets (replace `1.0.0` with the released version):

```
https://github.com/payswapdotorg/PaySwap-3.0/releases/download/v1.0.0/PaySwap_1.0.0_amd64.deb
https://github.com/payswapdotorg/PaySwap-3.0/releases/download/v1.0.0/PaySwap-1.0.0.AppImage
https://github.com/payswapdotorg/PaySwap-3.0/releases/download/v1.0.0/SHA256SUMS.txt
```

### Install the .deb (recommended)

Download `PaySwap_<version>_amd64.deb` from the release, then:

```bash
sudo apt install ./PaySwap_1.0.0_amd64.deb
```

`apt` resolves the runtime dependencies (GTK3, NSS, X11 libs, …) from your system repositories. After install, PaySwap appears in your application menu as **PaySwap** (menu category: Office/Finance) and can also be launched from the terminal with `payswap`.

### Install the AppImage (portable, no install)

```bash
chmod +x PaySwap-1.0.0.AppImage
./PaySwap-1.0.0.AppImage
```

On Ubuntu 24.04+ the AppImage needs the FUSE 2 compatibility package: `sudo apt install libfuse2t64` (Ubuntu 22.04: `sudo apt install libfuse2`). Without FUSE you can still run it extracted: `./PaySwap-1.0.0.AppImage --appimage-extract-and-run`.

### Verify the download

```bash
sha256sum -c SHA256SUMS.txt
```

(`SHA256SUMS.txt` lists both installers; the check fails loudly if either file is missing or modified.)

### Launch, upgrade, uninstall

- **Launch:** from the application menu, or run `payswap`.
- **Upgrade:** install the new `.deb` over the old one (`sudo apt install ./PaySwap_1.0.1_amd64.deb`); your data under `~/.config/PaySwap` is preserved. For the AppImage, replace the file.
- **Uninstall:** `sudo apt remove payswap` (add `--purge` to also remove system packaging state; your `~/.config/PaySwap` data is never touched by the package). For the AppImage, delete the file.

### Troubleshooting

- **The menu entry shows a generic gear icon** — run `sudo update-desktop-database` and `sudo gtk-update-icon-cache -f /usr/share/icons/hicolor` (most desktop environments refresh automatically on next login).
- **The AppImage does not start and mentions FUSE** — install the FUSE 2 package (see above) or use `--appimage-extract-and-run`.
- **Window rendering is blank on older GPUs** — launch with `payswap --disable-gpu`.
- Full guide with more detail: [`docs/installation/README.md`](docs/installation/README.md).

### Minimum requirements

Ubuntu 20.04 or newer (or Debian 11+, glibc ≥ 2.28) on x86_64 (amd64), 8 GB RAM recommended, ~2 GB free disk for the installed app. The `v1.0.0` `.deb` was built and install-verified on Debian 13 x86_64.

## Repository authority

This repository is the sole source of truth for PaySwap 3.0. Conversation history, model memory, screenshots without provenance, PR prose, worker claims, and chat instructions are non-authoritative unless the underlying requirement or evidence is committed here.

Authority order:
1. source code, tests, schemas, migrations and deployment configuration;
2. frozen architecture and accepted ADRs;
3. development state and dependency graph;
4. active Work Orders;
5. recorded CI, integration, browser and deployment evidence;
6. versioned external specifications/research recorded in the repository;
7. conversation and agent claims.

## Architecture

Canonical architecture: `spec/architecture/PAYSWAP-3.0.md`.

PaySwap 3.0 combines the ZCode cross-platform agent/application substrate with PaySwap's deterministic economic and financial kernel, one capability/connector fabric, an Economic Execution Graph, Lab/Director learning, and framework-independent Surface contracts for Web, Desktop, Mobile, Extension, SDK/API and agent surfaces.

Core law: intelligence proposes; deterministic PaySwap authorities decide and commit.

## Product UI

The primary Web product is a new PaySwap interface built on the ZCode-derived Web substrate. The old `payswap-web` deployment/repository is only reference material. The ZCode-derived Desktop shell is adapted into PaySwap Desktop. All product clients share PaySwap Surface contracts.

## Upstream lineage

Upstream: `zai-org/ZCode`
Pinned baseline: `29628c9acdb81b703bbd4080c207a0e7ce5e276e`
Upstream release at the pin: v3.14.3.

`spec/UPSTREAM-BASE.md` records the lineage and update policy. Do not silently track upstream `main`.

## Implementation

Start with `spec/development-state/current-state.json`, then `spec/dependency/graph.md` and `spec/dependency/work-orders.md`. The TL dispatches only from the active frontier and keeps at most three pairwise-disjoint worker lanes active.

No financial, provider, blockchain, merchant, or UI feature is complete without source verification, tests, integration evidence where required, and the failure/UNKNOWN/security paths.
