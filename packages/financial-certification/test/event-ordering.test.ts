import { describe, expect, it } from "vitest";
import {
  canonicalTotalOrder,
  certifyOrderIndependence,
  reconcileProviderEvents,
} from "../src/index.ts";
import type { CertifiedProviderEvent } from "../src/index.ts";
import { SYNTHETIC_PROVIDER, conformingEventSet } from "./fixtures.ts";

/**
 * FIN-LAW-04 — event ordering robustness (hard law 4): duplicate
 * commands/events, out-of-order provider events and delayed returns
 * resolve deterministically to the SAME reconciled state
 * (order-independence with a total-order proof).
 */
describe("FIN-LAW-04: event ordering robustness", () => {
  it("the out-of-order + duplicate + delayed event set folds to the canonical (newest) state", () => {
    const state = reconcileProviderEvents(conformingEventSet());
    const payout = state.objects.find((o) => o.externalId === "obj:payout-1");
    expect(payout).toBeDefined();
    expect(payout?.lifecycleStep).toBe("BENEFICIARY_CREDITED");
    expect(payout?.canonicalRevision).toBe(4);
    expect(payout?.terminal).toBe(true);
    expect(payout?.observations.map((o) => o.revision)).toEqual([1, 2, 3, 4]);
    // The duplicate delivery was harmless (deduped, counted).
    expect(state.duplicateEventCount).toBe(1);
    expect(payout?.duplicateEventIds).toEqual(["evt:3"]);
    // The late-arriving older revisions are retained and superseded.
    expect(payout?.supersededRevisions).toEqual([1, 2, 3]);
  });

  it("the conforming event set certifies order-independent (verdict passes)", () => {
    const verdict = certifyOrderIndependence({
      subjectRef: "corridor:test",
      events: conformingEventSet(),
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it("EVERY arrival permutation folds to the byte-identical reconciled digest", () => {
    const events = conformingEventSet();
    const canonical = reconcileProviderEvents(canonicalTotalOrder(events));
    // Exhaustive permutation proof over a 4-event subset (4! = 24 orders).
    const subset = events.filter((e) => e.externalId === "obj:payout-1");
    const unique = subset.filter(
      (e, index) => subset.findIndex((x) => x.eventId === e.eventId) === index,
    );
    expect(unique.length).toBe(4);
    const permutations: CertifiedProviderEvent[][] = [];
    const permute = (head: CertifiedProviderEvent[], tail: CertifiedProviderEvent[]): void => {
      if (tail.length === 0) {
        permutations.push([...head]);
        return;
      }
      for (let i = 0; i < tail.length; i += 1) {
        permute(
          [...head, tail[i] as CertifiedProviderEvent],
          [...tail.slice(0, i), ...tail.slice(i + 1)],
        );
      }
    };
    permute([], unique);
    expect(permutations.length).toBe(24);
    const subsetDigest = reconcileProviderEvents(unique).digest;
    for (const permutation of permutations) {
      const folded = reconcileProviderEvents(permutation);
      expect(folded.digest).toBe(subsetDigest);
    }
    // And the whole set (both objects) is permutation-stable too.
    const whole = reconcileProviderEvents(events);
    expect(
      reconcileProviderEvents([...events].reverse()).digest,
    ).toBe(whole.digest);
  });

  it("the total order is deterministic and complete (a genuine permutation of the set)", () => {
    const events = conformingEventSet();
    const ordered = canonicalTotalOrder(events);
    expect(ordered.length).toBe(events.length);
    expect([...ordered].sort((a, b) => a.eventId.localeCompare(b.eventId))).toEqual(
      [...events].sort((a, b) => a.eventId.localeCompare(b.eventId)),
    );
    const keys = ordered.map((e) => `${e.providerName}|${e.externalId}|${String(e.revision).padStart(4, "0")}|${e.eventId}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it("a CONFLICT (two lifecycle steps at one revision) is surfaced, never silently absorbed", () => {
    const conflicting: CertifiedProviderEvent[] = [
      {
        providerName: SYNTHETIC_PROVIDER,
        eventId: "evt:a",
        externalId: "obj:x",
        revision: 2,
        lifecycleStep: "PAYOUT_SENT",
        terminal: false,
      },
      {
        providerName: SYNTHETIC_PROVIDER,
        eventId: "evt:b",
        externalId: "obj:x",
        revision: 2,
        lifecycleStep: "PAYOUT_FAILED",
        terminal: true,
      },
    ];
    const state = reconcileProviderEvents(conflicting);
    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0]?.lifecycleSteps).toEqual(["PAYOUT_FAILED", "PAYOUT_SENT"]);
    const verdict = certifyOrderIndependence({
      subjectRef: "corridor:test",
      events: conflicting,
      evidenceRefs: [],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.violations.join(" ")).toContain("no total order");
  });

  it("an out-of-order event can NEVER regress the canonical state", () => {
    const events = conformingEventSet();
    const state = reconcileProviderEvents(events);
    // Deliver the newest event FIRST, then all older ones.
    const newestFirst = [
      ...events.filter((e) => e.revision === 4),
      ...events.filter((e) => e.revision !== 4),
    ];
    const regressed = reconcileProviderEvents(newestFirst);
    expect(regressed.objects.find((o) => o.externalId === "obj:payout-1")?.lifecycleStep)
      .toBe("BENEFICIARY_CREDITED");
    expect(regressed.digest).toBe(state.digest);
  });

  it("caller-supplied permutations are verified TOO (the verifier always adds its own)", () => {
    const events = conformingEventSet();
    const verdict = certifyOrderIndependence({
      subjectRef: "corridor:test",
      events,
      permutations: [[...events].reverse()],
      evidenceRefs: ["ev:hermetic-1"],
    });
    expect(verdict.passed).toBe(true);
  });

  it("malformed events (revision 0) fail closed", () => {
    expect(() =>
      reconcileProviderEvents([
        {
          providerName: SYNTHETIC_PROVIDER,
          eventId: "evt:0",
          externalId: "obj:x",
          revision: 0,
          lifecycleStep: "PAYOUT_SENT",
          terminal: false,
        },
      ]),
    ).toThrow(/revision/);
  });

  it("an empty event set folds to the empty state (order-independence trivially holds)", () => {
    const state = reconcileProviderEvents([]);
    expect(state.objects).toEqual([]);
    expect(state.duplicateEventCount).toBe(0);
    const verdict = certifyOrderIndependence({
      subjectRef: "corridor:test",
      events: [],
      evidenceRefs: [],
    });
    // No events means the law was never exercised — but it cannot fail.
    expect(verdict.passed).toBe(true);
  });
});
