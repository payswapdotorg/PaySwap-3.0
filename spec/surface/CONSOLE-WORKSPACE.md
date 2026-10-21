# PaySwap Agent Workspace — Console Contract (Phase 10)

Status: REGISTERED 2026-10-21 by the resident TL (operator TL handoff:
"PaySwap 3.0 Agent Console Productization"). This document is the
cross-lane contract for the agent workspace console experience. It
EXTENDS the surface plane (SURFACE-CONTRACTS.md) with a new contract
family — console workspace projections — without altering any frozen
§1–§11 law of that document. Where this document and any inherited
substrate default disagree for the console surface, this document wins,
EXCEPT where upstream attribution is legally required
(PRODUCT-IDENTITY.md §4).

Lanes: P10-A implements these presentation contracts + folds in
`@payswap/surface`; P10-B implements the desktop integration
(packages/desktop: the mission-intake store + host service extension +
the renderer console mount with the payswap-desktop channel client;
packages/web: the /console mount with the BROWSER_PROFILE store);
P10-C implements the workspace views in `@payswap/app` (the TL wires
the final component imports at integration — the established
cross-lane law); P10-D records the journeys, evidence and
the J14 acceptance verdict. The TypeScript shapes in §3/§5 are PINNED
byte-exact — every lane implements to these shapes; drift is a defect.

## 1. Position and identity law

The Agent Workspace is the console surface of PaySwap — a SUPPORTING
capability (J14), never the default landing (PRODUCT-IDENTITY.md §3).
It is PaySwap-branded end-to-end: the existing `ps-` design system
(warm-neutral + restrained-emerald; amber for attention/UNKNOWN; red
for failure), the PaySwap wordmark, and PaySwap document titles
(`"… — PaySwap Agent Console"` route-specific; the workspace root
reads `"PaySwap — Agent Console"`).

It renders PROJECTIONS only (SV-6): it never owns financial truth,
never invents balances, providers, agents, history, approval counts or
successes, and carries the honesty laws of PRODUCT-IDENTITY.md §5
verbatim. `UNKNOWN` is never rendered as failure or success (SV-3).

The ZCode-derived developer workspace (the substrate Root mount with
its services wiring untouched) remains reachable as the ADVANCED
TECHNICAL INTERFACE at `/console/advanced` (desktop hash:
`#/console/advanced`), clearly labeled as the developer workspace of
the upstream platform — never the default console experience, never
branded away, never removed.

## 2. Workspace information architecture

Eight product sections (the workspace navigation contract):

| Section id | Title | Purpose (one line) |
|---|---|---|
| `overview` | Overview | Mission-first starting point: in-progress missions, decisions needing attention, recent activity |
| `missions` | Missions | Mission creation, intent review, plan inspection, status, event timeline, evidence, controls |
| `agents` | Agents | Agent identity/capabilities/constraints vocabulary, runtime status, model binding, assignments |
| `approvals` | Approvals | What approvals gate (material terms + authority scope) before consequential actions |
| `connections` | Connections | Actually connected capabilities with honest setup-required/availability states |
| `activity` | Activity & receipts | Authoritative progress, provider observations, finality, reconciliation, evidence |
| `lab` | Lab | Opportunities, experiments and learning — never production execution authority |
| `settings` | Settings | Identity, attribution, store durability, advanced developer tools |

Routing law (shared; mounts translate to hash or history):

- console root (`/console`, `#/console`) → `overview`;
- `/console/<section>` for the eight ids above;
- `/console/advanced` (and any deeper path under it) → the ZCode
  developer workspace mount (P10-C; NOT a workspace section);
- an unknown section path → the workspace's honest not-found state
  (inside the workspace chrome), never the ZCode shell, never a blank
  screen;
- navigation between product surface ↔ workspace sections MUST NOT
  reload the renderer (desktop hash switch; web history push).

## 3. Mission vocabulary (pinned view-models)

`AmountSpec` is the pinned surface wire form (SURFACE-CONTRACTS.md §2),
reused here unchanged.

