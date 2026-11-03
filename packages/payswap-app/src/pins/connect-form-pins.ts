/**
 * @payswap/app — STRUCTURAL PINS of the P27-A Stripe CONNECT forms (the
 * U2 existing-account delegated-OAuth grant + the U3 marketplace
 * connected-accounts form; ADR-0020 D4/D11/D12).
 *
 * MIRROR DISCIPLINE (the connectionsActivationPins law): @payswap/app src
 * NEVER imports the desktop host — the connect-lane form views are pinned
 * STRUCTURALLY here (same shapes, same values) from:
 *
 * - packages/desktop/src/host/payswap/connections/connect-connection-views.ts
 *   (CONNECT_LANE_FORM_VIEWS + CONNECT_PURPOSE_GATE_DISCLOSURE);
 *
 * and the mirror is verified field-for-field against the REAL host source
 * by test/payswap/connect-form-pins-mirror.test.ts (test-only import).
 *
 * HONESTY LAWS (the host file's own laws, carried verbatim in spirit):
 * - The U2/U3 forms are UNCONFIGURED in this deployment (no Stripe
 *   platform application exists — run card §B); the pins carry the EXACT
 *   §B-mapped missing-operator items, never a dead button, never a
 *   simulated flow.
 * - MACHINERY_STATE records the implemented-and-key-ready half
 *   (KEY_READY) alongside the operator-gated half — the two-half honesty.
 * - ZERO FINANCIAL AUTHORITY: the pins and the panel that renders them
 *   seed setup TASKS and surface typed prerequisites; no dispatch, no
 *   authorization, no money movement.
 * - INV-30: the U3 pin carries the purpose-gate disclosure verbatim —
 *   Connect is not unrestricted P2P.
 */

/** The connect-lane machinery-state vocabulary (the honest two-half state). */
export const CONNECT_LANE_MACHINERY_STATES_PIN = [
  "KEY_READY",
  "NOT_IMPLEMENTED",
] as const;
export type ConnectLaneMachineryStatePin =
  (typeof CONNECT_LANE_MACHINERY_STATES_PIN)[number];

/** The Stripe connection forms the connect lane owns (the registry vocabulary). */
export const CONNECT_LANE_FORMS_PIN = ["DELEGATED_OAUTH", "CONNECTED_ACCOUNT"] as const;
export type ConnectLaneFormPin = (typeof CONNECT_LANE_FORMS_PIN)[number];

/** The connection status vocabulary the connect views render. */
export const CONNECT_LANE_STATUSES_PIN = ["CONFIGURED", "UNCONFIGURED"] as const;
export type ConnectLaneStatusPin = (typeof CONNECT_LANE_STATUSES_PIN)[number];

/**
 * One connect-lane form view (the app-side structural mirror of the host's
 * ConnectLaneFormView — declarative data only, never behavior).
 */
export interface ConnectLaneFormViewPin {
  readonly formId: string;
  readonly useCaseRef: string;
  readonly form: ConnectLaneFormPin;
  readonly status: ConnectLaneStatusPin;
  readonly machineryState: ConnectLaneMachineryStatePin;
  readonly missingOperatorConfiguration: readonly string[];
  /** The purpose-gate disclosure (U3 only; INV-30). */
  readonly purposeGateDisclosure: string | null;
  readonly summary: string;
}

/**
 * THE INV-30 PURPOSE-GATE DISCLOSURE (the P27-0 capability matrix §5
 * Connect column, verbatim). Rendered with the U3 form — never the U2.
 */
export const CONNECT_PURPOSE_GATE_DISCLOSURE_PIN =
  "Connect is not unrestricted P2P: regulated remittance or personal-transfer purposes are excluded from the Connect product's permission. A Payment Link, Connect badge or route relabeling never supplies the missing provider-product and legal approval (INV-30)." as const;

/**
 * The U2 connect-lane form view (mirrors the host's CONNECT_LANE_U2_VIEW
 * by value; the mirror test asserts field-for-field equality).
 */
export const CONNECT_LANE_U2_VIEW_PIN: ConnectLaneFormViewPin = Object.freeze({
  formId: "stripe-u2-existing-account-grant",
  useCaseRef: "existing-account-grant",
  form: "DELEGATED_OAUTH",
  status: "UNCONFIGURED",
  machineryState: "KEY_READY",
  missingOperatorConfiguration: [
    "STRIPE_PLATFORM_CLIENT_ID — the OAuth client_id of a Stripe platform application registered by the operator (run card §B.1)",
    "STRIPE_PLATFORM_CLIENT_SECRET — the platform secret key (the OAuth client_secret), delivered to the host through the operator secret channel, never chat (run card §B.1 and §B.4)",
    "The exact redirect/callback URL registered with the Stripe platform application (run card §B.3)",
    "Stripe's written approval of PaySwap's disclosed actual business model (run card §B.5)",
  ],
  purposeGateDisclosure: null,
  summary:
    "Delegate PaySwap scoped read-only access to an existing Stripe account through Stripe OAuth. The flow machinery (single-use state, authorize URL, code-to-token exchange, typed error paths, seal + read-back probe) is implemented and key-ready; the form stays UNCONFIGURED until the operator platform configuration arrives through the secret channel.",
});

