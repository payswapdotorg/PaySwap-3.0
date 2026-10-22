/**
 * PaySwap Desktop (P13-C) — the payments SNAPSHOT FORMAT, split from
 * ./payment-mission-store.ts for the ≤400-line file law: the versioned
 * wire shape, the bigint converters, the fail-closed parse (per-record
 * quarantine) and the serializer.
 */

import type { PaymentMissionRecord } from "./contracts.js";
import type { PaymentIdempotencyRecord } from "./idempotency.js";
import { initialAuthorizationGateState } from "./authorization-gate.js";
import { paymentMissionRecordStructureFinding } from "./payment-mission-store.js";
import type { PaymentAuthorizationGateState } from "./authorization-gate.js";
import type { PaymentPreviewRecord } from "./preview.js";

/** The persisted snapshot (versioned). */
export interface PaymentsSnapshot {
  readonly schemaVersion: number;
  readonly missions: readonly PaymentMissionRecord[];
  readonly previews: readonly PaymentPreviewRecord[];
  readonly authorization: PaymentAuthorizationGateState;
  readonly idempotency: readonly unknown[];
}

export type StoredPaymentPreview = PaymentPreviewRecord;

/** One quarantined persisted record (typed, never silently dropped). */
export interface PaymentsStoreQuarantineEntry {
  /** Position in the persisted missions array (-1: the snapshot itself). */
  readonly index: number;
  readonly recordId: string | null;
  readonly reason: string;
  readonly rawExcerpt: string;
}

/** The full store state (the snapshot's in-memory shape). */
export interface PaymentsStoreState {
  readonly missions: readonly PaymentMissionRecord[];
  readonly previews: readonly StoredPaymentPreview[];
  readonly authorization: PaymentAuthorizationGateState;
  readonly idempotency: readonly PaymentIdempotencyRecord[];
}

export const PAYMENTS_SNAPSHOT_SCHEMA_VERSION = 1;
export const PAYMENTS_SNAPSHOT_FILE_NAME = "payment-missions.json";
const QUARANTINE_EXCERPT_MAX = 512;

function excerpt(value: unknown): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.slice(0, QUARANTINE_EXCERPT_MAX);
  } catch {
    return "[unstringifiable]";
  }
}

/** The wire form of an idempotency record (bigint fields as strings). */
interface WireIdempotencyRecord extends Omit<PaymentIdempotencyRecord, "lastTransitionAt" | "ambiguousSince"> {
  readonly lastTransitionAt: string;
  readonly ambiguousSince?: string;
}

function toWireIdempotency(record: PaymentIdempotencyRecord): WireIdempotencyRecord {
  // Destructure the bigint fields OUT of the value (Omit removes them
  // from the type only — the spread would carry the raw bigints through).
  const { lastTransitionAt, ambiguousSince, ...rest } = record;
  const wire: WireIdempotencyRecord = {
    ...rest,
    lastTransitionAt: lastTransitionAt.toString(),
    ...(ambiguousSince !== undefined ? { ambiguousSince: ambiguousSince.toString() } : {}),
  };
  return wire;
}

function fromWireIdempotency(wire: WireIdempotencyRecord): PaymentIdempotencyRecord {
  const { lastTransitionAt, ambiguousSince, ...rest } = wire;
  return {
    ...rest,
    lastTransitionAt: BigInt(lastTransitionAt),
    ...(ambiguousSince !== undefined ? { ambiguousSince: BigInt(ambiguousSince) } : {}),
  };
}

