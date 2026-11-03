/**
 * @payswap/app — the STRIPE TOOL AUTO-WALK (P26-C, the G11 UX affordance).
 *
 * THE LAW (G11, deliberate by default — P26-C closes the tedium, not the
 * deliberation): paginated list reads expose limit/starting_after and the
 * MODEL walks pages across turns. The auto-walk is an EXPLICIT OPT-IN
 * (the `autoWalk` boolean argument, offered ONLY on paginated list read
 * tools — the registry derives the option from the census fact's
 * listPaginated flag); absent/false means exactly ONE read per call,
 * byte-identical to the pre-P26-C behavior.
 *
 * THE BOUNDS ARE LAWS (mirroring the provider-runtime pagination budget,
 * ADR-0017 D6 — the app cannot import @payswap/*, so the law is pinned
 * here and test-pinned in the battery):
 * - a HARD maximum of STRIPE_TOOL_AUTO_WALK_MAX_PAGES (10) pages per
 *   auto-walk call — never configurable, never exceeded;
 * - the walk calls the EXISTING host read port repeatedly (the port
 *   contract is untouched) with the SAME operationId and the
 *   continuation cursor merged into the arguments (v1 `starting_after`;
 *   v2 `page` token extracted from next_page_url — the URL itself is
 *   never followed, never parsed beyond the token);
 * - the final output NAMES the pages walked and whether the budget
 *   truncated the walk — truncation is STATED, never silent (and the
 *   output byte budget still applies downstream in
 *   ./stripeToolOutput.ts — an oversized concatenation truncates with
 *   the honest marker there);
 * - a continuation read that answers TIMEOUT_UNKNOWN mid-walk makes the
 *   whole call UNKNOWN (INV-04 — never FAILED, never a quiet partial
 *   success); a definitive read failure mid-walk returns the items
 *   already collected with the failure named in the note;
 * - a page that claims more pages but carries no usable cursor is an
 *   honest dead-cursor truncation (never an invented total, never a
 *   guessed cursor).
 */

/* ------------------------------- the bounds ---------------------------- */

/** The hard page budget per auto-walk call (the §9.10 rate/cost law, app side). */
export const STRIPE_TOOL_AUTO_WALK_MAX_PAGES = 10 as const;

/** The opt-in argument's name (offered only on paginated list read tools). */
export const STRIPE_TOOL_AUTO_WALK_ARGUMENT_NAME = "autoWalk" as const;

/** The JSON-schema property the read-tool schema layer offers when listPaginated. */
export const STRIPE_TOOL_AUTO_WALK_ARGUMENT_SCHEMA: Readonly<Record<string, unknown>> =
  Object.freeze({
    type: "boolean",
    description: `Opt in to a bounded auto-walk: follow the continuation cursor for up to ${String(
      STRIPE_TOOL_AUTO_WALK_MAX_PAGES,
    )} pages and concatenate the items into one result that names the pages walked and any budget truncation. Absent or false means exactly one page per call (the default, model-driven pagination).`,
  });

/* ------------------------------ the walk ------------------------------- */

/** One host read outcome (the port's shapes — never re-typed, never re-mapped). */
export interface AutoWalkReadOutcome {
  readonly ok: true;
  readonly output: unknown;
}
export interface AutoWalkReadFailure {
  readonly ok: false;
  readonly error: { readonly code: string; readonly message: string; readonly retryable: boolean };
}

/** The honest walk summary every auto-walk output names (never silent). */
export interface StripeAutoWalkSummary {
  readonly pagesWalked: number;
  /** True when the walk stopped before completion (budget, dead cursor or a failed continuation read). */
  readonly truncated: boolean;
  /** True exactly when the page budget stopped the walk. */
  readonly truncatedByBudget: boolean;
  /** The cursor a continued walk would resume from (null when complete or unknowable). */
  readonly nextCursor: string | null;
  readonly note: string;
}

/** The walker's result (the runtime maps it one-to-one onto the loop's statuses). */
export type StripeAutoWalkResult =
  | { readonly status: "OK"; readonly payload: unknown }
  | {
      readonly status: "ERROR";
      readonly error: { readonly code: string; readonly message: string; readonly retryable: boolean };
    }
  | { readonly status: "UNKNOWN"; readonly message: string };

