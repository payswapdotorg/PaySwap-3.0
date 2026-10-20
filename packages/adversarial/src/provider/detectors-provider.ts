/**
 * @payswap/adversarial — the provider-plane detectors (P6-W3, lane
 * r4-w3; ADAPT of payswap.org@8a735bf packages/adversarial fault
 * modules duplicated-commands / lost-webhooks / ambiguous-provider /
 * provider-outage / clock-skew / partial-payment: the old injection
 * checks re-based as deterministic, evidence-generating detections
 * over the observation bundle).
 *
 * Every detector is a PURE function of (bundle, thresholds) → signals.
 * Detections are EVIDENCE, never verdicts: the recommendation is the
 * agent's (./agent.ts), the composition is escalate-only
 * (../block-authority.ts, INV-21), and the advisory outcomes flow
 * through the D-1 bridge (../integration/onchain-bridge.ts).
 *
 * The laws preserved from the old fault modules (proven in the test
 * suite against the immune machinery):
 * - duplicated_commands: one idempotency key → one authoritative
 *   result; a mutated re-binding is a CONFLICT-grade detection;
 * - lost_webhooks: a pending/lost outbox event is NEVER silently
 *   dropped — the detection carries the re-fetch + reconciliation
 *   recovery;
 * - ambiguous_provider: an ambiguous/unknown incident is UNKNOWN —
 *   never FAILED (INV-4); the blind retry is a detection, never an
 *   outcome;
 * - provider_outage: the outage WINDOW is evidenced with exact
 *   durations (ongoing windows are open-ended);
 * - clock_skew: a provider timestamp ahead of the local instant or
 *   regressing is detected with the exact skew delta;
 * - partial_payment: the shortfall is exact integer bps of the
 *   requested amount (no floating point).
 *
 * Deterministic only: same bundle + same thresholds → byte-identical
 * signals.
 */

import type { ThreatSeverity } from "../pins/index.ts";
import type { ProviderObservationBundle } from "./observations.ts";
import type { ProviderThreatSignal } from "./signals.ts";
import type { BuildProviderThreatSignalInput } from "./signals.ts";
import { buildProviderThreatSignal } from "./signals.ts";
import type { ProviderDetectorThresholds } from "./detectors-context.ts";
import { calibrateConfidenceBps, delta, digestRefsFor, shortfallBps } from "./detectors-context.ts";

/** The shared detector input (bundle + thresholds, both pure data). */
export interface DetectorContext {
  readonly bundle: ProviderObservationBundle;
  readonly thresholds: ProviderDetectorThresholds;
}

/** Construct a signal from a context-relative helper (frozen builder). */
function signalOf(
  context: DetectorContext,
  input: Omit<BuildProviderThreatSignalInput, "confidenceBps" | "evidence"> & {
    readonly corroborations?: number;
    readonly observationRefs: readonly string[];
    readonly deltas?: readonly { readonly label: string; readonly value: string }[];
  },
): ProviderThreatSignal {
  return buildProviderThreatSignal({
    family: input.family,
    code: input.code,
    severity: input.severity,
    method: input.method,
    confidenceBps: calibrateConfidenceBps(input.method, input.corroborations ?? 0),
    evidence: {
      observationRefs: input.observationRefs,
      digestRefs: digestRefsFor(input.observationRefs),
      deltas: input.deltas ?? [],
    },
    summary: input.summary,
  });
}

// ---------------------------------------------------------------------------
// duplicated_commands (old fault family: duplicated-commands)
// ---------------------------------------------------------------------------

/**
 * Detect duplicate/replayed commands: attemptCount > 1 is a held
 * replay (info — the idempotency registrar held the line); a MUTATED
 * re-binding on the same key is a CONFLICT-grade detection (high).
 */
