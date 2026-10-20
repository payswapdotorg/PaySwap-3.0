/**
 * @payswap/operations — provider activation records (P8-W3, hard law 6).
 *
 * ACTIVATION RECORDS are VERSIONED, IMMUTABLE and APPEND-ONLY: a new
 * record SUPERSEDES a prior one by reference; history is never
 * rewritten. ACTIVATED requires live probe evidence AND a connected
 * instance reference; every other status forbids one — operator input is
 * never proof of integration. ENABLEMENT IS DATA, NOT ENVIRONMENT:
 * per-provider enablement derives from the activation ledger plus
 * explicit operator overrides — never from a redeploy. Fail-closed: no
 * current ACTIVATED record means NOT ENABLED, whatever an override says;
 * an override may only DISABLE.
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * provider-activation.ts. Deterministic only: caller-supplied ISO-8601
 * UTC timestamps; no network, no entropy.
 */

import { contentDigest, deepFreeze } from "./digest.js";
import { isSecretShaped } from "./secrets.js";

/** Raised when an activation-record contract is violated. */
export class ProviderActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderActivationError";
  }
}

const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;


export const PROVIDER_ACTIVATION_STATUSES = [
  "ACTIVATED",
  "BLOCKED",
  "REVOKED",
  "SUPERSEDED",
] as const;
export type ProviderActivationStatus =
  (typeof PROVIDER_ACTIVATION_STATUSES)[number];

/** Probe verdicts that can back an ACTIVATED record (live evidence only). */
export const ACTIVATION_EVIDENCE_VERDICTS = [
  "VERIFIED",
  "ELIGIBLE",
  "READY",
] as const;
export type ActivationEvidenceVerdict =
  (typeof ACTIVATION_EVIDENCE_VERDICTS)[number];

/** The live-probe evidence backing an activation record (a reference). */
export interface ProviderProbeEvidenceRef {
  /** Path/id of the probe-evidence record. */
  readonly evidencePath: string;
  readonly probedAt: string;
  readonly verdict: ActivationEvidenceVerdict;
  /** Sanitized summary of what was probed (no secret material). */
  readonly summary: string;
}

/** A versioned, immutable provider activation record. */
export interface ProviderActivationRecord {
  readonly recordId: string;
  readonly providerName: string;
  readonly status: ProviderActivationStatus;
  /** Live probe evidence — REQUIRED. */
  readonly probeEvidence: ProviderProbeEvidenceRef;
  /** Connected-instance id — REQUIRED for ACTIVATED, FORBIDDEN otherwise. */
  readonly connectedInstanceId?: string;
  /** Honest limitations carried into every consumer. */
  readonly limitations: readonly string[];
  /** A superseding record references its predecessor (linear chains). */
  readonly supersedes?: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
  readonly digest: string;
}

/** Assemble + validate an activation record (fail-closed). */
export function defineProviderActivationRecord(input: {
  readonly recordId: string;
  readonly providerName: string;
  readonly status: ProviderActivationStatus;
  readonly probeEvidence: ProviderProbeEvidenceRef;
  readonly connectedInstanceId?: string;
  readonly limitations?: readonly string[];
  readonly supersedes?: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
}): ProviderActivationRecord {
  if (input.recordId.length < 3) {
    throw new ProviderActivationError("recordId must be a non-trivial string");
  }
  if (input.providerName.length < 2) {
    throw new ProviderActivationError("providerName must be a non-trivial string");
  }
  if (
    input.status !== "ACTIVATED" &&
    input.status !== "BLOCKED" &&
    input.status !== "REVOKED" &&
    input.status !== "SUPERSEDED"
  ) {
    throw new ProviderActivationError(
      `unknown activation status '${String(input.status)}'`,
    );
  }
  const evidence = input.probeEvidence;
  if (
    typeof evidence.evidencePath !== "string" ||
    evidence.evidencePath.length < 5 ||
    typeof evidence.probedAt !== "string" ||
    !ISO_8601_UTC_PATTERN.test(evidence.probedAt) ||
    typeof evidence.summary !== "string" ||
    evidence.summary.length < 3 ||
    !(ACTIVATION_EVIDENCE_VERDICTS as readonly string[]).includes(
      evidence.verdict,
    )
  ) {
    throw new ProviderActivationError(
      "live probe evidence is required (operator input is never proof of integration)",
    );
  }
  if (input.status === "ACTIVATED") {
    if (
      typeof input.connectedInstanceId !== "string" ||
      input.connectedInstanceId.length < 3
    ) {
      throw new ProviderActivationError(
        "an ACTIVATED record must reference its connected instance",
      );
    }
  } else if (input.connectedInstanceId !== undefined) {
    throw new ProviderActivationError(
      `only an ACTIVATED record may carry a connected-instance reference (status is ${input.status})`,
    );
  }
  if (!ISO_8601_UTC_PATTERN.test(input.recordedAt)) {
    throw new ProviderActivationError("recordedAt must be ISO-8601 UTC");
  }
  if (input.recordedBy.length < 2) {
    throw new ProviderActivationError("recordedBy is required (lineage)");
  }
  const body = {
    recordId: input.recordId,
    providerName: input.providerName,
    status: input.status,
    probeEvidence: input.probeEvidence,
    ...(input.connectedInstanceId !== undefined
      ? { connectedInstanceId: input.connectedInstanceId }
      : {}),
    limitations: [...(input.limitations ?? [])],
    ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {}),
    recordedAt: input.recordedAt,
    recordedBy: input.recordedBy,
  };
  if (isSecretShaped(JSON.stringify(body))) {
    throw new ProviderActivationError(
      "secret-shaped value in an activation record (references only)",
    );
  }
  return deepFreeze({ ...body, digest: contentDigest(body) });
}

