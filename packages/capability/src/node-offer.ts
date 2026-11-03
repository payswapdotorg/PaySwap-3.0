/**
 * NodeOfferAdmission — the node-network offer CHAIN into the capability
 * plane (P27-D, ADR-0020 D5; the ConnectedCapabilityInstance/observation
 * chain-completeness seam).
 *
 * THE LAW (INV-13 + the P27-0 matrix §6): a node's signed+fresh offer is
 * NECESSARY, the ACCEPTING authority's own provider evidence is DECISIVE.
 * A verified offer admits a route CANDIDATE FACT — never an entitlement,
 * never a rail: the fact carries `isEntitlement: false` and
 * `admitsExecution: false` as literals, and provider/account eligibility,
 * authorization scope and observation freshness are revalidated HERE
 * against the local four-layer chain before anything is admitted.
 *
 * THE WIRE (zero imports — the layer law): the verified-offer input is the
 * STRUCTURAL mirror of @payswap/node-network's verification output
 * (src/offer-verification.ts). capability never imports an intelligence
 * package; the composition root hands the verifier's wire form to this
 * chain, and the structural fidelity is pinned by the route-planning
 * pin-fidelity battery + the P27-E merge-time gate (ADR-0009 D2).
 *
 * Refusals are typed DATA (the ADR-0014 D7 honest-exclusion law): an
 * unsigned/expired/revoked/fixture offer or a non-ACTIVE/not-eligible/
 * not-available local instance contributes NOTHING, with every reason
 * retained.
 */

import { ValidationError } from './errors.ts';
import { isNonEmptyString, isRecord } from './shared.ts';
import type { ConnectedCapabilityInstance } from './connected-instance.ts';
import type { CapabilityObservation } from './observation.ts';

/** The node-offer admission vocabulary version. */
export const NODE_OFFER_ADMISSION_VERSION = '1.0.0' as const;

/**
 * The typed admission-refusal codes (stable identities; the every-reason
 * law — an admission records EVERY failed gate, never just the first).
 */
export const NODE_OFFER_REFUSAL_CODES = Object.freeze([
  'OFFER_NOT_VERIFIED',
  'OFFER_FIXTURE_NODE',
  'OFFER_INSTANCE_NOT_BOUND',
  'INSTANCE_NOT_ACTIVE',
  'INSTANCE_NOT_ELIGIBLE',
  'OBSERVATION_NOT_AVAILABLE',
  'OBSERVATION_INSTANCE_MISMATCH',
  'OBSERVATION_ELIGIBILITY_UNKNOWN',
] as const);

export type NodeOfferRefusalCode = (typeof NODE_OFFER_REFUSAL_CODES)[number];

/**
 * STRUCTURAL PIN (authority: @payswap/node-network src/offer-verification.ts
 * + src/offer.ts) — the verified-offer wire the composition root hands to
 * this chain: the offer's identity/constraints/custody plus the verifier's
 * verdict. SUBSET-typed: a genuine node-network verification output remains
 * structurally assignable; this pin can never widen an authority law.
 */
export interface VerifiedNodeOfferWire {
  readonly offerId: string;
  readonly nodeId: string;
  readonly boundInstanceIds: readonly string[];
  /** The explicit custody role (the ADR-0020 D5 role vocabulary). */
  readonly custodyRole: string;
  /**
   * The node's D8 licence/programme approval references (carried ON the
   * signed offer — ADR-0020 D8: a custody-bearing leg is eligible only
   * when the operating node presents this evidence as a route
   * precondition; EMPTY is honest absence, never a fabricated approval).
   */
  readonly custodyProgrammeRefs: readonly string[];
  readonly constraints: {
    readonly sourceCountries: readonly string[];
    readonly destinationCountries: readonly string[];
    readonly currencies: readonly string[];
    /** The §5 transaction classes the node will carry. */
    readonly purposes: readonly string[];
  };
  readonly verification: {
    /** Only a VERIFIED offer can admit anything (D5: signed+fresh is necessary). */
    readonly verdict: 'VERIFIED';
    readonly verifiedAt: string;
    readonly nodeEnrollmentMode: 'OPERATOR_ENROLLED' | 'FIXTURE';
  };
}

/** One typed admission-refusal reason. */
export interface NodeOfferRefusal {
  readonly code: NodeOfferRefusalCode;
  readonly message: string;
}

