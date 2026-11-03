/**
 * PaySwap Desktop (P27-E, the P27-B lane report §8 composition seams) — the
 * GLOBAL PAYOUTS PLANE COMPOSITION: the production binding of the P27-B
 * product slice at the host composition edge (the connect-plane-composition
 * precedent):
 *
 * - THE PIN DECISION (§8.1 — the TL's recorded call): KEEP the v1 Treasury
 *   pin. The slice keeps executing over the pinned v1 Treasury
 *   outbound-payment family + the pinned v2 core accounts/links recipient
 *   family; adopting the live docs' v2 money_management surface (16
 *   doc-named operations) is a reviewed pin change — the generate → diff →
 *   review → adopt path — NEVER a silent expansion (the typed
 *   UNPINNED_API_SURFACE refusal stays machine-enforced).
 * - THE TIER-DRIFT RECORD (§8.3 — a typed record, not a census edit): the
 *   census derives PostTreasuryOutboundPayments at CONFIRM while the product
 *   law demands STRONG_CONFIRM; the plan carries the STRICTER OF the two
 *   (censusApprovalTier verbatim + approvalRequirement the product law).
 *   The census/overlay tier ledger is a shared file — editing it at source
 *   is the next re-pin's decision, recorded here as the machine-citable note.
 * - THE UNPINNED-ADJACENT RECORD (§8.4): the doc-named operations beside
 *   the journey that the pin cannot dispatch — recorded, never blocking,
 *   revisited at the next re-pin.
 * - THE DURABLE ENTITLEMENT CHANNEL: the operator's Treasury-entitlement /
 *   funding / P2P-approval proofs are typed, persisted, validated +
 *   attributed records (the connect-operator-decisions pattern) — the ONLY
 *   proof source the eligibility gates ever see; {} ships (every gate keeps
 *   its typed OPERATOR_GATED verdict — never a default guess, never a
 *   caller-supplied proof string).
 * - THE REAUTH PROOF SEAM (§8.5 / ADR-0018): the REAUTH-tier hosted
 *   recipient-information form dispatches with a host-minted digest-scoped
 *   single-use proof — verify + consume BEFORE the wire, over the EXISTING
 *   desktop reauthentication machinery (the slice's reauthenticationProofRef
 *   seam, wired; no proof logic duplicated).
 * - THE LANE + SEAL LAW: a plan executes on a connection exactly when the
 *   registry's own read model says the connection is the stripe provider's,
 *   ACTIVE and SANDBOX (INV-25 — LIVE never binds); the credential exists
 *   ONLY inside withSealedCredential (ADR-0008 — never captured, never
 *   logged, never returned).
 */

import { createHash } from "node:crypto";
import { StripeCatalogueTransport } from "../../../../../provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import { STRIPE_CATALOGUE_API_VERSION } from "../../../../../provider-runtime/src/adapters/stripe/transport/call-context.js";
import { createStripeGlobalPayoutsJourney } from "../../../../../provider-runtime/src/adapters/stripe/catalogue/payouts-journey.js";
import { evaluateGlobalPayoutsJourneyEligibility } from "../../../../../provider-runtime/src/adapters/stripe/catalogue/payouts-eligibility.js";
import type {
  StripeGlobalPayoutsEligibilityVerdict,
  StripeGlobalPayoutsJourneyInput,
  StripeGlobalPayoutsJourneyProofs,
} from "../../../../../provider-runtime/src/adapters/stripe/catalogue/payouts-eligibility.js";
import type {
  StripeGlobalPayoutsDispatchPlan,
  StripeGlobalPayoutsJourney,
  StripeGlobalPayoutsJourneyExecutionResult,
  StripeGlobalPayoutsOutboundPaymentInput,
  StripeGlobalPayoutsOutboundPaymentPlanResult,
  StripeGlobalPayoutsPlanApproval,
} from "../../../../../provider-runtime/src/adapters/stripe/catalogue/payouts-journey.js";
import type { StripeReauthenticationPort } from "./action-seams.js";
import { nodeFetchForStripePlane } from "./stripe-plane-adapters.js";
import type { GlobalPayoutsEntitlementChannel } from "./payouts-entitlements.js";

/* ---------------- the TL's typed records (§8.1/§8.3/§8.4) ---------------- */

