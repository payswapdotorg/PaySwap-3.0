/**
 * Test-side immune-system wiring double (R2-W2).
 *
 * DEVIATION-RECORDED ADAPTATION: the old repository's composition tests
 * (onchain-security/test/security-composition.test.ts and
 * onchain-threat-intel/test/immune-composition.test.ts, both at
 * payswap.org@8a735bf) drove the REAL @payswap/security machinery
 * (SecurityEpochAuthority / SecurityAdvisoryRegistry / QuarantineLedger /
 * SecurityGate / ThreatSignatureRegistry). In PaySwap 3.0 at base
 * 6999888 no security-immune package exists yet (that is P6-W3
 * territory), and the R2-W2 zero-sibling law forbids ANY @payswap/*
 * import in this package — including its tests (the CI-faithful battery
 * installs only typescript + vitest).
 *
 * This module therefore provides a STRUCTURAL WIRING DOUBLE with the same
 * observable semantics as the old real machinery (structurally mirroring
 * the trust lane's SecurityEpochAuthority/SecurityBlockRegistry shapes
 * where applicable): deterministic, append-only, monotonic — the same
 * laws the wiring layer will enforce when the TL wires the real machines
 * at integration. The composition tests exercise the SAME scenarios as
 * the old ones (advisory → quarantine/restrict/retire → kernel BLOCK;
 * epoch advance → voided authorizations; release requires verified
 * remediation + advisory closure).
 *
 * NOT exported from any src barrel — test infrastructure only.
 */

import { contentDigest } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Component identity (structurally identical literals — no parallel vocab)
// ---------------------------------------------------------------------------

export interface ImmuneComponent {
  readonly kind:
    | "agent_package"
    | "agent_body"
    | "agent_instance"
    | "agent_key"
    | "extension"
    | "capability"
    | "connected_instance";
  readonly id: string;
}

// ---------------------------------------------------------------------------
// SecurityEpochAuthority (monotonic epoch; advisory-driven advances)
// ---------------------------------------------------------------------------

export interface EpochStateView {
  readonly value: bigint;
  readonly advisoryRef?: string;
}

export class SecurityEpochAuthority {
  readonly #history: EpochStateView[] = [{ value: 0n }];

  currentEpoch(): EpochStateView {
    const current = this.#history[this.#history.length - 1];
    if (current === undefined) {
      throw new Error("epoch authority: no epoch recorded (unreachable)");
    }
    return current;
  }

  advance(input: { readonly reason: string; readonly at: number; readonly advisoryRef?: string }): EpochStateView {
    const next: EpochStateView = {
      value: this.currentEpoch().value + 1n,
      ...(input.advisoryRef !== undefined ? { advisoryRef: input.advisoryRef } : {}),
    };
    this.#history.push(next);
    return next;
  }

  history(): readonly EpochStateView[] {
    return [...this.#history];
  }
}

// ---------------------------------------------------------------------------
// SecurityAdvisoryRegistry (publish → active; close → closed; restriction view)
// ---------------------------------------------------------------------------

export interface SecurityAdvisory {
  readonly advisoryId: string;
  readonly status: "active" | "closed";
  readonly title: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly description: string;
  readonly affected: readonly ImmuneComponent[];
  readonly action: "restrict" | "quarantine" | "retire";
  readonly remediation: {
    readonly summary: string;
    readonly patchedVersion?: string;
    readonly workarounds: readonly string[];
  };
  readonly declaredBy: string;
  readonly publishedAt: number;
  readonly closedAt?: number;
}

export interface RestrictionView {
  readonly restricted: boolean;
  readonly quarantined: boolean;
  readonly retired: boolean;
  readonly advisoryRefs: readonly string[];
}

export class SecurityAdvisoryRegistry {
  readonly #advisories = new Map<string, SecurityAdvisory>();

  publish(input: Omit<SecurityAdvisory, "status">): SecurityAdvisory {
    if (this.#advisories.has(input.advisoryId)) {
      throw new Error(`advisory '${input.advisoryId}' already exists`);
    }
    const advisory: SecurityAdvisory = { ...input, status: "active" };
    this.#advisories.set(advisory.advisoryId, advisory);
    return advisory;
  }

