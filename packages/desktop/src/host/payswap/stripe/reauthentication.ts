/**
 * PaySwap Desktop (P26-A, ADR-0018 — THE RE-AUTHENTICATION FLOW) — the
 * host-side proof machinery that makes the REAUTH approval tier honest.
 *
 * THE LAW (ADR-0018, BINDING):
 * - WHAT RE-AUTHENTICATION IS: the human principal proves, AT ACTION TIME,
 *   continued possession of the connection's credential material — a factor
 *   the model can never supply, echo or synthesize. The operator re-submits
 *   the connection's secret key (or a fresh key for the SAME account)
 *   through the host security seam (this module's `begin` — the ONE
 *   material-carrying entry; never chat, never model context, never a
 *   renderer echo).
 * - THE SAME-ACCOUNT LAW: the fresh credential is verified by a LIVE
 *   read-only probe (GET /v1/account) through the transport seam; the
 *   probe-verified account id MUST equal the connection's verified account
 *   id (a key for a different account is REAUTH_ACCOUNT_MISMATCH,
 *   fail-closed). Live keys are refused here AND at the transport edge
 *   (INV-25 — the deployment stays Sandbox-only).
 * - THE PROOF: host-minted, digest-SCOPED (bound to the prepared-action
 *   digests that triggered it — never a blank check), single-use,
 *   10-minute TTL (never outliving the authorization TTL law), consumed
 *   DURABLY BEFORE dispatch (the crash law: a crash after consumption
 *   leaves the outcome UNKNOWN, never a replayable proof).
 * - THE ESCAPE LAW: the proof NEVER crosses to the renderer as a token —
 *   callers hold only the opaque proofId; the material is used inside
 *   `begin` and never stored, logged or echoed (the store secret-scans
 *   every record — a leak THROWS).
 */

import type {
  StripeActionAccountContextResolver,
  StripeDispatchTransport,
  StripeOperationCensusPort,
  StripeReauthenticationPort,
} from "./action-seams.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";

/** The default re-authentication proof lifetime (10 minutes — the ADR-0018 D2 law). */
export const STRIPE_REAUTHENTICATION_PROOF_TTL_MS = 10 * 60 * 1000;

/** The accepted fresh-credential shapes (test-mode only — INV-25: live refused). */
const ACCEPTED_CREDENTIAL_PREFIXES = ["rk_test_", "sk_test_"] as const;
const REFUSED_LIVE_CREDENTIAL_PREFIXES = ["rk_live_", "sk_live_"] as const;

/** THE PROOF (the ADR-0018 D2 artifact — host-side only, never a renderer token). */
export interface StripeReauthenticationProof {
  /** Host-minted opaque id (`stripe-reauth:<uuid>`). */
  readonly proofId: string;
  /** The principal that proved possession (the authenticated human). */
  readonly principalId: string;
  /** Binds the connection the proof authorizes against. */
  readonly connectionId: string;
  /** The live-probe-verified Stripe account id (the same-account law's record). */
  readonly verifiedStripeAccountId: string;
  /** The DIGEST SCOPE: the prepared-action digests this proof may authorize (never a blank check). */
  readonly actionDigests: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Single-use marker: consumed at the authorized dispatch; replay is refused. */
  readonly consumedAt: string | null;
}

/** The typed refusals (fail-closed; never a thrown string). */
export type StripeReauthenticationRefusal =
  | { readonly kind: "INVALID_CREDENTIAL_SHAPE" }
  | { readonly kind: "LIVE_KEY_REFUSED"; readonly detail: string }
  | { readonly kind: "PROBE_UNDELIVERED"; readonly detail: string }
  | { readonly kind: "PROBE_REJECTED"; readonly detail: string }
  | { readonly kind: "ACCOUNT_MISMATCH"; readonly detail: string }
  | { readonly kind: "UNRESOLVED_CONNECTION"; readonly detail: string }
  | { readonly kind: "EMPTY_DIGEST_SCOPE" }
  | { readonly kind: "PROOF_NOT_FOUND" }
  | { readonly kind: "PROOF_EXPIRED" }
  | { readonly kind: "PROOF_CONSUMED" }
  | { readonly kind: "PROOF_DIGEST_MISMATCH" }
  | { readonly kind: "PROOF_PRINCIPAL_MISMATCH" }
  | { readonly kind: "PROOF_CONNECTION_MISMATCH" };

