/**
 * @payswap/provider-runtime — credential & browser-session isolation (P2-W2).
 *
 * THE LAW (INV-19, NON-CUSTODY.md, CAPABILITY-MODEL "credentials remain
 * outside agent/model context"):
 * credentials and browser sessions NEVER enter model context, normal logs
 * or ordinary artifacts. Secret material is represented as OPAQUE
 * HANDLES/REFERENCES only.
 *
 * Mechanical design (adapting the old repo's CredentialBroker discipline —
 * payswap.org@8a735bf packages/adapters/src/credential-broker.ts — to a
 * dependency-free Phase-2 package):
 *
 * 1. Material enters the broker exactly once — `registerBundle` — and is
 *    stored behind a `#private` field with NO getter. The only thing that
 *    crosses back out is the OPAQUE HANDLE (a branded id).
 * 2. A handle resolves to a SEALED bundle whose material leaves the seal
 *    ONLY inside `withMaterial`, ONLY for a runtime holding a registered
 *    `ConnectorRuntimeKey`.
 * 3. The RESULT of the consumer callback is fail-closed scanned: no string
 *    of the material may appear anywhere inside it. A leak throws
 *    CredentialIsolationViolationError — never a silent sanitize.
 * 4. Browser sessions follow the same law through
 *    `BrowserSessionBroker`: an isolated interactive session holds its
 *    cookies/storage sealed; only the OPAQUE `BrowserSessionRef` crosses
 *    any boundary.
 *
 * Deterministic: handles are sequence-minted (`cred:1`, `sess:1`, …) — no
 * entropy, no host clock (battery determinism law).
 */

import {
  CredentialIsolationViolationError,
  ValidationError,
} from './errors.ts';
import { assertNoSecretMaterial, secretStringsOf } from './redaction.ts';
import type { CredentialKind } from './connection-forms.ts';

declare const CredentialHandleIdBrand: unique symbol;
declare const BrowserSessionRefBrand: unique symbol;
declare const ConnectorRuntimeKeyBrand: unique symbol;

/** Opaque handle to a sealed credential bundle (branded; NO accessor exists). */
export type CredentialHandleId = string & {
  readonly [CredentialHandleIdBrand]: 'CredentialHandleId';
};

/** Opaque reference to an isolated interactive browser session. */
export type BrowserSessionRef = string & {
  readonly [BrowserSessionRefBrand]: 'BrowserSessionRef';
};

/** Capability object handed to a REGISTERED connector runtime (opens seals). */
export type ConnectorRuntimeKey = string & {
  readonly [ConnectorRuntimeKeyBrand]: 'ConnectorRuntimeKey';
};

/** What the broker records about a bundle (metadata only — never material). */
export interface CredentialBundleMetadata {
  readonly kind: CredentialKind;
  readonly description?: string;
  readonly registeredAt: bigint;
}

/**
 * A sealed credential bundle. The material lives in a `#private` field and
 * leaves the seal ONLY through `withMaterial`, gated by a registered
 * runtime key, with a fail-closed escape scan on the callback result.
 */
export class SealedCredentialBundle {
  readonly #material: unknown;
  readonly #secretStrings: readonly string[];
  readonly metadata: CredentialBundleMetadata;

  constructor(material: unknown, metadata: CredentialBundleMetadata) {
    this.#material = material;
    this.#secretStrings = secretStringsOf(material);
    this.metadata = Object.freeze({ ...metadata });
  }

