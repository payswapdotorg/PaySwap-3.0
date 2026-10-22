/**
 * @payswap/app — the console CHROME (topbar + section navigation +
 * workspace footer + not-found), PaySwap-branded per CONSOLE-WORKSPACE.md
 * §1/§8 (P11 redesign per the operator's target design): the existing
 * ps- design system, the PaySwap wordmark with "Agent Workspace"
 * framing, semantic landmarks (header/nav/main/footer/section),
 * aria-current on the active section, and the back-to-product affordance
 * (label + activation from the mount props — a supporting control, J14).
 *
 * §8 chrome laws (P11): the desktop sidebar carries the seven workspace
 * sections WITH THEIR ICONS under a "Workspace" label, with Settings
 * pinned at the section end (still the eighth link in the §2 pinned
 * order, still inside the same nav landmark); the mobile nav is a
 * horizontal scroll row carrying the same items with icons; the
 * workspace FOOTER carries the honest one-line store fact (§5
 * durability) + the live mission count. Section icons are
 * PRESENTATION-ONLY (inline SVG, aria-hidden, stroke = currentColor —
 * never contract data, never a substitute for a text label).
 *
 * Responsive pattern (the substrate convention): the static sidebar
 * carries section navigation at desktop widths (hidden below lg by the
 * design system's own CSS); the horizontal scroll row carries it at
 * mobile widths. Both render real hrefs (deep-linkable) routed through
 * the injected navigation adapter — never a renderer reload.
 */

import { Button, Sidebar, SidebarSection, Topbar } from "@zcode/ui/payswap";
import type { ReactNode } from "react";
import type { ConsoleSectionId } from "./contracts.js";
import { CONSOLE_ROOT, CONSOLE_SECTIONS } from "./contracts.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";

/* --------------------------------------------------------------------
 * Section icons (PRESENTATION-ONLY, §8): minimal inline SVG glyphs in
 * the design system's stroke style. aria-hidden everywhere; the text
 * label carries the meaning.
 * -------------------------------------------------------------------- */

function icon(path: ReactNode): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

const SECTION_ICONS: Readonly<Record<ConsoleSectionId, ReactNode>> = {
  overview: icon(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>,
  ),
  missions: icon(
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V7" />
      <path d="M3 12.5h18" />
    </>,
  ),
  agents: icon(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c.8-3.2 3.1-4.8 6-4.8s5.2 1.6 6 4.8" />
      <path d="M16.2 5.3a3.3 3.3 0 0 1 0 5.9" />
      <path d="M17.6 15.5c1.7.7 2.9 2 3.4 4.2" />
    </>,
  ),
  approvals: icon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.4 12.3 2.4 2.4 4.8-5" />
    </>,
  ),
  connections: icon(
    <>
      <path d="M9 2.8v5.4M15 2.8v5.4" />
      <path d="M6.2 8.2h11.6v3.6a5.8 5.8 0 0 1-11.6 0z" />
      <path d="M12 17.6v3.6" />
    </>,
  ),
  activity: icon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2v5l3.4 2" />
    </>,
  ),
  lab: icon(
    <>
      <path d="M9.8 2.8h4.4M10 2.8v6.1l-5.4 9A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-3.1L14 8.9V2.8" />
      <path d="M7.4 15.2h9.2" />
    </>,
  ),
  settings: icon(
    <>
      <path d="M3.5 7.2h9M17 7.2h3.5M3.5 16.8h3M11 16.8h9.5" />
      <circle cx="14.8" cy="7.2" r="2.2" />
      <circle cx="8.4" cy="16.8" r="2.2" />
    </>,
  ),
};

