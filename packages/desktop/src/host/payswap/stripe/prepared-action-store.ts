/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the PREPARED-ACTION STORE:
 * the durable, append-only-lawed persistence for prepared actions,
 * single-use authorizations and dispatch audit records (the
 * record-store/probe-evidence precedents: injected fs seam, versioned
 * JSON snapshot, fail-closed per-record quarantine, write-then-ack).
 *
 * LAWS:
 * - PERSISTED: a prepared action survives restart; on resume a pending
 *   action WITHOUT a valid (unconsummed, unexpired) authorization is
 *   never executed (D10/D11 — the executor re-checks everything).
 * - SINGLE-USE: an authorization's consumption is a durable write that
 *   happens BEFORE dispatch — a crash between consume and dispatch
 *   leaves the outcome UNKNOWN (reconciled by read-back), never a
 *   replayable authorization.
 * - APPEND-ONLY AUDIT: audit records are only ever appended; the store
 *   exposes no mutation or deletion of audit entries.
 * - SECRET-FREE: every record is secret-scanned at write (a leak
 *   THROWS — the credential-broker escape-scan posture).
 * - FAIL-CLOSED PARSE: a malformed record is quarantined (dropped),
 *   never crashes the plane; an unknown snapshot version starts empty.
 */

import type {
  StripeActionAuthorization,
  StripeActionAuditRecord,
  StripePreparedAction,
} from "./prepared-action-contracts.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";

/** The injected fs seam (the workspace-store shape). */
export interface StripeActionStoreFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The parsed-parameter shape (re-validated per record — never trusted). */
interface ParameterShape {
  readonly name: string;
  readonly value: unknown;
  readonly location: "path" | "query" | "body";
}

function parseParameters(candidate: unknown): readonly ParameterShape[] | null {
  if (!Array.isArray(candidate)) {
    return null;
  }
  const parameters: ParameterShape[] = [];
  for (const entry of candidate) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Partial<ParameterShape>;
    if (
      typeof record.name !== "string" ||
      record.name.length === 0 ||
      (record.location !== "path" && record.location !== "query" && record.location !== "body")
    ) {
      return null;
    }
    parameters.push({ name: record.name, value: record.value, location: record.location });
  }
  return Object.freeze(parameters);
}

function parseAccountContext(candidate: unknown): StripePreparedAction["accountContext"] | null {
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<StripePreparedAction["accountContext"]>;
  if (
    typeof record.connectionId !== "string" ||
    typeof record.stripeAccountId !== "string" ||
    record.stripeAccountId.length === 0 ||
    typeof record.accountModel !== "string" ||
    (record.environment !== "SANDBOX" && record.environment !== "LIVE")
  ) {
    return null;
  }
  return {
    connectionId: record.connectionId,
    stripeAccountId: record.stripeAccountId,
    accountModel: record.accountModel as StripePreparedAction["accountContext"]["accountModel"],
    environment: record.environment,
  };
}

/** Fail-closed parse of one prepared action. */
export function parsePreparedAction(candidate: unknown): StripePreparedAction | null {
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<StripePreparedAction>;
  const parameters = parseParameters(record.parameters);
  const accountContext = parseAccountContext(record.accountContext);
  if (
    typeof record.preparedActionId !== "string" ||
    typeof record.operationId !== "string" ||
    typeof record.catalogueRelease !== "string" ||
    accountContext === null ||
    parameters === null ||
    typeof record.digest !== "string" ||
    typeof record.effectClass !== "string" ||
    typeof record.approvalTier !== "string" ||
    !Array.isArray(record.confirmationInputs) ||
    typeof record.idempotencyKeyRef !== "string" ||
    typeof record.expiresAt !== "string" ||
    (record.createdBy !== "model_proposal" && record.createdBy !== "user_direct")
  ) {
    return null;
  }
  return Object.freeze({
    preparedActionId: record.preparedActionId,
    operationId: record.operationId,
    catalogueRelease: record.catalogueRelease,
    accountContext,
    parameters,
    digest: record.digest,
    effectClass: record.effectClass as StripePreparedAction["effectClass"],
    approvalTier: record.approvalTier as StripePreparedAction["approvalTier"],
    confirmationInputs: Object.freeze([...record.confirmationInputs]) as readonly string[],
    idempotencyKeyRef: record.idempotencyKeyRef,
    readBackOperationId:
      typeof record.readBackOperationId === "string" ? record.readBackOperationId : null,
    expiresAt: record.expiresAt,
    createdBy: record.createdBy,
  });
}

