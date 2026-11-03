/**
 * P27-A — the REAL STRIPE CONNECT U2/U3 SANDBOX JOURNEY harness (2026-11-03,
 * ADR-0020 D4/D11). The connect-lane twin of scripts/p26/a1-catalogue-real-
 * sandbox-journey.ts: the real-Sandbox tier for the Stripe delegated-OAuth
 * (U2) and Connect-platform (U3) flows — every operator-missing configuration
 * surfaced as a typed UNCONFIGURED / OPERATOR_GATED verdict; never a silent
 * pass, never a simulated flow, never a faked credential.
 *
 * THE LAWS (the P14/P21/P22/P26 harness precedent, binding):
 * - Credential law: the platform configuration comes ONLY from the env (the
 *   station secret store): STRIPE_PLATFORM_CLIENT_ID / STRIPE_PLATFORM_CLIENT_
 *   SECRET (+ STRIPE_CONNECT_WEBHOOK_SECRET for U3). Never hardcoded, never
 *   logged, never in the receipt. Exit 2 without the platform credentials.
 * - INV-25: a live-shaped platform secret (sk_live_/rk_live_) is refused at
 *   THIS harness's own edge — exit 1 (the transport edge refuses it again).
 * - Writes are DOUBLE-gated: the credentials AND STRIPE_SANDBOX_WRITES_
 *   ENABLED=1 (the P24-1 TIER 2a law).
 * - The §B.2 operator decisions (account model, charge topology) are never
 *   guessed: without STRIPE_CONNECT_ACCOUNT_MODEL_JSON the creation gate is
 *   the typed OPERATOR_GATED verdict, never RED, never a default.
 * - The wiring dry-run (P27_A1_WIRING_DRY_RUN=1) composes every REAL module
 *   (registry, OAuth builders/parsers, platform gates, the lifecycle plan vs
 *   the pinned census + the REAL strict schema validator, the connect webhook
 *   module over the REAL signature verifier, the topology resolver, the
 *   INV-30 purpose gate) with scripted transports — ZERO network — and records
 *   its receipt OUTSIDE the evidence tree (fixture receipts are never promoted).
 *
 * Run (real tier):  npx tsx scripts/p27/a1-connect-real-sandbox-journey.ts
 *   (A1_RECEIPT_PATH redirects the receipt; STRIPE_U2_AUTHORIZATION_CODE may
 *    supply a real ac_… code from the operator's browser round-trip.)
 * Run (dry-run): P27_A1_WIRING_DRY_RUN=1 npx tsx scripts/p27/a1-connect-real-sandbox-journey.ts
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { writeFileSync } from "node:fs";

import { StripeCatalogueTransport } from "../../packages/provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import type { StripeOperationDispatchResult } from "../../packages/provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import { STRIPE_CATALOGUE_API_VERSION } from "../../packages/provider-runtime/src/adapters/stripe/transport/call-context.js";
import { STRIPE_SCHEMA_DEFS, stripeOperationSchema } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/schema-reader.js";
import { validateStripeOperationParameters } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/schema-validator.js";
import { stripeCensusRecord } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/census.js";
import { buildStripeAuthorizeUrl, readStripeReturnParams, StripeOAuthStateRegistry } from "../../packages/provider-runtime/src/adapters/stripe/oauth-state.js";
import { buildStripeTokenExchangeRequest, parseStripeOAuthTokenResponse } from "../../packages/provider-runtime/src/adapters/stripe/oauth-token-exchange.js";
import { createStripeWebhookVerifier } from "../../packages/provider-runtime/src/adapters/stripe/webhook-signature.js";
import {
  CONNECT_LIFECYCLE_OPERATIONS,
  createStripeConnectAccountLifecycle,
} from "../../packages/desktop/src/host/payswap/stripe/connect-account-lifecycle.js";
import {
  evaluateStripeConnectPlatformGates,
  isAccountModelDecision,
  validateAccountModelCapabilityConsistency,
} from "../../packages/desktop/src/host/payswap/stripe/connect-platform-gates.js";
import { createStripeConnectWebhookModule } from "../../packages/desktop/src/host/payswap/stripe/connect-webhook-events.js";
import { classifyStripeConnectPurposeEligibility, resolveStripeConnectTopology } from "../../packages/desktop/src/host/payswap/stripe/connect-topology.js";
import type { StripeOperationCensusPort } from "../../packages/desktop/src/host/payswap/stripe/action-seams.js";

type GateResult = "GREEN" | "RED" | "SKIPPED" | "OPERATOR_GATED";
interface Gate { readonly gate: string; readonly result: GateResult; readonly detail: string }

const ENV = {
  clientId: "STRIPE_PLATFORM_CLIENT_ID",
  clientSecret: "STRIPE_PLATFORM_CLIENT_SECRET",
  connectWebhookSecret: "STRIPE_CONNECT_WEBHOOK_SECRET",
  redirectUri: "STRIPE_U2_REDIRECT_URI",
  writes: "STRIPE_SANDBOX_WRITES_ENABLED",
  accountModelJson: "STRIPE_CONNECT_ACCOUNT_MODEL_JSON",
  u2Code: "STRIPE_U2_AUTHORIZATION_CODE",
  dryRun: "P27_A1_WIRING_DRY_RUN",
  receipt: "A1_RECEIPT_PATH",
} as const;

const gates: Gate[] = [];
const startedAt = new Date().toISOString();
const dryRun = process.env[ENV.dryRun] === "1";
const platformClientId = process.env[ENV.clientId];
const platformClientSecret = process.env[ENV.clientSecret];
const connectWebhookSecret = process.env[ENV.connectWebhookSecret];
const redirectUri = process.env[ENV.redirectUri] ?? "https://payswap.example/stripe/u2/return";
const writesEnabled = process.env[ENV.writes] === "1";
const accountModelJson = process.env[ENV.accountModelJson];
const u2Code = process.env[ENV.u2Code];

const credentialsPresent =
  typeof platformClientId === "string" && platformClientId.length > 0 &&
  typeof platformClientSecret === "string" && platformClientSecret.length > 0;

if (!dryRun && !credentialsPresent) {
  console.error(
    `[P27-A a1] ${ENV.clientId} / ${ENV.clientSecret} are not set — the Stripe U2/U3 real Sandbox tier is OPERATOR_GATED and nothing is simulated. ` +
      "Supply the platform application configuration through the station secret store (see docs/productization-evidence/P27-OPERATOR-RUN-CARD-2026-11-03.md §B). Exit 2.",
  );
  process.exit(2);
}
if (!dryRun && credentialsPresent &&
  (platformClientSecret!.startsWith("sk_live_") || platformClientSecret!.startsWith("rk_live_"))) {
  console.error("[P27-A a1] LIVE PLATFORM KEY REFUSED — this deployment is SANDBOX-only (INV-25, at this harness's own edge). Exit 1.");
  process.exit(1);
}

/** The dry run's pinned clock (2026-11-03T14:00:00Z); the real tier binds Date.now. */
const NOW_MS = 1_762_267_200_000n;
const nowMs = (): bigint => (dryRun ? NOW_MS : BigInt(Date.now()));
const newState = (): string => randomBytes(24).toString("hex");
const nowIso = (): string => new Date(Number(nowMs())).toISOString();

