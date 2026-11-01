/**
 * PaySwap Desktop (P24-2, ADR-0017 D12) — the WEBHOOK-SECRET BROKER:
 * the per-endpoint `whsec_` sealing, INDEPENDENT of the API-key
 * credential broker (a separate storage-key namespace, the same laws).
 *
 * LAWS (the credential-broker precedent, applied to endpoint secrets):
 * - SEALED INDEPENDENTLY: a webhook signing secret is endpoint-scoped,
 *   never a connection credential — storage keys follow
 *   `payswap.stripe.webhook.<endpointId>.secret` (a namespace the
 *   connection broker never reads).
 * - OPAQUE HANDLES ONLY: the broker's public surface carries handle
 *   refs; material exists only inside the consumer, and the consumer's
 *   RESULT is escape-scanned (a leak THROWS — never sanitized).
 * - ROTATION WITH OVERLAP: a rotation seals the NEW secret and keeps
 *   the previous one valid until the overlap window elapses (Stripe
 *   sends both v1 signatures during rotation — the verifier accepts
 *   any listed v1 entry matching EITHER secret).
 * - DELETE IS REAL: deleting an endpoint's secret deletes the stored
 *   secrets AND drops the handle; a later use fails closed.
 * - NO LOGS; NO ECHOES: error messages carry shapes and reasons, never
 *   secret material (the whsec_ prefix class only).
 */

