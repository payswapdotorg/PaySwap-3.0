/**
 * PaySwap Desktop (P24-2) — the MIRROR battery: the host-side pins
 * (stripe-pins.ts) asserted field-for-field against the REAL
 * provider-runtime values (the p21-transport-probe-mirrors precedent —
 * the test tier may import @payswap/* source; the HOST never does).
 *
 * WHY THIS EXISTS: the desktop host layer law (no @payswap/* imports
 * at runtime) means the host carries by-value mirrors of the
 * provider-runtime Stripe facts. A mirror that drifts silently would
 * fork the truth — this battery makes drift a test failure.
 *
 * THE CENSUS ADAPTER RECIPE (the P24-D wiring): the last section
 * implements the StripeOperationCensusPort adapter over the REAL
 * STRIPE_OPERATION_CENSUS in ~20 lines and asserts the join laws
 * (totality, resolve, dispatch-allowed parity, release identity) —
 * the TL wires exactly this at the composition edge.
 */

import { describe, expect, it } from "vitest";
import {
  STRIPE_API_VERSION,
  STRIPE_LIVE_KEY_PREFIXES,
  STRIPE_TEST_KEY_PREFIXES,
  STRIPE_CENSUS_PIN,
  STRIPE_EFFECT_CLASSES,
  STRIPE_APPROVAL_TIERS,
  STRIPE_SUPPORT_STATES,
  STRIPE_OPERATION_CENSUS,
  stripeCensusDispatchAllowed,
  stripeCensusRecord,
} from "../../../provider-runtime/src/index.js";
import { stripeIdempotencyKeyAllowed } from "../../../provider-runtime/src/adapters/stripe/catalogue/idempotency-classification.js";
import {
  PINNED_STRIPE_APPROVAL_TIERS,
  PINNED_STRIPE_CATALOGUE_PIN,
  PINNED_STRIPE_EFFECT_CLASSES,
  PINNED_STRIPE_LEGACY_REQUEST_API_VERSION,
  PINNED_STRIPE_LIVE_KEY_PREFIXES,
  PINNED_STRIPE_SUPPORT_STATES,
  PINNED_STRIPE_TEST_KEY_PREFIXES,
  parsePinnedStripePermission,
} from "../../src/host/payswap/stripe/stripe-pins.js";
import {
  PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  PINNED_STRIPE_WEBHOOK_VERIFIER_ID,
} from "../../src/host/payswap/stripe/stripe-pins.js";
import type { StripeOperationCensusPort, StripeCensusOperationView } from "../../src/host/payswap/stripe/action-seams.js";
import { pinnedCatalogueReleaseIdentity } from "../../src/host/payswap/connections/stripe-api-version-state.js";
import { narrowCensusMethod } from "./stripe-p241-wiring-adapters.js";