// ---------------------------------------------------------------------------
// The append-only ledger (functional — snapshots never mutate)
// ---------------------------------------------------------------------------

export interface ProviderActivationLedger {
  readonly records: readonly ProviderActivationRecord[];
}

export function emptyProviderActivationLedger(): ProviderActivationLedger {
  return { records: [] };
}

/**
 * Append a record and return a NEW ledger. Fails closed: unique recordId;
 * a `supersedes` reference must resolve to an existing record of the SAME
 * provider; chains are linear (a record may not be superseded twice).
 */
export function appendProviderActivationRecord(
  ledger: ProviderActivationLedger,
  record: ProviderActivationRecord,
): ProviderActivationLedger {
  if (ledger.records.some((r) => r.recordId === record.recordId)) {
    throw new ProviderActivationError(
      `duplicate recordId '${record.recordId}' (the ledger is append-only)`,
    );
  }
  if (record.supersedes !== undefined) {
    const predecessor = ledger.records.find(
      (r) => r.recordId === record.supersedes,
    );
    if (predecessor === undefined) {
      throw new ProviderActivationError(
        `supersedes reference '${record.supersedes}' does not resolve`,
      );
    }
    if (predecessor.providerName !== record.providerName) {
      throw new ProviderActivationError(
        `supersedes chain crosses providers ('${predecessor.providerName}' -> '${record.providerName}')`,
      );
    }
    if (ledger.records.some((r) => r.supersedes === record.supersedes)) {
      throw new ProviderActivationError(
        `record '${record.supersedes}' is already superseded (chains are linear)`,
      );
    }
  }
  return { records: [...ledger.records, record] };
}

/** The latest non-superseded record per provider (the current truth). */
export function currentProviderActivationRecords(
  ledger: ProviderActivationLedger,
): readonly ProviderActivationRecord[] {
  const superseded = new Set(
    ledger.records
      .map((r) => r.supersedes)
      .filter((id): id is string => id !== undefined),
  );
  return ledger.records.filter((r) => !superseded.has(r.recordId));
}

// ---------------------------------------------------------------------------
// Enablement — data in the system of record (never a redeploy)
// ---------------------------------------------------------------------------

export interface ProviderEnablementOverride {
  readonly providerName: string;
  /** An operator may DISABLE a verified provider; enabling cannot bypass evidence. */
  readonly enabled: boolean;
  readonly reason: string;
  readonly decidedAt: string;
}

export interface ProviderEnablement {
  readonly providerName: string;
  readonly enabled: boolean;
  readonly reason: string;
}

/**
 * Resolve per-provider enablement from the LEDGER plus explicit operator
 * overrides. Fail-closed: no current ACTIVATED record -> NOT ENABLED
 * (whatever an override says); an override may only DISABLE.
 */
export function resolveProviderEnablement(
  ledger: ProviderActivationLedger,
  overrides: readonly ProviderEnablementOverride[] = [],
): readonly ProviderEnablement[] {
  const byProvider = new Map<string, ProviderActivationRecord>();
  for (const record of currentProviderActivationRecords(ledger)) {
    byProvider.set(record.providerName, record);
  }
  const overrideByProvider = new Map<string, ProviderEnablementOverride>();
  for (const override of overrides) {
    overrideByProvider.set(override.providerName, override);
  }

  const result: ProviderEnablement[] = [];
  for (const [providerName, record] of byProvider) {
    const override = overrideByProvider.get(providerName);
    if (record.status !== "ACTIVATED") {
      result.push({
        providerName,
        enabled: false,
        reason: `current activation status ${record.status} (evidence-gated, fail-closed)`,
      });
      continue;
    }
    if (override !== undefined && !override.enabled) {
      result.push({
        providerName,
        enabled: false,
        reason: `operator override: ${override.reason} (${override.decidedAt})`,
      });
      continue;
    }
    result.push({
      providerName,
      enabled: true,
      reason: `verified activation ${record.recordId} (probe evidence ${record.probeEvidence.verdict} @ ${record.probeEvidence.probedAt})`,
    });
  }
  return result;
}