/** The pinned-census view (the same structural mapper the desktop lifecycle battery composes). */
function censusView(operationId: string) {
  const record = stripeCensusRecord(operationId);
  if (record === undefined) return undefined;
  return {
    operationId: record.operationId,
    apiNamespace: record.apiNamespace,
    method: record.method === "GET" || record.method === "POST" ? record.method : ("GET" as const),
    path: record.path, pathParams: [...record.pathParams], effectClass: record.effectClass,
    approvalTier: record.approvalTier, supportState: record.supportState,
    requiredPermissionRule: record.requiredPermissionRule, readBackOperationId: null,
    idempotencyKeyAllowed: true, summary: record.summary, resourceFamily: record.resourceFamily,
    packId: record.packId, listPaginated: record.listPaginated,
  };
}
const census: StripeOperationCensusPort = {
  catalogueRelease: "stripe-openapi/v2596@2026-09-30.endive",
  resolve: (id) => censusView(id),
  dispatchAllowed: (id) => censusView(id)?.supportState.startsWith("IMPLEMENTED") ?? false,
  enumerate: () => [],
};

/** The real-fetch binding (the host composition's adapter, verbatim). */
const realFetchBinding = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => { headers[key] = value; });
  return { status: response.status, headers, text: () => response.text() };
};
const transport = new StripeCatalogueTransport({ fetchImpl: realFetchBinding });

