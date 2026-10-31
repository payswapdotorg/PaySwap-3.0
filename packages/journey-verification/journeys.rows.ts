/**
 * @payswap/journey-verification — the JOURNEY ROWS (the P22-D file-law
 * split from ./journeys.manifest.ts at the ≤400-line law, along the
 * module's own documented seams): this file owns the LIVING rows (J20+),
 * ./journeys.retired.ts owns the frozen history (J1–J19), and the
 * manifest stays the single import surface (the façade). The ordered
 * J1..J25 law is preserved BY CONSTRUCTION (the retired rows concatenate
 * first).
 */

import type { JourneyRow } from "./journeys.types.js";
import { RETIRED_JOURNEYS } from "./journeys.retired.js";

/** The canonical journey map (J1–J19 retired + J20+ living), ordered. */
export const JOURNEYS: readonly JourneyRow[] = [
  ...RETIRED_JOURNEYS,
  {
    id: "J20",
    title: "Shared agent entrypoints — one composer, every surface",
    route: "/ → /console (the substrate shell — every pathname boots the substrate Root; the composer mounts on all of it)",
    control: "the persistent, toggleable PaySwap agent composer (dock + panel)",
    prerequisite: "none (the composer works standalone in the browser profile, honestly labeled)",
    honestState:
      "the composer mounts on the home, app overview, payments, connections and accounts surfaces AND the Agent Workspace — every entrypoint drives the ONE shared controller (one task list, one history); the panel renders the zero-authority note, the no-tools note and the declared-unsupported VOICE statement verbatim; never a microphone control; secrets never enter chat (secret-shaped text is refused before it is recorded)",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the composer plane (packages/payswap-app/src/agent/, Lane P13-A) — @contract, gates at TL integration on the merged tree (specs/agent-composer-surfaces.spec.ts)",
  },
  {
    id: "J21",
    title: "Chat → “connect Stripe” seeds the ONE resumable setup task",
    route: "/ (the composer text path on the substrate shell)",
    control: "the composer text path (the pre-strip connect CARDS retired with the P15 strip — the desktop product tier carries the surface entrypoints)",
    prerequisite: "no provider connection exists (the honest empty; a catalogue entry is never a connection)",
    honestState:
      "a card click and a typed “connect Stripe” reach the SAME resumable CONNECTION_SETUP task inside the window — CREATED then RESUMED, never a duplicate; the task record states nothing is connected (a connection exists only when the connection plane records real provider evidence); Stripe is the one declared provider and no other is ever offered; the U2/U3 forms state their exact missing operator configuration (never simulated OAuth)",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the convergence law (agent-task seedOrResume + the Connections integration, Lane P13-A; the connection plane machinery, Lane P13-B) — @contract, gates at TL integration (specs/agent-composer-convergence.spec.ts)",
  },
  {
    id: "J22",
    title: "Pay by text — the payment-intake task; voice honestly unsupported",
    route: "/ (the composer text path on the substrate shell)",
    control: "the composer text path (the pre-strip direction CARDS retired with the P15 strip — the desktop product tier carries the surface entrypoints)",
    prerequisite: "no payment can dispatch (the preview→authorization→execution path is host-side; the composer holds zero financial authority)",
    honestState:
      "a Pay-card click and a typed “pay the supplier” seed the SAME resumable PAYMENT_MISSION task; checkout has NO card (no direction exists in the mission vocabulary — never a guessed seed); the card copy states starting a task pays nothing; voice input is not supported in this deployment and is never simulated",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the payment-intake seeding (agent-payment-entries + the Payments integration, Lane P13-A; the mission runtime, Lane P13-C) — @contract, gates at TL integration (specs/agent-composer-convergence.spec.ts)",
  },
  {
    id: "J23",
    title: "Composer durability — minimize/reopen and reload never lose context",
    route: "/ (any substrate-shell surface)",
    control: "the composer dock/panel toggle + the browser-profile task store",
    prerequisite: "the standalone browser-profile persistence (honestly labeled: not synced anywhere, clearing site data removes it)",
    honestState:
      "minimize returns focus to the dock and keeps the draft + transcript + tasks; reopen restores them; a full page reload preserves the task list and history (restart resume at the browser-profile tier); Escape minimizes; the transcript is a polite live region",
    tier: 2,
    baseSurface: null,
    integrationNote:
      "the composer UI-state + task-store persistence (Lane P13-A) — @contract, gates at TL integration (specs/agent-composer-convergence.spec.ts)",
  },
  {
    id: "J24",
    title: "The task-tier agent journey — New Task through the composer; the mission/model tiers honestly unbound",
    route: "/console",
    control: "the composer dock → the panel's text input (the New Task path)",
    prerequisite: "none (the composer works standalone in the browser profile, honestly labeled)",
    honestState:
      "a payment-shaped request (e.g. \"Pay merchant X\") seeds ONE task that lands on the composer's task board with its honest draft status; the model/difficulty controls render the honest unbound-catalog note VERBATIM with ZERO model options (never a fabricated list); the mission tier's honest unbound note renders VERBATIM in the conversation; the routine-stage checklist and the route-planning section render their honest unbound notes with ZERO fabricated progress, ZERO routes, ZERO choice controls; the task record survives a full reload (browser-profile tier)",
    tier: 1,
    baseSurface: "/console",
    integrationNote:
      "the P21-D web-tier E2E law (ADR-0014 D10 + D2's web analogue: the web build renders the task tier + the honest unbound notes, never a faked mission tier — the desktop tier carries the full bound journey). The J20–J23 composer surfaces are LANDED in the merged tree, so this row is tier-1 base-green. POST-P15 ROUTING: every pathname boots the same substrate shell with the composer mounted beside it — /console is the console surface this row drives. SERVING: the suite serves the built dist through the REAL substrate HTTP server (ZCODE_WEB_STATIC_ROOT + /ws) — the P15-stripped app cannot boot static-only (see scripts/webserver.mjs). The JOURNEY-MAP.md §1 J24 row + the map reconciliation are the TL's closure item (recorded in the P21-D worklog)",
  },
  {
    id: "J25",
    title: "The corridor journey — a cross-provider payment ask through the composer; the corridor tier honestly never-composed on web",
    route: "/console",
    control: "the composer dock → the panel's text input (a corridor-shaped payment ask)",
    prerequisite: "none (the composer works standalone in the browser profile, honestly labeled)",
    honestState:
      "a corridor-shaped payment request (e.g. \"Send one thousand cedis to a Kenyan bank account over the corridor\") seeds ONE task that lands on the composer's task board with its honest draft status; the mission tier's honest unbound note renders VERBATIM in the conversation (no nine-field corridor intake is simulated on web); the route-planning section renders its honest unbound-engine note VERBATIM with ZERO corridor vocabulary — no corridor plan card, no leg rows, no custody chain, no issuer-scoped relay-asset sentence, no proceed control (the corridor composition is a platform-host binding absent from the web deployment BY DESIGN); the task record survives a full reload (browser-profile tier)",
    tier: 1,
    baseSurface: "/console",
    integrationNote:
      "the P22-D web-tier E2E law (ADR-0016 D10's web analogue + D12's browser row: the browser tier grows the J-rows the no-orphans law requires — the corridor's honest web-tier state, the unbound notes staying honest, zero corridor vocabulary; the desktop tier carries the full bound corridor journey, machine-verified by the scripts/p22 CDP corridor receipt + the in-repo bridge battery). SERVING: the suite serves the built dist through the REAL substrate HTTP server (ZCODE_WEB_STATIC_ROOT + /ws — the J24 precedent). The JOURNEY-MAP.md §10 J25 row + the map reconciliation are the TL's closure item (recorded in the P22-D worklog)",
  },
] as const;
