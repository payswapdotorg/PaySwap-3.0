/**
 * PaySwap Desktop (P13-B) — the VERIFICATION RECORDER, split from
 * ./session-authority.ts for the ≤400-line file law.
 *
 * The ONLY-ACTIVE path (ADR-0007 D1): the U1 key-entry verb (validate
 * the test-mode restricted-key shape fail-closed, seal through the
 * durable broker, record PENDING_VERIFICATION) and the probe-outcome
 * recorder (CONFIRMED → ACTIVE with evidence; UNKNOWN/FAILED recorded
 * on PENDING_VERIFICATION — UNKNOWN must reconcile before any
 * conclusion, INV-04). The probe itself runs INSIDE the seal at the
 * composition edge; this module records the evidence.
 */

import type { DurableConnectionCredentialBroker } from "./credential-broker.js";
import { ConnectionSessionError } from "./session-authority.js";
import type {
  DesktopConnectionStatusView,
  DesktopCredentialSealReceipt,
} from "./contracts.js";
import { recordViewOf, type PersistedConnectionRecord } from "./record-store.js";
import type { PinnedConnectionLifecycleState } from "./provider-pins.js";
import {
  PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN,
  PINNED_STELLAR_STRKEY_SECRET_PATTERN,
} from "./onchain-rail-pins.js";
import {
  EVIDENCE_PROBE_CONFIRMED,
  EVIDENCE_PROBE_FAILED,
  EVIDENCE_PROBE_UNKNOWN,
  EVIDENCE_SEALED,
} from "./evidence-copy.js";

/** The narrow port the recorder needs from the authority. */
export interface VerificationRecorderPort {
  readonly broker: DurableConnectionCredentialBroker;
  getRecord(connectionId: string): Promise<PersistedConnectionRecord | null>;
  setRecord(record: PersistedConnectionRecord): Promise<void>;
  transition(
    record: PersistedConnectionRecord,
    to: PinnedConnectionLifecycleState,
    cause: string,
    evidence: string,
  ): PersistedConnectionRecord;
  nowIso(): string;
}

export class VerificationRecorder {
  readonly #port: VerificationRecorderPort;

  constructor(port: VerificationRecorderPort) {
    this.#port = port;
  }

