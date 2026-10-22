/**
 * @payswap/app — the PaySwap Agent Workspace CONTRACTS (console surface).
 *
 * The pinned mirror of spec/surface/CONSOLE-WORKSPACE.md (Phase 10,
 * cross-lane contract): the §3 mission vocabulary, the §5 workspace store
 * port, the §2 eight-section IA + routing law, and the §1 identity facts.
 * The TypeScript shapes are PINNED byte-exact to the doc — every lane
 * implements to these shapes; drift is a defect.
 *
 * Mirror discipline (the established pinning pattern, see src/pins/): this
 * package pins the shapes STRUCTURALLY because the substrate layer law
 * keeps the app free of @payswap/surface imports until the TL wires the
 * real imports at integration. The recorded contract vocabulary lives in
 * test/payswap/console-contract-fixture.ts and the drift test
 * (console-contracts.test.ts) asserts the mirror matches the fixture —
 * a change to either side is a conscious two-step, never silent drift.
 *
 * Pure contract module: no React, no DOM, no ambient state (§7).
 */

import type { AmountSpecPin } from "../pins/surface-pins.js";

/** The pinned money wire shape (surface AmountSpec, mirrored). */
export type MissionAmountSpec = AmountSpecPin;

/* ====================================================================
 * Mission vocabulary (CONSOLE-WORKSPACE.md §3 — pinned byte-exact)
 * ==================================================================== */

export type MissionIntentDirection = "PAY" | "RECEIVE" | "MOVE" | "CONVERT";

export interface MissionIntakeInput {
  /** Non-empty after trim, at most 2000 characters. */
  readonly goalStatement: string;
  readonly direction: MissionIntentDirection;
  /** Optional until known; when present it must satisfy the AmountSpec law. */
  readonly amount?: MissionAmountSpec;
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
  readonly amount?: MissionAmountSpec;
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

/* ====================================================================
 * Workspace store port (CONSOLE-WORKSPACE.md §5 — pinned byte-exact)
 * ==================================================================== */

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

/** Optional honest projection of real substrate model-provider state. */
export interface ModelProviderStatus {
  readonly id: string;
  readonly label: string;
  readonly connected: boolean;
}

/* ====================================================================
 * The eight-section workspace IA (CONSOLE-WORKSPACE.md §2 — verbatim)
 * ==================================================================== */

export const CONSOLE_SECTION_IDS = [
  "overview",
  "missions",
  "agents",
  "approvals",
  "connections",
  "activity",
  "lab",
  "settings",
] as const;

export type ConsoleSectionId = (typeof CONSOLE_SECTION_IDS)[number];

/** One workspace section record (id/title/purpose verbatim from §2). */
export interface ConsoleSectionRecord {
  readonly id: ConsoleSectionId;
  readonly title: string;
  readonly purpose: string;
}

export const CONSOLE_SECTIONS: readonly ConsoleSectionRecord[] = [
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
];

/** Resolve a section record by id (undefined for an unknown id). */
export function consoleSection(
  id: string,
): ConsoleSectionRecord | undefined {
  return CONSOLE_SECTIONS.find((section) => section.id === id);
}

/* ====================================================================
 * The console path law (CONSOLE-WORKSPACE.md §2 routing law)
 * ==================================================================== */

/** The console root path (web: "/console"; desktop hash: "#/console"). */
export const CONSOLE_ROOT = "/console" as const;

/** The advanced developer-workspace mount path (NOT a workspace section). */
export const CONSOLE_ADVANCED_PATH = "/console/advanced" as const;

/** The canonical path of a workspace section ("/console/<section>"). */
export function consoleSectionPath(sectionId: ConsoleSectionId): string {
  return `${CONSOLE_ROOT}/${sectionId}`;
}

/**
 * The console route resolution (pure, total, never throws):
 * - the console root (and its trailing-slash form) → overview;
 * - "/console/<section>" for the eight pinned ids → that section;
 * - everything else → the honest not-found (the workspace chrome stays).
 *
 * "/console/advanced" and deeper paths under it are NOT workspace
 * sections: the platform mounts route them to the ZCode developer
 * workspace BEFORE this workspace renders (CONSOLE-WORKSPACE.md §2 —
 * the P10-B mount contract). Reaching this fold with such a path means
 * the mount did not route it; the workspace answers with its honest
 * not-found rather than inventing a section.
 */
export type ConsoleRoute =
  | { readonly kind: "overview" }
  | { readonly kind: "section"; readonly sectionId: ConsoleSectionId }
  | { readonly kind: "not-found"; readonly path: string };

/** Normalize one trailing slash away ("/console/" == "/console"). */
function normalizeConsolePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

/**
 * The §2 advanced-path law as a total predicate (for the platform
 * mounts): "/console/advanced" AND every deeper path under it route to
 * the ZCode developer-workspace mount — NOT a workspace section. The
 * mounts split these paths BEFORE the workspace renders; if such a path
 * ever reaches the workspace anyway, it resolves to the honest
 * not-found (never an invented section, never a crash).
 */
export function isConsoleAdvancedPath(path: string): boolean {
  const normalized = normalizeConsolePath(path);
  return (
    normalized === CONSOLE_ADVANCED_PATH ||
    normalized.startsWith(`${CONSOLE_ADVANCED_PATH}/`)
  );
}

export function resolveConsoleSection(path: string): ConsoleRoute {
  const normalized = normalizeConsolePath(path);
  if (normalized === CONSOLE_ROOT) {
    return { kind: "overview" };
  }
  if (normalized.startsWith(`${CONSOLE_ROOT}/`)) {
    const sectionId = normalized.slice(CONSOLE_ROOT.length + 1);
    const section = consoleSection(sectionId);
    if (section !== undefined) {
      return { kind: "section", sectionId: section.id };
    }
  }
  return { kind: "not-found", path };
}

/* ====================================================================
 * Document titles (CONSOLE-WORKSPACE.md §1 — "… — PaySwap Agent Workspace"; P11 rename)
 * ==================================================================== */

/**
 * The document title for a console route. The workspace root reads
 * "PaySwap — Agent Workspace"; every other surface is route-specific
 * ("<Section> — PaySwap Agent Workspace"); the honest not-found follows
 * the same law.
 */
export function consoleDocumentTitle(route: ConsoleRoute): string {
  switch (route.kind) {
    case "overview":
      return "PaySwap — Agent Workspace";
    case "section":
      return `${consoleSection(route.sectionId)?.title ?? "Console"} — PaySwap Agent Workspace`;
    case "not-found":
      return "Not found — PaySwap Agent Workspace";
  }
}