```ts
export type MissionIntentDirection = "PAY" | "RECEIVE" | "MOVE" | "CONVERT";

export interface MissionIntakeInput {
  /** Non-empty after trim, at most 2000 characters. */
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  /** Optional until known; when present it must satisfy the AmountSpec law. */
  readonly amount?: AmountSpec;
  /** Optional free-text location hints, at most 200 characters each. */
  readonly fundingLocationHint?: string;
  readonly payoutLocationHint?: string;
  /** Optional note, at most 2000 characters. */
  readonly note?: string;
}

export type MissionDraftStatus = "DRAFT" | "INTENT_RECORDED" | "ARCHIVED";

export type MissionLifecycleRung =
  | "INTENT"
  | "ELIGIBILITY"
  | "PLANNING"
  | "APPROVAL"
  | "EXECUTION"
  | "OBSERVATION"
  | "EVIDENCE";

export type MissionRungState =
  | { readonly rung: "INTENT"; readonly state: "REACHED" }
  | {
      readonly rung: MissionLifecycleRung;
      readonly state: "NOT_REACHED_PREREQUISITE";
      /** The typed prerequisite, carried verbatim from §4. */
      readonly prerequisite: string;
    };

export type MissionEventKind =
  | "CREATED"
  | "REVISED"
  | "INTENT_VALIDATED"
  | "ARCHIVED";

export interface MissionEvent {
  /** Stable within the store; assigned by the store adapter. */
  readonly id: string;
  /** ISO-8601 UTC instant, explicit input — never an ambient clock. */
  readonly at: string;
  readonly kind: MissionEventKind;
  readonly summary: string;
}

export interface MissionStructuralValidation {
  readonly ok: boolean;
  /** Empty iff ok; human-readable findings otherwise. */
  readonly findings: readonly string[];
}

export interface MissionRecord {
  /** Stable, store-assigned, never reused, non-empty. */
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: MissionDraftStatus;
  readonly intake: MissionIntakeInput;
  readonly structuralValidation: MissionStructuralValidation;
  /** Reverse-chronological (newest first), never rewritten. */
  readonly events: readonly MissionEvent[];
}

export interface MissionSummary {
  readonly id: string;
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  readonly amount?: AmountSpec;
  readonly status: MissionDraftStatus;
  readonly updatedAt: string;
}

export interface MissionDetail {
  readonly summary: MissionSummary;
  readonly record: MissionRecord;
  /** The §4 ladder fold result for this record. */
  readonly ladder: readonly MissionRungState[];
  /** Honest evidence line — verbatim from §4 EVIDENCE when unreached. */
  readonly evidenceNote: string;
}
```

Validation law (`validateMissionIntake`): fail-closed, deterministic,
returns `MissionStructuralValidation`; the AmountSpec law is enforced
exactly (currency `/^[A-Z]{3}$/`, canonical non-negative decimal
integer minorUnits); trimmed-length bounds enforced per field; unknown
direction is a finding (never silently coerced).

## 4. Lifecycle ladder law (typed prerequisites, verbatim)

`foldMissionLadder(record)`: `INTENT` is `REACHED` exactly when
`status === "INTENT_RECORDED"` (or `ARCHIVED`, which preserves the
reached rungs at archive time); every other rung renders
`NOT_REACHED_PREREQUISITE` with the VERBATIM string:

- INTENT (when not reached): `"The intent has not been recorded yet —
  complete the intake review to record it."`
- ELIGIBILITY: `"Capability discovery is not configured in this
  deployment. Missions cannot be evaluated for eligibility until a
  capability discovery plane exists — nothing here may guess
  eligibility."`
- PLANNING: `"No planning plane is configured. Candidate plans are
  compiled by the economic execution graph when a planning plane
  exists; this deployment has none — the honest state is planning
  unavailable, never an invented plan."`
- APPROVAL: `"No approval plane is configured. Consequential actions
  require PaySwap authorization — material terms and authority scope —
  before execution; with no trust plane configured there is nothing to
  approve and nothing approved."`
- EXECUTION: `"No execution plane is configured. PaySwap never executes
  money movement from the console; execution requires the financial
  protocol with a connected capability, and no capability is connected
  in this deployment."`
- OBSERVATION: `"No observations exist. Observations are
  provider-verified facts recorded by the execution plane; with no
  execution there is nothing to observe, and UNKNOWN is never rendered
  as success or failure."`
- EVIDENCE (the `evidenceNote`): `"No evidence records exist. Evidence
  is produced by reconciliation of executed effects; no effect has been
  executed."`

The ladder is the authority chain of AGENTS.md rendered honestly:
Goal/Intent → Eligibility → Planning → Approval → Execution →
Observation → Evidence. No client component, model, tool permission or
simulated result may mark a rung reached.

## 5. Workspace store port and adapter laws

```ts
export type WorkspaceStoreDurability = "DESKTOP_PROFILE" | "BROWSER_PROFILE";

export interface WorkspaceStorePort {
  readonly durability: WorkspaceStoreDurability;
  listMissions(): Promise<readonly MissionSummary[]>;
  recordMissionDraft(
    input: MissionIntakeInput,
    now: string,
  ): Promise<MissionRecord>;
  /** The intent-review step: DRAFT → INTENT_RECORDED. */
  recordMissionIntent(id: string, now: string): Promise<MissionRecord>;
  missionDetail(id: string): Promise<MissionDetail | null>;
  reviseMissionDraft(
    id: string,
    input: MissionIntakeInput,
    now: string,
  ): Promise<MissionRecord>;
  archiveMissionDraft(id: string, now: string): Promise<MissionRecord>;
}
```

Adapter laws:

- DESKTOP_PROFILE (P10-B): the store lives in the desktop main-process
  host, persisted as JSON under the PaySwap user-data directory; it
  survives app restarts; ids are assigned by the host; the renderer
  reaches it through the existing `payswap-desktop` service channel.
- BROWSER_PROFILE (P10-C, web mount): browser localStorage under a
  namespaced key; honest labeling (`"stored in this browser profile
  only"`); ids assigned locally.
