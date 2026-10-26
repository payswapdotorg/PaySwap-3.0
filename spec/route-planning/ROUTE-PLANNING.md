# @payswap/route-planning — Lane Specification (P16)

Status: DELIVERED (offline/contract tier; lanes A/B/C/D complete — commits `b34fa35`, `047eb62`, `98d1c88`, `fc03434`, `adedf5b`, `2570804`)
Package: `packages/route-planning` — `@payswap/route-planning` v0.1.0
Work Order: P16 (the loadable payment route planning routine — issue [#6](https://github.com/payswapdotorg/PaySwap-3.0/issues/6))
Contracts: `spec/routines/payment-route-planning/ROUTINE-CONTRACT.md` (frozen, incl. Appendix A) + `docs/architecture-governance/adr/ADR-0009-p16-payment-route-planning-routine.md`

## 1. What this package is

The constrained payment-route-planning ROUTINE as ONE deterministic,
zero-sibling-import package: the typed trigger (an accepted
MoneyMovementIntent/PaymentIntent event — prose UNCONSTRUCTIBLE), the
fail-closed versioned routine manifest (twelve stages, seven ordered
loader gates, the pinned skill content digest), the independently
grounded per-side eligible-rail snapshots, the bounded candidate
enumeration over the REAL route compiler with TRUE-count truncation
receipts, the typed hard gates before transparent deterministic ranking
(Pareto disclosure, UNKNOWN retained), and the stage-6 lab adapter
(bounded advisory counterfactuals over immutable base facts). Discovery
NEVER permits execution: every stage's `*PermitsExecution()` is the
literal `false`.

## 2. The load-bearing laws

1. **Prose cannot start the routine (ADR-0009 D1).** The trigger
   builder accepts ONLY the validated pin (exact 10-key movement /
   11-key payment); one idempotency key admits at most one start;
   an identical re-record replays, a divergent one is a typed
   `TriggerConflictError`.
2. **Pin-only src + fail-closed injected ports (D2).** Every
   cross-package surface is a LOCAL STRUCTURAL PIN in `src/pins/`
   (economic intents, capability corridor, route-compiler contracts,
   lab vocabularies); every REAL engine is an INJECTED PORT whose
   default FAILS CLOSED with a typed error naming the exact unbound
   stage. The REAL engines bind at the TEST tier (relative imports)
   and at the platform host's composition root — never an LLM-only
   fallback.
3. **One digest flavor (D4).** Value-form canonicalization
   (key-sorted, bigint `b:`, number `n:`) hashed FNV-1a 64, namespaced
   `fnv1a64:<16-hex>`; digests compute over the VALUE, never a
   `JSON.stringify` round-trip; caller-supplied time everywhere.
4. **Bounded searches disclose truncation (D6).** Count-based budgets
   only; every truncating dimension emits a receipt carrying the TRUE
   pre-cut count; coverage is `COMPLETE` only when no receipt exists.
5. **The manifest fails closed at seven ordered gates** (shape,
   schema version, digest, handler allowlist, authority class — the
   WAIT branch checked before the generic execute law, capability
   bindings, mission version pin). The skill content digest pins the
   REAL `skills/payment-route-planning/SKILL.md` bytes
   (`fnv1a64:1abba70f0107d1b2`); the battery re-reads and asserts.
6. **Counterfactuals are advisory (INV-11).** Scenario exploration
   varies named interventions over IMMUTABLE recorded facts; nothing
   in production (obligations, reservations, balances, authority,
   opportunities) is ever updated by a scenario.
7. **Zero sibling imports — the leaf-in-flight law** (the
   opportunities/route-compiler pins precedent). `MODULE-OWNERSHIP`
   layer: `intelligence`.
8. **File discipline.** Every file ≤ 400 lines; no TS enums; frozen
   vocabularies; UNKNOWN ≠ FAILED.

## 3. The census (machine-checked, exact `toBe` pins)

`test/boundary.test.ts` pins EXACTLY: **15 src** / **16 test-suite** /
**19 all-test** `.ts` files. Src: `canonical, errors, ports,
search-budget, rail-snapshot, candidates, hard-gates, ranking, trigger,
manifest, lab-adapter, index` + `pins/{economic, capability,
route-compiler}`. Test suites: `boundary, canonical, errors, ports,
pins-fidelity, rail-snapshot, search-budget, candidates, hard-gates,
ranking, determinism, pipeline, trigger, manifest, lab-adapter,
routine-composition` (+ shared `fixtures, compiler-evidence, node.d.ts`).

## 4. How to verify (fully offline, deterministic)

```bash
cd packages/route-planning
npx tsc --noEmit               # 0 diagnostics
npx vitest run                 # 16 files / 209 tests, ALL PASS, ~5s
```

Sibling batteries re-proven at every acceptance: route-compiler 29f/353t,
capability 18f/230t, economic 11f/105t, lab 18f/169t, protocol 24f/279t,
opportunities 17f/250t, surface 18f/224t, payswap-app 37f/403t; repo
`node scripts/architecture/architecture-check.mjs check` → 0/0/0.

## 5. Known limitations (honest, recorded — never hidden)

- The live-app engine binding is the platform host's composition step:
  the composer renders the honest unbound note until the
  `RoutePlanningEnginePort` is bound at a real composition root
  (ADR-0009 D2).
- Stage 9a UI wiring to the existing desktop authority chain
  (Trust/Authorization → Financial Protocol) and live-provider route
  evidence remain the P14-carried execution lanes; this package is the
  PLANNING tier only.
- The pinned skill digest must be re-pinned deliberately if
  `SKILL.md` ever changes (the battery fails closed on drift).