export function detectDuplicatedCommands(context: DetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const attempt of context.bundle.commandAttempts) {
    if (attempt.bindingChanged) {
      signals.push(
        signalOf(context, {
          family: "duplicated_commands",
          code: "mutated_rebinding_conflict",
          severity: "high",
          method: "structural_mismatch",
          observationRefs: [attempt.observationId],
          deltas: [
            delta("attemptCount", String(attempt.attemptCount)),
            delta("bindingChanged", "1"),
          ],
          summary:
            `idempotency key '${attempt.idempotencyKey}' was re-bound with a mutated payload ` +
            `(CONFLICT; the authoritative result stands unchanged)`,
        }),
      );
      continue;
    }
    if (attempt.attemptCount >= context.thresholds.duplicateAttemptsMedium) {
      signals.push(
        signalOf(context, {
          family: "duplicated_commands",
          code: "duplicate_replay_held",
          severity: "medium",
          method: "behavioral_pattern",
          observationRefs: [attempt.observationId],
          deltas: [delta("attemptCount", String(attempt.attemptCount))],
          summary:
            `idempotency key '${attempt.idempotencyKey}' submitted ${attempt.attemptCount} times ` +
            `(one authoritative result; the journal was not double-posted)`,
        }),
      );
    }
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// lost_webhooks (old fault family: lost-webhooks)
// ---------------------------------------------------------------------------

/**
 * Detect lost/pending webhook deliveries: an outbox event pending or
 * lost past the thresholds is evidenced — NEVER silently dropped; the
 * recovery is external-object re-fetch + reconciliation only.
 */
export function detectLostWebhooks(context: DetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  const at = context.bundle.observedAt;
  for (const webhook of context.bundle.webhookDeliveries) {
    if (webhook.status === "delivered") {
      continue;
    }
    const ageMs = at - webhook.firstSeenAt;
    const severity: ThreatSeverity =
      ageMs >= context.thresholds.webhookPendingHighMs
        ? "high"
        : ageMs >= context.thresholds.webhookPendingMediumMs
          ? "medium"
          : "low";
    signals.push(
      signalOf(context, {
        family: "lost_webhooks",
        code: webhook.status === "lost" ? "webhook_lost_pending_refetch" : "webhook_pending",
        severity,
        method: "threshold_breach",
        observationRefs: [webhook.observationId],
        deltas: [
          delta("ageMs", String(ageMs)),
          delta("redrains", String(webhook.redrains)),
        ],
        summary:
          `webhook event '${webhook.eventId}' from ${webhook.providerRef} is ${webhook.status} ` +
          `(${ageMs}ms since first seen; the outbox event stays PENDING — recovery is re-fetch + reconciliation, never silent loss)`,
      }),
    );
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// ambiguous_provider (old fault family: ambiguous-provider)
// ---------------------------------------------------------------------------

/**
 * Detect ambiguous provider outcomes: an incident of kind `unknown`
 * (timeout/ambiguous response) is UNKNOWN — never FAILED (INV-4); the
 * blind-retry prohibition is carried by the recovery contract.
 */
export function detectAmbiguousProvider(context: DetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const incident of context.bundle.incidents) {
    if (incident.incidentKind !== "unknown") {
      continue;
    }
    signals.push(
      signalOf(context, {
        family: "ambiguous_provider",
        code: "ambiguous_outcome_unknown",
        severity: "high",
        method: "behavioral_pattern",
        observationRefs: [incident.observationId],
        deltas: [delta("windowStart", String(incident.windowStart))],
        summary:
          `provider ${incident.providerRef} returned an ambiguous outcome (${incident.detail}) — ` +
          `the in-flight write is UNKNOWN requiring reconciliation, never FAILED; the blind retry is forbidden`,
      }),
    );
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// provider_outage (old fault families: provider-outage; W2-006 contract)
// ---------------------------------------------------------------------------

/**
 * Detect provider/rail outages and degradations with EVIDENCED windows
 * (exact durations; ongoing windows are open-ended and graded higher).
 */
export function detectProviderOutage(context: DetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  const at = context.bundle.observedAt;
  for (const incident of context.bundle.incidents) {
    if (incident.incidentKind !== "outage" && incident.incidentKind !== "degradation") {
      continue;
    }
    const ongoing = incident.windowEnd === undefined;
    const durationMs = ongoing
      ? at - incident.windowStart
      : (incident.windowEnd ?? 0) - incident.windowStart;
    const severity: ThreatSeverity = ongoing
      ? durationMs >= context.thresholds.ongoingOutageHighMs
        ? "high"
        : "medium"
      : durationMs >= context.thresholds.incidentWindowMediumMs
        ? "medium"
        : "low";
    const corroborations =
      context.bundle.webhookDeliveries.filter(
        (webhook) =>
          webhook.providerRef === incident.providerRef && webhook.status !== "delivered",
      ).length > 0
        ? 1
        : 0;
    signals.push(
      signalOf(context, {
        family: "provider_outage",
        code: ongoing ? "outage_window_ongoing" : "outage_window_evidenced",
        severity,
        method: "threshold_breach",
        corroborations,
        observationRefs: [incident.observationId],
        deltas: [
          delta("durationMs", String(durationMs)),
          delta("ongoing", ongoing ? "1" : "0"),
        ],
        summary:
          `${incident.incidentKind} at ${incident.providerRef}` +
          `${incident.chainRef === undefined ? "" : ` (chain ${incident.chainRef})`}: ` +
          `${durationMs}ms ${ongoing ? "ongoing" : "evidenced"} window (${incident.detail}); ` +
          `probes and reconciliation precede resumption`,
      }),
    );
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// clock_skew (old fault family: clock-skew)
// ---------------------------------------------------------------------------

/**
 * Detect provider clock skew/regression: a provider timestamp AHEAD of
 * the local deterministic instant (a provider clock jumping backwards
 * relative to reality) or a sample regressing below a previous sample
 * of the same provider. Exact skew deltas; a backwards jump can never
 * resurrect an expired grant (the expiry law is monotonic).
 */
export function detectClockSkew(context: DetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  const byProvider = new Map<string, readonly number[]>();
  for (const sample of context.bundle.clockSamples) {
    const skewMs = sample.localObservedAt - sample.providerObservedAt;
    const absSkew = Math.abs(skewMs);
    if (absSkew >= context.thresholds.clockSkewMediumMs) {
      const severity: ThreatSeverity =
        absSkew >= context.thresholds.clockSkewHighMs ? "high" : "medium";
      const previous = byProvider.get(sample.providerRef);
      const regressed =
        previous !== undefined &&
        previous.some((value) => sample.providerObservedAt < value);
      signals.push(
        signalOf(context, {
          family: "clock_skew",
          code: skewMs > 0 ? "provider_clock_behind_local" : "provider_clock_ahead_of_local",
          severity: regressed ? "high" : severity,
          method: "threshold_breach",
          observationRefs: [sample.observationId],
          deltas: [delta("skewMs", String(skewMs))],
          summary:
            `clock skew at ${sample.providerRef}: provider timestamp ${skewMs}ms ` +
            `${skewMs > 0 ? "behind" : "ahead of"} the local deterministic instant` +
            `${regressed ? " (sample REGRESSED below a previous sample — terminal transitions stay monotonic)" : ""}`,
        }),
      );
    }
    const list = [...(byProvider.get(sample.providerRef) ?? []), sample.providerObservedAt];
    byProvider.set(sample.providerRef, list);
  }
  return Object.freeze(signals);
}

// ---------------------------------------------------------------------------
// partial_payment (old fault family: partial-payment)
// ---------------------------------------------------------------------------

/**
 * Detect partial captures: the shortfall is EXACT integer bps of the
 * requested amount (BigInt arithmetic, no floating point); a capture
 * whose outcome is unknown is a reconciliation-grade detection (never
 * FAILED).
 */
export function detectPartialPayment(context: DetectorContext): readonly ProviderThreatSignal[] {
  const signals: ProviderThreatSignal[] = [];
  for (const capture of context.bundle.captures) {
    if (capture.status === "unknown") {
      signals.push(
        signalOf(context, {
          family: "partial_payment",
          code: "capture_outcome_unknown",
          severity: "medium",
          method: "behavioral_pattern",
          observationRefs: [capture.observationId],
          deltas: [delta("requestedMinorUnits", capture.requested.minorUnits)],
          summary:
            `capture for payment '${capture.paymentRef}' at ${capture.providerRef} has an UNKNOWN outcome ` +
            `(reconciliation required — never FAILED, never a fabricated success)`,
        }),
      );
      continue;
    }
    if (capture.captured === undefined) {
      continue;
    }
    if (capture.captured.currency !== capture.requested.currency) {
      signals.push(
        signalOf(context, {
          family: "partial_payment",
          code: "capture_currency_mismatch",
          severity: "high",
          method: "structural_mismatch",
          observationRefs: [capture.observationId],
          deltas: [
            delta("requestedCurrency", capture.requested.currency),
            delta("capturedCurrency", capture.captured.currency),
          ],
          summary:
            `capture for payment '${capture.paymentRef}' landed in ${capture.captured.currency} ` +
            `while ${capture.requested.currency} was requested (exact-amount law)`,
        }),
      );
      continue;
    }
    const shortfall = shortfallBps(capture.requested.minorUnits, capture.captured.minorUnits);
    if (shortfall > 0) {
      const severity: ThreatSeverity =
        shortfall >= context.thresholds.partialCaptureHighBps
          ? "high"
          : shortfall >= context.thresholds.partialCaptureMediumBps
            ? "medium"
            : "low";
      signals.push(
        signalOf(context, {
          family: "partial_payment",
          code: "partial_capture_shortfall",
          severity,
          method: "threshold_breach",
          observationRefs: [capture.observationId],
          deltas: [
            delta("requestedMinorUnits", capture.requested.minorUnits),
            delta("capturedMinorUnits", capture.captured.minorUnits),
            delta("shortfallBps", String(shortfall)),
          ],
          summary:
            `capture for payment '${capture.paymentRef}' landed ${shortfall}bps short ` +
            `(requested ${capture.requested.minorUnits} ${capture.requested.currency}, ` +
            `captured ${capture.captured.minorUnits}) — surfaced as PARTIALLY_EXECUTED, ` +
            `gross obligations preserved behind the net position`,
        }),
      );
    }
  }
  return Object.freeze(signals);
}
