/**
 * PaySwap Desktop (P27-E, the P27-B lane report §8 — the entitlement seam) —
 * the DURABLE GLOBAL-PAYOUTS OPERATOR ENTITLEMENT CHANNEL: the operator's
 * Treasury-entitlement / funding / P2P-approval proofs as typed, persisted,
 * validated + attributed records (the connect-operator-decisions pattern).
 *
 * THE LAW:
 * - UNCONFIGURED UNTIL SUPPLIED: the shipped state carries NO proof —
 *   proofs() answers {} and every eligibility gate that consumes a proof
 *   keeps its typed OPERATOR_GATED verdict. NEVER a default guess.
 * - RECORDING IS VALIDATED + ATTRIBUTED: a proof lands ONLY through
 *   record(), structurally validated (an entitlement is an OBSERVATION,
 *   never an aspiration; a P2P proof requires BOTH the operator's licence
 *   evidence AND Stripe's written product approval — V5), stamped with the
 *   recorder. A malformed record is the typed refusal and NOTHING is written.
 * - DURABLE (the prepared-action-store pattern): a versioned JSON snapshot
 *   over the injected fs seam, write-then-ack, fail-closed quarantine
 *   (a corrupt store answers UNSUPPLIED), secret-scan on every write.
 * - THE ONLY PROOF SOURCE: the eligibility gates never see caller-supplied
 *   proof strings — the composition forces this channel's records in.
 */

import type { StripeGlobalPayoutsJourneyProofs } from "../../../../../provider-runtime/src/adapters/stripe/catalogue/payouts-eligibility.js";
import { assertNoStripeSecretShapes } from "./stripe-pins.js";

/* -------- the durable operator entitlement channel (the §B.2 pattern) -------- */

/** The injected fs seam (the CONNECTIONS_NODE_FILE_SYSTEM shape). */
export interface GlobalPayoutsEntitlementFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The typed recording refusal (fail-closed; never a thrown string). */
export type GlobalPayoutsEntitlementRecordRefusal =
  | { readonly kind: "MALFORMED_TREASURY_ENTITLEMENT"; readonly detail: string }
  | { readonly kind: "MALFORMED_FUNDING"; readonly detail: string }
  | { readonly kind: "MALFORMED_P2P_APPROVAL"; readonly detail: string }
  | { readonly kind: "MISSING_RECORDER"; readonly detail: string }
  | { readonly kind: "SECRET_SHAPED_MATERIAL"; readonly detail: string };

/** The channel's read surface (what the composition feeds the eligibility gates). */
export interface GlobalPayoutsEntitlementChannel {
  /** The operator's recorded proofs — {} while UNSUPPLIED (the honest default). */
  proofs(): StripeGlobalPayoutsJourneyProofs;
  /** The durable audit trail (metadata only — the proofs carry references, never secrets). */
  metadata(): { readonly recordedBy: string | null; readonly recordedAt: string | null };
}

interface EntitlementEnvelope {
  readonly version: 1;
  readonly proofs: unknown;
  readonly recordedBy: string | null;
  readonly recordedAt: string | null;
}

const emptyEnvelope: EntitlementEnvelope = { version: 1, proofs: {}, recordedBy: null, recordedAt: null };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 512;
}

/**
 * The durable Global-Payouts entitlement channel: the operator's Treasury
 * entitlement, funding and P2P-approval proofs as typed, validated +
 * attributed records (the connect-operator-decisions laws: versioned JSON
 * snapshot, write-then-ack, fail-closed quarantine, secret-scan on every
 * write). Compose ONCE at the host edge over the workspace directory.
 */
export class GlobalPayoutsEntitlementStore {
  readonly #fs: GlobalPayoutsEntitlementFileSystem;
  readonly #path: string;
  #envelope: EntitlementEnvelope = emptyEnvelope;

  constructor(fs: GlobalPayoutsEntitlementFileSystem, directory: string) {
    this.#fs = fs;
    this.#path = `${directory.replace(/\/+$/, "")}/global-payouts-entitlements.json`;
  }

