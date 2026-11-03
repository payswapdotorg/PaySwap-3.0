/**
 * PaySwap Desktop (P24-2) — the P24-1 REAL-WIRING ADAPTERS: the shared
 * composition recipe that puts Worker 1's REAL implementations behind
 * the host action seams (action-seams.ts). Used by
 * stripe-p241-wiring.test.ts (the join laws + the validator) and
 * stripe-p241-wiring-flow.test.ts (the transport + the full two-phase
 * flow) — the executable form of the TL's P24-D composition edge.
 *
 * The desktop HOST layer never imports @payswap/* at runtime (the
 * tsconfig EMITS; the by-value-mirror discipline) — the TEST tier may
 * import the real package source (the mirror-battery precedent).
 *
 * THE ADAPTERS (each a named seam the TL wires at P24-D):
 * - `realCensusPort()`      → StripeOperationCensusPort over the REAL
 *   STRIPE_OPERATION_CENSUS + stripeCensusDispatchAllowed + the REAL
 *   read-back route registry (stripeReadBackOperationOf) + the REAL
 *   idempotency classification (stripeIdempotencyKeyAllowed).
 * - `realSchemaValidator()` → StripeOperationSchemaValidator over the
 *   REAL schema-reader records + the REAL strict validator (unknown
 *   fields rejected; issue kinds mapped one-to-one onto the port's
 *   typed refusals; the normalized output rebuilt from the validator's
 *   location split so the digest binds the REAL normalized form).
 * - `realDispatchTransport()` → StripeDispatchTransport over the REAL
 *   StripeCatalogueTransport behind an injected scripted fetch (v1
 *   form encoding, per-call Stripe-Version, Idempotency-Key on v1
 *   state-changing POSTs only, INV-04 result mapping one-to-one).
 * - `realWiredExecutor()` → the full executor composed over all three
 *   REAL adapters + the REAL host planes (RAK binding over the real
 *   census, per-connection API-version state, verified-evidence
 *   account context, the seal).
 */

import {
  STRIPE_OPERATION_CENSUS,
  stripeCensusDispatchAllowed,
} from "../../../provider-runtime/src/index.js";
import { stripeOperationSchema, STRIPE_SCHEMA_DEFS } from "../../../provider-runtime/src/adapters/stripe/catalogue/schema-reader.js";
import { validateStripeOperationParameters } from "../../../provider-runtime/src/adapters/stripe/catalogue/schema-validator.js";
import { stripeReadBackOperationOf } from "../../../provider-runtime/src/adapters/stripe/catalogue/implemented-operations.js";
import { stripeIdempotencyKeyAllowed } from "../../../provider-runtime/src/adapters/stripe/catalogue/idempotency-classification.js";
import { StripeCatalogueTransport } from "../../../provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import type {
  StripeCensusOperationView,
  StripeDispatchResponse,
  StripeDispatchTransport,
  StripeOperationCensusPort,
  StripeOperationSchemaValidator,
} from "../../src/host/payswap/stripe/action-seams.js";
import type { StripeActionParameter } from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import type { StripePreparedActionExecutor } from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import { createStripePreparedActionExecutor } from "../../src/host/payswap/stripe/prepared-action-executor.js";
import { createInMemoryStripePreparedActionStore } from "../../src/host/payswap/stripe/prepared-action-store.js";
import { StripeRakPermissionBinding } from "../../src/host/payswap/connections/stripe-rak-permissions.js";
import {
  pinnedCatalogueReleaseIdentity,
  pinnedCatalogueRequestApiVersion,
} from "../../src/host/payswap/connections/stripe-api-version-state.js";
import {
  FAKE_RAK_TEST_KEY,
  accountContextResolverOver,
  executorWorld,
  fakeFs,
} from "./stripe-action-fixtures.js";

export const REAL_WIRING_CONNECTION_ID = "conn:fake-stripe-1" as const;

/**
 * Narrow the REAL census method union onto the host seam's vocabulary.
 * The pinned census carries ZERO PUT/PATCH operations today; if a future
 * pin introduces one, this fails LOUDLY at the composition edge instead
 * of silently dropping the operation (the seam must be extended first).
 */
export function narrowCensusMethod(method: string): "GET" | "POST" | "DELETE" {
  if (method === "GET" || method === "POST" || method === "DELETE") {
    return method;
  }
  throw new Error(
    `the host census seam does not carry method '${method}' — extend StripeCensusOperationView before adopting a pin that uses it`,
  );
}

/**
 * THE CENSUS ADAPTER (the P24-D composition recipe over the REAL
 * census + the REAL read-back registry + the REAL idempotency
 * classification — every field comes from Worker 1's artifacts).
 */
export function realCensusPort(): StripeOperationCensusPort {
  const views: StripeCensusOperationView[] = STRIPE_OPERATION_CENSUS.map((record) => ({
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
  }));
  const byId = new Map(views.map((view) => [view.operationId, view]));
  return {
    catalogueRelease: pinnedCatalogueReleaseIdentity(),
    resolve: (operationId) => byId.get(operationId),
    dispatchAllowed: (operationId) => stripeCensusDispatchAllowed(operationId),
    enumerate: () => Object.freeze([...views]),
  };
}

