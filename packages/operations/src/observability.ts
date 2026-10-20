/**
 * @payswap/operations — observability contracts (P8-W3, hard law 3).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * observability.ts onto the canonical architecture. The laws:
 *
 * - LIVENESS/READINESS SEPARATION: liveness asserts ONLY that a process
 *   is alive; readiness asserts that a plane may serve traffic, and EVERY
 *   readiness claim CITES A CONTRACT-BACKED SOURCE (a declared
 *   dependency probe, counter threshold, contract check, evidence record
 *   or gate verdict). No health claim without a contract-backed source —
 *   a readiness claim with zero sources, or citing an undeclared source,
 *   fails closed.
 * - EVIDENCE COUNTERS: the operational counters a healthy deployment
 *   must expose (event/reconciliation/outbox/rollback counters). CUMULATIVE
 *   counters are MONOTONIC — a decreasing cumulative counter means lost
 *   history and fails the check; every snapshot is digest-anchored.
 * - CORRELATED EVENT TAXONOMY: every observability event is keyed by
 *   PROTOCOL IDENTIFIERS; a signal that cannot be joined back to the
 *   object it describes is a contract violation.
 * - NO ORPHAN ALERTS: every alert rule references an existing runbook
 *   entry (checked by runbook.ts against the assembled index).
 *
 * Deterministic only: taxonomy, dashboards, alert rules and checkers are
 * data + pure functions. No metrics I/O happens here.
 */

import {
  PINNED_SURFACE_PROGRESS_STAGES,
  type PinnedSurfaceProgressStage,
} from "./pins/surface.js";

/** Raised when an observability contract is violated. */
export class ObservabilityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservabilityContractError";
  }
}

// ---------------------------------------------------------------------------
// Protocol correlation keys (closed vocabulary)
// ---------------------------------------------------------------------------

export const PROTOCOL_CORRELATION_KEY_KINDS = [
  "commandId",
  "eventId",
  "obligationId",
  "attemptId",
  "settlementId",
  "evidenceId",
  "reconciliationCaseId",
  "requestId",
  "campaignId",
  "advisoryId",
  "securityEpoch",
  "railId",
  "providerName",
  "deploymentId",
  "releaseId",
] as const;
export type ProtocolCorrelationKeyKind =
  (typeof PROTOCOL_CORRELATION_KEY_KINDS)[number];

/** The core financial protocol-ID set (economic-state correlation floor). */
export const CORE_PROTOCOL_ID_KINDS: readonly ProtocolCorrelationKeyKind[] =
  Object.freeze([
    "commandId",
    "eventId",
    "obligationId",
    "attemptId",
    "settlementId",
    "evidenceId",
  ]);

