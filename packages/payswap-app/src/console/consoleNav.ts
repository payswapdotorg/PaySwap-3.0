/**
 * @payswap/app — the console NAV DESCRIPTORS for a host shell (P15).
 *
 * The seven PaySwap console sections the ZCode workspace sidebar offers
 * below its built-in nav (the P13 reference's workspace IA — "Agent
 * Workspace remains primary"): plain id/label data the HOST renders in
 * its own design language. Settings stays a console section (rendered
 * by the bridge) but is NOT offered as a host nav tab — the host has
 * its own settings surface, and the console's settings remains
 * reachable through the console's own in-section navigation.
 *
 * Generic by contract: the host consumes the ids + labels as data; no
 * host-side component imports or styling are implied here.
 */

import type { ConsoleSectionId } from "./contracts.js";

/** One host-nav descriptor (the id names a ConsoleSectionId). */
export interface PaySwapConsoleNavDescriptor {
  readonly id: ConsoleSectionId;
  readonly label: string;
}

/** The host nav group's label (the sidebar section heading). */
export const PAYSWAP_CONSOLE_NAV_GROUP_LABEL = "PaySwap";

/** The seven host-nav sections (the P13 workspace IA). */
export const PAYSWAP_CONSOLE_NAV_ITEMS: readonly PaySwapConsoleNavDescriptor[] = [
  { id: "overview", label: "Overview" },
  { id: "missions", label: "Missions" },
  { id: "agents", label: "Agents" },
  { id: "approvals", label: "Approvals" },
  { id: "connections", label: "Connections" },
  { id: "activity", label: "Activity" },
  { id: "lab", label: "Lab" },
];

/** Resolve the nav label for a section id (undefined when not a nav tab). */
export function paySwapConsoleNavLabel(
  sectionId: string,
): string | undefined {
  return PAYSWAP_CONSOLE_NAV_ITEMS.find((item) => item.id === sectionId)?.label;
}
