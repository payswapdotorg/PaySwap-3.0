/**
 * PaySwap Desktop (P24-2, ADR-0017 D2 — the migration law; P26-C — the
 * migration VERB) — the PER-CONNECTION STRIPE API-VERSION STATE: the
 * durable record of which Stripe API version each connection's requests
 * carry, which catalogue release the NEW surface used, and each event
 * destination's schema version.
 *
 * THE LAW (ADR-0017 D2, BINDING — P26-C makes the reviewed migration
 * real without moving the default):
 * - the legacy request pin '2025-08-27.basil' is the DEFAULT and is
 *   never silently swapped — it is per-connection STATE; a connection
 *   that never migrated keeps requesting it (requestApiVersionOf()
 *   answers the migrated version ONLY after an explicit successful
 *   migration);
 * - THE MIGRATION VERB (P26-C, the separate reviewed work item ADR-0017
 *   D2 reserved): `migrateRequestApiVersion` performs the ONE legal
 *   forward transition legacy→catalogue-pin. DESIGN CHOICE: the verb
 *   takes an EXPLICIT target and refuses every target other than the
 *   catalogue pin version (unknown targets are refused with a typed
 *   reason, NEVER guessed); the reversal is a SEPARATE verb
 *   (`revertRequestApiVersionToLegacy`) rather than a second legal
 *   target, so a reversal can never be confusable with a forward
 *   migration request and each verb carries exactly one purpose; a
 *   re-migration of an already-migrated connection is an honest
 *   idempotent refusal naming the current state, and a revert of a
 *   never-migrated connection is refused the same way;
 * - the migration provenance (when, from-version, to-version, the
 *   connection) is DURABLE: the state records
 *   requestApiVersionMigratedFrom/At alongside the version in force, and
 *   every transition appends to the monotonic history (append-only;
 *   current values are projections of the last append per field);
 * - the catalogue version (2026-09-30.endive via the pinned release)
 *   is RECORDED per connection when the new census surface is used;
 * - an event-destination schema version is an INDEPENDENT fact — it is
 *   never rewritten by a request-version change (and vice versa);
 * - a persisted request version that is neither the legacy pin nor the
 *   catalogue pin is UNRECOGNIZED and never silently migrated.
 */

import type { StripeActionApiVersionPort } from "../stripe/action-seams.js";
import { PINNED_STRIPE_CATALOGUE_PIN, PINNED_STRIPE_LEGACY_REQUEST_API_VERSION } from "../stripe/stripe-pins.js";
import { assertNoStripeSecretShapes } from "../stripe/stripe-pins.js";

/** The injected fs seam (the workspace-store shape). */
export interface StripeApiVersionFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** One append-only version-state history entry. */
export interface StripeApiVersionHistoryEntry {
  readonly at: string;
  readonly cause:
    | "CONNECTION_INITIALIZED"
    | "CATALOGUE_SURFACE_USED"
    | "EVENT_DESTINATION_VERSION_RECORDED"
    | "REQUEST_API_VERSION_MIGRATED"
    | "REQUEST_API_VERSION_REVERTED";
  /** The value this entry records for its cause (never a secret). */
  readonly value: string;
}

/** The per-connection API-version state (the durable truth). */
export interface StripeConnectionApiVersionState {
  readonly connectionId: string;
  /** The request API version this connection's requests carry (the legacy pin by default). */
  readonly requestApiVersion: string;
  /** The version the request pin was explicitly migrated FROM (null until a successful migration). */
  readonly requestApiVersionMigratedFrom: string | null;
  readonly requestApiVersionMigratedAt: string | null;
  /** The pinned catalogue release recorded when the NEW surface was used (null until then). */
  readonly catalogueReleaseUsed: string | null;
  readonly catalogueReleaseUsedAt: string | null;
  /** The event-destination schema version (an INDEPENDENT fact — never rewritten by request-version changes). */
  readonly eventDestinationApiVersion: string | null;
  readonly history: readonly StripeApiVersionHistoryEntry[];
}

