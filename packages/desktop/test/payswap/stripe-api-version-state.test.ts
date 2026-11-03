/**
 * PaySwap Desktop (P24-2, ADR-0017 D2 — THE MIGRATION LAW; P26-C — the
 * migration VERB) — the per-connection API-VERSION STATE battery:
 *
 * - the legacy request pin 2025-08-27.basil is per-connection STATE and
 *   is the UNCHANGED DEFAULT: requestApiVersionOf answers it until the
 *   P26-C migration verb is explicitly exercised for the connection;
 * - the catalogue release is RECORDED per connection when the new
 *   surface is used — without touching the request version;
 * - the event-destination schema version is an INDEPENDENT fact: a
 *   request-version/catalogue change never rewrites it, and vice versa;
 * - THE MIGRATION LIFECYCLE (P26-C): the only legal target is the
 *   catalogue pin version (unknown targets refused typed, never
 *   guessed); a successful migration is durable provenance + append-only
 *   history; a re-migration is an honest ALREADY_MIGRATED refusal; the
 *   explicit reversal verb returns to the legacy pin and a revert of a
 *   never-migrated connection is refused; the state persists across a
 *   reopen and stays secret-free;
 * - every update appends to the monotonic history (append-only).
 */

import { describe, expect, it } from "vitest";
import { fakeFs } from "./stripe-action-fixtures.js";
import {
  pinnedCatalogueReleaseIdentity,
  pinnedCatalogueRequestApiVersion,
  StripeApiVersionStateStore,
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

describe("the request-version migration verb (P26-C, ADR-0017 D2 made real)", () => {
  it("a successful migration moves the connection to the catalogue pin with DURABLE provenance", async () => {
    const state = await store();
    const outcome = await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: pinnedCatalogueRequestApiVersion(),
    });
    expect(outcome).toEqual({ ok: true, requestApiVersion: "2026-09-30.endive" });
    // requestApiVersionOf answers the migrated version ONLY after the
    // explicit successful migration (the default never moves on its own).
    expect(await state.requestApiVersionOf(CONN)).toBe("2026-09-30.endive");
    const record = await state.stateOf(CONN);
    expect(record.requestApiVersion).toBe("2026-09-30.endive");
    expect(record.requestApiVersionMigratedFrom).toBe("2025-08-27.basil");
    expect(record.requestApiVersionMigratedAt).toBe("2026-11-01T12:00:00Z");
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "REQUEST_API_VERSION_MIGRATED",
    ]);
    expect(record.history[1]?.value).toBe("2026-09-30.endive");
    // The independent facts are untouched by the migration.
    expect(record.catalogueReleaseUsed).toBeNull();
    expect(record.eventDestinationApiVersion).toBeNull();
  });

  it("the migration never rewrites the independent facts (and they never rewrite it)", async () => {
    const state = await store();
    await state.recordCatalogueSurfaceUse(CONN, "stripe-openapi/v2596@2026-09-30.endive");
    await state.recordEventDestinationVersion(CONN, "2024-06-20.acacia");
    const outcome = await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    expect(outcome.ok).toBe(true);
    const record = await state.stateOf(CONN);
    expect(record.catalogueReleaseUsed).toBe("stripe-openapi/v2596@2026-09-30.endive");
    expect(record.eventDestinationApiVersion).toBe("2024-06-20.acacia");
    expect(record.requestApiVersion).toBe("2026-09-30.endive");
    // Catalogue-use after the migration records idempotently WITHOUT
    // touching the migrated request version.
    await state.recordCatalogueSurfaceUse(CONN, "stripe-openapi/v2596@2026-09-30.endive");
    expect((await state.stateOf(CONN)).requestApiVersion).toBe("2026-09-30.endive");
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "CATALOGUE_SURFACE_USED",
      "EVENT_DESTINATION_VERSION_RECORDED",
      "REQUEST_API_VERSION_MIGRATED",
    ]);
  });

  it("an UNKNOWN TARGET is refused typed — the only legal target is the catalogue pin (never a guess)", async () => {
    const state = await store();
    for (const target of [
      "2024-06-20.acacia",
      "2026-10-31.dill",
      // The release IDENTITY is not a version string — refused too.
      "stripe-openapi/v2596@2026-09-30.endive",
    ]) {
      const outcome = await state.migrateRequestApiVersion({ connectionId: CONN, targetApiVersion: target });
      expect(outcome).toEqual({
        ok: false,
        refusal: {
          kind: "UNKNOWN_TARGET",
          targetApiVersion: target,
          legalTargetApiVersion: "2026-09-30.endive",
        },
      });
    }
    // Nothing was recorded — the default pin stands, no history append.
    const record = await state.stateOf(CONN);
    expect(record.requestApiVersion).toBe("2025-08-27.basil");
    expect(record.history.map((entry) => entry.cause)).toEqual(["CONNECTION_INITIALIZED"]);
  });

  it("a double migration is an honest ALREADY_MIGRATED refusal (idempotent refusal, no second append)", async () => {
    const state = await store();
    const first = await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    expect(first.ok).toBe(true);
    const second = await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    expect(second).toEqual({
      ok: false,
      refusal: { kind: "ALREADY_MIGRATED", requestApiVersion: "2026-09-30.endive" },
    });
    // The refusal names the current state honestly and appends nothing.
    const record = await state.stateOf(CONN);
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "REQUEST_API_VERSION_MIGRATED",
    ]);
    expect(record.requestApiVersionMigratedAt).toBe("2026-11-01T12:00:00Z");
  });

  it("a persisted version that is neither pin is UNRECOGNIZED — never silently migrated", async () => {
    const fs = fakeFs();
    fs.files.set(
      "/tmp/p242-versions/stripe-api-version-state.json",
      JSON.stringify({
        version: 1,
        states: [
          {
            connectionId: CONN,
            requestApiVersion: "2020-01-01.weird",
            requestApiVersionMigratedFrom: null,
            requestApiVersionMigratedAt: null,
            catalogueReleaseUsed: null,
            catalogueReleaseUsedAt: null,
            eventDestinationApiVersion: null,
            history: [{ at: "2026-11-01T12:00:00Z", cause: "CONNECTION_INITIALIZED", value: "2020-01-01.weird" }],
          },
        ],
      }),
    );
    const state = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    await state.load();
    const outcome = await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: "UNRECOGNIZED_CURRENT_VERSION", requestApiVersion: "2020-01-01.weird" },
    });
    expect(await state.requestApiVersionOf(CONN)).toBe("2020-01-01.weird");
  });

  it("the explicit reversal returns to the legacy pin (a separate verb, never a second forward target)", async () => {
    const state = await store();
    await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    const revert = await state.revertRequestApiVersionToLegacy({ connectionId: CONN });
    expect(revert).toEqual({ ok: true, requestApiVersion: "2025-08-27.basil" });
    expect(await state.requestApiVersionOf(CONN)).toBe("2025-08-27.basil");
    const record = await state.stateOf(CONN);
    // No migration is in force: the provenance fields reset (the trail
    // stays in the append-only history).
    expect(record.requestApiVersionMigratedFrom).toBeNull();
    expect(record.requestApiVersionMigratedAt).toBeNull();
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "REQUEST_API_VERSION_MIGRATED",
      "REQUEST_API_VERSION_REVERTED",
    ]);
    expect(record.history[2]?.value).toBe("2025-08-27.basil");
    // A re-migration after a revert is legal again (legacy→pin).
    const again = await state.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    expect(again.ok).toBe(true);
    expect((await state.stateOf(CONN)).requestApiVersionMigratedFrom).toBe("2025-08-27.basil");
  });

  it("a revert of a NEVER-migrated connection is refused naming the current state", async () => {
    const state = await store();
    const outcome = await state.revertRequestApiVersionToLegacy({ connectionId: CONN });
    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: "NOT_MIGRATED", requestApiVersion: "2025-08-27.basil" },
    });
    expect((await state.stateOf(CONN)).history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
    ]);
  });

  it("the migration + reversal persist across a reopen (durable, secret-free)", async () => {
    const fs = fakeFs();
    const first = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-01T12:00:00Z",
    });
    await first.migrateRequestApiVersion({
      connectionId: CONN,
      targetApiVersion: "2026-09-30.endive",
    });
    const reopened = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-02T12:00:00Z",
    });
    await reopened.load();
    // The migrated version AND its provenance survive the reopen.
    expect(await reopened.requestApiVersionOf(CONN)).toBe("2026-09-30.endive");
    let record = await reopened.stateOf(CONN);
    expect(record.requestApiVersionMigratedFrom).toBe("2025-08-27.basil");
    expect(record.requestApiVersionMigratedAt).toBe("2026-11-01T12:00:00Z");
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "REQUEST_API_VERSION_MIGRATED",
    ]);
    // A reopen of a reverted connection answers the legacy pin.
    const revert = await reopened.revertRequestApiVersionToLegacy({ connectionId: CONN });
    expect(revert.ok).toBe(true);
    const third = new StripeApiVersionStateStore({
      fileSystem: fs,
      directory: "/tmp/p242-versions",
      nowIso: () => "2026-11-03T12:00:00Z",
    });
    await third.load();
    expect(await third.requestApiVersionOf(CONN)).toBe("2025-08-27.basil");
    record = await third.stateOf(CONN);
    expect(record.history.map((entry) => entry.cause)).toEqual([
      "CONNECTION_INITIALIZED",
      "REQUEST_API_VERSION_MIGRATED",
      "REQUEST_API_VERSION_REVERTED",
    ]);
    expect(carriesStripeSecretShape([...fs.files.values()].join("\n"))).toBe(false);
  });
});
