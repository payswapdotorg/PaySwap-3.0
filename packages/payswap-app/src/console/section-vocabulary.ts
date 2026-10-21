/**
 * @payswap/app — the workspace section VOCABULARY (console surface).
 *
 * The §6 section fold inputs that are NOT mission data: the honest
 * empty-state reasons + real next actions, the reference vocabularies
 * (agents / approvals / connections / activity / lab), the store
 * durability labels and the settings facts. Everything here is typed
 * READONLY REFERENCE DATA — §6's law: vocabulary renders as clearly
 * labeled reference, never as registered agents, live approvals,
 * connected capabilities, live activity or running experiments. The
 * words are pinned by the recorded contract fixture
 * (test/payswap/console-contract-fixture.ts) and the drift test.
 *
 * Pure module: no React, no DOM, no ambient state (§7).
 */

import type { ConsoleSectionId, WorkspaceStoreDurability } from "./contracts.js";

/* ====================================================================
 * Section empty states (SV-8: typed reason + real next action)
 * ==================================================================== */

/** Where an empty state's real next action leads. */
export type ConsoleNextActionKind =
  | "console-section"
  | "in-page"
  | "product";

export interface ConsoleNextAction {
  readonly kind: ConsoleNextActionKind;
  /** console-section: the target section id; in-page: the anchor id. */
  readonly target: string;
  readonly label: string;
}

export interface ConsoleEmptyStateSpec {
  readonly reason: string;
  readonly nextAction: ConsoleNextAction;
}

/** overview — designed-empty when no missions exist (§6). */
export const OVERVIEW_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No missions exist yet. The workspace holds demand-side intent only — nothing has been recorded in this store, so nothing is shown.",
  nextAction: {
    kind: "console-section",
    target: "missions",
    label: "Create the first mission",
  },
};

/**
 * overview — the honest reason when missions EXIST but every one is
 * archived: "no missions exist yet" would be a lie (records exist), so
 * the typed reason states what is true (nothing in progress). The §6
 * two-reason reading, matching the P10-A fold (foldWorkspaceOverview
 * distinguishes records.length === 0 from the all-archived case).
 */
export const OVERVIEW_ALL_ARCHIVED_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No missions are in progress — every recorded mission is archived. Archived records stay readable in the Missions section; nothing here is invented in their place.",
  nextAction: {
    kind: "console-section",
    target: "missions",
    label: "Open the missions list",
  },
};

/** missions — the empty list state (the intake is on the page). */
export const MISSIONS_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No missions are recorded in this store yet. The creation intake below records the first one.",
  nextAction: {
    kind: "in-page",
    target: "missions-intake",
    label: "Use the creation intake",
  },
};

/** agents — honest empty (no agent registry exists, §6). */
export const AGENTS_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No agent registry exists in this deployment — no agent identities, runtime statuses or assignments are recorded, and none are invented here.",
  nextAction: {
    kind: "in-page",
    target: "agents-vocabulary",
    label: "Read the agent-contract vocabulary",
  },
};

/** approvals — honest empty; nothing can be approved from the workspace. */
export const APPROVALS_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No approval plane is configured — there is nothing to approve and nothing approved. No approval can be minted from this workspace.",
  nextAction: {
    kind: "in-page",
    target: "approvals-reference",
    label: "See what approvals gate",
  },
};

/** connections — the honest no-provider state (zero connected). */
export const CONNECTIONS_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No capability is connected in this deployment — zero connected instances. A catalogue capability is never a connection; execution is scoped to actual account authorization.",
  nextAction: {
    kind: "product",
    target: "product",
    label: "Connect capabilities in the PaySwap product",
  },
};

/** activity — designed-empty when no mission events exist. */
export const ACTIVITY_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No mission events are recorded yet — activity here is the real mission record, never fabricated history.",
  nextAction: {
    kind: "console-section",
    target: "missions",
    label: "Create a mission",
  },
};

/** lab — honest empty (no experiments). */
export const LAB_EMPTY_STATE: ConsoleEmptyStateSpec = {
  reason:
    "No experiments exist — the Lab holds no experiment records in this deployment, and none are simulated here.",
  nextAction: {
    kind: "in-page",
    target: "lab-reference",
    label: "Read the Lab law and the opportunities family",
  },
};

/** overview — the honest attention line (approvals plane unconfigured). */
export const OVERVIEW_ATTENTION = {
  reason:
    "No approval plane is configured in this deployment — there are no decisions awaiting action. What approvals gate (material terms and authority scope) is reference material in the Approvals section.",
  nextAction: {
    kind: "console-section" as const,
    target: "approvals" as const,
    label: "See what approvals gate",
  },
};

/* ====================================================================
 * Reference vocabularies (§6 — clearly labeled REFERENCE, never live)
 * ==================================================================== */

export interface ReferenceTerm {
  readonly term: string;
  readonly line: string;
}

/** agents — the agent-contract vocabulary (body/capabilities/constraints/…). */
export const AGENT_CONTRACT_VOCABULARY: readonly ReferenceTerm[] = [
  {
    term: "Agent body",
    line: "Who the agent is — identity, home surface and authority boundary. A body exists only when a registry records it.",
  },
  {
    term: "Capabilities",
    line: "What the agent may do — the declared capability set, distinct from model configuration and from authorization.",
  },
  {
    term: "Constraints",
    line: "What the agent may never do — the hard constraints that bind every action the agent takes.",
  },
  {
    term: "Model binding",
    line: "Which model provider the agent talks through — substrate configuration, never a capability and never authority.",
  },
  {
    term: "Runtime status",
    line: "Live runtime facts about the agent — recorded from real runtime observation only, never assumed.",
  },
  {
    term: "Assignments",
    line: "Which missions an agent is assigned to — an assignment is recorded, never inferred.",
  },
];