/**
 * The typed, fail-closed migration refusal (P26-C — never a thrown
 * string; the only legal forward target is the catalogue pin version).
 */
export type StripeRequestApiVersionMigrationRefusal =
  | {
      readonly kind: "UNKNOWN_TARGET";
      readonly targetApiVersion: string;
      /** The one legal forward target (the catalogue pin version). */
      readonly legalTargetApiVersion: string;
    }
  | {
      readonly kind: "ALREADY_MIGRATED";
      /** The connection's current request version (already the catalogue pin). */
      readonly requestApiVersion: string;
    }
  | {
      readonly kind: "NOT_MIGRATED";
      /** The connection's current request version (not the catalogue pin — nothing to revert). */
      readonly requestApiVersion: string;
    }
  | {
      readonly kind: "UNRECOGNIZED_CURRENT_VERSION";
      /** The persisted version that is neither the legacy pin nor the catalogue pin. */
      readonly requestApiVersion: string;
    };

interface VersionSnapshot {
  readonly version: 1;
  readonly states: readonly StripeConnectionApiVersionState[];
}

const SNAPSHOT_FILE = "stripe-api-version-state.json";

/** Fail-closed parse of one state record. */
function parseState(candidate: unknown): StripeConnectionApiVersionState | null {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const record = candidate as Partial<StripeConnectionApiVersionState>;
  if (
    typeof record.connectionId !== "string" ||
    record.connectionId.length === 0 ||
    typeof record.requestApiVersion !== "string" ||
    !Array.isArray(record.history)
  ) {
    return null;
  }
  const history: StripeApiVersionHistoryEntry[] = [];
  for (const entry of record.history) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.at !== "string" ||
      (entry.cause !== "CONNECTION_INITIALIZED" &&
        entry.cause !== "CATALOGUE_SURFACE_USED" &&
        entry.cause !== "EVENT_DESTINATION_VERSION_RECORDED" &&
        entry.cause !== "REQUEST_API_VERSION_MIGRATED" &&
        entry.cause !== "REQUEST_API_VERSION_REVERTED") ||
      typeof entry.value !== "string"
    ) {
      continue;
    }
    history.push({ at: entry.at, cause: entry.cause, value: entry.value });
  }
  return {
    connectionId: record.connectionId,
    requestApiVersion: record.requestApiVersion,
    requestApiVersionMigratedFrom:
      typeof record.requestApiVersionMigratedFrom === "string"
        ? record.requestApiVersionMigratedFrom
        : null,
    requestApiVersionMigratedAt:
      typeof record.requestApiVersionMigratedAt === "string"
        ? record.requestApiVersionMigratedAt
        : null,
    catalogueReleaseUsed:
      typeof record.catalogueReleaseUsed === "string" ? record.catalogueReleaseUsed : null,
    catalogueReleaseUsedAt:
      typeof record.catalogueReleaseUsedAt === "string" ? record.catalogueReleaseUsedAt : null,
    eventDestinationApiVersion:
      typeof record.eventDestinationApiVersion === "string" ? record.eventDestinationApiVersion : null,
    history: Object.freeze(history),
  };
}

/** The per-connection API-version state store (implements the executor's api-version port). */
export class StripeApiVersionStateStore implements StripeActionApiVersionPort {
  readonly #fileSystem: StripeApiVersionFileSystem;
  readonly #directory: string;
  readonly #nowIso: () => string;
  readonly #states = new Map<string, StripeConnectionApiVersionState>();

  constructor(input: {
    readonly fileSystem: StripeApiVersionFileSystem;
    readonly directory: string;
    readonly nowIso: () => string;
  }) {
    this.#fileSystem = input.fileSystem;
    this.#directory = input.directory;
    this.#nowIso = input.nowIso;
  }

