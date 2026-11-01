/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the WEBHOOK DESTINATION
 * AUTHORITY: host-controlled event-destination registration/deletion
 * WITH APPROVAL, per-endpoint `whsec_` sealed independently, and the
 * event-destination schema version recorded as an INDEPENDENT fact.
 *
 * THE APPROVAL LAW (handoff §8/D12): destination registration and
 * deletion are HOST-CONTROLLED mutations of security-relevant
 * configuration (the overlay classifies webhook_endpoints operations
 * PERMISSION_OR_CREDENTIAL_ADMIN / REAUTH). The flow is the
 * prepared-action discipline in miniature:
 *
 *   proposeRegistration (host mints endpointId + digest; no secret)
 *   → approveRegistration (host mints a single-use, expiring,
 *     digest-bound approval artifact — a model can reference it, never
 *     mint or supply a valid one)
 *   → completeRegistration (consumes the approval; seals the whsec_;
 *     records the event-destination version as an independent fact)
 *   → proposeDeletion → deleteDestination (the confirmed digest must
 *     equal the digest of the CURRENT destination binding — any change
 *     between preview and deletion refuses; the sealed secret is REALLY
 *     deleted).
 *
 * HONESTY: `providerEndpointId` is null until a provider-side
 * registration is confirmed through the real transport (a P24-D
 * integration through the prepared-action executor); the record never
 * claims a Stripe endpoint id it does not have. Event subscriptions
 * are the operator's minimal, purpose-driven set — never "everything".
 */

import type { StripeWebhookSecretBroker } from "./webhook-secret-broker.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";
import {
  destinationDigestOf,
  isValidStripeDestinationApproval,
  isValidWebhookDestinationRecord,
  type DestinationSnapshot,
  type EventDestinationVersionRecorder,
  type StripeDestinationApproval,
  type StripeDestinationRefusal,
  type StripeWebhookDestinationRecord,
  type WebhookDestinationFileSystem,
} from "./webhook-destination-records.js";

/** The record/approval shapes re-exported for the original import surface. */
export type {
  DestinationSnapshot,
  EventDestinationVersionRecorder,
  StripeDestinationApproval,
  StripeDestinationRefusal,
  StripeWebhookDestinationRecord,
  WebhookDestinationFileSystem,
} from "./webhook-destination-records.js";

const SNAPSHOT_FILE = "stripe-webhook-destinations.json";
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const EVENT_TYPE_PATTERN = /^[a-z0-9_.]+$/;

/** One in-flight registration proposal (host state; no secrets). */
interface RegistrationProposal {
  readonly connectionId: string;
  readonly url: string;
  readonly description: string;
  readonly enabledEventTypes: readonly string[];
  readonly eventApiVersion: string;
  readonly digest: string;
  readonly expiresAt: string;
}

/** The webhook destination authority. */
export class StripeWebhookDestinationAuthority {
  readonly #secretBroker: StripeWebhookSecretBroker;
  readonly #fileSystem: WebhookDestinationFileSystem;
  readonly #directory: string;
  readonly #nowIso: () => string;
  readonly #createId: () => string;
  readonly #versionRecorder: EventDestinationVersionRecorder | null;
  readonly #destinations = new Map<string, StripeWebhookDestinationRecord>();
  readonly #approvals = new Map<string, StripeDestinationApproval>();
  readonly #proposals = new Map<string, RegistrationProposal>();

  constructor(input: {
    readonly secretBroker: StripeWebhookSecretBroker;
    readonly fileSystem: WebhookDestinationFileSystem;
    readonly directory: string;
    readonly nowIso: () => string;
    readonly createId: () => string;
    readonly versionRecorder?: EventDestinationVersionRecorder;
  }) {
    this.#secretBroker = input.secretBroker;
    this.#fileSystem = input.fileSystem;
    this.#directory = input.directory;
    this.#nowIso = input.nowIso;
    this.#createId = input.createId;
    this.#versionRecorder = input.versionRecorder ?? null;
  }

