/**
 * PaySwap Desktop (P17-A, ADR-0010 D2) — the payment-mission channel
 * members, implemented over the REAL PaymentMissionRuntime and split
 * from ./service.ts for the ≤400-line file law.
 *
 * CHANNEL DISCIPLINE (see ./payment-mission-contracts.ts for the DTO
 * laws): read/input verbs only; the DTO projections carry NO
 * credentials, NO secrets and NO authorization artifacts (the detail
 * carries the attempt COUNT — the attempt records, which carry the
 * consumed-artifact lineage, never cross this channel). Instants are
 * stamped HERE, at the channel edge, from the injected host clock —
 * never renderer-supplied. Every member fails closed when the runtime
 * was not composed (the typed PaymentPlaneNotConfiguredError, thrown
 * by the resolver the service injects).
 */

import {
  PAYMENT_INTAKE_FIELD_IDS,
  PaymentMissionError,
  type PaymentIntakeFieldId,
  type PaymentMissionPlanSelection,
  type PaymentMissionRecord,
} from "../payments/contracts.js";
import type { PaymentMissionRuntime } from "../payments/payment-mission-runtime.js";
import type { StoredPaymentPreview } from "../payments/payment-mission-store.js";
import { createHonestEmptyGateEnvironment } from "../payments/validation-gates.js";
import { PaymentPlaneNotConfiguredError } from "./plane-errors.js";
import type {
  IPaySwapDesktopPaymentMissionMembers,
  PaymentMissionBoardItemDto,
  PaymentMissionDetailDto,
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
}

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
    events: record.events.map((event) => ({
      id: event.id,
      at: event.at,
      kind: event.kind,
      summary: event.summary,
      ...(event.correlationRef !== undefined ? { correlationRef: event.correlationRef } : {}),
    })),
    fields: record.fields,
    ...(record.intent !== undefined ? { intent: record.intent } : {}),
    ...(record.previewId !== undefined ? { previewId: record.previewId } : {}),
    ...(record.planSelection !== undefined ? { planSelection: record.planSelection } : {}),
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
): IPaySwapDesktopPaymentMissionMembers {
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
        // The deployment fact: the six gates run over the HONEST EMPTY
        // environment (zero connected capability instances) and the
        // compile may BLOCK typed (INV-7 — no observed funding
        // source). The runtime's presentPreview returns the BLOCKED
        // preview honestly (gates BLOCK with verbatim reasons,
        // dispatchable false) — nothing is fabricated, and the typed
        // block IS the surfaced outcome.
        const preview = await runtime.presentPreview(
          missionId,
          createHonestEmptyGateEnvironment(deps.now()),
        );
        const mission = await runtime.getMission(missionId);
        deps.log(
          "info",
          `payswap-desktop: payment mission preview presented ${preview.previewId} over the honest empty gate environment (dispatchable=${String(preview.dispatchable)})`,
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