/** The injected fs seam (the prepared-action-store shape). */
export interface StripeReauthenticationFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/**
 * The durable proof store (the prepared-action-store laws: versioned JSON
 * snapshot, write-then-ack, fail-closed per-record quarantine, secret-scan
 * on every write, expired proofs pruned at load).
 */
export class StripeReauthenticationStore {
  readonly #fs: StripeReauthenticationFileSystem;
  readonly #path: string;
  #cache: readonly StripeReauthenticationProof[] | null = null;

  constructor(fs: StripeReauthenticationFileSystem, path: string) {
    this.#fs = fs;
    this.#path = path;
  }

  async put(proof: StripeReauthenticationProof): Promise<void> {
    const proofs = await this.#load();
    const next = [...proofs.filter((p) => p.proofId !== proof.proofId), proof];
    await this.#persist(next);
  }

  async get(proofId: string): Promise<StripeReauthenticationProof | null> {
    const proofs = await this.#load();
    return proofs.find((p) => p.proofId === proofId) ?? null;
  }

  /** Every unconsumed, unexpired proof bound to the exact scope triple. */
  async liveProofsFor(input: {
    readonly connectionId: string;
    readonly principalId: string;
    readonly digest: string;
    readonly nowMs: number;
  }): Promise<readonly StripeReauthenticationProof[]> {
    const proofs = await this.#load();
    return proofs.filter(
      (p) =>
        p.consumedAt === null &&
        Date.parse(p.expiresAt) > input.nowMs &&
        p.connectionId === input.connectionId &&
        p.principalId === input.principalId &&
        p.actionDigests.includes(input.digest),
    );
  }

  /** Every unconsumed, unexpired proof for the principal+connection pair
   *  (ANY digest) — the specific-refusal resolver's input. */
  async liveProofsForPair(input: {
    readonly connectionId: string;
    readonly principalId: string;
    readonly nowMs: number;
  }): Promise<readonly StripeReauthenticationProof[]> {
    const proofs = await this.#load();
    return proofs.filter(
      (p) =>
        p.consumedAt === null &&
        Date.parse(p.expiresAt) > input.nowMs &&
        p.connectionId === input.connectionId &&
        p.principalId === input.principalId,
    );
  }

  /** The durable single-use consumption (BEFORE dispatch — the crash law). */
  async consume(proofId: string, consumedAt: string): Promise<boolean> {
    const proofs = await this.#load();
    let consumed = false;
    const next = proofs.map((p) => {
      if (p.proofId !== proofId || p.consumedAt !== null) return p;
      consumed = true;
      return { ...p, consumedAt };
    });
    if (consumed) await this.#persist(next);
    return consumed;
  }

  async #load(): Promise<readonly StripeReauthenticationProof[]> {
    if (this.#cache !== null) return this.#cache;
    let raw: string;
    try {
      raw = await this.#fs.readFile(this.#path);
    } catch {
      this.#cache = [];
      return this.#cache;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.#cache = [];
      return this.#cache;
    }
    const records = Array.isArray(parsed)
      ? parsed.flatMap((candidate) => {
          const proof = parseProof(candidate);
          return proof === null ? [] : [proof];
        })
      : [];
    // Expired proofs never ride the working set (the TTL law's hygiene).
    this.#cache = records.filter((p) => p.consumedAt !== null || Date.parse(p.expiresAt) > Date.now());
    return this.#cache;
  }

  async #persist(proofs: readonly StripeReauthenticationProof[]): Promise<void> {
    const json = JSON.stringify(proofs, null, 2);
    // THE ESCAPE LAW: a proof record carrying secret-shaped material THROWS —
    // refuse to persist (the credential-broker escape-scan posture).
    assertNoStripeSecretShapes(json, "stripe-reauthentication-proof-store");
    await this.#fs.mkdir(this.#path.slice(0, this.#path.lastIndexOf("/")));
    await this.#fs.writeFile(this.#path, json);
    this.#cache = [...proofs];
  }
}