/**
 * The U3 connect-lane form view (mirrors the host's CONNECT_LANE_U3_VIEW
 * by value; the mirror test asserts field-for-field equality).
 */
export const CONNECT_LANE_U3_VIEW_PIN: ConnectLaneFormViewPin = Object.freeze({
  formId: "stripe-u3-marketplace-connected-accounts",
  useCaseRef: "marketplace-connected-accounts",
  form: "CONNECTED_ACCOUNT",
  status: "UNCONFIGURED",
  machineryState: "KEY_READY",
  missingOperatorConfiguration: [
    "STRIPE_PLATFORM_CLIENT_ID + STRIPE_PLATFORM_CLIENT_SECRET — the Stripe Connect platform credentials (run card §B.1 and §B.4)",
    "STRIPE_CONNECT_WEBHOOK_SECRET — the signing secret of a publicly reachable webhook endpoint registered with Stripe for connected-account events (run card §B.3 and §B.4)",
    "The operator-decided Connect account model — the onboarding configuration, service agreement (full or recipient) and controller settings, approved with Stripe for the actual business model (run card §B.2)",
    "The operator-decided charge model (direct / destination / separate charges and transfers), platform country, and merchant-of-record + dispute/refund liability assignment (run card §B.2)",
    "Stripe's written approval of PaySwap's disclosed actual business model (run card §B.5)",
  ],
  purposeGateDisclosure: CONNECT_PURPOSE_GATE_DISCLOSURE_PIN,
  summary:
    "Onboard sellers as Stripe Connect connected accounts (Account Links hosted onboarding). The lifecycle machinery (controller-properties account creation, hosted onboarding links, capability and requirements observations, connected-account webhooks, charge/transfer/payout topology with merchant-of-record and liability gates) is key-ready; the form stays UNCONFIGURED until the operator credentials, model and liability decisions, and webhook endpoint arrive.",
});

/** Both connect-lane views, pinned order (U2 then U3 — the host's form order). */
export const CONNECT_LANE_FORM_VIEWS_PIN: readonly ConnectLaneFormViewPin[] =
  Object.freeze([CONNECT_LANE_U2_VIEW_PIN, CONNECT_LANE_U3_VIEW_PIN]);

/** The typed outcome of the panel's seed action (the host seed-verb law, pinned). */
export type ConnectSetupSeedResultPin =
  | {
      readonly kind: "OPERATOR_GATED";
      readonly formId: string;
      readonly missingItems: readonly string[];
      readonly machineryState: ConnectLaneMachineryStatePin;
    }
  | {
      readonly kind: "SEEDED";
      readonly formId: string;
      readonly useCaseRef: string;
      readonly machineryState: ConnectLaneMachineryStatePin;
      readonly seededAt: string;
    };

/**
 * The app-side seed projection (DETERMINISTIC DATA, zero authority): with
 * the form UNCONFIGURED the honest answer is the typed OPERATOR_GATED
 * verdict carrying the exact §B-mapped items. The REAL seed verb (which
 * adopts the task into the authority's orchestration once the operator
 * configuration lands) is the host's connect-connection-views.ts member —
 * P27-E wires it; this projection never simulates a flow or an authority.
 */
export function seedConnectSetupTaskPin(
  view: ConnectLaneFormViewPin,
  nowIso: string,
): ConnectSetupSeedResultPin {
  if (view.status === "UNCONFIGURED") {
    return {
      kind: "OPERATOR_GATED",
      formId: view.formId,
      missingItems: view.missingOperatorConfiguration,
      machineryState: view.machineryState,
    };
  }
  return {
    kind: "SEEDED",
    formId: view.formId,
    useCaseRef: view.useCaseRef,
    machineryState: view.machineryState,
    seededAt: nowIso,
  };
}

/** The honest note rendered above both connect cards (the operator-gate law). */
export const CONNECT_FORMS_GATE_NOTE =
  "These Stripe connection forms are implemented and key-ready, but no Stripe platform application exists in this deployment yet: every setup action answers with the typed operator gate below, listing exactly what the operator must register and supply (the P27 run card §B). Nothing is simulated — no dead buttons, no fake OAuth, no invented onboarding." as const;

/** The honest machinery note (rendered with each card's KEY_READY state). */
export const CONNECT_FORMS_MACHINERY_NOTE =
  "Machinery key-ready: the flow code is implemented and hermetically tested end-to-end in this repository; it activates the moment the operator configuration arrives through the secret channel. A typed UNCONFIGURED verdict is the deliverable of this state — never a faked ACTIVE." as const;
