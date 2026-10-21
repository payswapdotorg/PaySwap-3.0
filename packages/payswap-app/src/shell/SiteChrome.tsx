/**
 * @payswap/app — the product site chrome (header + nav + footer).
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/components/site-header.tsx
 * + site-footer.tsx (MMP-36 content/IA evidence), rendered with the
 * PaySwap design layer (@zcode/ui/payswap Topbar primitive). P9-A: the
 * links follow the TOP-LEVEL route contract (PRODUCT-IDENTITY.md §3) and
 * the agent console appears as a SUPPORTING capability — reachable, never
 * the default landing (J14). Presentation-only: links are data; no
 * network, no session state.
 *
 * The footer carries the upstream attribution line (PRODUCT-IDENTITY §4):
 * attribution is preserved as ATTRIBUTION in the legal/about location,
 * never as the product brand.
 */

import { Topbar } from "@zcode/ui/payswap";
import type { NavLink } from "../contracts/view-models.js";
import type { PaySwapNavigation } from "./navigation.js";
import { ProductLink } from "./ProductLink.js";

const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Product" },
  { href: "/capabilities", label: "Capabilities" },
  { href: "/security", label: "Security" },
  { href: "/developers", label: "Developers" },
];

/** The upstream attribution fact (spec/UPSTREAM-BASE.md is the record). */
const UPSTREAM_ATTRIBUTION =
  "PaySwap is built on the ZCode open-source platform (zai-org/ZCode, Apache-2.0).";

export interface PaySwapConsoleEntry {
  /** Where the console lives on this platform (web: "/console"). */
  readonly href?: string;
  /** Desktop: open the console surface in-place. */
  readonly onOpen?: () => void;
  readonly label?: string;
}

export function SiteHeader({
  navigation,
  console: consoleEntry,
}: {
  readonly navigation?: PaySwapNavigation;
  readonly console?: PaySwapConsoleEntry;
}) {
  return (
    <Topbar
      leading={
        <ProductLink to="/" navigation={navigation} className="ps-site-brand">
          <span className="ps-site-brand-mark" aria-hidden="true">
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
          PaySwap
        </ProductLink>
      }
      actions={
        <span className="ps-site-actions">
          {/* The product CTA leads; the console follows as the supporting
              capability (J14) — quieter in order AND in treatment. */}
          <ProductLink to="/app" navigation={navigation} className="ps-site-open">
            Open the product
          </ProductLink>
          {consoleEntry ? <ConsoleLink entry={consoleEntry} /> : null}
        </span>
      }
    />
  );
}

export function ConsoleLink({ entry }: { readonly entry: PaySwapConsoleEntry }) {
  const label = entry.label ?? "Agent console";
  if (entry.onOpen != null) {
    return (
      <button type="button" className="ps-site-console" onClick={entry.onOpen}>
        {label}
      </button>
    );
  }
  // A plain anchor on purpose: the console is a DIFFERENT mount (the
  // substrate agent client) — the link must leave the product surface
  // with a real navigation, never an in-app pushState.
  return (
    <a className="ps-site-console" href={entry.href ?? "/console"}>
      {label}
    </a>
  );
}

export function SiteNav({
  currentPath,
  navigation,
}: {
  readonly currentPath: string;
  readonly navigation?: PaySwapNavigation;
}) {
  return (
    <nav aria-label="Site" className="ps-site-nav">
      {NAV_LINKS.map((link) => (
        <ProductLink
          key={link.href}
          to={link.href}
          navigation={navigation}
          className={
            link.href === currentPath ? "ps-site-nav-link is-active" : "ps-site-nav-link"
          }
          aria-current={link.href === currentPath ? "page" : undefined}
        >
          {link.label}
        </ProductLink>
      ))}
    </nav>
  );
}

/** The eleven-area navigation for the app routes (J2–J13 reachable). */
export function AppAreaNav({
  currentPath,
  navigation,
  areas,
}: {
  readonly currentPath: string;
  readonly navigation?: PaySwapNavigation;
  readonly areas: readonly {
    readonly id: string;
    readonly label: string;
    readonly route: string;
  }[];
}) {
  return (
    <nav aria-label="Product areas" className="ps-area-nav">
      {areas.map((area) => {
        const active = area.route === currentPath;
        return (
          <ProductLink
            key={area.id}
            to={area.route}
            navigation={navigation}
            className={active ? "ps-area-nav-link is-active" : "ps-area-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            {area.label}
          </ProductLink>
        );
      })}
    </nav>
  );
}

export function SiteFooter({ navigation }: { readonly navigation?: PaySwapNavigation } = {}) {
  return (
    <footer className="ps-site-footer">
      <p className="ps-site-footer-line">
        PaySwap is a non-custodial economic operating system. Balances you
        see are external observations — never PaySwap custody. Every
        consequential financial action carries authorization and evidence
        lineage.
      </p>
      <nav aria-label="Footer" className="ps-site-footer-links">
        <ProductLink to="/capabilities" navigation={navigation}>
          Capabilities
        </ProductLink>
        <ProductLink to="/security" navigation={navigation}>
          Security &amp; non-custody
        </ProductLink>
        <ProductLink to="/developers" navigation={navigation}>
          Developers
        </ProductLink>
        {/* The console link is a plain anchor on purpose: /console is a
            different mount (the substrate agent client), so it must leave
            the product surface with a real navigation, never pushState. */}
        <a href="/console">Agent console</a>
      </nav>
      <p className="ps-site-footer-attribution">{UPSTREAM_ATTRIBUTION}</p>
    </footer>
  );
}
