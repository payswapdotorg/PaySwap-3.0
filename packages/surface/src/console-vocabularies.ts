/**
 * @payswap/surface — the console reference vocabularies (P10-A, §6).
 *
 * NET-NEW module: the section reference vocabularies as typed readonly
 * data with EXPLICIT reference semantics — `semantics: "reference"` on
 * every vocabulary: these are PRESENTATION CONTRACTS that explain the
 * pinned domain concepts in people language. They are NEVER data, never
 * a registry, never a live list (no domain imports — the package is a
 * zero-dependency leaf, SV-1/INV-22).
 *
 * SOURCES (auditable, one line per concept):
 * - agent-contract: spec/agents/AGENT-MODEL.md (Body / declared
 *   capabilities / constraints / model binding / runtime status).
 * - approval-scope: spec/trust/TRUST-BOUNDARY.md §4/§7 (material terms,
 *   authority scope, approval artifacts).
 * - connection-lifecycle: spec/capability/CAPABILITY-FABRIC.md (the
 *   canonical hierarchy + two-axis availability; states presented as
 *   reference only).
 * - activity outcome states: spec/surface/SURFACE-CONTRACTS.md §5.
 * - lab: the Lab law (INV-11) + the opportunities family
 *   (spec/lab/LAB.md, spec/opportunities/OPPORTUNITIES.md).
 * - settings facts: spec/productization/PRODUCT-IDENTITY.md §1/§3/§4 +
 *   the §5 store durability labels (input to the fold — per mount).
 */

import { CONSOLE_ADVANCED_ROUTE } from "./console-workspace.ts";
import { WORKSPACE_STORE_DURABILITY_LABELS, type WorkspaceStoreDurability } from "./console-store.ts";

/** One entry of a reference vocabulary: a term + its one-line meaning. */
export interface ConsoleReferenceEntry {
  readonly term: string;
  readonly line: string;
}

/** A reference vocabulary — REFERENCE semantics, never data. */
export interface ConsoleReferenceVocabulary {
  /** Stable vocabulary id. */
  readonly id: string;
  /** Always "reference" — vocabulary, never a registry or live list. */
  readonly semantics: "reference";
  /** One line: what this vocabulary describes (for the section header). */
  readonly about: string;
  readonly entries: readonly ConsoleReferenceEntry[];
}

function referenceVocabulary(
  id: string,
  about: string,
  entries: readonly ConsoleReferenceEntry[],
): ConsoleReferenceVocabulary {
  return { id, semantics: "reference", about, entries };
}

/** The Lab law (§6 verbatim; INV-11). */
export const LAB_ADVISORY_LAW =
  "Simulation is advisory/test evidence only — never production financial authority." as const;

/** §6 agents: the agent-contract vocabulary (reference only). */
export const AGENT_CONTRACT_VOCABULARY: ConsoleReferenceVocabulary = referenceVocabulary(
  "agent-contract",
  "The agent-contract vocabulary (spec/agents/AGENT-MODEL.md) — reference only; no agent registry exists in this deployment.",
  [
    {
      term: "body",
      line: "Agent Body — the model-independent contract: declared interfaces, capability descriptors and constraints; no model, prompt or weights inside.",
    },
    {
      term: "declared capabilities",
      line: "Declared capabilities — what a body says it can do, as typed descriptors; a declaration is never an authorization.",
    },
    {
      term: "constraints",
      line: "Constraints — the body's declared hard bounds; a safety policy gates every action through them.",
    },
    {
      term: "model binding",
      line: "Model binding — a replaceable binding that possesses an agent instance; the model is a swappable part, never the agent's identity or authority.",
    },
    {
      term: "runtime status",
      line: "Runtime status — the instance's live runtime state; an observation of the runtime, never a claim of financial effect.",
    },
  ],
);

/** §6 approvals: what approvals gate (reference only). */
export const APPROVAL_VOCABULARY: ConsoleReferenceVocabulary = referenceVocabulary(
  "approval-scope",
  "What approvals gate before consequential actions (spec/trust/TRUST-BOUNDARY.md) — reference only; no approval can be minted from this workspace.",
  [
    {
      term: "material terms",
      line: "Material terms — what was approved: the actions, resources and amount bound the approval covers; changing them requires renewed authorization.",
    },
    {
      term: "authority scope",
      line: "Authority scope — under which principal, mandate and security epoch the approval was issued, and with which proof level.",
    },
    {
      term: "approval artifacts",
      line: "Approval artifacts — a signed artifact is the only approval authority; never a chat message, never an agent's claim, immutable once issued.",
    },
  ],
);

/** §6 connections: the connection lifecycle vocabulary (reference only). */
export const CONNECTION_LIFECYCLE_VOCABULARY: ConsoleReferenceVocabulary = referenceVocabulary(
  "connection-lifecycle",
  "The connection lifecycle (spec/capability/CAPABILITY-FABRIC.md) — states as reference, never a list of connections.",
  [
    {
      term: "PROPOSED",
      line: "PROPOSED — a connection has been proposed (for example an authorization handshake started); no authorized, scoped instance exists yet, and a proposal is never a connection.",
    },
    {
      term: "CONNECTED",
      line: "CONNECTED — a connected instance exists: scoped, authorized and eligible, with fresh observations; catalogue support alone never reaches this state.",
    },
    {
      term: "UNKNOWN",
      line: "UNKNOWN — the connection's current state cannot be determined (source unreachable or observation stale); UNKNOWN is neither connected nor disconnected, and is reconciled rather than guessed.",
    },
    {
      term: "DISCONNECTED",
      line: "DISCONNECTED — the connection's authorization no longer exists (revoked or expired); reconnecting is a new authorization, never a silent revival.",
    },
  ],
);

