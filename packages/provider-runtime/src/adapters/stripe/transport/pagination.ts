/**
 * @payswap/provider-runtime — the Stripe PAGINATORS (P24-1).
 *
 * ADR-0017 D6 (BINDING): v1 and v2 pagination are SEPARATE contracts.
 *
 * v1 (cursor contract): list endpoints answer {object:'list', data:[…],
 * has_more: bool}; pages advance with `starting_after` (the last id of the
 * previous page) or move backward with `ending_before`. The paginator is
 * BOUNDED: a hard page budget (caller-supplied, capped) — no unbounded
 * walking, partial results are surfaced with `truncated: true`.
 *
 * v2 (page-token contract): list endpoints answer {data:[…], next_page_url,
 * previous_page_url}. The paginator NEVER follows the returned URL — it
 * extracts the `page` token from it (validated), and re-issues the SAME
 * catalogue operation with that token (no arbitrary-URL law). v2 lists are
 * EVENTUALLY CONSISTENT page snapshots: `eventualConsistency: true` is
 * recorded on every v2 page-set so callers can never mistake it for a
 * stable complete listing (handoff §5.1).
 */

import { ValidationError } from '../../../errors.ts';

/** The hard ceiling on the page budget (the §9.10 rate/cost control law). */
export const STRIPE_PAGINATION_MAX_PAGES_CEILING = 100;

/** The default page budget when the caller supplies none. */
export const STRIPE_PAGINATION_DEFAULT_MAX_PAGES = 10;

export interface StripePaginationBudget {
  /** Hard page count bound (≤ 100). */
  readonly maxPages: number;
}

function coerceBudget(budget?: Partial<StripePaginationBudget>): StripePaginationBudget {
  const maxPages = budget?.maxPages ?? STRIPE_PAGINATION_DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new ValidationError('the pagination budget requires a positive integer maxPages', {
      maxPages,
    });
  }
  if (maxPages > STRIPE_PAGINATION_MAX_PAGES_CEILING) {
    throw new ValidationError(
      `the pagination budget exceeds the ceiling of ${String(STRIPE_PAGINATION_MAX_PAGES_CEILING)} pages`,
    );
  }
  return { maxPages };
}

/** One fetched v1 list page (the transport's dispatch result body). */
export interface StripeV1ListPage {
  readonly data: readonly unknown[];
  readonly hasMore: boolean;
}

/** The result of a bounded v1 walk. */
export interface StripeV1PageWalk {
  readonly items: readonly unknown[];
  readonly pagesFetched: number;
  /** True when has_more was still true at the budget boundary. */
  readonly truncated: boolean;
  /** The cursor the next walk would start from (the last item's id). */
  readonly nextCursor: string | null;
}

/** Read {data, has_more} off a v1 list body (never guesses). */
export function stripeV1ListPageOf(body: unknown): StripeV1ListPage {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('a v1 list body must be an object');
  }
  const record = body as { data?: unknown; has_more?: unknown };
  if (!Array.isArray(record.data)) {
    throw new ValidationError('a v1 list body requires a data array');
  }
  return {
    data: record.data,
    hasMore: record.has_more === true,
  };
}

