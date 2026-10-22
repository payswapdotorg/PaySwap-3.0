/**
 * PaySwap Desktop (P13-B) — the CONNECTION SESSION AUTHORITY (ADR-0007
 * D5): the host-process authority for provider connections — the ONLY
 * writer of connection lifecycle states, the ONLY minter of D3 state
 * bindings, the composition point for the D4 durable broker. The
 * renderer reaches it ONLY through the typed seam verbs; the composer
 * only through task verbs. LAWS: NEVER-ACTIVE (only an evidence-carrying
 * CONFIRMED probe outcome reaches ACTIVE) · lawful transitions only ·
 * append-only history · single-use 10-minute monotonic state bindings ·
 * evidence strings escape-scanned (a leak THROWS).
 */

import { randomUUID } from "node:crypto";
import type { WorkspaceStoreFileSystem } from "../product/workspace-store-persistence.js";
import {
  DurableConnectionCredentialBroker,
  DurableCredentialBrokerError,
} from "./credential-broker.js";
import {
  isPinnedLawfulConnectionTransition,
  type PinnedConnectionLifecycleState,
} from "./provider-pins.js";
import {
  ConnectionRecordFileStore,
  appendConnectionTransition,
  desktopProviderRegistryViews,
  recordViewOf,
  seedRefusalReason,
  type PersistedConnectionRecord,
} from "./record-store.js";
import { VerificationRecorder } from "./verification-recorder.js";
import {
  EVIDENCE_REVOKED,
  EVIDENCE_RETURN_ERROR,
  EVIDENCE_SEEDED,
} from "./evidence-copy.js";
import { ProviderStateBindingRegistry } from "./provider-state-bindings.js";
import type {
  DesktopConnectionSetupOutcome,
  DesktopConnectionStatusView,
  DesktopCredentialSealReceipt,
  DesktopProviderCallbackView,
  DesktopProviderRegistryView,
} from "./contracts.js";

/** The authority's typed errors (fail-closed). */
export type ConnectionSessionErrorKind =
  | "UNKNOWN_PROVIDER"
  | "UNKNOWN_USE_CASE"
  | "FORM_UNCONFIGURED"
  | "UNKNOWN_CONNECTION"
  | "UNLAWFUL_TRANSITION"
  | "CREDENTIAL_REQUIRED"
  | "PROBE_REQUIRED"
  | "STORAGE_FAILED";

export class ConnectionSessionError extends Error {
  constructor(
    readonly kind: ConnectionSessionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ConnectionSessionError";
  }
}


/** Options for the authority (all injectable — deterministic tests). */
export interface ConnectionSessionAuthorityOptions {
  readonly fileSystem: WorkspaceStoreFileSystem;
  readonly directory: string;
  /** The durable broker over the substrate ICredentialService (required — the composition edge wires it). */
  readonly broker: DurableConnectionCredentialBroker;
  /** Injectable clock (epoch ms) — tests pin it. */
  readonly nowMs?: () => number;
  /** Injectable ISO clock for record stamps — tests pin it. */
  readonly nowIso?: () => string;
  /** Injectable UUID factory — tests pin it. */
  readonly createId?: () => string;
  /** Injectable crypto-random state factory — tests pin it. */
  readonly createState?: () => string;
}

/**
 * The connection session authority. Construct ONCE per host at the
 * composition edge; every mutation is synchronous-ordered against the
 * in-memory record then persisted atomically (write-then-ack).
 */
export class ConnectionSessionAuthority {
  readonly #options: ConnectionSessionAuthorityOptions;
  readonly #broker: DurableConnectionCredentialBroker;
  readonly #records = new Map<string, PersistedConnectionRecord>();
  #records_fileStore: ConnectionRecordFileStore | null = null;
  readonly #stateBindings: ProviderStateBindingRegistry;
  /** The verification recorder (the ONLY ACTIVE path — ADR-0007 D1). */
  readonly #verification: VerificationRecorder;
  #loaded = false;
  #loadPromise: Promise<void> | null = null;