  /**
   * Open the seal for one consumer. Invariants enforced here:
   * - the callback RESULT is deep-scanned for material leaks (fail-closed);
   * - when the consumer is async, the RESOLVED value is scanned after await;
   * - the callback never receives the bundle itself.
   *
   * THE DISPATCH PATTERN: the provider interaction itself (transport.send
   * with secret-bearing headers) runs INSIDE the consumer — the material
   * never leaves the seal; only the clean provider response comes out.
   */
  async withMaterial<T>(
    consumer: (material: unknown) => T,
    input: { readonly runtimeKey: ConnectorRuntimeKey; readonly context: string },
  ): Promise<Awaited<T>> {
    const result = consumer(this.#material) as T | Promise<Awaited<T>>;
    const resolved =
      result !== null &&
      typeof result === 'object' &&
      typeof (result as { then?: unknown }).then === 'function'
        ? await (result as Promise<Awaited<T>>)
        : (result as Awaited<T>);
    assertNoSecretMaterial(resolved, this.#secretStrings, input.context);
    return resolved;
  }

  /** Number of secret strings sealed inside (audit surface — not the strings). */
  get sealedSecretCount(): number {
    return this.#secretStrings.length;
  }
}

/**
 * The credential broker: material enters once, leaves only inside
 * `withMaterial` under a registered runtime key. In-memory reference
 * implementation (durable vault adapters are a separately-accepted Work
 * Order; the old repo's vault:// binding is evidence of that future).
 */
export class InMemoryCredentialBroker {
  private readonly bundles = new Map<CredentialHandleId, { sealed: SealedCredentialBundle }>();
  private readonly runtimes = new Set<ConnectorRuntimeKey>();
  private nextHandle = 0;

  /**
   * Register a connector runtime by name; the returned key is the ONLY
   * capability object that can later open seals at this broker.
   */
  registerRuntime(runtimeName: string): ConnectorRuntimeKey {
    if (typeof runtimeName !== 'string' || runtimeName.length === 0) {
      throw new ValidationError('runtimeName must be a non-empty string');
    }
    const key = `runtime:${runtimeName}:${this.runtimes.size + 1}` as ConnectorRuntimeKey;
    this.runtimes.add(key);
    return key;
  }

  /** True when the runtime key was minted by this broker. */
  isRegisteredRuntime(key: ConnectorRuntimeKey): boolean {
    return this.runtimes.has(key);
  }

  /**
   * Material enters the broker here — the ONLY entry. Deterministic
   * sequence handle; metadata records kind/description/timestamp, never
   * material. Returns the OPAQUE handle.
   */
  registerBundle(input: {
    readonly kind: CredentialKind;
    readonly material: unknown;
    readonly description?: string;
    readonly registeredAt: bigint;
  }): CredentialHandleId {
    if (input.material === null || input.material === undefined) {
      throw new ValidationError('credential material must be a non-null value');
    }
    if (typeof input.registeredAt !== 'bigint' || input.registeredAt < 0n) {
      throw new ValidationError('registeredAt must be a non-negative bigint');
    }
    this.nextHandle += 1;
    const handle = `cred:${this.nextHandle}` as CredentialHandleId;
    const metadata: CredentialBundleMetadata =
      input.description === undefined
        ? Object.freeze({ kind: input.kind, registeredAt: input.registeredAt })
        : Object.freeze({
            kind: input.kind,
            description: input.description,
            registeredAt: input.registeredAt,
          });
    this.bundles.set(handle, { sealed: new SealedCredentialBundle(input.material, metadata) });
    return handle;
  }

  /** Resolve a handle to its sealed bundle (unknown handles throw). */
  resolve(handle: CredentialHandleId): SealedCredentialBundle {
    const entry = this.bundles.get(handle);
    if (entry === undefined) {
      throw new ValidationError(`unknown credential handle '${String(handle)}'`);
    }
    return entry.sealed;
  }

  /**
   * Open a handle's seal for one consumer under a registered runtime key.
   * Fail-closed: unregistered keys throw BEFORE the material is passed.
   */
  withMaterial<T>(
    handle: CredentialHandleId,
    input: {
      readonly runtimeKey: ConnectorRuntimeKey;
      readonly context: string;
      readonly consumer: (material: unknown) => T;
    },
  ): Promise<Awaited<T>> {
    if (!this.isRegisteredRuntime(input.runtimeKey)) {
      return Promise.reject(
        new CredentialIsolationViolationError(
          'the ConnectorRuntimeKey is not registered with this broker',
          { context: input.context },
        ),
      );
    }
    const sealed = this.resolve(handle);
    return sealed.withMaterial(input.consumer, {
      runtimeKey: input.runtimeKey,
      context: input.context,
    });
  }

  /** Audit surface: metadata for every registered bundle (never material). */
  listBundleMetadata(): readonly { readonly handle: string; readonly metadata: CredentialBundleMetadata }[] {
    return [...this.bundles.entries()].map(([handle, entry]) => ({
      handle: String(handle),
      metadata: entry.sealed.metadata,
    }));
  }
}

// ---------------------------------------------------------------------------
// The credential dispatch bundle (the one provider edge where material is used)
// ---------------------------------------------------------------------------

/**
 * Everything one provider edge needs to open the seal and dispatch: broker,
 * registered runtime key, the connection's opaque handle and the
 * adapter-owned header binder. The material crosses ONLY inside
 * broker.withMaterial — the interaction runs INSIDE the seal and only the
 * clean provider response comes out (INV-19).
 */
export interface CredentialDispatch {
  readonly broker: InMemoryCredentialBroker;
  readonly runtimeKey: ConnectorRuntimeKey;
  /** The connection's opaque credential handle reference. */
  readonly credentialHandleRef: string;
  /** Adapter-owned: sealed material → provider auth headers. */
  readonly bindHeaders: (material: unknown) => Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Isolated interactive browser sessions
// ---------------------------------------------------------------------------

/** What an isolated browser session holds (sealed; never crosses boundaries). */
export interface BrowserSessionMaterial {
  /** Cookie jar for the isolated session (names + values — all secret-shaped). */
  readonly cookies: Readonly<Record<string, string>>;
  /** Storage snapshot keys (values sealed alongside). */
  readonly storage?: Readonly<Record<string, string>>;
}

/** The sealed browser session: interactive material behind the same law. */
export class SealedBrowserSession {
  readonly #material: BrowserSessionMaterial;
  readonly #secretStrings: readonly string[];

  constructor(material: BrowserSessionMaterial) {
    if (material === null || typeof material !== 'object' || material.cookies === undefined) {
      throw new ValidationError('browser session material requires a cookies record');
    }
    this.#material = material;
    this.#secretStrings = secretStringsOf(material);
  }

  /**
   * Open the session for one interactive consumer (the isolated browser
   * context driver). The RESULT is escape-scanned: cookies/storage values
   * can never leak back out through the callback result.
   */
  withSession<T>(
    consumer: (material: BrowserSessionMaterial) => T,
    input: { readonly runtimeKey: ConnectorRuntimeKey; readonly context: string },
  ): T {
    const result = consumer(this.#material);
    assertNoSecretMaterial(result, this.#secretStrings, input.context);
    return result;
  }

  get sealedSecretCount(): number {
    return this.#secretStrings.length;
  }
}

/**
 * The browser-session broker: isolated interactive sessions referenced by
 * OPAQUE refs; the cookies/storage never enter model context, logs or
 * artifacts (INV-19 — protected session cookies are named material).
 */
export class BrowserSessionBroker {
  private readonly sessions = new Map<BrowserSessionRef, SealedBrowserSession>();
  private readonly runtimes = new Set<ConnectorRuntimeKey>();
  private nextRef = 0;

  registerRuntime(runtimeName: string): ConnectorRuntimeKey {
    if (typeof runtimeName !== 'string' || runtimeName.length === 0) {
      throw new ValidationError('runtimeName must be a non-empty string');
    }
    const key = `browser-runtime:${runtimeName}:${this.runtimes.size + 1}` as ConnectorRuntimeKey;
    this.runtimes.add(key);
    return key;
  }

  isRegisteredRuntime(key: ConnectorRuntimeKey): boolean {
    return this.runtimes.has(key);
  }

  /** Create an isolated session; returns the OPAQUE session reference. */
  createSession(material: BrowserSessionMaterial): BrowserSessionRef {
    this.nextRef += 1;
    const ref = `sess:${this.nextRef}` as BrowserSessionRef;
    this.sessions.set(ref, new SealedBrowserSession(material));
    return ref;
  }

  /** Resolve a session reference to its sealed session (unknown refs throw). */
  resolve(ref: BrowserSessionRef): SealedBrowserSession {
    const session = this.sessions.get(ref);
    if (session === undefined) {
      throw new ValidationError(`unknown browser session ref '${String(ref)}'`);
    }
    return session;
  }

  /** Open a session under a registered runtime key (escape-scanned). */
  withSession<T>(
    ref: BrowserSessionRef,
    input: {
      readonly runtimeKey: ConnectorRuntimeKey;
      readonly context: string;
      readonly consumer: (material: BrowserSessionMaterial) => T;
    },
  ): T {
    if (!this.isRegisteredRuntime(input.runtimeKey)) {
      throw new CredentialIsolationViolationError(
        'the ConnectorRuntimeKey is not registered with this browser-session broker',
        { context: input.context },
      );
    }
    return this.resolve(ref).withSession(input.consumer, {
      runtimeKey: input.runtimeKey,
      context: input.context,
    });
  }

  /** Number of live isolated sessions (audit surface only). */
  get sessionCount(): number {
    return this.sessions.size;
  }
}