/** §8.1 — the pin decision, recorded (the v2 adoption stays the standing re-pin path). */
export const STRIPE_GLOBAL_PAYOUTS_PIN_DECISION = Object.freeze({
  decision: "KEEP_V1_TREASURY_PIN" as const,
  decidedBy: "P27-E-TL" as const,
  decidedAt: "2026-11-03" as const,
  censusGapStatus: "NOT_PINNED" as const,
  detail:
    "the slice keeps executing over the pinned v1 Treasury outbound-payment family + the pinned v2 core accounts/links recipient family; adopting the live docs' v2 money_management surface (16 doc-named operations, wire 2026-10-28.endive) is a reviewed pin change — the generate → diff → review → adopt path — never a silent expansion (the typed UNPINNED_API_SURFACE refusal stays machine-enforced)",
});

/** §8.3 — the tier-drift record (the stricter-of law, machine-asserted by the battery). */
export const STRIPE_GLOBAL_PAYOUTS_TIER_DRIFT = Object.freeze({
  operationId: "PostTreasuryOutboundPayments" as const,
  censusApprovalTier: "CONFIRM" as const,
  productApprovalRequirement: "STRONG_CONFIRM" as const,
  law: "STRICTER_OF" as const,
  detail:
    "the 3-segment family-derivation derives the create at CONFIRM while its /cancel sub-action derives STRONG_CONFIRM; a third-party money movement out of a Treasury financial account is STRONG_CONFIRM by the product law — the plan records censusApprovalTier verbatim and approvalRequirement as the stricter product law (test-enforced); the census derivation itself is untouched (shared files — adopting STRONG_CONFIRM at source is the next re-pin's decision)",
});

/** §8.4 — the unpinned-adjacent operations (recorded; none blocks the journey). */
export const STRIPE_GLOBAL_PAYOUTS_UNPINNED_ADJACENT_OPERATIONS: readonly {
  readonly surface: string;
  readonly operationId: string | null;
  readonly note: string;
}[] = Object.freeze([
  {
    surface: "the outbound-payment tracking-details update",
    operationId: "PostTreasuryOutboundPaymentsIdUpdateTrackingDetails",
    note: "NOT_PINNED — doc-named beside the outbound-payment lifecycle; revisit at the next re-pin",
  },
  {
    surface: "the Treasury financial-account forwarding-accounts family",
    operationId: null,
    note: "NOT_PINNED — no census member resolves (the census's Forwarding* trio is the forwarding-requests family, a different product); revisit at the next re-pin",
  },
  {
    surface: "the travel-rule test helper",
    operationId: "PostTestHelpersTreasuryOutboundPaymentsIdAdvanceTravelRuleAcceptance",
    note: "NOT_PINNED — the SANDBOX travel-rule simulation; revisit at the next re-pin",
  },
]);

/* The durable operator entitlement channel lives in ./payouts-entitlements.ts (the file law). */


/* ---------------- the composed plane ---------------- */

/** The connection seam the lane resolution reads (the lane-composition shape). */
export interface GlobalPayoutsConnectionSeam {
  connectionStatuses(): Promise<
    ReadonlyArray<{ readonly connectionId: string; readonly providerId: string; readonly state: string; readonly executionMode: string }>
  >;
  withSealedCredential<T>(connectionId: string, consumer: (material: unknown) => T, context: string): Promise<Awaited<T>>;
}

/** What the plane composes over (all injected seams — no ambient env/clock/network). */
export interface StripeGlobalPayoutsPlaneInput {
  /** The REAL fetch binding (the catalogue transport rides it). */
  readonly fetchImpl: typeof globalThis.fetch;
  /** The durable operator entitlement channel (the ONLY proof source). */
  readonly entitlements: GlobalPayoutsEntitlementChannel;
  /** The REAUTH plane (ADR-0018) — optional; absent keeps the honest REAUTH refusal. */
  readonly reauthentication?: StripeReauthenticationPort;
  /** The connection seam (the lane + seal laws); required only for executePlanOnConnection. */
  readonly connections?: GlobalPayoutsConnectionSeam;
  /** The host log (never console; no secret material is ever logged). */
  readonly log?: (level: "info" | "warn" | "error", message: string) => void;
}

/** The typed dispatch refusals of the composed plane (fail-closed). */
export type GlobalPayoutsPlaneDispatchRefusal =
  | { readonly kind: "LANE_NOT_ELIGIBLE"; readonly detail: string }
  | { readonly kind: "REAUTH_PLANE_UNCOMPOSED"; readonly detail: string }
  | { readonly kind: "REAUTH_REQUIRED"; readonly detail: string }
  | { readonly kind: "STRONG_CONFIRM_MARKER_REQUIRED"; readonly detail: string }
  | { readonly kind: "SEALED_CREDENTIAL_MALFORMED"; readonly detail: string };

/** The sealed credential's shape law (the apiKeyOf law — a shape check, never a kernel). */
function sealedStripeApiKeyOf(material: unknown): string {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    throw new TypeError("the sealed credential material is malformed");
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new TypeError("the sealed credential material carries no apiKey");
  }
  return apiKey;
}