/**
 * THE SCHEMA-VALIDATOR ADAPTER (the P24-D recipe): the REAL strict
 * validator behind the host port. The normalized output is rebuilt
 * from the validator's location split — the digest binds the REAL
 * normalized form, never the raw proposal text.
 */
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

/** One scripted fetch answer (the fake tier — deterministic, no network). */
export interface FetchAnswer {
  readonly status: number;
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** One captured fetch call (the wire evidence the batteries assert). */
export interface CapturedFetch {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
}

/**
 * THE TRANSPORT ADAPTER (the P24-D recipe): the REAL
 * StripeCatalogueTransport behind the host port, over an injected
 * scripted fetch. The REAL result kinds map one-to-one onto the host
 * dispatch-response seam (OK/ERROR_STATUS/UNKNOWN/REFUSED).
 */
export function realDispatchTransport(
  answer: FetchAnswer | "REJECT" | "TIMEOUT",
): { readonly transport: StripeDispatchTransport; readonly calls: CapturedFetch[] } {
  const calls: CapturedFetch[] = [];
  const fetchImpl = async (
    url: string,
    init: {
      readonly method: "GET" | "POST" | "DELETE";
      readonly headers: Readonly<Record<string, string>>;
      readonly body?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<{ readonly status: number; readonly headers?: Readonly<Record<string, string>>; text(): Promise<string> }> => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (answer === "REJECT") {
      throw new Error("connection lost (scripted)");
    }
    if (answer === "TIMEOUT") {
      // AbortSignal.timeout: an AbortError-shaped rejection.
      const error = new Error("the operation was aborted");
      (error as { name?: string }).name = "AbortError";
      throw error;
    }
    return { status: answer.status, headers: answer.headers, text: async () => answer.body };
  };
  const real = new StripeCatalogueTransport({ fetchImpl });
  return {
    calls,
    transport: {
      transportId: `real:${real.transportId}`,
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
    },
  };
}

/** Compose the executor over the REAL census + REAL validator + REAL transport. */
let wiredIdSeq = 0;

/**
 * THE FULL WIRING: the executor over all three REAL adapters + the
 * REAL host planes (the RAK binding over the real census with the
 * REAL overlay permission-rule strings, the per-connection API-version
 * state, the verified-evidence account context, the seal).
 *
 * The P26-C wire-proof option: `migrateRequestApiVersion: true` runs
 * the PUBLIC migration verb (legacy pin → catalogue pin) on the wired
 * connection BEFORE the flow, so a battery can prove the endive header
 * on the wire for a migrated connection while the default fixture
 * (option absent) keeps proving the legacy basil pin.
 */
export async function realWiredExecutor(
  answer: FetchAnswer | "REJECT" | "TIMEOUT",
  options?: { readonly migrateRequestApiVersion?: boolean },
): Promise<{
  readonly executor: StripePreparedActionExecutor;
  readonly store: ReturnType<typeof createInMemoryStripePreparedActionStore>;
  readonly calls: CapturedFetch[];
}> {
  const CONN = REAL_WIRING_CONNECTION_ID;
  const world = await executorWorld({
    materialByConnection: new Map<string, unknown>([[CONN, { apiKey: FAKE_RAK_TEST_KEY }]]),
  });
  if (options?.migrateRequestApiVersion === true) {
    const migration = await world.apiVersion.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: pinnedCatalogueRequestApiVersion(),
    });
    if (!migration.ok) {
      throw new Error(`fixture migration failed: ${migration.refusal.kind}`);
    }
  }
  // The permission binding over the REAL census (the declared scopes are
  // the REAL overlay rule strings — 'customers: Read'/'customers: Write').
  const permissions = new StripeRakPermissionBinding({
    census: realCensusPort(),
    fileSystem: fakeFs(),
    directory: "/tmp/p242-real-wiring-rak",
    nowIso: () => world.clock.iso,
  });
  const declared = await permissions.declareScopes({
    connectionId: CONN,
    permissions: ["customers: Write", "customers: Read"],
    principalId: "principal:user-1",
  });
  if (!declared.ok) {
    throw new Error(`fixture declaration failed: ${declared.refusal.kind}`);
  }
  const { transport, calls } = realDispatchTransport(answer);
  const store = createInMemoryStripePreparedActionStore();
  const executor: StripePreparedActionExecutor = createStripePreparedActionExecutor({
    census: realCensusPort(),
    schemaValidator: realSchemaValidator(),
    transport,
    seal: {
      withSealedCredential: async <T,>(
        connectionId: string,
        consumer: (material: unknown) => T,
        _context: string,
      ): Promise<Awaited<T>> =>
        consumer(new Map<string, unknown>([[CONN, { apiKey: FAKE_RAK_TEST_KEY }]]).get(connectionId)) as Awaited<T>,
    },
    accountContext: accountContextResolverOver(),
    permissions,
    apiVersion: world.apiVersion,
    nowMs: () => world.clock.ms,
    nowIso: () => world.clock.iso,
    createId: () => `real-wired-${(wiredIdSeq += 1)}`,
    store,
  });
  return { executor, store, calls };
}
