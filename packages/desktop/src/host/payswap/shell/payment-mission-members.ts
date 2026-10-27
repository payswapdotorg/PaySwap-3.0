/**
 * PaySwap Desktop (P17-A, ADR-0010 D2; P18-A, ADR-0011 D2/D3) — the
 * payment-mission channel members, implemented over the REAL
 * PaymentMissionRuntime and split from ./service.ts for the
 * ≤400-line file law.
 *
 * CHANNEL DISCIPLINE (see ./payment-mission-contracts.ts for the DTO
 * laws): read/input verbs only; the DTO projections carry NO
 * credentials, NO secrets and NO authorization artifacts (the detail
 * carries the attempt STATES per ADR-0011 D3 and the attempt COUNT —
 * the attempt records, which carry the consumed-artifact lineage,
 * never cross this channel). Instants are stamped HERE, at the
 * channel edge, from the injected host clock — never
 * renderer-supplied. Every member fails closed when the runtime was
 * not composed (the typed PaymentPlaneNotConfiguredError, thrown by
 * the resolver the service injects).
 */

import {
  PAYMENT_INTAKE_FIELD_IDS,
  PaymentMissionError,
  type PaymentIntakeFieldId,
  type PaymentMissionEvent,
  type PaymentMissionPlanSelection,
  type PaymentMissionRecord,
} from "../payments/contracts.js";
import type { PaymentMissionRuntime } from "../payments/payment-mission-runtime.js";
import type { StoredPaymentPreview } from "../payments/payment-mission-store.js";
import { createHonestEmptyGateEnvironment, type PaymentGateEnvironment } from "../payments/validation-gates.js";
import { PaymentPlaneNotConfiguredError } from "./plane-errors.js";
import { projectAttemptStates } from "./approval-members.js";
import type {
  IPaySwapDesktopPaymentMissionMembers,
  PaymentMissionBoardItemDto,
  PaymentMissionDetailDto,
  PaymentMissionEventDto,
  PaymentMissionSeedInputDto,
  PaymentMissionSeedOutcomeDto,
  PaymentPreviewDto,
} from "./payment-mission-contracts.js";

/** What the members need from the service (injected — never ambient). */
export interface PaymentMissionChannelDeps {
  /** Resolves the composed runtime; throws the typed fail-closed error when absent. */
  readonly resolveRuntime: () => PaymentMissionRuntime;
  /** The host clock (ISO-8601 instants stamped at the channel edge). */
  readonly now: () => string;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log: (level: "info" | "warn" | "error", message: string) => void;
  /**
   * (P21-A, ADR-0014 D6) The gate-environment composition seam: when
   * the host composed the connection plane + the probe plane, the
   * service injects the bridge-backed environment builder (the REAL
   * environment when connections are ACTIVE with confirmed probe
   * evidence; the honest-empty one otherwise — byte-identical). When
   * ABSENT (the uncomposed-plane default), the member composes the
   * honest-empty environment itself, exactly as before.
   */
  readonly gateEnvironmentOf?: (input: {
    readonly now: string;
    /** The mission's captured amount, when complete (the declared quote's denominations). */
    readonly missionAmount?: { readonly currency: string; readonly minorUnits: string };
  }) => Promise<PaymentGateEnvironment>;
}

/**
 * The P17-A member subset this factory produces (read/input verbs
 * only); the P18-A approval members live in ./approval-members.ts over
 * the SAME deps shape — the service spreads both families.
 */
export type PaymentMissionChannelMemberSurface = Pick<
  IPaySwapDesktopPaymentMissionMembers,
  | "paymentMissionBoard"
  | "paymentMissionDetail"
  | "paymentMissionSeed"
  | "paymentMissionAskNextField"
  | "paymentMissionCapture"
  | "paymentMissionPresentPreview"
  | "paymentMissionRecordPlanSelection"
>;

/**
 * The fail-closed runtime resolver the service injects: throws the
 * typed PaymentPlaneNotConfiguredError when the runtime was not
 * composed, logged ONCE through the host seam (the workspace-store
 * discipline — never a silent no-op, never an in-memory-only plane
 * pretending to be durable).
 */
export function createPaymentMissionRuntimeResolver(
  runtime: PaymentMissionRuntime | undefined,
  log: (level: "info" | "warn" | "error", message: string) => void,
): () => PaymentMissionRuntime {
  let missingLogged = false;
  return () => {
    if (runtime === undefined) {
      if (!missingLogged) {
        missingLogged = true;
        log(
          "warn",
          "payswap-desktop: payment-mission plane NOT configured (no payments store directory on the seam or no runtime composed) — payment-mission calls fail closed",
        );
      }
      throw new PaymentPlaneNotConfiguredError();
    }
    return runtime;
  };
}