/** Map the catalogue transport's result onto the host dispatch-response seam (INV-04 one-to-one). */
function dispatchResponseOf(result: StripeOperationDispatchResult) {
  if (result.kind === "OK") {
    return { delivered: true, status: result.status, body: result.body };
  }
  if (result.kind === "ERROR_STATUS") {
    return {
      delivered: true, status: result.error.httpStatus, body: result.body,
      providerErrorCode: result.error.providerErrorCode ?? result.error.providerErrorType ?? undefined,
    };
  }
  if (result.kind === "UNKNOWN") {
    return { delivered: false, failure: { kind: result.ambiguity } };
  }
  return { delivered: false, failure: { kind: "REFUSED_BEFORE_DISPATCH" as const, detail: result.reason } };
}

const FAKE_CLIENT_ID = "ca_FAKEWIRING0000000000000000";
const FAKE_CLIENT_SECRET = "sk_test_FAKEWIRING0000000000000000";
const FAKE_CONNECT_SECRET = "whsec_FAKE_WIRING_SECRET_000000000";
const effective = {
  clientId: dryRun ? FAKE_CLIENT_ID : platformClientId!,
  clientSecret: dryRun ? FAKE_CLIENT_SECRET : platformClientSecret!,
  connectWebhookSecret: dryRun ? FAKE_CONNECT_SECRET : connectWebhookSecret,
};