/** §6 activity: the outcome-state reference (clearly labeled reference, never live activity). */
export const ACTIVITY_OUTCOME_STATE_REFERENCE: ConsoleReferenceVocabulary = referenceVocabulary(
  "activity-outcome-states",
  "Outcome-state reference for reading activity (spec/surface/SURFACE-CONTRACTS.md §5) — reference states, never live activity.",
  [
    {
      term: "UNKNOWN_NOT_FAILED",
      line: "UNKNOWN is not FAILED — an unknown outcome is neither failure nor success; it renders with status semantics and is reconciled with the provider before any retry.",
    },
    {
      term: "RECONCILIATION_FIRST",
      line: "Reconciliation first — when an outcome is unknown, reconciliation comes first: no blind retry, no invented result.",
    },
    {
      term: "SUBMISSION_NOT_FINALITY",
      line: "Submission is not finality — a submitted command is an acknowledgement, never the outcome; a payout sent is not beneficiary credit.",
    },
    {
      term: "LATE_RETURNS_POSSIBLE",
      line: "Late returns possible — returns and refunds can arrive days or weeks after a payout was sent; they arrive as new history, and history is never rewritten.",
    },
  ],
);

/** §6 lab: the Lab law + the opportunities family (reference only). */
export const LAB_REFERENCE_VOCABULARY: ConsoleReferenceVocabulary = referenceVocabulary(
  "lab-opportunities",
  "The Lab law and the opportunities family as reference — advisory/test evidence only, never production financial authority.",
  [
    { term: "lab law", line: LAB_ADVISORY_LAW },
    {
      term: "opportunities",
      line: "Opportunities — evidence-backed discovery across rails; inputs to decisions, never direct authorization, never guaranteed returns.",
    },
    {
      term: "experiments",
      line: "Experiments — replay, counterfactuals and fault injection over immutable recorded facts; results never leave the Lab's advisory namespace.",
    },
  ],
);

/* ====================================================================
 * Settings facts (§6 settings — identity, attribution, durability,
 * the advanced developer workspace entry)
 * ==================================================================== */

/** The settings facts for THIS mount (durability is the fold's input). */
export interface WorkspaceSettingsFacts {
  /** PaySwap identity + the workspace's supporting position (§1). */
  readonly identity: { readonly name: "PaySwap"; readonly line: string };
  /** Upstream attribution, preserved as attribution (PRODUCT-IDENTITY §4). */
  readonly attribution: { readonly line: string; readonly source: string };
  /** The store durability fact for THIS mount (§5 labels). */
  readonly storeDurability: {
    readonly durability: WorkspaceStoreDurability;
    readonly label: string;
    readonly line: string;
  };
  /** The advanced developer workspace entry (clearly labeled, secondary). */
  readonly advancedDeveloperWorkspace: {
    readonly route: typeof CONSOLE_ADVANCED_ROUTE;
    readonly label: string;
    readonly line: string;
  };
}

/**
 * Fold the settings facts for one store durability (§6 settings). Pure:
 * the durability is an explicit input (never ambient); the label comes
 * from the §5 honest-labeling law. Fail-closed on an unknown durability
 * (the console-store validator).
 */
export function foldWorkspaceSettingsFacts(durability: WorkspaceStoreDurability): WorkspaceSettingsFacts {
  const label = WORKSPACE_STORE_DURABILITY_LABELS[durability];
  if (typeof label !== "string") {
    throw new InvalidWorkspaceSettingsError(
      `unknown workspace store durability ${JSON.stringify(durability)} — the vocabulary is closed`,
    );
  }
  const durabilityLine =
    durability === "DESKTOP_PROFILE"
      ? "Mission records are stored in the PaySwap desktop app profile (JSON under the PaySwap user-data directory) and survive app restarts."
      : "Mission records are stored in this browser profile only (under a namespaced key) — clearing this browser's data clears them.";
  return {
    identity: {
      name: "PaySwap",
      line: "The Agent Workspace is the console surface of PaySwap — a supporting capability, never the default landing.",
    },
    attribution: {
      line: "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).",
      source: "spec/productization/PRODUCT-IDENTITY.md#4-upstream-attribution-legally-preserved",
    },
    storeDurability: { durability, label, line: durabilityLine },
    advancedDeveloperWorkspace: {
      route: CONSOLE_ADVANCED_ROUTE,
      label: "Advanced developer workspace",
      line: "The ZCode-derived developer workspace of the upstream platform — an advanced technical interface, clearly labeled, never the default console experience.",
    },
  };
}

/** Raised when the settings fold input is invalid (fail-closed). */
export class InvalidWorkspaceSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspaceSettingsError";
  }
}
