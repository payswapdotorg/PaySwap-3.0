/**
 * Model selection surface tests (P3-W3): the strict selection law and the
 * canonical picker form.
 */

import { describe, expect, it } from "vitest";

import {
  MODEL_PROVIDER_SEPARATOR,
  MODEL_REASONING_SEPARATOR,
  formatModelSelection,
  isModelSelection,
  modelSelection,
  parseModelSelection,
} from "../src/index.ts";

describe("model selection surface", () => {
  it("pins the separators", () => {
    expect(MODEL_REASONING_SEPARATOR).toBe("$");
    expect(MODEL_PROVIDER_SEPARATOR).toBe("/");
  });

  it("constructs and freezes a valid selection (trim normalization included)", () => {
    const selection = modelSelection({
      providerId: " zai ",
      modelId: " glm-4.7 ",
      options: { reasoningLevel: " high " },
    });
    expect(Object.isFrozen(selection)).toBe(true);
    expect(selection.providerId).toBe("zai");
    expect(selection.modelId).toBe("glm-4.7");
    expect(selection.options?.reasoningLevel).toBe("high");
  });

  it("rejects empty ids and any options key beyond reasoningLevel (strict)", () => {
    expect(() => modelSelection({ providerId: "", modelId: "m" })).toThrowError(
      /providerId/,
    );
    expect(() => modelSelection({ providerId: "p", modelId: "" })).toThrowError(
      /modelId/,
    );
    expect(() =>
      modelSelection({ providerId: "p", modelId: "m", options: { temperature: "0.2" } as never }),
    ).toThrowError(/options/);
    expect(() =>
      modelSelection({ providerId: "p", modelId: "m", options: { reasoningLevel: "" } }),
    ).toThrowError(/reasoningLevel/);
  });

  it("guards recognize valid and invalid selections", () => {
    expect(isModelSelection({ providerId: "p", modelId: "m" })).toBe(true);
    expect(isModelSelection({ providerId: "p", modelId: "m", options: {} })).toBe(true);
    expect(isModelSelection({ providerId: "", modelId: "m" })).toBe(false);
    expect(isModelSelection({ providerId: "p" })).toBe(false);
    expect(
      isModelSelection({ providerId: "p", modelId: "m", options: { other: 1 } }),
    ).toBe(false);
    expect(isModelSelection(null)).toBe(false);
  });

  it("formats the canonical picker value with and without a reasoning level", () => {
    expect(
      formatModelSelection({ providerId: "zai", modelId: "glm-4.7" }),
    ).toBe("zai/glm-4.7");
    expect(
      formatModelSelection({
        providerId: "zai",
        modelId: "glm-4.7",
        options: { reasoningLevel: "high" },
      }),
    ).toBe("zai/glm-4.7$high");
  });

  it("parses the picker form back into a validated selection (round-trip)", () => {
    const parsed = parseModelSelection("zai/glm-4.7$high");
    expect(parsed.providerId).toBe("zai");
    expect(parsed.modelId).toBe("glm-4.7");
    expect(parsed.options?.reasoningLevel).toBe("high");
    const plain = parseModelSelection("zai/glm-4.7");
    expect(plain.options).toBeUndefined();
    expect(formatModelSelection(plain)).toBe("zai/glm-4.7");
    expect(formatModelSelection(parsed)).toBe("zai/glm-4.7$high");
  });

  it("parse rejects missing providers and keeps boundary separators in the model id (substrate rule)", () => {
    expect(() => parseModelSelection("justamodel")).toThrowError(/provider/);
    expect(() => parseModelSelection("/model")).toThrowError(/provider/);
    // Substrate boundary rule: a '$' at position 0 or at the very end of
    // the model part does NOT split a reasoning level — it stays part of
    // the model id (parseModelPickerValue law, pinned verbatim).
    const trailing = parseModelSelection("provider/model$");
    expect(trailing.modelId).toBe("model$");
    expect(trailing.options).toBeUndefined();
    const leading = parseModelSelection("provider/$level");
    expect(leading.modelId).toBe("$level");
    expect(leading.options).toBeUndefined();
  });

  it("parse trims surrounding whitespace before splitting", () => {
    const parsed = parseModelSelection("  zai/glm-4.7  ");
    expect(parsed.providerId).toBe("zai");
    expect(parsed.modelId).toBe("glm-4.7");
  });
});
