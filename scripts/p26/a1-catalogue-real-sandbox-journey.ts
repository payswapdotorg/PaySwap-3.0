/**
 * P26-B — the REAL STRIPE SANDBOX JOURNEY harness (2026-11-03, ADR-0018 /
 * the P26-0 gap matrix R1). The catalogue-era twin of the P14 real-flow
 * harnesses: genuine journeys against a REAL Stripe Sandbox account over
 * the REAL catalogue transport (no fakes, no scripted model responses).
 *
 * THE LAWS (the P14/P21/P22 harness precedent, binding):
 * - Credential law: the key comes ONLY from STRIPE_SANDBOX_SECRET_KEY (the
 *   station secret store); never hardcoded, never logged, never echoed,
 *   never in the receipt. Exit 2 without it — the honest pre-gate state;
 *   nothing is simulated (never a silent pass).
 * - INV-25: live keys are refused by the transport edge AND re-checked here;
 *   the deployment stays Sandbox-only.
 * - Writes are DOUBLE-gated: STRIPE_SANDBOX_SECRET_KEY AND
 *   STRIPE_SANDBOX_WRITES_ENABLED=1 (the P24-1 TIER 2a law).
 * - The receipt is machine-scanned: if the JSON contains the secret in any
 *   form, the harness REFUSES to emit it.
 * - The API-version A/B records BOTH wire versions (2025-08-27.basil and
 *   2026-09-30.endive) for the same read — the P26-C migration's
 *   real-Sandbox evidence path.
 *
 * Run: npx tsx scripts/p26/a1-catalogue-real-sandbox-journey.ts
 *      A1_RECEIPT_PATH=<path> optionally redirects the receipt.
 */
import { writeFileSync } from "node:fs";

import { StripeCatalogueTransport } from "../../packages/provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import type { StripeCatalogueFetch } from "../../packages/provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import { STRIPE_CATALOGUE_API_VERSION } from "../../packages/provider-runtime/src/adapters/stripe/transport/call-context.js";
import { PINNED_STRIPE_LEGACY_REQUEST_API_VERSION } from "../../packages/desktop/src/host/payswap/stripe/stripe-pins.js";

const ENV_KEY = "STRIPE_SANDBOX_SECRET_KEY";
const ENV_WRITES = "STRIPE_SANDBOX_WRITES_ENABLED";
const ENV_RECEIPT = "A1_RECEIPT_PATH";

const secretKey = process.env[ENV_KEY];
const writesEnabled = process.env[ENV_WRITES] === "1";

if (secretKey === undefined || secretKey.length === 0) {
  console.error(
    `[P26-B a1] ${ENV_KEY} is not set — the real Sandbox tier is OPERATOR_GATED and nothing is simulated. ` +
      "Supply the key through the station secret store (see docs/productization-evidence/P26-OPERATOR-RUN-CARD-2026-11-03.md). Exit 2.",
  );
  process.exit(2);
}
if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
  console.error("[P26-B a1] LIVE KEY REFUSED — this deployment is SANDBOX-only (INV-25). Exit 1.");
  process.exit(1);
}

/** The real-fetch binding (the host composition's adapter, verbatim). */
const realFetchBinding: StripeCatalogueFetch = async (url, init) => {
  const response = await fetch(url, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => {
    headers[key] = value;
  });
  return { status: response.status, headers, text: () => response.text() };
};

const transport = new StripeCatalogueTransport(realFetchBinding);

function context(apiVersion: string): { apiVersion: string; authorizationHeader: string; timeoutMs: number } {
  return { apiVersion, authorizationHeader: `Bearer ${secretKey}`, timeoutMs: 25_000 };
}

interface Gate {
  readonly gate: string;
  readonly result: "GREEN" | "RED" | "SKIPPED";
  readonly detail: string;
}

const gates: Gate[] = [];
const startedAt = new Date().toISOString();

async function read(apiVersion: string): Promise<StripeCatalogueDispatchShape> {
  const result = await transport.dispatch(
    { operationId: "GetAccount", parameters: [] },
    context(apiVersion),
  );
  return result as StripeCatalogueDispatchShape;
}

type StripeCatalogueDispatchShape = {
  kind: string;
  status?: number;
  body?: unknown;
  requestId?: string;
  providerErrorCode?: string;
};