/** The minimal durable-secret store seam (the substrate credential service shape). */
export interface WebhookSecretStore {
  save(key: string, value: string): Promise<void>;
  load(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

/** The stored per-endpoint secret envelope (versioned for forward migration). */
interface WebhookSecretEnvelope {
  readonly version: 1;
  readonly current: string;
  /** The previous secret during a rotation overlap (null when none). */
  readonly previous: string | null;
  readonly previousRotatedAt: string | null;
  /** The overlap window end (ISO) — the previous secret expires at this instant. */
  readonly overlapUntil: string | null;
  readonly currentSealedAt: string;
}

/** The broker's typed errors (fail-closed). */
export type WebhookSecretBrokerErrorKind =
  | "MALFORMED_SECRET"
  | "UNKNOWN_ENDPOINT"
  | "STORAGE_FAILED";

export class WebhookSecretBrokerError extends Error {
  constructor(
    readonly kind: WebhookSecretBrokerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "WebhookSecretBrokerError";
  }
}

/** The whsec_ structural shape (prefix + payload — a bare prefix is not a secret). */
const WHSEC_PATTERN = /^whsec_[A-Za-z0-9]{16,}$/;

/** The default rotation overlap window (24 hours — Stripe's dual-signature practice). */
export const DEFAULT_WEBHOOK_SECRET_OVERLAP_MS = 24 * 60 * 60 * 1000;

/** What the broker records about one endpoint's secret (metadata only — never the secret). */
export interface WebhookSecretMetadata {
  readonly endpointId: string;
  readonly currentSealedAt: string;
  readonly previousRotatedAt: string | null;
  readonly overlapUntil: string | null;
}

/** The per-endpoint webhook-secret broker. */
export class StripeWebhookSecretBroker {
  readonly #store: WebhookSecretStore;
  readonly #nowIso: () => string;
  readonly #overlapMs: number;
  readonly #metadata = new Map<string, WebhookSecretMetadata>();

  constructor(input: {
    readonly store: WebhookSecretStore;
    readonly nowIso: () => string;
    readonly overlapMs?: number;
  }) {
    this.#store = input.store;
    this.#nowIso = input.nowIso;
    this.#overlapMs = input.overlapMs ?? DEFAULT_WEBHOOK_SECRET_OVERLAP_MS;
  }

  static storageKeyOf(endpointId: string): string {
    return `payswap.stripe.webhook.${endpointId}.secret`;
  }

  /**
   * Seal the endpoint's (first or rotated) signing secret. Structural
   * whsec_ shape enforced fail-closed; the envelope persists durably;
   * a ROTATION (an existing current secret) keeps the previous secret
   * valid for the overlap window.
   */
  async seal(input: {
    readonly endpointId: string;
    readonly secret: string;
  }): Promise<WebhookSecretMetadata> {
    if (typeof input.secret !== "string" || !WHSEC_PATTERN.test(input.secret)) {
      throw new WebhookSecretBrokerError(
        "MALFORMED_SECRET",
        "the webhook signing secret does not carry the canonical whsec_ shape (prefix + payload; never echoed)",
      );
    }
    const previous = await this.#loadEnvelope(input.endpointId);
    const now = this.#nowIso();
    const envelope: WebhookSecretEnvelope = {
      version: 1,
      current: input.secret,
      previous: previous?.current ?? null,
      previousRotatedAt: previous !== null ? now : null,
      overlapUntil: previous !== null ? new Date(Date.parse(now) + this.#overlapMs).toISOString() : null,
      currentSealedAt: now,
    };
    try {
      await this.#store.save(StripeWebhookSecretBroker.storageKeyOf(input.endpointId), JSON.stringify(envelope));
    } catch {
      throw new WebhookSecretBrokerError(
        "STORAGE_FAILED",
        `the secret store refused the sealed write for webhook endpoint ${input.endpointId}`,
      );
    }
    const metadata: WebhookSecretMetadata = Object.freeze({
      endpointId: input.endpointId,
      currentSealedAt: envelope.currentSealedAt,
      previousRotatedAt: envelope.previousRotatedAt,
      overlapUntil: envelope.overlapUntil,
    });
    this.#metadata.set(input.endpointId, metadata);
    return metadata;
  }

  async #loadEnvelope(endpointId: string): Promise<WebhookSecretEnvelope | null> {
    let raw: string | null;
    try {
      raw = await this.#store.load(StripeWebhookSecretBroker.storageKeyOf(endpointId));
    } catch {
      throw new WebhookSecretBrokerError(
        "STORAGE_FAILED",
        `the secret store could not read the sealed webhook secret for endpoint ${endpointId}`,
      );
    }
    if (raw === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<WebhookSecretEnvelope>;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        parsed.version !== 1 ||
        typeof parsed.current !== "string"
      ) {
        throw new Error("shape");
      }
      return parsed as WebhookSecretEnvelope;
    } catch {
      throw new WebhookSecretBrokerError(
        "MALFORMED_SECRET",
        `the sealed webhook-secret envelope for endpoint ${endpointId} failed its structural validation`,
      );
    }
  }

  /**
   * The LIVE secrets for an endpoint, inside the consumer: the current
   * secret plus the previous one while the rotation overlap window is
   * open. The consumer's RESULT is escape-scanned — a secret in the
   * result THROWS (fail-closed, never sanitized).
   */
  async withSecrets<T>(
    endpointId: string,
    consumer: (secrets: readonly string[]) => T,
    context: string,
  ): Promise<Awaited<T>> {
    const envelope = await this.#loadEnvelope(endpointId);
    if (envelope === null) {
      throw new WebhookSecretBrokerError(
        "UNKNOWN_ENDPOINT",
        `no sealed webhook signing secret exists for endpoint ${endpointId} (context: ${context})`,
      );
    }
    const secrets: string[] = [envelope.current];
    if (
      envelope.previous !== null &&
      envelope.overlapUntil !== null &&
      Date.parse(envelope.overlapUntil) > Date.parse(this.#nowIso())
    ) {
      secrets.push(envelope.previous);
    }
    const result = consumer(Object.freeze(secrets)) as T | Promise<Awaited<T>>;
    const resolved =
      result !== null &&
      typeof result === "object" &&
      typeof (result as { then?: unknown }).then === "function"
        ? await (result as Promise<Awaited<T>>)
        : (result as Awaited<T>);
    for (const secret of secrets) {
      if (typeof resolved === "string" ? resolved.includes(secret) : JSON.stringify(resolved)?.includes(secret)) {
        throw new WebhookSecretBrokerError(
          "MALFORMED_SECRET",
          `a sealed webhook secret leaked through the consumer result (context: ${context}) — the result is refused, never sanitized`,
        );
      }
    }
    return resolved;
  }

  /** Delete the endpoint's sealed secret(s) — the deletion path is REAL. */
  async delete(endpointId: string): Promise<void> {
    try {
      await this.#store.delete(StripeWebhookSecretBroker.storageKeyOf(endpointId));
    } catch {
      throw new WebhookSecretBrokerError(
        "STORAGE_FAILED",
        `the secret store refused the delete for webhook endpoint ${endpointId} (deletion did not complete)`,
      );
    }
    this.#metadata.delete(endpointId);
  }

  /** Metadata for an endpoint (audit surface — never the secret). */
  metadataOf(endpointId: string): WebhookSecretMetadata | null {
    return this.#metadata.get(endpointId) ?? null;
  }
}
