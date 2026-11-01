/**
 * PaySwap Desktop (P24-2, ADR-0017 D5/D7 + handoff §2.3/§7/§13.2) — the
 * RAK OPERATION-LEVEL PERMISSION BINDING: the connection-side mapping
 * of a Restricted API Key's permission scopes to per-operation
 * eligibility, with the withdrawal/re-probe loop.
 *
 * LAWS:
 * - DECLARED, NEVER SNIFFED: Stripe restricted keys do not expose
 *   their permission set through the API (the capabilities.ts law).
 *   The connection carries a DECLARED scope map (the exact permission
 *   strings the user granted in the Stripe dashboard); actual key
 *   validation is ALWAYS the verification probe — never string
 *   heuristics alone. Eligibility = declared rule satisfaction +
 *   census support state + no withdrawal observation.
 * - EXACT PERMISSION: the overlay's requiredPermissionRule must be an
 *   EXACT member of the declared set (no inference: a "Customers:
 *   Write" grant does not silently imply "Customers: Read" — fail
 *   closed, handoff §13.2 "restricted key lacking exact permission
 *   cannot dispatch").
 * - WITHDRAWAL: a dispatched operation the provider rejects with 403
 *   records a withdrawal observation that removes the operation from
 *   the exposed set until the scopes are refreshed (re-declared).
 *   A key-rejected probe removes EVERYTHING (the key is dead).
 * - THE IN-SEAL GRANT: deriveDispatchGrant re-derives from the actual
 *   material + environment + the declared map — pk_ refused as a
 *   server-side secret; sk_org_ refused (organization keys are out of
 *   scope, ADR-0017 D5); whsec_ refused (an endpoint signing secret is
 *   not an API key); INV-25 mode binding enforced; a RESTRICTED key
 *   grants ONLY from its declared scopes; a FULL test key (the P14-A
 *   accepted SANDBOX slice) is unrestricted by definition.
 */

import type { StripeActionPermissionPort, StripeOperationCensusPort } from "../stripe/action-seams.js";
import { assertNoStripeSecretShapes, parsePinnedStripePermission } from "../stripe/stripe-pins.js";
import { deriveStripeDispatchGrant } from "./stripe-grant-derivation.js";

/** The injected fs seam (the workspace-store shape). */
export interface StripeRakFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The declared scope map of one connection (host state, secret-free). */
export interface StripeRakScopeDeclaration {
  readonly connectionId: string;
  /** The EXACT Stripe permission strings declared granted (e.g. "Customers: Write"). */
  readonly declaredPermissions: readonly string[];
  readonly declaredAt: string;
  readonly declaredByPrincipalId: string;
}

/** One permission/key observation from real provider evidence. */
export interface StripePermissionObservation {
  readonly connectionId: string;
  readonly operationId: string;
  readonly kind: "PERMISSION_DENIED" | "KEY_REJECTED";
  readonly observedAt: string;
  readonly httpStatus: number | null;
  readonly providerErrorCode: string | null;
}

/** The typed scope-declaration refusal. */
export type StripeScopeDeclarationRefusal =
  | { readonly kind: "MALFORMED_PERMISSION"; readonly value: string }
  | { readonly kind: "EMPTY_DECLARATION" }
  | { readonly kind: "SECRET_SHAPED_DECLARATION" };

interface BindingSnapshot {
  readonly version: 1;
  readonly declarations: readonly StripeRakScopeDeclaration[];
  readonly observations: readonly StripePermissionObservation[];
}

const SNAPSHOT_FILE = "stripe-rak-permissions.json";

/**
 * The RAK permission binding service (implements the executor's
 * permission port). Compose ONCE at the edge; every mutation persists
 * atomically (write-then-ack, the record-store law).
 */
export class StripeRakPermissionBinding implements StripeActionPermissionPort {
  readonly #census: StripeOperationCensusPort;
  readonly #fileSystem: StripeRakFileSystem;
  readonly #directory: string;
  readonly #declarations = new Map<string, StripeRakScopeDeclaration>();
  readonly #observations: StripePermissionObservation[] = [];
  readonly #nowIso: () => string;

  constructor(input: {
    readonly census: StripeOperationCensusPort;
    readonly fileSystem: StripeRakFileSystem;
    readonly directory: string;
    readonly nowIso: () => string;
  }) {
    this.#census = input.census;
    this.#fileSystem = input.fileSystem;
    this.#directory = input.directory;
    this.#nowIso = input.nowIso;
  }

  /** Load the persisted binding state (absent/corrupt → honest empty start). */
  async load(): Promise<void> {
    try {
      const raw = await this.#fileSystem.readFile(this.#path());
      const parsed = JSON.parse(raw) as Partial<BindingSnapshot>;
      if (parsed !== null && typeof parsed === "object" && parsed.version === 1) {
        for (const candidate of parsed.declarations ?? []) {
          if (this.#parseDeclaration(candidate) !== null) {
            this.#declarations.set(candidate.connectionId, candidate);
          }
        }
        for (const candidate of parsed.observations ?? []) {
          if (this.#observationValid(candidate)) {
            this.#observations.push(candidate);
          }
        }
      }
    } catch {
      // Absent or corrupt: start empty (per-record quarantine posture).
    }
  }

