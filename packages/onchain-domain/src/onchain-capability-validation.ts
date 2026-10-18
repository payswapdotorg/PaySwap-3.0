/**
 * @payswap/onchain-domain — deterministic onchain capability flavor
 * validation + discrimination (P4-W1, lane R2-W1; PORT/ADAPT of
 * payswap.org@8a735bf
 * packages/onchain-domain/src/onchain-capabilities.ts, split for the
 * file-size law).
 *
 * `validateOnchainCapabilityDefinition` validates the pinned catalogue
 * base (the EXECUTABLE arm — every onchain capability flavor carries
 * consequential-write capabilities) then dispatches on the declared
 * `capabilityKind`; every flavor has exactly one validator and an unknown
 * discriminant fails closed. The flavor types live in
 * ./onchain-capabilities.ts.
 */

import { ValidationError } from "./errors.ts";
import { isNonEmptyString } from "./shared.ts";
import { validatePinnedDefinitionBase } from "./pins-validation.ts";
import { isChainFamily, isValidChainKey } from "./family.ts";
import { isOnchainOperationKind, ONCHAIN_OPERATION_KINDS } from "./operations.ts";
import {
  validateWalletCapabilityDeclaration,
  validateSignerCapabilityDeclaration,
  validateSmartAccountCapabilityDeclaration,
} from "./wallet.ts";
import { ONCHAIN_CAPABILITY_KINDS } from "./onchain-capabilities.ts";
import type { OnchainCapability, OnchainCapabilityKind } from "./onchain-capabilities.ts";

// ---------------------------------------------------------------------------
// Deterministic flavor validation (dispatch — implementation)
// ---------------------------------------------------------------------------

/** Guard: a declared onchain capability flavor discriminant. */
export function isOnchainCapabilityKind(value: unknown): value is OnchainCapabilityKind {
  return (
    typeof value === "string" &&
    (ONCHAIN_CAPABILITY_KINDS as readonly unknown[]).includes(value)
  );
}

function validateChainKeyList(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field} must be a non-empty array of canonical chain keys`);
    return;
  }
  for (const item of value) {
    if (!isValidChainKey(item)) {
      errors.push(`${field} contains '${String(item)}' which is not a canonical chain key`);
    }
  }
}

function validateOperationKindList(
  value: unknown,
  field: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field} must be a non-empty array of onchain operation kinds`);
    return;
  }
  for (const item of value) {
    if (!isOnchainOperationKind(item)) {
      errors.push(
        `${field} contains '${String(item)}' which is not one of [${ONCHAIN_OPERATION_KINDS.join(", ")}]`,
      );
    }
  }
}

/**
 * Deterministic flavor validation + discrimination: validates the pinned
 * catalogue base (the EXECUTABLE arm — every onchain capability flavor
 * carries consequential-write capabilities), then dispatches on the
 * declared `capabilityKind` and validates exactly that flavor's
 * declaration. An unknown discriminant fails closed; a missing declaration
 * fails closed.
 */
