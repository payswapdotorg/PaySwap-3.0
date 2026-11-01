/**
 * @payswap/app — the PREPARED-ACTION FLOW battery (P24-3, ADR-0017
 * D10 — the two-phase action law's app-side folds).
 *
 *   Prepare → Validate → Preview → HUMAN confirmation → Authorize
 *           → Execute → Verify/Reconcile
 *
 * Machine-checked against the REAL folds over deterministic log
 * fixtures: the lifecycle phases (PENDING → EXECUTING → EXECUTED /
 * REFUSED / EXPIRED), the reconcile rules (UNKNOWN and read-back-due
 * are reconcile cards — an interrupted execution is UNKNOWN, never
 * failed or succeeded), the confirm gates (expiry, digest match,
 * account-context match — each violation is the typed D10 error), and
 * the exact-preview parameter projection.
 */
import { describe, expect, it } from "vitest";

import {
  assertConfirmable,
  expiredPendingCards,
  findActionCard,
  foldPreparedActionCards,
  isPreparedActionExpired,
  pendingPreparedActionOf,
  PREPARED_ACTION_TIER_LABELS,
  preparedActionParameterLines,
  reconcileCardsOf,
  PreparedActionFlowError,
} from "../../src/agent/preparedActionFlow.js";
import type { AgentConversationLogEvent, AgentConversationLogInput } from "../../src/agent/conversationLogEvents.js";

/* ------------------------------ fixtures ------------------------------ */

const T = (n: number) => `2026-10-31T12:${String(n).padStart(2, "0")}:00Z`;

function action(overrides: Partial<Parameters<typeof pendingPreparedActionOf>[0][number]["action"]> = {}) {
  return {
    preparedActionId: "pa-1",
    operationId: "PostProducts",
    catalogueRelease: "v2596",
    accountContext: {
      connectionId: "conn-1",
      stripeAccountId: "acct_test_1",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
    },
    parameters: [
      { name: "name", value: "Annual Membership", location: "body" },
      { name: "unit_amount", value: 12000, location: "body" },
      { name: "id", value: "prod_x", location: "path" },
    ],
    digest: "sha256:digest-1",
    effectClass: "STRIPE_CONFIGURATION_WRITE",
    approvalTier: "CONFIRM",
    confirmationInputs: ["Confirm creating product 'Annual Membership' ($120.00/yr) on acct_test_1 (SANDBOX)"],
    idempotencyKeyRef: "idem-1",
    readBackOperationId: "GetProducts",
    expiresAt: "2026-10-31T13:00:00Z",
    createdBy: "model_proposal",
    ...overrides,
  } as const;
}

function log(events: readonly { at: string; event: AgentConversationLogInput }[]): readonly AgentConversationLogEvent[] {
  return events.map((entry, index) => ({
    id: `conv:${index + 1}`,
    taskId: "task-1",
    at: entry.at,
    event: entry.event,
  }));
}

/* ---------------------------- the lifecycle --------------------------- */

