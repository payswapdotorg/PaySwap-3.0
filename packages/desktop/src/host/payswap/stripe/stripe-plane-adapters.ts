/**
 * PaySwap Desktop (P24-D, ADR-0017 D1/D8) — the STRIPE PLANE REAL
 * ADAPTER LIFTS: the production form of the P24-2 wiring recipe
 * (test/payswap/stripe-p241-wiring-adapters.ts — "each a named seam
 * the TL wires at P24-D"), lifted from the test tier into the host
 * composition tier so the shipped app's conversation plane rides
 * Worker 1's REAL implementations.
 *
 * THE LAYER LAW (the P17-C rootDir precedent, honestly recorded): the
 * desktop host layer never imports @payswap/* PACKAGE SPECIFIERS — but
 * this ONE composition module imports the provider-runtime WORKSPACE
 * SOURCE by relative path, exactly the way the renderer's composition
 * roots pull sibling workspace sources (tsconfig.renderer.json paths +
 * include; tsconfig.host.json relaxed rootDir to "../" for the same
 * structural reason — the composition pulls sibling source, the common
 * root is the packages directory). The provider-runtime package is
 * ZERO-runtime-dependency pure TypeScript (its own package law) and its
 * src carries no node builtins (the boundary battery's node:fs catch —
 * dev-time edges live in scripts/). The census/validator/transport are
 * the SAME source objects the provider-runtime battery and the P24-2
 * wiring batteries test — never a by-value copy.
 *
 * THE ADAPTERS (each maps Worker 1's REAL surface onto the host action
 * seams — action-seams.ts):
 * - `realCensusPort()`       → StripeOperationCensusPort over the REAL
 *   STRIPE_OPERATION_CENSUS + stripeCensusDispatchAllowed + the REAL
 *   read-back route registry + the REAL idempotency classification.
 * - `realSchemaValidator()`  → StripeOperationSchemaValidator over the
 *   REAL schema-reader records + the REAL strict validator (unknown
 *   fields rejected; the normalized output rebuilt from the validator's
 *   location split so the digest binds the REAL normalized form).
 * - `realDispatchTransport()` → StripeDispatchTransport over the REAL
 *   StripeCatalogueTransport behind the injected fetch (v1 form
 *   encoding, per-call Stripe-Version, Idempotency-Key on v1
 *   state-changing POSTs only, INV-04 result mapping one-to-one).
 */

import {
  STRIPE_OPERATION_CENSUS,
  stripeCensusDispatchAllowed,
} from "../../../../../provider-runtime/src/index.js";
import {
  stripeOperationSchema,
  STRIPE_SCHEMA_DEFS,
} from "../../../../../provider-runtime/src/adapters/stripe/catalogue/schema-reader.js";
import { validateStripeOperationParameters } from "../../../../../provider-runtime/src/adapters/stripe/catalogue/schema-validator.js";
import { stripeReadBackOperationOf } from "../../../../../provider-runtime/src/adapters/stripe/catalogue/implemented-operations.js";
import { stripeIdempotencyKeyAllowed } from "../../../../../provider-runtime/src/adapters/stripe/catalogue/idempotency-classification.js";
import { StripeCatalogueTransport } from "../../../../../provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import { pinnedCatalogueReleaseIdentity } from "../connections/stripe-api-version-state.js";
import type {
  StripeCensusOperationView,
  StripeDispatchResponse,
  StripeDispatchTransport,
  StripeOperationCensusPort,
  StripeOperationSchemaValidator,
} from "./action-seams.js";
import type { StripeActionParameter } from "./prepared-action-contracts.js";

/** Narrow the census method vocabulary onto the seam's transport verbs. */
function narrowCensusMethod(method: string): "GET" | "POST" | "DELETE" {
  if (method === "GET" || method === "POST" || method === "DELETE") {
    return method;
  }
  return "GET";
}

/** The REAL census adapter (the P24-2 recipe, production lift). */
export function realCensusPort(): StripeOperationCensusPort {
  const views: StripeCensusOperationView[] = STRIPE_OPERATION_CENSUS.map(
    (record: (typeof STRIPE_OPERATION_CENSUS)[number]) => ({
      operationId: record.operationId,
      apiNamespace: record.apiNamespace,
      method: narrowCensusMethod(record.method),
      path: record.path,
      pathParams: record.pathParams,
      effectClass: record.effectClass,
      approvalTier: record.approvalTier,
      supportState: record.supportState,
      requiredPermissionRule: record.requiredPermissionRule,
      readBackOperationId: stripeReadBackOperationOf(record.operationId),
      idempotencyKeyAllowed: stripeIdempotencyKeyAllowed(record),
      summary: record.summary,
      resourceFamily: record.resourceFamily,
      packId: record.packId,
      listPaginated: record.listPaginated,
    }),
  );
  const byId = new Map(views.map((view) => [view.operationId, view]));
  return {
    catalogueRelease: pinnedCatalogueReleaseIdentity(),
    resolve: (operationId) => byId.get(operationId),
    dispatchAllowed: (operationId) => stripeCensusDispatchAllowed(operationId),
    enumerate: () => Object.freeze([...views]),
  };
}

