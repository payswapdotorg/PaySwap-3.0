/**
 * PaySwap Desktop (P27-E, the P27-C lane report §7 composition seams) — the
 * PAYSTACK AFRICA CORRIDOR COMPOSITION: the station's typed records for the
 * K3/K4 evidence law and the corridor's KES arrival seam (the C1 endpoint
 * rows landed at host-https-transports.ts with their own mirror battery;
 * this module is the remaining §7 seam):
 *
 * - THE EVIDENCE LANDING RECORD (§7.2): the recipient-type registry SHIPS
 *   EMPTY — paystack.com was station-unreachable (the typed station record:
 *   eight attempt URLs, DNS_NXDOMAIN / CLOUDFLARE_MANAGED_CHALLENGE_403 /
 *   CONNECTION_TIMEOUT / RATE_LIMITED_429, the full honest attempt trail in
 *   the lane report §3). The evidence lands ONLY as re-verified dated
 *   observations — one per (type × country × currency) with the re-verified
 *   wire fields and the institution-exclusion refs — into
 *   PAYSTACK_RECIPIENT_TYPE_EVIDENCE (or the injected fresher registry: the
 *   D10 freshness seam). Until then every recipient create refuses
 *   PAYSTACK_RECIPIENT_TYPE_UNVERIFIED fail-closed — the machinery is
 *   complete; nothing unverified is ever encoded.
 * - THE CORRIDOR KES ARRIVAL SEAM (§7.5): the recipient association
 *   (defineCorridorKesPaystackRecipientReceiving) is composed at the host
 *   edge over the REAL merchant module (the saga-composite-binding
 *   precedent: the workspace source by relative path, never a parallel
 *   kernel). The seam's own law: the KES arrival composes ONLY on a
 *   VERIFIED (KE, KES) observation in the evidence registry — the shipped
 *   EMPTY registry answers the typed CONDITIONAL refusal (never a route,
 *   never a silent pass); with the observation present, the merchant
 *   module's own validation is THE enforcement (the association's evidence
 *   must agree with the registry's verified observation).
 * - THE HARNESS NAMING MAP (§7.4): the run card §D names per-business keys
 *   (PAYSTACK_SECRET_KEY_<BUSINESS>); the c1 harness reads the primary
 *   PAYSTACK_SECRET_KEY (+ its documented companions). The convention maps
 *   1:1 — the operator sources the per-business env var into the harness
 *   primary for each run. Recorded typed here so the two names can never
 *   drift apart silently.
 */

import {
  PAYSTACK_RECIPIENT_FACTS_STATION_RECORD,
  PAYSTACK_RECIPIENT_TYPE_EVIDENCE,
  paystackRecipientTypeEvidenceFor,
  type PaystackRecipientTypeEvidence,
} from "../../../../../provider-runtime/src/adapters/paystack/recipient-facts.js";
import {
  defineCorridorKesPaystackRecipientReceiving,
  type CorridorKesPaystackRecipientReceivingContext,
  type PinnedPaystackKesRecipientType,
} from "../../../../../merchant/src/kes-receiving.js";
import type { ValidationError } from "../../../../../merchant/src/errors.js";

/* ---------------- the typed records (§7.2/§7.4) ---------------- */

/** §7.2 — the K3/K4 evidence landing record (the registry ships EMPTY; the law is typed). */
export const PAYSTACK_AFRICA_EVIDENCE_LANDING_RECORD = Object.freeze({
  registryShips: "EMPTY" as const,
  stationConclusion: PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.conclusion,
  stationAttemptedAt: PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attemptedAt,
  attemptCount: PAYSTACK_RECIPIENT_FACTS_STATION_RECORD.attempts.length,
  landingLaw:
    "one dated observation per (type × country × currency) with the re-verified required wire fields and the institution-exclusion refs lands in PAYSTACK_RECIPIENT_TYPE_EVIDENCE (or the injected fresher registry — the D10 freshness seam) only after the live-doc re-verification AND the real-account probe; until then every recipient create refuses PAYSTACK_RECIPIENT_TYPE_UNVERIFIED fail-closed",
  candidatesClaimedNeverEncoded:
    "the registration-claimed candidate vocabulary (ghipss/mobile_money/nuban/basa/kepss) ships as NAMES ONLY — no recipient/country/method/limit fact is encoded while K3/K4 remain unverified",
});

/** §7.4 — the harness naming map (the run card §D ↔ the c1 harness, 1:1). */
export const PAYSTACK_HARNESS_ENV_NAMING_MAP = Object.freeze({
  runCardConvention: "PAYSTACK_SECRET_KEY_<BUSINESS>" as const,
  harnessPrimary: "PAYSTACK_SECRET_KEY" as const,
  mapping:
    "the run card §D names one key per participating business; the c1 harness reads the primary PAYSTACK_SECRET_KEY (+ its documented companions). The convention maps 1:1: source the per-business env var into PAYSTACK_SECRET_KEY for that business's harness run — never a second secret channel",
} as const);