  close(input: {
    readonly advisoryId: string;
    readonly closedAt: number;
    readonly closureNote: string;
    readonly remediationVerified: boolean;
  }): SecurityAdvisory {
    const advisory = this.#advisories.get(input.advisoryId);
    if (advisory === undefined) {
      throw new Error(`advisory '${input.advisoryId}' is unknown`);
    }
    if (!input.remediationVerified) {
      throw new Error("advisory closure requires verified remediation");
    }
    const closed: SecurityAdvisory = { ...advisory, status: "closed", closedAt: input.closedAt };
    this.#advisories.set(closed.advisoryId, closed);
    return closed;
  }

  listActive(): readonly SecurityAdvisory[] {
    return [...this.#advisories.values()].filter((advisory) => advisory.status === "active");
  }

  /** The restriction view: retired ≥ quarantined ≥ restricted (fail closed). */
  restrictionFor(component: ImmuneComponent): RestrictionView {
    const refs: string[] = [];
    let restricted = false;
    let quarantined = false;
    let retired = false;
    for (const advisory of this.listActive()) {
      const hit = advisory.affected.some(
        (affected) => affected.kind === component.kind && affected.id === component.id,
      );
      if (!hit) {
        continue;
      }
      refs.push(advisory.advisoryId);
      restricted = true;
      if (advisory.action === "quarantine" || advisory.action === "retire") {
        quarantined = true;
      }
      if (advisory.action === "retire") {
        retired = true;
      }
    }
    return { restricted, quarantined, retired, advisoryRefs: refs };
  }
}

// ---------------------------------------------------------------------------
// QuarantineLedger (append-only; release requires remediation + closure)
// ---------------------------------------------------------------------------

export interface QuarantineRecord {
  readonly quarantineId: string;
  readonly component: ImmuneComponent;
  readonly reason: string;
  readonly advisoryRefs: readonly string[];
  readonly quarantinedAt: number;
  readonly status: "active" | "released";
  readonly releasedAt?: number;
}

export interface RemediationEvidence {
  readonly evidenceId: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

export class QuarantineLedger {
  readonly #records: QuarantineRecord[] = [];
  #counter = 0;

  quarantine(input: {
    readonly component: ImmuneComponent;
    readonly reason: string;
    readonly advisoryRefs: readonly string[];
    readonly at: number;
  }): QuarantineRecord {
    this.#counter += 1;
    const record: QuarantineRecord = {
      quarantineId: `quarantine-${this.#counter.toString().padStart(4, "0")}`,
      component: input.component,
      reason: input.reason,
      advisoryRefs: [...input.advisoryRefs],
      quarantinedAt: input.at,
      status: "active",
    };
    this.#records.push(record);
    return record;
  }

  list(): readonly QuarantineRecord[] {
    return [...this.#records];
  }

  isQuarantined(component: ImmuneComponent): boolean {
    return this.#records.some(
      (record) =>
        record.status === "active" &&
        record.component.kind === component.kind &&
        record.component.id === component.id,
    );
  }

  release(input: {
    readonly quarantineId: string;
    readonly remediation: {
      readonly releaseNote: string;
      readonly evidence: readonly RemediationEvidence[];
    };
    readonly advisories: SecurityAdvisoryRegistry;
    readonly at: number;
  }): QuarantineRecord {
    const record = this.#records.find((candidate) => candidate.quarantineId === input.quarantineId);
    if (record === undefined) {
      throw new Error(`quarantine '${input.quarantineId}' is unknown`);
    }
    if (record.status === "released") {
      throw new Error(`quarantine '${input.quarantineId}' is already released`);
    }
    if (input.remediation.evidence.length === 0) {
      throw new Error(
        "quarantine release requires explicit remediation evidence (verified artifacts, not a claim)",
      );
    }
    for (const ref of record.advisoryRefs) {
      const advisory = input.advisories.listActive().find((candidate) => candidate.advisoryId === ref);
      if (advisory !== undefined) {
        throw new Error(
          `quarantine release requires advisory closure first: '${ref}' is still active`,
        );
      }
    }
    const released: QuarantineRecord = {
      ...record,
      status: "released",
      releasedAt: input.at,
    };
    this.#records[this.#records.indexOf(record)] = released;
    return released;
  }
}

// ---------------------------------------------------------------------------
// SecurityGate (advisory enforcement: quarantine/retire + optional epoch)
// ---------------------------------------------------------------------------

export class SecurityGate {
  readonly #advisories: SecurityAdvisoryRegistry;
  readonly #quarantine: QuarantineLedger;
  readonly #epochs: SecurityEpochAuthority;

