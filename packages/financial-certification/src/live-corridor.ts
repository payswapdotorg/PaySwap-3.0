/**
 * @payswap/financial-certification — LAW 9: no live-corridor claim
 * (P8-W1).
 *
 * The suite is deterministic/hermetic BY LAW: every certification runs
 * over SYNTHETIC, CONTRACT-LEVEL artifacts (the subject's own mapping
 * code over synthetic fixtures — no live provider is contacted, no
 * financial effect is simulated, no provider balance is synthesized).
 *
 * LIVE-CORRIDOR CERTIFICATION IS CREDENTIAL-GATED (the GAP-02 class):
 * it requires real provider credentials and operator authorization that
 * this package does not hold and cannot simulate. The limitation is a
 * FIRST-CLASS exported fact (LIVE_CORRIDOR_LIMITATION), and any artifact
 * that CLAIMS live evidence is rejected outright — no fake success, no
 * mock-as-live, no synthetic provider balance. The honest-UNKNOWN law:
 * this package never claims live certification.
 */

import { LiveCorridorClaimError } from "./errors.ts";

/**
 * The live-corridor limitation, as a typed fact (enabled is the literal
 * false — there is no live mode to enable).
 */
export interface LiveCorridorLimitation {
  readonly enabled: false;
  readonly limitationClass: "GAP-02";
  readonly statement: string;
}

/** THE limitation (frozen; the GAP-02 class, recorded not simulated). */
export const LIVE_CORRIDOR_LIMITATION: LiveCorridorLimitation = Object.freeze({
  enabled: false,
  limitationClass: "GAP-02",
  statement:
    "live-corridor certification is credential-gated and NOT performed by this suite: it requires real provider credentials and operator authorization (the GAP-02 class). This package certifies hermetic, deterministic, contract-level conformance only — no live provider is contacted, no financial effect is simulated, and no live-certification claim is ever made or accepted",
});

/** The limitation accessor (the surface every record/landing cites). */
export function liveCorridorLimitation(): LiveCorridorLimitation {
  return LIVE_CORRIDOR_LIMITATION;
}

/**
 * Evidence kinds that would claim live or simulated-live authority —
 * forbidden in every certification artifact (LAW 9).
 */
export const FORBIDDEN_LIVE_EVIDENCE_KINDS = Object.freeze([
  "LIVE_PROVIDER_EXECUTION",
  "LIVE_CORRIDOR_RUN",
  "MOCK_AS_LIVE",
  "SYNTHETIC_PROVIDER_BALANCE",
] as const);

/**
 * The honest evidence marker for everything this suite certifies: the
 * subject's own mapping/contract code exercised over synthetic
 * fixtures — contract-level conformance, never a live run.
 */
export const HERMETIC_EVIDENCE_KIND = "SYNTHETIC_CONTRACT_LEVEL";

/**
 * True iff an evidence kind claims live or simulated-live authority:
 * an exact forbidden kind, or any kind carrying the LIVE_/MOCK_AS_LIVE
 * claim markers.
 */
export function isForbiddenLiveEvidenceKind(kind: string): boolean {
  if (
    (FORBIDDEN_LIVE_EVIDENCE_KINDS as readonly string[]).includes(kind)
  ) {
    return true;
  }
  return kind.startsWith("LIVE_") || kind.includes("MOCK_AS_LIVE");
}

/** Anything carrying an evidence-kind field (structural view). */
export interface EvidenceKindCarrier {
  readonly kind: string;
}

/**
 * Rejects any artifact that claims live-corridor evidence (LAW 9). The
 * claim is a certification violation of the highest order: it would
 * fabricate authority this package does not hold.
 */
export function assertNoLiveClaims(
  evidence: readonly EvidenceKindCarrier[],
  subject: string,
): void {
  for (const entry of evidence) {
    if (entry === null || typeof entry !== "object" || typeof entry.kind !== "string") {
      throw new LiveCorridorClaimError(
        `${subject}: an evidence entry without a kind is not admissible`,
      );
    }
    if (isForbiddenLiveEvidenceKind(entry.kind)) {
      throw new LiveCorridorClaimError(
        `${subject}: evidence kind '${entry.kind}' claims live-corridor authority (LAW 9 / GAP-02): live certification is credential-gated and can never be claimed by this hermetic suite — resubmit as ${HERMETIC_EVIDENCE_KIND}`,
      );
    }
  }
}