/** Fail-closed parse of one proof record. */
function parseProof(candidate: unknown): StripeReauthenticationProof | null {
  if (candidate === null || typeof candidate !== "object") return null;
  const r = candidate as Partial<StripeReauthenticationProof>;
  if (
    typeof r.proofId !== "string" ||
    typeof r.principalId !== "string" ||
    typeof r.connectionId !== "string" ||
    typeof r.verifiedStripeAccountId !== "string" ||
    !Array.isArray(r.actionDigests) ||
    r.actionDigests.some((d) => typeof d !== "string") ||
    typeof r.issuedAt !== "string" ||
    typeof r.expiresAt !== "string" ||
    (r.consumedAt !== null && typeof r.consumedAt !== "string")
  ) {
    return null;
  }
  return Object.freeze({
    proofId: r.proofId,
    principalId: r.principalId,
    connectionId: r.connectionId,
    verifiedStripeAccountId: r.verifiedStripeAccountId,
    actionDigests: Object.freeze([...r.actionDigests]) as readonly string[],
    issuedAt: r.issuedAt,
    expiresAt: r.expiresAt,
    consumedAt: r.consumedAt ?? null,
  });
}

/** The service dependencies (all seams; no ambient anything). */
export interface StripeReauthenticationDeps {
  readonly census: StripeOperationCensusPort;
  readonly transport: StripeDispatchTransport;
  readonly accountContext: StripeActionAccountContextResolver;
  readonly store: StripeReauthenticationStore;
  readonly nowMs: () => number;
  readonly createId: () => string;
  readonly proofTtlMs?: number;
}

export interface StripeReauthenticationService {
  /**
   * THE ONE MATERIAL-CARRYING ENTRY (ADR-0018 D1): verify the fresh
   * credential against the SAME account by live probe, then mint the
   * digest-scoped proof. The credential is used inside this call and
   * never stored, logged or returned.
   */
  begin(input: {
    readonly connectionId: string;
    readonly principalId: string;
    readonly actionDigests: readonly string[];
    readonly freshCredential: string;
  }): Promise<{ readonly ok: true; readonly proofId: string } | { readonly ok: false; readonly refusal: StripeReauthenticationRefusal }>;
  /** Is there an unconsumed, unexpired proof for the exact scope triple? */
  verify(input: {
    readonly connectionId: string;
    readonly principalId: string;
    readonly digest: string;
  }): Promise<{ readonly ok: true; readonly proofId: string } | { readonly ok: false; readonly refusal: StripeReauthenticationRefusal }>;
  /** The durable single-use consumption (the executor calls it BEFORE dispatch). */
  consume(proofId: string): Promise<boolean>;
}

