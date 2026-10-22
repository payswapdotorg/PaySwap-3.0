/**
 * @payswap/app — the PAYMENTS AREA surface tests (P12 Lane C, C2).
 *
 * The payments landing is the typed action set: every outcome action
 * anchored on payments renders its honest dispatchability + typed
 * prerequisite verbatim + the two real deep-links (configure ->
 * connections, learn -> developers), and the adjacent operational
 * surfaces (recipients/approvals/activity-receipts-reconciliation/
 * convert) are discoverable — each real-and-linked or honestly
 * UNAVAILABLE with its typed reason. Machine-checked on the REAL shell
 * (static render, same pattern as journey-map.test.tsx).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaySwapApp } from "../../src/shell/PaySwapApp.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import { HONEST_DEPLOYMENT_CONTEXT, NO_EVIDENCE_COVERAGE } from "../../src/contracts/harness.js";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { UNIVERSAL_AREAS_MIRROR } from "../../src/lib/areas.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

function shell(path: string): string {
  return renderToStaticMarkup(
    <PaySwapApp input={INPUT} navigation={createStaticNavigation(path)} console={{ href: "/console" }} />,
  );
}

function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const payments = text(shell("/app/payments"));

describe("C2 — the payments landing surfaces the typed action set", () => {
  it("is a real pinned area route carrying the payments identity + purpose", () => {
    const area = UNIVERSAL_AREAS_MIRROR.find((entry) => entry.id === "payments");
    expect(area?.route).toBe("/app/payments");
    expect(payments).toContain("Payments");
    expect(payments).toContain("Money in and money out");
  });

  it("every payments-anchored outcome action renders with its typed prerequisite verbatim", () => {
    const board = foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT);
    // pay, receive, move, checkout are anchored on payments (the alias table).
    for (const actionId of ["pay", "receive", "move", "checkout"] as const) {
      const row = board.rows.find((candidate) => candidate.actionId === actionId);
      expect(row, actionId).toBeDefined();
      expect(payments, actionId).toContain(row!.label);
      expect(payments, actionId).toContain("Not yet dispatchable");
      expect(row!.capability.dispatchable).toBe(false);
      expect(row!.capability.missingPrerequisite).toBeDefined();
      expect(payments, actionId).toContain(row!.capability.missingPrerequisite!);
    }
  });

  it("each action deep-links to connections when the prerequisite is missing + to the contract", () => {
    const html = shell("/app/payments");
    // The configure deep-link (the C2 requirement) and the learn route.
    expect(html).toContain('href="/app/connections"');
    expect(html).toContain("Configure connections");
    expect(html).toContain('href="/developers"');
    expect(html).toContain("Learn the contract");
    // The dispatchability verdict + honest nothing-dispatchable note.
    expect(payments).toContain("No payments action is dispatchable yet");
  });
});

describe("C2 — the adjacent payments surfaces are discoverable and honest", () => {
  it("recipients renders UNAVAILABLE with its typed reason — never an invented list", () => {
    expect(payments).toContain("Recipients");
    expect(payments).toContain("UNAVAILABLE");
    expect(payments).toContain("No recipients surface exists in this deployment");
    expect(payments).toContain("no recipient registry is wired");
    // No fabricated recipient rows: the row is a typed unavailable line.
    expect(payments).not.toMatch(/recipient[s]?\s+(added|saved|listed)/i);
  });

  it("approvals links the real console gate", () => {
    const html = shell("/app/payments");
    expect(payments).toContain("Approvals");
    expect(payments).toContain("Approvals gate material terms and authority scope");
    expect(html).toContain('href="/console/approvals"');
  });

  it("activity/receipts/reconciliation link the real ledger with the UNKNOWN law", () => {
    const html = shell("/app/payments");
    expect(payments).toContain("Activity, receipts & reconciliation");
    expect(payments).toContain("UNKNOWN is never FAILED");
    expect(payments).toContain("reconciled against provider records");
    expect(html).toContain('href="/app/activity"');
  });

  it("convert cross-anchors the accounts area (the alias table made visible)", () => {
    const html = shell("/app/payments");
    expect(payments).toContain("Convert");
    expect(html).toContain('href="/app/accounts"');
  });
});

describe("C2 — the payments landing keeps the pinned empty-state contract", () => {
  it("renders the designed-empty state verbatim (the eleven-area law)", () => {
    const area = UNIVERSAL_AREAS_MIRROR.find((entry) => entry.id === "payments");
    expect(payments).toContain("empty by design");
    expect(payments).toContain(area!.emptyState.reason);
    expect(payments).toContain("Why this page renders so sparsely");
  });
});