  /** Load persisted destinations + approvals (absent/corrupt → honest empty start). */
  async load(): Promise<void> {
    try {
      const raw = await this.#fileSystem.readFile(this.#path());
      const parsed = JSON.parse(raw) as Partial<DestinationSnapshot>;
      if (parsed !== null && typeof parsed === "object" && parsed.version === 1) {
        for (const candidate of parsed.destinations ?? []) {
          if (isValidWebhookDestinationRecord(candidate)) {
            this.#destinations.set(candidate.endpointId, candidate);
          }
        }
        for (const candidate of parsed.approvals ?? []) {
          if (isValidStripeDestinationApproval(candidate)) {
            this.#approvals.set(candidate.approvalId, candidate);
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
    assertNoStripeSecretShapes(
      { approvals: [...this.#approvals.values()], destinations: [...this.#destinations.values()] },
      "the webhook destination snapshot",
    );
    const snapshot: DestinationSnapshot = {
      version: 1,
      destinations: [...this.#destinations.values()],
      approvals: [...this.#approvals.values()],
    };
    await this.#fileSystem.mkdir(this.#directory);
    await this.#fileSystem.writeFile(this.#path(), JSON.stringify(snapshot, null, 2));
  }

  /** Step 1: propose a registration (host mints the endpointId + the binding digest; no secret). */
  async proposeRegistration(input: {
    readonly connectionId: string;
    readonly url: string;
    readonly description: string;
    readonly enabledEventTypes: readonly string[];
    readonly eventApiVersion: string;
  }): Promise<
    | { readonly ok: true; readonly proposal: { readonly endpointId: string; readonly digest: string; readonly expiresAt: string } }
    | { readonly ok: false; readonly refusal: StripeDestinationRefusal }
  > {
    if (typeof input.url !== "string" || !/^https:\/\/[^\s]+$/.test(input.url)) {
      return { ok: false, refusal: { kind: "MALFORMED_URL" } };
    }
    if (!Array.isArray(input.enabledEventTypes) || input.enabledEventTypes.length === 0) {
      return { ok: false, refusal: { kind: "EMPTY_EVENT_TYPES" } };
    }
    for (const eventType of input.enabledEventTypes) {
      if (typeof eventType !== "string" || !EVENT_TYPE_PATTERN.test(eventType)) {
        return { ok: false, refusal: { kind: "MALFORMED_EVENT_TYPE", value: String(eventType) } };
      }
    }
    const endpointId = `stripe-wh:${this.#createId()}`;
    const digest = destinationDigestOf({ kind: "REGISTRATION", endpointId, ...input });
    const proposal: RegistrationProposal = Object.freeze({
      connectionId: input.connectionId,
      url: input.url,
      description: input.description,
      enabledEventTypes: Object.freeze([...new Set(input.enabledEventTypes)]),
      eventApiVersion: input.eventApiVersion,
      digest,
      expiresAt: new Date(Date.parse(this.#nowIso()) + APPROVAL_TTL_MS).toISOString(),
    });
    this.#proposals.set(endpointId, proposal);
    return { ok: true, proposal: { endpointId, digest, expiresAt: proposal.expiresAt } };
  }

  /** Step 2: approve (host mints the single-use, digest-bound, expiring approval artifact). */
  async approveRegistration(input: {
    readonly endpointId: string;
    readonly principalId: string;
    readonly confirmedDigest: string;
  }): Promise<
    | { readonly ok: true; readonly approval: StripeDestinationApproval }
    | { readonly ok: false; readonly refusal: StripeDestinationRefusal }
  > {
    // The registered state FIRST: a completed endpoint is registered no
    // matter what happened to its (consumed and deleted) proposal.
    if (this.#destinations.get(input.endpointId)?.status === "SEALED") {
      return { ok: false, refusal: { kind: "ALREADY_REGISTERED" } };
    }
    const proposal = this.#proposals.get(input.endpointId);
    if (proposal === undefined) {
      return { ok: false, refusal: { kind: "UNKNOWN_ENDPOINT" } };
    }
    if (Date.parse(proposal.expiresAt) <= Date.parse(this.#nowIso())) {
      return { ok: false, refusal: { kind: "EXPIRED" } };
    }
    // THE DIGEST LAW: the confirmed digest must equal the proposal's.
    if (input.confirmedDigest !== proposal.digest) {
      return { ok: false, refusal: { kind: "DIGEST_MISMATCH" } };
    }
    const approval: StripeDestinationApproval = Object.freeze({
      approvalId: `stripe-wh-approval:${this.#createId()}`,
      endpointId: input.endpointId,
      kind: "REGISTRATION",
      approvedDigest: proposal.digest,
      approvedByPrincipalId: input.principalId,
      consumedAt: null,
      expiresAt: proposal.expiresAt,
    });
    this.#approvals.set(approval.approvalId, approval);
    await this.#persist();
    return { ok: true, approval };
  }

  /** Step 3: complete the registration (consume the approval; seal the whsec_). */
  async completeRegistration(input: {
    readonly approvalId: string;
    readonly whsec: string;
    readonly confirmedDigest: string;
  }): Promise<
    | { readonly ok: true; readonly destination: StripeWebhookDestinationRecord }
    | { readonly ok: false; readonly refusal: StripeDestinationRefusal }
  > {
    const approval = this.#approvals.get(input.approvalId);
    if (approval === undefined || approval.kind !== "REGISTRATION" || approval.consumedAt !== null) {
      return { ok: false, refusal: { kind: "APPROVAL_CONSUMED" } };
    }
    if (Date.parse(approval.expiresAt) <= Date.parse(this.#nowIso())) {
      return { ok: false, refusal: { kind: "EXPIRED" } };
    }
    // The digest triangle: approval ↔ confirmed digest ↔ live proposal.
    if (input.confirmedDigest !== approval.approvedDigest) {
      return { ok: false, refusal: { kind: "DIGEST_MISMATCH" } };
    }
    const proposal = this.#proposals.get(approval.endpointId);
    if (proposal === undefined || proposal.digest !== approval.approvedDigest) {
      return { ok: false, refusal: { kind: "DIGEST_MISMATCH" } };
    }
    const metadata = await this.#secretBroker.seal({
      endpointId: approval.endpointId,
      secret: input.whsec,
    });
    this.#approvals.set(approval.approvalId, { ...approval, consumedAt: this.#nowIso() });
    this.#proposals.delete(approval.endpointId);
    const destination: StripeWebhookDestinationRecord = Object.freeze({
      endpointId: approval.endpointId,
      connectionId: proposal.connectionId,
      url: proposal.url,
      description: proposal.description,
      enabledEventTypes: proposal.enabledEventTypes,
      eventApiVersion: proposal.eventApiVersion,
      status: "SEALED",
      providerEndpointId: null,
      registeredAt: metadata.currentSealedAt,
      createdByPrincipalId: approval.approvedByPrincipalId,
      approvedDigest: approval.approvedDigest,
      deletedAt: null,
      deletedByPrincipalId: null,
    });
    this.#destinations.set(destination.endpointId, destination);
    await this.#persist();
    // The event-destination schema version is an INDEPENDENT fact —
    // recorded beside the connection's API-version state, never
    // rewritten by a request-version change (ADR-0017 D2).
    await this.#versionRecorder?.recordEventDestinationVersion(
      destination.connectionId,
      destination.eventApiVersion,
    );
    return { ok: true, destination };
  }

  /** Deletion preview: the digest of the CURRENT destination binding. */
  async proposeDeletion(input: {
    readonly endpointId: string;
  }): Promise<
    | { readonly ok: true; readonly digest: string }
    | { readonly ok: false; readonly refusal: StripeDestinationRefusal }
  > {
    const destination = this.#destinations.get(input.endpointId);
    if (destination === undefined || destination.status === "DELETED") {
      return { ok: false, refusal: { kind: "UNKNOWN_ENDPOINT" } };
    }
    return { ok: true, digest: this.#deletionDigestOf(destination) };
  }

  #deletionDigestOf(destination: StripeWebhookDestinationRecord): string {
    return destinationDigestOf({
      kind: "DELETION",
      endpointId: destination.endpointId,
      connectionId: destination.connectionId,
      url: destination.url,
      enabledEventTypes: destination.enabledEventTypes,
      eventApiVersion: destination.eventApiVersion,
    });
  }

  /** Deletion: the confirmed digest must equal the CURRENT binding's — then the secret is REALLY deleted. */
  async deleteDestination(input: {
    readonly endpointId: string;
    readonly principalId: string;
    readonly confirmedDigest: string;
  }): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly refusal: StripeDestinationRefusal }
  > {
    const destination = this.#destinations.get(input.endpointId);
    if (destination === undefined || destination.status === "DELETED") {
      return { ok: false, refusal: { kind: "UNKNOWN_ENDPOINT" } };
    }
    if (input.confirmedDigest !== this.#deletionDigestOf(destination)) {
      return { ok: false, refusal: { kind: "DIGEST_MISMATCH" } };
    }
    await this.#secretBroker.delete(input.endpointId);
    this.#destinations.set(input.endpointId, {
      ...destination,
      status: "DELETED",
      deletedAt: this.#nowIso(),
      deletedByPrincipalId: input.principalId,
    });
    await this.#persist();
    return { ok: true };
  }

  /** Record the provider-confirmed endpoint id (never claimed before the provider confirms). */
  async recordProviderEndpoint(input: {
    readonly endpointId: string;
    readonly providerEndpointId: string;
  }): Promise<StripeWebhookDestinationRecord | null> {
    const destination = this.#destinations.get(input.endpointId);
    if (destination === undefined || destination.status === "DELETED") {
      return null;
    }
    if (!/^we_[A-Za-z0-9]+$/.test(input.providerEndpointId)) {
      return null;
    }
    const updated: StripeWebhookDestinationRecord = {
      ...destination,
      providerEndpointId: input.providerEndpointId,
    };
    this.#destinations.set(input.endpointId, updated);
    await this.#persist();
    return updated;
  }

  /** The destinations of one connection (views; secret-free). */
  destinationsOf(connectionId: string): readonly StripeWebhookDestinationRecord[] {
    return Object.freeze(
      [...this.#destinations.values()].filter(
        (destination) => destination.connectionId === connectionId,
      ),
    );
  }

  /** One destination (the inbox's read). */
  destinationOf(endpointId: string): StripeWebhookDestinationRecord | null {
    return this.#destinations.get(endpointId) ?? null;
  }
}
