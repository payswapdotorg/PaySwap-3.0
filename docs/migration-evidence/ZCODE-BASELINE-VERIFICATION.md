# ZCode Baseline Verification Record (P0-W3)

Read-only verification that the pinned upstream baseline is what the fork claims. All commands were executed against the canonical clone at `/home/z/my-project/payswap3-w3` (branch `work/p0-w3`, base `e40f2b9cc8da7d5ccfe15c93b43adc2dbf941b6e`) and the reference clone of `zai-org/ZCode`. No writes to either repository; one temporary read-only remote (`upstream-verify`) was added and removed after verification.

## Claim under test (from `spec/UPSTREAM-BASE.md`, `spec/development-state/current-state.json`)

- `payswapdotorg/PaySwap-3.0` is a GitHub fork of `zai-org/ZCode`.
- Pinned baseline: `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (ZCode v3.14.3).
- The pinned upstream history is verified on `main`; upstream history is not rewritten.

## Receipts

### R1 — Pin ancestry (battery command 1)

```text
$ git -C payswap3-w3 merge-base --is-ancestor 29628c9acdb81b703bbd4080c207a0e7ce5e276e e40f2b9 && echo PIN_OK
PIN_OK
(exit 0)
```

The pin is an ancestor of the P0-W3 base `e40f2b9`. PASS.

### R2 — Old-repo reference commit (battery command 2)

```text
$ git -C payswap-org-ref rev-parse HEAD
8a735bf1639198c43115087a2992555166a9acf9
```

Matches `reference_sources.reviewed_reference_commit` in `spec/development-state/current-state.json` exactly (`8a735bf1639198c43115087a2992555166a9acf9`). PASS.

### R3 — Pin identity against real upstream (cryptographic)

Fetched the exact pin SHA directly from `zai-org/ZCode` (GitHub serves arbitrary SHAs):

```text
$ git remote add upstream-verify https://github.com/zai-org/ZCode.git
$ git fetch --depth 1 upstream-verify 29628c9acdb81b703bbd4080c207a0e7ce5e276e
 * branch 29628c9acdb81b703bbd4080c207a0e7ce5e276e -> FETCH_HEAD
$ git rev-parse FETCH_HEAD
29628c9acdb81b703bbd4080c207a0e7ce5e276e
$ git rev-parse 29628c9^{tree}   ; git rev-parse FETCH_HEAD^{tree}
e7458be062f467b465abc91509adb0558e023605   (both)
UPSTREAM_TREE_MATCH
```

The fork's pin commit is byte-identical (same SHA ⇒ same tree, parents, author, committer, message) to the commit served by the real `zai-org/ZCode` repository. PASS.

### R4 — Governance layer on top of the pin

```text
$ git rev-list --count 29628c9..e40f2b9
25
$ git rev-list --merges 29628c9..e40f2b9
(empty — 0 merge commits)
$ git log --oneline 29628c9..e40f2b9   (abridged)
e40f2b9 P0: bind inherited ZCode platform governance
7e100cf P0: preserve inherited ZCode platform baseline
40336e7 P0: align platform bootstrap Work Order with verified fork lineage
... (25 total, all "P0:" governance/spec commits)
2227dc6 P0: establish PaySwap governance in README.md
$ git rev-parse 2227dc6^
29628c9acdb81b703bbd4080c207a0e7ce5e276e
```

The first PaySwap governance commit's parent is exactly the pin; 25 linear (non-merge) governance commits are layered on top. PASS.

### R5 — Upstream history unrewritten below the pin

```text
$ git rev-list --count HEAD          (after removing local shallow artifacts)
28
$ git rev-list --max-parents=0 HEAD
77432b6dbf9f70176ced3f4dcdc25f851c3acb2d
$ git cat-file -p 29628c9 | head -2
tree e7458be062f467b465abc91509adb0558e023605
parent 872ad960de7ec172591f7e1952f7849229f94521
$ git cat-file -p 872ad96 | head -2   (object fetched from real upstream)
tree d185a9a893c00d51fc3fe51fe7371b9eea7de143
parent 77432b6dbf9f70176ced3f4dcdc25f851c3acb2d
$ git cat-file -p 77432b6 | head -2   (object fetched from real upstream)
tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904   (the empty tree)
(no parent — true root of zai-org/ZCode)
```

The fork contains the pin's full genuine ancestry: `77432b6` (ZCode root, empty tree) → `872ad96` → `29628c9` (v3.14.3), then 25 governance commits = 28 total. The upstream history at the pin is exactly 3 commits and all of it is present in the fork, byte-identical to `zai-org/ZCode`. Nothing was squashed or rewritten. PASS.

### R6 — Pin commit metadata

```text
$ git show -s --format='%H%n%an <%ae>%n%ad%n%s' 29628c9
29628c9acdb81b703bbd4080c207a0e7ce5e276e
wuweiqi <weiqi.wu@aminer.cn>
Wed Sep 23 17:36:31 2026 +0800
feat: update v3.14.3
```

Consistent with `current-state.json` (`version: 3.14.3`). PASS.

### R7 — Base consistency with accepted program state

```text
$ git merge-base --is-ancestor e40f2b9 origin/main && echo BASE_IS_ANCESTOR_OF_MAIN
BASE_IS_ANCESTOR_OF_MAIN
$ git rev-parse origin/main
013afd0476513a9e390e6fb9163a5934c6d1c96c   (P0 STATE: P0-W1 COMPLETE (ACCEPT))
```

The P0-W3 base `e40f2b9` is the recorded base at Work Order issue time and an ancestor of current `origin/main` (which advanced with the accepted P0-W1 series). PASS.

## Method notes (honest)

- The temporary depth-1 upstream fetch wrote a local `.git/shallow` boundary at the pin; it was removed after verification so the clone's true 28-commit history is intact (`git rev-list --count HEAD` = 28, single root `77432b6`). All counts above are post-cleanup.
- The temporary `upstream-verify` remote was removed after verification. The canonical worktree was never modified by this record (only `spec/migration/**` and `docs/migration-evidence/**` — the P0-W3 write surface).
- SHA-1 collision resistance is assumed for the "byte-identical" claim in R3 (standard git threat model).

## Verdict

**VERIFIED.** The pinned upstream baseline is exactly what the fork claims: real `zai-org/ZCode` v3.14.3 (`29628c9`), complete and unrewritten upstream history (3 upstream commits), 25 linear governance commits layered on top, base `e40f2b9` consistent with the program state, and the old `payswap.org` reference commit matches the recorded hash.
