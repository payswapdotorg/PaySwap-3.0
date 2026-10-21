// @vitest-environment jsdom
/**
 * @zcode/web — the WEB-MOUNT suite (P9-A).
 *
 * What lives at this seam (and only here): the platform adapter that
 * reads the vite env for the honest API-runtime state, and the route-
 * contract mount — which browser pathname owns which surface (the
 * PaySwap product, the agent console, the conversation-share substrate
 * route and the OAuth callback). The product's own laws are tested in
 * @payswap/app (packages/payswap-app/test) — this file proves the WEB
 * package wires that product correctly.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  PaySwapWebApp,
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
} from "@payswap/app";
import { resolveApiRuntimeInput } from "../src/payswap/apiRuntime.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: resolveApiRuntimeInput(),
} as const;

afterEach(() => {
  cleanup();
});

describe("the web platform adapter", () => {
  it("resolves the honest unconfigured API runtime when no env base URL is set", () => {
    delete import.meta.env.VITE_PAYSWAP_API_URL;
    const view = resolveApiRuntimeInput();
    expect(view.configured).toBe(false);
    expect(view.baseUrl).toBeNull();
    expect(view.envVar).toBe("VITE_PAYSWAP_API_URL");
  });
});

describe("the workspace product package renders under the web mount", () => {
  it("@payswap/app's shell mounts with the honest deployment facts", () => {
    window.history.replaceState(null, "", "/payswap");
    const { container, unmount } = render(<PaySwapWebApp input={INPUT} />);
    try {
      expect(container.textContent).toContain("non-custodial economic operating system");
      expect(container.textContent).toContain("No provider evidence is recorded in this deployment");
    } finally {
      unmount();
    }
  });
});