/** The PaySwap mark (the product wordmark treatment, §2 of the spec). */
function PaySwapMark() {
  return (
    <span className="ps-console-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" fill="#131211" />
        <path
          d="M10 12.25h11M18.5 9.25l3 3-3 3"
          stroke="#10b981"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M22 19.75H11M13.5 16.75l-3 3 3 3"
          stroke="#10b981"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

export interface ConsoleBackToProduct {
  readonly label: string;
  readonly onActivate: () => void;
}

/** The console topbar: wordmark + Agent Workspace framing + back control. */
export function ConsoleTopbar({
  backToProduct,
}: {
  readonly backToProduct: ConsoleBackToProduct;
}) {
  return (
    <Topbar
      className="ps-console-topbar"
      leading={
        <p className="ps-console-brand">
          <PaySwapMark />
          <span className="ps-console-brand-name">PaySwap</span>
          <span className="ps-console-brand-frame">Agent Workspace</span>
        </p>
      }
      actions={
        <Button
          variant="secondary"
          size="sm"
          className="ps-console-back"
          onClick={backToProduct.onActivate}
        >
          {backToProduct.label}
        </Button>
      }
    />
  );
}

/** One section nav link (real href + adapter routing + aria-current). */
function SectionNavLink({
  sectionId,
  title,
  active,
  navigation,
  className,
}: {
  readonly sectionId: ConsoleSectionId;
  readonly title: string;
  readonly active: boolean;
  readonly navigation: PaySwapNavigation;
  readonly className: string;
}) {
  return (
    <ProductLink
      to={`${CONSOLE_ROOT}/${sectionId}`}
      navigation={navigation}
      aria-current={active ? "page" : undefined}
      className={active ? `${className} is-active` : className}
    >
      <span className="ps-sidebar__item-icon" aria-hidden="true">
        {SECTION_ICONS[sectionId]}
      </span>
      <span className="ps-sidebar__item-label">{title}</span>
    </ProductLink>
  );
}

/**
 * The desktop section navigation (static sidebar; hidden below lg). The
 * seven workspace sections render under a "Workspace" label; Settings
 * renders pinned at the section end after a divider (§8) — still the
 * eighth link in the §2 pinned order inside the same nav landmark.
 */
export function ConsoleSidebar({
  activeSectionId,
  navigation,
}: {
  readonly activeSectionId: ConsoleSectionId | null;
  readonly navigation: PaySwapNavigation;
}) {
  const workspaceSections = CONSOLE_SECTIONS.filter((section) => section.id !== "settings");
  const settings = CONSOLE_SECTIONS.find((section) => section.id === "settings");
  return (
    <Sidebar label="Workspace sections" className="ps-console-sidebar">
      <SidebarSection label="Workspace">
        {workspaceSections.map((section) => (
          <SectionNavLink
            key={section.id}
            sectionId={section.id}
            title={section.title}
            active={section.id === activeSectionId}
            navigation={navigation}
            className="ps-sidebar__item ps-console-nav-item"
          />
        ))}
      </SidebarSection>
      <div className="ps-console-sidebar-divider" aria-hidden="true" />
      {settings !== undefined ? (
        <SectionNavLink
          sectionId={settings.id}
          title={settings.title}
          active={settings.id === activeSectionId}
          navigation={navigation}
          className="ps-sidebar__item ps-console-nav-item ps-console-nav-item--pinned"
        />
      ) : null}
    </Sidebar>
  );
}

/** The mobile section navigation (horizontal scroll row; hidden at lg+). */
export function ConsoleSectionNav({
  activeSectionId,
  navigation,
}: {
  readonly activeSectionId: ConsoleSectionId | null;
  readonly navigation: PaySwapNavigation;
}) {
  return (
    <nav aria-label="Workspace sections" className="ps-console-sectionnav">
      {CONSOLE_SECTIONS.map((section) => (
        <SectionNavLink
          key={section.id}
          sectionId={section.id}
          title={section.title}
          active={section.id === activeSectionId}
          navigation={navigation}
          className="ps-console-nav-link"
        />
      ))}
    </nav>
  );
}

/**
 * The workspace footer (§8, P11): the honest one-line store fact (the
 * mount's §5 durability, verbatim) + the no-live-corridors line + the
 * live mission count (rendered only from the loaded store state — never
 * a guess).
 */
export function ConsoleFooter({
  durabilityFact,
  missionCount,
}: {
  readonly durabilityFact: string;
  /** undefined = the store is still loading or failed — no count is shown. */
  readonly missionCount: number | undefined;
}) {
  return (
    <footer className="ps-console-footer">
      <p className="ps-console-footer-line">
        PaySwap Agent Workspace — {durabilityFact} No live financial corridors are
        configured; nothing here executes or simulates money movement.
      </p>
      <p className="ps-console-footer-meta">
        {missionCount !== undefined
          ? `${missionCount} mission${missionCount === 1 ? "" : "s"} recorded in this workspace`
          : "Mission count loads with the workspace store"}
      </p>
    </footer>
  );
}
