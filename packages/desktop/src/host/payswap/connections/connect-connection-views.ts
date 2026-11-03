/**
 * PaySwap Desktop (P27-A, ADR-0020 D4/D11/D12) — the CONNECT CONNECTION
 * VIEWS: the connection-plane typed surface for the Stripe U2
 * (DELEGATED_OAUTH) and U3 (CONNECTED_ACCOUNT) forms — the ADDITIVE
 * registration point P27-E wires into the session authority at
 * integration (this lane never edits the authority itself).
 *
 * PIN DISCIPLINE (the provider-pins.ts law): this module pins
 * STRUCTURALLY and mirrors the registry DATA by value; it never imports
 * the provider-runtime source (the connections/ layer law). The
 * mirror-fidelity battery (test/payswap/connect-connection-views.test.ts)
 * drives BOTH this pin and the REAL registry source and asserts
 * field-for-field equality.
 *
 * HONESTY LAWS:
 * - The U2/U3 forms are UNCONFIGURED in this deployment (no platform
 *   application exists); their setup verbs refuse with the TYPED gate
 *   verdicts carrying the exact §B-mapped items — never a dead button,
 *   never a simulated flow.
 * - MACHINERY_STATE records what is implemented and key-ready
 *   (KEY_READY) versus what the operator gates — the state is honest
 *   about BOTH halves.
 * - ZERO FINANCIAL AUTHORITY: the verbs seed setup TASKS and surface
 *   typed prerequisites; no dispatch, no authorization, no money
 *   movement.
 * - INV-30: the U3 view carries the purpose-gate disclosure verbatim —
 *   Connect is not unrestricted P2P.
 */

import type { DesktopProviderFormView } from "./contracts.js";
import {
  PINNED_STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
  PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION,
} from "./provider-pins.js";

/** The connect-lane form ids (the two forms this lane owns). */
export const CONNECT_LANE_FORM_IDS = Object.freeze([
  "stripe-u2-existing-account-grant",
  "stripe-u3-marketplace-connected-accounts",
] as const);
export type ConnectLaneFormId = (typeof CONNECT_LANE_FORM_IDS)[number];

/** What is implemented versus operator-gated (the honest two-half state). */
export type ConnectLaneMachineryState = "KEY_READY" | "NOT_IMPLEMENTED";

/** One connect-lane form view (the renderer's typed data). */
export interface ConnectLaneFormView {
  readonly formId: ConnectLaneFormId;
  readonly useCaseRef: string;
  readonly form: "DELEGATED_OAUTH" | "CONNECTED_ACCOUNT";
  readonly status: "CONFIGURED" | "UNCONFIGURED";
  /** The machinery state — implemented and waiting on the operator gates. */
  readonly machineryState: ConnectLaneMachineryState;
  readonly missingOperatorConfiguration: readonly string[];
  /** The purpose-gate disclosure (U3 only; INV-30). */
  readonly purposeGateDisclosure: string | null;
  readonly summary: string;
}

/** The U3 purpose-gate disclosure (verbatim — the P27-0 matrix §5 row). */
export const CONNECT_PURPOSE_GATE_DISCLOSURE =
  "Connect is not unrestricted P2P: regulated remittance or personal-transfer purposes are excluded from the Connect product's permission. A Payment Link, Connect badge or route relabeling never supplies the missing provider-product and legal approval (INV-30)." as const;

/** The U2 connect-lane view (mirrors the registry row + the machinery state). */
export const CONNECT_LANE_U2_VIEW: ConnectLaneFormView = Object.freeze({
  formId: "stripe-u2-existing-account-grant",
  useCaseRef: "existing-account-grant",
  form: "DELEGATED_OAUTH",
  status: "UNCONFIGURED",
  machineryState: "KEY_READY",
  missingOperatorConfiguration: PINNED_STRIPE_U2_MISSING_OPERATOR_CONFIGURATION,
  purposeGateDisclosure: null,
  summary:
    "Delegate PaySwap scoped read-only access to an existing Stripe account through Stripe OAuth. The flow machinery (single-use state, authorize URL, code-to-token exchange, typed error paths, seal + read-back probe) is implemented and key-ready; the form stays UNCONFIGURED until the operator platform configuration arrives through the secret channel.",
});