/** §7.5 — the corridor's KES arrival conditional (the honest state, typed). */
export const KE_KES_CORRIDOR_CONDITION = Object.freeze({
  status: "OBSERVATION_UNVERIFIED" as const,
  detail:
    "the corridor's KES arrival association is composed and ready (defineCorridorKesPaystackRecipientReceiving over the REAL merchant module); the shipped evidence registry is EMPTY because no verified (KE, KES) observation exists — the arrival composes the moment the re-verified observation lands, and not one plan earlier",
});

/* ---------------- the corridor KES arrival seam ---------------- */

/** The typed conditional refusal (fail-closed; never a thrown string). */
export type KesArrivalRefusal =
  | { readonly kind: "KE_KES_OBSERVATION_UNVERIFIED"; readonly detail: string }
  | { readonly kind: "ASSOCIATION_REFUSED"; readonly detail: string };

/** What the seam composes over (the evidence registry is injectable — the D10 freshness seam). */
export interface PaystackAfricaCorridorSeamInput {
  /** The dated-evidence registry (defaults to the shipped EMPTY registry — the honest state). */
  readonly evidenceRegistry?: readonly PaystackRecipientTypeEvidence[];
}

/** The composed corridor KES arrival seam. */
export interface ComposedPaystackAfricaCorridorSeam {
  /** The evidence registry the seam reads (the shipped EMPTY registry by default). */
  readonly evidenceRegistry: readonly PaystackRecipientTypeEvidence[];
  /**
   * The corridor's KES arrival: the REAL receiving-context association over
   * the merchant module — composed ONLY on a VERIFIED (KE, KES) observation.
   */
  readonly kesArrival: (input: {
    readonly destinationId: string;
    readonly bankInstrumentRef: string;
    readonly paystackRecipient: {
      readonly recipientCode: string;
      readonly recipientType: PinnedPaystackKesRecipientType;
      readonly evidence: {
        readonly recipientType: PinnedPaystackKesRecipientType;
        readonly country: "KE";
        readonly currency: "KES";
        readonly status: "VERIFIED_AVAILABLE";
        readonly sourceUrl: string;
        readonly retrievedAt: string;
      };
    };
    readonly provenance: {
      readonly source: string;
      readonly reference: string;
      readonly recordedAt: bigint;
    };
    readonly conversionChain: readonly string[];
  }) => Promise<
    | { readonly ok: true; readonly context: CorridorKesPaystackRecipientReceivingContext }
    | { readonly ok: false; readonly refusal: KesArrivalRefusal }
  >;
}

/** Compose the corridor KES arrival seam (the evidence gate + the REAL association). */
export function composePaystackAfricaCorridorSeam(
  input: PaystackAfricaCorridorSeamInput = {},
): ComposedPaystackAfricaCorridorSeam {
  const evidenceRegistry = input.evidenceRegistry ?? PAYSTACK_RECIPIENT_TYPE_EVIDENCE;
  const kesArrival: ComposedPaystackAfricaCorridorSeam["kesArrival"] = async (arrival) => {
    // THE EVIDENCE GATE (the lane's own law, composed): a verified (KE, KES)
    // observation in the registry — the shipped EMPTY registry refuses here.
    const observation = paystackRecipientTypeEvidenceFor(
      evidenceRegistry,
      arrival.paystackRecipient.recipientType,
      "KE",
      "KES",
    );
    if (observation === undefined) {
      return {
        ok: false,
        refusal: {
          kind: "KE_KES_OBSERVATION_UNVERIFIED",
          detail:
            `no VERIFIED (${arrival.paystackRecipient.recipientType}, KE, KES) observation exists in the evidence registry ` +
            "(K3/K4 unverified at the station — the registry ships EMPTY); the corridor's KES arrival is a conditional opportunity, never a route",
        },
      };
    }
    // THE REAL ASSOCIATION (the merchant module's own validation is THE
    // enforcement — the association's evidence must agree with the verified
    // observation; a mismatched or malformed association refuses typed).
    try {
      const context = defineCorridorKesPaystackRecipientReceiving({
        destinationId: arrival.destinationId,
        bankInstrumentRef: arrival.bankInstrumentRef,
        paystackRecipient: Object.freeze({
          recipientCode: arrival.paystackRecipient.recipientCode,
          recipientType: arrival.paystackRecipient.recipientType,
          evidence: Object.freeze({ ...arrival.paystackRecipient.evidence }),
        }),
        provenance: Object.freeze({ ...arrival.provenance }),
        conversionChain: Object.freeze([...arrival.conversionChain]),
      });
      return { ok: true, context };
    } catch (error) {
      return {
        ok: false,
        refusal: { kind: "ASSOCIATION_REFUSED", detail: (error as ValidationError).message },
      };
    }
  };
  return Object.freeze({ evidenceRegistry, kesArrival });
}