/** Fail-closed parse of one authorization. */
export function parseAuthorization(candidate: unknown): StripeActionAuthorization | null {
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<StripeActionAuthorization>;
  const accountContext = parseAccountContext(record.accountContext);
  if (
    typeof record.authorizationId !== "string" ||
    typeof record.preparedActionId !== "string" ||
    typeof record.approvedDigest !== "string" ||
    typeof record.approvedByPrincipalId !== "string" ||
    accountContext === null ||
    (record.consumedAt !== null && typeof record.consumedAt !== "string" && record.consumedAt !== undefined) ||
    typeof record.expiresAt !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    authorizationId: record.authorizationId,
    preparedActionId: record.preparedActionId,
    approvedDigest: record.approvedDigest,
    approvedByPrincipalId: record.approvedByPrincipalId,
    accountContext,
    consumedAt: typeof record.consumedAt === "string" ? record.consumedAt : null,
    expiresAt: record.expiresAt,
  });
}

/** The durable store surface the executor composes over. */
export interface StripePreparedActionStore {
  putAction(action: StripePreparedAction): Promise<void>;
  getAction(preparedActionId: string): Promise<StripePreparedAction | null>;
  putAuthorization(authorization: StripeActionAuthorization): Promise<void>;
  getAuthorization(authorizationId: string): Promise<StripeActionAuthorization | null>;
  /** Every authorization minted for one prepared action (the single-live check). */
  authorizationsForAction(preparedActionId: string): Promise<readonly StripeActionAuthorization[]>;
  /** The single-use consumption write (durable BEFORE dispatch). */
  consumeAuthorization(authorizationId: string, consumedAt: string): Promise<boolean>;
  /** APPEND-ONLY: an audit record is never mutated or deleted. */
  appendAuditRecord(record: StripeActionAuditRecord): Promise<void>;
  auditRecords(): Promise<readonly StripeActionAuditRecord[]>;
}

interface StoreSnapshot {
  readonly version: 1;
  readonly actions: readonly unknown[];
  readonly authorizations: readonly unknown[];
  readonly audit: readonly unknown[];
}

const SNAPSHOT_FILE = "stripe-prepared-actions.json";

/** Parse one audit record fail-closed. */
function parseAuditRecord(candidate: unknown): StripeActionAuditRecord | null {
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<StripeActionAuditRecord>;
  const accountContext = parseAccountContext(record.accountContext);
  if (
    typeof record.preparedActionId !== "string" ||
    typeof record.operationId !== "string" ||
    accountContext === null ||
    record.outcome === null ||
    typeof record.outcome !== "object" ||
    typeof record.outcome.kind !== "string" ||
    !Array.isArray(record.providerRequestIds) ||
    typeof record.at !== "string"
  ) {
    return null;
  }
  return {
    preparedActionId: record.preparedActionId,
    authorizationId: typeof record.authorizationId === "string" ? record.authorizationId : null,
    operationId: record.operationId,
    accountContext,
    outcome: record.outcome as StripeActionAuditRecord["outcome"],
    providerRequestIds: Object.freeze([...record.providerRequestIds]),
    at: record.at,
  };
}

/**
 * Open the durable prepared-action store over the injected file system
 * (the node composition edge binds fs; tests inject fakes). The
 * snapshot lands beside the connections records in the payswap
 * workspace directory.
 */