  /** Load persisted state (absent/corrupt → honest empty start). */
  async load(): Promise<void> {
    try {
      const raw = await this.#fileSystem.readFile(this.#path());
      const parsed = JSON.parse(raw) as Partial<VersionSnapshot>;
      if (parsed !== null && typeof parsed === "object" && parsed.version === 1 && Array.isArray(parsed.states)) {
        for (const candidate of parsed.states) {
          const state = parseState(candidate);
          if (state !== null) {
            this.#states.set(state.connectionId, state);
          }
        }
      }
    } catch {
      // Absent or corrupt: start empty (per-record quarantine posture).
    }
  }

  #path(): string {
    return `${this.#directory.replace(/\/+$/, "")}/${SNAPSHOT_FILE}`;
  }

  async #persist(): Promise<void> {
    assertNoStripeSecretShapes([...this.#states.values()], "the API-version state snapshot");
    const snapshot: VersionSnapshot = { version: 1, states: [...this.#states.values()] };
    await this.#fileSystem.mkdir(this.#directory);
    await this.#fileSystem.writeFile(this.#path(), JSON.stringify(snapshot, null, 2));
  }

  /** The state of one connection (initialized lazily with the LEGACY request pin). */
  async stateOf(connectionId: string): Promise<StripeConnectionApiVersionState> {
    let state = this.#states.get(connectionId);
    if (state === undefined) {
      state = Object.freeze({
        connectionId,
        requestApiVersion: PINNED_STRIPE_LEGACY_REQUEST_API_VERSION,
        requestApiVersionMigratedFrom: null,
        requestApiVersionMigratedAt: null,
        catalogueReleaseUsed: null,
        catalogueReleaseUsedAt: null,
        eventDestinationApiVersion: null,
        history: Object.freeze([
          {
            at: this.#nowIso(),
            cause: "CONNECTION_INITIALIZED" as const,
            value: PINNED_STRIPE_LEGACY_REQUEST_API_VERSION,
          },
        ]),
      });
      this.#states.set(connectionId, state);
      await this.#persist();
    }
    return state;
  }

  async requestApiVersionOf(connectionId: string): Promise<string> {
    // THE MIGRATION LAW: this answers the connection's recorded request
    // version — the legacy pin until the P26-C migration verb is
    // explicitly exercised for THIS connection (the default never moves).
    return (await this.stateOf(connectionId)).requestApiVersion;
  }

  /**
   * THE MIGRATION VERB (P26-C, ADR-0017 D2's reviewed work item): the
   * ONE legal forward transition legacy pin → catalogue pin version.
   * The target is explicit and must be EXACTLY the catalogue pin version
   * — any other target is a typed UNKNOWN_TARGET refusal (never a
   * guess); an already-migrated connection is an honest idempotent
   * ALREADY_MIGRATED refusal; a persisted version that is neither the
   * legacy pin nor the catalogue pin is never silently migrated. On
   * success the provenance (from-version, when) is durable state and the
   * history appends (append-only).
   */
  async migrateRequestApiVersion(input: {
    readonly connectionId: string;
    readonly targetApiVersion: string;
  }): Promise<
    | { readonly ok: true; readonly requestApiVersion: string }
    | { readonly ok: false; readonly refusal: StripeRequestApiVersionMigrationRefusal }
  > {
    const state = await this.stateOf(input.connectionId);
    if (input.targetApiVersion !== PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion) {
      return {
        ok: false,
        refusal: {
          kind: "UNKNOWN_TARGET",
          targetApiVersion: input.targetApiVersion,
          legalTargetApiVersion: PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion,
        },
      };
    }
    if (state.requestApiVersion === PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion) {
      return {
        ok: false,
        refusal: { kind: "ALREADY_MIGRATED", requestApiVersion: state.requestApiVersion },
      };
    }
    if (state.requestApiVersion !== PINNED_STRIPE_LEGACY_REQUEST_API_VERSION) {
      return {
        ok: false,
        refusal: {
          kind: "UNRECOGNIZED_CURRENT_VERSION",
          requestApiVersion: state.requestApiVersion,
        },
      };
    }
    const at = this.#nowIso();
    const next: StripeConnectionApiVersionState = Object.freeze({
      ...state,
      requestApiVersion: PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion,
      requestApiVersionMigratedFrom: PINNED_STRIPE_LEGACY_REQUEST_API_VERSION,
      requestApiVersionMigratedAt: at,
      history: Object.freeze([
        ...state.history,
        { at, cause: "REQUEST_API_VERSION_MIGRATED" as const, value: PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion },
      ]),
    });
    this.#states.set(input.connectionId, next);
    await this.#persist();
    return { ok: true, requestApiVersion: next.requestApiVersion };
  }

  /**
   * THE EXPLICIT REVERSAL (P26-C): migrate the connection BACK to the
   * legacy request pin. A separate verb by design (never a second legal
   * forward target): reverting a connection that never migrated is an
   * honest NOT_MIGRATED refusal naming the current version; only a
   * connection actually on the catalogue pin can revert. The history
   * appends the reversal (append-only); the migration provenance fields
   * reset because no migration is in force (the trail stays in history).
   */
  async revertRequestApiVersionToLegacy(input: {
    readonly connectionId: string;
  }): Promise<
    | { readonly ok: true; readonly requestApiVersion: string }
    | { readonly ok: false; readonly refusal: StripeRequestApiVersionMigrationRefusal }
  > {
    const state = await this.stateOf(input.connectionId);
    if (state.requestApiVersion !== PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion) {
      return {
        ok: false,
        refusal: { kind: "NOT_MIGRATED", requestApiVersion: state.requestApiVersion },
      };
    }
    const at = this.#nowIso();
    const next: StripeConnectionApiVersionState = Object.freeze({
      ...state,
      requestApiVersion: PINNED_STRIPE_LEGACY_REQUEST_API_VERSION,
      requestApiVersionMigratedFrom: null,
      requestApiVersionMigratedAt: null,
      history: Object.freeze([
        ...state.history,
        { at, cause: "REQUEST_API_VERSION_REVERTED" as const, value: PINNED_STRIPE_LEGACY_REQUEST_API_VERSION },
      ]),
    });
    this.#states.set(input.connectionId, next);
    await this.#persist();
    return { ok: true, requestApiVersion: next.requestApiVersion };
  }

  async recordCatalogueSurfaceUse(connectionId: string, catalogueRelease: string): Promise<void> {
    const state = await this.stateOf(connectionId);
    if (state.catalogueReleaseUsed === catalogueRelease) {
      return;
    }
    const at = this.#nowIso();
    const next: StripeConnectionApiVersionState = Object.freeze({
      ...state,
      catalogueReleaseUsed: catalogueRelease,
      catalogueReleaseUsedAt: at,
      // The request version is NOT touched: using the catalogue surface
      // records the release identity; the request pin migration is a
      // separate reviewed work item (ADR-0017 D2).
      history: Object.freeze([
        ...state.history,
        { at, cause: "CATALOGUE_SURFACE_USED" as const, value: catalogueRelease },
      ]),
    });
    this.#states.set(connectionId, next);
    await this.#persist();
  }

  /** Record an event-destination schema version (an INDEPENDENT fact). */
  async recordEventDestinationVersion(connectionId: string, apiVersion: string): Promise<void> {
    const state = await this.stateOf(connectionId);
    if (state.eventDestinationApiVersion === apiVersion) {
      return;
    }
    const at = this.#nowIso();
    const next: StripeConnectionApiVersionState = Object.freeze({
      ...state,
      eventDestinationApiVersion: apiVersion,
      history: Object.freeze([
        ...state.history,
        { at, cause: "EVENT_DESTINATION_VERSION_RECORDED" as const, value: apiVersion },
      ]),
    });
    this.#states.set(connectionId, next);
    await this.#persist();
  }
}

/** The expected catalogue release identity for provenance checks (the pin, as a release string). */
export function pinnedCatalogueReleaseIdentity(): string {
  return `${PINNED_STRIPE_CATALOGUE_PIN.releaseTag}@${PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion}`;
}

/** The catalogue pin API version — the ONLY legal migration target (P26-C). */
export function pinnedCatalogueRequestApiVersion(): string {
  return PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion;
}
