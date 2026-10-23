/**
 * @zcode/ui — the EXTENSION SURFACE seam (host-injected main views).
 *
 * A generic extension point for hosts that mount this substrate shell
 * AND want to offer their own secondary main views inside it: the host
 * describes a small set of nav items (rendered by the shell's sidebar
 * below the built-in workspace nav, in the shell's own design
 * language) and provides the main-content renderer for the active
 * item. The shell knows NOTHING about what the surface is — no
 * product vocabulary, no styling, no imports of the host's packages
 * (the substrate stays product-free; the parallel-design law).
 *
 * Delivery is a React context (not props): the surface descriptor is
 * mount-provided and stable for the renderer's lifetime, while the
 * shell's deep composition (Root → … → App → WorkspaceShellLayout →
 * WorkspaceSidebar) stays untouched. The active-section STATE is the
 * shell's (WorkspaceMainView "extension" + the section id), and the
 * render request hands it back to the host with the two mirrors
 * (onSectionChange — the host nav follows in-section navigation;
 * onNavigateBack — the supporting-control back affordance).
 */

import { createContext, useContext, type ReactNode } from "react";

/** One host-nav item (the id names the host surface's section). */
export interface ExtensionSurfaceNavDescriptor {
  readonly id: string;
  readonly label: string;
}

/** The render request the shell issues for the active host section. */
export interface ExtensionSurfaceRenderRequest {
  /** The active nav item's id (the first item when none was chosen yet). */
  readonly sectionId: string;
  /** Mirror: an in-section navigation changed the active section. */
  readonly onSectionChange: (sectionId: string) => void;
  /** The back-to-shell affordance (returns to the chat workspace). */
  readonly onNavigateBack: () => void;
}

/** The host-provided extension surface descriptor. */
export interface ExtensionSurfaceMount {
  /**
   * Optional brand block above the nav items (the host's identity on
   * this surface): a label + optional sublabel, rendered in the
   * shell's own design language. Generic data — the shell stays
   * product-free.
   */
  readonly brand?: {
    readonly label: string;
    readonly sublabel?: string;
  };
  /** Optional group label above the nav items (the host's IA name). */
  readonly navGroupLabel?: string;
  /** The nav items (rendered in order; ids are host-stable strings). */
  readonly navItems: readonly ExtensionSurfaceNavDescriptor[];
  /** Renders the main content for the active section id. */
  readonly renderMain: (request: ExtensionSurfaceRenderRequest) => ReactNode;
}

const ExtensionSurfaceContext = createContext<ExtensionSurfaceMount | null>(null);

/** The host-side provider (Root wires RootProps.extensionSurface here). */
export function ExtensionSurfaceProvider({
  value,
  children,
}: {
  readonly value: ExtensionSurfaceMount | null;
  readonly children: ReactNode;
}) {
  return (
    <ExtensionSurfaceContext.Provider value={value}>
      {children}
    </ExtensionSurfaceContext.Provider>
  );
}

/** The shell-side consumer (null when no host surface is mounted). */
export function useExtensionSurface(): ExtensionSurfaceMount | null {
  return useContext(ExtensionSurfaceContext);
}
