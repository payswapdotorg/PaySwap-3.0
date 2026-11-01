/**
 * PaySwap Desktop (P24-2, ADR-0017 D2 — THE MIGRATION LAW) — the
 * per-connection API-VERSION STATE battery:
 *
 * - the legacy request pin 2025-08-27.basil is per-connection STATE and
 *   is NEVER changed: requestApiVersionOf answers it, and there is no
 *   verb in this release that rewrites it;
 * - the catalogue release is RECORDED per connection when the new
 *   surface is used — without touching the request version;
 * - the event-destination schema version is an INDEPENDENT fact: a
 *   request-version/catalogue change never rewrites it, and vice versa;
 * - every update appends to the monotonic history (append-only);
 * - the state is durable + secret-free.
 */

import { describe, expect, it } from "vitest";
import { fakeFs } from "./stripe-action-fixtures.js";
import {
  StripeApiVersionStateStore,
  pinnedCatalogueReleaseIdentity,
} from "../../src/host/payswap/connections/stripe-api-version-state.js";
import {
  PINNED_STRIPE_CATALOGUE_PIN,
  PINNED_STRIPE_LEGACY_REQUEST_API_VERSION,
} from "../../src/host/payswap/stripe/stripe-pins.js";
import { carriesStripeSecretShape } from "../../src/host/payswap/stripe/stripe-pins.js";

const CONN = "conn:fake-stripe-1";

async function store() {
  const instance = new StripeApiVersionStateStore({
    fileSystem: fakeFs(),
    directory: "/tmp/p242-versions",
    nowIso: () => "2026-11-01T12:00:00Z",
  });
  return instance;
}

describe("the per-connection API-version state (ADR-0017 D2)", () => {
  it("a fresh connection carries the LEGACY request pin (never a silently swapped global)", async () => {
    const state = await store();
    expect(await state.requestApiVersionOf(CONN)).toBe(PINNED_STRIPE_LEGACY_REQUEST_API_VERSION);
    expect(await state.requestApiVersionOf(CONN)).toBe("2025-08-27.basil");
    const record = await state.stateOf(CONN);
    expect(record.catalogueReleaseUsed).toBeNull();
    expect(record.history.map((entry) => entry.cause)).toEqual(["CONNECTION_INITIALIZED"]);
    expect(record.history[0]?.value).toBe("2025-08-27.basil");
  });

  it("catalogue-surface use records the release WITHOUT touching the request version", async () => {
    const state = await store();
    await state.recordCatalogueSurfaceUse(CONN, "stripe-openapi/v2596@2026-09-30.endive");
    const record = await state.stateOf(CONN);
    expect(record.requestApiVersion).toBe("2025-08-27.basil");
    expect(record.catalogueReleaseUsed).toBe("stripe-openapi/v2596@2026-09-30.endive");
    expect(record.catalogueReleaseUsedAt).toBe("2026-11-01T12:00:00Z");
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "CATALOGUE_SURFACE_USED",
    ]);
    // The same release records once (idempotent append).
    await state.recordCatalogueSurfaceUse(CONN, "stripe-openapi/v2596@2026-09-30.endive");
    expect((await state.stateOf(CONN)).history.length).toBe(2);
  });

  it("the event-destination version is an INDEPENDENT fact (never rewritten by the other fields)", async () => {
    const state = await store();
    await state.recordEventDestinationVersion(CONN, "2024-06-20.acacia");
    let record = await state.stateOf(CONN);
    expect(record.eventDestinationApiVersion).toBe("2024-06-20.acacia");
    expect(record.requestApiVersion).toBe("2025-08-27.basil");
    // Catalogue use does NOT rewrite the destination version…
    await state.recordCatalogueSurfaceUse(CONN, "stripe-openapi/v2596@2026-09-30.endive");
    record = await state.stateOf(CONN);
    expect(record.eventDestinationApiVersion).toBe("2024-06-20.acacia");
    // …and the destination version does not rewrite the request pin.
    await state.recordEventDestinationVersion(CONN, "2026-09-30.endive");
    record = await state.stateOf(CONN);
    expect(record.requestApiVersion).toBe("2025-08-27.basil");
    expect(record.eventDestinationApiVersion).toBe("2026-09-30.endive");
    // The history is append-only and monotonic.
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "EVENT_DESTINATION_VERSION_RECORDED",
      "CATALOGUE_SURFACE_USED",
      "EVENT_DESTINATION_VERSION_RECORDED",
    ]);
  });

  it("the state persists across a reopen (durable, secret-free)", async () => {
    const fs = fakeFs();
    const first = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    await first.recordCatalogueSurfaceUse(CONN, "stripe-openapi/v2596@2026-09-30.endive");
    await first.recordEventDestinationVersion(CONN, "2024-06-20.acacia");
    const reopened = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-02T12:00:00Z",
    });
    await reopened.load();
    const record = await reopened.stateOf(CONN);
    expect(record.catalogueReleaseUsed).toBe("stripe-openapi/v2596@2026-09-30.endive");
    expect(record.eventDestinationApiVersion).toBe("2024-06-20.acacia");
    expect(record.requestApiVersion).toBe("2025-08-27.basil");
    expect(carriesStripeSecretShape([...fs.files.values()].join("\n"))).toBe(false);
  });

  it("a corrupt/malformed snapshot starts empty (per-record quarantine)", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/tmp/p242-versions/stripe-api-version-state.json",
      JSON.stringify({ version: 1, states: [{ connectionId: 42 }] }),
    );
    const state = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    await state.load();
    // The malformed record dropped; a fresh initialize answers the pin.
    expect(await state.requestApiVersionOf(CONN)).toBe("2025-08-27.basil");
  });

  it("the release identity matches the pinned catalogue", () => {
    expect(pinnedCatalogueReleaseIdentity()).toBe(
      `${PINNED_STRIPE_CATALOGUE_PIN.releaseTag}@${PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion}`,
    );
  });
});
