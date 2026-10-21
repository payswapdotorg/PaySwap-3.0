/**
 * @payswap/app — the RECORDED CONTRACT VOCABULARY of the PaySwap Agent
 * Workspace (console surface, Phase 10).
 *
 * This fixture records spec/surface/CONSOLE-WORKSPACE.md as typed data,
 * transcribed from the doc text INDEPENDENTLY of the src/console mirror
 * (the recorded-contract-vocabulary pattern). The drift test
 * (console-contracts.test.ts) asserts the mirror matches this fixture
 * byte-for-byte: a change on either side is a conscious two-step, never
 * silent drift. When the spec doc changes, update THIS file first, then
 * let the drift test point at every mirror site that must follow.
 */

/** §2 — the eight-section IA (id/title/purpose, verbatim). */
export const CONSOLE_SECTIONS_FIXTURE = [
  {
    id: "overview",
    title: "Overview",
    purpose:
      "Mission-first starting point: in-progress missions, decisions needing attention, recent activity",
  },
  {
    id: "missions",
    title: "Missions",
    purpose:
      "Mission creation, intent review, plan inspection, status, event timeline, evidence, controls",
  },
  {
    id: "agents",
    title: "Agents",
    purpose:
      "Agent identity/capabilities/constraints vocabulary, runtime status, model binding, assignments",
  },
  {
    id: "approvals",
    title: "Approvals",
    purpose:
      "What approvals gate (material terms + authority scope) before consequential actions",
  },
  {
    id: "connections",
    title: "Connections",
    purpose:
      "Actually connected capabilities with honest setup-required/availability states",
  },
  {
    id: "activity",
    title: "Activity & receipts",
    purpose:
      "Authoritative progress, provider observations, finality, reconciliation, evidence",
  },
  {
    id: "lab",
    title: "Lab",
    purpose:
      "Opportunities, experiments and learning — never production execution authority",
  },
  {
    id: "settings",
    title: "Settings",
    purpose:
      "Identity, attribution, store durability, advanced developer tools",
  },
] as const;

/** §4 — the lifecycle ladder prerequisites, VERBATIM. */
export const PREREQUISITES_FIXTURE = {
  INTENT:
    "The intent has not been recorded yet — complete the intake review to record it.",
  ELIGIBILITY:
    "Capability discovery is not configured in this deployment. Missions cannot be evaluated for eligibility until a capability discovery plane exists — nothing here may guess eligibility.",
  PLANNING:
    "No planning plane is configured. Candidate plans are compiled by the economic execution graph when a planning plane exists; this deployment has none — the honest state is planning unavailable, never an invented plan.",
  APPROVAL:
    "No approval plane is configured. Consequential actions require PaySwap authorization — material terms and authority scope — before execution; with no trust plane configured there is nothing to approve and nothing approved.",
  EXECUTION:
    "No execution plane is configured. PaySwap never executes money movement from the console; execution requires the financial protocol with a connected capability, and no capability is connected in this deployment.",
  OBSERVATION:
    "No observations exist. Observations are provider-verified facts recorded by the execution plane; with no execution there is nothing to observe, and UNKNOWN is never rendered as success or failure.",
  EVIDENCE:
    "No evidence records exist. Evidence is produced by reconciliation of executed effects; no effect has been executed.",
} as const;

/** §2 — the path law (recorded resolutions; total, never throws). */
export const PATH_LAW_FIXTURE = {
  root: "/console",
  advanced: "/console/advanced",
  cases: [
    { path: "/console", resolves: "overview" },
    { path: "/console/", resolves: "overview" },
    { path: "/console/overview", resolves: "section:overview" },
    { path: "/console/missions", resolves: "section:missions" },
    { path: "/console/agents", resolves: "section:agents" },
    { path: "/console/approvals", resolves: "section:approvals" },
    { path: "/console/connections", resolves: "section:connections" },
    { path: "/console/activity", resolves: "section:activity" },
    { path: "/console/lab", resolves: "section:lab" },
    { path: "/console/settings", resolves: "section:settings" },
    { path: "/console/nowhere", resolves: "not-found" },
    { path: "/console/Missions", resolves: "not-found" },
    { path: "/console/missions/extra", resolves: "not-found" },
    { path: "/app", resolves: "not-found" },
    { path: "", resolves: "not-found" },
  ],
} as const;

/**
 * §2 — the advanced-path law: "/console/advanced" and every deeper path
 * under it belong to the ZCode developer-workspace MOUNT (the platform
 * splits them BEFORE the workspace renders). If such a path reaches the
 * workspace fold anyway, it resolves to the honest not-found — never an
 * invented section, never a throw.
 */
export const ADVANCED_PATH_FIXTURE = {
  advanced: [
    "/console/advanced",
    "/console/advanced/",
    "/console/advanced/anything",
    "/console/advanced/deeper/still",
  ],
  notAdvanced: [
    "/console",
    "/console/missions",
    "/console/advancedx",
    "/console/nothing/advanced",
  ],
  resolvesTo: "not-found",
} as const;

/** §1 — document titles ("… — PaySwap Agent Console"; root is special). */
export const DOCUMENT_TITLES_FIXTURE = {
  root: "PaySwap — Agent Console",
  section: "Missions — PaySwap Agent Console",
  sectionActivity: "Activity & receipts — PaySwap Agent Console",
  notFound: "Not found — PaySwap Agent Console",
} as const;

