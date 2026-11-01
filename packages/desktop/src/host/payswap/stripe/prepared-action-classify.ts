/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the honest dispatch
 * CLASSIFICATION (INV-04: UNKNOWN is never collapsed into FAILED, and a
 * provider 2xx alone is never a CONFIRMED effect).
 *
 * Extracted from prepared-action-executor.ts per the ≤400-line file law;
 * the laws are unchanged:
 * - a delivered 2xx with a readable object id is CONFIRMED (readBackDue
 *   when the census reviewed a read-back route);
 * - a delivered 2xx on a GET is the data itself (no read-back needed);
 * - a delivered 2xx WITHOUT a readable object id on a mutation is
 *   UNKNOWN — the effect is unverified and reconciliation by read-back
 *   is the only path back to terminal (never a fabricated CONFIRMED);
 * - a delivered non-2xx is PROVIDER_REJECTED (status + typed code);
 * - a transport refusal before dispatch is FAILED/REFUSED_BEFORE_DISPATCH;
 * - anything else (timeout after possible dispatch, connection lost,
 *   malformed response) is UNKNOWN with a reconciliation route — INV-04.
 */

import type {
  StripeActionExecutionOutcome,
  StripePreparedAction,
} from "./prepared-action-contracts.js";
import type { StripeDispatchResponse } from "./action-seams.js";

/** The census facts the classification consumes (the dispatch's operation view). */
export interface ClassifiedOperation {
  readonly method: "GET" | "POST" | "DELETE";
  readonly readBackOperationId: string | null;
}

/** The append callback the executor supplies (every attempt is audited). */
export type DispatchAuditSink = (
  outcome: StripeActionExecutionOutcome,
  requestIds: readonly string[],
) => Promise<StripeActionExecutionOutcome>;

/** Read a provider object id off a 2xx body (never guesses). */
export function providerObjectIdOf(body: unknown): string | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** The honest dispatch classification (INV-04 — never collapses UNKNOWN). */
export async function classifyDispatchOutcome(
  operation: ClassifiedOperation,
  response: StripeDispatchResponse,
  audit: DispatchAuditSink,
): Promise<StripeActionExecutionOutcome> {
  const readBackOperationId = operation.readBackOperationId;
  const requestIds =
    typeof response.providerRequestId === "string" && response.providerRequestId.length > 0
      ? [response.providerRequestId]
      : [];
  if (response.delivered) {
    const status = response.status ?? 0;
    if (status >= 200 && status < 300) {
      const objectId = providerObjectIdOf(response.body);
      if (objectId === null && operation.method === "GET") {
        // A read response IS the data (no object id to extract; no
        // read-back needed) — the read path is Worker 3's direct tool.
        return audit({ kind: "CONFIRMED", providerRefs: [], readBackDue: false }, requestIds);
      }
      if (objectId === null) {
        return audit(
          {
            kind: "UNKNOWN",
            reconciliationOperationId: readBackOperationId,
            note: "the provider answered 2xx without a readable object id — the effect is unverified; reconcile by read-back (never a fabricated CONFIRMED)",
          },
          requestIds,
        );
      }
      return audit(
        {
          kind: "CONFIRMED",
          providerRefs: Object.freeze([objectId]),
          readBackDue: readBackOperationId !== null,
        },
        requestIds,
      );
    }
    return audit(
      { kind: "PROVIDER_REJECTED", httpStatus: status, providerErrorCode: response.providerErrorCode ?? null },
      requestIds,
    );
  }
  const failureKind = response.failure?.kind ?? "CONNECTION_LOST_AFTER_DISPATCH";
  if (failureKind === "REFUSED_BEFORE_DISPATCH") {
    return audit(
      {
        kind: "FAILED",
        reason: "REFUSED_BEFORE_DISPATCH",
        detail: response.failure?.detail ?? "the transport refused before dispatch",
      },
      requestIds,
    );
  }
  return audit(
    {
      kind: "UNKNOWN",
      reconciliationOperationId: readBackOperationId,
      note: `the transport reported '${failureKind}' — the request may have landed; reconcile by read-back before any retry (INV-04: UNKNOWN is never FAILED)`,
    },
    requestIds,
  );
}

/** The shape the executor passes (the stored action's read-back route + method source). */
export function classifiedOperationOf(
  action: StripePreparedAction,
  operation: { readonly method: "GET" | "POST" | "DELETE" },
): ClassifiedOperation {
  return { method: operation.method, readBackOperationId: action.readBackOperationId };
}