export function parsePaymentsSnapshot(raw: string): {
  readonly state: PaymentsStoreState;
  readonly quarantine: readonly PaymentsStoreQuarantineEntry[];
} {
  const quarantine: PaymentsStoreQuarantineEntry[] = [];
  const empty: PaymentsStoreState = {
    missions: [],
    previews: [],
    authorization: initialAuthorizationGateState(),
    idempotency: [],
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    quarantine.push({
      index: -1,
      recordId: null,
      reason: `snapshot is not valid JSON (${error instanceof Error ? error.message : "parse error"})`,
      rawExcerpt: excerpt(raw),
    });
    return { state: empty, quarantine };
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as Partial<PaymentsSnapshot>).missions) ||
    typeof (parsed as Partial<PaymentsSnapshot>).schemaVersion !== "number"
  ) {
    quarantine.push({
      index: -1,
      recordId: null,
      reason: "snapshot does not match the payment-missions schema (schemaVersion + missions required)",
      rawExcerpt: excerpt(parsed),
    });
    return { state: empty, quarantine };
  }
  const snapshot = parsed as PaymentsSnapshot;
  const missions: PaymentMissionRecord[] = [];
  snapshot.missions.forEach((candidate, index) => {
    const finding = paymentMissionRecordStructureFinding(candidate);
    if (finding === null) {
      missions.push(candidate as PaymentMissionRecord);
      return;
    }
    quarantine.push({
      index,
      recordId:
        candidate !== null && typeof candidate === "object"
          ? typeof (candidate as { readonly id?: unknown }).id === "string"
            ? (candidate as { readonly id: string }).id
            : null
          : null,
      reason: finding,
      rawExcerpt: excerpt(candidate),
    });
  });
  const previews = Array.isArray(snapshot.previews)
    ? snapshot.previews.filter(
        (preview): preview is PaymentPreviewRecord =>
          preview !== null &&
          typeof preview === "object" &&
          typeof (preview as { readonly previewId?: unknown }).previewId === "string" &&
          typeof (preview as { readonly missionId?: unknown }).missionId === "string",
      )
    : [];
  if (Array.isArray(snapshot.previews) && previews.length !== snapshot.previews.length) {
    quarantine.push({
      index: -1,
      recordId: null,
      reason: "one or more persisted preview records are malformed — they were dropped from the registry (authorization binds only well-formed presentations)",
      rawExcerpt: excerpt(snapshot.previews),
    });
  }
  const wireIdempotency = Array.isArray(snapshot.idempotency) ? snapshot.idempotency : [];
  const idempotency: PaymentIdempotencyRecord[] = [];
  wireIdempotency.forEach((candidate, index) => {
    const loaded = loadWireIdempotency(candidate);
    if (loaded !== null) {
      idempotency.push(loaded);
      return;
    }
    quarantine.push({
      index,
      recordId: null,
      reason: "idempotency record does not match the pinned registrar shape",
      rawExcerpt: excerpt(candidate),
    });
  });
  return {
    state: {
      missions,
      previews,
      authorization:
        snapshot.authorization === null || typeof snapshot.authorization !== "object"
          ? initialAuthorizationGateState()
          : snapshot.authorization,
      idempotency,
    },
    quarantine,
  };
}

function loadWireIdempotency(candidate: unknown): PaymentIdempotencyRecord | null {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const wire = candidate as Readonly<Record<string, unknown>>;
  const required = ["operationId", "connectionId", "idempotencyKey", "commandId", "correlationId", "commandHash", "status", "providerReferences", "lastTransitionAt"];
  for (const key of required) {
    if (wire[key] === undefined) return null;
  }
  if (typeof wire["lastTransitionAt"] !== "string" || !/^\d+$/.test(wire["lastTransitionAt"])) {
    return null;
  }
  if (wire["ambiguousSince"] !== undefined && (typeof wire["ambiguousSince"] !== "string" || !/^\d+$/.test(wire["ambiguousSince"]))) {
    return null;
  }
  return fromWireIdempotency(candidate as WireIdempotencyRecord);
}

function serializePaymentsSnapshot(state: PaymentsStoreState): string {
  const snapshot: PaymentsSnapshot = {
    schemaVersion: PAYMENTS_SNAPSHOT_SCHEMA_VERSION,
    missions: [...state.missions],
    previews: [...state.previews],
    authorization: state.authorization,
    idempotency: state.idempotency.map(toWireIdempotency),
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export { serializePaymentsSnapshot };
