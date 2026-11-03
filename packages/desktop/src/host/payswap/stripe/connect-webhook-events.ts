/**
 * PaySwap Desktop (P27-A, ADR-0020 D4) — the U3 CONNECTED-ACCOUNT WEBHOOK
 * module: signature verification on the EXISTING Stripe webhook pattern
 * (provider-runtime webhook-signature.ts — the pinned t=…/v1=… HMAC scheme,
 * injected crypto seam, 300-second tolerance) plus the CONNECT event
 * vocabulary and the STRIPE_CONNECT_WEBHOOK_SECRET gate.
 *
 * THE GATE LAW (run card §B.3/§B.4): without the operator-delivered
 * STRIPE_CONNECT_WEBHOOK_SECRET the module refuses typed UNCONFIGURED —
 * a connected-account event is NEVER accepted on an unsigned or
 * unconfigured basis. The secret is injected at the composition edge and
 * never enters a result shape (escape-scanned).
 *
 * THE EVENT VOCABULARY (typed extraction, never guesses — the
 * webhook-verification.ts law):
 * - account.updated                 → the dated connected-account observation
 * - account.application.deauthorized→ the U2/U3 disconnect signal
 * - payout.paid / payout.failed     → payout observations (never resolutions
 *                                     of charge attempts — observations only)
 * - any other signed type           → VERIFIED_UNMAPPED (signature-good,
 *                                     recorded, nothing invented)
 *
 * THE CONSUMPTION LAW: only a COMPLETE verification consumes the event id;
 * every refusal leaves the id re-deliverable; a second delivery of a
 * consumed id is refused EVENT_ALREADY_CONSUMED.
 */

import { assertNoStripeSecretShapes } from "./stripe-pins.js";
import { stripeConnectedAccountObservationOf } from "./connect-observations.js";
import type { StripeConnectedAccountObservation } from "./connect-observations.js";

/** One webhook delivery exactly as the module consumes it. */
export interface StripeConnectWebhookDelivery {
  readonly eventId: string;
  readonly signatureHeader: string;
  readonly body: string;
}

/** The injected signature-verification seam (the composition edge binds the provider-runtime verifier with the CONNECT whsec). */
export interface StripeConnectSignatureVerifier {
  verify(input: { readonly signature: string; readonly canonicalBody: string }): {
    readonly valid: boolean;
    readonly reason?: string;
  };
}

/** The connect event types the module extracts (a closed, dated vocabulary). */
export type StripeConnectEventType =
  | "account.updated"
  | "account.application.deauthorized"
  | "payout.paid"
  | "payout.failed";

/** The typed verification result. */
export type StripeConnectWebhookResult =
  | { readonly kind: "UNCONFIGURED"; readonly missingItems: readonly string[] }
  | { readonly kind: "REFUSED"; readonly refusal: "SIGNATURE_INVALID" | "EVENT_ALREADY_CONSUMED" | "UNPARSEABLE_EVENT_BODY"; readonly detail: string }
  | {
      readonly kind: "VERIFIED_ACCOUNT_UPDATED";
      readonly eventId: string;
      readonly createdAtIso: string | null;
      readonly observation: StripeConnectedAccountObservation;
    }
  | {
      readonly kind: "VERIFIED_DEAUTHORIZED";
      readonly eventId: string;
      readonly createdAtIso: string | null;
      /** The disconnected account id (the U2/U3 disconnect signal). */
      readonly accountRef: string;
    }
  | {
      readonly kind: "VERIFIED_PAYOUT_OBSERVATION";
      readonly eventId: string;
      readonly createdAtIso: string | null;
      readonly payoutOutcome: "paid" | "failed";
      readonly payoutRef: string | null;
      readonly accountRef: string | null;
    }
  | { readonly kind: "VERIFIED_UNMAPPED"; readonly eventId: string; readonly eventType: string };

/** The deps (all injected; the secret exists only inside the verifier closure). */
export interface StripeConnectWebhookModuleDeps {
  /** The operator-delivered STRIPE_CONNECT_WEBHOOK_SECRET (whsec_…); absent = the typed gate. */
  readonly connectWebhookSecret?: string;
  readonly signatureVerifier: StripeConnectSignatureVerifier;
  /** The consumed-set store (single consumption per event id — the replay law). */
  readonly consumedStore?: { consumeOnce(eventId: string): boolean };
  readonly nowIso: () => string;
}

/** The in-memory consumed-store default (tests; deterministic; monotonic). */
function createInMemoryConnectConsumedStore(): { consumeOnce(eventId: string): boolean } {
  const consumedIds = new Set<string>();
  return {
    consumeOnce(eventId: string): boolean {
      if (consumedIds.has(eventId)) return false;
      consumedIds.add(eventId);
      return true;
    },
  };
}

/** The module's UNCONFIGURED items (run-card §B mapped, verbatim). */
export const STRIPE_CONNECT_WEBHOOK_MISSING_ITEMS: readonly string[] = Object.freeze([
  "STRIPE_CONNECT_WEBHOOK_SECRET — the signing secret of a publicly reachable webhook endpoint registered with Stripe for connected-account events (run card §B.3 and §B.4)",
]);