export function validateOnchainCapabilityDefinition(
  candidate: unknown,
): OnchainCapability {
  const base = validatePinnedDefinitionBase(candidate);
  if (base.executable !== true) {
    throw new ValidationError(
      "an onchain capability flavor is an executable capability declaration and must declare executable true",
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const declaration = record.onchain;
  if (declaration === null || typeof declaration !== "object") {
    throw new ValidationError(
      "an onchain capability must declare its 'onchain' flavor declaration (discriminated by capabilityKind)",
    );
  }
  const kind = (declaration as Readonly<Record<string, unknown>>).capabilityKind;
  if (!isOnchainCapabilityKind(kind)) {
    throw new ValidationError(
      `onchain.capabilityKind '${String(kind)}' is not one of [${ONCHAIN_CAPABILITY_KINDS.join(", ")}] — flavor discrimination fails closed`,
    );
  }

  const errors: string[] = [];
  switch (kind) {
    case "wallet":
      validateWalletCapabilityDeclaration(declaration);
      break;
    case "signer":
      validateSignerCapabilityDeclaration(declaration);
      break;
    case "smart_account":
      validateSmartAccountCapabilityDeclaration(declaration);
      break;
    case "onchain_execution": {
      const decl = declaration as Readonly<Record<string, unknown>>;
      validateOperationKindList(decl.supportedOperations, "supportedOperations", errors);
      const families = decl.supportedFamilies;
      if (!Array.isArray(families) || families.length === 0) {
        errors.push("supportedFamilies must be a non-empty array of chain families");
      } else {
        for (const family of families) {
          if (!isChainFamily(family)) {
            errors.push(`supportedFamilies contains an unknown chain family '${String(family)}'`);
          }
        }
      }
      if (typeof decl.supportsSimulation !== "boolean") {
        errors.push("supportsSimulation must be a boolean");
      }
      if (decl.preBroadcastRecheckRequired !== true) {
        errors.push(
          "preBroadcastRecheckRequired must be true: consequential onchain writes require simulation (where supported) plus a pre-broadcast re-check (INV-18)",
        );
      }
      break;
    }
    case "contract_interaction": {
      const decl = declaration as Readonly<Record<string, unknown>>;
      if (decl.controlledEscapeHatch !== true) {
        errors.push(
          "controlledEscapeHatch must be true: the generic contract interaction is always declared as the controlled escape hatch it is (INV-20)",
        );
      }
      if (decl.certificationRequired !== true) {
        errors.push(
          "certificationRequired must be true: only certified method declarations may execute (INV-20)",
        );
      }
      const methods = decl.certifiedMethodIds;
      if (!Array.isArray(methods) || methods.length === 0) {
        errors.push(
          "certifiedMethodIds must be a non-empty allowlist of certified method ids — an empty allowlist executes nothing",
        );
      } else {
        for (const method of methods) {
          if (!isNonEmptyString(method)) {
            errors.push("certifiedMethodIds entries must be non-empty strings");
          }
        }
      }
      if (decl.unknownWritePolicy !== "BLOCK" && decl.unknownWritePolicy !== "REQUIRE_ESCALATION") {
        errors.push(
          "unknownWritePolicy must be BLOCK or REQUIRE_ESCALATION: unknown generic contract writes never execute silently (INV-20 — there is no allow-silent policy)",
        );
      }
      break;
    }
    case "dex": {
      const decl = declaration as Readonly<Record<string, unknown>>;
      const swapKinds = decl.supportedSwapKinds;
      if (!Array.isArray(swapKinds) || swapKinds.length === 0) {
        errors.push("supportedSwapKinds must be a non-empty array (EXACT_INPUT and/or EXACT_OUTPUT)");
      } else {
        for (const swapKind of swapKinds) {
          if (swapKind !== "EXACT_INPUT" && swapKind !== "EXACT_OUTPUT") {
            errors.push("supportedSwapKinds entries must be EXACT_INPUT or EXACT_OUTPUT");
          }
        }
      }
      validateChainKeyList(decl.supportedChains, "supportedChains", errors);
      if (decl.quoteSemantics !== "INDICATIVE" && decl.quoteSemantics !== "EXECUTABLE") {
        errors.push("quoteSemantics must be INDICATIVE or EXECUTABLE");
      }
      if (
        decl.slippageProtection !== "DECLARED_LIMIT" &&
        decl.slippageProtection !== "PROVIDER_DEFINED"
      ) {
        errors.push("slippageProtection must be DECLARED_LIMIT or PROVIDER_DEFINED");
      }
      break;
    }
    case "bridge": {
      const decl = declaration as Readonly<Record<string, unknown>>;
      validateChainKeyList(decl.sourceChains, "sourceChains", errors);
      validateChainKeyList(decl.destinationChains, "destinationChains", errors);
      if (typeof decl.custodialTransit !== "boolean") {
        errors.push("custodialTransit must be a boolean (a declared custody property, never assumed)");
      }
      if (
        decl.destinationFinality !== "ATTESTED" &&
        decl.destinationFinality !== "OBSERVED" &&
        decl.destinationFinality !== "PROVIDER_DEFINED"
      ) {
        errors.push("destinationFinality must be ATTESTED, OBSERVED or PROVIDER_DEFINED");
      }
      break;
    }
    case "intent": {
      const decl = declaration as Readonly<Record<string, unknown>>;
      validateChainKeyList(decl.supportedDomains, "supportedDomains", errors);
      if (
        decl.settlementModel !== "FULFILLER_SETTLED" &&
        decl.settlementModel !== "ESCROWED" &&
        decl.settlementModel !== "PROVIDER_DEFINED"
      ) {
        errors.push("settlementModel must be FULFILLER_SETTLED, ESCROWED or PROVIDER_DEFINED");
      }
      if (
        decl.solverCompetition !== "OPEN" &&
        decl.solverCompetition !== "SINGLE_SOLVER" &&
        decl.solverCompetition !== "PROVIDER_DEFINED"
      ) {
        errors.push("solverCompetition must be OPEN, SINGLE_SOLVER or PROVIDER_DEFINED");
      }
      break;
    }
  }
  if (errors.length > 0) {
    throw new ValidationError(
      `Invalid onchain capability declaration (${kind}): ${errors.join("; ")}`,
      { errors: [...errors] },
    );
  }
  return Object.freeze({ ...base, onchain: declaration }) as OnchainCapability;
}
