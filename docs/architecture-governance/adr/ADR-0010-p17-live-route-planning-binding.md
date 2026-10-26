# ADR-0010: The live route-planning binding — renderer composition root over the mission-plane channel

- **Status:** ACCEPTED (TL-gated, 2026-10-26)
- **Scope:** `spec/architecture/MODULE-OWNERSHIP.yaml` package annotations; the desktop renderer build config; the `payswap-desktop` channel contract; the P16 carry-forward items 1+2
- **Resolves:** the P16 closure carry-forward "the live-app engine binding (platform host composition step), stage-9a UI wiring to the desktop authority chain" — `spec/route-planning/ROUTE-PLANNING.md` §5 rows 1-2
- **Law hook:** INVARIANTS.md invariant 29 (frozen architecture changes require ADR + dependency-graph + state updates — this ADR is that record); ADR-0009 D2 ("The REAL engines are bound at the TEST tier … and later at the platform host's composition root")

## Context

P16 delivered the route-planning routine (`@payswap/route-planning`, intelligence
layer, pin-only src, fail-closed injected ports) and the composer UX
(`@payswap/app`: the `RoutePlanningEnginePort` pin, the session, the panel).
The acceptance battery proved the REAL engines compose through the port
(`route-planning-acceptance.test.ts:160-288` — "THE REAL ENGINE ADAPTER (the
composition-root shape the platform host will bind)"). But no host binds it:
`bindRoutePlanningEngine` has zero callers, the panel renders the honest
UNBOUND note, and the choices render as not-wired notes (no session reaches
the mount). Separately, the stage-9a proceed REQUEST has no landing site in
the desktop authority chain (nothing in the mission surface knows route
plans), and the payment-mission runtime — the only source of validated
compiled intents — is exposed on no channel (the P14-carried "renderer
exposure of the payments plane").

The frozen layer graph has no layer whose `may_depend_on` includes
`intelligence`: a platform-host composition of the REAL route-planning
engines is an R3 edge by construction. ADR-0009 D2 always planned this edge
("later at the platform host's composition root"); this ADR is its record.

## Decision

**D1 — The composition root is a desktop-RENDERER module, reached through the
established three-site alias pattern.** `src/renderer` is the one desktop
tree exempt from the no-`@payswap/*` host law (`tsconfig.renderer.json`
has mapped `@payswap/app` to workspace source since P9-A; `DESKTOP.md` binds
the law to `src/host`+main+preload+scheduler). The renderer module imports
the REAL engines (`@payswap/route-planning`, `@payswap/capability`,
`@payswap/route-compiler`, `@payswap/lab`, `@payswap/opportunities`) through
tsconfig.renderer.json paths + vite.config.ts `resolve.alias` +
vitest.config.ts `resolve.alias` (three sites, one source each — the
`@payswap/app` precedent verbatim). The resulting platform→intelligence /
platform→capability edges are accepted as HONEST R3s by additive
`package_layers` annotation comments (the ADR-0004 `packages/agents`
precedent), the ownership report is regenerated and committed (the drift
gate stays the enforcement), and the annotation names this ADR. The
composition surface is NARROW: exactly one renderer module (+ its wiring
line in `main.tsx`); no other desktop src file may import `@payswap/*`
beyond `@payswap/app`.

**D2 — The mission plane is exposed on `payswap-desktop` with read/input
members only.** New channel members: `paymentMissionBoard`,
`paymentMissionDetail`, `paymentMissionSeed`, `paymentMissionCapture`,
`paymentMissionPresentPreview`, `paymentMissionRecordPlanSelection`. All
pass the no-authority-verb law (`/^(execute|retry|cancel|confirm|settle|
payout|approve)/` — `desktop-console-client.test.ts:111-115`); the D7 chain
is preserved: authorization stays minted host-side behind the origin law
(`authorization-gate.ts:33-43` — only `PREVIEW_UI_ACT` approves), and NO
approval/authorization member is exposed in P17 (that remains the P14-carried
renderer-exposure frontier). The two-sided member lists move together
(host `shell/contracts.ts` ↔ renderer `consoleWorkspaceMount.tsx`, drift-
tested).

**D3 — The stage-9a landing site is a NEW typed record on the mission
surface.** `PaymentMissionRecord` grows `planSelection?: { planId,
viewDigest, routineId, routineVersion, selectedAt }` and a new event kind
`PLAN_SELECTION_RECORDED` (21→22 kinds). It is a RECORD, never an
authorization: the composer still NEVER writes `AUTHORIZATION_GRANTED`
(ADR-0009 D8), the artifact is still minted later against the preview, and
the dispatch command is unchanged. The store's persisted-event validator is
re-pinned to the full kind set — fixing the P16-D defect where the four wait
kinds were missing and a wait-carrying mission loaded into quarantine.

**D4 — The engine's mission linkage is the renderer composition root's
rule.** The engine resolves `taskRef` → the latest runtime mission with a
compiled intent (fail-closed with the honest typed no-validated-intent
state when none exists — the anticipated contract,
`routePlanningPins.ts:242-247`). The compiled 11-key intent is mapped
field-by-field into the trigger's `PaymentIntentPin` with a typed guard.
The corridor query derives from the mission's captured fields with the
caller-supplied `asOf`; the chains are the deployment's REAL connected
capability instances — ZERO today — so the REAL `projectCorridor` projects
the honest empty evaluation and the view presents typed exclusions, never
fabricated routes. The scenario section presents the honest empty advisory
state when no recorded production facts exist. The idempotency key is
`route:<missionId>` (one routine start per mission; identical re-record
replays — the D1 law).

**D5 — The session seam is app-side and additive.** `@payswap/app` exports
the composition seams (`bindRoutePlanningEngine` from the barrel; a NEW
module-level `bindRoutePlanningSession` mirroring it) and the mount resolves
`session ?? sharedRoutePlanningSession()`. Product law P2 holds (zero
`@payswap/*` imports in app src — machine-checked); the panel gains the
honest NO_VALIDATED_INTENT state. The stage-9a wiring is a composition-root
decorator over the session: `chooseProceed` records the REQUEST on the task
(the app session, unchanged) AND calls `paymentMissionRecordPlanSelection`
(the mission plane) — two records, zero authority.

**D6 — The lane map is file-disjoint.** P17-A owns
`packages/desktop/src/host/payswap/**` + `test/payswap/*` host tests;
P17-B owns `packages/payswap-app/src/agent/**` + its tests; P17-C (TL)
owns `packages/desktop/src/renderer/**` + the three config sites +
`MODULE-OWNERSHIP.yaml` + the ownership report + the bridge-tier test;
P17-D (TL) is integration + closure. P17-C depends on A+B; A and B are
parallel.

**D7 — The web host stays UNBOUND (honest).** The web mount keeps the
unbound note — there is no web mission plane. The journey promotion is
recorded at the CONTRACT+BRIDGE tier for the desktop (the bridge-tier E2E
drives the REAL channel members + the REAL engines + the golden path);
NO live-tier claim is made while zero connected capability instances exist
(the P16 evidence-separation law, `JOURNEY-MAP.md` §7).

## What this does NOT change

- `@payswap/route-planning` src stays pin-only (ADR-0009 D2); no
  intelligence-layer package gains a platform import.
- The authorization chain, the artifact laws, INV-25, the origin law and
  the dispatch two-phase write-ahead are untouched (D3 adds a record only).
- The no-authority-verb law, the channel middleware law and the §5
  workspace-store contract are untouched (D2 adds members only).
- The `payswap-app` product boundary (law P2) is untouched (D5 is additive).
- Live-provider route evidence, the FLW/Paystack execution lanes, the
  MoMo credential prerequisite and the live webhook delivery remain
  carried-forward frontiers (unchanged by this ADR).

## Consequences

- The module-ownership report gains the D1 R3 edges as committed,
  annotation-documented honest violations (the ADR-0004 class); the strict
  check keeps exiting 1 while the S3-class baseline remains (CI-tolerated),
  and the drift gate pins the new baseline.
- The renderer bundle compiles five more workspace sources through aliases;
  the build stays deterministic (route-planning and siblings are pure TS
  with zero runtime deps — verified).
- The mission-plane channel members become the future payments-plane UX's
  foundation (the P14 carry-forward narrows to the approval/observation UX).
