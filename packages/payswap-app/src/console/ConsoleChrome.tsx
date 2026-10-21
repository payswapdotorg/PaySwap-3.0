/**
 * @payswap/app — the console CHROME (topbar + section navigation +
 * not-found), PaySwap-branded per CONSOLE-WORKSPACE.md §1/§8: the
 * existing ps- design system, the PaySwap wordmark with "Agent Console"
 * framing, semantic landmarks (header/nav/main/section), aria-current on
 * the active section, and the back-to-product affordance (label +
 * activation from the mount props — a supporting control, J14).
 *
 * Responsive pattern (the substrate convention): the static sidebar
 * carries section navigation at desktop widths (hidden below lg by the
 * design system's own CSS); a horizontal wrapping nav carries it at
 * mobile widths. Both render real hrefs (deep-linkable) routed through
 * the injected navigation adapter — never a renderer reload.
 */

import { Button, Sidebar, Topbar } from "@zcode/ui/payswap";
import type { ConsoleSectionId } from "./contracts.js";
import { CONSOLE_ROOT, CONSOLE_SECTIONS } from "./contracts.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import { ProductLink } from "../shell/ProductLink.js";

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

/** The console topbar: wordmark + Agent Console framing + back control. */
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
          <span className="ps-console-brand-frame">Agent Console</span>
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
      {title}
    </ProductLink>
  );
}

/** The desktop section navigation (static sidebar; hidden below lg). */
export function ConsoleSidebar({
  activeSectionId,
  navigation,
}: {
  readonly activeSectionId: ConsoleSectionId | null;
  readonly navigation: PaySwapNavigation;
}) {
  return (
    <Sidebar label="Console sections" className="ps-console-sidebar">
      {CONSOLE_SECTIONS.map((section) => (
        <SectionNavLink
          key={section.id}
          sectionId={section.id}
          title={section.title}
          active={section.id === activeSectionId}
          navigation={navigation}
          className="ps-sidebar__item ps-console-nav-item"
        />
      ))}
    </Sidebar>
  );
}

/** The mobile section navigation (horizontal wrap; hidden at lg and up). */
export function ConsoleSectionNav({
  activeSectionId,
  navigation,
}: {
  readonly activeSectionId: ConsoleSectionId | null;
  readonly navigation: PaySwapNavigation;
}) {
  return (
    <nav aria-label="Console sections" className="ps-console-sectionnav">
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
