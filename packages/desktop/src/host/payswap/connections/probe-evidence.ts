/**
 * PaySwap Desktop (P21-A, ADR-0014 D6) — the PROBE-EVIDENCE LEDGER: the
 * durable, secret-free record of what each REAL verification probe
 * observed, persisted beside the connection records (a sibling
 * probe-evidence.json under the connections directory).
 *
 * WHY THIS EXISTS: the connection session authority records the
 * LIFECYCLE evidence (a people-language summary string on the transition
 * history) — it deliberately carries no structured probe facts. The
 * capability bridge (./capability-bridge.ts) needs the STRUCTURED,
 * freshness-stamped, versioned facts (provider references, the account
 * ref, the credential class, the observed instant) to derive capability
 * instances + observations. This ledger is that input.
 *
 * LAWS:
 * - SECRET-FREE by construction: every field is a provider reference, a
 *   lifecycle/class vocabulary value or a timestamp — no key material,
 *   no broker payloads, no handles (the record is safe to persist and
 *   to feed the bridge; the broker's own escape scan already guards the
 *   in-memory path).
 * - APPEND/UPDATE per connection: each probe run lands one record per
 *   connectionId with a MONOTONIC observationVersion (freshness +
 *   versioning law, the CapabilityObservation mirror).
 * - HONEST OUTCOMES: UNKNOWN and FAILED probes are recorded too (the
 *   evidence of a probe that did not confirm is evidence) — the bridge
 *   only derives from CONFIRMED evidence on ACTIVE connections.
 * - FAIL-CLOSED persistence: a corrupt store starts empty (quarantine
 *   surfaced by the read, never a crash) — the same posture as the
 *   connection record store.
 */

import type { WorkspaceStoreFileSystem } from "../product/workspace-store-persistence.js";
import type {
  ConnectionProbeEvidenceTier,
  ConnectionProbeKeyClass,
  ConnectionProbeOutcomeKind,
  PaySwapProbeProviderId,
} from "./probe-contracts.js";

/** One structured, secret-free probe-evidence record (the bridge's input). */
export interface ProbeEvidenceRecord {
  readonly connectionId: string;
  readonly providerId: PaySwapProbeProviderId;
  readonly probedOperation: string;
  readonly outcome: ConnectionProbeOutcomeKind;
  /** Provider references the probe read (currency wallets / the account ref / transaction refs). */
  readonly providerReferences: readonly string[];
  /** The Stripe account ref (acct_…) when the account read confirmed. */
  readonly accountRef: string | null;
  /** The provider-reported livemode flag when read (must match SANDBOX — INV-25). */
  readonly providerLiveMode: boolean | null;
  /** The credential CLASS the probe observed inside the seal (structural, never secret). */
  readonly keyClass: ConnectionProbeKeyClass;
  /** The balance currencies the probe read (the Stripe balance denominations; may be empty). */
  readonly balanceCurrencies: readonly string[];
  readonly transportId: string;
  readonly executionMode: string;
  /** ISO-8601 UTC — the freshness stamp (declared data, never an ambient clock). */
  readonly observedAt: string;
  readonly evidenceTier: ConnectionProbeEvidenceTier;
  /** Monotonic per-connection observation version. */
  readonly observationVersion: number;
}

/** The input shape for one record landing (the version derives inside). */
export type ProbeEvidenceInput = Omit<ProbeEvidenceRecord, "observationVersion">;

/** The ledger's read/write surface (composed at the node edge with the authority). */
export interface ProbeEvidenceStore {
  /** Land one probe run's evidence (the version derives monotonically per connection). */
  recordProbeEvidence(input: ProbeEvidenceInput): Promise<ProbeEvidenceRecord>;
  /** The latest evidence per connection (the bridge's read). */
  latestProbeEvidence(): Promise<readonly ProbeEvidenceRecord[]>;
}

/** The persisted snapshot shape (versioned for forward migration). */
interface ProbeEvidenceSnapshot {
  readonly version: 1;
  readonly records: readonly ProbeEvidenceRecord[];
}

