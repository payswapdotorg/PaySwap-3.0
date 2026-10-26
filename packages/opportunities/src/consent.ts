/**
 * @payswap/opportunities — minimum-disclosure consent (P16-C, lane C;
 * gap-matrix row C6). A DisclosureConsent RECORD names ONE consenting
 * subject, the SCOPE of opportunity fields it consents to disclose, and a
 * state — GRANTED or REVOKED. The ConsentLedger is append-only with
 * ES-PRIVATE collaborators, so `Object.getOwnPropertyNames(
 * ConsentLedger.prototype)` is EXACTLY the frozen closed operation set
 * (CONSENT_LEDGER_OPERATIONS — a structural census law, never inferred by
 * filtering).
 *
 * ERROR LAWS (both paths tested): `validateConsentScope` throws the TYPED
 * GuaranteeLanguageError directly when the purpose carries guaranteed-return
 * language (the ./vocabulary.ts scan, reused); the LEDGER's `grant`
 * aggregates EVERY scope violation — structural AND guarantee-language —
 * into one typed DisclosureConsentError whose details carry them all.
 *
 * LIVENESS LAW: `consentIsValid(snapshot)` is the CALLER-side total gate —
 * it NEVER throws; a stale pre-revocation GRANTED snapshot (the ledger's
 * current view carrying the grant AND the later revocation) is simply not
 * live. The throw-on-revoked law belongs to the projection reading the
 * ledger's own REVOKED record (see ./matching.ts).
 */

import { GuaranteeLanguageError, ValidationError } from "./errors.ts";
import { scanForGuaranteeLanguage } from "./vocabulary.ts";

/** Raised when a disclosure-consent input, record or transition is malformed. */
export class DisclosureConsentError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "DisclosureConsentError";
  }
}

/** The closed consent-state vocabulary (runtime-frozen). */
export const CONSENT_STATES = Object.freeze(["GRANTED", "REVOKED"] as const);
export type ConsentState = (typeof CONSENT_STATES)[number];

export function isConsentState(value: unknown): value is ConsentState {
  return typeof value === "string" && (CONSENT_STATES as readonly unknown[]).includes(value);
}

/** Nominal brand: this value is a disclosure-consent record. */
export const CONSENT_KIND = "DisclosureConsent" as const;

/** The consented disclosure scope: WHICH fields, for WHAT purpose. */
export interface DisclosureScope {
  /** The disclosed field names (non-empty, unique, non-empty strings). */
  readonly fields: readonly string[];
  /** The human-readable purpose (non-empty, vocabulary-scanned). */
  readonly purpose: string;
}

/** One append-only disclosure-consent record. */
export interface DisclosureConsentRecord {
  readonly consentKind: typeof CONSENT_KIND;
  /** Deterministic identity: `consent:<subject>:<append index>`. */
  readonly consentId: string;
  readonly subject: string;
  readonly scope: DisclosureScope;
  readonly state: ConsentState;
  readonly recordedAt: number;
  /** REQUIRED on REVOKED records (the revocation instant); absent on GRANTED. */
  readonly revokedAt?: number;
}

/**
 * The caller-held liveness view for one subject: the latest GRANTED record
 * (null when never granted) and the REVOKED record when one exists. A
 * snapshot fetched AFTER a revocation carries BOTH — the grant is then
 * pre-revocation (superseded) and `consentIsValid` returns false.
 */
export interface ConsentSnapshot {
  readonly subject: string;
  readonly granted: DisclosureConsentRecord | null;
  readonly revocation: DisclosureConsentRecord | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateInstant(at: number, label: string): void {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(`${label} must be a non-negative integer (ms; no ambient clock)`);
  }
}

/** Collects the STRUCTURAL scope violations (never throws). */
function collectScopeErrors(candidate: unknown): { fields: readonly string[] | null; purpose: string | null; errors: string[] } {
  const errors: string[] = [];
  let fields: readonly string[] | null = null;
  let purpose: string | null = null;
  if (candidate === null || typeof candidate !== "object") {
    errors.push("scope must be a DisclosureScope { fields, purpose }");
    return { fields, purpose, errors };
  }
  const scope = candidate as Readonly<Record<string, unknown>>;
  if (!Array.isArray(scope.fields) || scope.fields.length === 0) {
    errors.push("scope.fields must be a non-empty array (consent to disclose NOTHING is not disclosure consent)");
  } else {
    const seen = new Set<string>();
    let allStrings = true;
    for (const field of scope.fields) {
      if (!isNonEmptyString(field)) {
        allStrings = false;
        break;
      }
      seen.add(field);
    }
    if (!allStrings) {
      errors.push("scope.fields entries must be non-empty strings");
    } else if (seen.size !== scope.fields.length) {
      errors.push("scope.fields must be unique (a consented field is named once)");
    } else {
      fields = Object.freeze([...(scope.fields as readonly string[])]);
    }
  }
  if (!isNonEmptyString(scope.purpose)) {
    errors.push("scope.purpose must be a non-empty string (the disclosed purpose — never guessed)");
  } else {
    purpose = scope.purpose;
  }
  return { fields, purpose, errors };
}