  #parseDeclaration(candidate: unknown): StripeRakScopeDeclaration | null {
    if (candidate === null || typeof candidate !== "object") {
      return null;
    }
    const record = candidate as Partial<StripeRakScopeDeclaration>;
    if (
      typeof record.connectionId !== "string" ||
      record.connectionId.length === 0 ||
      !Array.isArray(record.declaredPermissions) ||
      typeof record.declaredAt !== "string" ||
      typeof record.declaredByPrincipalId !== "string"
    ) {
      return null;
    }
    return {
      connectionId: record.connectionId,
      declaredPermissions: Object.freeze([...record.declaredPermissions]),
      declaredAt: record.declaredAt,
      declaredByPrincipalId: record.declaredByPrincipalId,
    };
  }

  #observationValid(candidate: unknown): candidate is StripePermissionObservation {
    if (candidate === null || typeof candidate !== "object") {
      return false;
    }
    const record = candidate as Partial<StripePermissionObservation>;
    return (
      typeof record.connectionId === "string" &&
      typeof record.operationId === "string" &&
      (record.kind === "PERMISSION_DENIED" || record.kind === "KEY_REJECTED") &&
      typeof record.observedAt === "string" &&
      (record.httpStatus === null || typeof record.httpStatus === "number") &&
      (record.providerErrorCode === null || typeof record.providerErrorCode === "string")
    );
  }

  #path(): string {
    return `${this.#directory.replace(/\/+$/, "")}/${SNAPSHOT_FILE}`;
  }

  async #persist(): Promise<void> {
    assertNoStripeSecretShapes(
      { declarations: [...this.#declarations.values()], observations: this.#observations },
      "the RAK permission binding snapshot",
    );
    const snapshot: BindingSnapshot = {
      version: 1,
      declarations: [...this.#declarations.values()],
      observations: [...this.#observations],
    };
    await this.#fileSystem.mkdir(this.#directory);
    await this.#fileSystem.writeFile(this.#path(), JSON.stringify(snapshot, null, 2));
  }

  /**
   * (Re-)declare a connection's RAK scopes. Fail-closed on permission
   * strings outside the Stripe grammar, empty declarations and
   * secret-shaped values. A re-declaration is the SCOPE REFRESH: it
   * clears the connection's withdrawal observations (the user re-states
   * what the key can do after changing it in the Stripe dashboard).
   */
  async declareScopes(input: {
    readonly connectionId: string;
    readonly permissions: readonly string[];
    readonly principalId: string;
  }): Promise<{ readonly ok: true; readonly declaration: StripeRakScopeDeclaration } | { readonly ok: false; readonly refusal: StripeScopeDeclarationRefusal }> {
    if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
      return { ok: false, refusal: { kind: "EMPTY_DECLARATION" } };
    }
    // THE SECRET SCAN FIRST (fail-closed on the severe issue before any
    // classification): a credential-shaped value is refused as a leak —
    // never classified as a mere grammar error (handoff §13.2: the scan
    // covers nested serialized structures and key prefixes).
    try {
      assertNoStripeSecretShapes([...input.permissions], "a RAK scope declaration");
    } catch {
      return { ok: false, refusal: { kind: "SECRET_SHAPED_DECLARATION" } };
    }
    const seen = new Set<string>();
    for (const permission of input.permissions) {
      if (typeof permission !== "string" || parsePinnedStripePermission(permission) === null) {
        return { ok: false, refusal: { kind: "MALFORMED_PERMISSION", value: String(permission) } };
      }
      if (seen.has(permission)) {
        continue;
      }
      seen.add(permission);
    }
    const declaration: StripeRakScopeDeclaration = Object.freeze({
      connectionId: input.connectionId,
      declaredPermissions: Object.freeze([...seen]),
      declaredAt: this.#nowIso(),
      declaredByPrincipalId: input.principalId,
    });
    this.#declarations.set(input.connectionId, declaration);
    // The scope refresh clears the connection's observations (the
    // withdrawal loop re-arms only on fresh provider evidence).
    for (let index = this.#observations.length - 1; index >= 0; index -= 1) {
      if (this.#observations[index]!.connectionId === input.connectionId) {
        this.#observations.splice(index, 1);
      }
    }
    await this.#persist();
    return { ok: true, declaration };
  }

  /** The declared permission set of one connection (empty when never declared). */
  declaredScopesOf(connectionId: string): readonly string[] {
    return this.#declarations.get(connectionId)?.declaredPermissions ?? [];
  }

  /** Record a dispatch-time provider rejection (the withdrawal loop). */
  async recordDispatchObservation(input: {
    readonly connectionId: string;
    readonly operationId: string;
    readonly httpStatus: number;
    readonly providerErrorCode: string | null;
  }): Promise<void> {
    if (input.httpStatus !== 403 && input.httpStatus !== 401) {
      return;
    }
    this.#observations.push({
      connectionId: input.connectionId,
      operationId: input.operationId,
      kind: input.httpStatus === 401 ? "KEY_REJECTED" : "PERMISSION_DENIED",
      observedAt: this.#nowIso(),
      httpStatus: input.httpStatus,
      providerErrorCode: input.providerErrorCode,
    });
    await this.#persist();
  }

  /** Record a probe-time key rejection (a dead key removes everything). */
  async recordKeyRejected(connectionId: string): Promise<void> {
    this.#observations.push({
      connectionId,
      operationId: "*",
      kind: "KEY_REJECTED",
      observedAt: this.#nowIso(),
      httpStatus: 401,
      providerErrorCode: null,
    });
    await this.#persist();
  }

  /** Clear key-rejection observations after a CONFIRMED re-probe (the key works again). */
  async clearKeyRejections(connectionId: string): Promise<void> {
    for (let index = this.#observations.length - 1; index >= 0; index -= 1) {
      const observation = this.#observations[index]!;
      if (observation.connectionId === connectionId && observation.kind === "KEY_REJECTED") {
        this.#observations.splice(index, 1);
      }
    }
    await this.#persist();
  }

  /** The observations currently bound to one connection (evidence surface). */
  observationsOf(connectionId: string): readonly StripePermissionObservation[] {
    return Object.freeze(this.#observations.filter((observation) => observation.connectionId === connectionId));
  }

  /** Is the operation exposed for the connection today? (The tool-registry read.) */
  #eligible(operationId: string, connectionId: string): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
    const operation = this.#census.resolve(operationId);
    if (operation === undefined) {
      return { ok: false, reason: `unknown catalogue operation '${operationId}' (DENY)` };
    }
    if (!this.#census.dispatchAllowed(operationId)) {
      return {
        ok: false,
        reason: `operation '${operationId}' has support state '${operation.supportState}' — only IMPLEMENTED-class operations are exposed`,
      };
    }
    const keyDead = this.#observations.some(
      (observation) => observation.connectionId === connectionId && observation.kind === "KEY_REJECTED",
    );
    if (keyDead) {
      return {
        ok: false,
        reason: "the connection's key was rejected by the provider (a re-probe that confirms is required before any operation is exposed)",
      };
    }
    const withdrawn = this.#observations.some(
      (observation) =>
        observation.connectionId === connectionId &&
        observation.operationId === operationId &&
        observation.kind === "PERMISSION_DENIED",
    );
    if (withdrawn) {
      return {
        ok: false,
        reason: `operation '${operationId}' was withdrawn by a 403 provider rejection — refresh the connection's declared RAK scopes to re-expose it`,
      };
    }
    const declared = this.#declarations.get(connectionId);
    if (declared === undefined) {
      return {
        ok: false,
        reason: "the connection carries no declared RAK scope map (declare the exact permissions granted to the restricted key first)",
      };
    }
    if (!declared.declaredPermissions.includes(operation.requiredPermissionRule)) {
      return {
        ok: false,
        reason: `the declared RAK scopes do not include the exact permission '${operation.requiredPermissionRule}' required by '${operationId}' (restricted key lacking exact permission cannot dispatch)`,
      };
    }
    return { ok: true };
  }

  async operationEligibility(input: {
    readonly connectionId: string;
    readonly operationId: string;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    return this.#eligible(input.operationId, input.connectionId);
  }

  /** The exposed-operation set (the re-probe recomputation the tool registry reads). */
  async exposedOperations(connectionId: string): Promise<readonly string[]> {
    const declared = this.#declarations.get(connectionId);
    if (declared === undefined) {
      return [];
    }
    const exposed: string[] = [];
    for (const operation of this.#census.enumerate()) {
      if (!declared.declaredPermissions.includes(operation.requiredPermissionRule)) {
        continue;
      }
      if (this.#eligible(operation.operationId, connectionId).ok && !exposed.includes(operation.operationId)) {
        exposed.push(operation.operationId);
      }
    }
    return Object.freeze(exposed.sort());
  }

  /** The INSIDE-THE-SEAL grant derivation (ADR-0008 law — never cached). */
  deriveDispatchGrant(input: {
    readonly apiKey: string;
    readonly connectionId: string;
    readonly environment: "SANDBOX" | "LIVE";
    readonly operationId: string;
    readonly requiredPermissionRule: string;
  }): { readonly ok: true; readonly keyClass: string } | { readonly ok: false; readonly reason: string } {
    return deriveStripeDispatchGrant({
      apiKey: input.apiKey,
      environment: input.environment,
      operationId: input.operationId,
      requiredPermissionRule: input.requiredPermissionRule,
      declaredPermissions: this.declaredScopesOf(input.connectionId),
    });
  }
}