/** The REAL schema-validator adapter (the P24-2 recipe, production lift). */
export function realSchemaValidator(): StripeOperationSchemaValidator {
  return {
    validate: async (operationId, parameters) => {
      const schema = stripeOperationSchema(operationId);
      if (schema === undefined) {
        return { ok: false, refusal: { kind: "UNKNOWN_OPERATION", operationId } };
      }
      const flat: Record<string, unknown> = {};
      for (const parameter of parameters) {
        flat[parameter.name] = parameter.value;
      }
      const validated = validateStripeOperationParameters(schema, STRIPE_SCHEMA_DEFS, flat);
      if (!validated.ok) {
        const issue = validated.issues[0];
        const name = issue?.at || "parameters";
        if (issue?.kind === "UNKNOWN_FIELD") {
          return { ok: false, refusal: { kind: "UNKNOWN_PARAMETER", name } };
        }
        if (issue?.kind === "MISSING_REQUIRED") {
          return { ok: false, refusal: { kind: "MISSING_REQUIRED_PARAMETER", name } };
        }
        return {
          ok: false,
          refusal: {
            kind: "INVALID_VALUE",
            name,
            detail: `${issue?.kind ?? "REFUSED"}: ${issue?.message ?? "the real validator refused"}`,
          },
        };
      }
      const normalized: StripeActionParameter[] = [];
      for (const [name, value] of Object.entries(validated.value.path)) {
        normalized.push({ name, value, location: "path" });
      }
      for (const [name, value] of Object.entries(validated.value.query)) {
        normalized.push({ name, value, location: "query" });
      }
      for (const [name, value] of Object.entries(validated.value.body)) {
        normalized.push({ name, value, location: "body" });
      }
      return { ok: true, normalized: Object.freeze(normalized) };
    },
  };
}

/**
 * The REAL dispatch transport over the injected fetch. The fetch is the
 * transport's own minimal seam (status + headers record + text()) — the
 * composition edge adapts globalThis.fetch onto it (the Response Headers
 * object flattened for the request-id extraction only).
 */
export function realDispatchTransport(fetchImpl: {
  (
    url: string,
    init: {
      readonly method: "GET" | "POST" | "DELETE";
      readonly headers: Readonly<Record<string, string>>;
      /** P25: string bodies (form/JSON) or the multipart binary body (file upload). */
      readonly body?: string | Uint8Array<ArrayBuffer>;
      readonly signal?: AbortSignal;
    },
  ): Promise<{
    readonly status: number;
    readonly headers?: Readonly<Record<string, string>>;
    text(): Promise<string>;
  }>;
}): StripeDispatchTransport {
  const real = new StripeCatalogueTransport({ fetchImpl });
  return {
    transportId: `stripe-plane:${real.transportId}`,
    async send(call): Promise<StripeDispatchResponse> {
      const params: Record<string, unknown> = {};
      for (const parameter of call.parameters) {
        params[parameter.name] = parameter.value;
      }
      const result = await real.dispatch({
        operationId: call.operationId,
        params,
        context: {
          apiVersion: call.apiVersion,
          authorizationHeader: call.authorization,
        },
        ...(call.idempotencyKey !== undefined ? { idempotencyKey: call.idempotencyKey } : {}),
      });
      if (result.kind === "OK") {
        return {
          delivered: true,
          status: result.status,
          body: result.body,
          ...(result.requestId !== null ? { providerRequestId: result.requestId } : {}),
        };
      }
      if (result.kind === "ERROR_STATUS") {
        return {
          delivered: true,
          status: result.error.httpStatus,
          body: result.body,
          ...(result.error.providerErrorCode !== null
            ? { providerErrorCode: result.error.providerErrorCode }
            : {}),
          ...(result.error.providerErrorMessage !== null
            ? { providerErrorMessage: result.error.providerErrorMessage }
            : {}),
          ...(result.requestId !== null ? { providerRequestId: result.requestId } : {}),
        };
      }
      if (result.kind === "UNKNOWN") {
        return {
          delivered: false,
          ...(result.requestId !== null ? { providerRequestId: result.requestId } : {}),
          failure: { kind: result.ambiguity, detail: result.note },
        };
      }
      return {
        delivered: false,
        failure: { kind: "REFUSED_BEFORE_DISPATCH", detail: `${result.reason}: ${result.detail}` },
      };
    },
  };
}

/** Adapt globalThis.fetch onto the transport's minimal fetch seam. */
export function nodeFetchForStripePlane(
  fetchImpl: typeof globalThis.fetch,
): Parameters<typeof realDispatchTransport>[0] {
  return async (url, init) => {
    // The P25 multipart body arrives as bytes; BodyInit takes a Blob.
    const body =
      init.body === undefined
        ? undefined
        : init.body instanceof Uint8Array
          ? new Blob([init.body])
          : init.body;
    const response = await fetchImpl(url, {
      method: init.method,
      headers: init.headers,
      ...(body !== undefined ? { body } : {}),
      ...(init.signal !== undefined ? { signal: init.signal } : {}),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: response.status, headers, text: () => response.text() };
  };
}
