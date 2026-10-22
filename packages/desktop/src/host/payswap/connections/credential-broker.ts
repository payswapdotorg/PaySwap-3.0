/**
 * PaySwap Desktop (P13-B) — the DURABLE credential broker for provider
 * connections (ADR-0007 D4).
 *
 * Material enters EXACTLY ONCE through `sealStripeRestrictedKey`
 * (the U1 host-side key-entry verb) and is persisted immediately in
 * SEALED form through the substrate's ICredentialService (AES-256-GCM
 * at rest; the safeStorage migration path is the substrate's). Storage
 * keys follow the ADR law: `payswap.connection.<connectionId>.credential`.
 *
 * LAWS (violations are defects):
 * - OPAQUE HANDLES ONLY renderer-ward: the broker's public surface
 *   carries `credentialHandleRef` strings — never material, never the
 *   sealed payload, never the storage key of another connection.
 * - `withMaterial` is the ONLY unseal path: the consumer runs INSIDE
 *   the seal; its RESULT is escape-scanned (a leak THROWS, it is never
 *   silently sanitized) — the provider-runtime dispatch pattern.
 * - NO LOGS: the broker never logs (no logger exists here at all).
 * - DELETE IS REAL: revocation deletes the stored secret AND drops the
 *   in-memory reference; a later `withMaterial` on the deleted handle
 *   fails closed.
 */

import type { ICredentialService } from "@zcode/services";

/** The storage-key law (ADR-0007 D4). */
export function connectionCredentialStorageKey(connectionId: string): string {
  return `payswap.connection.${connectionId}.credential`;
}

/** The broker's typed errors (fail-closed; never a silent fallback). */
export type DurableCredentialBrokerErrorKind =
  | "UNKNOWN_HANDLE"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "MALFORMED_SEALED_PAYLOAD"
  | "MATERIALIZATION_REFUSED";

export class DurableCredentialBrokerError extends Error {
  constructor(
    readonly kind: DurableCredentialBrokerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DurableCredentialBrokerError";
  }
}

/** What the broker records about one sealed credential (metadata only). */
export interface SealedCredentialMetadata {
  readonly connectionId: string;
  readonly credentialKind: "API_KEY";
  readonly sealedAt: string;
  /** Number of secret strings sealed (audit surface — never the strings). */
  readonly secretCount: number;
}

/**
 * The sealed payload persisted through ICredentialService. The material
 * field is a JSON string; the envelope is versioned so a future cipher
 * migration can distinguish old records honestly (fail-closed on
 * unknown versions).
 */
interface SealedPayload {
  readonly version: 1;
  readonly materialJson: string;
  readonly metadata: SealedCredentialMetadata;
}

/** The consumer contract: runs inside the seal; the result is scanned. */
export type SealedMaterialConsumer<T> = (material: unknown) => T;

/** Extract the secret strings of a material value for the escape scan. */
function secretStringsOf(material: unknown): string[] {
  if (typeof material === "string") {
    return [material];
  }
  if (material === null || typeof material !== "object") {
    return [];
  }
  const strings: string[] = [];
  for (const value of Object.values(material as Record<string, unknown>)) {
    if (typeof value === "string" && value.length >= 8) {
      strings.push(value);
    }
  }
  return strings;
}

/** The durable broker over the substrate credential service. */
export class DurableConnectionCredentialBroker {
  readonly #credentialService: Pick<ICredentialService, "load" | "save" | "delete">;
  readonly #handles = new Map<string, SealedCredentialMetadata>();

  constructor(
    credentialService: Pick<ICredentialService, "load" | "save" | "delete">,
  ) {
    this.#credentialService = credentialService;
  }

