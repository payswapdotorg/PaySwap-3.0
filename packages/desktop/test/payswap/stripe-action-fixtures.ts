/**
 * PaySwap Desktop (P24-2) — the prepared-action/event-plane test
 * fixtures: the deterministic fake world for the executor battery
 * (census + schema validator + transport + seal + account context +
 * permission binding + api-version state).
 *
 * DETERMINISM LAWS:
 * - No network, no ambient clock, no ambient ids: everything injects.
 * - Fake key material is constructed by CONCATENATION so no literal
 *   credential-shaped string appears in test source (the
 *   connections-probe-plane-fixtures precedent — the secret scan
 *   covers nested serialized structures and key prefixes).
 * - The fake census is a controlled set of deterministic views; the
 *   REAL census (provider-runtime) is adapted inside the mirror
 *   battery's own file (tests MAY import @payswap/* — the host never
 *   does; the adapter there is the P24-D wiring recipe).
 */

import type {
  StripeActionAccountContextResolver,
  StripeDispatchCall,
  StripeDispatchResponse,
  StripeDispatchTransport,
  StripeOperationCensusPort,
  StripeOperationSchemaValidator,
  StripeCensusOperationView,
  StripeActionPermissionPort,
  StripeActionApiVersionPort,
  StripeReauthenticationPort,
  StripeActionSeal,
} from "../../src/host/payswap/stripe/action-seams.js";
import { createStripePreparedActionExecutor } from "../../src/host/payswap/stripe/prepared-action-executor.js";
import {
  createInMemoryStripePreparedActionStore,
  type StripePreparedActionStore,
} from "../../src/host/payswap/stripe/prepared-action-store.js";
import type { StripePreparedActionExecutor } from "../../src/host/payswap/stripe/prepared-action-contracts.js";
import { StripeRakPermissionBinding } from "../../src/host/payswap/connections/stripe-rak-permissions.js";
import { StripeApiVersionStateStore } from "../../src/host/payswap/connections/stripe-api-version-state.js";
import { createStripeAccountContextResolver } from "../../src/host/payswap/connections/stripe-account-context.js";
import type { PersistedConnectionRecord } from "../../src/host/payswap/connections/record-store.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";

/** Fake test-mode key material (concatenated — never a literal credential shape in source). */
export const FAKE_RAK_TEST_KEY = "rk" + "_test_FAKE51rakDoNotUse00001";
export const FAKE_FULL_TEST_KEY = "sk" + "_test_FAKE51fullDoNotUse002";
export const FAKE_RAK_LIVE_KEY = "rk" + "_live_FAKE51liveDoNotUse0003";
export const FAKE_PK_KEY = "pk" + "_test_FAKE51publishable0004";
export const FAKE_ORG_KEY = "sk" + "_org_FAKE51orgDoNotUse00005";
export const FAKE_WHSEC = "whsec" + "_FAKE51whsecDoNotUse0006";

/** The in-memory fs (the workspace-store shape). */
export function fakeFs() {
  const files = new Map<string, string>();
  return {
    files,
    readFile: async (path: string) => {
      const data = files.get(path);
      if (data === undefined) {
        throw new Error("ENOENT");
      }
      return data;
    },
    writeFile: async (path: string, data: string) => {
      files.set(path, data);
    },
    mkdir: async () => {},
  };
}

/** A deterministic census over explicit operation views. */
export function fakeCensus(
  operations: readonly Partial<StripeCensusOperationView>[],
  catalogueRelease = "stripe-openapi/v2596@2026-09-30.endive",
): StripeOperationCensusPort {
  const views: StripeCensusOperationView[] = operations.map((entry, index) => {
    const apiNamespace = entry.apiNamespace ?? "v1";
    const method = entry.method ?? "POST";
    const effectClass = entry.effectClass ?? "STRIPE_CONFIGURATION_WRITE";
    return {
      operationId: entry.operationId ?? `FakeOp${index + 1}`,
      apiNamespace,
      method,
      path: entry.path ?? "/v1/fake",
      pathParams: entry.pathParams ?? [],
      effectClass,
      approvalTier: entry.approvalTier ?? "CONFIRM",
      supportState: entry.supportState ?? "IMPLEMENTED",
      requiredPermissionRule: entry.requiredPermissionRule ?? "customers: Write",
      readBackOperationId: entry.readBackOperationId ?? null,
      // The P24-1 classification rule, mirrored: v1 state-changing POSTs only.
      idempotencyKeyAllowed:
        entry.idempotencyKeyAllowed ??
        (apiNamespace === "v1" && method === "POST" && effectClass !== "READ_ONLY"),
      summary: entry.summary ?? "a fake catalogue operation",
    };
  });
  const byId = new Map(views.map((view) => [view.operationId, view]));
  return {
    catalogueRelease,
    resolve: (operationId) => byId.get(operationId),
    dispatchAllowed: (operationId) => {
      const view = byId.get(operationId);
      return (
        view !== undefined &&
        (view.supportState === "IMPLEMENTED" || view.supportState === "IMPLEMENTED_WITH_LIMITS")
      );
    },
    enumerate: () => Object.freeze([...views]),
  };
}

