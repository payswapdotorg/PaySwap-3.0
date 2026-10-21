/**
 * @payswap/surface — the PaySwap Agent Workspace IA (P10-A).
 *
 * NET-NEW module implementing CONSOLE-WORKSPACE.md §2 (the cross-lane
 * console contract, registered by the TL 2026-10-21): the eight product
 * sections of the Agent Workspace, the console sub-route law as a pure
 * TOTAL function, and the PaySwap document-title helper (§1: the root
 * reads "PaySwap — Agent Console"; route-specific titles read
 * "… — PaySwap Agent Console").
 *
 * LAWS enforced here (canonical):
 * - The workspace is a SUPPORTING capability (J14) — never the default
 *   landing (PRODUCT-IDENTITY.md §3). This module is navigation DATA +
 *   pure routing; it renders nothing (INV-22/INV-23).
 * - The section set and order are the versioned contract: exactly the
 *   eight ids of §2's table, titles/purposes VERBATIM.
 * - `/console/advanced` (and any deeper path under it) is NOT a workspace
 *   section: it resolves to the advanced-developer-workspace result the
 *   mounts translate to the upstream platform's developer workspace —
 *   clearly labeled, never branded away, never removed (§1).
 * - Unknown input NEVER throws: every string resolves deterministically
 *   to a section, the advanced mount, or the honest not-found result.
 * - Determinism (SV-9): no ambient clock/locale/registry; the folds take
 *   explicit inputs only.
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** The eight workspace section ids — the fixed, versioned vocabulary (§2). */
export type ConsoleSectionId =
  | "overview"
  | "missions"
  | "agents"
  | "approvals"
  | "connections"
  | "activity"
  | "lab"
  | "settings";

/** One workspace product section (§2 table row, verbatim). */
export interface ConsoleSection {
  readonly id: ConsoleSectionId;
  /** The people-language title (verbatim from §2). */
  readonly title: string;
  /** One-line purpose (verbatim from §2). */
  readonly purpose: string;
  /** The canonical web route ("/console/<id>"); mounts translate to hash/history. */
  readonly route: string;
  /** The canonical law citations (auditable paths in THIS repository). */
  readonly lawCitations: readonly string[];
  readonly provenance: SurfaceContractProvenance;
}

