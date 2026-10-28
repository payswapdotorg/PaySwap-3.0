/**
 * PaySwap Desktop (P21-D reviewer-gate ③/④) — the HOST-REGISTRATION
 * CALL-SHAPE battery (failing-first).
 *
 * THE FINDING (the live CDP probe, 2026-10-28): the REAL app's host
 * registration called registerPaySwapDesktopService(services, {…}) with
 * ONE object mixing SEAM fields (scope/log/storeDirectory/
 * paymentsStoreDirectory) and OPTIONS fields (sessionModelCatalog,
 * connectionAuthority, connectionProbe) — but the composition's
 * signature is (services, SEAM, OPTIONS). The options fields rode the
 * seam object where createPaySwapDesktopService and
 * composePaymentMissionRuntime never read them: the conditional
 * spreads (`...(gated ? {...} : {})`) bypassed TypeScript's excess-
 * property check, so the compilers stayed green while the REAL app
 * silently degraded — the sessionModelCatalog member answered with the
 * ABSENT posture ("the seam is not configured in this host") and the
 * 151-a product connection plane (connectionAuthority +
 * connectionProbe) never reached the payment-mission runtime ("NO_
 * AUTHORITY_WIRED"), even though the plane itself composed and logged.
 *
 * THE LAW THIS BATTERY PINS (the call-shape discipline):
 *  1. the host registration passes EXACTLY THREE top-level arguments
 *     (services, seam, options);
 *  2. the SEAM argument carries the seam's own fields (scope/log/
 *     storeDirectory/paymentsStoreDirectory) and NEVER an options
 *     field;
 *  3. the OPTIONS argument carries the gated sessionModelCatalog read
 *     and the connection-plane fragment (connectionAuthority +
 *     connectionProbe) — the fields the service and the mission
 *     runtime actually read.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The host bootstrap whose registration call this battery pins. */
const HOST_INDEX_PATH = resolve(import.meta.dirname, "../../src/host/index.ts");

/** Extract the full registerPaySwapDesktopService(…) call text (paren-balanced). */
function extractRegistrationCall(source: string): string {
  const callee = "registerPaySwapDesktopService(";
  const callStart = source.indexOf(callee);
  expect(callStart, "registerPaySwapDesktopService is called in host/index.ts").toBeGreaterThan(-1);
  const openAt = callStart + callee.length - 1;
  let depth = 0;
  for (let index = openAt; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(callStart, index + 1);
      }
    }
  }
  throw new Error("registerPaySwapDesktopService call not terminated");
}

/** Split the call's argument list at top-level commas (paren/brace/bracket balanced). */
function splitTopLevelArguments(callText: string): string[] {
  const open = callText.indexOf("(");
  const close = callText.lastIndexOf(")");
  const body = callText.slice(open + 1, close);
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | undefined;
  for (const ch of body) {
    if (quote !== undefined) {
      current += ch;
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) args.push(current);
  return args;
}

/** The fields that belong to the SERVICE OPTIONS (never the seam). */
const OPTIONS_FIELDS = ["sessionModelCatalog", "connectionAuthority", "connectionProbe"] as const;

describe("the host registration call shape (seam vs options — the dropped-options finding)", () => {
  it("the registration passes EXACTLY THREE top-level arguments (services, seam, options)", () => {
    const source = readFileSync(HOST_INDEX_PATH, "utf8");
    const call = extractRegistrationCall(source);
    const args = splitTopLevelArguments(call);
    expect(
      args.length,
      "registerPaySwapDesktopService(services, SEAM, OPTIONS) — the options fields must ride the THIRD argument, never the seam",
    ).toBe(3);
  });

  it("the SEAM argument carries the seam's own fields and NEVER an options field", () => {
    const source = readFileSync(HOST_INDEX_PATH, "utf8");
    const call = extractRegistrationCall(source);
    const args = splitTopLevelArguments(call);
    expect(args.length).toBe(3);
    const seam = args[1] ?? "";
    expect(seam, "the seam argument is the options-object literal").toContain("scope:");
    expect(seam).toContain("log:");
    for (const field of OPTIONS_FIELDS) {
      expect(
        seam.includes(`${field}:`),
        `the seam must NOT carry the options field "${field}" — createPaySwapDesktopService reads it from the OPTIONS argument (the 2026-10-28 finding: fields riding the seam are silently dropped)`,
      ).toBe(false);
    }
  });

  it("the OPTIONS argument carries the gated sessionModelCatalog read AND the connection-plane fragment", () => {
    const source = readFileSync(HOST_INDEX_PATH, "utf8");
    const call = extractRegistrationCall(source);
    const args = splitTopLevelArguments(call);
    expect(args.length).toBe(3);
    const options = args[2] ?? "";
    expect(
      options.includes("sessionModelCatalog:"),
      "the options argument carries the gated sessionModelCatalog read (149-D — the model-catalog member)",
    ).toBe(true);
    expect(
      options.includes("connectionAuthority:"),
      "the options argument carries the connection plane's connectionAuthority (151-a — the lane-aware kernel path)",
    ).toBe(true);
    expect(
      options.includes("connectionProbe:"),
      "the options argument carries the connection plane's connectionProbe (the probe-evidence ledger + the REAL fetch)",
    ).toBe(true);
  });
});