/**
 * Fail-closed scope validation — the DIRECT typed path: structural
 * violations aggregate into DisclosureConsentError; guarantee-language
 * violations throw the TYPED GuaranteeLanguageError (the vocabulary law is
 * structural on the consent's human surface).
 */
export function validateConsentScope(candidate: unknown): DisclosureScope {
  const { fields, purpose, errors } = collectScopeErrors(candidate);
  if (errors.length > 0) {
    throw new DisclosureConsentError(`Invalid disclosure consent scope: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const scan = scanForGuaranteeLanguage(purpose as string);
  if (!scan.clean) {
    const detail = scan.violations
      .map((violation) => `'${violation.matched}' (${violation.pattern})`)
      .join(", ");
    throw new GuaranteeLanguageError(
      `scope.purpose violates the no-guaranteed-returns law: ${detail} — a disclosure purpose never claims guaranteed outcomes (P16-C law)`,
    );
  }
  return Object.freeze({ fields: fields as readonly string[], purpose: purpose as string });
}

/**
 * Fail-closed validation of a DisclosureConsentRecord from untyped sources
 * (the surface the ledger's typed read path delegates to). Returns a NEW
 * frozen record. REVOKED requires revokedAt (at/after recordedAt); GRANTED
 * must not carry it.
 */
export function validateDisclosureConsent(candidate: unknown): DisclosureConsentRecord {
  if (candidate === null || typeof candidate !== "object") {
    throw new DisclosureConsentError("a disclosure consent must be an object");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const errors: string[] = [];
  if (record.consentKind !== CONSENT_KIND) {
    errors.push(`consentKind must be '${CONSENT_KIND}'`);
  }
  for (const field of ["consentId", "subject"] as const) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  let scope: DisclosureScope | null = null;
  try {
    scope = validateConsentScope(record.scope);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!isConsentState(record.state)) {
    errors.push("state must be one of [GRANTED, REVOKED]");
  }
  if (typeof record.recordedAt !== "number" || !Number.isSafeInteger(record.recordedAt) || record.recordedAt < 0) {
    errors.push("recordedAt must be a non-negative integer (caller-supplied instant)");
  }
  if (record.revokedAt !== undefined) {
    if (typeof record.revokedAt !== "number" || !Number.isSafeInteger(record.revokedAt) || record.revokedAt < 0) {
      errors.push("revokedAt, when present, must be a non-negative integer");
    } else if (
      typeof record.recordedAt === "number" && Number.isSafeInteger(record.recordedAt) &&
      record.revokedAt < record.recordedAt
    ) {
      errors.push("revokedAt may not precede recordedAt (a revocation is causal)");
    }
  }
  if (record.state === "REVOKED" && record.revokedAt === undefined) {
    errors.push("a REVOKED consent record requires revokedAt (the revocation instant)");
  }
  if (record.state === "GRANTED" && record.revokedAt !== undefined) {
    errors.push("a GRANTED consent record must not carry revokedAt");
  }
  if (errors.length > 0) {
    throw new DisclosureConsentError(`Invalid disclosure consent: ${errors.join("; ")}`, {
      errors: [...errors],
    });
  }
  const validated = candidate as DisclosureConsentRecord;
  return Object.freeze({
    consentKind: CONSENT_KIND,
    consentId: validated.consentId,
    subject: validated.subject,
    scope: scope as DisclosureScope,
    state: validated.state,
    recordedAt: validated.recordedAt,
    ...(validated.state === "REVOKED" ? { revokedAt: validated.revokedAt } : {}),
  });
}

/**
 * THE caller-side liveness gate — a TOTAL predicate that NEVER throws: a
 * snapshot is live iff it names a subject, carries a structurally valid
 * GRANTED record for that subject, and carries NO revocation. A stale
 * pre-revocation GRANTED snapshot (grant + later revocation) returns
 * false; malformed input returns false — the throw law belongs to the
 * projection reading the ledger's own REVOKED record.
 */
export function consentIsValid(candidate: unknown): boolean {
  try {
    if (candidate === null || typeof candidate !== "object") {
      return false;
    }
    const snapshot = candidate as Readonly<Record<string, unknown>>;
    if (!isNonEmptyString(snapshot.subject)) {
      return false;
    }
    if (snapshot.granted === null || typeof snapshot.granted !== "object") {
      return false;
    }
    const granted = validateDisclosureConsent(snapshot.granted);
    if (granted.state !== "GRANTED" || granted.subject !== snapshot.subject) {
      return false;
    }
    return snapshot.revocation === null || snapshot.revocation === undefined;
  } catch {
    return false;
  }
}

/**
 * The frozen CLOSED operation set of the ConsentLedger prototype — the
 * structural census law (ES-private collaborators are invisible to
 * `Object.getOwnPropertyNames`; the census is exact, never filtered).
 */
export const CONSENT_LEDGER_OPERATIONS = Object.freeze([
  "constructor",
  "grant",
  "records",
  "revoke",
  "snapshot",
] as const);

/**
 * The append-only minimum-disclosure consent ledger. ES-PRIVATE
 * collaborators (`#appendEvent`, `#stateFor`) keep the prototype's own
 * property names EXACTLY the closed operation set. The typed read path
 * (`snapshot`) delegates every stored record through
 * `validateDisclosureConsent` — the unknown-typed fail-closed surface.
 */
export class ConsentLedger {
  #events: DisclosureConsentRecord[] = [];

  #appendEvent(record: DisclosureConsentRecord): DisclosureConsentRecord {
    this.#events.push(record);
    return record;
  }

  #stateFor(subject: string): ConsentSnapshot {
    let granted: DisclosureConsentRecord | null = null;
    let revocation: DisclosureConsentRecord | null = null;
    for (const record of this.#events) {
      if (record.subject !== subject) {
        continue;
      }
      const validated = validateDisclosureConsent(record);
      if (validated.state === "GRANTED") {
        granted = validated;
      } else {
        revocation = validated;
      }
    }
    // A revocation supersedes only the grants it FOLLOWS: a later
    // re-grant is fresh consent (the snapshot's revocation is then null).
    if (
      revocation !== null &&
      granted !== null &&
      granted.recordedAt > (revocation.revokedAt ?? revocation.recordedAt)
    ) {
      revocation = null;
    }
    return Object.freeze({ subject, granted, revocation });
  }

  /** Records an explicit GRANTED consent (one live grant per subject). */
  grant(subject: string, scope: unknown, at: number): DisclosureConsentRecord {
    if (!isNonEmptyString(subject)) {
      throw new DisclosureConsentError("grant requires a non-empty subject");
    }
    validateInstant(at, "the consent grant instant `at`");
    // The AGGREGATE path: EVERY scope violation — structural AND
    // guarantee-language — folds into one typed DisclosureConsentError.
    const collected = collectScopeErrors(scope);
    const errors = [...collected.errors];
    if (collected.purpose !== null) {
      const scan = scanForGuaranteeLanguage(collected.purpose);
      if (!scan.clean) {
        const detail = scan.violations
          .map((violation) => `'${violation.matched}' (${violation.pattern})`)
          .join(", ");
        errors.push(
          `scope.purpose violates the no-guaranteed-returns law: ${detail} — a disclosure purpose never claims guaranteed outcomes (P16-C law)`,
        );
      }
    }
    if (errors.length > 0) {
      throw new DisclosureConsentError(
        `Invalid disclosure consent scope for subject '${subject}': ${errors.join("; ")}`,
        { errors: [...errors] },
      );
    }
    const state = this.#stateFor(subject);
    if (state.granted !== null && state.revocation === null) {
      throw new DisclosureConsentError(
        `subject '${subject}' already carries a live GRANTED disclosure consent (consentId '${state.granted.consentId}') — revoke before re-granting`,
      );
    }
    const record: DisclosureConsentRecord = Object.freeze({
      consentKind: CONSENT_KIND,
      consentId: `consent:${subject}:${String(this.#events.length)}`,
      subject,
      scope: Object.freeze({
        fields: collected.fields as readonly string[],
        purpose: collected.purpose as string,
      }),
      state: "GRANTED",
      recordedAt: at,
    });
    return this.#appendEvent(record);
  }

  /** Revokes the subject's live grant (appends a REVOKED record). */
  revoke(subject: string, at: number): DisclosureConsentRecord {
    if (!isNonEmptyString(subject)) {
      throw new DisclosureConsentError("revoke requires a non-empty subject");
    }
    validateInstant(at, "the consent revocation instant `at`");
    const state = this.#stateFor(subject);
    if (state.granted === null) {
      throw new DisclosureConsentError(
        `subject '${subject}' carries no GRANTED disclosure consent to revoke`,
      );
    }
    if (state.revocation !== null) {
      throw new DisclosureConsentError(
        `subject '${subject}' consent is already REVOKED (revocation '${state.revocation.consentId}')`,
      );
    }
    if (at < state.granted.recordedAt) {
      throw new DisclosureConsentError(
        `a revocation may not precede the grant it revokes (grant recordedAt ${String(state.granted.recordedAt)}, revoke at ${String(at)})`,
      );
    }
    const record: DisclosureConsentRecord = Object.freeze({
      consentKind: CONSENT_KIND,
      consentId: `consent:${subject}:${String(this.#events.length)}`,
      subject,
      scope: state.granted.scope,
      state: "REVOKED",
      recordedAt: at,
      revokedAt: at,
    });
    return this.#appendEvent(record);
  }

  /** The typed read path: the subject's current liveness view. */
  snapshot(subject: string): ConsentSnapshot {
    if (!isNonEmptyString(subject)) {
      throw new DisclosureConsentError("snapshot requires a non-empty subject");
    }
    return this.#stateFor(subject);
  }

  /** The append-only history (a frozen copy; the ledger's own list is private). */
  records(): readonly DisclosureConsentRecord[] {
    return Object.freeze([...this.#events]);
  }
}
