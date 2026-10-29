/**
 * PaySwap Desktop (P13-B) — the connection RECORD STORE helpers, split
 * from ./session-authority.ts for the ≤400-line file law: the persisted
 * record shape, the fail-closed per-record parser, the registry-form
 * lookup and the renderer views (registry catalogue + connection
 * statuses).
 */

import {
  PINNED_PAYMENT_PROVIDER_REGISTRY,
  PINNED_TERMINAL_CONNECTION_STATES,
  isPinnedConnectionLifecycleState,
  isPinnedLawfulConnectionTransition,
  type PinnedConnectionLifecycleState,
  type PinnedProviderFormEntry,
} from "./provider-pins.js";
import {
  PINNED_ONCHAIN_RAIL_CONNECTION_FORMS,
  type PinnedOnchainRailConnectionForm,
} from "./onchain-rail-pins.js";
import type {
  DesktopConnectionStatusView,
  DesktopConnectionTransitionView,
  DesktopProviderFormView,
  DesktopProviderRegistryView,
} from "./contracts.js";

/** The persisted connection record (the durable truth). */
export interface PersistedConnectionRecord {
  readonly connectionId: string;
  readonly providerId: string;
  readonly useCaseRef: string;
  readonly state: PinnedConnectionLifecycleState;
  readonly credentialHandleRef: string | null;
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly createdAt: string;
  readonly lastTransitionAt: string;
  readonly transitions: readonly DesktopConnectionTransitionView[];
}

/** Find a declared registry form (providerId + useCaseRef — never guessed). */
export function findRegistryForm(
  providerId: string,
  useCaseRef: string,
): PinnedProviderFormEntry | PinnedOnchainRailConnectionForm | null {
  for (const entry of PINNED_PAYMENT_PROVIDER_REGISTRY) {
    if (entry.providerId !== providerId) {
      continue;
    }
    for (const form of entry.forms) {
      if (form.useCaseRef === useCaseRef) {
        return form;
      }
    }
  }
  // (P22-H, ADR-0016 D2/D9) The ONCHAIN RAIL forms: the Stellar
  // testnet keypair wallet rides the PROVIDERLESS_RAIL form — its own
  // fail-closed catalogue, NEVER the PSP registry (ADR-0008 D5's
  // separation preserved; the rail connection is not a payment
  // provider and never joins the renderer's PSP catalogue).
  for (const form of PINNED_ONCHAIN_RAIL_CONNECTION_FORMS) {
    if (form.providerId === providerId && form.useCaseRef === useCaseRef) {
      return form;
    }
  }
  return null;
}

/** The registry catalogue as the renderer consumes it. */
export function desktopProviderRegistryViews(): readonly DesktopProviderRegistryView[] {
  return PINNED_PAYMENT_PROVIDER_REGISTRY.map((entry) => ({
    providerId: entry.providerId,
    displayName: entry.displayName,
    summary: entry.summary,
    forms: entry.forms.map(formViewOf),
  }));
}

function formViewOf(form: PinnedProviderFormEntry): DesktopProviderFormView {
  return {
    useCaseRef: form.useCaseRef,
    form: form.form,
    status: form.status,
    missingOperatorConfiguration: form.missingOperatorConfiguration,
    authMechanism: form.authMechanism,
    credentialKind: form.credentialKind,
    executionModes: form.executionModes,
    summary: form.summary,
  };
}

/** Project a persisted record into the renderer view (no material — INV-19). */
export function recordViewOf(record: PersistedConnectionRecord): DesktopConnectionStatusView {
  return {
    connectionId: record.connectionId,
    providerId: record.providerId,
    useCaseRef: record.useCaseRef,
    form: findRegistryForm(record.providerId, record.useCaseRef)?.form ?? ("PROVIDERLESS_RAIL" as const),
    credentialKind:
      findRegistryForm(record.providerId, record.useCaseRef)?.credentialKind ??
      ("PROVIDER_DEFINED" as const),
    executionMode: record.executionMode,
    state: record.state,
    credentialHandleRef: record.credentialHandleRef ?? "",
    createdAt: record.createdAt,
    lastTransitionAt: record.lastTransitionAt,
    transitionHistory: record.transitions,
  };
}

