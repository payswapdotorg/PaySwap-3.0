/**
 * @payswap/adversarial — the threat-signature registry (P6-W3, lane
 * r4-w3; PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/signatures.ts, split for the ≤400-line file
 * law — the identity model + version comparison live in
 * ./component-identity.ts; the content digest now comes from the local
 * pin, structurally identical to the old package-local one).
 *
 * A threat signature is a MATCHABLE pattern scoped to vulnerable
 * component identities (package / agent / extension / capability /
 * connected instance) plus affected-version ranges, with mandatory
 * provenance. Signatures are the DETECTION vocabulary of the immune
 * system: advisories (./advisories.ts) and capability cases
 * (./capability-cases.ts) consume them as evidence for restriction,
 * quarantine and learning decisions.
 *
 * Matching semantics (deliberate contrast, kept verbatim from the old
 * law): DETECTION is evidence-generating and therefore FAIL-OPEN — a
 * version-scoped signature with an UNKNOWN component version produces
 * NO match, never a guess. RESTRICTION (./advisories.ts) is fail-CLOSED
 * — a version-scoped advisory with an unknown version treats the
 * component as AFFECTED. The network restricts what it cannot verify as
 * safe; it does not fabricate detections.
 *
 * Deterministic only: pure functions; registration order is the only
 * ordering; every entry is content-addressed through the pinned digest.
 */

import { contentDigest } from "./pins/index.ts";
import type { ComponentIdentity, ComponentKind, VersionRange } from "./component-identity.ts";
import { compareVersions, isComponentKind, parseVersion, versionInRange } from "./component-identity.ts";

// ---------------------------------------------------------------------------
// Threat signatures
// ---------------------------------------------------------------------------

/** What the signature detects. */
export type ThreatSignatureKind =
  | "vulnerable_package"
  | "vulnerable_extension"
  | "malicious_behavior"
  | "abuse_pattern"
  | "credential_compromise";

/**
 * One matchable indicator. Kinds:
 * - action_pattern: an exact action id or a `prefix.*` wildcard (prefix
 *   match, same semantics as the trust action patterns);
 * - token_family:   a typed protocol token family the component emits
 *   or consumes suspiciously;
 * - signal_class:   a security signal class (e.g. "beneficiary_change").
 */
export interface ThreatIndicator {
  readonly indicatorId: string;
  readonly kind: "action_pattern" | "token_family" | "signal_class";
  readonly pattern: string;
}

/** True iff an action pattern (exact or `prefix.*`) matches an action id. */
export function matchesActionPattern(pattern: string, action: string): boolean {
  if (pattern.length === 0) {
    return false;
  }
  if (pattern === "*") {
    return true;
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return action.startsWith(`${prefix}.`);
  }
  return pattern === action;
}

/** The component scope a signature matches against. */
export interface AffectedComponentScope {
  readonly kind: ComponentKind;
  readonly id: string;
  readonly versionRange?: VersionRange;
}

/** Mandatory provenance for every registered signature. */
export interface SignatureProvenance {
  readonly source: string;
  readonly contentHash: string;
  readonly publishedAt: number;
}

/** A registered threat signature: immutable once registered. */
export interface ThreatSignature {
  readonly signatureId: string;
  readonly kind: ThreatSignatureKind;
  readonly title: string;
  readonly description: string;
  readonly affected: AffectedComponentScope;
  readonly indicators: readonly ThreatIndicator[];
  readonly provenance: SignatureProvenance;
}

/** An observation to match signatures against (deterministic input). */
export interface ComponentObservation {
  readonly component: ComponentIdentity;
  /** Observed action id, when the observation is behavioral. */
  readonly action?: string;
  /** Observed emitted/consumed typed token family. */
  readonly tokenFamily?: string;
  /** Observed security signal class. */
  readonly signalClass?: string;
}

/** Raised for invalid signature registration or matching input. */
export class ThreatSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreatSignatureError";
  }
}

/**
 * True iff the signature's component scope covers the identity (kind +
 * id + version in range). When the identity carries no version, an
 * unscoped (range-less) signature still matches; a signature with an
 * explicit range requires a KNOWN version in range to match (detection
 * is evidence-generating: an unknown version produces no match, never a
 * guess — contrast the fail-closed restriction semantics in
 * ./advisories.ts).
 */
export function signatureMatchesIdentity(
  signature: ThreatSignature,
  identity: ComponentIdentity,
): boolean {
  if (signature.affected.kind !== identity.kind) {
    return false;
  }
  if (signature.affected.id !== identity.id) {
    return false;
  }
  const range = signature.affected.versionRange;
  if (range === undefined) {
    return true;
  }
  if (range.minVersion === undefined && range.maxVersion === undefined) {
    return true;
  }
  if (identity.version === undefined) {
    return false;
  }
  return versionInRange(identity.version, range);
}

/**
 * True iff the signature matches the observation: the component scope
 * covers the observed identity AND at least one indicator matches the
 * observed action / token family / signal class. A signature without
 * indicators never matches an observation (it is identity-scoped
 * intelligence, not a live detector).
 */