/** §3 — the validation law (recorded finding strings of the mirror). */
export const VALIDATION_FIXTURE = {
  limits: { goalStatementMax: 2000, locationHintMax: 200, noteMax: 2000 },
  directions: ["PAY", "RECEIVE", "MOVE", "CONVERT"],
  currencyPattern: "^[A-Z]{3}$",
  minorUnitsPattern: "^(0|[1-9][0-9]*)$",
  findings: {
    goalRequired:
      "The goal statement is required — it must not be empty after trimming.",
    goalTooLong: "The goal statement exceeds the 2000-character limit.",
    directionUnknown:
      "The direction must be one of PAY, RECEIVE, MOVE or CONVERT.",
    amountCurrency:
      "The amount currency must be a three-letter uppercase code (for example USD).",
    amountMinorUnits:
      "The amount minor units must be a canonical non-negative decimal integer (digits only, no sign, no decimal point, no leading zero).",
    fundingHintTooLong:
      "The funding location hint exceeds the 200-character limit.",
    payoutHintTooLong:
      "The payout location hint exceeds the 200-character limit.",
    noteTooLong: "The note exceeds the 2000-character limit.",
  },
} as const;

/** §6 — the section empty states (typed reason + real next action). */
export const EMPTY_STATES_FIXTURE = {
  overview: {
    reason:
      "No missions exist yet. The workspace holds demand-side intent only — nothing has been recorded in this store, so nothing is shown.",
    nextAction: { kind: "console-section", target: "missions", label: "Create the first mission" },
  },
  overviewAllArchived: {
    reason:
      "No missions are in progress — every recorded mission is archived. Archived records stay readable in the Missions section; nothing here is invented in their place.",
    nextAction: { kind: "console-section", target: "missions", label: "Open the missions list" },
  },
  missions: {
    reason:
      "No missions are recorded in this store yet. The creation intake below records the first one.",
    nextAction: { kind: "in-page", target: "missions-intake", label: "Use the creation intake" },
  },
  agents: {
    reason:
      "No agent registry exists in this deployment — no agent identities, runtime statuses or assignments are recorded, and none are invented here.",
    nextAction: { kind: "in-page", target: "agents-vocabulary", label: "Read the agent-contract vocabulary" },
  },
  approvals: {
    reason:
      "No approval plane is configured — there is nothing to approve and nothing approved. No approval can be minted from this workspace.",
    nextAction: { kind: "in-page", target: "approvals-reference", label: "See what approvals gate" },
  },
  connections: {
    reason:
      "No capability is connected in this deployment — zero connected instances. A catalogue capability is never a connection; execution is scoped to actual account authorization.",
    nextAction: { kind: "product", target: "product", label: "Connect capabilities in the PaySwap product" },
  },
  activity: {
    reason:
      "No mission events are recorded yet — activity here is the real mission record, never fabricated history.",
    nextAction: { kind: "console-section", target: "missions", label: "Create a mission" },
  },
  lab: {
    reason:
      "No experiments exist — the Lab holds no experiment records in this deployment, and none are simulated here.",
    nextAction: { kind: "in-page", target: "lab-reference", label: "Read the Lab law and the opportunities family" },
  },
  overviewAttention: {
    reason:
      "No approval plane is configured in this deployment — there are no decisions awaiting action. What approvals gate (material terms and authority scope) is reference material in the Approvals section.",
    nextAction: { kind: "console-section", target: "approvals", label: "See what approvals gate" },
  },
} as const;

/** §6 — the reference vocabularies (term sets; clearly REFERENCE). */
export const REFERENCE_VOCABULARY_FIXTURE = {
  agents: [
    "Agent body",
    "Capabilities",
    "Constraints",
    "Model binding",
    "Runtime status",
    "Assignments",
  ],
  approvals: ["Material terms", "Authority scope", "Before execution"],
  connections: [
    "Catalogued capability",
    "Setup required",
    "Connected instance",
    "Availability",
  ],
  activityOutcomes: ["Confirmed", "Unknown", "Failed", "Late returns"],
  labLaw:
    "Simulated routes/events are advisory/test evidence only; no production financial authority.",
  opportunitiesFamily: [
    "The opportunities family discovers evidence-backed FinancialOpportunity candidates across rails.",
    "Discovery is advisory evidence only — no direct authorization, no execution, no fabricated opportunities.",
  ],
} as const;

/** §5 — the store durability labels (per-mount honest facts). */
export const DURABILITY_FIXTURE = {
  DESKTOP_PROFILE: {
    label: "Desktop profile store",
    fact:
      "Missions are stored by the PaySwap desktop host under the PaySwap user-data directory, and survive app restarts.",
  },
  BROWSER_PROFILE: {
    label: "Browser profile store",
    fact:
      "Missions are stored in this browser profile only — clearing site data removes them, and they do not follow you to other devices.",
  },
} as const;

/** §6 settings — identity, attribution, the advanced entry. */
export const SETTINGS_FIXTURE = {
  identity: { name: "PaySwap", line: "A non-custodial economic operating system." },
  attribution:
    "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).",
  advancedEntry: {
    label: "Advanced developer workspace",
    path: "/console/advanced",
  },
  modelProvidersNone:
    "No model provider is configured — honestly reported as none, never invented as connected.",
} as const;