/**
 * The channel-edge event projection (P18-A, ADR-0011 D2): the
 * timeline crosses with people-language summaries, EXCEPT the two
 * event kinds whose host-side summaries embed consumed-artifact
 * lineage — AUTHORIZATION_GRANTED (the minted artifact id) and
 * ATTEMPT_STARTED (the connection ref, the consumed artifact id and
 * the idempotency key). Those two carry a channel-edge
 * people-language line instead, and their lineage-bearing
 * correlationRef (the artifact id / the idempotency key) is
 * suppressed: NO artifact id and NO consumed-artifact lineage exists
 * on any wire shape. The host record is never rewritten (the
 * append-only law holds host-side); the redaction lives at this
 * boundary only, and every other event kind crosses verbatim.
 */
const GRANTED_EVENT_CHANNEL_SUMMARY =
  "Scoped approval granted on the presented preview by an explicit user act — the mission is armed until a host-side dispatch consumes the approval; the approval key itself never leaves the host.";
const STARTED_EVENT_CHANNEL_SUMMARY =
  "A consequential attempt started — a host-side dispatch consumed the mission's approval and sent the command onward; the execution details stay host-side.";

function toEventDto(event: PaymentMissionEvent): PaymentMissionEventDto {
  if (event.kind === "AUTHORIZATION_GRANTED") {
    return { id: event.id, at: event.at, kind: event.kind, summary: GRANTED_EVENT_CHANNEL_SUMMARY };
  }
  if (event.kind === "ATTEMPT_STARTED") {
    return { id: event.id, at: event.at, kind: event.kind, summary: STARTED_EVENT_CHANNEL_SUMMARY };
  }
  return {
    id: event.id,
    at: event.at,
    kind: event.kind,
    summary: event.summary,
    ...(event.correlationRef !== undefined ? { correlationRef: event.correlationRef } : {}),
  };
}

/** Project a mission record to the JSON-safe detail DTO (NO artifact plane). */
function toDetailDto(record: PaymentMissionRecord): PaymentMissionDetailDto {
  return {
    id: record.id,
    direction: record.direction,
    goalStatement: record.goalStatement,
    origin: record.origin,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    events: record.events.map((event) => toEventDto(event)),
    fields: record.fields,
    ...(record.intent !== undefined ? { intent: record.intent } : {}),
    ...(record.previewId !== undefined ? { previewId: record.previewId } : {}),
    ...(record.planSelection !== undefined ? { planSelection: record.planSelection } : {}),
    attempts: projectAttemptStates(record.attempts),
    attemptCount: record.attempts.length,
  };
}

/** Project one board row (the read model — demand-side facts only). */
function toBoardItemDto(record: PaymentMissionRecord): PaymentMissionBoardItemDto {
  return {
    missionId: record.id,
    direction: record.direction,
    goalStatement: record.goalStatement,
    status: record.status,
    hasCompiledIntent: record.intent !== undefined,
    hasPreview: record.previewId !== undefined,
    ...(record.planSelection !== undefined ? { planSelection: record.planSelection } : {}),
    updatedAt: record.updatedAt,
  };
}

/** Project the stored preview + the mission's plan selection to the wire DTO. */
function toPreviewDto(
  preview: StoredPaymentPreview,
  planSelection: PaymentMissionPlanSelection | undefined,
): PaymentPreviewDto {
  return {
    previewId: preview.previewId,
    missionId: preview.missionId,
    gates: {
      decision: preview.gates.decision,
      decisions: preview.gates.decisions.map((decision) => ({
        gate: decision.gate,
        decision: decision.decision,
        reason: decision.reason,
      })),
      reasons: [...preview.gates.reasons],
    },
    dispatchable: preview.dispatchable,
    presentedAt: preview.presentedAt,
    ...(planSelection !== undefined ? { planSelection } : {}),
  };
}

