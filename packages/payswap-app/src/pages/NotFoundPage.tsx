/**
 * @payswap/app — the honest 404 page.
 *
 * ADAPT of payswap.org@8a735bf packages/web/src/app/not-found.tsx (MMP-36
 * content/IA evidence): an unknown route states the truth (nothing was
 * found at this address) and offers the honest onward paths — no fake
 * content, no invented page.
 */

import { EmptyState } from "@zcode/ui/payswap";

export function NotFoundPage({ path }: { readonly path: string }) {
  return (
    <article className="ps-page">
      <header className="ps-page-header">
        <h1 className="ps-page-title">Not found</h1>
      </header>
      <EmptyState
        title="Nothing was found at this address"
        description={`The path ${path} does not exist in the PaySwap product surface. This is the honest answer — the product does not invent a page where there is none.`}
        action={
          <a className="ps-home-cta ps-home-cta--primary" href="/">
            Back to the PaySwap home page
          </a>
        }
      />
    </article>
  );
}