- Both adapters: structural validation before recording (§3); a
  malformed persisted record is surfaced as a typed store finding and
  NEVER rendered as a mission (fail-closed, never silently dropped);
  events are append-only (history is never rewritten); `now` is an
  explicit input (deterministic, testable); `recordMissionIntent`
  transitions `DRAFT → INTENT_RECORDED` exactly when
  `structuralValidation.ok` (emitting `INTENT_VALIDATED`) and fails
  closed with a typed error otherwise — never silently coerced.
- The store holds DEMAND-SIDE INTENT ONLY. It is not financial truth,
  not authorization, not capability state (AGENTS.md financial
  boundary; INV-1/INV-23).

## 6. Section fold laws

All folds are pure, deterministic, fail-closed (typed errors), and
render honest empty states (SV-8: typed reason + real next action,
never a failure tone, never a dead action):

- `overview`: in-progress missions (`status !== "ARCHIVED"`); an
  attention line carrying the honest approvals-plane fact; recent
  activity = real mission events (reverse-chronological, capped at 20);
  when no missions exist, the designed-empty state with the
  create-first-mission next action (which WORKS — §5 store).
- `missions`: the real mission list (summaries) + creation intake
  (goal statement, direction, optional amount, hints, note) with
  structural validation findings rendered verbatim; the intent-review
  step (record draft → review → record intent); mission detail =
  summary + record + ladder (§4) + events + evidenceNote.
- `agents`: honest empty (no agent registry exists in this deployment)
  + the agent-contract vocabulary projection (body/capabilities/
  constraints/model binding/runtime status) as reference, clearly
  labeled as vocabulary, never as registered agents; the model-binding
  row MAY project REAL substrate model-provider connection state when
  the mount supplies it (optional input; absent = honest none).
- `approvals`: honest empty + what approvals gate (material terms and
  authority scope, per the trust contracts) as reference; no approval
  may be minted from the workspace.
- `connections`: the real coverage facts (`NO_EVIDENCE_COVERAGE`
  honest input: zero connected) + the connection lifecycle vocabulary
  as reference + the substrate model-provider connections when
  supplied by the mount; setup-required states typed, with the route
  to resolve.
- `activity`: real mission events + the outcome-state reference
  (UNKNOWN ≠ FAILED, reconciliation-first, late-returns-possible)
  rendered as clearly-labeled reference states — never as live
  activity; `role="status"` for UNKNOWN (never `alert`).
- `lab`: honest empty (no experiments) + the Lab law verbatim
  (simulation is advisory/test evidence only, never production
  financial authority) + the opportunities-family vocabulary.
- `settings`: PaySwap identity; upstream attribution (legal,
  PRODUCT-IDENTITY §4); the store durability fact for THIS mount; the
  advanced developer workspace entry (clearly labeled, secondary).

## 7. Determinism, fail-closed, no authority verbs

Console contract code follows SURFACE-CONTRACTS.md §10: pure folds,
explicit `now`, no ambient clock/locale/registry; typed errors; no
export name matches the authority-verb list (SV-6 machine check
extends to this family). The store port is the ONLY mutation surface,
and it mutates demand-side intent records only.

## 8. Branding and accessibility laws

- Zero ZCode product branding in the eight product sections; the
  developer workspace entry and the legal/about surfaces carry the
  upstream attribution (PRODUCT-IDENTITY §4).
- WCAG 2.2 AA for the workspace: keyboard-traversable navigation,
  visible focus, semantic landmarks (`nav`/`main`/`section` with
  accessible names), `aria-current` on the active section, honest
  `role="status"`/`alert` semantics, reduced-motion respected, minimum
  44px touch targets, responsive 1280×800 / 1440×900 / 390×844.
- Every navigation item and visible action works or explains its typed
  prerequisite with a route to resolve it (zero dead buttons).

## 9. Wave verification gates (P10-D, each on its own evidence)

1. Desktop launch opens the PaySwap product surface (not the console).
2. Opening `#/console` renders the PaySwap Agent Workspace — PaySwap
   chrome and navigation, not the ZCode shell with a floating button.
3. Console ↔ product navigation without a renderer reload.
4. Console section navigation works; every visible mission action
   works (create → validate → record draft → record intent → detail →
   revise → archive) or states its typed prerequisite (ladder rungs).
5. No fabricated state anywhere: no-provider state shown as such;
   UNKNOWN/reconciliation rendering verified (reference projection)
   with status semantics.
6. Agent model configuration (substrate model providers) remains
   distinct from agent-body capabilities and authorization.
7. Automated: surface/desktop/app/web suites green; journeys.yml
   console specs green at the exact commit; axe-core critical pass on
   the console sections at both viewports.
8. Real inspection: desktop GUI launch (station Xvfb method) with
   screenshots of PaySwap home, console overview, mission detail,
   approval detail (honest empty), no-provider state, and the
   UNKNOWN/reconciliation reference rendering.
9. JOURNEY-ACCEPTANCE-RECORD.md J14 updated ONLY after 1–8 pass.