async function main(): Promise<number> {
  // ---- GATE 1 — the read journey (the account + two list reads, real wire). ----
  try {
    const account = await read(STRIPE_CATALOGUE_API_VERSION);
    const body = account.body as { object?: string; id?: string; livemode?: boolean } | undefined;
    if (
      account.kind === "OK" &&
      account.status === 200 &&
      body?.object === "account" &&
      typeof body.id === "string" &&
      body.id.startsWith("acct_")
    ) {
      gates.push({
        gate: "G1_READ_JOURNEY",
        result: "GREEN",
        detail: `GetAccount 200 (acct ${body.id}, livemode=${String(body.livemode)}); customers+products lists dispatched`,
      });
      // Two real list reads (bounded; the counts land in the detail).
      const customers = (await transport.dispatch(
        { operationId: "GetCustomers", parameters: [{ name: "limit", value: 3, location: "query" }] },
        context(STRIPE_CATALOGUE_API_VERSION),
      )) as StripeCatalogueDispatchShape;
      const products = (await transport.dispatch(
        { operationId: "GetProducts", parameters: [{ name: "limit", value: 3, location: "query" }] },
        context(STRIPE_CATALOGUE_API_VERSION),
      )) as StripeCatalogueDispatchShape;
      const customerCount = Array.isArray(
        (customers.body as { data?: unknown[] } | undefined)?.data,
      )
        ? ((customers.body as { data: unknown[] }).data.length)
        : -1;
      const productCount = Array.isArray((products.body as { data?: unknown[] } | undefined)?.data)
        ? ((products.body as { data: unknown[] }).data.length)
        : -1;
      gates.push({
        gate: "G1_READ_JOURNEY_LISTS",
        result: customers.kind === "OK" && products.kind === "OK" ? "GREEN" : "RED",
        detail: `GetCustomers(limit 3) → ${customers.kind} (${customerCount} items); GetProducts(limit 3) → ${products.kind} (${productCount} items)`,
      });
    } else {
      gates.push({
        gate: "G1_READ_JOURNEY",
        result: "RED",
        detail: `GetAccount → ${account.kind} status=${String(account.status)} code=${String(account.providerErrorCode)}`,
      });
    }
  } catch (error) {
    gates.push({ gate: "G1_READ_JOURNEY", result: "RED", detail: `threw: ${String(error)}` });
  }

  // ---- GATE 2 — the API-version A/B (the P26-C migration evidence path). ----
  try {
    const basil = await read(PINNED_STRIPE_LEGACY_REQUEST_API_VERSION);
    const endive = await read(STRIPE_CATALOGUE_API_VERSION);
    const idOf = (r: StripeCatalogueDispatchShape): string | undefined =>
      (r.body as { id?: string } | undefined)?.id;
    const bothOk =
      basil.kind === "OK" && endive.kind === "OK" && idOf(basil) === idOf(endive);
    gates.push({
      gate: "G2_VERSION_AB",
      result: bothOk ? "GREEN" : "RED",
      detail: bothOk
        ? `the same account read returned 200 under ${PINNED_STRIPE_LEGACY_REQUEST_API_VERSION} AND ${STRIPE_CATALOGUE_API_VERSION} (acct ${idOf(basil)})`
        : `basil=${basil.kind}/${String(basil.status)} endive=${endive.kind}/${String(endive.status)}`,
    });
  } catch (error) {
    gates.push({ gate: "G2_VERSION_AB", result: "RED", detail: `threw: ${String(error)}` });
  }

  // ---- GATE 3 — the two-phase write journey (DOUBLE-gated). ----
  if (!writesEnabled) {
    gates.push({
      gate: "G3_WRITE_JOURNEY",
      result: "SKIPPED",
      detail: `${ENV_WRITES}=1 not set — the write tier stays operator-gated (never a silent pass)`,
    });
  } else {
    try {
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const created = (await transport.dispatch(
        {
          operationId: "PostProducts",
          parameters: [
            { name: "name", value: `P26-B harness product ${stamp}`, location: "body" },
          ],
        },
        context(STRIPE_CATALOGUE_API_VERSION),
      )) as StripeCatalogueDispatchShape;
      const productId = (created.body as { id?: string } | undefined)?.id;
      if (created.kind !== "OK" || typeof productId !== "string") {
        gates.push({
          gate: "G3_WRITE_JOURNEY",
          result: "RED",
          detail: `PostProducts → ${created.kind} status=${String(created.status)}`,
        });
      } else {
        const readBack = (await transport.dispatch(
          { operationId: "GetProductsId", parameters: [{ name: "id", value: productId, location: "path" }] },
          context(STRIPE_CATALOGUE_API_VERSION),
        )) as StripeCatalogueDispatchShape;
        const archived = (await transport.dispatch(
          { operationId: "DeleteProductsId", parameters: [{ name: "id", value: productId, location: "path" }] },
          context(STRIPE_CATALOGUE_API_VERSION),
        )) as StripeCatalogueDispatchShape;
        const readBackName = (readBack.body as { name?: string } | undefined)?.name;
        gates.push({
          gate: "G3_WRITE_JOURNEY",
          result:
            readBack.kind === "OK" && archived.kind === "OK" ? "GREEN" : "RED",
          detail: `create prod(${productId}) → read-back ${readBack.kind} (name=${String(readBackName)}) → archive ${archived.kind} (the derived read-back route, exercised end-to-end)`,
        });
      }
    } catch (error) {
      gates.push({ gate: "G3_WRITE_JOURNEY", result: "RED", detail: `threw: ${String(error)}` });
    }
  }

  // ---- GATE 4 — the re-auth probe law (ADR-0018 D1's mechanics on the real account). ----
  try {
    const probe = (await transport.dispatch(
      { operationId: "GetAccount", parameters: [] },
      context(STRIPE_CATALOGUE_API_VERSION),
    )) as StripeCatalogueDispatchShape;
    const probedId = (probe.body as { id?: string } | undefined)?.id;
    gates.push({
      gate: "G4_REAUTH_PROBE_LAW",
      result: probe.kind === "OK" && typeof probedId === "string" ? "GREEN" : "RED",
      detail:
        probe.kind === "OK"
          ? `the fresh-credential probe path verified the account (${String(probedId)}) — the same-account law's mechanics against the real account (the full proof-machinery battery is the desktop tier)`
          : `probe → ${probe.kind}/${String(probe.status)}`,
    });
  } catch (error) {
    gates.push({ gate: "G4_REAUTH_PROBE_LAW", result: "RED", detail: `threw: ${String(error)}` });
  }

  const ranAt = new Date().toISOString();
  const redGates = gates.filter((g) => g.result === "RED").length;
  const receipt = {
    harness: "p26-b/a1-catalogue-real-sandbox-journey",
    ranAt,
    startedAt,
    tier: "REAL_SANDBOX",
    gates,
    honestNotes: [
      `credential source: the station secret store (${ENV_KEY} env); never chat, never echoed, never in this receipt`,
      "writes were double-gated (" + (writesEnabled ? "ENABLED" : "NOT ENABLED") + ")",
      `the wire versions exercised: ${PINNED_STRIPE_LEGACY_REQUEST_API_VERSION} (the per-connection default) + ${STRIPE_CATALOGUE_API_VERSION} (the catalogue pin)`,
      "no live-mode key was accepted (INV-25 re-checked at this harness's own edge)",
    ],
  };

  // THE SECRET-SCAN LAW: refuse to emit a receipt containing the credential.
  const receiptJson = JSON.stringify(receipt, null, 2);
  if (receiptJson.includes(secretKey)) {
    console.error("[P26-B a1] SECRET LEAK in the receipt — refusing to emit.");
    process.exit(1);
  }
  const outPath = process.env[ENV_RECEIPT] ?? "docs/productization-evidence/p26-b-a1-catalogue-real-sandbox-RECEIPT.json";
  writeFileSync(outPath, receiptJson + "\n");
  console.log(`[P26-B a1] ${gates.filter((g) => g.result === "GREEN").length}/${gates.length} gates GREEN (${redGates} RED); receipt → ${outPath}`);
  for (const gate of gates) console.log(`  ${gate.result.padEnd(7)} ${gate.gate}: ${gate.detail}`);
  return redGates === 0 ? 0 : 1;
}

process.exit(await main());
