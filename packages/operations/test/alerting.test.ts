import { describe, expect, it } from "vitest";
import {
  ALERT_RULES,
  ALERT_SEVERITY_ROUTES,
  DASHBOARDS,
  alertsForEvent,
  checkDashboardsAgainstTaxonomy,
  resolveAlertRoutes,
} from "../src/alerting.js";

describe("alerting + dashboards (no orphan alerts — data layer)", () => {
  it("every dashboard panel groups by a protocol ID and cites taxonomy events", () => {
    const report = checkDashboardsAgainstTaxonomy();
    expect(report.passed).toBe(true);
    expect(DASHBOARDS.length).toBe(3);
  });

  it("dashboard checking fails on unknown events and non-protocol keys", () => {
    const report = checkDashboardsAgainstTaxonomy([
      {
        dashboardId: "bad",
        title: "Bad",
        panels: [
          {
            panelId: "worse",
            title: "Worse",
            events: ["not.a.taxonomy.event"],
            correlatedBy: "notAKey" as never,
          },
        ],
      },
    ]);
    expect(report.passed).toBe(false);
    expect(report.violations.join("\n")).toContain("unknown event");
    expect(report.violations.join("\n")).toContain("non-protocol key");
  });

  it("every alert rule routes to a runbook entry id (existence checked in runbook.ts)", () => {
    expect(ALERT_RULES.length).toBeGreaterThanOrEqual(10);
    for (const rule of ALERT_RULES) {
      expect(rule.runbookEntryId).toMatch(/^rb-/);
      expect(rule.events.length).toBeGreaterThan(0);
    }
  });

  it("severity routes expand from the single routing table", () => {
    const paged = ALERT_RULES.find((rule) => rule.severity === "page");
    if (paged === undefined) throw new Error("a page-severity rule exists");
    expect(resolveAlertRoutes(paged)).toEqual([
      ...ALERT_SEVERITY_ROUTES.page,
    ]);
    const ticketed = ALERT_RULES.find((rule) => rule.severity === "ticket");
    if (ticketed === undefined) throw new Error("a ticket rule exists");
    expect(resolveAlertRoutes(ticketed)).toEqual(ALERT_SEVERITY_ROUTES.ticket);
  });

  it("alertsForEvent resolves the rules an event trips", () => {
    expect(
      alertsForEvent("execution.attempt.outcome-unknown").map((r) => r.alertId),
    ).toContain("unknown-outcome-open");
    expect(alertsForEvent("release.rollback-executed").map((r) => r.alertId)).toEqual([
      "rollback-executed",
    ]);
    expect(alertsForEvent("no.such.event")).toEqual([]);
  });
});