/** The id of the last item of a page (the starting_after cursor). */
export function stripeV1CursorOfLastItem(page: StripeV1ListPage): string | null {
  const last = page.data.length === 0 ? undefined : page.data[page.data.length - 1];
  if (last === undefined) return null;
  if (last === null || typeof last !== 'object' || Array.isArray(last)) return null;
  const id = (last as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * THE v1 PAGINATOR: walk a v1 list operation page by page under a bounded
 * budget. `fetchPage(params)` must dispatch the SAME catalogue operation
 * with the given query overrides merged in (starting_after/ending_before).
 */
export async function stripePaginateV1List(
  fetchPage: (overrides: Readonly<Record<string, unknown>>) => Promise<unknown>,
  budget?: Partial<StripePaginationBudget>,
): Promise<StripeV1PageWalk> {
  const { maxPages } = coerceBudget(budget);
  const items: unknown[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  let pagesFetched = 0;
  while (hasMore && pagesFetched < maxPages) {
    const body = await fetchPage(cursor === null ? {} : { starting_after: cursor });
    const page = stripeV1ListPageOf(body);
    pagesFetched += 1;
    items.push(...page.data);
    hasMore = page.hasMore;
    cursor = stripeV1CursorOfLastItem(page);
    if (hasMore && cursor === null) {
      // has_more without a usable cursor: the walk cannot advance — surface
      // what was fetched, honestly truncated (never an invented total).
      return { items, pagesFetched, truncated: true, nextCursor: null };
    }
  }
  return {
    items,
    pagesFetched,
    truncated: hasMore,
    nextCursor: hasMore ? cursor : null,
  };
}

/** One fetched v2 list page. */
export interface StripeV2ListPage {
  readonly data: readonly unknown[];
  readonly nextPageToken: string | null;
}

/** The result of a bounded v2 walk. */
export interface StripeV2PageWalk {
  readonly items: readonly unknown[];
  readonly pagesFetched: number;
  readonly truncated: boolean;
  readonly nextPageToken: string | null;
  /** ALWAYS true — the v2 list contract is eventually consistent (D6). */
  readonly eventualConsistency: true;
}

/** Read {data, next_page_url} off a v2 list body (never guesses). */
export function stripeV2ListPageOf(body: unknown): StripeV2ListPage {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('a v2 list body must be an object');
  }
  const record = body as { data?: unknown; next_page_url?: unknown };
  if (!Array.isArray(record.data)) {
    throw new ValidationError('a v2 list body requires a data array');
  }
  const url = record.next_page_url;
  if (url === undefined || url === null || url === '') {
    return { data: record.data, nextPageToken: null };
  }
  if (typeof url !== 'string') {
    throw new ValidationError('next_page_url must be a string when present');
  }
  return { data: record.data, nextPageToken: pageTokenOfNextPageUrl(url) };
}

/**
 * Extract the `page` token from a v2 next_page_url. The paginator NEVER
 * follows URLs: only the token is carried into the next catalogue call of
 * the SAME operation (the arbitrary-URL refusal law).
 */
export function pageTokenOfNextPageUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  const query = queryIndex === -1 ? '' : url.slice(queryIndex + 1);
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (decodeURIComponent(pair.slice(0, eq)) === 'page') {
      const token = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, '%20'));
      if (token.length === 0) {
        throw new ValidationError('a v2 next_page_url carried an empty page token');
      }
      return token;
    }
  }
  throw new ValidationError('a v2 next_page_url carries no page token');
}

/**
 * THE v2 PAGINATOR: walk a v2 list operation under a bounded budget using
 * the page-token contract. `fetchPage(params)` dispatches the SAME
 * catalogue operation with `page` merged into the query.
 */
export async function stripePaginateV2List(
  fetchPage: (overrides: Readonly<Record<string, unknown>>) => Promise<unknown>,
  budget?: Partial<StripePaginationBudget>,
): Promise<StripeV2PageWalk> {
  const { maxPages } = coerceBudget(budget);
  const items: unknown[] = [];
  let token: string | null = null;
  let pagesFetched = 0;
  for (;;) {
    if (pagesFetched >= maxPages) {
      return {
        items,
        pagesFetched,
        truncated: token !== null,
        nextPageToken: token,
        eventualConsistency: true,
      };
    }
    const body = await fetchPage(token === null ? {} : { page: token });
    const page = stripeV2ListPageOf(body);
    pagesFetched += 1;
    items.push(...page.data);
    token = page.nextPageToken;
    if (token === null) {
      return { items, pagesFetched, truncated: false, nextPageToken: null, eventualConsistency: true };
    }
  }
}