  /** Load the persisted record once (missing/corrupt = the honest UNSUPPLIED state). */
  async load(): Promise<void> {
    try {
      const raw = await this.#fs.readFile(this.#path);
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const envelope = parsed as Partial<EntitlementEnvelope>;
      if (envelope.version !== 1) return;
      this.#envelope = {
        version: 1,
        proofs: typeof envelope.proofs === "object" && envelope.proofs !== null ? envelope.proofs : {},
        recordedBy: typeof envelope.recordedBy === "string" ? envelope.recordedBy : null,
        recordedAt: typeof envelope.recordedAt === "string" ? envelope.recordedAt : null,
      };
    } catch {
      // Missing or corrupt store: the honest UNSUPPLIED state (fail-closed).
    }
  }

  /** The channel's read surface. */
  channel(): GlobalPayoutsEntitlementChannel {
    return {
      proofs: () => this.proofs(),
      metadata: () => ({ recordedBy: this.#envelope.recordedBy, recordedAt: this.#envelope.recordedAt }),
    };
  }

  /** The operator's recorded proofs — {} while UNSUPPLIED (never a default guess). */
  proofs(): StripeGlobalPayoutsJourneyProofs {
    const raw = this.#envelope.proofs;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const record = raw as Record<string, unknown>;
    const proofs: Record<string, unknown> = {};
    const treasury = record.treasuryEntitlement;
    if (treasury !== undefined) {
      if (
        treasury === null || typeof treasury !== "object" || Array.isArray(treasury) ||
        !isNonEmptyString((treasury as Record<string, unknown>).financialAccountId) ||
        (treasury as Record<string, unknown>).entitlementObserved !== true
      ) {
        return {}; // malformed persisted proof = absent (fail-closed, never a guess)
      }
      proofs.treasuryEntitlement = Object.freeze({ ...(treasury as { financialAccountId: string; entitlementObserved: true }) });
    }
    const funding = record.funding;
    if (funding !== undefined) {
      if (
        funding === null || typeof funding !== "object" || Array.isArray(funding) ||
        !Number.isSafeInteger((funding as Record<string, unknown>).fundedMinorUnits) ||
        ((funding as Record<string, unknown>).fundedMinorUnits as number) < 0 ||
        typeof (funding as Record<string, unknown>).currency !== "string" ||
        !/^[A-Z]{3}$/.test((funding as Record<string, unknown>).currency as string)
      ) {
        return {};
      }
      proofs.funding = Object.freeze({ ...(funding as { fundedMinorUnits: number; currency: string }) });
    }
    const p2p = record.p2pLicenceAndProviderApproval;
    if (p2p !== undefined) {
      if (
        p2p === null || typeof p2p !== "object" || Array.isArray(p2p) ||
        !isNonEmptyString((p2p as Record<string, unknown>).licenceEvidenceRef) ||
        !isNonEmptyString((p2p as Record<string, unknown>).providerWrittenApprovalRef)
      ) {
        return {};
      }
      proofs.p2pLicenceAndProviderApproval = Object.freeze({ ...(p2p as { licenceEvidenceRef: string; providerWrittenApprovalRef: string }) });
    }
    return Object.freeze(proofs) as StripeGlobalPayoutsJourneyProofs;
  }

  /** Record the operator's proofs (validated + attributed; a malformed input refuses and writes NOTHING). */
  async record(input: {
    readonly treasuryEntitlement?: { readonly financialAccountId: string; readonly entitlementObserved: boolean };
    readonly funding?: { readonly fundedMinorUnits: number; readonly currency: string };
    readonly p2pLicenceAndProviderApproval?: { readonly licenceEvidenceRef: string; readonly providerWrittenApprovalRef: string };
    readonly recordedBy: string;
    readonly recordedAt: string;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly refusal: GlobalPayoutsEntitlementRecordRefusal }> {
    if (!isNonEmptyString(input.recordedBy)) {
      return { ok: false, refusal: { kind: "MISSING_RECORDER", detail: "the entitlement record must carry its recorder (the operator's approval trail)" } };
    }
    if (input.treasuryEntitlement !== undefined && (input.treasuryEntitlement.entitlementObserved !== true || !isNonEmptyString(input.treasuryEntitlement.financialAccountId))) {
      return { ok: false, refusal: { kind: "MALFORMED_TREASURY_ENTITLEMENT", detail: "a Treasury entitlement proof requires a financial account id and entitlementObserved: true (an observation, never an aspiration)" } };
    }
    if (input.funding !== undefined && (!Number.isSafeInteger(input.funding.fundedMinorUnits) || input.funding.fundedMinorUnits < 0 || !/^[A-Z]{3}$/.test(input.funding.currency))) {
      return { ok: false, refusal: { kind: "MALFORMED_FUNDING", detail: "a funding proof requires minor units (a non-negative integer) and a 3-letter uppercase currency" } };
    }
    if (input.p2pLicenceAndProviderApproval !== undefined && (!isNonEmptyString(input.p2pLicenceAndProviderApproval.licenceEvidenceRef) || !isNonEmptyString(input.p2pLicenceAndProviderApproval.providerWrittenApprovalRef))) {
      return { ok: false, refusal: { kind: "MALFORMED_P2P_APPROVAL", detail: "a P2P proof requires BOTH the operator's licence evidence reference AND Stripe's written product approval reference (V5 — never a blanket approval)" } };
    }
    try {
      assertNoStripeSecretShapes(JSON.stringify(input), "the global-payouts entitlement record");
    } catch (error) {
      return { ok: false, refusal: { kind: "SECRET_SHAPED_MATERIAL", detail: `the entitlement record carries secret-shaped material: ${(error as Error).message}` } };
    }
    const proofs: Record<string, unknown> = {};
    if (input.treasuryEntitlement !== undefined) proofs.treasuryEntitlement = Object.freeze({ ...input.treasuryEntitlement });
    if (input.funding !== undefined) proofs.funding = Object.freeze({ ...input.funding });
    if (input.p2pLicenceAndProviderApproval !== undefined) proofs.p2pLicenceAndProviderApproval = Object.freeze({ ...input.p2pLicenceAndProviderApproval });
    const next: EntitlementEnvelope = { version: 1, proofs, recordedBy: input.recordedBy, recordedAt: input.recordedAt };
    await this.#fs.mkdir(this.#path.slice(0, this.#path.lastIndexOf("/")));
    await this.#fs.writeFile(this.#path, JSON.stringify(next, null, 2));
    this.#envelope = next;
    return { ok: true };
  }
}
