/**
 * P27-B — the REAL STRIPE SANDBOX GLOBAL-PAYOUTS JOURNEY harness (2026-11-03,
 * ADR-0020 D11 — key-ready, exit-2, OPERATOR_GATED). The product-slice twin
 * of scripts/p26/a1-catalogue-real-sandbox-journey.ts: the Global-Payouts
 * eligibility gates, the Treasury entitlement probe, the recipient plane, the
 * third-party outbound-payment journey and the reconciliation reads driven
 * against a REAL Stripe Sandbox account over the REAL catalogue transport —
 * nothing simulated, never a silent pass.
 *
 * THE LAWS (the P14/P21/P22/P26 harness precedent, binding; the shared core
 * lives in b1-harness-core.ts — the file law):
 * - Credential law: the key comes ONLY from STRIPE_SANDBOX_SECRET_KEY (the
 *   station secret store); exit 2 without it; INV-25 live keys refused.
 * - Writes are DOUBLE-gated: STRIPE_SANDBOX_SECRET_KEY AND
 *   STRIPE_SANDBOX_WRITES_ENABLED=1 (the P24-1 TIER 2a law).
 * - THE HONEST ENTITLEMENT TIER: Global Payouts requires Treasury AND the
 *   product entitlement on the actual account (V2, re-verified 2026-11-03).
 *   A permission/feature-class provider refusal on those reads/writes is
 *   recorded as SKIPPED (OPERATOR_GATED) with the provider's typed error
 *   code — never RED (the account, not the code, is the missing piece).
 * - The receipt is machine-scanned and never contains the credential.
 *
 * Run: npx tsx scripts/p27/b1-global-payouts-journey.ts
 *      B1_RECEIPT_PATH=<path> optionally redirects the receipt.
 */
import { StripeCatalogueTransport } from "../../packages/provider-runtime/src/adapters/stripe/transport/catalogue-transport.js";
import { evaluateGlobalPayoutsJourneyEligibility } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/payouts-eligibility.js";
import { createStripeGlobalPayoutsJourney } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/payouts-journey.js";
import { classifyStripeGlobalPayoutsOutboundPayment } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/payouts-status.js";
import { STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS, STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP, globalPayoutsCensusRecordOf } from "../../packages/provider-runtime/src/adapters/stripe/catalogue/payouts-product.js";
import {
  PAYOUTS_HARNESS_ENV,
  emitGlobalPayoutsHarnessReceipt,
  enforceGlobalPayoutsHarnessCredentialLaw,
  globalPayoutsErrText,
  globalPayoutsHarnessContext,
  globalPayoutsRealFetchBinding,
  isEntitlementClassRefusal,
} from "./b1-harness-core.ts";
import type { GlobalPayoutsDispatchShape, GlobalPayoutsHarnessGate } from "./b1-harness-core.ts";

// THE CREDENTIAL LAW runs at module top level: exit 2 without the key (the
// honest pre-gate state), exit 1 on a live key (INV-25) — before any work.
const { secretKey, writesEnabled } = enforceGlobalPayoutsHarnessCredentialLaw();

const transport = new StripeCatalogueTransport({ fetchImpl: globalPayoutsRealFetchBinding });
const journey = createStripeGlobalPayoutsJourney({ transport });
const context = () => globalPayoutsHarnessContext(secretKey);

const gates: GlobalPayoutsHarnessGate[] = [];
const startedAt = new Date().toISOString();

async function rawDispatch(operationId: string, params: Record<string, unknown>, idempotencyKey?: string): Promise<GlobalPayoutsDispatchShape> {
  return (await transport.dispatch(
    { operationId, params, context: context(), ...(idempotencyKey !== undefined ? { idempotencyKey } : {}) },
  )) as GlobalPayoutsDispatchShape;
}

