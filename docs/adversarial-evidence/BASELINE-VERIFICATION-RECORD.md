# @payswap/adversarial — Baseline Verification Record (P6-W3, lane r4-w3)

Consolidated rebuild of the two old-repo evidence sources into one
package. Branch `work/r4-w3`; base `0755624` (= origin/main at
dispatch: "P7-E2E (Gate D) accepted: live browser verification record
+ state closure", verified with `git log --oneline -1` after checkout).
Porting source (evidence, not authority): payswap.org @
`8a735bf1639198c43115087a2992555166a9acf9` (read-only).

Write surface: `packages/adversarial/**`, `spec/adversarial/**`,
`docs/adversarial-evidence/**` (hard constraint 5 — verified by the
manifest receipt in §7).

Roadmap authority: spec/dependency/work-orders.md P6-W3 ("Adversarial
onchain/provider threat intelligence and immune-system integration;
deterministic BLOCK remains authoritative"); INV-21
(spec/architecture/invariants.json); MODULE-OWNERSHIP.yaml layer
`security` (`cannot_downgrade_block: true`).

---

## 1. Commits (the 4-commit protocol)

| # | Subject | SHA |
|---|--------|-----|
| 1/4 | pinned wire shapes (onchain-security D-1 seam, trust, domain pins) | `a86911e38f0ae16a7bbca0ef8a75d37a7ad73d05` |
| 2/4 | the full consolidated implementation | `93828ee6d71af1b4574073cefe02b6f26fe24882` |
| 3/4 | the hermetic test suite (18f/146t) | `c7a7bda2b8134ee7f814909836b57f6a24b1a5eb` |
| 4/4 | spec + evidence | (this commit — see `git log -1`) |

## 2. Battery receipts (hermetic, recorded at 4/4)

| Command | Result |
|---------|--------|
| `cd packages/adversarial && rm -rf node_modules package-lock.json` | clean slate |
| `npm install --no-workspaces` | **exit 0** |
| `npx tsc --noEmit` | **0 diagnostics** (strict + exactOptionalPropertyTypes) |
| `npx vitest run` | **18 test files / 146 tests, ALL PASS** — ~4s, fully offline, deterministic (re-ran after clean reinstall: identical) |
| plain-Node runtime census (`node --experimental-strip-types`, both barrels) | **142 distinct runtime exports** (root barrel 99 + `./provider-intel` 44; 22 error classes) |

## 3. Census (both trees)

| Tree | Files | Lines | Max file |
|------|-------|-------|----------|
| `src/` (incl. `src/pins/`, `src/provider/`, `src/integration/`) | **38** | **7,113** | 394 (`capability-cases.ts`) |
| `test/` (18 test + helpers + node.d.ts = 20) | **20** | **3,755+** | 326 (`onchain-bridge.test.ts`) |
| runtime exports | **142** | error classes | **22** |

Prior-build envelope (the lost accepted-then-lost attempt): 15 test
files / 99 tests; 81 exports; src 35 files. **src 38 is +8.6% — inside
±40%.** Test count 146 vs 99 (+47%) and exports 142 vs 81 (+75%) land
ABOVE the envelope: the consolidation justifies both (D-5) — the prior
attempt consolidated from a narrower reading of the corpus; this build
accounts for BOTH old sources in full (133 titled sites), and the old
`packages/security` tree ALONE exported 104 declarations (24+17+15+14+
13+20+1) where this package's pins + integration + provider intel add
the rest. Every deviation is explained in §6.

## 4. Classification arithmetic — the full old-site account

Definitions used (stated so the split is auditable):
- **PORTED** — an old site's law kept with near-identical assertions
  (mechanical renames; module splits for the file law only).
- **ADAPTED** — an old site's law re-based onto the new surface
  (injection→detection re-basing, in-package composition, canonical
  INV re-citation, pin-composed seams).
- **REWRITTEN** — the old boundary-suite intent rebuilt on the
  STRICTER zero-sibling law.
- **COVERED-BY-TRUST** — the old site's law is already owned by the
  merged trust lane (P1-W3); re-porting it here would be a parallel
  vocabulary (D-2).
- **OUT-OF-LANE** — the old site's law targets a plane owned by
  another 3.0 work order (financial/participation/Lab); the
  intelligence-side coverage still landed here (D-3).

### 4.1 The two-build oracle — evidence sources located and counted

| Old tree (payswap.org@8a735bf) | src files | src lines | titled sites |
|---|---|---|---|
| `packages/adversarial` (W2-007 fault suite; the work order's "packages/onchain-adversarial... locate by directory name") | 13 (3 top-level + 10 faults) | 969 top-level (`src/*.ts`; 5,109 incl. `src/faults/`) | **61** |
| `packages/security` (W2-005 immune system; the work order's "old onchain-security tree" — 7 files / 2,837 lines / 72 sites match THIS tree exactly) | 7 | 2,837 | **72** |
| **Total** | 20 | — | **133** |

### 4.2 The account closes on 133 (zero silently dropped, zero weakened)

| Class | Sites | Where |
|---|---|---|
| PORTED | **61** | advisories 9, capability-cases 6, epochs 8, experts 11, quarantine-corpus 14 (split across quarantine/capability-gate/immune-gate), signatures 10 (split across component-identity/signatures), boundary 1, smoke 1 (security) + adversarial boundary 1 (package name) |
| ADAPTED | **57** | provider family corpus (injection→detection + recovery contracts): account-takeover 4, ambiguous 4, clock-skew 4, duplicated 5, incentive 6, lost-webhooks 4, malicious-agents 5, package-compromise 5, partial-payment 3, provider-outage 4, suite-report 5, adversarial-boundary 3 + security-boundary 2 + experts-vocab 1 + epochs-advisory-path 1 + smoke-journey 1 |
| REWRITTEN | **7** | boundary suites: security 4 (workspace-deps allowlist inverted to zero-sibling; lab/financial-machinery refs) + adversarial 3 (relative-only, the obsolete test-composition dependency allowlist) |
| COVERED-BY-TRUST | **3** | the per-principal credential-epoch axis (2 sites) + the delegated-principal match (1 site) — D-2 |
| OUT-OF-LANE | **5** | incentive unfunded-promise + honest-contributor rewards (2, financial/participation plane), partial-payment over-reservation + gross-obligations (2, financial plane), provider-outage frozen-W2-006 Lab-replay contract (1, lab/certification plane) — D-3 |
| **Total** | **133** | 61 + 57 + 7 + 3 + 5 |

Derived tests: **146 = 122 law-carriers** (61 ported + 57 adapted + 7
rewritten sites, carried with folds/splits — the old 14-site
quarantine file's ledger/gate/SecurityGate laws split across three new
files; the old 10-site signatures file split identity/version vs
signature registry; the 12-site epochs file folded the
advisory-advance sites into immune-gate) **+ 24 NET-NEW** (the
structural pins 9, the INV-21 encoding 11, pin-composition + escalation
surface 4).

### 4.3 Per-file classification (new suite, 18 files / 146 tests)

| New file | Tests | PORT | ADAPTED | REWRITTEN | NET-NEW |
|---|---|---|---|---|---|
| smoke.test.ts | 3 | 1 | — | — | 2 |
| boundary.test.ts | 10 | — | 5 | 5 | — |
| pins.test.ts | 9 | — | — | — | 9 |
| block-authority.test.ts | 12 | — | 1 | — | 11 |
| component-identity.test.ts | 5 | 5 | — | — | — |
| signatures.test.ts | 7 | 7 | — | — | — |
| advisories.test.ts | 10 | 9 | — | — | 1 |
| epochs.test.ts | 9 | 8 | — | — | 1 |
| quarantine.test.ts | 9 | 9 | — | — | — |
| capability-gate.test.ts | 6 | 6 | — | — | — |
| immune-gate.test.ts | 8 | 7 | 1 | — | — |
| capability-cases.test.ts | 6 | 6 | — | — | — |
| experts.test.ts | 10 | 10 | — | — | — |
| provider-families.test.ts | 7 | — | 7 | — | — |
| provider-detectors.test.ts | 16 | — | 16 | — | — |
| provider-agent.test.ts | 7 | — | 7 | — | — |
| onchain-bridge.test.ts | 8 | — | 5 | — | 3 |
| escalation.test.ts | 4 | — | — | — | 4 |
| **Total** | **146** | **68** | **42** | **5** | **31** |

### 4.4 Old-file → new-home mapping (25 old files, 133 sites)

| Old file (sites) | New home(s) |
|---|---|
| sec/advisories (9) | advisories.test (9 PORT) |
| sec/boundary (7) | boundary.test (2 ADAPT + 4 REWRITE) + capability-gate.test (1 PORT: the gate-reads-state-not-cache law) |
| sec/capability-cases (6) | capability-cases.test (6 PORT) |
| sec/epochs (12) | epochs.test (8 PORT) + immune-gate.test (1 ADAPT: advisory-path advance) + trust lane (3, D-2) |
| sec/experts (12) | experts.test (11 PORT) + boundary.test (1 ADAPT: authority-vocabulary guard) |
| sec/quarantine (14) | quarantine.test (5 PORT: ledger/release) + capability-gate.test (5 PORT: bypass/provider/restrict/ladder) + immune-gate.test (4 PORT: enforce/agent/package/clean) |
| sec/signatures (10) | component-identity.test (4 PORT) + signatures.test (6 PORT) |
| sec/smoke (2) | smoke.test (1 PORT) + onchain-bridge.test (1 ADAPT: the composition journey) |
| adv/account-takeover (4) | provider-detectors.test (1 ADAPT) + immune-gate/epochs (2 ADAPT: epoch-bump + cached re-entry) + provider-families.test recovery (1 ADAPT) |
| adv/ambiguous-provider (4) | provider-detectors.test (2 ADAPT) + provider-families.test recovery contract (2 ADAPT) |
| adv/boundary (7) | smoke.test (1 PORT) + boundary.test (3 REWRITE + 3 ADAPT) |
| adv/clock-skew (4) | provider-detectors.test (2 ADAPT) + epochs/provider-families (2 ADAPT) |
| adv/duplicated-commands (5) | provider-detectors.test (4 ADAPT) + provider-families.test recovery (1 ADAPT) |
| adv/incentive-abuse (8) | provider-detectors.test (5 ADAPT) + block-authority.test (1 ADAPT: BLOCK/FLAG binding) + out-of-lane (2, D-3) |
| adv/lost-webhooks (4) | provider-detectors.test (2 ADAPT) + provider-families.test recovery (2 ADAPT) |
| adv/malicious-agents (5) | provider-detectors.test (5 ADAPT) |
| adv/package-compromise (5) | provider-detectors.test (1 ADAPT) + onchain-bridge.test (2 ADAPT: global restrict + write denial via the immune gate) + provider-families/quarantine (2 ADAPT: sealed-immutable + patched-release) |
| adv/partial-payment (5) | provider-detectors.test (2 ADAPT) + provider-families.test recovery (1 ADAPT) + out-of-lane (2, D-3) |
| adv/provider-outage (5) | provider-detectors.test (3 ADAPT) + provider-families.test recovery (1 ADAPT) + out-of-lane (1, D-3: the Lab-replay contract) |
| adv/suite-report (5) | provider-detectors.test sweep tests (3 ADAPT) + provider-agent.test (2 ADAPT: determinism + coverage) |

## 5. Per-file source adaptation receipts (old → new)

Old `packages/security/src` (7 files / 2,837 lines):

| Old source | Old L | New source | Adaptation |
|---|---|---|---|
| signatures.ts | 490 | component-identity.ts (~160) + threat-signatures.ts (~325) + pins/digest.ts (~80) | PORT split for the ≤400-line law; the digest becomes the pinned FNV-1a 64 (structurally identical); NET-NEW: inverted-range validation |
| advisories.ts | 415 | advisories.ts (~200) + advisory-registry.ts (~255) | PORT split; ValidationError via the pin; canonical INV re-citation |
| epochs.ts | 320 | epochs.ts (~310) | PORT; the per-principal credential-epoch composition dropped (trust lane owns it, D-2) |
| quarantine.ts | 585 | quarantine-ledger.ts (~250) + capability-gate.ts (~215) + immune-gate.ts (~185) | PORT split 3 ways; EffectiveAvailability becomes a pinned structural view |
| capability-cases.ts | 393 | capability-cases.ts (~395) | PORT (digest via the pin) |
| experts.ts | 589 | experts.ts (~300) + expert-resolutions.ts (~250) | PORT split; evidence-artifact discipline unchanged |
| index.ts | 45 | index.ts + version.ts | PORT+ADAPT (wire stamps net-new) |

Old `packages/adversarial/src` (13 files / 969 top-level lines): the
fault-injection harness composed the old journey world (protocol/
journeys/rails/participation + old @payswap/security). The TARGETS do
not exist at this base — the durable content (the family taxonomy, the
endangered laws, the injection/recovery semantics) is re-based as:
families.ts (~200) + observations.ts (~320) + signals.ts (~130) +
detectors-context.ts (~200) + detectors-provider.ts (~380) +
detectors-agent.ts (~355) + detectors.ts (~120) + recovery.ts (~180) +
agent.ts (~190) + index.ts (~60) — all ADAPTED (D-1). The harness's
structural security-plane views (harness.ts:49 exports) are superseded
by the REAL in-package machinery + the pins (the consolidation).

NET-NEW src: block-authority.ts (~300), integration/{immune-projection
(~90), onchain-bridge (~330), case-bridge (~130), escalation (~230)},
pins/{errors, money, principal, chain, asset, gates, threat-intel,
security-epoch, index} (~950).

Every new file ≤ 400 lines (max: capability-cases.ts 394). Zero
`@payswap/*` module specifiers anywhere (machine-checked by
test/boundary.test.ts over src AND test). No `node:` imports in src;
`process.cwd` declared exactly ONCE as a FUNCTION global in
test/node.d.ts.

## 6. Deviations / decision records

| # | Deviation | Reason |
|---|---|---|
| D-1 | The old `packages/adversarial` fault-injection harness (inject→probe→recover against the old merged journey world) is NOT ported as a harness; the family taxonomy, endangered laws, injection checks and exact recovery paths land as the provider threat families + deterministic detectors + recovery-path contracts (pure data + pure functions). | The old injection targets (journeys/protocol/rails/participation at their old shapes) do not exist at base 0755624; their 3.0 successors are separate work orders. The immune-system composition the old harness needed as an EXTERNAL dependency is now IN-PACKAGE (this lane owns the immune machinery), so the composition tests drive the REAL registries with zero test-only dependency allowlists (the old boundary law allowing @payswap/security + @payswap/lab for test composition is obsolete — hence REWRITTEN to zero deps). |
| D-2 | The old epochs.ts per-principal credential-epoch composition (checkDelegatedSensitiveAction with a trust EpochLedger; 3 old sites) is not re-ported. | The merged trust lane (P1-W3, packages/trust/src/security-epoch.ts: EpochLedger + checkEpoch) owns the per-principal axis; re-implementing it here would be a parallel vocabulary. The NETWORK-epoch axis (the advisory-driven hammer) is this package's law and is fully ported. |
| D-3 | 5 old sites are OUT-OF-LANE: incentive unfunded-contingent-promise + honest-contributor rewards (participation/financial plane), partial-payment over-reservation refusal + gross-obligations preservation (financial plane), provider-outage frozen-W2-006 contract over the real Lab replay (lab/certification plane). | Those old sites asserted OTHER planes' laws through fault injection; in 3.0 those planes are separate work orders (economic/protocol/lab). The intelligence-side coverage of each family still landed here (detectors + recovery contracts cite the same canonical INVs); the plane-side enforcement laws are recorded as their owners' territory. |
| D-4 | The old separate `@payswap/security` immune package becomes THIS package (`@payswap/adversarial`), and the onchain threat-intel vocabulary it consumed stays with the merged @payswap/onchain-security (R2-W2's `./threat-intel` subpath). | P6-W3's mandate: "Adversarial onchain/provider threat intelligence AND immune-system integration" — one consolidated package; the 13 ONCHAIN families/detectors/policy were already ported into the merged kernel (R2-W2 evidence D-2), so this package pins that seam and composes with it rather than duplicating it. |
| D-5 | Census above the prior-build envelope: tests 146 vs 99 (+47%), exports 142 vs 81 (+75%); src 38 vs 35 (+8.6%, inside ±40%). | The consolidation justifies more: the prior attempt's reading of the corpus was narrower; this build accounts for BOTH sources in full (133 titled sites — the old security tree alone carried 104 export declarations across 7 modules). The added surface over the old trees is exactly the pins (the zero-sibling law), the INV-21 encoding and the D-1 integration bridges (the work order's architecture laws 1-2). |
| D-6 | The policy pin is a STRUCTURAL VIEW (subset: policyId, version, retireCompromisedContracts) rather than the full OnchainThreatPolicy mirror. | The bridge consults only those fields; a subset pin keeps the real policy (with every extra field) assignable by construction while avoiding a mirror of the kernel's 20+ threshold fields that this package never reads. Documented in pins/threat-intel.ts. |
| D-7 | `package-lock.json` not committed; the battery deletes and regenerates it. | The accepted R2-W2/R3-x pattern (hermetic `npm install --no-workspaces` from the toolchain versions only). |

## 7. Findings

1. The old `packages/adversarial` line-count evidence ("src 13 files /
   969 lines") counts TOP-LEVEL `src/*.ts` only (harness 815 + index 24
   + reports 130); including `src/faults/` the tree is 5,109 lines.
   Recorded so the envelope arithmetic is auditable either way.
2. The work order's "old onchain-security tree: src 7 files / 2,837
   lines; 72 titled test sites" resolves to `packages/security`
   (the old immune system) — 7/2,837/72 match exactly; the old
   `packages/onchain-security` tree itself (15 files / 4,100 lines /
   144 sites) was already rebuilt by the accepted R2-W2 and is covered
   by its own evidence record (D-4).
3. `compareProviderSignals` initially carried an inverted severity
   comparator (caught by the sweep-order test at 3/4 — the old
   suite-report "covers every family exactly once" law paid off);
   fixed in the same commit.
4. Observation-ref component-id extraction spans first-colon to
   LAST-colon (component ids may contain colons, e.g.
   `provider:card-a`, `pkg:checkout-extension`); the detector/bridge
   conventions document this explicitly.
5. The immune machinery here is the REAL home (not a wiring double):
   the R2-W2 composition tests drove a structural double because no
   immune package existed; this lane fills that gap, and the kernel's
   D-1 contract (quarantine/restrict/retire, void-on-advance,
   verified-remediation release) is now proven against the real
   registries in-package.

## 8. Manifest receipt

`git diff --name-only 0755624..HEAD` contains ONLY paths under
`packages/adversarial/`, `spec/adversarial/` and
`docs/adversarial-evidence/` (hard constraint 5 — pnpm-workspace.yaml,
other packages and other spec/docs paths untouched; verified at 4/4).

## 9. Honest blockers

None. The battery is green at 4/4 (18 files / 146 tests, 0 typecheck
diagnostics, exit 0 install, 142 runtime exports across both barrels)
with a clean working tree.