  constructor(input: {
    readonly advisories: SecurityAdvisoryRegistry;
    readonly quarantine: QuarantineLedger;
    readonly epochs: SecurityEpochAuthority;
  }) {
    this.#advisories = input.advisories;
    this.#quarantine = input.quarantine;
    this.#epochs = input.epochs;
  }

  enforceAdvisory(
    advisory: SecurityAdvisory,
    options?: { readonly advanceEpoch?: boolean },
  ): {
    readonly quarantinedComponents: readonly ImmuneComponent[];
    readonly epochAdvanced: boolean;
  } {
    const quarantined: ImmuneComponent[] = [];
    if (advisory.action === "quarantine" || advisory.action === "retire") {
      for (const component of advisory.affected) {
        this.#quarantine.quarantine({
          component,
          reason: `${advisory.advisoryId}: ${advisory.action} enforcement`,
          advisoryRefs: [advisory.advisoryId],
          at: advisory.publishedAt,
        });
        quarantined.push(component);
      }
    }
    let epochAdvanced = false;
    if (options?.advanceEpoch === true) {
      this.#epochs.advance({
        reason: `${advisory.advisoryId}: ${advisory.action} enforcement`,
        at: advisory.publishedAt,
        advisoryRef: advisory.advisoryId,
      });
      epochAdvanced = true;
    }
    return { quarantinedComponents: quarantined, epochAdvanced };
  }
}

// ---------------------------------------------------------------------------
// ThreatSignatureRegistry (identity-scoped matching on signal class)
// ---------------------------------------------------------------------------

export interface ThreatSignature {
  readonly signatureId: string;
  readonly kind: string;
  readonly title: string;
  readonly description: string;
  readonly affected: ImmuneComponent;
  readonly indicators: readonly {
    readonly indicatorId: string;
    readonly kind: "action_pattern" | "token_family" | "signal_class";
    readonly pattern: string;
  }[];
  readonly declaredBy: string;
  readonly publishedAt: number;
  readonly provenance: { readonly contentHash: string };
}

export class ThreatSignatureRegistry {
  readonly #signatures = new Map<string, ThreatSignature>();

  register(registration: {
    readonly signatureId: string;
    readonly kind: string;
    readonly title: string;
    readonly description: string;
    readonly affected: ImmuneComponent;
    readonly indicators: readonly {
      readonly indicatorId: string;
      readonly kind: "action_pattern" | "token_family" | "signal_class";
      readonly pattern: string;
    }[];
    readonly declaredBy: string;
    readonly publishedAt: number;
  }): ThreatSignature {
    if (this.#signatures.has(registration.signatureId)) {
      throw new Error(`threat signature '${registration.signatureId}' already exists`);
    }
    const signature: ThreatSignature = {
      ...registration,
      provenance: { contentHash: contentDigest(registration) },
    };
    this.#signatures.set(signature.signatureId, signature);
    return signature;
  }

  matchObservation(input: {
    readonly component: ImmuneComponent;
    readonly signalClass: string;
  }): readonly ThreatSignature[] {
    return [...this.#signatures.values()].filter(
      (signature) =>
        signature.affected.kind === input.component.kind &&
        signature.affected.id === input.component.id &&
        signature.indicators.some(
          (indicator) => indicator.kind === "signal_class" && indicator.pattern === input.signalClass,
        ),
    );
  }
}
