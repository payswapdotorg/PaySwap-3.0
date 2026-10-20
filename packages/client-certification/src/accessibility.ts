/**
 * @payswap/client-certification — the accessibility contract (P8-W2,
 * hard law 7).
 *
 * NET-NEW law on the canonical architecture (the WCAG 2.x AA contract
 * constants + the name/role/value lineage discipline from the program's
 * experience laws): interactive elements on a certified surface carry
 *
 * - an accessible NAME with lineage (where the name derives — content,
 *   label, aria-label), a ROLE and (where applicable) a VALUE;
 * - announced state changes (state-changing elements must announce);
 * - a KEYBOARD path for every POINTER path;
 * - declared contrast ratios that meet the CONTRACT CONSTANTS below
 *   (contract-level, not per-surface preferences).
 *
 * Deterministic only: a pure fold over the declared element registry.
 */

import { CLIENT_GATE_HALT_ACTION, CLIENT_GATE_SEVERITY } from "./verdict.ts";
import type { ClientGateResult, CertificationViolation } from "./verdict.ts";
import { violationOf } from "./verdict.ts";
import { contentDigest } from "./digest.ts";

/** The law this gate enforces (hard law 7). */
const LAW = "accessibility-contract" as const;

/**
 * The contrast contract constants (WCAG 2.x AA): the minimum contrast
 * ratio per text class. CONTRACT-LEVEL — a surface may exceed them,
 * never fall below.
 */
export const CONTRAST_CONTRACT = Object.freeze({
  normalTextMinimum: 4.5,
  largeTextMinimum: 3,
  nonTextUIMinimum: 3,
} as const);

/** The text classes the contrast constants govern. */
export const TEXT_CLASSES = Object.freeze([
  "normal",
  "large",
  "non-text",
] as const);

export type TextClass = (typeof TEXT_CLASSES)[number];

/** The required minimum contrast for a text class (the constant lookup). */
export function requiredContrastFor(textClass: TextClass): number {
  switch (textClass) {
    case "normal":
      return CONTRAST_CONTRACT.normalTextMinimum;
    case "large":
      return CONTRAST_CONTRACT.largeTextMinimum;
    case "non-text":
      return CONTRAST_CONTRACT.nonTextUIMinimum;
  }
}

/** One interactive element's declared accessibility contract. */
export interface AccessibleElementContract {
  readonly elementId: string;
  /** The ARIA/UI role (non-empty). */
  readonly role: string;
  /** The accessible name (non-empty). */
  readonly name: string;
  /** The accessible value, where the element has one. */
  readonly value?: string;
  /** Where the name derives (content / label / aria-label lineage). */
  readonly nameLineage: readonly string[];
  /** The pointer interaction steps (the mouse/touch path). */
  readonly pointerPath: readonly string[];
  /** The keyboard interaction steps — REQUIRED whenever a pointer path exists. */
  readonly keyboardPath: readonly string[];
  /** Whether the element's state changes as a result of interaction. */
  readonly stateChanging: boolean;
  /** Whether state changes are announced (aria-live or equivalent). */
  readonly announcesStateChanges: boolean;
  /** The declared foreground/background contrast ratio of the element's label. */
  readonly declaredContrastRatio: number;
  /** The text class the contrast constant is applied at. */
  readonly textClass: TextClass;
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

/**
 * The accessibility gate (hard law 7). Any violation is a HALT for the
 * release.
 */
export function runAccessibilityGate(
  elements: readonly AccessibleElementContract[],
): ClientGateResult {
  const violations: CertificationViolation[] = [];
  for (const element of elements) {
    const id = element.elementId;
    if (!nonEmpty(id)) {
      violations.push(
        violationOf(LAW, "malformed_element", "an element declaration requires an elementId"),
      );
      continue;
    }
    if (!nonEmpty(element.name)) {
      violations.push(
        violationOf(
          LAW,
          "missing_accessible_name",
          `element '${id}' has no accessible name — every interactive element is named`,
        ),
      );
    }
    if (!nonEmpty(element.role)) {
      violations.push(
        violationOf(
          LAW,
          "missing_role",
          `element '${id}' has no role — name/role/value lineage starts with the role`,
        ),
      );
    }
    if (element.nameLineage.length === 0) {
      violations.push(
        violationOf(
          LAW,
          "missing_name_lineage",
          `element '${id}' names itself without lineage — the name's derivation is part of the contract`,
        ),
      );
    }
    if (element.pointerPath.length > 0 && element.keyboardPath.length === 0) {
      violations.push(
        violationOf(
          LAW,
          "keyboard_path_missing",
          `element '${id}' has a pointer path but no keyboard path — every pointer path needs a keyboard equivalent`,
        ),
      );
    }
    if (element.stateChanging && !element.announcesStateChanges) {
      violations.push(
        violationOf(
          LAW,
          "state_change_not_announced",
          `element '${id}' changes state without announcing — state changes are announced`,
        ),
      );
    }
    const minimum = requiredContrastFor(element.textClass);
    if (element.declaredContrastRatio < minimum) {
      violations.push(
        violationOf(
          LAW,
          "contrast_below_contract",
          `element '${id}' declares contrast ${element.declaredContrastRatio} for text class '${element.textClass}' — the contract constant is ${minimum}`,
        ),
      );
    }
  }
  return Object.freeze({
    law: LAW,
    severity: CLIENT_GATE_SEVERITY,
    passed: violations.length === 0,
    violations: Object.freeze(violations),
    checked: elements.length,
    digest: contentDigest({
      law: LAW,
      haltAction: CLIENT_GATE_HALT_ACTION,
      violations,
    }),
  });
}