/** Compose the re-authentication service (ADR-0018's machinery). */
export function createStripeReauthenticationService(
  deps: StripeReauthenticationDeps,
): StripeReauthenticationService {
  const proofTtlMs = deps.proofTtlMs ?? STRIPE_REAUTHENTICATION_PROOF_TTL_MS;
  return {
    async begin(input) {
      if (input.actionDigests.length === 0 || input.actionDigests.some((d) => d.length === 0)) {
        return { ok: false, refusal: { kind: "EMPTY_DIGEST_SCOPE" } };
      }
      // ---- the credential shape (defense in depth; the transport edge
      // refuses live keys again — INV-25 at two layers). ----
      const credential = input.freshCredential;
      if (REFUSED_LIVE_CREDENTIAL_PREFIXES.some((p) => credential.startsWith(p))) {
        return {
          ok: false,
          refusal: {
            kind: "LIVE_KEY_REFUSED",
            detail: "live keys are refused: this deployment is SANDBOX-only (INV-25)",
          },
        };
      }
      if (
        credential.length < 16 ||
        !ACCEPTED_CREDENTIAL_PREFIXES.some((p) => credential.startsWith(p))
      ) {
        return { ok: false, refusal: { kind: "INVALID_CREDENTIAL_SHAPE" } };
      }
      // ---- the connection's verified account (the same-account law's target). ----
      const context = await deps.accountContext.resolve(input.connectionId);
      if (!context.ok) {
        return { ok: false, refusal: { kind: "UNRESOLVED_CONNECTION", detail: context.reason } };
      }
      // ---- THE LIVE PROBE (GET /v1/account with the FRESH credential — the
      // material exists only in this call scope; never stored, never logged). ----
      const account = deps.census.resolve("GetAccount");
      if (account === undefined) {
        return {
          ok: false,
          refusal: { kind: "PROBE_UNDELIVERED", detail: "the GetAccount probe operation is unknown to the census" },
        };
      }
      const response = await deps.transport.send({
        operationId: account.operationId,
        apiNamespace: account.apiNamespace,
        method: account.method,
        path: account.path,
        parameters: [],
        authorization: `Bearer ${credential}`,
        apiVersion: "2025-08-27.basil",
        correlationId: `reauthentication-probe:${input.connectionId}`,
      });
      if (!response.delivered || response.status === undefined) {
        return {
          ok: false,
          refusal: {
            kind: "PROBE_UNDELIVERED",
            detail: "the account probe did not deliver — possession is NOT proven (fail-closed)",
          },
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          refusal: {
            kind: "PROBE_REJECTED",
            detail: `the account probe was rejected (HTTP ${response.status}${response.providerErrorCode ? `: ${response.providerErrorCode}` : ""}) — possession is NOT proven`,
          },
        };
      }
      const probedAccountId =
        typeof response.body === "object" && response.body !== null
          ? (response.body as { readonly id?: unknown }).id
          : undefined;
      if (typeof probedAccountId !== "string" || probedAccountId.length === 0) {
        return {
          ok: false,
          refusal: { kind: "PROBE_UNDELIVERED", detail: "the account probe response carries no account id (fail-closed)" },
        };
      }
      if (probedAccountId !== context.accountContext.stripeAccountId) {
        return {
          ok: false,
          refusal: {
            kind: "ACCOUNT_MISMATCH",
            detail: `the fresh credential verifies a DIFFERENT account (${probedAccountId}) than the connection's verified account (${context.accountContext.stripeAccountId}) — refused (ADR-0018 D1)`,
          },
        };
      }
      // ---- mint the digest-scoped, single-use, short-lived proof. ----
      const nowMs = deps.nowMs();
      const proof: StripeReauthenticationProof = Object.freeze({
        proofId: `stripe-reauth:${deps.createId()}`,
        principalId: input.principalId,
        connectionId: input.connectionId,
        verifiedStripeAccountId: probedAccountId,
        actionDigests: Object.freeze([...new Set(input.actionDigests)]) as readonly string[],
        issuedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + proofTtlMs).toISOString(),
        consumedAt: null,
      });
      await deps.store.put(proof);
      return { ok: true, proofId: proof.proofId };
    },

    async verify(input) {
      const nowMs = deps.nowMs();
      const exact = await deps.store.liveProofsFor({ ...input, nowMs });
      if (exact.length > 0) {
        return { ok: true, proofId: exact[0]!.proofId };
      }
      // The SPECIFIC refusals (ADR-0018 D2's vocabulary — the executor's
      // message names the exact law that failed, never a bare "not found").
      const byPair = await deps.store.liveProofsForPair({
        connectionId: input.connectionId,
        principalId: input.principalId,
        nowMs,
      });
      if (byPair.length > 0) {
        return { ok: false, refusal: { kind: "PROOF_DIGEST_MISMATCH" } };
      }
      return { ok: false, refusal: { kind: "PROOF_NOT_FOUND" } };
    },

    async consume(proofId) {
      return deps.store.consume(proofId, new Date(deps.nowMs()).toISOString());
    },
  };
}

/** The typed-refusal → reason-string mapping (the port's narrow shape). */
function refusalReasonOf(refusal: StripeReauthenticationRefusal): string {
  return "detail" in refusal ? `${refusal.kind}: ${refusal.detail}` : refusal.kind;
}

/** Adapt the service to the executor's reauthentication seam (the port shape). */
export function reauthenticationPortOf(service: StripeReauthenticationService): StripeReauthenticationPort {
  return {
    begin: async (input) => {
      const result = await service.begin(input);
      return result.ok
        ? { ok: true, proofId: result.proofId }
        : { ok: false, reason: refusalReasonOf(result.refusal) };
    },
    verify: async (input) => {
      const result = await service.verify(input);
      return result.ok
        ? { ok: true, proofId: result.proofId }
        : { ok: false, reason: refusalReasonOf(result.refusal) };
    },
    consume: (proofId) => service.consume(proofId),
  };
}
