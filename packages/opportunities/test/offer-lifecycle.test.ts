import { describe, expect, it } from "vitest";
import {
  DiscoveryExecutionRejectedError,
  InvalidOpportunityError,
  SecretMaterialError,
  ValidationError,
  discoverOpportunity,
} from "../src/index.ts";
import {
  OFFER_KIND,
  OFFER_STATES,
  OfferLifecycleError,
  declineOffer,
  offerEventId,
  offerIsExpired,
  offerIsLive,
  offerPermitsExecution,
  publishOffer,
  rejectOfferForExecution,
  revokeOffer,
  validateEvidenceBackedOffer,
} from "../src/offer-lifecycle.ts";
import type { OfferPublicationInput } from "../src/offer-lifecycle.ts";
import { NOW, healthyLiquidityObservation } from "./fixtures-catalog.ts";

/**
 * The evidence-backed offer lifecycle (P16-C, gap-matrix row C5): offers
 * derive ONLY from validated opportunities; explicit opt-in; time-bounded
 * expiry; decline/revoke with append-only history; deterministic event
 * ids; frozen records; the offer-never-dispatches literal law.
 */
describe("the evidence-backed offer lifecycle", () => {
  const asOpportunity = (value: unknown) => value as ReturnType<typeof discoverOpportunity>;
  const offerInput = {
    offerId: "offer:liq:001",
    optIn: { participantRef: "participant:node-1", optedInAt: NOW - 1_000 },
    expiresAt: NOW + 60_000,
  };
  const liquidity = () => discoverOpportunity(healthyLiquidityObservation(), NOW);

  it("publishes an evidence-backed offer from a validated opportunity (deterministic event ids, frozen)", () => {
    const opportunity = liquidity();
    const offer = publishOffer(opportunity, offerInput, NOW);
    expect(offer.offerKind).toBe(OFFER_KIND);
    expect(offer.offerId).toBe("offer:liq:001");
    expect(offer.opportunityId).toBe(opportunity.opportunityId);
    expect(offer.family).toBe("liquidity");
    expect(offer.railKey).toBe("ethereum:mainnet");
    expect(offer.summary).toBe(opportunity.title);
    expect(offer.state).toBe("OPEN");
    expect(offer.publishedAt).toBe(NOW);
    expect(offer.expiresAt).toBe(NOW + 60_000);
    expect(offer.optIn.participantRef).toBe("participant:node-1");
    expect(offer.optIn.optedInAt).toBe(NOW - 1_000);
    expect(offer.events).toHaveLength(1);
    expect(offer.events[0]?.eventId).toBe(offerEventId("offer:liq:001", 0));
    expect(offer.events[0]?.kind).toBe("PUBLISHED");
    expect(offer.discoveryTier).toBe("DISCOVERY_NEVER_AUTHORIZATION");
    expect(Object.isFrozen(offer)).toBe(true);
    expect(Object.isFrozen(offer.events)).toBe(true);
    expect(Object.isFrozen(offer.events[0])).toBe(true);
    expect(Object.isFrozen(offer.optIn)).toBe(true);
  });

  it("offers are derived ONLY from validated opportunities (the full model validator is the construction gate)", () => {
    expect(() => publishOffer(asOpportunity({}), offerInput, NOW)).toThrow(InvalidOpportunityError);
    expect(() =>
      publishOffer(asOpportunity({ observationKind: "FinancialOpportunity" }), offerInput, NOW),
    ).toThrow(InvalidOpportunityError);
    // An opportunity with a broken lineage (no evidence chain) is never an offer source.
    const forged = { ...liquidity(), supportingObservations: [] };
    expect(() => publishOffer(asOpportunity(forged), offerInput, NOW)).toThrow(InvalidOpportunityError);
  });

  it("the explicit opt-in law: the opt-in PRECEDES the offer (fail closed)", () => {
    const opportunity = liquidity();
    expect(() =>
      publishOffer(opportunity, { ...offerInput, optIn: { participantRef: "participant:node-1", optedInAt: NOW + 1 } }, NOW),
    ).toThrow(OfferLifecycleError);
    expect(() =>
      publishOffer(opportunity, { ...offerInput, optIn: { participantRef: "", optedInAt: NOW - 1 } }, NOW),
    ).toThrow(OfferLifecycleError);
    expect(() =>
      publishOffer(opportunity, { ...offerInput, optIn: undefined as unknown as OfferPublicationInput["optIn"] }, NOW),
    ).toThrow(OfferLifecycleError);
    expect(() => publishOffer(opportunity, { ...offerInput, offerId: "" }, NOW)).toThrow(OfferLifecycleError);
  });

  it("time-bounded expiry: expired-on-arrival is malformed; expiry is read-time at the caller instant", () => {
    const opportunity = liquidity();
    expect(() => publishOffer(opportunity, { ...offerInput, expiresAt: NOW }, NOW)).toThrow(OfferLifecycleError);
    expect(() => publishOffer(opportunity, { ...offerInput, expiresAt: NOW - 1 }, NOW)).toThrow(OfferLifecycleError);
    const offer = publishOffer(opportunity, offerInput, NOW);
    expect(offerIsExpired(offer, NOW + 59_999)).toBe(false);
    expect(offerIsExpired(offer, NOW + 60_000)).toBe(true);
    expect(offerIsLive(offer, NOW)).toBe(true);
    expect(offerIsLive(offer, NOW - 1)).toBe(false);
    expect(offerIsLive(offer, NOW + 60_000)).toBe(false);
  });

  it("decline appends the DECLINED event and returns a NEW record (append-only history)", () => {
    const offer = publishOffer(liquidity(), offerInput, NOW);
    const declined = declineOffer(offer, NOW + 1_000);
    expect(declined.state).toBe("DECLINED");
    expect(declined.events).toHaveLength(2);
    expect(declined.events[1]?.kind).toBe("DECLINED");
    expect(declined.events[1]?.eventId).toBe(offerEventId("offer:liq:001", 1));
    expect(declined.events[1]?.recordedAt).toBe(NOW + 1_000);
    // Append-only: the SOURCE record is untouched (still OPEN, one event).
    expect(offer.state).toBe("OPEN");
    expect(offer.events).toHaveLength(1);
    expect(Object.isFrozen(declined)).toBe(true);
    expect(Object.isFrozen(declined.events)).toBe(true);
  });

  it("revoke is unilateral (OPEN or DECLINED) and terminal; terminal transitions fail closed", () => {
    const offer = publishOffer(liquidity(), offerInput, NOW);
    const revoked = revokeOffer(offer, NOW + 500);
    expect(revoked.state).toBe("REVOKED");
    expect(revoked.events).toHaveLength(2);
    const declined = declineOffer(publishOffer(liquidity(), offerInput, NOW), NOW + 100);
    const revokedLate = revokeOffer(declined, NOW + 200);
    expect(revokedLate.state).toBe("REVOKED");
    expect(revokedLate.events).toHaveLength(3);
    expect(() => declineOffer(declined, NOW + 300)).toThrow(OfferLifecycleError);
    expect(() => declineOffer(revoked, NOW + 300)).toThrow(OfferLifecycleError);
    expect(() => revokeOffer(revoked, NOW + 300)).toThrow(OfferLifecycleError);
  });

  it("lifecycle transitions are causal (no event before the publication instant)", () => {
    const offer = publishOffer(liquidity(), offerInput, NOW);
    expect(() => declineOffer(offer, NOW - 1)).toThrow(OfferLifecycleError);
    expect(() => revokeOffer(offer, NOW - 1)).toThrow(OfferLifecycleError);
  });

  it("validateEvidenceBackedOffer round-trips a published offer (deep-frozen)", () => {
    const offer = publishOffer(liquidity(), offerInput, NOW);
    const validated = validateEvidenceBackedOffer(offer);
    expect(validated).toEqual(offer);
    expect(validated).not.toBe(offer);
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.events[0])).toBe(true);
  });

  it("validateEvidenceBackedOffer fails closed on forged records (aggregated errors)", () => {
    const offer = publishOffer(liquidity(), offerInput, NOW);
    const clone = () => JSON.parse(JSON.stringify(offer)) as typeof offer;
    expect(() => validateEvidenceBackedOffer({ ...clone(), offerKind: "CommandOffer" })).toThrow(OfferLifecycleError);
    expect(() => validateEvidenceBackedOffer({ ...clone(), discoveryTier: "EXECUTION_TIER" })).toThrow(/DISCOVERY_NEVER_AUTHORIZATION/);
    expect(() => validateEvidenceBackedOffer({ ...clone(), offerId: "" })).toThrow(OfferLifecycleError);
    const badEventId = clone();
    (badEventId.events[0] as { eventId: string }).eventId = "offer-event:wrong:9";
    expect(() => validateEvidenceBackedOffer(badEventId)).toThrow(/deterministic identity/);
    const badState = clone();
    (badState as { state: string }).state = "DECLINED";
    expect(() => validateEvidenceBackedOffer(badState)).toThrow(/the event history derives the state/);
    const badSequence = clone();
    (badSequence.events as unknown[]).push({ eventId: offerEventId("offer:liq:001", 1), kind: "PUBLISHED", recordedAt: NOW + 1 });
    expect(() => validateEvidenceBackedOffer(badSequence)).toThrow(/reserved for element zero/);
    try {
      validateEvidenceBackedOffer({});
      expect.unreachable("a forged offer must fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(OfferLifecycleError);
      expect((error as OfferLifecycleError).errors?.length).toBeGreaterThan(1);
    }
  });

  it("the vocabulary law holds on the offer's human surface (defense in depth at read time)", () => {
    const offer = publishOffer(liquidity(), offerInput, NOW);
    const tampered = JSON.parse(JSON.stringify(offer)) as typeof offer;
    (tampered as { summary: string }).summary = "a guaranteed return for the opted-in participant";
    expect(() => validateEvidenceBackedOffer(tampered)).toThrow(OfferLifecycleError);
    expect(() => validateEvidenceBackedOffer(tampered)).toThrow(/guaranteed/);
  });

  it("the secret-free law: an offer carrying credential-shaped material cannot be published", () => {
    // Assembled at runtime from fragments (no full secret shape in source).
    const secretShapedTitle = ["sk", "a1b2c3d4e5f6g7h8i9j0"].join("-");
    const input = { ...healthyLiquidityObservation(), title: secretShapedTitle };
    const opportunity = discoverOpportunity(input, NOW);
    expect(() => publishOffer(opportunity, offerInput, NOW)).toThrow(SecretMaterialError);
  });

  it("the offer-never-dispatches law: the literal false + the always-throwing execution gate", () => {
    expect(offerPermitsExecution()).toBe(false);
    const offer = publishOffer(liquidity(), offerInput, NOW);
    expect(() => rejectOfferForExecution(offer)).toThrow(DiscoveryExecutionRejectedError);
    expect(() => rejectOfferForExecution(offer)).toThrow(/never a command or authorization/);
    expect(() => rejectOfferForExecution({})).toThrow(DiscoveryExecutionRejectedError);
    expect(new OfferLifecycleError("x")).toBeInstanceOf(ValidationError);
    expect([...OFFER_STATES]).toEqual(["OPEN", "DECLINED", "REVOKED"]);
  });

  it("byte-identical determinism: same opportunity, input and instant -> identical offers", () => {
    const opportunity = liquidity();
    const first = publishOffer(opportunity, offerInput, NOW);
    const second = publishOffer(opportunity, offerInput, NOW);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const declinedFirst = declineOffer(first, NOW + 5_000);
    const declinedSecond = declineOffer(second, NOW + 5_000);
    expect(JSON.stringify(declinedFirst)).toBe(JSON.stringify(declinedSecond));
  });

  it("the publication and evaluation instants are caller-supplied (RangeError on negative/fractional)", () => {
    const opportunity = liquidity();
    expect(() => publishOffer(opportunity, offerInput, -1)).toThrow(RangeError);
    expect(() => publishOffer(opportunity, offerInput, 0.5)).toThrow(RangeError);
    const offer = publishOffer(opportunity, offerInput, NOW);
    expect(() => declineOffer(offer, -1)).toThrow(RangeError);
    expect(() => offerIsExpired(offer, -1)).toThrow(RangeError);
    expect(() => offerIsLive(offer, 2.5)).toThrow(RangeError);
  });
});
