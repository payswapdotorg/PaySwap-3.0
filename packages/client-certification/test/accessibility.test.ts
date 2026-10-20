import { describe, expect, it } from "vitest";
import {
  CONTRAST_CONTRACT,
  requiredContrastFor,
  runAccessibilityGate,
} from "../src/index.ts";
import type { AccessibleElementContract } from "../src/index.ts";

/**
 * Hard law 7 — the accessibility contract: interactive elements carry
 * name/role/value lineage, state changes are announced, keyboard paths
 * exist for every pointer path, contrast targets are contract-level
 * constants.
 */
function accessibleElementFixture(): AccessibleElementContract {
  return {
    elementId: "payments.submit.button",
    role: "button",
    name: "Send payment",
    nameLineage: ["label:payments.submit.label"],
    pointerPath: ["click"],
    keyboardPath: ["Tab", "Enter"],
    stateChanging: true,
    announcesStateChanges: true,
    declaredContrastRatio: 4.5,
    textClass: "normal",
  };
}

describe("hard law 7: the accessibility contract", () => {
  it("the contrast contract constants are pinned (WCAG AA: 4.5 / 3 / 3)", () => {
    expect(CONTRAST_CONTRACT.normalTextMinimum).toBe(4.5);
    expect(CONTRAST_CONTRACT.largeTextMinimum).toBe(3);
    expect(CONTRAST_CONTRACT.nonTextUIMinimum).toBe(3);
    expect(requiredContrastFor("normal")).toBe(4.5);
    expect(requiredContrastFor("large")).toBe(3);
    expect(requiredContrastFor("non-text")).toBe(3);
  });

  it("a fully contracted element passes; determinism holds", () => {
    const result = runAccessibilityGate([accessibleElementFixture()]);
    expect(result.passed).toBe(true);
    expect(result.law).toBe("accessibility-contract");
    expect(result.checked).toBe(1);
    expect(result.digest).toBe(
      runAccessibilityGate([accessibleElementFixture()]).digest,
    );
  });

  it("an element without accessible name, role or name lineage fails", () => {
    const noName = runAccessibilityGate([
      { ...accessibleElementFixture(), name: "" },
    ]);
    expect(
      noName.violations.some((v) => v.code === "missing_accessible_name"),
    ).toBe(true);

    const noRole = runAccessibilityGate([
      { ...accessibleElementFixture(), role: "" },
    ]);
    expect(noRole.violations.some((v) => v.code === "missing_role")).toBe(true);

    const noLineage = runAccessibilityGate([
      { ...accessibleElementFixture(), nameLineage: [] },
    ]);
    expect(
      noLineage.violations.some((v) => v.code === "missing_name_lineage"),
    ).toBe(true);
  });

  it("a pointer path without a keyboard path fails (every pointer path needs its keyboard equivalent)", () => {
    const result = runAccessibilityGate([
      { ...accessibleElementFixture(), keyboardPath: [] },
    ]);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.code === "keyboard_path_missing"),
    ).toBe(true);
  });

  it("a state-changing element that does not announce fails", () => {
    const result = runAccessibilityGate([
      { ...accessibleElementFixture(), announcesStateChanges: false },
    ]);
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.code === "state_change_not_announced"),
    ).toBe(true);
  });

  it("contrast below the contract constant fails — and the constant is per text class", () => {
    const below = runAccessibilityGate([
      { ...accessibleElementFixture(), declaredContrastRatio: 4.4 },
    ]);
    expect(
      below.violations.some((v) => v.code === "contrast_below_contract"),
    ).toBe(true);

    // Large text at 4.4 EXCEEDS its 3.0 constant — passes.
    const large = runAccessibilityGate([
      { ...accessibleElementFixture(), textClass: "large", declaredContrastRatio: 4.4 },
    ]);
    expect(large.passed).toBe(true);

    const nonText = runAccessibilityGate([
      { ...accessibleElementFixture(), textClass: "non-text", declaredContrastRatio: 2.9 },
    ]);
    expect(
      nonText.violations.some((v) => v.code === "contrast_below_contract"),
    ).toBe(true);
  });
});