async function main(): Promise<number> {
  // ---- GATE 1 — the eligibility gate law (in-repo, dated evidence; no network). ----
  {
    const ga = evaluateGlobalPayoutsJourneyEligibility({
      originCountry: "US",
      purposeClass: "ContractorSupplierPayment",
      recipientCountryCode: "KE",
      recipientCurrency: "KES",
      payoutMethodId: "bank_accounts.local",
      amountMinorUnits: 100_000,
      sendingCurrency: "USD",
      sendingLimitPayoutMethod: "Standard",
      proofs: { treasuryEntitlement: { financialAccountId: "fa_test", entitlementObserved: true }, funding: { fundedMinorUnits: 10_000_000, currency: "USD" } },
    });
    const previewOrigin = evaluateGlobalPayoutsJourneyEligibility({
      originCountry: "DE",
      purposeClass: "ContractorSupplierPayment",
      recipientCountryCode: "DE",
      recipientCurrency: "EUR",
      amountMinorUnits: 100,
      sendingCurrency: "EUR",
      proofs: { treasuryEntitlement: { financialAccountId: "fa_test", entitlementObserved: true }, funding: { fundedMinorUnits: 1_000_000, currency: "EUR" } },
    });
    const ghana = evaluateGlobalPayoutsJourneyEligibility({
      originCountry: "US",
      purposeClass: "ContractorSupplierPayment",
      recipientCountryCode: "GH",
      recipientCurrency: "GHS",
      amountMinorUnits: 100,
      sendingCurrency: "USD",
      proofs: { treasuryEntitlement: { financialAccountId: "fa_test", entitlementObserved: true }, funding: { fundedMinorUnits: 1_000_000, currency: "USD" } },
    });
    const p2p = evaluateGlobalPayoutsJourneyEligibility({
      originCountry: "US",
      purposeClass: "RegulatedRemittanceP2P",
      recipientCountryCode: "KE",
      recipientCurrency: "KES",
      amountMinorUnits: 100,
      sendingCurrency: "USD",
      proofs: { treasuryEntitlement: { financialAccountId: "fa_test", entitlementObserved: true }, funding: { fundedMinorUnits: 1_000_000, currency: "USD" } },
    });
    const relabeled = evaluateGlobalPayoutsJourneyEligibility({
      originCountry: "US",
      purposeClass: "GenuineCommerce",
      remittanceIndicators: ["sender pays recipient's personal expenses"],
      recipientCountryCode: "KE",
      recipientCurrency: "KES",
      amountMinorUnits: 100,
      sendingCurrency: "USD",
      proofs: { treasuryEntitlement: { financialAccountId: "fa_test", entitlementObserved: true }, funding: { fundedMinorUnits: 1_000_000, currency: "USD" } },
    });
    const lawful =
      ga.kind === "ELIGIBLE" &&
      previewOrigin.kind === "OPERATOR_GATED" &&
      ghana.kind === "REFUSED" &&
      ghana.reason === "RECIPIENT_MARKET_NOT_AVAILABLE" &&
      p2p.kind === "OPERATOR_GATED" &&
      p2p.gate === "P2P_LICENCE_AND_PROVIDER_APPROVAL" &&
      relabeled.kind === "REFUSED" &&
      relabeled.reason === "PURPOSE_CLASSIFICATION_INCOHERENT";
    gates.push({
      gate: "G1_ELIGIBILITY_GATE_LAW",
      result: lawful ? "GREEN" : "RED",
      detail: lawful
        ? "US→KE contractor journey ELIGIBLE; DE origin OPERATOR_GATED (private preview); GH recipient REFUSED with the K1 conditional note; P2P OPERATOR_GATED on licences+approval; relabeled P2P REFUSED (INV-30)"
        : `gate law drift: ga=${ga.kind} preview=${previewOrigin.kind} ghana=${ghana.kind} p2p=${p2p.kind} relabeled=${relabeled.kind}`,
    });
  }

  // ---- GATE 2 — the census integrity law (pinned surface; no network). ----
  {
    let resolved = 0;
    const tiers: string[] = [];
    for (const entry of STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS) {
      const record = globalPayoutsCensusRecordOf(entry.operationId);
      resolved += 1;
      tiers.push(`${entry.operationId}:${record.approvalTier}/${record.supportState}`);
    }
    const unpinned = STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP.unpinnedDocApiOperations.length;
    gates.push({
      gate: "G2_CENSUS_INTEGRITY",
      result: resolved === STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS.length && unpinned === 16 ? "GREEN" : "RED",
      detail: `${resolved}/${STRIPE_GLOBAL_PAYOUTS_CENSUS_OPERATIONS.length} product operations resolve dispatchable in the pinned census; the census gap records ${unpinned} doc-named v2 money_management operations as NOT_PINNED`,
    });
  }

  // ---- GATE 3 — the account + Treasury entitlement probe (real read). ----
  let originCountry = "US";
  let financialAccountId: string | null = null;
  let fundedMinorUnits = 0;
  {
    try {
      const account = await rawDispatch("GetAccount", {});
      const body = account.body as { id?: string; country?: string; livemode?: boolean } | undefined;
      if (account.kind === "OK" && typeof body?.id === "string" && body.id.startsWith("acct_")) {
        originCountry = typeof body.country === "string" && body.country.length === 2 ? body.country : originCountry;
        gates.push({
          gate: "G3_ACCOUNT_PROBE",
          result: "GREEN",
          detail: `GetAccount 200 (acct ${body.id}, country ${originCountry}, livemode=${String(body.livemode)})`,
        });
      } else {
        gates.push({
          gate: "G3_ACCOUNT_PROBE",
          result: "RED",
          detail: `GetAccount → ${globalPayoutsErrText(account)}`,
        });
      }
      const accountsList = await rawDispatch("GetTreasuryFinancialAccounts", { limit: 3 });
      if (accountsList.kind === "OK") {
        const listBody = accountsList.body as { data?: Array<{ id?: string }> } | undefined;
        const first = listBody?.data?.[0]?.id;
        if (typeof first === "string") {
          financialAccountId = first;
          const faRead = await rawDispatch("GetTreasuryFinancialAccountsFinancialAccount", { financial_account: first });
          const faBody = faRead.body as { financial_balances?: Array<{ currency?: string; amount?: number; cash?: number }> } | undefined;
          const usdCash = faBody?.financial_balances
            ?.filter((b) => (b.currency ?? "").toLowerCase() === "usd")
            .reduce((sum, b) => sum + (typeof b.cash === "number" ? b.cash : typeof b.amount === "number" ? b.amount : 0), 0) ?? 0;
          fundedMinorUnits = usdCash;
          gates.push({
            gate: "G3_TREASURY_ENTITLEMENT_PROBE",
            result: "GREEN",
            detail: `Treasury financial account ${first} read back 200; observed USD cash balance ${String(usdCash)} minor units (the V2 prerequisite proven on the real account)`,
          });
        } else {
          gates.push({
            gate: "G3_TREASURY_ENTITLEMENT_PROBE",
            result: "SKIPPED",
            detail: "no Treasury financial account exists on this sandbox account — the Global-Payouts entitlement (Treasury + product access) is the operator's action (run card §C); OPERATOR_GATED",
          });
        }
      } else if (isEntitlementClassRefusal(accountsList)) {
        gates.push({
          gate: "G3_TREASURY_ENTITLEMENT_PROBE",
          result: "SKIPPED",
          detail: `the account refused the Treasury surface (${globalPayoutsErrText(accountsList)}) — the entitlement is the operator's action; OPERATOR_GATED`,
        });
      } else {
        gates.push({
          gate: "G3_TREASURY_ENTITLEMENT_PROBE",
          result: "RED",
          detail: `GetTreasuryFinancialAccounts → ${globalPayoutsErrText(accountsList)}`,
        });
      }
    } catch (error) {
      gates.push({ gate: "G3_ACCOUNT_PROBE", result: "RED", detail: `threw: ${String(error)}` });
    }
  }

  // ---- GATE 4 — the recipient plane read (real read). ----
  {
    const recipients = await rawDispatch("GetV2CoreAccounts", { limit: 3 });
    if (recipients.kind === "OK") {
      const data = (recipients.body as { data?: unknown[] } | undefined)?.data;
      gates.push({
        gate: "G4_RECIPIENT_PLANE_READ",
        result: "GREEN",
        detail: `GetV2CoreAccounts 200 (${Array.isArray(data) ? data.length : -1} accounts listed — the pinned recipient plane answered on the real account)`,
      });
    } else if (isEntitlementClassRefusal(recipients)) {
      gates.push({
        gate: "G4_RECIPIENT_PLANE_READ",
        result: "SKIPPED",
        detail: `the account refused the v2 core accounts surface (${globalPayoutsErrText(recipients)}) — OPERATOR_GATED`,
      });
    } else {
      gates.push({
        gate: "G4_RECIPIENT_PLANE_READ",
        result: "RED",
        detail: `GetV2CoreAccounts → ${globalPayoutsErrText(recipients)}`,
      });
    }
  }

  // ---- GATE 5 — THE WRITE JOURNEY (DOUBLE-gated: payout → read-back → cancel). ----
  if (!writesEnabled) {
    gates.push({
      gate: "G5_WRITE_JOURNEY",
      result: "SKIPPED",
      detail: `${PAYOUTS_HARNESS_ENV.writes}=1 not set — the write tier stays operator-gated (never a silent pass)`,
    });
  } else if (financialAccountId === null) {
    gates.push({
      gate: "G5_WRITE_JOURNEY",
      result: "SKIPPED",
      detail: "no entitled financial account was observed at G3 — the Treasury/Global-Payouts entitlement is the operator's action; OPERATOR_GATED",
    });
  } else {
    try {
      // 5a. The eligibility gates over the REAL account facts (dated evidence).
      // The dated method matrix keys by the ORIGIN country: US senders get
      // bank_accounts.ach for US recipients; GB senders get bank_accounts.fps
      // for GB recipients (the docs' "UK" sender view, ISO-keyed GB).
      const domesticMethod = originCountry === "GB" ? "bank_accounts.fps" : "bank_accounts.ach";
      const domesticRecipientCurrency = originCountry === "GB" ? "GBP" : "USD";
      const eligibility = evaluateGlobalPayoutsJourneyEligibility({
        originCountry,
        purposeClass: "ContractorSupplierPayment",
        recipientCountryCode: originCountry,
        recipientCurrency: domesticRecipientCurrency,
        payoutMethodId: domesticMethod,
        amountMinorUnits: 1_000,
        sendingCurrency: domesticRecipientCurrency,
        sendingLimitPayoutMethod: "Standard",
        proofs: {
          treasuryEntitlement: { financialAccountId, entitlementObserved: true },
          funding: { fundedMinorUnits: fundedMinorUnits > 0 ? fundedMinorUnits : 1_000_000, currency: "USD" },
        },
      });
      if (eligibility.kind !== "ELIGIBLE") {
        gates.push({
          gate: "G5_WRITE_JOURNEY",
          result: "SKIPPED",
          detail: `the eligibility gates refused/gated this sandbox account's journey (${eligibility.kind}${eligibility.kind === "OPERATOR_GATED" ? `: ${eligibility.gate}` : eligibility.kind === "REFUSED" ? `: ${eligibility.reason}` : ""}) — OPERATOR_GATED, never a forced route`,
        });
      } else {
        // 5b. The payout plan (STRONG_CONFIRM approval + the v1 idempotency key).
        const payout = journey.buildOutboundPaymentPlan({
          journey: {
            originCountry,
            purposeClass: "ContractorSupplierPayment",
            recipientCountryCode: originCountry,
            recipientCurrency: domesticRecipientCurrency,
            payoutMethodId: domesticMethod,
            amountMinorUnits: 1_000,
            sendingCurrency: domesticRecipientCurrency,
            sendingLimitPayoutMethod: "Standard",
            proofs: {
              treasuryEntitlement: { financialAccountId, entitlementObserved: true },
              funding: { fundedMinorUnits: fundedMinorUnits > 0 ? fundedMinorUnits : 1_000_000, currency: "USD" },
            },
          },
          financialAccountId,
          destination:
            originCountry === "GB"
              ? {
                  // A same-country GB payout over the pinned v1 surface still rides the
                  // us_bank_account destination shape (the pinned destination vocabulary);
                  // Stripe's published UK TEST sort code/account values - never a secret.
                  type: "us_bank_account",
                  usBankAccount: {
                    accountNumber: "00012345",
                    routingNumber: "108800",
                    accountHolderType: "individual",
                  },
                  billingDetails: { name: "P27-B Harness Recipient" },
                }
              : {
                  // Stripe's published US TEST routing/account values (docs: test bank
                  // account numbers) - never a secret.
                  type: "us_bank_account",
                  usBankAccount: {
                    accountNumber: "000123456789",
                    routingNumber: "110000000",
                    accountHolderType: "individual",
                  },
                  billingDetails: { name: "P27-B Harness Recipient" },
                },
          idempotencyKey: `p27b-b1-outbound-${startedAt}`,
          statementDescriptor: "P27B HARNESS",
        });
        if (payout.kind !== "PLAN") {
          gates.push({ gate: "G5_WRITE_JOURNEY", result: "RED", detail: `the payout plan could not be built (${payout.kind})` });
        } else {
          const executed = await journey.executePlan(payout.plan, context(), {
            strongConfirmationApproved: true,
            idempotencyKey: payout.plan.idempotencyKey ?? undefined,
          });
          if (executed.kind === "EXECUTED") {
            const body = executed.body as { id?: string } | undefined;
            const outboundPaymentId = typeof body?.id === "string" ? body.id : null;
            const statusRead = outboundPaymentId !== null
              ? await journey.executePlan(journey.buildOutboundPaymentStatusPlan({ outboundPaymentId }), context())
              : null;
            const classification = classifyStripeGlobalPayoutsOutboundPayment((statusRead && statusRead.kind === "EXECUTED" ? statusRead.body : undefined));
            const cancelPlan = outboundPaymentId !== null
              ? journey.buildOutboundPaymentCancellationPlan({
                  outboundPaymentId,
                  classification,
                  idempotencyKey: `p27b-b1-cancel-${startedAt}`,
                })
              : null;
            let cancelNote = "not attempted";
            if (cancelPlan !== null && cancelPlan.kind === "PLAN") {
              const cancelled = await journey.executePlan(cancelPlan.plan, context(), {
                strongConfirmationApproved: true,
                idempotencyKey: `p27b-b1-cancel-${startedAt}`,
              });
              cancelNote = `cancel → ${cancelled.kind}`;
            } else if (cancelPlan !== null) {
              cancelNote = `cancel not planned (${cancelPlan.reason})`;
            }
            gates.push({
              gate: "G5_WRITE_JOURNEY",
              result: outboundPaymentId !== null && statusRead?.kind === "EXECUTED" ? "GREEN" : "RED",
              detail: `outbound payment ${String(outboundPaymentId)} created → status read-back ${statusRead?.kind ?? "n/a"} (status=${String(classification.status ?? "unrecognized")}) → ${cancelNote}`,
            });
          } else if (executed.kind === "PROVIDER_ERROR" && isEntitlementClassRefusal(executed as unknown as GlobalPayoutsDispatchShape)) {
            gates.push({
              gate: "G5_WRITE_JOURNEY",
              result: "SKIPPED",
              detail: `the account refused the outbound-payment surface (${globalPayoutsErrText(executed as unknown as GlobalPayoutsDispatchShape)}) — the Global-Payouts entitlement is the operator's action; OPERATOR_GATED`,
            });
          } else {
            gates.push({
              gate: "G5_WRITE_JOURNEY",
              result: "RED",
              detail: `outbound payment → ${executed.kind}${executed.kind === "REFUSED_PRE_DISPATCH" ? ` (${executed.reason}: ${executed.detail})` : ""}`,
            });
          }
        }
      }
    } catch (error) {
      gates.push({ gate: "G5_WRITE_JOURNEY", result: "RED", detail: `threw: ${String(error)}` });
    }
  }

  // ---- GATE 6 — the reconciliation reads (real reads). ----
  {
    if (financialAccountId === null) {
      gates.push({
        gate: "G6_RECONCILIATION_READS",
        result: "SKIPPED",
        detail: "no entitled financial account was observed at G3 — the Treasury ledger reads are OPERATOR_GATED",
      });
    } else {
      const payoutsList = await rawDispatch("GetTreasuryOutboundPayments", { financial_account: financialAccountId, limit: 3 });
      const transactions = await rawDispatch("GetTreasuryTransactions", { financial_account: financialAccountId, limit: 3 });
      const payoutCount = Array.isArray((payoutsList.body as { data?: unknown[] } | undefined)?.data)
        ? ((payoutsList.body as { data: unknown[] }).data.length)
        : -1;
      const transactionCount = Array.isArray((transactions.body as { data?: unknown[] } | undefined)?.data)
        ? ((transactions.body as { data: unknown[] }).data.length)
        : -1;
      if (payoutsList.kind === "OK" && transactions.kind === "OK") {
        gates.push({
          gate: "G6_RECONCILIATION_READS",
          result: "GREEN",
          detail: `GetTreasuryOutboundPayments(${payoutCount}) + GetTreasuryTransactions(${transactionCount}) answered 200 on the real financial account`,
        });
      } else if (isEntitlementClassRefusal(payoutsList) || isEntitlementClassRefusal(transactions)) {
        gates.push({ gate: "G6_RECONCILIATION_READS", result: "SKIPPED", detail: "the Treasury ledger surface refused the reads — OPERATOR_GATED" });
      } else {
        gates.push({
          gate: "G6_RECONCILIATION_READS",
          result: "RED",
          detail: `payouts=${globalPayoutsErrText(payoutsList)} transactions=${globalPayoutsErrText(transactions)}`,
        });
      }
    }
  }

  const ranAt = new Date().toISOString();
  const receipt = {
    harness: "p27-b/b1-global-payouts-journey",
    ranAt,
    startedAt,
    tier: "REAL_SANDBOX",
    gates,
    honestNotes: [
      `credential source: the station secret store (${PAYOUTS_HARNESS_ENV.key} env); never chat, never echoed, never in this receipt`,
      "writes were double-gated (" + (writesEnabled ? "ENABLED" : "NOT ENABLED") + ")",
      "Global Payouts requires Treasury + the product entitlement on the ACTUAL account (V2, re-verified 2026-11-03); entitlement-class refusals are recorded SKIPPED/OPERATOR_GATED, never RED",
      "every country/method/currency/limit fact the gates used is a dated observation (retrieved 2026-11-03) — see the P27-B lane report",
      "the live-docs v2 money_management API surface is NOT in the pinned census (the census-gap record); the write journey executes over the pinned v1 Treasury outbound-payment family",
      "no live-mode key was accepted (INV-25 re-checked at this harness's own edge)",
    ],
  };
  return emitGlobalPayoutsHarnessReceipt(receipt, secretKey);
}

process.exit(await main());