/** The U3 connect-lane view (mirrors the registry row + the machinery state + the purpose gate). */
export const CONNECT_LANE_U3_VIEW: ConnectLaneFormView = Object.freeze({
  formId: "stripe-u3-marketplace-connected-accounts",
  useCaseRef: "marketplace-connected-accounts",
  form: "CONNECTED_ACCOUNT",
  status: "UNCONFIGURED",
  machineryState: "KEY_READY",
  missingOperatorConfiguration: PINNED_STRIPE_U3_MISSING_OPERATOR_CONFIGURATION,
  purposeGateDisclosure: CONNECT_PURPOSE_GATE_DISCLOSURE,
  summary:
    "Onboard sellers as Stripe Connect connected accounts (Account Links hosted onboarding). The lifecycle machinery (controller-properties account creation, hosted onboarding links, capability and requirements observations, connected-account webhooks, charge/transfer/payout topology with merchant-of-record and liability gates) is key-ready; the form stays UNCONFIGURED until the operator credentials, model and liability decisions, and webhook endpoint arrive.",
});

/** Both connect-lane views, pinned order (U2 then U3 — the registry's form order). */
export const CONNECT_LANE_FORM_VIEWS: readonly ConnectLaneFormView[] = Object.freeze([
  CONNECT_LANE_U2_VIEW,
  CONNECT_LANE_U3_VIEW,
]);

/** The typed setup-seed refusal (never a thrown string; never a dead button). */
export type ConnectSetupSeedResult =
  | {
      readonly kind: "SEEDED";
      readonly formId: ConnectLaneFormId;
      /** The setup-task record the authority may adopt (demand-side only — zero authority). */
      readonly task: {
        readonly formId: ConnectLaneFormId;
        readonly useCaseRef: string;
        readonly machineryState: ConnectLaneMachineryState;
        readonly seededAt: string;
      };
    }
  | {
      readonly kind: "OPERATOR_GATED";
      readonly formId: ConnectLaneFormId;
      readonly missingItems: readonly string[];
      readonly machineryState: ConnectLaneMachineryState;
    }
  | { readonly kind: "UNKNOWN_FORM"; readonly formId: string };

/**
 * Seed one connect-lane setup task. With the form still UNCONFIGURED the
 * verb returns the TYPED OPERATOR_GATED verdict (the task is NOT seeded —
 * the operator gates are the standing action, recorded verbatim). When
 * the operator configuration lands (the P27-E wiring flips the status),
 * the same verb seeds the demand-side task the authority adopts.
 */
export function seedConnectSetupTask(input: {
  readonly formId: string;
  readonly nowIso: string;
  /** The live status the composition reads from the registry mirror (defaults to the pinned UNCONFIGURED). */
  readonly statusOverride?: "CONFIGURED" | "UNCONFIGURED";
}): ConnectSetupSeedResult {
  const view = CONNECT_LANE_FORM_VIEWS.find((entry) => entry.formId === input.formId);
  if (view === undefined) {
    return { kind: "UNKNOWN_FORM", formId: input.formId };
  }
  const status = input.statusOverride ?? view.status;
  if (status === "UNCONFIGURED") {
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
    task: {
      formId: view.formId,
      useCaseRef: view.useCaseRef,
      machineryState: view.machineryState,
      seededAt: input.nowIso,
    },
  };
}

/** Project a connect-lane view onto the shared DesktopProviderFormView shape (the renderer's existing contract). */
export function connectLaneViewAsProviderFormView(view: ConnectLaneFormView): DesktopProviderFormView {
  return Object.freeze({
    useCaseRef: view.useCaseRef,
    form: view.form,
    status: view.status,
    missingOperatorConfiguration: view.missingOperatorConfiguration,
    authMechanism: view.form === "DELEGATED_OAUTH" ? "delegated-oauth" : "connected-account-links",
    credentialKind: view.form === "DELEGATED_OAUTH" ? ("OAUTH" as const) : ("PROVIDER_DEFINED" as const),
    executionModes: Object.freeze(["SANDBOX" as const]),
    summary: view.summary,
  });
}
