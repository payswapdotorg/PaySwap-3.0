/**
 * P27-B — the shared harness core (2026-11-03, ADR-0020 D11): the credential
 * law, the real-fetch binding, the gate/receipt scaffolding and the honest
 * entitlement-class recognizer shared by the Global-Payouts harness family
 * (b1-global-payouts-journey.ts is the entry; this module is its support —
 * the file law keeps both under 400 lines).
 *
 * THE LAWS (the P14/P21/P22/P26 harness precedent, binding):
 * - Credential law: the key comes ONLY from STRIPE_SANDBOX_SECRET_KEY (the
 *   station secret store); never hardcoded, never logged, never echoed, never
 *   in the receipt. Exit 2 without it — the honest pre-gate state; nothing is
 *   simulated (never a silent pass).
 * - INV-25: live keys are refused at the harness's own edge AND by the
 *   transport's credential gate; this deployment stays Sandbox-only.
 * - The receipt is machine-scanned: if the JSON contains the secret in any
 *   form, the harness REFUSES to emit it.
 */
import { writeFileSync } from "node:fs";

import type { StripeCatalogueFetch } from "../../packages/provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import { STRIPE_CATALOGUE_API_VERSION } from "../../packages/provider-runtime/src/adapters/stripe/transport/call-context.js";

/** The env keys of the harness family (the station secret store is the only source). */
export const PAYOUTS_HARNESS_ENV = Object.freeze({
  key: "STRIPE_SANDBOX_SECRET_KEY",
  writes: "STRIPE_SANDBOX_WRITES_ENABLED",
  receipt: "B1_RECEIPT_PATH",
} as const);

/**
 * THE CREDENTIAL LAW (module top level — the entry script calls it first):
 * exit 2 without the key (the honest pre-gate state), exit 1 on a live key
 * (INV-25 — the harness's own edge re-checks what the transport also refuses).
 */
export function enforceGlobalPayoutsHarnessCredentialLaw(): { readonly secretKey: string; readonly writesEnabled: boolean } {
  const secretKey = process.env[PAYOUTS_HARNESS_ENV.key];
  const writesEnabled = process.env[PAYOUTS_HARNESS_ENV.writes] === "1";
  if (secretKey === undefined || secretKey.length === 0) {
    console.error(
      `[P27-B b1] ${PAYOUTS_HARNESS_ENV.key} is not set — the real Sandbox tier is OPERATOR_GATED and nothing is simulated. ` +
        "Supply the key through the station secret store (see docs/productization-evidence/P27-OPERATOR-RUN-CARD-2026-11-03.md §C). Exit 2.",
    );
    process.exit(2);
  }
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
    console.error("[P27-B b1] LIVE KEY REFUSED — this deployment is SANDBOX-only (INV-25). Exit 1.");
    process.exit(1);
  }
  return { secretKey, writesEnabled };
}

/** The real-fetch binding (the host composition's adapter, verbatim from the P26 a1 harness). */
export const globalPayoutsRealFetchBinding: StripeCatalogueFetch = async (url, init) => {
  const response = await fetch(url, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => {
    headers[key] = value;
  });
  return { status: response.status, headers, text: () => response.text() };
};

/** The pinned catalogue wire version context bound to the harness key. */
export function globalPayoutsHarnessContext(
  secretKey: string,
): { apiVersion: string; authorizationHeader: string; timeoutMs: number } {
  return { apiVersion: STRIPE_CATALOGUE_API_VERSION, authorizationHeader: `Bearer ${secretKey}`, timeoutMs: 25_000 };
}

/** One harness gate's outcome (GREEN / RED / SKIPPED-OPERATOR_GATED). */
export interface GlobalPayoutsHarnessGate {
  readonly gate: string;
  readonly result: "GREEN" | "RED" | "SKIPPED";
  readonly detail: string;
}

/** The dispatch-result shape the harness inspects (the transport's typed result). */
export type GlobalPayoutsDispatchShape = {
  kind: string;
  status?: number;
  body?: unknown;
  requestId?: string | null;
  error?: { errorClass?: unknown; providerErrorCode?: unknown; providerErrorMessage?: unknown };
  reason?: string;
  detail?: string;
};

/** The honest entitlement-class error recognizer (operator-gated, not RED). */
export function isEntitlementClassRefusal(result: GlobalPayoutsDispatchShape): boolean {
  // The honest OPERATOR_GATED recognizer: the account lacks the product/
  // permission surface (Stripe's typed 403-class answers), so the missing
  // piece is the operator's entitlement action — never a harness defect.
  const errorClass = typeof result.error?.errorClass === "string" ? result.error.errorClass : "";
  const code = typeof result.error?.providerErrorCode === "string" ? result.error.providerErrorCode : "";
  const message = typeof result.error?.providerErrorMessage === "string" ? result.error.providerErrorMessage : "";
  return (
    errorClass === "PERMISSION_SCOPE_ERROR" ||
    code.includes("not_enabled") ||
    code.includes("request_not_authorized") ||
    message.includes("doesn't have the required permissions") ||
    message.includes("is not enabled") ||
    message.includes("not entitled")
  );
}

/** A secret-free error summary of one dispatch result (never the raw body). */
export function globalPayoutsErrText(result: GlobalPayoutsDispatchShape): string {
  const code =
    typeof result.error?.providerErrorCode === "string" && result.error.providerErrorCode.length > 0
      ? result.error.providerErrorCode
      : "no-code";
  const message =
    typeof result.error?.providerErrorMessage === "string" && result.error.providerErrorMessage.length > 0
      ? ` (${result.error.providerErrorMessage.slice(0, 120)})`
      : "";
  const errorClass = typeof result.error?.errorClass === "string" ? result.error.errorClass : "UNCLASSIFIED";
  return `${result.kind}/${errorClass} code=${code}${message}`;
}

/**
 * THE RECEIPT LAW: machine-scan the JSON for the credential and REFUSE to
 * emit on any leak (INV-19); then write the secret-free receipt and print the
 * gate report. Returns the process exit code (0 all non-skipped gates GREEN ·
 * 1 any RED · 2 the credential pre-gate — which already exited).
 */
export function emitGlobalPayoutsHarnessReceipt(receipt: Record<string, unknown>, secretKey: string): number {
  const gates = (receipt.gates ?? []) as readonly GlobalPayoutsHarnessGate[];
  const receiptJson = JSON.stringify(receipt, null, 2);
  if (receiptJson.includes(secretKey)) {
    console.error("[P27-B b1] SECRET LEAK in the receipt — refusing to emit.");
    process.exit(1);
  }
  const outPath = process.env[PAYOUTS_HARNESS_ENV.receipt] ?? "docs/productization-evidence/p27-b-b1-global-payouts-RECEIPT.json";
  writeFileSync(outPath, receiptJson + "\n");
  const redGates = gates.filter((g) => g.result === "RED").length;
  console.log(`[P27-B b1] ${gates.filter((g) => g.result === "GREEN").length}/${gates.length} gates GREEN (${redGates} RED); receipt → ${outPath}`);
  for (const gate of gates) console.log(`  ${gate.result.padEnd(7)} ${gate.gate}: ${gate.detail}`);
  return redGates === 0 ? 0 : 1;
}