  /**
   * The U1 key-entry verb (the ONE material-carrying path): validate the
   * key shape fail-closed, seal it through the durable broker, and record
   * the credential handle + the PENDING_VERIFICATION transition. The
   * connection is STILL NOT ACTIVE — only the probe can do that.
   */
  async submitStripeRestrictedKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<DesktopCredentialSealReceipt> {
    return this.#sealTestModeApiKey(input, {
      testPrefixes: ["rk_test_", "sk_test_"],
      providerLabel: "Stripe",
      expectedShape: "rk_test_… or sk_test_…",
    });
  }

  /**
   * The Flutterwave key-entry verb (P14-D): the same ONE material-carrying
   * path with the FLWSECK_TEST- prefix law (INV-25 — live keys refused).
   */
  async submitFlutterwaveSecretKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<DesktopCredentialSealReceipt> {
    return this.#sealTestModeApiKey(input, {
      testPrefixes: ["FLWSECK_TEST-"],
      providerLabel: "Flutterwave",
      expectedShape: "FLWSECK_TEST-…",
    });
  }

  /**
   * The Paystack key-entry verb (P14-D): the same ONE material-carrying
   * path with the sk_test_ prefix law (INV-25 — live keys refused).
   */
  async submitPaystackSecretKey(input: {
    readonly connectionId: string;
    readonly secretKey: string;
  }): Promise<DesktopCredentialSealReceipt> {
    return this.#sealTestModeApiKey(input, {
      testPrefixes: ["sk_test_"],
      providerLabel: "Paystack",
      expectedShape: "sk_test_…",
    });
  }

  /**
   * The Stellar keypair-entry verb (P22-H, ADR-0016 D9): the ONE
   * material-carrying path for the onchain rail — the keypair as ONE
   * material {publicKey, secretKey}. THE STRKEY SHAPE LAW: the public
   * key MUST match ^G[A-Z2-7]{55}$ and the secret ^S[A-Z2-7]{55}$
   * (fail-closed; anything else is refused, never sealed). The keypair
   * is network-agnostic by shape — the CONNECTION declares the network
   * (stellar:testnet); the mode gate is at execution (SANDBOX only,
   * INV-25), never a shape guess.
   */
  async submitStellarSecretKey(input: {
    readonly connectionId: string;
    readonly publicKey: string;
    readonly secretKey: string;
  }): Promise<DesktopCredentialSealReceipt> {
    const record = await this.#port.getRecord(input.connectionId);
    if (record === null) {
      throw new ConnectionSessionError(
        "UNKNOWN_CONNECTION",
        `No connection '${input.connectionId}' exists — the keypair entry is refused`,
      );
    }
    if (
      typeof input.publicKey !== "string" ||
      !PINNED_STELLAR_STRKEY_ACCOUNT_PATTERN.test(input.publicKey) ||
      typeof input.secretKey !== "string" ||
      !PINNED_STELLAR_STRKEY_SECRET_PATTERN.test(input.secretKey)
    ) {
      throw new ConnectionSessionError(
        "CREDENTIAL_REQUIRED",
        "The supplied keypair is not a canonical Stellar StrKey keypair (expected a G… 56-char public key and an S… 56-char secret key, base32). The connection declares the network (stellar:testnet); a pubnet-shaped execution target is never offered (INV-25).",
      );
    }
    const { credentialHandleRef, sealedSecretCount } = await this.#port.broker.sealStellarKeypair(
      record.connectionId,
      { publicKey: input.publicKey, secretKey: input.secretKey },
      this.#port.nowIso(),
    );
    const updated = this.#port.transition(
      record,
      "PENDING_VERIFICATION",
      "CREDENTIAL_SEALED",
      EVIDENCE_SEALED,
    );
    const next: PersistedConnectionRecord = {
      ...updated,
      credentialHandleRef,
    };
    await this.#port.setRecord(next);
    return {
      connectionId: record.connectionId,
      credentialHandleRef,
      sealedSecretCount,
      nextState: next.state,
    };
  }

  /**
   * The shared key-entry law: validate the TEST-MODE key shape fail-closed
   * (this deployment is SANDBOX-only — INV-25: a LIVE key is refused at
   * the verb, never sealed), seal through the durable broker, and record
   * the PENDING_VERIFICATION transition (the ONLY pre-ACTIVE state).
   */
  async #sealTestModeApiKey(
    input: { readonly connectionId: string; readonly secretKey: string },
    shape: { readonly testPrefixes: readonly string[]; readonly providerLabel: string; readonly expectedShape: string },
  ): Promise<DesktopCredentialSealReceipt> {
    const record = await this.#port.getRecord(input.connectionId);
    if (record === null) {
      throw new ConnectionSessionError(
        "UNKNOWN_CONNECTION",
        `No connection '${input.connectionId}' exists — the key entry is refused`,
      );
    }
    if (record.state === "ACTIVE" || record.state === "PENDING_VERIFICATION") {
      // Key rotation on an existing connection: allowed (falls through).
    }
    const key = input.secretKey;
    if (
      typeof key !== "string" ||
      !shape.testPrefixes.some((prefix) => key.startsWith(prefix)) ||
      key.length < 16
    ) {
      throw new ConnectionSessionError(
        "CREDENTIAL_REQUIRED",
        `The supplied key is not a ${shape.providerLabel} test-mode secret key (expected ${shape.expectedShape}). LIVE keys are refused: this deployment is SANDBOX-only (INV-25).`,
      );
    }
    const { credentialHandleRef, sealedSecretCount } = await this.#port.broker.sealApiKey(
      record.connectionId,
      key,
      this.#port.nowIso(),
    );
    const updated = this.#port.transition(
      record,
      "PENDING_VERIFICATION",
      "CREDENTIAL_SEALED",
      EVIDENCE_SEALED,
    );
    const next: PersistedConnectionRecord = {
      ...updated,
      credentialHandleRef,
    };
    await this.#port.setRecord(next);
    return {
      connectionId: record.connectionId,
      credentialHandleRef,
      sealedSecretCount,
      nextState: next.state,
    };
  }

  /**
   * Record a verification-probe outcome (the ONLY ACTIVE path). The probe
   * itself runs INSIDE the broker seal at the composition edge (the real
   * transport + the sealed key); the authority records the evidence.
   */
  async recordVerificationOutcome(input: {
    readonly connectionId: string;
    readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED";
    readonly evidenceSummary: string;
  }): Promise<DesktopConnectionStatusView> {
    const record = await this.#port.getRecord(input.connectionId);
    if (record === null) {
      throw new ConnectionSessionError("UNKNOWN_CONNECTION", `Unknown connection '${input.connectionId}'`);
    }
    if (record.credentialHandleRef === null) {
      throw new ConnectionSessionError(
        "CREDENTIAL_REQUIRED",
        "A verification outcome cannot be recorded before a credential is sealed",
      );
    }
    if (input.outcome === "CONFIRMED") {
      const updated = this.#port.transition(
        record,
        "ACTIVE",
        "PROBE_CONFIRMED",
        `${EVIDENCE_PROBE_CONFIRMED} — ${input.evidenceSummary}`,
      );
      await this.#port.setRecord(updated);
      return recordViewOf(updated);
    }
    // UNKNOWN and FAILED both stay PENDING_VERIFICATION: UNKNOWN must be
    // reconciled (re-probed) before any conclusion; FAILED is recorded
    // as evidence but does not disconnect (the operator may rotate the
    // key and retry — the record keeps its history).
    const updated = this.#port.transition(
      record,
      "PENDING_VERIFICATION",
      input.outcome === "UNKNOWN" ? "PROBE_UNKNOWN" : "PROBE_FAILED",
      `${input.outcome === "UNKNOWN" ? EVIDENCE_PROBE_UNKNOWN : EVIDENCE_PROBE_FAILED} — ${input.evidenceSummary}`,
    );
    await this.#port.setRecord(updated);
    return recordViewOf(updated);
  }

  /** Run a consumer inside the credential seal (the composition edge's probe path). */
  async withSealedCredential<T>(
    connectionId: string,
    consumer: (material: unknown) => T,
    context: string,
  ): Promise<Awaited<T>> {
    const record = await this.#port.getRecord(connectionId);
    if (record === null || record.credentialHandleRef === null) {
      throw new ConnectionSessionError(
        "CREDENTIAL_REQUIRED",
        `Connection '${connectionId}' has no sealed credential`,
      );
    }
    return this.#port.broker.withMaterial(record.credentialHandleRef, consumer, context);
  }
}
