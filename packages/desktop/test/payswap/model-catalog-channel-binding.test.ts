/**
 * PaySwap Desktop (P21-D Gap C, ADR-0014 D4) — the MODEL-CATALOG CHANNEL
 * binding battery (failing-first): the renderer's model-catalog
 * composition driven through the REAL channel member path — the host
 * service composed with the substrate settings read (the REAL
 * sessionModelCatalog member), consumed through the channel-client
 * reader, bound at the composition root, and listed through the app's
 * shared ModelCatalogPort.
 *
 * THE LAWS:
 * - THE MEMBER PATH: a scripted substrate settings state flows
 *   host-member → channel reader → composition → the app catalog port as
 *   the EXACT CatalogModel list (providerId/modelId/displayName/
 *   reasoningLevels — the DTO's label maps onto the app's displayName);
 * - THE ABSENT-MEMBER LAW: a channel client that does not expose the
 *   member yields NO source (null) — main.tsx then keeps the honest
 *   unbound-catalog posture (composeModelCatalogBinding({}) throws, the
 *   composer renders the unbound note; an older host never crashes);
 * - THE FAIL-CLOSED LAW: a rejected member read surfaces through the
 *   catalog port's rejection (the app's honest ERROR phase) — never a
 *   masked empty list, never a coerced default.
 */

import { describe, expect, it } from "vitest";

import {
  resetSharedModelCatalog,
  sharedModelCatalog,
  type CatalogModel,
} from "@payswap/app";
import type { ZCodeSessionSettingsState } from "@zcode/shared";

import { createPaySwapDesktopService } from "../../src/host/payswap/shell/service.js";
import {
  channelSessionModelCatalogSource,
  composeModelCatalogBinding,
} from "../../src/renderer/src/modelCatalogComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";

/** A scripted settings state (one full model + one minimal model). */
function scriptedSettings(): ZCodeSessionSettingsState {
  const formatProperties = {
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
  return {
    model: {
      available: [
        {
          ref: { providerId: "zai", modelId: "glm-5.2" },
          label: "GLM-5.2",
          description: "The flagship coding model.",
          reasoning: {
            levels: [
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ],
            defaultLevel: "medium",
          },
          properties: formatProperties,
        },
        {
          ref: { providerId: "zai", modelId: "glm-5.2-air" },
          label: "GLM-5.2 Air",
          properties: formatProperties,
        },
      ],
    },
    thoughtLevel: {
      enabled: true,
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

/** The REAL host service composed with the injected substrate settings read. */
function serviceWithSettings(
  readSettings: () => Promise<ZCodeSessionSettingsState | undefined>,
) {
  return createPaySwapDesktopService(
    { scope: { kind: "local" }, log: () => {} },
    { sessionModelCatalog: { readSettings } },
  );
}

/** The channel services over a scripted payswap-desktop client. */
function channelServices(client: object): DesktopConsoleChannelServices {
  // The one honest widening cast (the desktop-console-client.test.ts
  // precedent): the scripted client is a PARTIAL double (or the REAL
  // host service exercising the REAL member); the FULL member surface
  // is pinned structurally by the drift laws elsewhere.
  return {
    payswapDesktopService: client as unknown as DesktopConsoleChannelServices["payswapDesktopService"],
  };
}

describe("the model-catalog channel binding (the REAL member path)", () => {
  it("a scripted channel client lists the EXACT CatalogModel models through the composition", async () => {
    const service = serviceWithSettings(async () => scriptedSettings());
    const source = channelSessionModelCatalogSource(channelServices(service));
    expect(source).not.toBeNull();
    const composition = composeModelCatalogBinding({ source: source! });
    const expected: readonly CatalogModel[] = [
      {
        providerId: "zai",
        modelId: "glm-5.2",
        displayName: "GLM-5.2",
        reasoningLevels: ["low", "medium", "high"],
      },
      {
        providerId: "zai",
        modelId: "glm-5.2-air",
        displayName: "GLM-5.2 Air",
        reasoningLevels: [],
      },
    ];
    expect(await composition.catalog.listModels()).toEqual(expected);
    expect(sharedModelCatalog()).toBe(composition.catalog);
    composition.reset();
    resetSharedModelCatalog();
  });

  it("the substrate's honest EMPTY availability crosses as the empty catalog (never invented models)", async () => {
    const service = serviceWithSettings(async () => {
      const settings = scriptedSettings();
      settings.model.available = [];
      return settings;
    });
    const source = channelSessionModelCatalogSource(channelServices(service));
    const composition = composeModelCatalogBinding({ source: source! });
    expect(await composition.catalog.listModels()).toEqual([]);
    composition.reset();
    resetSharedModelCatalog();
  });

  it("an ABSENT member on the channel client yields NO source (the honest unbound posture stands)", () => {
    // An older host: the channel proxy carries no sessionModelCatalog member.
    const source = channelSessionModelCatalogSource(channelServices({}));
    expect(source).toBeNull();
    // main.tsx's exact posture for the absent member: the composition is
    // called with NO source and fails closed — the composer renders the
    // honest unbound-catalog note (the app's own law, unchanged).
    expect(() => composeModelCatalogBinding({})).toThrow(
      "the model-catalog composition requires the substrate's model-availability source",
    );
    expect(sharedModelCatalog()).toBeUndefined();
  });

  it("a rejected member read surfaces through the catalog port (fail-closed, never a masked empty)", async () => {
    const service = serviceWithSettings(async () => {
      throw new Error("the substrate settings read failed");
    });
    const source = channelSessionModelCatalogSource(channelServices(service));
    const composition = composeModelCatalogBinding({ source: source! });
    await expect(composition.catalog.listModels()).rejects.toThrow(
      "the substrate settings read failed",
    );
    composition.reset();
    resetSharedModelCatalog();
  });
});