/** Fail-closed per-record parsing (malformed records are quarantined). */
export function parsePersistedRecord(candidate: unknown): PersistedConnectionRecord | null {
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<PersistedConnectionRecord>;
  if (
    typeof record.connectionId !== "string" ||
    typeof record.providerId !== "string" ||
    typeof record.useCaseRef !== "string" ||
    !isPinnedConnectionLifecycleState(record.state) ||
    typeof record.createdAt !== "string" ||
    typeof record.lastTransitionAt !== "string" ||
    !Array.isArray(record.transitions)
  ) {
    return null;
  }
  return {
    connectionId: record.connectionId,
    providerId: record.providerId,
    useCaseRef: record.useCaseRef,
    state: record.state,
    credentialHandleRef:
      typeof record.credentialHandleRef === "string" ? record.credentialHandleRef : null,
    executionMode: record.executionMode === "LIVE" ? "LIVE" : "SANDBOX",
    createdAt: record.createdAt,
    lastTransitionAt: record.lastTransitionAt,
    transitions: record.transitions.filter(
      (entry): entry is DesktopConnectionTransitionView =>
        entry !== null &&
        typeof entry === "object" &&
        isPinnedConnectionLifecycleState(entry.from) &&
        isPinnedConnectionLifecycleState(entry.to),
    ),
  };
}

/** The typed gate result: a new record, or the refusal reason. */
export type TransitionGateResult =
  | { readonly ok: true; readonly record: PersistedConnectionRecord }
  | { readonly ok: false; readonly reason: string };

/**
 * The lawful-transition gate (append-only history). A SAME-STATE evidence
 * append on a LIVE record is not a transition (the history grows, the
 * state does not change); TERMINAL records are CLOSED — no further
 * appends. Real transitions must be lawful per the pinned map.
 */
export function appendConnectionTransition(
  record: PersistedConnectionRecord,
  to: PinnedConnectionLifecycleState,
  cause: string,
  evidence: string,
  now: string,
): TransitionGateResult {
  if (!isPinnedConnectionLifecycleState(to)) {
    return { ok: false, reason: `Unknown target state '${String(to)}'` };
  }
  const entry: DesktopConnectionTransitionView = { at: now, from: record.state, to, cause, evidence };
  if (to === record.state && !PINNED_TERMINAL_CONNECTION_STATES.includes(record.state)) {
    return {
      ok: true,
      record: { ...record, lastTransitionAt: now, transitions: [...record.transitions, entry] },
    };
  }
  if (!isPinnedLawfulConnectionTransition(record.state, to)) {
    return {
      ok: false,
      reason: `The transition ${record.state} → ${to} is not lawful (terminal states have no exits; the lifecycle map is pinned)`,
    };
  }
  return {
    ok: true,
    record: { ...record, state: to, lastTransitionAt: now, transitions: [...record.transitions, entry] },
  };
}

/** The JSON record file over an injected fs seam (write-then-ack). */
export interface ConnectionRecordFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export class ConnectionRecordFileStore {
  readonly #fileSystem: ConnectionRecordFileSystem;
  readonly #directory: string;

  constructor(fileSystem: ConnectionRecordFileSystem, directory: string) {
    this.#fileSystem = fileSystem;
    this.#directory = directory;
  }

  /** Read all records (fail-closed per-record quarantine; missing file = empty). */
  async readAll(): Promise<readonly PersistedConnectionRecord[]> {
    let raw: string;
    try {
      raw = await this.#fileSystem.readFile(this.#path());
    } catch {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as { records?: unknown };
      if (!Array.isArray(parsed.records)) {
        return [];
      }
      return parsed.records
        .map(parsePersistedRecord)
        .filter((record): record is PersistedConnectionRecord => record !== null);
    } catch {
      // Corrupt store: the honest empty start; the corruption stays
      // visible on disk until the next mutation records what the
      // authority knows (never silently "repaired").
      return [];
    }
  }

  /** Persist the records atomically (mkdir-then-write). */
  async write(records: readonly PersistedConnectionRecord[]): Promise<void> {
    const payload = JSON.stringify({ version: 1, records: [...records] }, null, 2);
    await this.#fileSystem.mkdir(this.#directory);
    await this.#fileSystem.writeFile(this.#path(), `${payload}\n`);
  }

  #path(): string {
    return `${this.#directory.replace(/\/+$/, "")}/connections.json`;
  }
}

/** The honest seed refusal reason (unknown form / UNCONFIGURED), or null when seedable. */
export function seedRefusalReason(providerId: string, useCaseRef: string): string | null {
  const form = findRegistryForm(providerId, useCaseRef);
  if (form === null) {
    return `No declared provider form matches '${providerId}' / '${useCaseRef}' — no provider or form is ever guessed.`;
  }
  if (form.status === "UNCONFIGURED") {
    return `This integration type is declared but not configured in this deployment. Missing: ${form.missingOperatorConfiguration.join("; ")}. It is never simulated.`;
  }
  return null;
}