const SECTIONS: readonly ConsoleSection[] = Object.freeze([
  {
    id: "overview",
    title: "Overview",
    purpose:
      "Mission-first starting point: in-progress missions, decisions needing attention, recent activity",
    route: "/console/overview",
    lawCitations: ["spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture"],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "missions",
    title: "Missions",
    purpose:
      "Mission creation, intent review, plan inspection, status, event timeline, evidence, controls",
    route: "/console/missions",
    lawCitations: ["spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture"],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "agents",
    title: "Agents",
    purpose:
      "Agent identity/capabilities/constraints vocabulary, runtime status, model binding, assignments",
    route: "/console/agents",
    lawCitations: [
      "spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture",
      "spec/agents/AGENT-MODEL.md",
    ],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "approvals",
    title: "Approvals",
    purpose: "What approvals gate (material terms + authority scope) before consequential actions",
    route: "/console/approvals",
    lawCitations: [
      "spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture",
      "spec/trust/TRUST-BOUNDARY.md#7-approval-artifacts-tb-4-and-security-blocks-inv-21",
    ],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "connections",
    title: "Connections",
    purpose: "Actually connected capabilities with honest setup-required/availability states",
    route: "/console/connections",
    lawCitations: [
      "spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture",
      "spec/architecture/INVARIANTS.md#13",
    ],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "activity",
    title: "Activity & receipts",
    purpose: "Authoritative progress, provider observations, finality, reconciliation, evidence",
    route: "/console/activity",
    lawCitations: [
      "spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture",
      "spec/surface/SURFACE-CONTRACTS.md#5-progressexceptionunknown-states-inv-04-at-the-ux-boundary",
    ],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "lab",
    title: "Lab",
    purpose: "Opportunities, experiments and learning — never production execution authority",
    route: "/console/lab",
    lawCitations: [
      "spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture",
      "spec/architecture/INVARIANTS.md#11",
    ],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
  {
    id: "settings",
    title: "Settings",
    purpose: "Identity, attribution, store durability, advanced developer tools",
    route: "/console/settings",
    lawCitations: [
      "spec/surface/CONSOLE-WORKSPACE.md#2-workspace-information-architecture",
      "spec/productization/PRODUCT-IDENTITY.md#4-upstream-attribution-legally-preserved",
    ],
    provenance: surfaceProvenance("P10-A", "experimental"),
  },
] as const);

/** The eight workspace sections, in §2 order (the versioned contract). */
export const WORKSPACE_SECTIONS: readonly ConsoleSection[] = SECTIONS;

/** The eight section ids, in §2 order. */
export const CONSOLE_SECTION_IDS: readonly ConsoleSectionId[] = SECTIONS.map((s) => s.id);

/** The pinned workspace-root document title (§1). */
export const CONSOLE_ROOT_TITLE = "PaySwap — Agent Console" as const;

/** The pinned route suffix for every workspace-section title (§1). */
export const CONSOLE_TITLE_SUFFIX = " — PaySwap Agent Console" as const;

/** The advanced developer workspace mount point (§2: NOT a workspace section). */
export const CONSOLE_ADVANCED_ROUTE = "/console/advanced" as const;

/** The honest advanced-mount label: the upstream platform's developer workspace. */
export const CONSOLE_ADVANCED_LABEL = "Developer workspace (upstream ZCode platform)" as const;

const SECTION_BY_ID: ReadonlyMap<string, ConsoleSection> = new Map(
  SECTIONS.map((section) => [section.id as string, section] as const),
);

/** Look up one section by id. Throws on an unknown id (typed accessor). */
export function consoleSectionById(id: ConsoleSectionId): ConsoleSection {
  const found = SECTION_BY_ID.get(id);
  if (found === undefined) {
    throw new Error(`consoleSectionById: unknown console section id ${JSON.stringify(id)}`);
  }
  return found;
}

/**
 * The console sub-route law as a pure TOTAL function (§2). Input is the
 * sub-path after the console root (`""` for `/console`, `"/<section>"`
 * for `/console/<section>`; a missing leading slash is accepted). Results:
 * - the console root ("" or "/") → the `overview` section;
 * - a known section id → that section (exact, case-sensitive, no deeper path);
 * - `advanced` (and any deeper path under it) → the advanced mount result —
 *   the upstream developer workspace, never a workspace section;
 * - anything else → the honest not-found result. NEVER throws.
 */
export type ConsoleRouteResolution =
  | { readonly kind: "section"; readonly section: ConsoleSection }
  | { readonly kind: "advanced"; readonly path: string }
  | { readonly kind: "not-found"; readonly path: string };

export function resolveConsoleSection(subPath: string): ConsoleRouteResolution {
  if (typeof subPath !== "string") {
    // Non-string input is a caller defect: fail closed to not-found,
    // echoed deterministically — never a silent coercion to a section.
    return { kind: "not-found", path: String(subPath) };
  }
  const normalized = subPath.startsWith("/") ? subPath.slice(1) : subPath;
  if (normalized === "") {
    return { kind: "section", section: consoleSectionById("overview") };
  }
  if (normalized === "advanced" || normalized.startsWith("advanced/")) {
    return { kind: "advanced", path: subPath };
  }
  const section = SECTION_BY_ID.get(normalized);
  if (section !== undefined && !normalized.includes("/")) {
    return { kind: "section", section };
  }
  return { kind: "not-found", path: subPath };
}

/**
 * The PaySwap document-title helper (§1). The workspace root reads
 * "PaySwap — Agent Console"; a known section reads
 * "<Title> — PaySwap Agent Console"; an unknown path reads the honest
 * not-found title; the advanced mount carries the honest developer-workspace
 * label (the mount may use the upstream platform's own title instead —
 * the advanced surface is never branded away).
 */
export function consoleDocumentTitle(subPath: string): string {
  if (typeof subPath === "string" && (subPath === "" || subPath === "/")) {
    // The workspace root reads the pinned root title (§1) — distinct from
    // the explicit "/overview" section title.
    return CONSOLE_ROOT_TITLE;
  }
  const resolution = resolveConsoleSection(subPath);
  switch (resolution.kind) {
    case "section":
      return `${resolution.section.title}${CONSOLE_TITLE_SUFFIX}`;
    case "advanced":
      return CONSOLE_ADVANCED_LABEL;
    case "not-found":
      return `Not found${CONSOLE_TITLE_SUFFIX}`;
  }
}
