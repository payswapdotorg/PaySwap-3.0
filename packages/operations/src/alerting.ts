/**
 * @payswap/operations — alerting and dashboards as data (P8-W3).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * observability.ts (the alert/dashboard half). The laws:
 * - NO ORPHAN ALERTS: every alert rule MUST reference an existing runbook
 *   entry (checkRunbookIntegrity in runbook.ts enforces it against the
 *   assembled index) — an alert without a symptom -> diagnosis -> action
 *   -> verification path trains operators to ignore it;
 * - DASHBOARDS GROUP BY PROTOCOL IDS: every panel's series correlate to
 *   a declared protocol-ID kind and only reference taxonomy events.
 *
 * Deterministic only: declarations + pure resolution functions.
 */

import {
  PROTOCOL_CORRELATION_KEY_KINDS,
  OBSERVABILITY_EVENT_TAXONOMY,
  type ProtocolCorrelationKeyKind,
} from "./observability.js";

// ---------------------------------------------------------------------------
// Dashboards — as data (vendor-neutral sink)
// ---------------------------------------------------------------------------

export interface DashboardPanel {
  readonly panelId: string;
  readonly title: string;
  /** The event names feeding the panel. */
  readonly events: readonly string[];
  /** The protocol-ID kind every series on the panel groups by. */
  readonly correlatedBy: ProtocolCorrelationKeyKind;
}

export interface DashboardDeclaration {
  readonly dashboardId: string;
  readonly title: string;
  readonly panels: readonly DashboardPanel[];
}

/** The operator dashboards. Panel series ALWAYS group by a protocol ID. */
export const DASHBOARDS: readonly DashboardDeclaration[] = Object.freeze([
  {
    dashboardId: "journey-health",
    title: "Journey health (terminal outcomes)",
    panels: [
      {
        panelId: "terminal-stage-outcomes",
        title: "Terminal-stage outcomes over time",
        events: [
          "journey.terminal-transition.finality_recorded",
          "journey.terminal-transition.reconciled",
          "journey.terminal-transition.returned",
          "journey.terminal-transition.refunded",
          "journey.terminal-transition.charged_back",
          "journey.terminal-transition.cancelled",
        ],
        correlatedBy: "settlementId",
      },
      {
        panelId: "unknown-outcomes-awaiting-reconciliation",
        title: "UNKNOWN outcomes awaiting reconciliation",
        events: [
          "execution.attempt.outcome-unknown",
          "execution.attempt.awaiting-reconciliation",
          "reconciliation.case-opened",
        ],
        correlatedBy: "reconciliationCaseId",
      },
    ],
  },
  {
    dashboardId: "delivery-health",
    title: "Delivery health (outbox)",
    panels: [
      {
        panelId: "outbox-backlog-depth",
        title: "Outbox backlog depth",
        events: ["outbox.record-published", "outbox.backlog-growing"],
        correlatedBy: "eventId",
      },
      {
        panelId: "ambiguous-publications",
        title: "Ambiguous outbox publications (fail-stop)",
        events: ["outbox.publication-ambiguous"],
        correlatedBy: "eventId",
      },
    ],
  },
  {
    dashboardId: "release-readiness",
    title: "Release readiness",
    panels: [
      {
        panelId: "release-and-rollout-events",
        title: "Identity, gate and rollout events",
        events: [
          "release.identity-recorded",
          "release.rollback-executed",
          "deployment.gate-result",
          "deployment.parity-drift-detected",
          "secrets.exposure-detected",
          "provider.rollout-stage-verdict",
          "deployment.restore-replay-drill",
        ],
        correlatedBy: "releaseId",
      },
    ],
  },
]);

// ---------------------------------------------------------------------------
// Alert rules — every one routed to a runbook entry
// ---------------------------------------------------------------------------

export type AlertSeverity = "page" | "ticket" | "review";

export interface AlertRule {
  readonly alertId: string;
  readonly title: string;
  /** Human-readable triggering condition over the event taxonomy. */
  readonly condition: string;
  readonly events: readonly string[];
  readonly severity: AlertSeverity;
  /** Routing channels for this severity (expanded from the table). */
  readonly routes: readonly string[];
  /**
   * The runbook entry that owns this alert — REQUIRED, no orphan alerts.
   */
  readonly runbookEntryId: string;
}

export const ALERT_SEVERITY_ROUTES: Readonly<
  Record<AlertSeverity, readonly string[]>
> = Object.freeze({
  page: ["on-call-payments", "incident-commander"],
  ticket: ["ops-queue"],
  review: ["daily-ops-review"],
});