/** Compose the connect webhook module. */
export function createStripeConnectWebhookModule(deps: StripeConnectWebhookModuleDeps): {
  verify(delivery: StripeConnectWebhookDelivery): StripeConnectWebhookResult;
} {
  const consumedStore = deps.consumedStore ?? createInMemoryConnectConsumedStore();
  const consumed = { consumeOnce: (eventId: string) => consumedStore.consumeOnce(eventId) };

  const scan = (result: StripeConnectWebhookResult): StripeConnectWebhookResult => {
    assertNoStripeSecretShapes(JSON.stringify(result), "stripe-connect-webhook-result");
    return result;
  };

  return {
    verify(delivery) {
      if (
        typeof deps.connectWebhookSecret !== "string" ||
        deps.connectWebhookSecret.length === 0 ||
        !deps.connectWebhookSecret.startsWith("whsec_")
      ) {
        // THE GATE: without the operator-delivered signing secret, no
        // connected-account event is ever accepted (fail-closed).
        return scan({ kind: "UNCONFIGURED", missingItems: STRIPE_CONNECT_WEBHOOK_MISSING_ITEMS });
      }
      if (
        delivery === null ||
        typeof delivery !== "object" ||
        typeof delivery.eventId !== "string" ||
        delivery.eventId.length === 0 ||
        typeof delivery.signatureHeader !== "string" ||
        typeof delivery.body !== "string"
      ) {
        return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the delivery shape is incomplete" });
      }
      // The signature check FIRST — the pinned scheme, constant-time, the
      // injected verifier (never a re-implementation).
      const verification = deps.signatureVerifier.verify({
        signature: delivery.signatureHeader,
        canonicalBody: delivery.body,
      });
      if (!verification.valid) {
        return scan({
          kind: "REFUSED",
          refusal: "SIGNATURE_INVALID",
          detail: verification.reason ?? "the signature did not verify",
        });
      }
      // Body parse + shape (a signed body is not a licence to fabricate).
      let root: { id?: unknown; type?: unknown; created?: unknown; data?: unknown };
      try {
        const json: unknown = JSON.parse(delivery.body);
        if (json === null || typeof json !== "object" || Array.isArray(json)) {
          return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the signed body is not an event object" });
        }
        root = json as { id?: unknown; type?: unknown; created?: unknown; data?: unknown };
      } catch {
        return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the signed body is not valid JSON" });
      }
      if (root.id !== delivery.eventId) {
        return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the signed body id does not match the delivered event id" });
      }
      if (typeof root.type !== "string" || root.type.length === 0) {
        return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the signed event carries no type" });
      }
      const data =
        root.data !== null && typeof root.data === "object" && !Array.isArray(root.data)
          ? (root.data as Record<string, unknown>)
          : undefined;
      const object =
        data !== undefined && data.object !== null && typeof data.object === "object" && !Array.isArray(data.object)
          ? (data.object as Record<string, unknown>)
          : undefined;
      const createdAtIso =
        typeof root.created === "number" && Number.isSafeInteger(root.created)
          ? new Date(root.created * 1000).toISOString()
          : null;

      if (root.type === "account.updated") {
        const accountRef = typeof object?.id === "string" ? object.id : "";
        if (accountRef.length === 0) {
          return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the account.updated event carries no account id" });
        }
        const observation = stripeConnectedAccountObservationOf(accountRef, object, deps.nowIso());
        if (observation === null) {
          return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the account.updated event carries no account object" });
        }
        if (!consumed.consumeOnce(delivery.eventId)) {
          return scan({ kind: "REFUSED", refusal: "EVENT_ALREADY_CONSUMED", detail: "the event id was already consumed (replay refused)" });
        }
        return scan({
          kind: "VERIFIED_ACCOUNT_UPDATED",
          eventId: delivery.eventId,
          createdAtIso,
          observation,
        });
      }

      if (root.type === "account.application.deauthorized") {
        const accountRef = typeof object?.id === "string" ? object.id : typeof data?.account === "string" ? (data.account as string) : "";
        if (accountRef.length === 0) {
          return scan({ kind: "REFUSED", refusal: "UNPARSEABLE_EVENT_BODY", detail: "the deauthorized event carries no account id" });
        }
        if (!consumed.consumeOnce(delivery.eventId)) {
          return scan({ kind: "REFUSED", refusal: "EVENT_ALREADY_CONSUMED", detail: "the event id was already consumed (replay refused)" });
        }
        return scan({
          kind: "VERIFIED_DEAUTHORIZED",
          eventId: delivery.eventId,
          createdAtIso,
          accountRef,
        });
      }

      if (root.type === "payout.paid" || root.type === "payout.failed") {
        if (!consumed.consumeOnce(delivery.eventId)) {
          return scan({ kind: "REFUSED", refusal: "EVENT_ALREADY_CONSUMED", detail: "the event id was already consumed (replay refused)" });
        }
        return scan({
          kind: "VERIFIED_PAYOUT_OBSERVATION",
          eventId: delivery.eventId,
          createdAtIso,
          payoutOutcome: root.type === "payout.paid" ? "paid" : "failed",
          payoutRef: typeof object?.id === "string" ? object.id : null,
          accountRef: typeof object?.destination === "string" ? object.destination : null,
        });
      }

      // Signature-good but outside the connect vocabulary: recorded, never
      // invented (the VERIFIED_UNMAPPED law).
      if (!consumed.consumeOnce(delivery.eventId)) {
        return scan({ kind: "REFUSED", refusal: "EVENT_ALREADY_CONSUMED", detail: "the event id was already consumed (replay refused)" });
      }
      return scan({ kind: "VERIFIED_UNMAPPED", eventId: delivery.eventId, eventType: root.type });
    },
  };
}