  /**
   * Seal ONE credential for ONE connection (the U1 entry verb's core).
   * The material is validated by the CALLER (the Stripe key shape) before
   * this call; the broker persists the sealed envelope and returns the
   * opaque handle ref. Re-sealing an existing connection REPLACES the
   * stored secret (key rotation) and returns the same handle shape.
   */
  async sealApiKey(
    connectionId: string,
    apiKey: string,
    now: string,
  ): Promise<{ credentialHandleRef: string; sealedSecretCount: number }> {
    if (typeof connectionId !== "string" || connectionId.length === 0) {
      throw new DurableCredentialBrokerError(
        "MATERIALIZATION_REFUSED",
        "sealApiKey requires a non-empty connectionId",
      );
    }
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new DurableCredentialBrokerError(
        "MATERIALIZATION_REFUSED",
        "sealApiKey requires a non-empty key (the host-side secret field supplied nothing)",
      );
    }
    const metadata: SealedCredentialMetadata = {
      connectionId,
      credentialKind: "API_KEY",
      sealedAt: now,
      secretCount: 1,
    };
    const payload: SealedPayload = {
      version: 1,
      materialJson: JSON.stringify({ apiKey }),
      metadata,
    };
    try {
      await this.#credentialService.save(
        connectionCredentialStorageKey(connectionId),
        JSON.stringify(payload),
      );
    } catch {
      // The cause is deliberately not stringified into the error —
      // storage errors can echo fragments of the written payload.
      throw new DurableCredentialBrokerError(
        "STORAGE_WRITE_FAILED",
        `the credential store refused the sealed write for connection ${connectionId}`,
      );
    }
    const handle = `payswap-cred:${connectionId}`;
    this.#handles.set(handle, metadata);
    return { credentialHandleRef: handle, sealedSecretCount: metadata.secretCount };
  }

  /** Whether a handle is known to this broker instance. */
  knowsHandle(credentialHandleRef: string): boolean {
    return this.#handles.has(credentialHandleRef);
  }

  /**
   * Open the seal for ONE consumer (the provider-runtime dispatch
   * pattern): the material loads from durable storage, the consumer
   * runs, and the consumer's RESULT is deep-scanned for the sealed
   * secret strings — a leak THROWS (fail-closed, never sanitized).
   */
  async withMaterial<T>(
    credentialHandleRef: string,
    consumer: SealedMaterialConsumer<T>,
    context: string,
  ): Promise<Awaited<T>> {
    const metadata = this.#handles.get(credentialHandleRef);
    if (metadata === undefined) {
      throw new DurableCredentialBrokerError(
        "UNKNOWN_HANDLE",
        `the credential handle is not registered in this broker (context: ${context})`,
      );
    }
    let raw: string | null;
    try {
      raw = await this.#credentialService.load(
        connectionCredentialStorageKey(metadata.connectionId),
      );
    } catch {
      throw new DurableCredentialBrokerError(
        "STORAGE_READ_FAILED",
        `the credential store could not read the sealed payload for connection ${metadata.connectionId}`,
      );
    }
    if (raw === null) {
      throw new DurableCredentialBrokerError(
        "UNKNOWN_HANDLE",
        `the sealed credential for connection ${metadata.connectionId} no longer exists (deleted or never persisted)`,
      );
    }
    let payload: SealedPayload;
    try {
      const parsed = JSON.parse(raw) as Partial<SealedPayload>;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        parsed.version !== 1 ||
        typeof parsed.materialJson !== "string" ||
        parsed.metadata?.connectionId !== metadata.connectionId
      ) {
        throw new Error("shape");
      }
      payload = parsed as SealedPayload;
    } catch {
      throw new DurableCredentialBrokerError(
        "MALFORMED_SEALED_PAYLOAD",
        `the sealed payload for connection ${metadata.connectionId} failed its structural validation`,
      );
    }
    let material: unknown;
    try {
      material = JSON.parse(payload.materialJson);
    } catch {
      throw new DurableCredentialBrokerError(
        "MALFORMED_SEALED_PAYLOAD",
        `the sealed material for connection ${metadata.connectionId} could not be parsed`,
      );
    }
    const secrets = secretStringsOf(material);
    const result = consumer(material) as T | Promise<Awaited<T>>;
    const resolved =
      result !== null &&
      typeof result === "object" &&
      typeof (result as { then?: unknown }).then === "function"
        ? await (result as Promise<Awaited<T>>)
        : (result as Awaited<T>);
    assertNoSealedSecret(resolved, secrets, context);
    return resolved;
  }

  /** Delete the durable secret AND drop the handle (revocation path). */
  async delete(credentialHandleRef: string): Promise<void> {
    const metadata = this.#handles.get(credentialHandleRef);
    if (metadata === undefined) {
      return;
    }
    try {
      await this.#credentialService.delete(
        connectionCredentialStorageKey(metadata.connectionId),
      );
    } catch {
      throw new DurableCredentialBrokerError(
        "STORAGE_WRITE_FAILED",
        `the credential store refused the delete for connection ${metadata.connectionId} (revocation did not complete)`,
      );
    }
    this.#handles.delete(credentialHandleRef);
  }

  /** Metadata for a handle (audit surface — never material). */
  metadataOf(
    credentialHandleRef: string,
  ): Readonly<SealedCredentialMetadata> | null {
    return this.#handles.get(credentialHandleRef) ?? null;
  }
}

/** The escape-scan gate (mirrors the provider-runtime fail-closed law). */
function assertNoSealedSecret(value: unknown, secrets: readonly string[], context: string): void {
  if (secrets.length === 0) {
    return;
  }
  const text = safeStringify(value);
  for (const secret of secrets) {
    if (text.includes(secret)) {
      throw new DurableCredentialBrokerError(
        "MATERIALIZATION_REFUSED",
        `a sealed secret string leaked through the consumer result (context: ${context}) — the result is refused, never sanitized`,
      );
    }
  }
}

/** JSON stringify that tolerates bigint + cycles (bounded for the scan). */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (item !== null && typeof item === "object") {
        if (seen.has(item)) {
          return "[circular]";
        }
        seen.add(item);
      }
      return item;
    }) ?? "null";
  } catch {
    return "[unstringifiable]";
  }
}