export function isProtocolCorrelationKeyKind(
  value: unknown,
): value is ProtocolCorrelationKeyKind {
  return (
    typeof value === "string" &&
    (PROTOCOL_CORRELATION_KEY_KINDS as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The event taxonomy
// ---------------------------------------------------------------------------

export const OBSERVABILITY_EVENT_CATEGORIES = [
  "terminal-transition",
  "unknown-outcome",
  "reconciliation",
  "outbox",
  "security",
  "deployment",
  "release",
  "provider-rollout",
  "browser-verification",
] as const;
export type ObservabilityEventCategory =
  (typeof OBSERVABILITY_EVENT_CATEGORIES)[number];

export interface ObservabilityEventDeclaration {
  /** Dotted, stable event name. */
  readonly eventName: string;
  readonly category: ObservabilityEventCategory;
  readonly description: string;
  /** >= 1 protocol-ID kind — the correlation contract. */
  readonly requiredCorrelationKeys: readonly ProtocolCorrelationKeyKind[];
}

/**
 * The surface stages whose transitions MUST be observable (terminal +
 * reconciliation paths — pinned @payswap/surface vocabulary).
 */
export const OBSERVABLE_TERMINAL_STAGES: readonly PinnedSurfaceProgressStage[] =
  Object.freeze(
    PINNED_SURFACE_PROGRESS_STAGES.filter((stage) =>
      [
        "FINALITY_RECORDED",
        "RECONCILED",
        "RETURNED",
        "REFUNDED",
        "CHARGED_BACK",
        "CANCELLED",
      ].includes(stage),
    ),
  );

/** The observability event taxonomy — the single source for sinks. */
export const OBSERVABILITY_EVENT_TAXONOMY: readonly ObservabilityEventDeclaration[] =
  Object.freeze([
    ...OBSERVABLE_TERMINAL_STAGES.map(
      (stage): ObservabilityEventDeclaration => ({
        eventName: `journey.terminal-transition.${stage.toLowerCase()}`,
        category: "terminal-transition",
        description: `A journey reached the ${stage} stage — the transition is observable with its evidence lineage.`,
        requiredCorrelationKeys: [
          "settlementId",
          "obligationId",
          "evidenceId",
        ],
      }),
    ),
    {
      eventName: "execution.attempt.outcome-unknown",
      category: "unknown-outcome",
      description:
        "An execution attempt's external outcome is UNKNOWN; it is never mapped to FAILED and never blindly retried — reconciliation owns the resolution.",
      requiredCorrelationKeys: ["attemptId", "obligationId"],
    },
    {
      eventName: "execution.attempt.awaiting-reconciliation",
      category: "unknown-outcome",
      description:
        "An execution attempt entered an ambiguity state that blocks until its reconciliation case resolves.",
      requiredCorrelationKeys: ["attemptId", "reconciliationCaseId"],
    },
    {
      eventName: "reconciliation.case-opened",
      category: "reconciliation",
      description:
        "A reconciliation case opened for an ambiguous external effect; the case is the authoritative resolution path.",
      requiredCorrelationKeys: [
        "reconciliationCaseId",
        "attemptId",
        "obligationId",
      ],
    },
    {
      eventName: "reconciliation.case-resolved",
      category: "reconciliation",
      description:
        "A reconciliation case resolved with an authoritative outcome and evidence.",
      requiredCorrelationKeys: [
        "reconciliationCaseId",
        "settlementId",
        "evidenceId",
      ],
    },
    {
      eventName: "outbox.record-published",
      category: "outbox",
      description:
        "An outbox record was published after its publisher resolved successfully.",
      requiredCorrelationKeys: ["eventId", "commandId"],
    },
    {
      eventName: "outbox.publication-ambiguous",
      category: "outbox",
      description:
        "An outbox publication outcome is UNKNOWN; the drain fails-stop and reconciliation is required before further attempts.",
      requiredCorrelationKeys: ["eventId", "commandId", "reconciliationCaseId"],
    },
    {
      eventName: "outbox.backlog-growing",
      category: "outbox",
      description:
        "Outbox backlog is growing — committed mutations risk delayed (never lost) event delivery.",
      requiredCorrelationKeys: ["eventId"],
    },
    {
      eventName: "security.quarantine-imposed",
      category: "security",
      description:
        "A component was quarantined by advisory; restricted components cannot regain access through cached capability state.",
      requiredCorrelationKeys: ["advisoryId", "securityEpoch"],
    },
    {
      eventName: "security.epoch-bumped",
      category: "security",
      description:
        "The security epoch advanced; sensitive delegated actions re-check the epoch on every authorization.",
      requiredCorrelationKeys: ["securityEpoch"],
    },
    {
      eventName: "deployment.gate-result",
      category: "deployment",
      description:
        "A deployment gate produced its verdict; failures block release.",
      requiredCorrelationKeys: ["requestId"],
    },
    {
      eventName: "deployment.parity-drift-detected",
      category: "deployment",
      description:
        "Environment parity verification detected drift outside the explicit allowlist.",
      requiredCorrelationKeys: ["requestId"],
    },
    {
      eventName: "deployment.restore-replay-drill",
      category: "deployment",
      description:
        "A restore/replay drill verified authoritative state reconstruction.",
      requiredCorrelationKeys: ["eventId"],
    },
    {
      eventName: "secrets.exposure-detected",
      category: "deployment",
      description:
        "Secret-reference hygiene detected a secret VALUE or non-reference secret key in an operational artifact.",
      requiredCorrelationKeys: ["requestId"],
    },
    {
      eventName: "release.identity-recorded",
      category: "release",
      description:
        "A deployment identity was assembled (commit + environment + build + manifest digests) and entered the release record.",
      requiredCorrelationKeys: ["releaseId", "deploymentId"],
    },
    {
      eventName: "release.rollback-executed",
      category: "release",
      description:
        "A rollback artifact was executed by an operator; the compensation evidence is referenced.",
      requiredCorrelationKeys: ["releaseId", "deploymentId"],
    },
    {
      eventName: "provider.rollout-stage-verdict",
      category: "provider-rollout",
      description:
        "A provider rollout stage produced its verdict (advance/hold/rollback) at an exact provider environment.",
      requiredCorrelationKeys: ["providerName", "releaseId"],
    },
    {
      eventName: "browser.verification-run",
      category: "browser-verification",
      description:
        "A browser-journey verification run produced its report (owned by @payswap/client-certification — cross-referenced, not duplicated).",
      requiredCorrelationKeys: ["requestId"],
    },
  ]);

// ---------------------------------------------------------------------------
// Taxonomy checkers
// ---------------------------------------------------------------------------

export interface EventTaxonomyReport {
  readonly passed: boolean;
  readonly eventCount: number;
  readonly violations: readonly { readonly eventName: string; readonly detail: string }[];
}

/**
 * The correlation contract check: every declared event has >= 1 required
 * correlation key, uses only declared protocol-ID kinds, carries at least
 * one CORE financial protocol ID whenever it describes economic state,
 * and every observable terminal stage has its transition event.
 */
export function checkEventTaxonomyCorrelation(
  taxonomy: readonly ObservabilityEventDeclaration[] = OBSERVABILITY_EVENT_TAXONOMY,
): EventTaxonomyReport {
  const violations: { eventName: string; detail: string }[] = [];
  const names = new Set<string>();
  const coreKeyedCategories = new Set<ObservabilityEventCategory>([
    "terminal-transition",
    "unknown-outcome",
    "reconciliation",
    "outbox",
  ]);
  for (const declaration of taxonomy) {
    if (names.has(declaration.eventName)) {
      violations.push({
        eventName: declaration.eventName,
        detail: "duplicate event name in taxonomy",
      });
    }
    names.add(declaration.eventName);
    if (declaration.requiredCorrelationKeys.length === 0) {
      violations.push({
        eventName: declaration.eventName,
        detail: "no required correlation key — every event must correlate to a protocol ID",
      });
    }
    for (const key of declaration.requiredCorrelationKeys) {
      if (!isProtocolCorrelationKeyKind(key)) {
        violations.push({
          eventName: declaration.eventName,
          detail: `unknown correlation key kind '${String(key)}'`,
        });
      }
    }
    if (
      coreKeyedCategories.has(declaration.category) &&
      !declaration.requiredCorrelationKeys.some((key) =>
        CORE_PROTOCOL_ID_KINDS.includes(key),
      )
    ) {
      violations.push({
        eventName: declaration.eventName,
        detail: "economic-state event is not keyed to a core protocol ID",
      });
    }
  }
  for (const stage of OBSERVABLE_TERMINAL_STAGES) {
    if (!names.has(`journey.terminal-transition.${stage.toLowerCase()}`)) {
      violations.push({
        eventName: `journey.terminal-transition.${stage.toLowerCase()}`,
        detail: `terminal stage ${stage} has no transition event`,
      });
    }
  }
  return {
    passed: violations.length === 0,
    eventCount: taxonomy.length,
    violations,
  };
}