describe("the fold (append-only events → card views)", () => {
  it("a pending action folds to the PENDING card with its EXACT record", () => {
    const events = log([{ at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } }]);
    const cards = foldPreparedActionCards(events);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      preparedActionId: "pa-1",
      phase: "PENDING",
      reconcileDue: false,
      lastAt: T(0),
    });
    expect(cards[0]!.action.digest).toBe("sha256:digest-1");
  });

  it("CONFIRMED moves the card to EXECUTING carrying the host-minted authorization reference", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } },
      { at: T(1), event: { kind: "PREPARED_ACTION_CONFIRMED", preparedActionId: "pa-1", digest: "sha256:digest-1", authorizationId: "auth-7" } },
    ]);
    const card = foldPreparedActionCards(events)[0]!;
    expect(card.phase).toBe("EXECUTING");
    expect(card.authorizationId).toBe("auth-7");
  });

  it("a CONFIRMED execution outcome closes the card; readBackDue schedules reconciliation", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } },
      { at: T(1), event: { kind: "PREPARED_ACTION_CONFIRMED", preparedActionId: "pa-1", digest: "sha256:digest-1", authorizationId: "auth-7" } },
      { at: T(2), event: { kind: "EXECUTION_OUTCOME", preparedActionId: "pa-1", outcome: { kind: "CONFIRMED", providerRefs: ["prod_new"], readBackDue: true } } },
    ]);
    const card = foldPreparedActionCards(events)[0]!;
    expect(card.phase).toBe("EXECUTED");
    expect(card.outcome).toEqual({ kind: "CONFIRMED", providerRefs: ["prod_new"], readBackDue: true });
    expect(card.reconcileDue).toBe(true);
  });

  it("an UNKNOWN outcome stays UNKNOWN and demands a reconcile card (INV-04)", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } },
      { at: T(1), event: { kind: "PREPARED_ACTION_CONFIRMED", preparedActionId: "pa-1", digest: "sha256:digest-1", authorizationId: "auth-7" } },
      { at: T(2), event: { kind: "EXECUTION_OUTCOME", preparedActionId: "pa-1", outcome: { kind: "UNKNOWN", reconciliationOperationId: "GetProducts", note: "timeout after possible dispatch" } } },
    ]);
    const card = foldPreparedActionCards(events)[0]!;
    expect(card.phase).toBe("EXECUTED");
    expect(card.outcome!.kind).toBe("UNKNOWN");
    expect(card.reconcileDue).toBe(true);
    expect(reconcileCardsOf(events)).toHaveLength(1);
  });

  it("an INTERRUPTED execution (confirmed, no outcome) is a reconcile card — UNKNOWN, never failed", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } },
      { at: T(1), event: { kind: "PREPARED_ACTION_CONFIRMED", preparedActionId: "pa-1", digest: "sha256:digest-1", authorizationId: "auth-7" } },
    ]);
    const card = foldPreparedActionCards(events)[0]!;
    expect(card.phase).toBe("EXECUTING");
    expect(card.outcome).toBeUndefined();
    expect(reconcileCardsOf(events)).toHaveLength(1);
  });

  it("REFUSED kills the action; EXPIRED kills it too — both terminal for the card", () => {
    const refused = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } },
      { at: T(1), event: { kind: "PREPARED_ACTION_REFUSED", preparedActionId: "pa-1" } },
    ]);
    expect(foldPreparedActionCards(refused)[0]!.phase).toBe("REFUSED");
    const expired = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } },
      { at: T(1), event: { kind: "PREPARED_ACTION_EXPIRED", preparedActionId: "pa-1" } },
    ]);
    expect(foldPreparedActionCards(expired)[0]!.phase).toBe("EXPIRED");
  });

  it("multiple actions keep first-pending order and independent states", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-1", digest: "d1" }) } },
      { at: T(1), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-2", digest: "d2", operationId: "PostPrices" }) } },
      { at: T(2), event: { kind: "PREPARED_ACTION_REFUSED", preparedActionId: "pa-1" } },
    ]);
    const cards = foldPreparedActionCards(events);
    expect(cards.map((card) => card.preparedActionId)).toEqual(["pa-1", "pa-2"]);
    expect(cards[0]!.phase).toBe("REFUSED");
    expect(cards[1]!.phase).toBe("PENDING");
  });

  it("at most ONE action awaits confirmation (the loop pauses on the first)", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-1" }) } },
      { at: T(1), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-2" }) } },
    ]);
    const pending = pendingPreparedActionOf(events);
    expect(pending?.preparedActionId).toBe("pa-1");
  });

  it("findActionCard resolves one action by id", () => {
    const events = log([{ at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action() } }]);
    expect(findActionCard(events, "pa-1")?.phase).toBe("PENDING");
    expect(findActionCard(events, "pa-999")).toBeUndefined();
  });
});

/* ------------------------------ expiry -------------------------------- */