/** A pass-through schema validator with an optional known-name rule. */
export function fakeSchemaValidator(options?: {
  readonly knownParameterNames?: readonly string[];
}): StripeOperationSchemaValidator {
  return {
    validate: async (_operationId, parameters) => {
      const known = options?.knownParameterNames;
      if (known !== undefined) {
        for (const parameter of parameters) {
          if (!known.includes(parameter.name)) {
            return {
              ok: false,
              refusal: { kind: "UNKNOWN_PARAMETER", name: parameter.name },
            };
          }
        }
      }
      return { ok: true, normalized: Object.freeze([...parameters]) };
    },
  };
}

/** A scripted dispatch transport (records every call). */
export function scriptedTransport(script: readonly StripeDispatchResponse[]) {
  const calls: StripeDispatchCall[] = [];
  let index = 0;
  const transport: StripeDispatchTransport = {
    transportId: "scripted-dispatch-seam",
    send: async (call) => {
      calls.push(call);
      const response = script[index];
      index = Math.min(index + 1, Math.max(script.length - 1, 0));
      return response ?? { delivered: true, status: 500, body: null };
    },
  };
  return { transport, calls };
}

/** A throwing transport (the crash-after-consumption law). */
export function throwingTransport(error: Error): StripeDispatchTransport {
  return {
    transportId: "throwing-dispatch-seam",
    send: async () => {
      throw error;
    },
  };
}

/** A fake seal: one material per connection (the broker shape; the escape scan is covered by the broker battery). */
export function fakeSeal(materialByConnection: ReadonlyMap<string, unknown>): StripeActionSeal {
  return {
    withSealedCredential: async <T,>(
      connectionId: string,
      consumer: (material: unknown) => T,
      _context: string,
    ): Promise<Awaited<T>> => consumer(materialByConnection.get(connectionId)) as Awaited<T>,
  };
}

/** A persisted-connection record fixture (the record-store shape). */
export function connectionRecordOf(input?: {
  readonly connectionId?: string;
  readonly providerId?: string;
  readonly useCaseRef?: string;
  readonly state?: PersistedConnectionRecord["state"];
  readonly executionMode?: "SANDBOX" | "LIVE";
}): PersistedConnectionRecord {
  return {
    connectionId: input?.connectionId ?? "conn:fake-stripe-1",
    providerId: input?.providerId ?? "stripe",
    useCaseRef: input?.useCaseRef ?? "own-store-test-mode",
    state: input?.state ?? "ACTIVE",
    credentialHandleRef: "payswap-cred:conn:fake-stripe-1",
    executionMode: input?.executionMode ?? "SANDBOX",
    createdAt: "2026-10-31T10:00:00Z",
    lastTransitionAt: "2026-10-31T10:00:00Z",
    transitions: [],
  };
}

/** A probe-evidence record fixture (the ledger shape). */
export function probeEvidenceOf(input?: {
  readonly connectionId?: string;
  readonly outcome?: "CONFIRMED" | "UNKNOWN" | "FAILED";
  readonly accountRef?: string | null;
  readonly providerLiveMode?: boolean | null;
  readonly observedAt?: string;
}): ProbeEvidenceRecord {
  return {
    connectionId: input?.connectionId ?? "conn:fake-stripe-1",
    providerId: "stripe",
    probedOperation: "stripe.balance.read + stripe.account.read",
    outcome: input?.outcome ?? "CONFIRMED",
    providerReferences: ["acct_fake51stripeTestAcct1", "balance"],
    accountRef: input?.accountRef === undefined ? "acct_fake51stripeTestAcct1" : input.accountRef,
    providerLiveMode: input?.providerLiveMode === undefined ? false : input.providerLiveMode,
    keyClass: "RESTRICTED_TEST",
    balanceCurrencies: ["USD"],
    transportId: "stripe-https-transport",
    executionMode: "SANDBOX",
    observedAt: input?.observedAt ?? "2026-10-31T10:05:00Z",
    evidenceTier: "PROVIDER_OBSERVATION",
    observationVersion: 1,
  };
}