describe("the host pins mirror the REAL provider-runtime facts (drift = failure)", () => {
  it("the LEGACY request pin mirrors declaration.ts STRIPE_API_VERSION (ADR-0017 D2: unchanged)", () => {
    expect(PINNED_STRIPE_LEGACY_REQUEST_API_VERSION).toBe(STRIPE_API_VERSION);
    expect(PINNED_STRIPE_LEGACY_REQUEST_API_VERSION).toBe("2025-08-27.basil");
  });

  it("the catalogue pin mirrors spec-pin.ts STRIPE_OPENAPI_PIN exactly", () => {
    expect(PINNED_STRIPE_CATALOGUE_PIN.releaseTag).toBe(STRIPE_CENSUS_PIN.releaseTag);
    expect(PINNED_STRIPE_CATALOGUE_PIN.releaseCommitSha).toBe(STRIPE_CENSUS_PIN.releaseCommitSha);
    expect(PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion).toBe(STRIPE_CENSUS_PIN.specInfoVersion);
    expect(PINNED_STRIPE_CATALOGUE_PIN.specSha256).toBe(STRIPE_CENSUS_PIN.specSha256);
    expect(PINNED_STRIPE_CATALOGUE_PIN.generatorId).toBe(STRIPE_CENSUS_PIN.generatorId);
    expect(PINNED_STRIPE_CATALOGUE_PIN.operations).toBe(STRIPE_CENSUS_PIN.operationCount);
    expect(PINNED_STRIPE_CATALOGUE_PIN.v2Operations).toBe(STRIPE_CENSUS_PIN.namespaceCounts.v2);
  });

  it("the key-prefix and overlay vocabularies mirror capabilities.ts + overlay.ts", () => {
    expect([...PINNED_STRIPE_TEST_KEY_PREFIXES]).toEqual([...STRIPE_TEST_KEY_PREFIXES]);
    expect([...PINNED_STRIPE_LIVE_KEY_PREFIXES]).toEqual([...STRIPE_LIVE_KEY_PREFIXES]);
    expect([...PINNED_STRIPE_EFFECT_CLASSES]).toEqual([...STRIPE_EFFECT_CLASSES]);
    expect([...PINNED_STRIPE_APPROVAL_TIERS]).toEqual([...STRIPE_APPROVAL_TIERS]);
    expect([...PINNED_STRIPE_SUPPORT_STATES]).toEqual([...STRIPE_SUPPORT_STATES]);
  });

  it("the webhook-scheme constants mirror webhook-signature.ts", () => {
    expect(PINNED_STRIPE_WEBHOOK_TOLERANCE_SECONDS).toBe(300);
    expect(PINNED_STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS).toBe(5);
    expect(PINNED_STRIPE_WEBHOOK_VERIFIER_ID).toBe("stripe-whsec-hmac-sha256-v1");
  });

  it("the host permission GRAMMAR accepts every REAL overlay rule string (drift = failure)", () => {
    // The overlay's permissionRuleOf emits "<camelCaseFamily>: Read|Write"
    // ('customers: Write', 'paymentIntents: Read', the reviewed 'Account: …'
    // special case). A host grammar that rejects ANY real rule string would
    // make the connection-side declaration of that scope impossible.
    const rules = new Set(
      STRIPE_OPERATION_CENSUS.map((record) => record.requiredPermissionRule),
    );
    expect(rules.size).toBeGreaterThan(50);
    for (const rule of rules) {
      expect(parsePinnedStripePermission(rule), rule).not.toBeNull();
    }
    // The real forms the fixtures join against.
    expect(rules.has("customers: Write")).toBe(true);
    expect(rules.has("Account: Read")).toBe(true);
  });
});