describe("the expiry law (expired actions never auto-execute)", () => {
  it("expiry compares ISO-8601 UTC instants (>= is expired)", () => {
    const a = action({ expiresAt: "2026-10-31T13:00:00Z" });
    expect(isPreparedActionExpired(a, "2026-10-31T12:59:59Z")).toBe(false);
    expect(isPreparedActionExpired(a, "2026-10-31T13:00:00Z")).toBe(true);
    expect(isPreparedActionExpired(a, "2026-10-31T13:00:01Z")).toBe(true);
  });

  it("expiredPendingCards returns ONLY still-pending expired actions", () => {
    const events = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-old", expiresAt: "2026-10-31T11:00:00Z" }) } },
      { at: T(1), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-fresh" }) } },
      { at: T(2), event: { kind: "PREPARED_ACTION_REFUSED", preparedActionId: "pa-old" } },
    ]);
    // pa-old was already refused → not pending → not listed even though expired.
    expect(expiredPendingCards(events, "2026-10-31T12:00:00Z")).toEqual([]);
    const events2 = log([
      { at: T(0), event: { kind: "PREPARED_ACTION_PENDING", action: action({ preparedActionId: "pa-old", expiresAt: "2026-10-31T11:00:00Z" }) } },
    ]);
    const expired = expiredPendingCards(events2, "2026-10-31T12:00:00Z");
    expect(expired.map((card) => card.preparedActionId)).toEqual(["pa-old"]);
  });
});

/* --------------------------- the confirm gates ------------------------ */

describe("assertConfirmable (the D10 gate chain)", () => {
  it("passes for a fresh, digest-matching, same-account action", () => {
    expect(() => assertConfirmable(action(), "sha256:digest-1", "conn-1", "2026-10-31T12:30:00Z")).not.toThrow();
  });

  it("EXPIRY refuses typed — an expired action never executes", () => {
    try {
      assertConfirmable(action(), "sha256:digest-1", "conn-1", "2026-10-31T14:00:00Z");
      expect.unreachable("must throw");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(PreparedActionFlowError);
      expect((thrown as PreparedActionFlowError).code).toBe("ACTION_EXPIRED");
      expect((thrown as PreparedActionFlowError).message).toContain("never executes");
    }
  });

  it("A DIGEST CHANGE refuses typed — parameters changed after approval = NEW preview required", () => {
    try {
      assertConfirmable(action(), "sha256:different-digest", "conn-1", "2026-10-31T12:30:00Z");
      expect.unreachable("must throw");
    } catch (thrown) {
      expect((thrown as PreparedActionFlowError).code).toBe("PARAMETERS_CHANGED_NEW_PREVIEW_REQUIRED");
      expect((thrown as PreparedActionFlowError).message).toContain("NEW preview is required");
    }
  });

  it("AN ACCOUNT-CONTEXT CHANGE refuses typed — the authorization binds the account", () => {
    try {
      assertConfirmable(action(), "sha256:digest-1", "conn-OTHER", "2026-10-31T12:30:00Z");
      expect.unreachable("must throw");
    } catch (thrown) {
      expect((thrown as PreparedActionFlowError).code).toBe("ACCOUNT_CONTEXT_CHANGED_NEW_PREVIEW_REQUIRED");
      expect((thrown as PreparedActionFlowError).message).toContain("new account");
    }
  });
});

/* --------------------------- the projections -------------------------- */

describe("the exact-preview projections", () => {
  it("parameter lines render name = value (location) — non-strings JSON-encoded", () => {
    const lines = preparedActionParameterLines(action());
    expect(lines).toEqual([
      { name: "name", value: "Annual Membership", location: "body" },
      { name: "unit_amount", value: "12000", location: "body" },
      { name: "id", value: "prod_x", location: "path" },
    ]);
  });

  it("the tier labels cover all four pinned tiers with people language", () => {
    expect(Object.keys(PREPARED_ACTION_TIER_LABELS).sort()).toEqual([
      "CONFIRM",
      "NONE",
      "REAUTH",
      "STRONG_CONFIRM",
    ]);
    expect(PREPARED_ACTION_TIER_LABELS.REAUTH).toContain("Re-authentication required");
    expect(PREPARED_ACTION_TIER_LABELS.STRONG_CONFIRM).toContain("Strong confirmation required");
  });
});