/** One parsed list page (v1 or v2 — the continuation differs by namespace). */
interface WalkPage {
  readonly data: readonly unknown[];
  readonly more: boolean;
  readonly nextCursor: string | null;
}

/** Read {data, has_more} off a v1 list body (never guesses — has_more must be literally true). */
function v1PageOf(body: unknown): WalkPage | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as { data?: unknown; has_more?: unknown };
  if (!Array.isArray(record.data)) {
    return null;
  }
  return { data: record.data, more: record.has_more === true, nextCursor: lastIdOf(record.data) };
}

/** The last item's id (the v1 starting_after cursor) — null when unusable. */
function lastIdOf(data: readonly unknown[]): string | null {
  const last = data.length === 0 ? undefined : data[data.length - 1];
  if (last === null || typeof last !== "object" || Array.isArray(last)) {
    return null;
  }
  const id = (last as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Read {data, next_page_url} off a v2 list body (the URL is never followed — token only). */
function v2PageOf(body: unknown): WalkPage | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const record = body as { data?: unknown; next_page_url?: unknown };
  if (!Array.isArray(record.data)) {
    return null;
  }
  const url = record.next_page_url;
  if (url === undefined || url === null || url === "") {
    return { data: record.data, more: false, nextCursor: null };
  }
  if (typeof url !== "string") {
    return { data: record.data, more: true, nextCursor: null };
  }
  return { data: record.data, more: true, nextCursor: pageTokenOfNextPageUrl(url) };
}

/** Extract the `page` token from a v2 next_page_url (mirrors the arbitrary-URL refusal law). */
function pageTokenOfNextPageUrl(url: string): string | null {
  const queryIndex = url.indexOf("?");
  const query = queryIndex === -1 ? "" : url.slice(queryIndex + 1);
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (decodeURIComponent(pair.slice(0, eq)) === "page") {
      const token = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, "%20"));
      return token.length > 0 ? token : null;
    }
  }
  return null;
}

/** The list envelope the model sees for a walked list (Stripe-shaped + the honest summary). */
function walkedListPayload(
  items: readonly unknown[],
  hasMore: boolean,
  summary: StripeAutoWalkSummary,
): unknown {
  return { object: "list", data: [...items], has_more: hasMore, autoWalk: summary };
}

/** The resume clause the notes carry (v1 can resume through the tool; v2 cannot — stated). */
function resumeClause(apiNamespace: "v1" | "v2", cursor: string | null): string {
  if (cursor === null) {
    return "no usable continuation cursor was available";
  }
  return apiNamespace === "v1"
    ? `resume with starting_after '${cursor}'`
    : `the next page token is '${cursor}' (this tool's arguments cannot carry a v2 page cursor — narrow the query or lower the limit)`;
}

/**
 * THE BOUNDED AUTO-WALK: after the first page, follow the continuation
 * cursor until the page says no more pages remain OR the hard page budget
 * is hit — concatenating items, naming pages and truncation honestly.
 * `executeRead` is the app-side runtime's repeated call into the EXISTING
 * host read port (the port contract is untouched).
 */
