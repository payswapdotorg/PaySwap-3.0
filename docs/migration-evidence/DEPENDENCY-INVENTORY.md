# Dependency Inventory (P0-W3)

Comparison of the old repository's `package-lock.json` (lockfileVersion 3, 646 unique locked packages, 681 entries incl. workspaces) against the canonical repository's `pnpm-lock.yaml` at base `e40f2b9` (lockfileVersion 9.0, 33 importers, 1,885 locked packages).

## Shape

| | Old repo (`payswap.org` @ 8a735bf) | Canonical (`PaySwap-3.0` @ e40f2b9) |
| --- | --- | --- |
| Manager | npm workspaces | pnpm workspaces |
| Workspaces | 36 packages | 33 importers |
| Direct deps (root + workspaces) | 49 unique names | 190 unique names |
| Locked packages | 646 | 1,885 |
| External direct deps | `typescript`, `vitest` (all packages) + React/Next/tailwind/testing-library only in `design`/`web` | full platform stack (see pnpm-lock) |
| Runtime services | none (contract/test library) | ZCode platform (server, desktop, cli, …) |

Internal dependency spine of the old repo (workspace edges, by dependent count): `@payswap/protocol` 32 → `@payswap/trust` 16 → `@payswap/connectors` 15 → `@payswap/capabilities` 12 → domain packages above them.

## Shared direct dependencies (8) and version drift

| Dependency | Old resolved | Canonical resolved | Drift assessment |
| --- | --- | --- | --- |
| react | 19.3.0 | 19.2.7 | minor (same major) |
| react-dom | 19.3.0 | 19.2.7 | minor (same major) |
| @types/react | 19.3.0 | 19.2.14 (also 18.3.28 present) | minor |
| @types/react-dom | 19.3.0 | 19.2.3 (also 18.3.7 present) | minor |
| @types/node | 24.19.1 | 24.12.2, 25.6.0 (16/18 legacy entries too) | minor; old is slightly newer |
| typescript | 5.9.3 | 5.9.3 (plus 6.0.2 and legacy 4.9.5 entries) | matched at 5.9.3 |
| tailwindcss | 4.3.3 | 4.2.2 | minor (same major v4) |
| @vitejs/plugin-react | 4.7.0 | 5.2.0, 6.0.1 | **MAJOR drift** (old v4 → canonical v5/v6) |

Notes: no shared direct dependency requires coordinated upgrade action in Phase 0 (inventory only); the `@vitejs/plugin-react` major drift matters only if old `design`/`web` test tooling is ever carried (it is ADAPT/REWRITE — tooling will be re-homed onto the canonical stack). `typescript` at 5.9.3 matches the canonical root.

## Old-repo-unique external direct dependencies (9 not present anywhere in the canonical lockfile)

`next`, `vitest`, `jsdom`, `eslint`, `eslint-config-next`, `postcss` (only as canonical transitive), `@tailwindcss/postcss`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`.

All 31 `@payswap/*` "dependencies" are internal workspace links, not registry packages — they exist only inside the old repo.

## Licensing red flags

Direct external dependencies of the old repo: all MIT except `typescript` (Apache-2.0). **No copyleft among direct dependencies.**

Copyleft scan across ALL installed top-level packages of the old repo:

| Package | License | Also in canonical lockfile? | Exposure |
| --- | --- | --- | --- |
| axe-core | MPL-2.0 | no (old-repo-unique) | weak (file-level) copyleft; dev/test-only (a11y assertions in `design`); not linked into any shipped code path |
| lightningcss (+ platform binaries) | MPL-2.0 | **yes** (transitive of tailwindcss/vite in both repos) | shared exposure, build-time only |

**No GPL/AGPL/SSPL/BUSL/EPL/RPL/Sleepycat license appears anywhere in the old repo's installed tree.** Conclusion: no copyleft red flag blocks migration evidence use; the two MPL-2.0 entries are dev/build-time only, and `lightningcss` is already present in the canonical stack via the same tailwind chain. If `axe-core` is carried into canonical dev tooling later (P7/P8 a11y testing), MPL-2.0 file-level obligations must be honored for modified files — recorded here as a note, not a blocker.

## Honest limitations

- License fields were read from installed `node_modules/*/package.json` (after `npm ci`), because package-lock v3 does not record licenses; packages that failed to install would be missed — `npm ci` completed with exit 0, so coverage is complete for the pinned lockfile.
- Canonical version resolution lists every version variant present in the pnpm lockfile (pnpm allows multiple versions per name); drift assessment uses the primary/root resolved version.
- The old repo has no `pnpm-lock.yaml`, `yarn.lock`, or any second lockfile; `package-lock.json` is authoritative and in sync with the manifests (`npm ci` reproducible from it).
