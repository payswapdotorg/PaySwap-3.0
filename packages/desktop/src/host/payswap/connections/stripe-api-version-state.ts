/**
 * PaySwap Desktop (P24-2, ADR-0017 D2 — the migration law) — the
 * PER-CONNECTION STRIPE API-VERSION STATE: the durable record of which
 * Stripe API version each connection's requests carry, which catalogue
 * release the NEW surface used, and each event destination's schema
 * version.
 *
 * THE LAW (ADR-0017 D2, BINDING):
 * - the legacy request pin '2025-08-27.basil' is NOT changed — it is
 *   per-connection STATE, never a silently swapped global; there is NO
 *   verb here that changes it (the tested old→catalogue migration is a
 *   separate reviewed work item);
 * - the catalogue version (2026-09-30.endive via the pinned release)
 *   is RECORDED per connection when the new census surface is used;
 * - an event-destination schema version is an INDEPENDENT fact — it is
 *   never rewritten by a request-version change;
 * - every update appends to a monotonic history (append-only; the
 *   current values are projections of the last append per field).
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
    | "EVENT_DESTINATION_VERSION_RECORDED";
  /** The value this entry records for its cause (never a secret). */
  readonly value: string;
}

/** The per-connection API-version state (the durable truth). */
export interface StripeConnectionApiVersionState {
  readonly connectionId: string;
  /** The request API version this connection's requests carry (the legacy pin by default). */
  readonly requestApiVersion: string;
  /** The pinned catalogue release recorded when the NEW surface was used (null until then). */
  readonly catalogueReleaseUsed: string | null;
  readonly catalogueReleaseUsedAt: string | null;
  /** The event-destination schema version (an INDEPENDENT fact — never rewritten by request-version changes). */
  readonly eventDestinationApiVersion: string | null;
  readonly history: readonly StripeApiVersionHistoryEntry[];
}

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
        entry.cause !== "EVENT_DESTINATION_VERSION_RECORDED") ||
      typeof entry.value !== "string"
    ) {
      continue;
    }
    history.push({ at: entry.at, cause: entry.cause, value: entry.value });
  }
  return {
    connectionId: record.connectionId,
    requestApiVersion: record.requestApiVersion,
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
    // THE MIGRATION LAW: this always answers the connection's recorded
    // request version (the legacy pin until a reviewed migration
    // verb exists — none does in this release).
    return (await this.stateOf(connectionId)).requestApiVersion;
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