export async function autoWalkPaginatedRead(input: {
  readonly apiNamespace: "v1" | "v2";
  /** The caller's validated arguments WITHOUT the autoWalk flag (never crosses the host). */
  readonly baseArguments: Readonly<Record<string, unknown>>;
  readonly executeRead: (
    arguments_: Readonly<Record<string, unknown>>,
  ) => Promise<AutoWalkReadOutcome | AutoWalkReadFailure>;
}): Promise<StripeAutoWalkResult> {
  const parsePage = input.apiNamespace === "v2" ? v2PageOf : v1PageOf;
  const items: unknown[] = [];
  let pagesWalked = 0;
  let cursor: string | null = null;
  for (;;) {
    const pageArguments: Record<string, unknown> = { ...input.baseArguments };
    if (pagesWalked > 0 && cursor !== null) {
      if (input.apiNamespace === "v1") {
        pageArguments.starting_after = cursor;
      } else {
        pageArguments.page = cursor;
      }
    }
    const outcome = await input.executeRead(pageArguments);
    if (!outcome.ok) {
      if (pagesWalked === 0) {
        // The first page IS the call: its failure maps one-to-one onto
        // the single-read path (typed code, retry classification).
        return { status: "ERROR", error: outcome.error };
      }
      if (outcome.error.code === "TIMEOUT_UNKNOWN") {
        // INV-04: an ambiguous dispatch is never FAILED and never a
        // quiet partial success — the whole call is UNKNOWN.
        return {
          status: "UNKNOWN",
          message: `the auto-walk's page ${String(pagesWalked + 1)} read was not delivered (the request may have landed — INV-04 UNKNOWN, never FAILED); ${String(
            items.length,
          )} items were collected on earlier pages — re-issue the call (${resumeClause(
            input.apiNamespace,
            cursor,
          )}) to resume`,
        };
      }
      // A definitive failure mid-walk: the earlier pages really were
      // fetched — their items ride along with the failure named.
      return {
        status: "OK",
        payload: walkedListPayload(items, true, {
          pagesWalked,
          truncated: true,
          truncatedByBudget: false,
          nextCursor: cursor,
          note: `auto-walk stopped at page ${String(pagesWalked + 1)}: the read failed (${outcome.error.code} — ${outcome.error.message}); the ${String(
            items.length,
          )} items collected before the failure are included; ${resumeClause(input.apiNamespace, cursor)}`,
        }),
      };
    }
    const page = parsePage(outcome.output);
    if (page === null) {
      if (pagesWalked === 0) {
        // Fail-closed: the response was not a list page — nothing is
        // invented or dropped; the original body rides under 'firstPage'.
        return {
          status: "OK",
          payload: {
            autoWalk: {
              pagesWalked: 1,
              truncated: false,
              truncatedByBudget: false,
              nextCursor: null,
              note: "the first page did not carry a paginated list shape — the walk stopped after one page and the original page body is returned under 'firstPage' (nothing was invented)",
            },
            firstPage: outcome.output,
          },
        };
      }
      return {
        status: "OK",
        payload: walkedListPayload(items, true, {
          pagesWalked,
          truncated: true,
          truncatedByBudget: false,
          nextCursor: cursor,
          note: `auto-walk stopped at page ${String(pagesWalked + 1)}: the response did not carry a paginated list shape; the ${String(
            items.length,
          )} items collected before it are included`,
        }),
      };
    }
    pagesWalked += 1;
    items.push(...page.data);
    if (!page.more) {
      return {
        status: "OK",
        payload: walkedListPayload(items, false, {
          pagesWalked,
          truncated: false,
          truncatedByBudget: false,
          nextCursor: null,
          note: `auto-walk complete: ${String(pagesWalked)} page(s) walked, ${String(
            items.length,
          )} items collected (no more pages remained)`,
        }),
      };
    }
    cursor = page.nextCursor;
    if (cursor === null) {
      // has_more without a usable cursor: the walk cannot advance —
      // surface what was fetched, honestly truncated (never invented).
      return {
        status: "OK",
        payload: walkedListPayload(items, true, {
          pagesWalked,
          truncated: true,
          truncatedByBudget: false,
          nextCursor: null,
          note: `auto-walk stopped at page ${String(pagesWalked)}: the page signalled more pages but carried no usable ${
            input.apiNamespace === "v1" ? "starting_after cursor" : "page token"
          }; the ${String(items.length)} items collected are everything walkable (never an invented total)`,
        }),
      };
    }
    if (pagesWalked >= STRIPE_TOOL_AUTO_WALK_MAX_PAGES) {
      return {
        status: "OK",
        payload: walkedListPayload(items, true, {
          pagesWalked,
          truncated: true,
          truncatedByBudget: true,
          nextCursor: cursor,
          note: `auto-walk truncated by the ${String(
            STRIPE_TOOL_AUTO_WALK_MAX_PAGES,
          )}-page budget after ${String(pagesWalked)} pages (${String(
            items.length,
          )} items collected): more pages remain — ${resumeClause(input.apiNamespace, cursor)}`,
        }),
      };
    }
  }
}