/** Create the payment-mission channel members over the injected runtime. */
export function createPaymentMissionChannelMembers(
  deps: PaymentMissionChannelDeps,
): PaymentMissionChannelMemberSurface {
  return {
    async paymentMissionBoard() {
      const runtime = deps.resolveRuntime();
      const missions = await runtime.listMissions();
      // Newest-updated-first (the board read model's deterministic order;
      // mission id breaks ties so the order is total, never ambient).
      const items = [...missions]
        .sort((a, b) =>
          a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1,
        )
        .map(toBoardItemDto);
      deps.log(
        "info",
        `payswap-desktop: payment mission board listed (${String(items.length)} mission(s))`,
      );
      return items;
    },

    async paymentMissionDetail(missionId) {
      const runtime = deps.resolveRuntime();
      const mission = await runtime.getMission(missionId);
      return mission === null ? null : toDetailDto(mission);
    },

    async paymentMissionSeed(input: PaymentMissionSeedInputDto): Promise<PaymentMissionSeedOutcomeDto> {
      const runtime = deps.resolveRuntime();
      // The channel seed comes from the composer text plane — the host
      // PINS the origin. PREVIEW_UI_ACT is reserved for the authority
      // act and can never arrive through this channel (ADR-0010 D2).
      const outcome = await runtime.seedMission(
        {
          direction: input.direction,
          goalStatement: input.goalStatement,
          origin: "COMPOSER_TEXT",
        },
        deps.now(),
      );
      deps.log(
        "info",
        `payswap-desktop: payment mission seeded (${outcome.action}) ${outcome.missionId} — composer-text origin pinned host-side`,
      );
      return outcome;
    },

    async paymentMissionAskNextField(missionId) {
      const runtime = deps.resolveRuntime();
      return runtime.askNextMissingField(missionId, deps.now());
    },

    async paymentMissionCapture(missionId, fieldId, value) {
      const runtime = deps.resolveRuntime();
      // Fail-closed on the channel-supplied field id BEFORE the typed
      // cast: only the nine canonical intake fields are capturable (an
      // unknown id is a typed refusal, never a silently-accepted
      // foreign field on the record).
      if (!(PAYMENT_INTAKE_FIELD_IDS as readonly string[]).includes(fieldId)) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          `fieldId must be one of the nine intake fields (${PAYMENT_INTAKE_FIELD_IDS.join(", ")})`,
          { missionId },
        );
      }
      const updated = await runtime.captureField(
        missionId,
        fieldId as PaymentIntakeFieldId,
        value,
        deps.now(),
      );
      return toDetailDto(updated);
    },

    async paymentMissionPresentPreview(missionId) {
      const runtime = deps.resolveRuntime();
      try {
        // The gate environment (P21-A, ADR-0014 D6): the injected
        // composition seam builds the REAL bridge environment when the
        // host composed the connection + probe planes (ACTIVE
        // connections with confirmed probe evidence); otherwise the
        // HONEST EMPTY environment is the deployment fact (zero
        // connected capability instances) and the compile may BLOCK
        // typed (INV-7 — no observed funding source). The runtime's
        // presentPreview returns the BLOCKED preview honestly (gates
        // BLOCK with verbatim reasons, dispatchable false) — nothing is
        // fabricated, and the typed block IS the surfaced outcome.
        const now = deps.now();
        let env: PaymentGateEnvironment;
        if (deps.gateEnvironmentOf !== undefined) {
          const mission = await runtime.getMission(missionId);
          const captured = mission?.fields.amountAndCurrency;
          const missionAmount =
            captured !== undefined && captured.status === "CAPTURED" ? captured.value : undefined;
          env = await deps.gateEnvironmentOf({
            now,
            ...(missionAmount !== undefined ? { missionAmount } : {}),
          });
        } else {
          env = createHonestEmptyGateEnvironment(now);
        }
        const preview = await runtime.presentPreview(missionId, env);
        const mission = await runtime.getMission(missionId);
        deps.log(
          "info",
          `payswap-desktop: payment mission preview presented ${preview.previewId} over the ${
            deps.gateEnvironmentOf !== undefined ? "composed connection-bridge" : "honest empty"
          } gate environment (dispatchable=${String(preview.dispatchable)})`,
        );
        return toPreviewDto(preview, mission?.planSelection);
      } catch (error) {
        if (error instanceof PaymentMissionError && error.kind === "MISSION_NOT_FOUND") {
          return null;
        }
        throw error;
      }
    },

    async paymentMissionRecordPlanSelection(missionId, input) {
      const runtime = deps.resolveRuntime();
      const updated = await runtime.recordPlanSelection(missionId, input, deps.now());
      deps.log(
        "info",
        `payswap-desktop: payment mission plan selection recorded (${input.planId}) — a record, never an authorization`,
      );
      return toDetailDto(updated);
    },
  };
}