/**
 * The admitted candidate FACT — a discovery input, NEVER an entitlement:
 * the literals are the law (INV-13; ADR-0020 D5 — the accepting route
 * authority revalidated this offer against its own provider evidence; the
 * route-planning eligibility gates still run BEFORE any ranking).
 */
export interface NodeOfferCapabilityFact {
  readonly factVersion: string;
  readonly discoveryTier: 'CANDIDATE_FACT';
  readonly offerId: string;
  readonly nodeId: string;
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly constraints: VerifiedNodeOfferWire['constraints'];
  readonly custodyRole: string;
  /** The node's D8 licence/programme references, carried verbatim from the signed offer. */
  readonly custodyProgrammeRefs: readonly string[];
  readonly lineage: {
    readonly instanceId: string;
    readonly implementationId: string;
    readonly capabilityId: string;
    readonly observationVersion: number;
    readonly observedAt: string;
    readonly offerVerifiedAt: string;
    readonly instanceAuthorizationRef?: string;
  };
  readonly revalidationEvidence: {
    readonly instanceAuthorization: 'ACTIVE';
    readonly effectiveAvailability: 'AVAILABLE';
    readonly instanceEligible: true;
    readonly observationEligibility: 'ELIGIBLE';
  };
  readonly isEntitlement: false;
  readonly admitsExecution: false;
}

/** The admission outcome: the fact, or the typed refusals (never a throw for gate failures). */
export type NodeOfferAdmission =
  | { readonly admitted: true; readonly fact: NodeOfferCapabilityFact }
  | { readonly admitted: false; readonly offerId: string; readonly refusals: readonly NodeOfferRefusal[] };

function parseOfferWire(candidate: unknown): VerifiedNodeOfferWire {
  if (!isRecord(candidate)) {
    throw new ValidationError('a verified node offer wire must be an object');
  }
  for (const field of ['offerId', 'nodeId', 'custodyRole'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      throw new ValidationError(`the offer wire must carry a non-empty ${field}`);
    }
  }
  if (
    !Array.isArray(candidate['boundInstanceIds']) ||
    candidate['boundInstanceIds'].length === 0 ||
    !(candidate['boundInstanceIds'] as readonly unknown[]).every(isNonEmptyString)
  ) {
    throw new ValidationError(
      'the offer wire must carry its non-empty boundInstanceIds (an offer is bound to real instances, D5)',
    );
  }
  if (
    !Array.isArray(candidate['custodyProgrammeRefs']) ||
    !(candidate['custodyProgrammeRefs'] as readonly unknown[]).every(isNonEmptyString)
  ) {
    throw new ValidationError(
      'the offer wire must carry its custodyProgrammeRefs (an array of licence/programme reference strings; EMPTY is honest absence — D8)',
    );
  }
  const constraints = candidate['constraints'];
  if (
    !isRecord(constraints) ||
    !Array.isArray(constraints['sourceCountries']) ||
    !Array.isArray(constraints['destinationCountries']) ||
    !Array.isArray(constraints['currencies']) ||
    !Array.isArray(constraints['purposes'])
  ) {
    throw new ValidationError(
      'the offer wire must carry its constraint set (countries, currencies, purposes)',
    );
  }
  const verification = candidate['verification'];
  if (
    !isRecord(verification) ||
    !isNonEmptyString(verification['verifiedAt']) ||
    (verification['nodeEnrollmentMode'] !== 'OPERATOR_ENROLLED' &&
      verification['nodeEnrollmentMode'] !== 'FIXTURE')
  ) {
    throw new ValidationError(
      'the offer wire must carry the verifier record (verifiedAt + the node enrollment mode)',
    );
  }
  return candidate as unknown as VerifiedNodeOfferWire;
}

/**
 * Admit a verified node offer into the capability plane as a CANDIDATE
 * FACT: revalidate against the LOCAL four-layer evidence — the bound
 * instance must be the presented ConnectedCapabilityInstance (INV-13: the
 * ONLY authorization scope; a catalogue entry is structurally
 * unconstructible here), the authorization ACTIVE, the instance eligible,
 * and the observation AVAILABLE + ELIGIBLE + instance-matched. Every
 * failed gate contributes a typed refusal; an admission with any refusal
 * admits NOTHING.
 */
