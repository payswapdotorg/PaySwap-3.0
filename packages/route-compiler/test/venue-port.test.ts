import { describe, expect, it } from "vitest";
import { validateVenueDescriptor, validateSwapRequest, validateAssetIdentity } from "../src/venue-port.ts";
import { VenueRegistry } from "../src/venue-port.ts";
import { VenueRegistryError } from "../src/errors.ts";
import { fixtureVenue, fixtureQuote, VENUE_ID } from "./venue-fixtures.ts";
import { CHAIN, ETH_ASSET, NOW, USC_ASSET } from "./fixtures.ts";

/**
 * The neutral venue port + registry (PORT of the old venue-port
 * registration law): opaque registrations, duplicate rejection,
 * declared-simulation-must-be-real, descriptor validation.
 */
describe("the venue descriptor (identity + surface declaration)", () => {
  it("the fixture venue descriptor validates", () => {
    const descriptor = validateVenueDescriptor(fixtureVenue().descriptor);
    expect(descriptor.venueId).toBe(VENUE_ID);
    expect(descriptor.chains).toEqual([CHAIN]);
    expect(descriptor.quoteSemantics).toBe("EXECUTABLE");
    expect(descriptor.supportsSimulation).toBe(false);
  });

  it("venue ids are opaque keys (the pattern; no venue vocabulary anywhere)", () => {
    expect(() => validateVenueDescriptor({ ...fixtureVenue().descriptor, venueId: "BAD ID" })).toThrowError(
      /pattern/,
    );
    expect(() => validateVenueDescriptor({ ...fixtureVenue().descriptor, venueId: "" })).toThrowError();
    expect(validateVenueDescriptor({ ...fixtureVenue().descriptor, venueId: "a" }).venueId).toBe("a");
  });

  it("a venue declaring simulation support without a simulate function is rejected at registration", () => {
    const engine = new VenueRegistry();
    const declaring = fixtureVenue();
    engine.register(declaring);
    expect(engine.size).toBe(1);
    const malformed = {
      ...fixtureVenue(),
      descriptor: { ...fixtureVenue().descriptor, supportsSimulation: true },
    };
    expect(() => engine.register(malformed as never)).toThrowError(VenueRegistryError);
  });

  it("chains are canonical keys and swap kinds are closed", () => {
    expect(() => validateVenueDescriptor({ ...fixtureVenue().descriptor, chains: [] })).toThrowError(/non-empty/);
    expect(() =>
      validateVenueDescriptor({ ...fixtureVenue().descriptor, chains: ["Ethereum:Mainnet"] }),
    ).toThrowError(/canonical chain keys/);
    expect(() =>
      validateVenueDescriptor({ ...fixtureVenue().descriptor, swapKinds: ["MAGIC"] as never }),
    ).toThrowError(/swap-kind vocabulary/);
  });

  it("a native optimization declaration IS the baseline (INV-C08 literal)", () => {
    const baseline = validateVenueDescriptor(fixtureVenue({ nativeBaseline: true }).descriptor);
    expect(baseline.nativeOptimization?.benchmarkBaseline).toBe(true);
    expect(() =>
      validateVenueDescriptor({
        ...fixtureVenue().descriptor,
        nativeOptimization: { optimizationKind: "x", benchmarkBaseline: false, description: "y" },
      }),
    ).toThrowError(/benchmarkBaseline must be true/);
  });
});

describe("the swap request (ONE request = ONE chain)", () => {
  it("the fixture request validates (assets on the chain, amount in the input symbol)", () => {
    const request = validateSwapRequest({
      requestId: "route-swap:fixture",
      chain: CHAIN,
      inputAsset: ETH_ASSET,
      outputAsset: USC_ASSET,
      swapKind: "EXACT_INPUT",
      amount: { currency: "ETH", minorUnits: "10000000000000000" },
    });
    expect(request.swapKind).toBe("EXACT_INPUT");
    expect(Object.isFrozen(request)).toBe(true);
  });

  it("EXACT_OUTPUT requests are denominated in the output symbol", () => {
    expect(() =>
      validateSwapRequest({
        requestId: "r",
        chain: CHAIN,
        inputAsset: ETH_ASSET,
        outputAsset: USC_ASSET,
        swapKind: "EXACT_OUTPUT",
        amount: { currency: "ETH", minorUnits: "1" },
      }),
    ).toThrowError(/output asset symbol/);
  });

  it("non-canonical chain keys and non-currency amounts are rejected", () => {
    expect(() =>
      validateSwapRequest({
        requestId: "r",
        chain: "ethereum mainnet",
        inputAsset: ETH_ASSET,
        outputAsset: USC_ASSET,
        swapKind: "EXACT_INPUT",
        amount: { currency: "ETH", minorUnits: "1" },
      }),
    ).toThrowError(/canonical chain key/);
    expect(() => validateAssetIdentity({ chain: CHAIN, assetId: "x" }, "probe")).toThrowError();
    expect(validateAssetIdentity(USC_ASSET, "probe").symbol).toBe("USC");
  });
});

describe("the venue registry (ordered, duplicate-free)", () => {
  it("registration order is preserved and observable (deterministic consultation)", () => {
    const engine = new VenueRegistry();
    engine.register(fixtureVenue());
    const second = fixtureVenue();
    engine.register({ ...second, descriptor: { ...second.descriptor, venueId: "fixture-dex-beta" } });
    expect(engine.venues().map((venue) => venue.descriptor.venueId)).toEqual(["fixture-dex-alpha", "fixture-dex-beta"]);
    expect(engine.venue("fixture-dex-beta")).toBeDefined();
    expect(engine.has("fixture-dex-gamma")).toBe(false);
  });

  it("duplicate venue ids are rejected", () => {
    const engine = new VenueRegistry();
    engine.register(fixtureVenue());
    expect(() => engine.register(fixtureVenue())).toThrowError(/already registered/);
  });

  it("a fresh registry is empty (no privileged venue, no hidden registrations)", () => {
    expect(new VenueRegistry().size).toBe(0);
    expect(new VenueRegistry().venues()).toEqual([]);
  });

  it("the port surface must be implemented (quote, observeHealth, planWrite)", () => {
    const engine = new VenueRegistry();
    expect(() => engine.register({ descriptor: fixtureVenue().descriptor } as never)).toThrowError(
      /implement quote, observeHealth and planWrite/,
    );
  });

  it("the venue port methods are synchronous (no I/O at the port surface)", () => {
    const venue = fixtureVenue();
    const quote = venue.quote(
      {
        requestId: "route-swap:fixture",
        chain: CHAIN,
        inputAsset: ETH_ASSET,
        outputAsset: USC_ASSET,
        swapKind: "EXACT_INPUT",
        amount: { currency: "ETH", minorUnits: "10000000000000000" },
      },
      NOW,
    );
    expect(quote.kind).toBe("QUOTE");
    expect(venue.observeHealth(NOW).status).toBe("HEALTHY");
    const write = venue.planWrite({
      quote: fixtureQuote(),
      instance: { instanceId: "i", capabilityId: "c" },
      owner: "o",
      beneficiary: "b",
      routeRef: "r",
      routeHash: "h",
      expiryMs: NOW + 1000,
      requestedBy: "req",
    });
    expect(write.writeDigest).toMatch(/^fnv1a64:/);
  });
});