/** Sign a body locally exactly as Stripe's documented webhook scheme does (t=…/v1=…). */
const sign = (body: string, ts: string, secret: string): string =>
  `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
const realCrypto = {
  hmacSha256Hex(key: string, message: string): string { return createHmac("sha256", key).update(message, "utf8").digest("hex"); },
  timingSafeEqualHex(a: string, b: string): boolean {
    const l = Buffer.from(a, "hex"), r = Buffer.from(b, "hex");
    return l.length === r.length && timingSafeEqual(l, r);
  },
};

/** The connect webhook module over the REAL provider-runtime verifier (the existing stripe pattern). */
const webhookModule = createStripeConnectWebhookModule({
  connectWebhookSecret: effective.connectWebhookSecret,
  signatureVerifier: {
    verify: (input) => {
      const verifier = createStripeWebhookVerifier({
        webhookSecret: effective.connectWebhookSecret!,
        crypto: realCrypto,
        clock: { now: nowMs, monotonic: nowMs },
      });
      return verifier.verify({
        delivery: { providerName: "stripe", eventId: "evt_adapter", signature: input.signature, signatureTimestamp: "0", eventCreatedAt: "0", payload: null },
        canonicalBody: input.canonicalBody,
      });
    },
  },
  nowIso,
});

/** The wiring dry-run's SAMPLE account-model decision — NEVER an operator decision (§B.2 stays gated). */
const SAMPLE_ACCOUNT_MODEL = {
  creationModel: "CONTROLLER_PROPERTIES", serviceAgreement: "recipient", stripeDashboardType: "none",
  feesPayer: "application", lossesPayer: "application", requirementCollection: "stripe",
  requestedCapabilities: ["transfers"], decisionRecordRef: "harness-sample:never-an-operator-decision",
} as const;

/** The §B.2 account-model decision source (OPERATOR_GATED at the real tier; the harness SAMPLE in the dry run). */
const parsedDecision: unknown = (() => {
  if (dryRun) return SAMPLE_ACCOUNT_MODEL;
  if (typeof accountModelJson !== "string" || accountModelJson.length === 0) return undefined;
  try { return JSON.parse(accountModelJson) as unknown; } catch { return "UNPARSEABLE"; }
})();
const decidedAccountModel = isAccountModelDecision(parsedDecision) ? parsedDecision : undefined;

const lifecycle = createStripeConnectAccountLifecycle({
  census,
  transport: {
    transportId: dryRun ? "wiring-dry-run-scripted" : "stripe-catalogue-real",
    async send(call) {
      if (dryRun) {
        return { delivered: true, status: 200, body: { id: "acct_FAKEWIRING00000", object: "account", requirements: { currently_due: [] }, capabilities: { transfers: { status: "pending" } } } };
      }
      const flat: Record<string, unknown> = {};
      for (const parameter of call.parameters) { flat[parameter.name] = parameter.value; }
      const result = await transport.dispatch(
        { operationId: call.operationId, params: flat, idempotencyKey: undefined },
        { apiVersion: call.apiVersion, authorizationHeader: call.authorization, timeoutMs: 25_000 },
      );
      return dispatchResponseOf(result);
    },
  },
  credentials: () => ({ platformClientId: effective.clientId, platformClientSecret: effective.clientSecret }),
  gates: () => evaluateStripeConnectPlatformGates({
    credentials: {
      platformClientId: effective.clientId, platformClientSecret: effective.clientSecret,
      connectWebhookSecret: effective.connectWebhookSecret, registeredRedirectUri: redirectUri,
    },
    decisions: decidedAccountModel !== undefined ? { accountModel: decidedAccountModel } : {},
  }),
  nowIso,
  createId: () => `harness-${randomBytes(6).toString("hex")}`,
  identityBindings: { put: () => {}, byAccount: () => undefined },
});

async function main(): Promise<number> {
  // ---- G1 — the platform key read (REAL tier only: the real wire). ----
  if (dryRun) {
    gates.push({ gate: "G1_PLATFORM_KEY_READ", result: "SKIPPED", detail: "wiring dry-run: no network — the real platform-key read runs at the real tier" });
  } else {
    try {
      const result = await transport.dispatch(
        { operationId: "GetAccount", params: {} },
        { apiVersion: STRIPE_CATALOGUE_API_VERSION, authorizationHeader: `Bearer ${platformClientSecret}`, timeoutMs: 25_000 },
      );
      const body = result.kind === "OK" ? (result.body as { object?: string; id?: string; livemode?: boolean }) : undefined;
      gates.push({
        gate: "G1_PLATFORM_KEY_READ",
        result: result.kind === "OK" && result.status === 200 && body?.object === "account" && body.livemode === false ? "GREEN" : "RED",
        detail: `GetAccount → ${result.kind} status=${String(result.kind === "OK" ? result.status : result.kind === "ERROR_STATUS" ? result.error.httpStatus : "n/a")} livemode=${String(body?.livemode)} acct=${String(body?.id)}`,
      });
    } catch (error) { gates.push({ gate: "G1_PLATFORM_KEY_READ", result: "RED", detail: `threw: ${String(error)}` }); }
  }

  // ---- G2 — the U2 authorize machinery (state mint/consume/replay + URL). ----
  try {
    const registry = new StripeOAuthStateRegistry();
    const binding = registry.mint({ taskId: "harness-u2", providerId: "stripe", form: "DELEGATED_OAUTH", requestedScopes: ["read_only"] }, { now: nowMs(), newState });
    const url = buildStripeAuthorizeUrl({ clientId: effective.clientId, redirectUri, state: binding.state, scope: "read_only" });
    const consumed = registry.consume(binding.state, nowMs() + 1n);
    const replay = registry.consume(binding.state, nowMs() + 2n);
    const returnParams = readStripeReturnParams(new URLSearchParams("state=&error=access_denied"));
    const green = url.startsWith("https://connect.stripe.com/oauth/authorize?") &&
      consumed.kind === "CONSUMED" && replay.kind === "REJECTED" && replay.reason === "STATE_ALREADY_CONSUMED" &&
      returnParams.state === null && returnParams.error === "access_denied";
    gates.push({ gate: "G2_U2_AUTHORIZE_MACHINERY", result: green ? "GREEN" : "RED", detail: `authorize URL built; state single-use (first consume ${consumed.kind}, replay ${replay.kind === "REJECTED" ? replay.reason : "ACCEPTED"}); the error return path surfaces access_denied verbatim` });
  } catch (error) { gates.push({ gate: "G2_U2_AUTHORIZE_MACHINERY", result: "RED", detail: `threw: ${String(error)}` }); }

  // ---- G3 — the U2 token exchange (OPERATOR_GATED without a real ac_ code). ----
  if (dryRun) {
    const request = buildStripeTokenExchangeRequest({ code: "ac_FAKEWIRINGCODE0000000000000", clientId: FAKE_CLIENT_ID, clientSecret: FAKE_CLIENT_SECRET });
    const parsed = parseStripeOAuthTokenResponse({ token_type: "bearer", scope: "read_only", livemode: false, stripe_user_id: "acct_FAKEWIRING00000", access_token: "sk_test_FAKEWIRINGTOKEN0000000000" });
    const green = request.bodyFields.grant_type === "authorization_code" && parsed.kind === "TOKEN_ISSUED" && parsed.livemode === false;
    gates.push({ gate: "G3_U2_TOKEN_EXCHANGE", result: green ? "GREEN" : "RED", detail: "wiring dry-run: the request builder (secret only in the basic header) + the fail-closed parser compose (livemode=false; the token material exists only inside the flow frame, never in this receipt); the REAL exchange needs the operator's browser round-trip code" });
  } else if (typeof u2Code !== "string" || u2Code.length === 0) {
    gates.push({ gate: "G3_U2_TOKEN_EXCHANGE", result: "OPERATOR_GATED", detail: `no ${ENV.u2Code} — the authorization code can only come from the operator's browser round-trip on the registered redirect URL (run card §B.3); never a fabricated code` });
  } else {
    try {
      const request = buildStripeTokenExchangeRequest({ code: u2Code, clientId: platformClientId!, clientSecret: platformClientSecret! });
      const response = await fetch(request.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: request.basicAuthorization }, body: new URLSearchParams(request.bodyFields).toString() });
      const parsed = parseStripeOAuthTokenResponse(JSON.parse(await response.text()) as unknown);
      gates.push({
        gate: "G3_U2_TOKEN_EXCHANGE",
        result: parsed.kind === "TOKEN_ISSUED" && parsed.livemode === false ? "GREEN" : parsed.kind === "PROVIDER_ERROR" ? "OPERATOR_GATED" : "RED",
        detail: parsed.kind === "TOKEN_ISSUED" ? `token issued for ${String(parsed.stripeUserId)} (livemode=false; sealed host-side, never in this receipt)` : `provider answer: ${parsed.kind}${"verbatimError" in parsed ? ` ${String(parsed.verbatimError)}` : ""}`,
      });
    } catch (error) { gates.push({ gate: "G3_U2_TOKEN_EXCHANGE", result: "RED", detail: `threw: ${String(error)}` }); }
  }

  // ---- G4 — the §B.2 account-model decision + the REAL schema validation of the plan. ----
  if (parsedDecision === undefined) {
    gates.push({ gate: "G4_U3_ACCOUNT_MODEL_PLAN", result: "OPERATOR_GATED", detail: `no ${ENV.accountModelJson} — the Connect account model is the operator's §B.2 decision (never a default guess); the census plan composes and validates the moment the decision is supplied` });
  } else if (parsedDecision === "UNPARSEABLE") {
    gates.push({ gate: "G4_U3_ACCOUNT_MODEL_PLAN", result: "RED", detail: `${ENV.accountModelJson} is not valid JSON` });
  } else if (!isAccountModelDecision(parsedDecision)) {
    gates.push({ gate: "G4_U3_ACCOUNT_MODEL_PLAN", result: "RED", detail: "the supplied account-model decision does not match the typed decision shape (creationModel/serviceAgreement/controller settings/requestedCapabilities/decisionRecordRef)" });
  } else {
    const consistency = validateAccountModelCapabilityConsistency(parsedDecision);
    const plan = lifecycle.planAccountCreation({ accountModelDecision: parsedDecision, country: "US" });
    const schema = plan.kind === "OK" ? stripeOperationSchema(plan.value.operationId) : undefined;
    const flat: Record<string, unknown> = {};
    if (plan.kind === "OK") { for (const parameter of plan.value.parameters) { flat[parameter.name] = parameter.value; } }
    const validated = schema !== undefined ? validateStripeOperationParameters(schema, STRIPE_SCHEMA_DEFS, flat) : undefined;
    const green = consistency.ok && plan.kind === "OK" && validated?.ok === true;
    gates.push({
      gate: "G4_U3_ACCOUNT_MODEL_PLAN",
      result: green ? "GREEN" : "RED",
      detail: `${dryRun ? "wiring dry-run (the harness SAMPLE decision — never an operator record)" : "the operator decision"} → the controller-properties plan validates against the pinned census schema${validated !== undefined && !validated.ok ? ` (validator refusal: ${String(validated.issues[0]?.kind)} at ${String(validated.issues[0]?.at)})` : ""}${consistency.ok ? "" : `; INCONSISTENT: ${consistency.reason}`}`,
    });
  }

  // ---- G5 — the connected-account creation write (DOUBLE-gated). ----
  if (dryRun) {
    gates.push({ gate: "G5_U3_CREATE_CONNECTED_ACCOUNT", result: "SKIPPED", detail: "wiring dry-run: no network; the real creation runs at the real tier behind the write double-gate" });
  } else if (!writesEnabled) {
    gates.push({ gate: "G5_U3_CREATE_CONNECTED_ACCOUNT", result: "OPERATOR_GATED", detail: `${ENV.writes}=1 not set — the connected-account creation write stays operator-gated (never a silent pass)` });
  } else if (parsedDecision === undefined || !isAccountModelDecision(parsedDecision)) {
    gates.push({ gate: "G5_U3_CREATE_CONNECTED_ACCOUNT", result: "OPERATOR_GATED", detail: "the §B.2 account-model decision is required before any connected account is created (never a default model)" });
  } else {
    try {
      const created = await lifecycle.createConnectedAccount({ accountModelDecision: parsedDecision, country: "US", authorizationHeader: `Bearer ${platformClientSecret}`, apiVersion: STRIPE_CATALOGUE_API_VERSION });
      if (created.kind !== "OK") {
        gates.push({ gate: "G5_U3_CREATE_CONNECTED_ACCOUNT", result: created.kind === "REFUSED" ? "OPERATOR_GATED" : "RED", detail: `creation → ${created.kind}: ${"detail" in created ? String(created.detail) : ""}` });
      } else {
        const observed = await lifecycle.observeConnectedAccount({ accountRef: created.value.accountRef, authorizationHeader: `Bearer ${platformClientSecret}`, apiVersion: STRIPE_CATALOGUE_API_VERSION });
        gates.push({
          gate: "G5_U3_CREATE_CONNECTED_ACCOUNT",
          result: observed.kind === "OK" ? "GREEN" : "RED",
          detail: observed.kind === "OK" ? `connected account ${created.value.accountRef} created; the account's own objects observed (payouts_enabled=${String(observed.value.payoutsEnabled)}, capabilities=${observed.value.capabilities.map((c) => c.capability).join(",") || "none"})` : `observation → ${observed.kind}`,
        });
      }
    } catch (error) { gates.push({ gate: "G5_U3_CREATE_CONNECTED_ACCOUNT", result: "RED", detail: `threw: ${String(error)}` }); }
  }

  // ---- G6 — the connected-account webhook module (the whsec gate + the REAL signature scheme). ----
  const eventBody = JSON.stringify({ id: "evt_FAKEWIRINGEVENT0000000", object: "event", type: "account.updated", created: Number(nowMs() / 1000n), data: { object: { id: "acct_FAKEWIRING00000", object: "account", payouts_enabled: false, charges_enabled: false, details_submitted: false, requirements: { currently_due: ["individual.verification.document"] }, capabilities: { transfers: { status: "pending" } } } } });
  if (!dryRun && (typeof connectWebhookSecret !== "string" || connectWebhookSecret.length === 0)) {
    gates.push({ gate: "G6_CONNECT_WEBHOOK", result: "OPERATOR_GATED", detail: `no ${ENV.connectWebhookSecret} — the connected-account event tier stays gated (run card §B.3/§B.4); no event is ever accepted unconfigured` });
  } else {
    const signature = sign(eventBody, String(nowMs() / 1000n), effective.connectWebhookSecret!);
    const verified = webhookModule.verify({ eventId: "evt_FAKEWIRINGEVENT0000000", signatureHeader: signature, body: eventBody });
    const replay = webhookModule.verify({ eventId: "evt_FAKEWIRINGEVENT0000000", signatureHeader: signature, body: eventBody });
    const badSignature = webhookModule.verify({ eventId: "evt_FAKEWIRINGEVENT0000000", signatureHeader: sign(eventBody, String(nowMs() / 1000n), "whsec_FAKE_WRONG_SECRET_0000000000"), body: eventBody });
    const green = verified.kind === "VERIFIED_ACCOUNT_UPDATED" &&
      verified.observation.requirementsCurrentlyDue.includes("individual.verification.document") &&
      replay.kind === "REFUSED" && replay.refusal === "EVENT_ALREADY_CONSUMED" &&
      badSignature.kind === "REFUSED" && badSignature.refusal === "SIGNATURE_INVALID";
    gates.push({ gate: "G6_CONNECT_WEBHOOK", result: green ? "GREEN" : "RED", detail: `${dryRun ? "wiring dry-run over the REAL verifier (a locally signed event — never an inbound-delivery claim)" : "the delivered STRIPE_CONNECT_WEBHOOK_SECRET verified a locally signed event"}: account.updated → the typed observation (the account's own requirements carried); the replay is refused; a wrong signature is refused. The real-delivery tier needs the registered public endpoint (§B.3).` });
  }

  // ---- G7 — the INV-30 purpose gate + the topology gate (§B.2) + the census law. ----
  const p2p = classifyStripeConnectPurposeEligibility({ purposeClass: "REGULATED_REMITTANCE_OR_P2P" });
  const commerce = classifyStripeConnectPurposeEligibility({ purposeClass: "GENUINE_COMMERCE" });
  const topology = resolveStripeConnectTopology({ census, topologyDecision: undefined });
  const censusOk = Object.values(CONNECT_LIFECYCLE_OPERATIONS).every((id) => censusView(id) !== undefined && censusView(id)!.supportState.startsWith("IMPLEMENTED"));
  const green = p2p.eligible === false && p2p.requiresProviderProductAndLegalApproval === true &&
    commerce.eligible === true && topology.kind === "OPERATOR_GATED" && censusOk;
  gates.push({
    gate: "G7_PURPOSE_GATE_AND_CENSUS",
    result: green ? "GREEN" : "RED",
    detail: "INV-30: regulated remittance/P2P is the typed exclusion through Connect (relabeling changes nothing); genuine commerce is eligible through the DECIDED charge model; the topology stays OPERATOR_GATED (§B.2 undecidable by code); every lifecycle operation resolves in the pinned census v2596 (fail-closed — no pin expansion)",
  });

  const ranAt = new Date().toISOString();
  const redGates = gates.filter((g) => g.result === "RED").length;
  const receipt = {
    harness: "p27-a/a1-connect-real-sandbox-journey",
    tier: dryRun ? "WIRING_DRY_RUN" : "REAL_SANDBOX",
    ranAt, startedAt,
    gates,
    honestNotes: [
      `credential source: the station secret store (${ENV.clientId}, ${ENV.clientSecret}, ${ENV.connectWebhookSecret} env); never chat, never echoed, never in this receipt`,
      `writes were double-gated (${writesEnabled ? "ENABLED" : "NOT ENABLED"})`,
      "the §B.2 operator decisions are never guessed (a typed OPERATOR_GATED verdict is a deliverable)",
      "no live-mode key was accepted (INV-25 re-checked at this harness's own edge)",
      dryRun ? "the wiring dry-run composes REAL modules over scripted transports — its receipt is intentionally OUTSIDE the evidence tree (fixture receipts are never promoted)" : "a real-tier receipt (secret-free) belongs in docs/productization-evidence",
    ],
  };
  const receiptJson = JSON.stringify(receipt, null, 2);
  const knownSecrets = [platformClientSecret, connectWebhookSecret].filter((value): value is string => typeof value === "string" && value.length > 0);
  if (knownSecrets.some((secret) => receiptJson.includes(secret))) {
    console.error("[P27-A a1] SECRET LEAK in the receipt — refusing to emit.");
    process.exit(1);
  }
  const defaultPath = dryRun ? "/tmp/p27-a-a1-connect-wiring-dry-run-RECEIPT.json" : "docs/productization-evidence/p27-a-a1-connect-real-sandbox-RECEIPT.json";
  const outPath = process.env[ENV.receipt] ?? defaultPath;
  writeFileSync(outPath, receiptJson + "\n");
  console.log(`[P27-A a1] ${gates.filter((g) => g.result === "GREEN").length}/${gates.length} gates GREEN (${redGates} RED); receipt → ${outPath}`);
  for (const gate of gates) console.log(`  ${gate.result.padEnd(14)} ${gate.gate}: ${gate.detail}`);
  return redGates === 0 ? 0 : 1;
}

process.exit(await main());