  constructor(options: ConnectionSessionAuthorityOptions) {
    this.#options = options;
    this.#broker = options.broker;
    this.#stateBindings = new ProviderStateBindingRegistry({
      createState: () => this.#createState(),
      nowMs: () => this.#nowMs(),
    });
    this.#verification = new VerificationRecorder({
      broker: options.broker,
      getRecord: async (id) => {
        await this.#ensureLoaded();
        return this.#records.get(id) ?? null;
      },
      setRecord: async (record) => {
        this.#records.set(record.connectionId, record);
        await this.#persist();
      },
      transition: (record, to, cause, evidence) => this.#transition(record, to, cause, evidence),
      nowIso: () => this.#nowIso(),
    });
  }

  /** The U1 key-entry verb (sealed once; verification still required). */
  submitStripeRestrictedKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<DesktopCredentialSealReceipt> {
    return this.#verification.submitStripeRestrictedKey(input);
  }

  /** Record a verification-probe outcome (the ONLY ACTIVE path). */
  recordVerificationOutcome(input: {
    readonly connectionId: string;
    readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
    readonly evidenceSummary: string;
  }): Promise<DesktopConnectionStatusView> {
    return this.#verification.recordVerificationOutcome(input);
  }

  /** Run a consumer inside the credential seal (the probe path). */
  withSealedCredential<T>(
    connectionId: string,
    consumer: (material: unknown) => T,
    context: string,
  ): Promise<Awaited<T>> {
    return this.#verification.withSealedCredential(connectionId, consumer, context);
  }

  #nowMs(): number {
    return this.#options.nowMs?.() ?? Date.now();
  }

  #nowIso(): string {
    return this.#options.nowIso?.() ?? new Date().toISOString();
  }

  #createId(): string {
    return this.#options.createId?.() ?? randomUUID();
  }

  #createState(): string {
    return this.#options.createState?.() ?? randomUUID().replace(/-/g, "");
  }

  #recordStore(): ConnectionRecordFileStore {
    this.#records_fileStore ??= new ConnectionRecordFileStore(
      this.#options.fileSystem,
      this.#options.directory,
    );
    return this.#records_fileStore;
  }

  /** Load persisted records once (fail-closed quarantine per record). */
  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) {
      return;
    }
    this.#loadPromise ??= (async () => {
      for (const record of await this.#recordStore().readAll()) {
        this.#records.set(record.connectionId, record);
      }
      this.#loaded = true;
    })();
    await this.#loadPromise;
    this.#loadPromise = null;
    this.#loaded = true;
  }

  async #persist(): Promise<void> {
    await this.#recordStore().write([...this.#records.values()]);
  }

  /** The registry catalogue (typed data — never a connection). */
  registry(): readonly DesktopProviderRegistryView[] {
    return desktopProviderRegistryViews();
  }

  /** The connection statuses (evidence-backed records only). */
  async connectionStatuses(): Promise<readonly DesktopConnectionStatusView[]> {
    await this.#ensureLoaded();
    return [...this.#records.values()]
      .map(recordViewOf)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Seed a connection setup (create-or-resume): one resumable record per
   * (providerId, useCaseRef) while non-terminal — the convergence law at
   * the connection plane. UNCONFIGURED forms are REFUSED with the exact
   * missing operator configuration (never a dead button, never simulated).
   */
  async seedConnectionSetup(input: {
    readonly providerId: string;
    readonly useCaseRef: string;
  }): Promise<DesktopConnectionSetupOutcome> {
    await this.#ensureLoaded();
    const refusal = seedRefusalReason(input.providerId, input.useCaseRef);
    if (refusal !== null) {
      return { kind: "REFUSED", reason: refusal };
    }
    const existing = [...this.#records.values()].find(
      (record) =>
        record.providerId === input.providerId &&
        record.useCaseRef === input.useCaseRef &&
        record.state !== "DISCONNECTED" &&
        record.state !== "REVOKED" &&
        record.state !== "EXPIRED",
    );
    if (existing !== undefined) {
      return { kind: "RESUMED", connectionId: existing.connectionId, state: existing.state };
    }
    const connectionId = `conn:${this.#createId()}`;
    const now = this.#nowIso();
    const record: PersistedConnectionRecord = {
      connectionId,
      providerId: input.providerId,
      useCaseRef: input.useCaseRef,
      state: "PROPOSED",
      credentialHandleRef: null,
      executionMode: "SANDBOX",
      createdAt: now,
      lastTransitionAt: now,
      transitions: [
        {
          at: now,
          from: "PROPOSED",
          to: "PROPOSED",
          cause: "SETUP_SEEDED",
          evidence: EVIDENCE_SEEDED,
        },
      ],
    };
    this.#records.set(connectionId, record);
    await this.#persist();
    return { kind: "CREATED", connectionId, state: "PROPOSED" };
  }




  /** Mint a provider-return state binding (D3): single-use, 10 minutes. */
  async mintProviderStateBinding(input: {
    readonly connectionId: string;
    readonly form: string;
  }): Promise<{ readonly state: string; readonly expiresAtMs: number }> {
    await this.#ensureLoaded();
    const record = this.#records.get(input.connectionId);
    if (record === undefined) {
      throw new ConnectionSessionError("UNKNOWN_CONNECTION", `Unknown connection '${input.connectionId}'`);
    }
    return this.#stateBindings.mint({
      connectionId: input.connectionId,
      providerId: record.providerId,
      form: input.form,
    });
  }

  /** Validate + consume a provider callback return (D3 discipline). */
  async consumeProviderCallback(input: {
    readonly state: string;
    readonly error?: string;
  }): Promise<DesktopProviderCallbackView> {
    await this.#ensureLoaded();
    return this.#stateBindings.consume({
      state: input.state,
      ...(input.error !== undefined ? { error: input.error } : {}),
      resolveConnection: (connectionId) => {
        const record = this.#records.get(connectionId);
        return record === undefined ? null : { providerId: record.providerId };
      },
      onErrorRecorded: (connectionId, error) => {
        // User-denied / provider error: recorded on the connection; the
        // task returns to a resumable state — never silently retried.
        const record = this.#records.get(connectionId);
        if (record === undefined) {
          return;
        }
        const updated = this.#transition(
          record,
          "PROPOSED",
          "PROVIDER_RETURN_ERROR",
          EVIDENCE_RETURN_ERROR(error),
        );
        this.#records.set(connectionId, updated);
        void this.#persist();
      },
    });
  }

  /**
   * Revoke a connection (operator/principal act — deletes the secret).
   * The terminal target follows the PINNED lawful map: REVOKED is lawful
   * from ACTIVE/DEGRADED/SUSPENDED; every other non-terminal state
   * reaches DISCONNECTED (its lawful teardown). The credential is
   * deleted on every path — the law is the record's honesty, not the
   * terminal's name.
   */
  async revokeConnection(connectionId: string): Promise<DesktopConnectionStatusView> {
    await this.#ensureLoaded();
    const record = this.#records.get(connectionId);
    if (record === undefined) {
      throw new ConnectionSessionError("UNKNOWN_CONNECTION", `Unknown connection '${connectionId}'`);
    }
    if (record.credentialHandleRef !== null) {
      await this.#broker.delete(record.credentialHandleRef);
    }
    const target = isPinnedLawfulConnectionTransition(record.state, "REVOKED")
      ? ("REVOKED" as const)
      : ("DISCONNECTED" as const);
    const updated = this.#transition(
      record,
      target,
      "PRINCIPAL_REQUEST",
      EVIDENCE_REVOKED(target),
    );
    const next: PersistedConnectionRecord = { ...updated, credentialHandleRef: null };
    this.#records.set(connectionId, next);
    await this.#persist();
    return recordViewOf(next);
  }

  /** The lawful-transition gate (append-only history; delegated). */
  #transition(
    record: PersistedConnectionRecord,
    to: PinnedConnectionLifecycleState,
    cause: string,
    evidence: string,
  ): PersistedConnectionRecord {
    const gated = appendConnectionTransition(record, to, cause, evidence, this.#nowIso());
    if (!gated.ok) {
      throw new ConnectionSessionError("UNLAWFUL_TRANSITION", gated.reason);
    }
    return gated.record;
  }
}

export { DurableCredentialBrokerError };
