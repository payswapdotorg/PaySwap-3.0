# ADR-0009: the loadable payment route planning routine (P16)

- **Date**: 2026-10-26
- **Status**: accepted (P16-0, the architecture gate)
- **Context**: the P15 closure left the payment-planning routine
  REGISTERED but unimplemented (frontier `P16-0` at `8db3ff7`). The
  frozen routine contract (`spec/routines/payment-route-planning/ROUTINE-CONTRACT.md`)
  requires a layered routine — typed trigger, on-demand skill,
  deterministic manifest/planner, durable mission state — composed
  from the existing route-compiler, capability, Lab, opportunities and
  protocol machinery. Gap matrix:
  `spec/routines/payment-route-planning/P16-0-GAP-MATRIX.md`.
  An earlier implementation wave was completed in a sandbox and lost
  to a station reset before being pushed; this ADR re-decides the
  architecture (identically) and adds a durability law.

## D1 — The routine is four artifacts, and only the typed intent can start it

`skills/payment-route-planning/SKILL.md` (procedural guidance),
`spec/routines/payment-route-planning/ROUTINE-CONTRACT.md` (the frozen
stage contract) and the typed planner are three DIFFERENT authorities;
the skill is never the compiler, the workflow engine, the authorization
mechanism or the source of truth. The trigger is an ACCEPTED TYPED
INTENT EVENT — `validateMoneyMovementIntent` (exact 10 keys) or
`validatePaymentIntent` (exact 11 keys) from `@payswap/economic` —
never free text, never an LLM guess, never a provider webhook, never
the composer opening. Prose cannot construct a trigger: a builder that
accepts a string where the validated pin shape is required is
UNCONSTRUCTIBLE by type. One idempotency/correlation key admits at
most one routine start; an identical re-record replays
(`started: false`); a divergent re-record is a typed
`TriggerConflictError`.

## D2 — The planner composes through injected fail-closed ports; src stays pin-only

`packages/route-planning` is a NEW intelligence-layer package
(`spec/architecture/MODULE-OWNERSHIP.yaml` annotation). Its SRC never
imports a sibling package: every cross-package surface (economic
intent pins, capability corridor shapes, route-compiler contracts, Lab
scenario machinery, opportunities matching) is a LOCAL STRUCTURAL PIN
in `src/pins/` (the `@payswap/opportunities` precedent), and every
REAL engine is reached only through INJECTED PORTS whose default
implementations FAIL CLOSED with typed errors (the
`@payswap/agents` `authority-port` composition-root precedent). The
REAL engines are bound at the TEST tier (relative imports — no
cross-package test import exists in the tree today, and the boundary
law keeps it that way) and later at the platform host's composition
root. An unbound engine is an honest "not wired" note, never a
fallback to LLM-only routing (ROUTINE-CONTRACT acceptance).

## D3 — The lane map is file-disjoint; three workers may run concurrently

- **Lane A (worker-1)** owns `packages/route-planning/**` EXCEPT
  `src/trigger.ts`, `src/manifest.ts`, `src/lab-adapter.ts` and the
  composition-E2E tests (TL-owned in P16-D): the eligible-rail
  snapshot contracts, candidate enumeration, typed hard-gate
  exclusions, transparent ranking projection, bounded search budget,
  the package bootstrap (boundary laws + census) and the importer
  registration.
- **Lane B (worker-2)** owns exactly `packages/lab/src/interventions.ts`
  + `scenario-budget.ts` + their tests + the disclosed lab boundary
  census re-pin, and `packages/protocol/src/credit-instrument.ts` +
  `group-payment.ts` + `netting-proposal.ts` + their tests. Nothing
  else in lab/protocol may be edited; barrels stay unwired in-lane.
- **Lane C (worker-3)** owns exactly the five NEW
  `packages/opportunities/src/{offer-lifecycle,consent,matching,wait-criteria,offer-limits}.ts`
  + their five test files + the disclosed boundary census re-pin.
- **Lane D (TL)** owns `route-planning/src/{trigger,manifest,lab-adapter}.ts`
  + the composition battery, the lab/protocol barrels, the surface
  vocabulary two-step (D4), the payswap-app UX, the spec/state closure.
- No lane edits another lane's files; the only shared-file contacts are
  the two DISCLOSED census re-pins (lab 28/20/16→30/22/18,
  opportunities 26/16→31/21) which each land inside their own lane.
- **Workers do not commit.** The TL verifies each claim against the
  battery + `tsc --noEmit`, then commits per lane and pushes
  immediately (D7).