const SNAPSHOT_FILE = "probe-evidence.json";

/** Parse one candidate record fail-closed (a malformed record is dropped, never crashes the plane). */
function parseRecord(candidate: unknown): ProbeEvidenceRecord | null {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const record = candidate as Partial<ProbeEvidenceRecord>;
  if (
    typeof record.connectionId !== "string" ||
    record.connectionId.length === 0 ||
    typeof record.providerId !== "string" ||
    typeof record.probedOperation !== "string" ||
    typeof record.outcome !== "string" ||
    !Array.isArray(record.providerReferences) ||
    typeof record.observedAt !== "string" ||
    typeof record.evidenceTier !== "string" ||
    typeof record.keyClass !== "string"
  ) {
    return null;
  }
  return {
    connectionId: record.connectionId,
    providerId: record.providerId as PaySwapProbeProviderId,
    probedOperation: record.probedOperation,
    outcome: record.outcome as ConnectionProbeOutcomeKind,
    providerReferences: Object.freeze([...record.providerReferences]),
    accountRef: typeof record.accountRef === "string" ? record.accountRef : null,
    providerLiveMode:
      typeof record.providerLiveMode === "boolean" ? record.providerLiveMode : null,
    keyClass: record.keyClass as ConnectionProbeKeyClass,
    balanceCurrencies: Array.isArray(record.balanceCurrencies)
      ? Object.freeze([...record.balanceCurrencies])
      : [],
    transportId: typeof record.transportId === "string" ? record.transportId : "",
    executionMode: typeof record.executionMode === "string" ? record.executionMode : "",
    observedAt: record.observedAt,
    evidenceTier: record.evidenceTier as ConnectionProbeEvidenceTier,
    observationVersion:
      typeof record.observationVersion === "number" && Number.isInteger(record.observationVersion)
        ? record.observationVersion
        : 0,
  };
}

/**
 * Open the probe-evidence ledger over the injected file system (the
 * node composition edge binds node:fs; tests inject fakes). The file
 * lives beside connections.json in the connections directory.
 */
export async function openProbeEvidenceStore(input: {
  readonly fileSystem: WorkspaceStoreFileSystem;
  readonly directory: string;
}): Promise<ProbeEvidenceStore> {
  const path = `${input.directory.replace(/\/+$/, "")}/${SNAPSHOT_FILE}`;
  let latest = new Map<string, ProbeEvidenceRecord>();
  try {
    const raw = await input.fileSystem.readFile(path);
    const parsed = JSON.parse(raw) as Partial<ProbeEvidenceSnapshot>;
    if (parsed !== null && typeof parsed === "object" && Array.isArray(parsed.records)) {
      for (const candidate of parsed.records) {
        const record = parseRecord(candidate);
        if (record !== null) {
          latest.set(record.connectionId, record);
        }
      }
    }
  } catch {
    // Absent or corrupt: the ledger starts empty honestly (the same
    // per-record quarantine posture as the connection record store).
  }

  const persist = async (): Promise<void> => {
    const snapshot: ProbeEvidenceSnapshot = {
      version: 1,
      records: [...latest.values()],
    };
    await input.fileSystem.writeFile(path, JSON.stringify(snapshot, null, 2));
  };

  return {
    async recordProbeEvidence(record: ProbeEvidenceInput): Promise<ProbeEvidenceRecord> {
      const previous = latest.get(record.connectionId);
      const versioned: ProbeEvidenceRecord = Object.freeze({
        ...record,
        providerReferences: Object.freeze([...record.providerReferences]),
        balanceCurrencies: Object.freeze([...record.balanceCurrencies]),
        observationVersion: (previous?.observationVersion ?? 0) + 1,
      });
      latest.set(record.connectionId, versioned);
      await persist();
      return versioned;
    },
    async latestProbeEvidence(): Promise<readonly ProbeEvidenceRecord[]> {
      return [...latest.values()].sort((a, b) =>
        a.connectionId === b.connectionId ? 0 : a.connectionId < b.connectionId ? -1 : 1,
      );
    },
  };
}
