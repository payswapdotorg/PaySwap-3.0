/**
 * @payswap/app — the public site chrome (header + footer).
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/components/site-header.tsx
 * + site-footer.tsx (MMP-36 content/IA evidence), rendered with the
 * PaySwap design layer (@zcode/ui/payswap Topbar primitive). Presentation-
 * only: links are data; no network, no session state.
 */

import { Topbar } from "@zcode/ui/payswap";
import type { NavLink } from "../contracts/view-models.js";

const NAV_LINKS: readonly NavLink[] = [
  { href: "/payswap", label: "Product" },
  { href: "/payswap/capabilities", label: "Capabilities" },
  { href: "/payswap/security", label: "Security" },
  { href: "/payswap/developers", label: "Developers" },
];

export function SiteHeader(_: { readonly currentPath?: string }) {
  return (
    <Topbar
      leading={
        <a className="ps-site-brand" href="/payswap">
          PaySwap
        </a>
      }
      actions={
        <a className="ps-site-open" href="/payswap/app">
          Open the product
        </a>
      }
    />
  );
}

export function SiteNav({ currentPath }: { readonly currentPath: string }) {
  return (
    <nav aria-label="Site" className="ps-site-nav">
      {NAV_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={
            link.href === currentPath ? "ps-site-nav-link is-active" : "ps-site-nav-link"
          }
          aria-current={link.href === currentPath ? "page" : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="ps-site-footer">
      <p className="ps-site-footer-line">
        PaySwap is a non-custodial economic operating system. Balances you
        see are external observations — never PaySwap custody. Every
        consequential financial action carries authorization and evidence
        lineage.
      </p>
      <nav aria-label="Footer" className="ps-site-footer-links">
        <a href="/payswap/capabilities">Capabilities</a>
        <a href="/payswap/security">Security &amp; non-custody</a>
        <a href="/payswap/developers">Developers</a>
      </nav>
    </footer>
  );
}