export async function openStripePreparedActionStore(input: {
  readonly fileSystem: StripeActionStoreFileSystem;
  readonly directory: string;
}): Promise<StripePreparedActionStore> {
  const path = `${input.directory.replace(/\/+$/, "")}/${SNAPSHOT_FILE}`;
  const actions = new Map<string, StripePreparedAction>();
  const authorizations = new Map<string, StripeActionAuthorization>();
  const audit: StripeActionAuditRecord[] = [];
  try {
    const raw = await input.fileSystem.readFile(path);
    const parsed = JSON.parse(raw) as Partial<StoreSnapshot>;
    if (parsed !== null && typeof parsed === "object" && parsed.version === 1) {
      for (const candidate of parsed.actions ?? []) {
        const action = parsePreparedAction(candidate);
        if (action !== null) {
          actions.set(action.preparedActionId, action);
        }
      }
      for (const candidate of parsed.authorizations ?? []) {
        const authorization = parseAuthorization(candidate);
        if (authorization !== null) {
          authorizations.set(authorization.authorizationId, authorization);
        }
      }
      for (const candidate of parsed.audit ?? []) {
        const record = parseAuditRecord(candidate);
        if (record !== null) {
          audit.push(record);
        }
      }
    }
  } catch {
    // Absent, corrupt or future-versioned: start empty honestly (the
    // per-record quarantine posture; never a crash, never a "repair").
  }

  const persist = async (): Promise<void> => {
    // The secret scan gates EVERY write (a leak THROWS — fail-closed).
    assertNoStripeSecretShapes(
      { actions: [...actions.values()], authorizations: [...authorizations.values()], audit },
      "the prepared-action store snapshot",
    );
    const snapshot: StoreSnapshot = {
      version: 1,
      actions: [...actions.values()],
      authorizations: [...authorizations.values()],
      audit: [...audit],
    };
    await input.fileSystem.mkdir(input.directory);
    await input.fileSystem.writeFile(path, JSON.stringify(snapshot, null, 2));
  };

  return {
    async putAction(action) {
      assertNoStripeSecretShapes(action, `prepared action ${action.preparedActionId}`);
      actions.set(action.preparedActionId, action);
      await persist();
    },
    async getAction(preparedActionId) {
      return actions.get(preparedActionId) ?? null;
    },
    async putAuthorization(authorization) {
      assertNoStripeSecretShapes(authorization, `authorization ${authorization.authorizationId}`);
      authorizations.set(authorization.authorizationId, authorization);
      await persist();
    },
    async getAuthorization(authorizationId) {
      return authorizations.get(authorizationId) ?? null;
    },
    async authorizationsForAction(preparedActionId) {
      return Object.freeze(
        [...authorizations.values()].filter(
          (authorization) => authorization.preparedActionId === preparedActionId,
        ),
      );
    },
    async consumeAuthorization(authorizationId, consumedAt) {
      const existing = authorizations.get(authorizationId);
      if (existing === undefined || existing.consumedAt !== null) {
        return false;
      }
      authorizations.set(authorizationId, { ...existing, consumedAt });
      await persist();
      return true;
    },
    async appendAuditRecord(record) {
      assertNoStripeSecretShapes(record, `audit record for ${record.preparedActionId}`);
      audit.push(record);
      await persist();
    },
    async auditRecords() {
      return Object.freeze([...audit]);
    },
  };
}

/** An in-memory store for deterministic tests and composition bootstrapping. */
export function createInMemoryStripePreparedActionStore(): StripePreparedActionStore {
  const actions = new Map<string, StripePreparedAction>();
  const authorizations = new Map<string, StripeActionAuthorization>();
  const audit: StripeActionAuditRecord[] = [];
  return {
    async putAction(action) {
      assertNoStripeSecretShapes(action, `prepared action ${action.preparedActionId}`);
      actions.set(action.preparedActionId, action);
    },
    async getAction(preparedActionId) {
      return actions.get(preparedActionId) ?? null;
    },
    async putAuthorization(authorization) {
      assertNoStripeSecretShapes(authorization, `authorization ${authorization.authorizationId}`);
      authorizations.set(authorization.authorizationId, authorization);
    },
    async getAuthorization(authorizationId) {
      return authorizations.get(authorizationId) ?? null;
    },
    async authorizationsForAction(preparedActionId) {
      return Object.freeze(
        [...authorizations.values()].filter(
          (authorization) => authorization.preparedActionId === preparedActionId,
        ),
      );
    },
    async consumeAuthorization(authorizationId, consumedAt) {
      const existing = authorizations.get(authorizationId);
      if (existing === undefined || existing.consumedAt !== null) {
        return false;
      }
      authorizations.set(authorizationId, { ...existing, consumedAt });
      return true;
    },
    async appendAuditRecord(record) {
      assertNoStripeSecretShapes(record, `audit record for ${record.preparedActionId}`);
      audit.push(record);
    },
    async auditRecords() {
      return Object.freeze([...audit]);
    },
  };
}
