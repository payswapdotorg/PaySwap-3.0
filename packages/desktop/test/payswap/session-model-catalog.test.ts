/**
 * PaySwap Desktop (P21-D Gap C, ADR-0014 D4) — the SESSION-MODEL-CATALOG
 * battery: the host-side read that maps the substrate session settings'
 * REAL model availability (ZCodeSessionSettingsState.model.available — fed
 * by the agent protocol) 1:1 onto the channel DTO the renderer's
 * model-catalog composition consumes.
 *
 * THE LAWS (failing-first):
 * - THE 1:1 MAPPING LAW: a scripted settings state maps onto the EXACT
 *   DTO list (providerId from ref.providerId, modelId from ref.modelId,
 *   the label, the description, the reasoning levels, the default level);
 *   an empty available list stays EMPTY (never an invented model); the
 *   default level rides ONLY when it is among the model's own levels
 *   (the zcodeSessionProjection.ts guard parity).
 * - THE MEMBER LAW: the channel member maps onto the injected settings
 *   read (an absent substrate report resolves the honest EMPTY list —
 *   nothing is masked); the ABSENT seam throws the typed not-configured
 *   error (fail-closed, never a silent empty pretending the seam exists).
 * - THE WIRE LAW: the DTO carries model METADATA ONLY — no credentials,
 *   no secret material (the substrate model option's fields are metadata
 *   by construction; the mapping never widens them).
 */

import { describe, expect, it } from "vitest";

import type { ZCodeSessionSettingsState } from "@zcode/shared";

import {
  sessionModelCatalogFromSettings,
  type SessionModelCatalogEntryDto,
} from "../../src/host/payswap/shell/session-model-catalog.js";
import {
  createAbsentSessionModelCatalogChannelMembers,
  createSessionModelCatalogChannelMembers,
} from "../../src/host/payswap/shell/session-model-members.js";

/** A schema-valid format-properties block (the substrate's own shape). */
function formatProperties() {
  return {
    requiresMfjsToolSchema: false,
    contextWindow: 200_000,
    inputFormat: {
      supportsText: true,
      supportsImage: true,
      supportsVideo: false,
      supportsAudio: false,
      supportsPdf: false,
    },
    outputFormat: { supportsText: true },
    supportsToolCall: true,
    supportsJsonSchemaOutput: true,
    supportsNativeWebSearch: false,
    supportsMidConversationSystem: true,
  };
}

/** A scripted settings state with TWO models (one full, one minimal). */
function scriptedSettings(): ZCodeSessionSettingsState {
  return {
    model: {
      available: [
        {
          ref: { providerId: "zai", modelId: "glm-5.2" },
          label: "GLM-5.2",
          providerLabel: "Z.ai",
          description: "The flagship coding model.",
          contextWindow: 200_000,
          maxOutputTokens: 32_768,
          reasoning: {
            levels: [
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ],
            defaultLevel: "medium",
          },
          properties: formatProperties(),
        },
        {
          // The minimal model: no reasoning vocabulary, no description.
          ref: { providerId: "zai", modelId: "glm-5.2-air" },
          label: "GLM-5.2 Air",
          properties: formatProperties(),
        },
      ],
    },
    thoughtLevel: {
      enabled: true,
      current: "medium",
      defaultLevel: "medium",
      available: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
    mode: { current: "build" },
  };
}

/** A settings state whose ONLY model carries a foreign default level. */
function foreignDefaultSettings(): ZCodeSessionSettingsState {
  const settings = scriptedSettings();
  settings.model.available[0]!.reasoning = {
    levels: [
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
    defaultLevel: "turbo",
  };
  return settings;
}

describe("the session-model-catalog mapping law (the pure derivation)", () => {
  it("a scripted settings state maps onto the EXACT DTO list (1:1, field by field)", () => {
    const entries = sessionModelCatalogFromSettings(scriptedSettings());
    const expected: readonly SessionModelCatalogEntryDto[] = [
      {
        providerId: "zai",
        modelId: "glm-5.2",
        label: "GLM-5.2",
        description: "The flagship coding model.",
        reasoningLevels: ["low", "medium", "high"],
        defaultReasoningLevel: "medium",
      },
      {
        providerId: "zai",
        modelId: "glm-5.2-air",
        label: "GLM-5.2 Air",
        reasoningLevels: [],
      },
    ];
    expect(entries).toEqual(expected);
  });

  it("an empty available list stays EMPTY — never an invented model", () => {
    const settings = scriptedSettings();
    settings.model.available = [];
    expect(sessionModelCatalogFromSettings(settings)).toEqual([]);
  });

  it("a default level OUTSIDE the model's own levels is omitted (the projection guard parity)", () => {
    const entries = sessionModelCatalogFromSettings(foreignDefaultSettings());
    expect(entries[0]!.defaultReasoningLevel).toBeUndefined();
    expect(entries[0]!.reasoningLevels).toEqual(["low", "high"]);
  });

  it("the mapping is deterministic (two derivations are reference-distinct, value-equal)", () => {
    const first = sessionModelCatalogFromSettings(scriptedSettings());
    const second = sessionModelCatalogFromSettings(scriptedSettings());
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("the DTO carries model metadata ONLY (no secret-bearing field exists on the wire shape)", () => {
    for (const entry of sessionModelCatalogFromSettings(scriptedSettings())) {
      expect(Object.keys(entry).sort()).toEqual(
        expect.arrayContaining(["providerId", "modelId", "label", "reasoningLevels"]),
      );
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain("key");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("credential");
    }
  });
});

describe("the session-model-catalog channel member (the shell seam)", () => {
  it("the member maps onto the injected settings read 1:1 and logs the honest count", async () => {
    const logs: string[] = [];
    const members = createSessionModelCatalogChannelMembers({
      readSettings: async () => scriptedSettings(),
      log: (level, message) => {
        if (level === "info") logs.push(message);
      },
    });
    const entries = await members.sessionModelCatalog();
    expect(entries).toEqual(sessionModelCatalogFromSettings(scriptedSettings()));
    expect(logs.join("\n")).toContain("2");
    expect(logs.join("\n")).toContain("session model catalog");
  });

  it("an absent substrate report (undefined) resolves the honest EMPTY list — nothing masked", async () => {
    const members = createSessionModelCatalogChannelMembers({
      readSettings: async () => undefined,
      log: () => {},
    });
    expect(await members.sessionModelCatalog()).toEqual([]);
  });

  it("a rejected settings read RETHROWS (fail-closed — never a masked empty list)", async () => {
    const members = createSessionModelCatalogChannelMembers({
      readSettings: async () => {
        throw new Error("substrate read failed");
      },
      log: () => {},
    });
    await expect(members.sessionModelCatalog()).rejects.toThrow("substrate read failed");
  });

  it("the ABSENT seam throws the typed not-configured error (never a silent empty)", async () => {
    const members = createAbsentSessionModelCatalogChannelMembers();
    await expect(members.sessionModelCatalog()).rejects.toThrow(
      /session-model catalog seam is not configured/,
    );
  });
});