/** The canonical (recursively key-sorted) JSON of a plan's binding — the digest preimage. */
function canonicalJsonOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonOf).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonOf(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The composed Global-Payouts plane. */
export interface ComposedStripeGlobalPayoutsPlane {
  /** The REAL product journey driver (the lane's own gates, byte-identical). */
  readonly journey: StripeGlobalPayoutsJourney;
  /** The eligibility evaluation over the durable entitlement channel (the ONLY proof source). */
  readonly evaluate: (input: Omit<StripeGlobalPayoutsJourneyInput, "proofs">) => StripeGlobalPayoutsEligibilityVerdict;
  /** The outbound-payment plan builder (the channel's proofs are forced in — never caller-supplied). */
  readonly buildOutboundPaymentPlan: (
    input: Omit<StripeGlobalPayoutsOutboundPaymentInput, "journey"> & { readonly journey: Omit<StripeGlobalPayoutsJourneyInput, "proofs"> },
  ) => StripeGlobalPayoutsOutboundPaymentPlanResult;
  /** The canonical digest of a product plan (the REAUTH proof's scope preimage). */
  readonly planDigestOf: (plan: StripeGlobalPayoutsDispatchPlan) => string;
  /**
   * The §8.5 REAUTH seam: verify + consume a digest-scoped single-use proof
   * BEFORE the wire (the hosted recipient-information form's approval).
   */
  readonly hostedFormApproval: (input: {
    readonly plan: StripeGlobalPayoutsDispatchPlan;
    readonly connectionId: string;
    readonly principalId: string;
  }) => Promise<{ readonly ok: true; readonly approval: StripeGlobalPayoutsPlanApproval } | { readonly ok: false; readonly refusal: GlobalPayoutsPlaneDispatchRefusal }>;
  /** The STRONG_CONFIRM approval builder (the marker + the v1 idempotency key; never self-approved). */
  readonly strongConfirmApproval: (input: { readonly principalId: string; readonly idempotencyKey: string }) => StripeGlobalPayoutsPlanApproval;
  /**
   * The lane + seal + REAUTH dispatch: a plan executes on a connection
   * exactly when the registry says stripe/ACTIVE/SANDBOX; the REAUTH proof
   * is verified + consumed BEFORE the seal opens; the credential exists
   * only inside the seal.
   */
  readonly executePlanOnConnection: (input: {
    readonly plan: StripeGlobalPayoutsDispatchPlan;
    readonly connectionId: string;
    readonly principalId: string;
    readonly approval?: StripeGlobalPayoutsPlanApproval;
  }) => Promise<{ readonly ok: true; readonly result: StripeGlobalPayoutsJourneyExecutionResult } | { readonly ok: false; readonly refusal: GlobalPayoutsPlaneDispatchRefusal }>;
}

/** Compose the Global-Payouts plane over the REAL journey + the REAL seams. */
export function composeStripeGlobalPayoutsPlane(
  input: StripeGlobalPayoutsPlaneInput,
): ComposedStripeGlobalPayoutsPlane {
  const journey = createStripeGlobalPayoutsJourney({
    transport: new StripeCatalogueTransport({ fetchImpl: nodeFetchForStripePlane(input.fetchImpl) }),
  });
  const entitlementProofs = (): StripeGlobalPayoutsJourneyProofs => input.entitlements.proofs();

  const evaluate = (
    journeyInput: Omit<StripeGlobalPayoutsJourneyInput, "proofs">,
  ): StripeGlobalPayoutsEligibilityVerdict =>
    evaluateGlobalPayoutsJourneyEligibility({ ...journeyInput, proofs: entitlementProofs() });

  const buildOutboundPaymentPlan: ComposedStripeGlobalPayoutsPlane["buildOutboundPaymentPlan"] = (planInput) =>
    journey.buildOutboundPaymentPlan({
      ...planInput,
      journey: { ...planInput.journey, proofs: entitlementProofs() },
    } as StripeGlobalPayoutsOutboundPaymentInput);

  const planDigestOf = (plan: StripeGlobalPayoutsDispatchPlan): string =>
    `global-payouts-plan:v1:${createHash("sha256")
      .update(canonicalJsonOf({ planId: plan.planId, operationId: plan.operationId, params: plan.params }))
      .digest("hex")}`;

  const hostedFormApproval: ComposedStripeGlobalPayoutsPlane["hostedFormApproval"] = async (approvalInput) => {
    if (approvalInput.plan.approvalRequirement !== "REAUTH") {
      return { ok: false, refusal: { kind: "REAUTH_REQUIRED", detail: "the plan does not carry the REAUTH approval tier — this seam is the hosted recipient form's" } };
    }
    if (input.reauthentication === undefined) {
      return { ok: false, refusal: { kind: "REAUTH_PLANE_UNCOMPOSED", detail: "the plan carries the REAUTH approval tier and no reauthentication plane is composed (ADR-0018)" } };
    }
    const digest = planDigestOf(approvalInput.plan);
    const proof = await input.reauthentication.verify({
      connectionId: approvalInput.connectionId,
      principalId: approvalInput.principalId,
      digest,
    });
    if (!proof.ok) {
      return { ok: false, refusal: { kind: "REAUTH_REQUIRED", detail: `the hosted-form dispatch needs a live digest-scoped reauthentication proof: ${proof.reason}` } };
    }
    const consumed = await input.reauthentication.consume(proof.proofId);
    if (!consumed) {
      return { ok: false, refusal: { kind: "REAUTH_REQUIRED", detail: "the reauthentication proof was already consumed (the single-use law)" } };
    }
    return { ok: true, approval: { reauthenticationProofRef: proof.proofId } };
  };

  const strongConfirmApproval = (approvalInput: { readonly principalId: string; readonly idempotencyKey: string }): StripeGlobalPayoutsPlanApproval => ({
    strongConfirmationApproved: true,
    idempotencyKey: approvalInput.idempotencyKey,
  });

  const executePlanOnConnection: ComposedStripeGlobalPayoutsPlane["executePlanOnConnection"] = async (dispatchInput) => {
    if (input.connections === undefined) {
      return { ok: false, refusal: { kind: "LANE_NOT_ELIGIBLE", detail: "no connection seam is composed — the Global-Payouts plane cannot resolve an execution lane" } };
    }
    const statuses = await input.connections.connectionStatuses();
    const lane = statuses.find((status) => status.connectionId === dispatchInput.connectionId);
    const eligible = lane !== undefined && lane.providerId === "stripe" && lane.state === "ACTIVE" && lane.executionMode === "SANDBOX";
    if (!eligible) {
      const detail =
        lane === undefined
          ? "the chosen connection does not exist in this deployment's registry"
          : lane.providerId !== "stripe"
            ? `the chosen connection is a ${lane.providerId} connection — the Global-Payouts product is a Stripe product slice`
            : lane.state !== "ACTIVE"
              ? `the chosen stripe connection is not ACTIVE (${lane.state})`
              : `the chosen stripe connection runs in ${lane.executionMode} mode — live execution requires the live-grant derivation this deployment does not perform (INV-25: SANDBOX only)`;
      return { ok: false, refusal: { kind: "LANE_NOT_ELIGIBLE", detail } };
    }
    let approval = dispatchInput.approval;
    if (dispatchInput.plan.approvalRequirement === "REAUTH") {
      const reauth = await hostedFormApproval({
        plan: dispatchInput.plan,
        connectionId: dispatchInput.connectionId,
        principalId: dispatchInput.principalId,
      });
      if (!reauth.ok) return reauth;
      approval = reauth.approval;
    } else if (dispatchInput.plan.approvalRequirement === "STRONG_CONFIRM" && approval?.strongConfirmationApproved !== true) {
      return { ok: false, refusal: { kind: "STRONG_CONFIRM_MARKER_REQUIRED", detail: "a Global-Payouts money-movement plan requires the STRONG_CONFIRM approval marker — the plane never self-approves (the two-phase contract)" } };
    }
    try {
      const result = await input.connections.withSealedCredential(
        dispatchInput.connectionId,
        (material) => {
          const apiKey = sealedStripeApiKeyOf(material);
          return journey.executePlan(dispatchInput.plan, {
            apiVersion: STRIPE_CATALOGUE_API_VERSION,
            authorizationHeader: `Bearer ${apiKey}`,
          }, approval);
        },
        "global-payouts-plane:executePlanOnConnection",
      );
      return { ok: true, result };
    } catch (error) {
      return { ok: false, refusal: { kind: "SEALED_CREDENTIAL_MALFORMED", detail: (error as Error).message } };
    }
  };

  input.log?.(
    "info",
    "payswap-desktop: global-payouts plane composed (the REAL journey over the REAL catalogue transport + the durable entitlement channel + the REAUTH proof seam + the lane/seal dispatch law)",
  );

  return Object.freeze({
    journey,
    evaluate,
    buildOutboundPaymentPlan,
    planDigestOf,
    hostedFormApproval,
    strongConfirmApproval,
    executePlanOnConnection,
  });
}