## D4 — One digest flavor: the value-form canonicalization

Route-planning digests use the route-compiler canonical form —
recursively key-sorted JSON text with bigint rendered `b:<decimal>`
and number rendered `n:<decimal>` — hashed with FNV-1a 64 and namespaced
`fnv1a64:<16-hex>`. Digests compute over the VALUE (the canonical
projection), NEVER over a `JSON.stringify` round-trip of already-parsed
text, and never mix the economic package's bare-hex/plain-JSON flavor
into the same namespace. Identical inputs/caller-time/seeds produce
byte-identical digests; caller-supplied time everywhere (no
`Date.now`/`new Date`/`Math.random` in src — the boundary determinism
law).

## D5 — Record-only protocol semantics; the gross ledger is never rewritten

The three NEW protocol modules are RECORD-ONLY models over the existing
machinery: a `CreditInstrument` is an evidenced, authorization-lined
record (NON-EMPTY `evidenceIds`; opaque `AuthorizationRef`) — never
liquidity, never funds, with the hypothetical scenario structurally
separate (`conditional: true`, empty evidence, `hypotheticalCreditIsNeverFunds()
=== false`, no conversion path); a `GroupPaymentPlan` gates charging on
explicit unrevoked per-party consent and derives settlement stubs
WITHOUT touching the gross obligations; a `NettingProposal` settles
members ONLY through the EXISTING `settleObligation` machine after
`canTransition` pre-guards every member (all-or-nothing). The v1
same-currency netting law is NOT amended; the credit EXECUTION kernel
stays DEFERRED (FINANCIAL-PROTOCOL deferral register unamended);
counterfactual interventions never update production facts, obligations,
balances, authority or opportunities (advisory tier, INV-11).

## D6 — Bounded searches disclose truncation; completeness is never claimed when capped

Every bounded enumeration (scenario suites, candidate admissions,
offer publications) is COUNT-BASED (no wall clock), validates every
candidate through the owning module's fail-closed validator BEFORE
admission, admits greedily in a canonical order while all dimension
counters fit, and emits one truncation receipt per truncating dimension
carrying the TRUE pre-cut candidate count with `disclosedAs:
"TRUNCATED"`. The coverage verdict is `COMPLETE` only when NO receipt
exists — structurally, a receipt implies an exclusion. Digests cover
budget + selection + receipts + coverage and are input-order
independent.

## D7 — Accepted work is pushed at the moment of acceptance

A completed, battery-proven lane that exists only on one station is
NOT accepted work — the reset that destroyed the first P16
implementation (four commits, 1,446 tests, never pushed) is the
governing precedent. The TL commits each accepted lane and pushes to
`origin/main` (plus a local bundle archive under the operator's
persistent project directory) before dispatching the next dependency.
Nothing in this ADR weakens the repository-authority rule: the push IS
the record, the conversation is not.

## D8 — The wait vocabulary moves in ONE change and never dispatches

Adding `WAITING_FOR_OPPORTUNITIES` to the surface vocabulary is an
additive MINOR (`SURFACE_API_VERSION` 1.3.0→1.4.0) that must move the
authority, the pinned status/event lists, BOTH mirror packages
(payswap-app agent-task pins + STATUS_VIEW honest label + app
surface-pins version; desktop payments contracts) and their mirror
tests in a SINGLE change — a half-moved vocabulary is a compile error
by design (the `STATUS_VIEW` record is exhaustive over the pin). The
wait semantics are laws, not preferences: a wait match records
`OPPORTUNITY_MATCHED` and the task STAYS WAITING (only cancel/expire/
fresh-approval move it); `AGENT_TASK_WAIT_VOCABULARY.matchAutoDispatches`
is the literal `false`; the app NEVER writes `AUTHORIZATION_GRANTED`
(that event belongs to the real authority surface); the matching
result is STRUCTURALLY pure (no action/command/dispatch/execute/
authorize key at any name); `waitingNeverDispatches === false` is a
pinned literal, never a derived value.

## D9 — Census re-pins are disclosed deviations that keep the pins exact

The lab and opportunities boundary tests pin EXACT file counts. A lane
that legitimately adds files re-pins the census to the new exact count
with an explanatory comment, keeping `toBe` (never loosening to
ranges). The census law's STRENGTH is unchanged: still
machine-checked exact counts. This is the established precedent
(P16-B/P16-C first-round records) and applies to the new package's
own boundary test from its first commit.