export function signatureMatchesObservation(
  signature: ThreatSignature,
  observation: ComponentObservation,
): boolean {
  if (!signatureMatchesIdentity(signature, observation.component)) {
    return false;
  }
  if (signature.indicators.length === 0) {
    return false;
  }
  for (const indicator of signature.indicators) {
    switch (indicator.kind) {
      case "action_pattern":
        if (
          observation.action !== undefined &&
          matchesActionPattern(indicator.pattern, observation.action)
        ) {
          return true;
        }
        break;
      case "token_family":
        if (
          observation.tokenFamily !== undefined &&
          indicator.pattern === observation.tokenFamily
        ) {
          return true;
        }
        break;
      case "signal_class":
        if (
          observation.signalClass !== undefined &&
          indicator.pattern === observation.signalClass
        ) {
          return true;
        }
        break;
    }
  }
  return false;
}

/** Input accepted by the registry; provenance contentHash is computed. */
export interface RegisterThreatSignatureInput {
  readonly signatureId: string;
  readonly kind: ThreatSignatureKind;
  readonly title: string;
  readonly description: string;
  readonly affected: AffectedComponentScope;
  readonly indicators?: readonly ThreatIndicator[];
  readonly declaredBy: string;
  readonly publishedAt: number;
}

function validateIndicator(indicator: ThreatIndicator): void {
  if (indicator.indicatorId.length === 0) {
    throw new ThreatSignatureError("indicator id must not be empty");
  }
  if (indicator.pattern.length === 0) {
    throw new ThreatSignatureError(
      `indicator '${indicator.indicatorId}' pattern must not be empty`,
    );
  }
}

/**
 * The threat signature registry: append-only, deterministic
 * (registration order), every entry content-addressed with provenance.
 */
export class ThreatSignatureRegistry {
  readonly #signaturesById = new Map<string, ThreatSignature>();
  readonly #order: string[] = [];

  /** Registers a signature; the registry computes the provenance contentHash. */
  register(input: RegisterThreatSignatureInput): ThreatSignature {
    if (input.signatureId.length === 0) {
      throw new ThreatSignatureError("signatureId must not be empty");
    }
    if (input.title.length === 0) {
      throw new ThreatSignatureError("title must not be empty");
    }
    if (input.declaredBy.length === 0) {
      throw new ThreatSignatureError("declaredBy must not be empty");
    }
    if (!isComponentKind(input.affected.kind)) {
      throw new ThreatSignatureError(
        `unknown affected component kind '${String(input.affected.kind)}'`,
      );
    }
    if (input.affected.id.length === 0) {
      throw new ThreatSignatureError("affected component id must not be empty");
    }
    const range = input.affected.versionRange;
    if (range !== undefined) {
      if (range.minVersion !== undefined) {
        parseVersion(range.minVersion);
      }
      if (range.maxVersion !== undefined) {
        parseVersion(range.maxVersion);
      }
      if (
        range.minVersion !== undefined &&
        range.maxVersion !== undefined &&
        compareVersions(range.minVersion, range.maxVersion) > 0
      ) {
        throw new ThreatSignatureError(
          `affected version range is inverted (${range.minVersion} > ${range.maxVersion})`,
        );
      }
    }
    const indicators = input.indicators ?? [];
    for (const indicator of indicators) {
      validateIndicator(indicator);
    }
    if (this.#signaturesById.has(input.signatureId)) {
      throw new ThreatSignatureError(
        `signature '${input.signatureId}' is already registered`,
      );
    }
    const signature: ThreatSignature = Object.freeze({
      signatureId: input.signatureId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      affected: input.affected,
      indicators: Object.freeze([...indicators]),
      provenance: Object.freeze({
        source: input.declaredBy,
        contentHash: contentDigest({
          signatureId: input.signatureId,
          kind: input.kind,
          title: input.title,
          description: input.description,
          affected: input.affected,
          indicators,
        }),
        publishedAt: input.publishedAt,
      }),
    });
    this.#signaturesById.set(signature.signatureId, signature);
    this.#order.push(signature.signatureId);
    return signature;
  }

  byId(signatureId: string): ThreatSignature | undefined {
    return this.#signaturesById.get(signatureId);
  }

  /** All signatures in registration order. */
  list(): readonly ThreatSignature[] {
    return this.#order.map(
      (id) => this.#signaturesById.get(id) as ThreatSignature,
    );
  }

  /** Every signature whose component scope covers the identity. */
  matchIdentity(identity: ComponentIdentity): readonly ThreatSignature[] {
    return this.list().filter((signature) =>
      signatureMatchesIdentity(signature, identity),
    );
  }

  /** Every signature matching the observation (identity + one indicator). */
  matchObservation(
    observation: ComponentObservation,
  ): readonly ThreatSignature[] {
    return this.list().filter((signature) =>
      signatureMatchesObservation(signature, observation),
    );
  }
}