/** The alert rules. Every entry links a runbook entry (no orphans). */
export const ALERT_RULES: readonly AlertRule[] = Object.freeze([
  {
    alertId: "unknown-outcome-open",
    title: "UNKNOWN execution outcomes present",
    condition:
      "execution.attempt.outcome-unknown or execution.attempt.awaiting-reconciliation observed and not yet linked to an open reconciliation case",
    events: [
      "execution.attempt.outcome-unknown",
      "execution.attempt.awaiting-reconciliation",
    ],
    severity: "page",
    routes: [...ALERT_SEVERITY_ROUTES.page],
    runbookEntryId: "rb-unknown-outcome",
  },
  {
    alertId: "reconciliation-backlog-sla",
    title: "Reconciliation backlog breaching SLA",
    condition:
      "cases opened (reconciliation.case-opened) exceed resolved (reconciliation.case-resolved) beyond the SLA window",
    events: ["reconciliation.case-opened", "reconciliation.case-resolved"],
    severity: "page",
    routes: [...ALERT_SEVERITY_ROUTES.page],
    runbookEntryId: "rb-unknown-outcome",
  },
  {
    alertId: "outbox-backlog-growing",
    title: "Outbox backlog growing",
    condition: "outbox.backlog-growing observed",
    events: ["outbox.backlog-growing"],
    severity: "page",
    routes: [...ALERT_SEVERITY_ROUTES.page],
    runbookEntryId: "rb-outbox-backlog",
  },
  {
    alertId: "outbox-publication-ambiguous",
    title: "Ambiguous outbox publication (drain fail-stopped)",
    condition: "outbox.publication-ambiguous observed",
    events: ["outbox.publication-ambiguous"],
    severity: "page",
    routes: [...ALERT_SEVERITY_ROUTES.page],
    runbookEntryId: "rb-outbox-ambiguity",
  },
  {
    alertId: "security-quarantine-imposed",
    title: "Component quarantined by advisory",
    condition: "security.quarantine-imposed observed",
    events: ["security.quarantine-imposed"],
    severity: "page",
    routes: [...ALERT_SEVERITY_ROUTES.page],
    runbookEntryId: "rb-security-quarantine",
  },
  {
    alertId: "parity-drift-detected",
    title: "Environment configuration drift",
    condition: "deployment.parity-drift-detected observed",
    events: ["deployment.parity-drift-detected"],
    severity: "ticket",
    routes: [...ALERT_SEVERITY_ROUTES.ticket],
    runbookEntryId: "rb-parity-drift",
  },
  {
    alertId: "secret-exposure-detected",
    title: "Secret exposure detected in an operational artifact",
    condition: "secrets.exposure-detected observed",
    events: ["secrets.exposure-detected"],
    severity: "page",
    routes: [...ALERT_SEVERITY_ROUTES.page],
    runbookEntryId: "rb-secret-exposure",
  },
  {
    alertId: "rollout-stage-held",
    title: "Provider rollout stage held",
    condition:
      "provider.rollout-stage-verdict produced HOLD — the stage's hold criteria tripped and the rollout is frozen at its current exposure",
    events: ["provider.rollout-stage-verdict"],
    severity: "ticket",
    routes: [...ALERT_SEVERITY_ROUTES.ticket],
    runbookEntryId: "rb-rollout-hold",
  },
  {
    alertId: "rollback-executed",
    title: "Rollback executed",
    condition:
      "release.rollback-executed observed — a rollback artifact was executed by an operator; verify compensation completion",
    events: ["release.rollback-executed"],
    severity: "ticket",
    routes: [...ALERT_SEVERITY_ROUTES.ticket],
    runbookEntryId: "rb-rollback-execution",
  },
  {
    alertId: "restore-replay-drill-stale",
    title: "Restore/replay drill not run within window",
    condition:
      "no deployment.restore-replay-drill event within the required drill window",
    events: ["deployment.restore-replay-drill"],
    severity: "review",
    routes: [...ALERT_SEVERITY_ROUTES.review],
    runbookEntryId: "rb-restore-replay",
  },
]);

// ---------------------------------------------------------------------------
// Resolution functions
// ---------------------------------------------------------------------------

/**
 * Alert-routing resolution: which channels an alert fans out to. Severity
 * routes are expanded from ALERT_SEVERITY_ROUTES (single source).
 */
export function resolveAlertRoutes(alert: AlertRule): readonly string[] {
  const routes = [...alert.routes];
  for (const route of ALERT_SEVERITY_ROUTES[alert.severity]) {
    if (!routes.includes(route)) {
      routes.push(route);
    }
  }
  return routes;
}

/** All alerts whose triggering events include the given event name. */
export function alertsForEvent(
  eventName: string,
  rules: readonly AlertRule[] = ALERT_RULES,
): readonly AlertRule[] {
  return rules.filter((rule) => rule.events.includes(eventName));
}

/** Every dashboard panel's events exist in the taxonomy. */
export function checkDashboardsAgainstTaxonomy(
  dashboards: readonly DashboardDeclaration[] = DASHBOARDS,
  taxonomy: readonly { readonly eventName: string }[] = OBSERVABILITY_EVENT_TAXONOMY,
): { passed: boolean; violations: string[] } {
  const names = new Set(taxonomy.map((declaration) => declaration.eventName));
  const violations: string[] = [];
  for (const dashboard of dashboards) {
    for (const panel of dashboard.panels) {
      if (panel.events.length === 0) {
        violations.push(`${dashboard.dashboardId}/${panel.panelId}: no events`);
      }
      if (
        !(PROTOCOL_CORRELATION_KEY_KINDS as readonly string[]).includes(
          panel.correlatedBy,
        )
      ) {
        violations.push(
          `${dashboard.dashboardId}/${panel.panelId}: panel groups by non-protocol key`,
        );
      }
      for (const eventName of panel.events) {
        if (!names.has(eventName)) {
          violations.push(
            `${dashboard.dashboardId}/${panel.panelId}: unknown event '${eventName}'`,
          );
        }
      }
    }
  }
  return { passed: violations.length === 0, violations };
}