export function admitNodeOffer(input: {
  readonly offer: unknown;
  readonly instance: ConnectedCapabilityInstance;
  readonly observation: CapabilityObservation;
}): NodeOfferAdmission {
  const offer = parseOfferWire(input.offer);
  const refusals: NodeOfferRefusal[] = [];
  if (offer.verification.verdict !== 'VERIFIED') {
    refusals.push({
      code: 'OFFER_NOT_VERIFIED',
      message:
        "the offer's verification verdict is not VERIFIED — an unsigned, expired, revoked or otherwise unverified offer contributes nothing (D5: signed and fresh is necessary)",
    });
  }
  if (offer.verification.nodeEnrollmentMode !== 'OPERATOR_ENROLLED') {
    refusals.push({
      code: 'OFFER_FIXTURE_NODE',
      message:
        'the publishing node is a FIXTURE enrollment and is never promotable (ADR-0020 D11) — a fixture node offer is test-tier only',
    });
  }
  if (!(offer.boundInstanceIds as readonly string[]).includes(input.instance.instanceId)) {
    refusals.push({
      code: 'OFFER_INSTANCE_NOT_BOUND',
      message: `the offer binds instances [${offer.boundInstanceIds.join(', ')}] but the presented local instance is '${input.instance.instanceId}' — the chain does not complete`,
    });
  }
  if (input.instance.authorization.status !== 'ACTIVE') {
    refusals.push({
      code: 'INSTANCE_NOT_ACTIVE',
      message: `the local connected instance authorization is '${input.instance.authorization.status}' — only an ACTIVE authorization can serve an eligible rail (INV-13)`,
    });
  }
  if (input.instance.eligibility.eligible !== true) {
    refusals.push({
      code: 'INSTANCE_NOT_ELIGIBLE',
      message: `the local provider evidence marks the instance not eligible (${input.instance.eligibility.reasons.join('; ')}) — provider evidence is decisive (§6)`,
    });
  }
  if (input.observation.instanceId !== input.instance.instanceId) {
    refusals.push({
      code: 'OBSERVATION_INSTANCE_MISMATCH',
      message: `the observation belongs to instance '${input.observation.instanceId}', not the presented '${input.instance.instanceId}' — the four-layer chain must complete`,
    });
  }
  if (input.observation.availability !== 'AVAILABLE') {
    refusals.push({
      code: 'OBSERVATION_NOT_AVAILABLE',
      message: `the observation's effective availability is '${input.observation.availability}' — only an AVAILABLE observation admits a candidate (UNKNOWN is never success)`,
    });
  }
  if (input.observation.eligibility !== 'ELIGIBLE') {
    refusals.push({
      code: 'OBSERVATION_ELIGIBILITY_UNKNOWN',
      message: `the observation's eligibility is '${input.observation.eligibility}' — a NOT_ELIGIBLE or UNKNOWN observation never admits a candidate`,
    });
  }
  if (refusals.length > 0) {
    return Object.freeze({
      admitted: false as const,
      offerId: offer.offerId,
      refusals: Object.freeze(refusals),
    });
  }
  const fact: NodeOfferCapabilityFact = Object.freeze({
    factVersion: NODE_OFFER_ADMISSION_VERSION,
    discoveryTier: 'CANDIDATE_FACT' as const,
    offerId: offer.offerId,
    nodeId: offer.nodeId,
    instanceId: input.instance.instanceId,
    capabilityId: input.instance.capabilityId,
    implementationId: input.instance.implementationId,
    providerName: input.instance.providerName,
    constraints: offer.constraints,
    custodyRole: offer.custodyRole,
    custodyProgrammeRefs: Object.freeze([...offer.custodyProgrammeRefs]),
    lineage: Object.freeze({
      instanceId: input.instance.instanceId,
      implementationId: input.instance.implementationId,
      capabilityId: input.instance.capabilityId,
      observationVersion: input.observation.observationVersion,
      observedAt: input.observation.observedAt,
      offerVerifiedAt: offer.verification.verifiedAt,
      ...(input.instance.authorization.authorizationRef !== undefined
        ? { instanceAuthorizationRef: input.instance.authorization.authorizationRef }
        : {}),
    }),
    revalidationEvidence: Object.freeze({
      instanceAuthorization: 'ACTIVE' as const,
      effectiveAvailability: 'AVAILABLE' as const,
      instanceEligible: true as const,
      observationEligibility: 'ELIGIBLE' as const,
    }),
    isEntitlement: false as const,
    admitsExecution: false as const,
  });
  return Object.freeze({ admitted: true as const, fact });
}