/** approvals — what approvals gate (material terms + authority scope). */
export const APPROVALS_GATE_VOCABULARY: readonly ReferenceTerm[] = [
  {
    term: "Material terms",
    line: "What an approval gates on the action side — the amount, the corridor, the counterparties, the fees and the expiry of the terms being approved.",
  },
  {
    term: "Authority scope",
    line: "Who may approve what — the mandate that bounds an approval: which actions, which limits, whose authorization.",
  },
  {
    term: "Before execution",
    line: "When the gate applies — consequential actions require approval before execution; an unapproved consequential action never proceeds.",
  },
];

/** connections — the connected-instance lifecycle vocabulary. */
export const CONNECTION_LIFECYCLE_VOCABULARY: readonly ReferenceTerm[] = [
  {
    term: "Catalogued capability",
    line: "A provider capability listed in the catalogue. A catalogue entry is never a connection — nothing is authorized by browsing.",
  },
  {
    term: "Setup required",
    line: "The capability needs account authorization before anything can dispatch — the honest state until a real connection exists.",
  },
  {
    term: "Connected instance",
    line: "An actual authorized account connection. Execution is scoped to connected instances only.",
  },
  {
    term: "Availability",
    line: "Whether a connected instance currently responds — an observation recorded from the provider, never an assumption.",
  },
];

/** activity — the outcome-state reference (UNKNOWN ≠ FAILED; §6). */
export interface OutcomeReferenceEntry {
  readonly term: string;
  readonly line: string;
  /** UNKNOWN announces politely (role=status), never as an alert. */
  readonly unknown?: boolean;
}

export const ACTIVITY_OUTCOME_REFERENCE: readonly OutcomeReferenceEntry[] = [
  {
    term: "Confirmed",
    line: "The provider-verified outcome of an executed effect — recorded from provider observation, never assumed from submission.",
  },
  {
    term: "Unknown",
    line: "The outcome is not yet known. UNKNOWN is not FAILED: a submitted command is not finality, and a timeout after dispatch is reconciled against provider records before any conclusion.",
    unknown: true,
  },
  {
    term: "Failed",
    line: "The provider answered with a failure. A failed answer is distinct from an unknown one — the difference is honored everywhere.",
  },
  {
    term: "Late returns",
    line: "Late returns are possible — funds can return after finality is recorded; a return reopens the record for reconciliation instead of being absorbed.",
  },
];

/** lab — the Lab law (verbatim) + the opportunities-family framing. */
export const LAB_LAW =
  "Simulated routes/events are advisory/test evidence only; no production financial authority." as const;

export const OPPORTUNITIES_FAMILY = [
  "The opportunities family discovers evidence-backed FinancialOpportunity candidates across rails.",
  "Discovery is advisory evidence only — no direct authorization, no execution, no fabricated opportunities.",
] as const;

/* ====================================================================
 * Store durability labels (§5 adapter laws, per-mount fact)
 * ==================================================================== */

export interface StoreDurabilityLabel {
  readonly label: string;
  readonly fact: string;
}

export function storeDurabilityLabel(
  durability: WorkspaceStoreDurability,
): StoreDurabilityLabel {
  switch (durability) {
    case "DESKTOP_PROFILE":
      return {
        label: "Desktop profile store",
        fact: "Missions are stored by the PaySwap desktop host under the PaySwap user-data directory, and survive app restarts.",
      };
    case "BROWSER_PROFILE":
      return {
        label: "Browser profile store",
        fact: "Missions are stored in this browser profile only — clearing site data removes them, and they do not follow you to other devices.",
      };
  }
}

/* ====================================================================
 * Settings facts (identity, attribution, advanced entry)
 * ==================================================================== */

export const PAYSWAP_IDENTITY = {
  name: "PaySwap",
  line: "A non-custodial economic operating system.",
} as const;

/** The upstream attribution (legal — PRODUCT-IDENTITY.md §4). */
export const CONSOLE_UPSTREAM_ATTRIBUTION =
  "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0)." as const;

/** The advanced developer-workspace entry (clearly labeled, secondary). */
export const ADVANCED_DEVELOPER_ENTRY = {
  label: "Advanced developer workspace",
  description:
    "The developer workspace of the upstream ZCode platform — an advanced technical interface for development work, not part of the PaySwap Agent Workspace.",
  path: "/console/advanced",
} as const;

/** agents/connections — the honest model-binding "none configured" line. */
export const MODEL_PROVIDERS_NONE =
  "No model provider is configured — honestly reported as none, never invented as connected." as const;

/** The section ids that carry reference vocabularies (in-page anchors). */
export const REFERENCE_SECTION_ANCHORS: Readonly<
  Record<"agents" | "approvals" | "connections" | "activity" | "lab", string>
> = {
  agents: "agents-vocabulary",
  approvals: "approvals-reference",
  connections: "connections-reference",
  activity: "activity-reference",
  lab: "lab-reference",
};

/** Type re-export for section components (single import site). */
export type { ConsoleSectionId };