/** The account-context fixture resolver over in-memory records + evidence. */
export function accountContextResolverOver(input?: {
  readonly records?: readonly PersistedConnectionRecord[];
  readonly evidence?: readonly ProbeEvidenceRecord[];
  readonly credentialSealedAt?: (connectionId: string) => string | null;
}): StripeActionAccountContextResolver {
  const records = new Map(
    (input?.records ?? [connectionRecordOf()]).map((record) => [record.connectionId, record]),
  );
  const evidence = new Map(
    (input?.evidence ?? [probeEvidenceOf()]).map((entry) => [entry.connectionId, entry]),
  );
  return createStripeAccountContextResolver({
    getConnection: async (connectionId) => records.get(connectionId) ?? null,
    getLatestProbeEvidence: async (connectionId) => evidence.get(connectionId) ?? null,
    getCredentialSealedAt: async (connectionId) => input?.credentialSealedAt?.(connectionId) ?? null,
  });
}

/** The deterministic world for an executor battery run. */
export async function executorWorld(input?: {
  readonly operations?: readonly Partial<StripeCensusOperationView>[];
  readonly declaredPermissions?: readonly string[];
  readonly materialByConnection?: ReadonlyMap<string, unknown>;
  readonly connectionId?: string;
  readonly accountContext?: StripeActionAccountContextResolver;
}) {
  const connectionId = input?.connectionId ?? "conn:fake-stripe-1";
  const fs = fakeFs();
  const clock = { ms: 1_000_000_000, iso: "2026-11-01T12:00:00Z" };
  let idSeq = 0;
  const census = fakeCensus(
    input?.operations ?? [
      {
        operationId: "PostCustomers",
        effectClass: "STRIPE_CONFIGURATION_WRITE",
        approvalTier: "CONFIRM",
        requiredPermissionRule: "customers: Write",
        readBackOperationId: "GetCustomersCustomer",
        path: "/v1/customers",
        method: "POST",
      },
    ],
  );
  const permissions = new StripeRakPermissionBinding({
    census,
    fileSystem: fs,
    directory: "/tmp/p242-rak",
    nowIso: () => clock.iso,
  });
  await permissions.declareScopes({
    connectionId,
    permissions: input?.declaredPermissions ?? ["customers: Write", "customers: Read"],
    principalId: "principal:user-1",
  });
  const apiVersion = new StripeApiVersionStateStore({
    fileSystem: fs,
    directory: "/tmp/p242-versions",
    nowIso: () => clock.iso,
  });
  const accountContext = input?.accountContext ?? accountContextResolverOver();
  return {
    connectionId,
    clock,
    census,
    permissions,
    apiVersion,
    advanceMs: (delta: number) => {
      clock.ms += delta;
      clock.iso = new Date(clock.ms).toISOString();
    },
    createExecutor: (overrides?: {
      readonly store?: StripePreparedActionStore;
      readonly transport?: StripeDispatchTransport;
      readonly accountContext?: StripeActionAccountContextResolver;
      readonly census?: StripeOperationCensusPort;
      readonly permissions?: StripeActionPermissionPort;
      readonly apiVersion?: StripeActionApiVersionPort;
      readonly reauthentication?: StripeReauthenticationPort;
    }): StripePreparedActionExecutor & { readonly store: StripePreparedActionStore } => {
      const store = overrides?.store ?? createInMemoryStripePreparedActionStore();
      const { transport } = scriptedTransport([
        { delivered: true, status: 200, body: { id: "cus_fake51created" }, providerRequestId: "req_fake51stripe01" },
      ]);
      const executor = createStripePreparedActionExecutor({
        census: overrides?.census ?? census,
        schemaValidator: fakeSchemaValidator(),
        transport: overrides?.transport ?? transport,
        seal: fakeSeal(
          input?.materialByConnection ?? new Map([[connectionId, { apiKey: FAKE_RAK_TEST_KEY }]]),
        ),
        accountContext: overrides?.accountContext ?? accountContext,
        permissions: overrides?.permissions ?? permissions,
        apiVersion: overrides?.apiVersion ?? apiVersion,
        reauthentication: overrides?.reauthentication,
        nowMs: () => clock.ms,
        nowIso: () => clock.iso,
        createId: () => `fake-${(idSeq += 1)}`,
        store,
      });
      return Object.assign(executor, { store });
    },
  };
}