describe("the census adapter recipe (the P24-D wiring over the REAL census)", () => {
  /**
   * The reviewed read-back routes (the frozen contract's
   * readBackOperationId field): only entries asserted to EXIST in the
   * real census. Everything else resolves null (never fabricated — the
   * outcome is then UNKNOWN-with-reconciliation on a 2xx).
   */
  const REVIEWED_READ_BACK_ROUTES: Readonly<Record<string, string>> = Object.freeze({
    PostCustomers: "GetCustomersCustomer",
    PostProducts: "GetProductsId",
    PostPrices: "GetPricesPrice",
    PostPaymentIntents: "GetPaymentIntentsIntent",
    PostRefunds: "GetRefundsRefund",
    PostInvoices: "GetInvoicesInvoice",
  });

  /** THE ADAPTER (the TL's composition-edge wiring, verbatim). */
  function adaptRealCensus(): StripeOperationCensusPort {
    const views: StripeCensusOperationView[] = STRIPE_OPERATION_CENSUS.map((record) => ({
      operationId: record.operationId,
      apiNamespace: record.apiNamespace,
      // The host seam's method vocabulary is GET/POST/DELETE (the pinned
      // census carries zero PUT/PATCH; a future pin that uses one fails
      // LOUDLY here instead of silently dropping the operation).
      method: narrowCensusMethod(record.method),
      path: record.path,
      pathParams: record.pathParams,
      effectClass: record.effectClass,
      approvalTier: record.approvalTier,
      supportState: record.supportState,
      requiredPermissionRule: record.requiredPermissionRule,
      readBackOperationId: REVIEWED_READ_BACK_ROUTES[record.operationId] ?? null,
      idempotencyKeyAllowed: stripeIdempotencyKeyAllowed(record),
      summary: record.summary,
    }));
    const byId = new Map(views.map((view) => [view.operationId, view]));
    return {
      catalogueRelease: pinnedCatalogueReleaseIdentity(),
      resolve: (operationId) => byId.get(operationId),
      dispatchAllowed: (operationId) => stripeCensusDispatchAllowed(operationId),
      enumerate: () => Object.freeze([...views]),
    };
  }

  it("joins the real census totally: 644 operations, one view each, release identity from the pin", () => {
    const census = adaptRealCensus();
    const views = census.enumerate();
    expect(views.length).toBe(644);
    expect(new Set(views.map((view) => view.operationId)).size).toBe(644);
    expect(census.catalogueRelease).toBe(
      `${PINNED_STRIPE_CATALOGUE_PIN.releaseTag}@${PINNED_STRIPE_CATALOGUE_PIN.specInfoVersion}`,
    );
    // Every reviewed read-back route exists in the real census.
    for (const [writeId, readId] of Object.entries(REVIEWED_READ_BACK_ROUTES)) {
      expect(census.resolve(writeId), writeId).toBeDefined();
      expect(census.resolve(readId), readId).toBeDefined();
      expect(census.resolve(writeId)?.readBackOperationId).toBe(readId);
    }
    // An unreviewed operation carries null (never fabricated).
    expect(census.resolve("GetBalance")?.readBackOperationId).toBeNull();
  });

  it("resolve() and dispatchAllowed() agree with the real census record-for-record", () => {
    const census = adaptRealCensus();
    for (const record of STRIPE_OPERATION_CENSUS) {
      const view = census.resolve(record.operationId);
      expect(view, record.operationId).toBeDefined();
      expect(view?.effectClass).toBe(record.effectClass);
      expect(view?.approvalTier).toBe(record.approvalTier);
      expect(view?.supportState).toBe(record.supportState);
      expect(view?.requiredPermissionRule).toBe(record.requiredPermissionRule);
      expect(view?.method).toBe(record.method);
      expect(view?.apiNamespace).toBe(record.apiNamespace);
      expect(census.dispatchAllowed(record.operationId)).toBe(stripeCensusDispatchAllowed(record.operationId));
    }
    // Unknown operationIds deny (fail-closed).
    expect(census.resolve("NotARealOperation")).toBeUndefined();
    expect(census.dispatchAllowed("NotARealOperation")).toBe(false);
  });

  it("the DENY law over the real census: only IMPLEMENTED-class support states dispatch", () => {
    const census = adaptRealCensus();
    const dispatchable = census.enumerate().filter((view) => census.dispatchAllowed(view.operationId));
    for (const view of dispatchable) {
      expect(["IMPLEMENTED", "IMPLEMENTED_WITH_LIMITS"]).toContain(view.supportState);
    }
    // The P25 surface law decides breadth: the committed initial-release
    // surface resolves (now all dispatchable), and the held credential-admin
    // set denies (the thirteen reviewed holds).
    expect(census.resolve("PostCustomers")).toBeDefined();
    expect(census.dispatchAllowed("PostPrices")).toBe(true);
    expect(census.dispatchAllowed("PostWebhookEndpoints")).toBe(false);
    expect(census.dispatchAllowed("PostAppsSecrets")).toBe(false);
    expect(census.dispatchAllowed("GetAppsSecretsFind")).toBe(false);
    expect(census.dispatchAllowed("PostTerminalConnectionTokens")).toBe(false);
    expect(census.enumerate().some((view) => view.supportState === "NOT_SUPPORTED_WITH_REASON")).toBe(true);
  });
});
