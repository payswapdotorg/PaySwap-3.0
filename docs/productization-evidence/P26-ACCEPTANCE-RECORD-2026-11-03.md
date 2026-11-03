# P26 ACCEPTANCE RECORD — Stripe Dashboard parity and real-account acceptance (2026-11-03)

**Wave:** P26 · **Closed at:** `49856da` (+ the closure commit) · **ADR-0018** (the re-authentication flow) and **ADR-0019** (the live-mode readiness framework) are the wave's law; this record is the honest closure evidence. The operator's order (the 2026-11-02 takeover review): *"P26 — prove real Stripe Sandbox parity, map the entire Dashboard, and close the remaining user-facing gaps without weakening the security model."*

## The work orders

| Lane | Commit | The deliverable |
| --- | --- | --- |
| **P26-0** (resident-TL) | `741ebea` | The takeover verification (every battery re-run EXACT: 528+5sk / 676+2sk / 764; the CI API picture 25/27) + the gap matrix (six requirement families; six takeover defects D-1..D-6) + ADR-0018 + ADR-0019 + THE DASHBOARD PARITY MATRIX (644 ops / 149 families / 21 areas, reproducible) + the CI hygiene fixes (the hermetic tsc gate and the governance drift gate GREEN again) + the P25 audit correction appendix + the work-orders reconciliation + the graph/state registration |
| **P26-C** (resident-TL, worktree lane) | `bb1beef` + `1a2ef88`, merged `b303c2c` | The per-connection API-version migration verbs (the ONE legal target is the catalogue pin; unknown targets refused typed; double-migration refused; the reversal a SEPARATE verb; durable provenance; the wiring twin proving endive on the wire ONLY for a migrated connection — the default stays 2025-08-27.basil) + the opt-in bounded auto-walk (the 10-page pinned budget, honest truncation notes, the flag never crossing the host port) + the lockfile sync the registration owed |
| **P26-A** (resident-TL) | `9b86547` | ADR-0018 end-to-end: the un-hold (631→634 dispatchable, 13→10 held) + THE P26-A CATCH (the v2 twin's CONFIRM-tier misclassification, masked at P25 by the hold — fixed at source, pinned by the census test) + the per-tier anti-drift law + the proof machinery (same-account live-probe, digest-scoped, single-use, 10-minute, consumed-before-dispatch, INV-25 at two edges, secret-scan on every store write) + the executor REAUTH gate (an uncomposed plane refuses honestly; the tier NEVER degrades) + the material-carrying channel member (renderer descriptor + both drift laws re-pinned) + the app REAUTH card step (the chat-refusal law unchanged) |
| **P26-B** (resident-TL) | `49856da` | The key-ready real-Sandbox harness family (four gates over the REAL transport: the read journey, the API-version A/B, the double-gated write journey with the derived read-back, the re-auth probe law) + the operator run card + the exit-2 law verified live at the station |

## The evidence tiers (separated honestly)

- **CONTRACT/COMPOSITION (the in-repo proof):** provider-runtime 35f/529t+5sk (the census rewrite with the per-tier ledger, the totality battery at 634, the un-hold law, the catch pin) · desktop 80f/696t+2sk (the 11-test re-auth battery; the 8-test migration lifecycle + the wire twin; the re-pinned drift laws; tsc 0/0/0) · payswap-app 66f/776t (the auto-walk battery; the REAUTH card surface; the wiring laws) · architecture 0/0 · oxlint 0 errors. CI at the closure commit: all gates expected GREEN (the two takeover-fixed gates verified GREEN at `741ebea`; the lockfile sync verified at `b303c2c`).
- **REAL SANDBOX:** OPERATOR_GATED on the key re-supply — **no key exists at any operator store at closure (D-6)**. The harness is committed and exit-2-verified; the run card names the exact supply path and command. **Never a silent pass; nothing was simulated.**
- **LIVE:** refused (INV-25 unchanged). ADR-0019's activation bundle (credential classes, per-account activation, risk controls, dual control, certification evidence, the operator's activation order) is the named prerequisite set for any future live release.

## The defects the closure caught and fixed at source (each pinned)

1. **D-1 (takeover):** the hermetic CI tsc gate had been RED since P24-1 while acceptance records claimed "tsc 0" — the claims were the workspace program, not the CI program. Fixed: the `@types/node` toolchain dependency, the retired ambient shim, the amended boundary law.
2. **D-2 (takeover):** the governance report-drift gate RED (the ownership report stale by +3,312/−1,067). Fixed: the regenerated, idempotent report committed.
3. **D-3 (takeover):** the P25 audit's arithmetic drifts (122→121 account-gated; the tier ledger 231/75+40/1 vs the text's 352-summing table). Corrected by the appendix; the per-tier census assertions make recurrence a test failure.
4. **THE P26-A CATCH (this wave):** un-holding `PostV2CoreAccountLinks` exposed that it classified CONFIRM (family `core` escapes the credential-admin table) — masked at P25 by the override hold. The audit's own deep-dive had recorded the twin's REAUTH semantics. Fixed with the reviewed `REAUTH_LAW_PATH_PREFIXES` law; the census test pins the catch.
5. **THE LOCKFILE SYNC (P26-C's worktree):** the P26-0 registration added the devDependency without the lockfile — every frozen-lockfile CI gate refused. The lane caught it at its own door and committed the sync that main owed.
6. **PUSH PROTECTION (P26-A):** the first P26-A commit's live-key test fixture tripped GitHub's secret scanner; the fix follows the repo's own `stripe-protocol.test.ts` convention (the literal built at runtime) and the amended commit pushed clean.

## Honest boundaries (carried forward, none a P26 blocker)

The attachment plane (the ~75 KB parameter bound) · the response-surface secrets sweep · ADR-0019's live activation bundle · the official-Stripe-MCP wrapped-input lane · the re-pin path for post-v2596 releases · the live substrate runtime + the Electron CDP receipts (operator-gated) · the webhook-journey harness extension (the P14 b1 pattern) · the app-tier re-auth gesture's wiring-level UI test (the desktop gate battery + the type-level port are the current evidence) · the Dashboard-only surfaces (§3 of the parity matrix) are irreducible without Stripe shipping APIs — PaySwap names them (`STRIPE_DASHBOARD_ACTION_REQUIRED`), never scrapes them.

## Verdict

**P26 IS CLOSED.** The re-authentication flow makes the last "held for a missing flow" gap honest (634/644 = 98.4% dispatchable; the held ten are the secrets law, permanent) — with the security model strictly strengthened (a new host-minted, digest-bound, single-use artifact class; new typed refusals; zero laws removed). The Dashboard is mapped end-to-end with a reproducible, evidence-cited artifact. The version migration is real, tested and default-preserving. The real-Sandbox tier is runnable the moment the operator supplies a key (the run card is the interface). The named gates green: provider-runtime 529t+5sk · desktop tsc 0/0/0 + 696t+2sk · app 776t · architecture 0/0 · oxlint 0. The takeover defects are fixed, corrected or standing-recorded. The carry-forwards are named above, never dropped.
