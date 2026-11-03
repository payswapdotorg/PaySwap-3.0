/**
 * PaySwap Desktop (P27-E, the P27-A lane report §8 — the §B.2 seam) — the
 * DURABLE STRIPE CONNECT OPERATOR-DECISION CHANNEL: the typed, persisted
 * decision slot for the operator's run-card §B.2 account-model and
 * charge-model/liability decisions (the PRODUCT channel; the harness
 * channel is STRIPE_CONNECT_ACCOUNT_MODEL_JSON).
 *
 * THE LAW (the lane's typed gates, never weakened):
 * - UNCONFIGURED UNTIL SUPPLIED: the shipped state carries NO decision —
 *   `decisions()` answers the empty record and every gate that consumes it
 *   keeps its typed UNCONFIGURED verdict. NEVER a default guess (a wrong
 *   merchant-of-record or liability default would be a legal error, not a
 *   convenience).
 * - RECORDING IS VALIDATED + ATTRIBUTED: a decision lands ONLY through
 *   `record()`, structurally validated by the lane's own validators
 *   (isAccountModelDecision / isTopologyDecision — the capability-
 *   consistency law stays the gates'), stamped with the recorder and the
 *   written record reference (the §B.2 approval trail). A malformed
 *   decision is the typed refusal, never a partial write.
 * - DURABLE (the prepared-action-store pattern): a versioned JSON snapshot
 *   over the injected fs seam, write-then-ack, fail-closed per-record
 *   quarantine, secret-shape scan on every write (a decision record
 *   carrying secret-shaped material THROWS).
 * - ZERO FINANCIAL AUTHORITY: this channel records DECISIONS as typed
 *   data; the connect topology/lifecycle modules stay the enforcement.
 */

import {
  isAccountModelDecision,
  isTopologyDecision,
  type StripeConnectOperatorDecisions,
} from "./connect-platform-gates.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";

/** The injected fs seam (the CONNECTIONS_NODE_FILE_SYSTEM shape). */
export interface ConnectDecisionFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The durable record's shape (versioned for forward migration). */
interface ConnectDecisionEnvelope {
  readonly version: 1;
  readonly accountModel: unknown;
  readonly topology: unknown;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
}

/** The typed recording refusal (fail-closed; never a thrown string). */
export type ConnectDecisionRecordRefusal =
  | { readonly kind: "MALFORMED_ACCOUNT_MODEL"; readonly detail: string }
  | { readonly kind: "MALFORMED_TOPOLOGY"; readonly detail: string }
  | { readonly kind: "MISSING_RECORDER"; readonly detail: string };

/** The channel's read surface (what the composition feeds the gates with). */
export interface StripeConnectOperatorDecisionChannel {
  /** The operator's recorded decisions — {} while UNSUPPLIED (the honest default). */
  decisions(): StripeConnectOperatorDecisions;
  /** The durable audit trail (metadata only — the decisions carry references, never secrets). */
  metadata(): { readonly recordedBy: string | null; readonly recordedAt: string | null };
}

/**
 * The durable §B.2 operator-decision channel. Compose ONCE at the host
 * edge over the workspace directory (the same root as the connection
 * records); `load()` is the composition's first read.
 */
export class StripeConnectOperatorDecisionStore {
  readonly #fs: ConnectDecisionFileSystem;
  readonly #path: string;
  #envelope: ConnectDecisionEnvelope | null = null;

  constructor(fs: ConnectDecisionFileSystem, directory: string) {
    this.#fs = fs;
    this.#path = `${directory.replace(/\/+$/, "")}/connect-operator-decisions.json`;
  }

  /** Load the persisted record once (missing file / corrupt store = the honest UNSUPPLIED state). */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await this.#fs.readFile(this.#path);
    } catch {
      this.#envelope = null;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ConnectDecisionEnvelope>;
      if (parsed === null || typeof parsed !== "object" || parsed.version !== 1) {
        this.#envelope = null;
        return;
      }
      this.#envelope = {
        version: 1,
        accountModel: parsed.accountModel ?? null,
        topology: parsed.topology ?? null,
        recordedBy: typeof parsed.recordedBy === "string" ? parsed.recordedBy : null,
        recordedAt: typeof parsed.recordedAt === "string" ? parsed.recordedAt : null,
      };
    } catch {
      // Corrupt store: the honest UNSUPPLIED state; the corruption stays
      // visible on disk until the next record() overwrites it (never
      // silently "repaired", never a crash).
      this.#envelope = null;
    }
  }

  /**
   * Record the operator's §B.2 decisions (validated + attributed +
   * persisted atomically). Either decision may be supplied alone; a
   * supplied value MUST be structurally valid (the lane's validators) —
   * a malformed decision is the typed refusal and NOTHING is written.
   */
  async record(input: {
    readonly accountModel?: unknown;
    readonly topology?: unknown;
    readonly recordedBy: string;
    readonly nowIso: string;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly refusal: ConnectDecisionRecordRefusal }> {
    if (typeof input.recordedBy !== "string" || input.recordedBy.trim().length === 0) {
      return {
        ok: false,
        refusal: { kind: "MISSING_RECORDER", detail: "the §B.2 decision record requires its recorder (the approval trail)" },
      };
    }
    if (input.accountModel !== undefined && !isAccountModelDecision(input.accountModel)) {
      return {
        ok: false,
        refusal: {
          kind: "MALFORMED_ACCOUNT_MODEL",
          detail:
            "the account-model decision failed its structural validation (the controller-properties vocabulary + the written record reference — never a default guess)",
        },
      };
    }
    if (input.topology !== undefined && !isTopologyDecision(input.topology)) {
      return {
        ok: false,
        refusal: {
          kind: "MALFORMED_TOPOLOGY",
          detail:
            "the charge-model/liability decision failed its structural validation (the charge model, platform country, MoR + dispute/refund liability and the written record reference — never a default guess)",
        },
      };
    }
    const previous = this.#envelope;
    const envelope: ConnectDecisionEnvelope = {
      version: 1,
      accountModel: input.accountModel !== undefined ? input.accountModel : previous?.accountModel ?? null,
      topology: input.topology !== undefined ? input.topology : previous?.topology ?? null,
      recordedBy: input.recordedBy,
      recordedAt: input.nowIso,
    };
    const json = JSON.stringify(envelope, null, 2);
    // THE ESCAPE LAW: a decision record may never carry secret-shaped
    // material (the decisions carry references, never secrets).
    assertNoStripeSecretShapes(json, "stripe-connect-operator-decisions");
    await this.#fs.mkdir(this.#path.slice(0, this.#path.lastIndexOf("/")));
    await this.#fs.writeFile(this.#path, json);
    this.#envelope = envelope;
    return { ok: true };
  }

  /** The read surface (fail-closed: an unloaded store answers UNSUPPLIED). */
  channel(): StripeConnectOperatorDecisionChannel {
    return {
      decisions: () => this.decisions(),
      metadata: () => this.metadata(),
    };
  }

  decisions(): StripeConnectOperatorDecisions {
    const envelope = this.#envelope;
    if (envelope === null) {
      return {};
    }
    return {
      ...(isAccountModelDecision(envelope.accountModel)
        ? { accountModel: envelope.accountModel }
        : {}),
      ...(isTopologyDecision(envelope.topology) ? { topology: envelope.topology } : {}),
    };
  }

  metadata(): { readonly recordedBy: string | null; readonly recordedAt: string | null } {
    return {
      recordedBy: this.#envelope?.recordedBy ?? null,
      recordedAt: this.#envelope?.recordedAt ?? null,
    };
  }
}
