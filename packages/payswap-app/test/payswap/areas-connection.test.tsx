/**
 * @payswap/app — the CONNECTIONS + ACCOUNTS area surface tests (P12 Lane
 * C, C3 + C4).
 *
 * The honest-gate laws of the two new first-class surfaces, machine-
 * checked on the REAL shell (static render):
 *
 * - /app/connections: the PSP setup flow (catalogue is never a
 *   connection; connect states its typed prerequisite; health honest
 *   empty; sandbox/live structural; lifecycle vocabulary) + the onchain
 *   rail (UNAVAILABLE rows with typed reasons; the chain catalogue with
 *   structural environments; the state vocabulary; synthetic venue
 *   packs labeled AS synthetic). ZERO fabricated providers, wallets,
 *   balances, quotes or connected claims.
 * - /app/accounts: balances are observations — none observed; the
 *   generic anchored actions (Move/Convert) stay.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaySwapApp } from "../../src/shell/PaySwapApp.js";
import { createStaticNavigation } from "../../src/shell/navigation.js";
import { HONEST_DEPLOYMENT_CONTEXT, NO_EVIDENCE_COVERAGE } from "../../src/contracts/harness.js";
import { foldOnchainRail } from "../../src/lib/onchain-rail.js";
import { foldConnectionsSetup } from "../../src/lib/connections-catalogue.js";
import { UNIVERSAL_AREAS_MIRROR } from "../../src/lib/areas.js";

const INPUT = {
  deployment: HONEST_DEPLOYMENT_CONTEXT,
  coverage: NO_EVIDENCE_COVERAGE,
  apiRuntime: { configured: false, baseUrl: null, envVar: "VITE_PAYSWAP_API_URL" },
} as const;

function shell(path: string): string {
  return renderToStaticMarkup(
    <PaySwapApp input={INPUT} navigation={createStaticNavigation(path)} console={{ href: "/console" }} />,
  );
}

function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const connections = text(shell("/app/connections"));
const accounts = text(shell("/app/accounts"));

describe("C4 — the PSP connection setup flow on /app/connections", () => {
  it("keeps the pinned designed-empty contract (J8) and the honest zero", () => {
    const area = UNIVERSAL_AREAS_MIRROR.find((entry) => entry.id === "connections");
    expect(connections).toContain("empty by design");
    expect(connections).toContain(area!.emptyState.reason);
    expect(connections).toContain("PSP connection setup — 0 connected");
    // The catalogue is never a connection.
    expect(connections).toContain("A catalogue entry is never a connection");
  });

  it("renders all eight setup steps with their honest states", () => {
    const setup = foldConnectionsSetup();
    for (const step of setup.steps) {
      expect(connections, step.id).toContain(step.title);
      expect(connections, step.id).toContain(step.line);
    }
    // The connect step's typed prerequisite renders verbatim.
    expect(connections).toContain(
      "Connect requires the provider connection plane — session authority plus the provider registry",
    );
    expect(connections).toContain("refuses to fabricate a connect flow");
    // Health honest-empty.
    expect(connections).toContain("No connection health to observe");
    // Sandbox/live structural distinction.
    expect(connections).toContain("Sandbox and live are structurally distinct execution modes");
    expect(connections).toContain("never proof of live behavior");
    // Lifecycle vocabulary renders (reconnect/disable/disconnect).
    expect(connections).toContain("nothing to reconnect, disable or disconnect");
    expect(connections).toContain("EXPIRED");
    expect(connections).toContain("DISCONNECTED");
  });

  it("renders the connection forms catalogue + the scopes vocabulary (reference)", () => {
    for (const form of foldConnectionsSetup().forms) {
      expect(connections, form.form).toContain(form.form);
      expect(connections, form.form).toContain(form.summary);
    }
    expect(connections).toContain("READ_PROVIDER_STATE");
    expect(connections).toContain("CREATE_EXTERNAL_EFFECT");
    expect(connections).toContain("OBSERVATION_ONLY");
    // Corridor honesty.
    expect(connections).toContain("no corridor is claimed");
  });

  it("fabricates nothing: zero connected-provider claims anywhere on the surface", () => {
    expect(connections).not.toMatch(/connected provider[s]?\s+(are|is)\s+(listed|shown)/i);
    expect(connections).not.toMatch(/\d+\s+provider[s]?\s+connected/i);
    expect(connections).not.toContain("Connected to");
  });
});

describe("C3 — the onchain rail on /app/connections", () => {
  it("renders the capability checklist with every UNAVAILABLE row carrying its typed reason", () => {
    const rail = foldOnchainRail();
    for (const capability of rail.capabilities) {
      expect(connections, capability.id).toContain(capability.label);
      expect(connections, capability.id).toContain(capability.line);
    }
    // The wallet-connection honest boundary.
    expect(connections).toContain("No wallet connection surface exists in this deployment");
    expect(connections).toContain("no wallet, account or signer is connected, and none is invented");
    // Live network context honesty.
    expect(connections).toContain("Live network context is UNAVAILABLE");
    // Balances honesty.
    expect(connections).toContain("zero asset observations are recorded");
  });

  it("renders the declared chain catalogue with structural environments (identity IS the environment)", () => {
    for (const chain of foldOnchainRail().chains) {
      expect(connections, chain.chainKey).toContain(chain.chainKey);
    }
    expect(connections).toContain("ethereum:mainnet");
    expect(connections).toContain("bitcoin:regtest");
    // The production/testnet distinction is visible.
    expect(connections).toContain("PRODUCTION");
    expect(connections).toContain("TESTNET");
    expect(connections).toContain("REGTEST");
    expect(connections).toContain("a testnet chain can never carry a production token");
  });

  it("renders the full state vocabulary — UNKNOWN never collapses", () => {
    expect(connections).toContain("BROADCAST");
    expect(connections).toContain("CONFIRMED");
    expect(connections).toContain("FAILED");
    expect(connections).toContain("OUTCOME_UNKNOWN");
    expect(connections).toContain("UNKNOWN never becomes FAILED or success");
    expect(connections).toContain("reorg");
    expect(connections).toContain("confirmation depth");
  });

  it("renders the venue packs AS synthetic model deployments — never live venues", () => {
    expect(connections).toContain("Venue packs — synthetic model deployments");
    expect(connections).toContain("SYNTHETIC model deployment");
    expect(connections).toContain("no claim about any specific real venue");
    expect(connections).toContain("no swap, bridge or cross-chain execution exists in this deployment");
    for (const venue of foldOnchainRail().venues) {
      expect(connections, venue.protocolKey).toContain(venue.protocolKey);
    }
    // The venue pills carry the Synthetic label; no venue claims a live
    // connection or an executable quote.
    expect(connections).not.toContain("Connected venue");
    expect(connections).not.toContain("Executable quote");
  });

  it("is reachable from the primary area navigation + cross-anchored from accounts", () => {
    const html = shell("/app");
    expect(html).toContain('href="/app/connections"');
    expect(accounts).toContain("onchain rail");
  });
});

describe("C3 — the accounts area renders balances as observations", () => {
  it("keeps the generic anchored actions (Move + Convert stay on accounts)", () => {
    expect(accounts).toContain("The outcome actions that live here");
    expect(accounts).toContain("Move");
    expect(accounts).toContain("Convert");
    expect(accounts).toContain("Quote projection requires fresh capability observations");
  });

  it("renders the observations block: none observed, nothing invented", () => {
    expect(accounts).toContain("Balances as observations — none observed");
    expect(accounts).toContain("never PaySwap custody");
    expect(accounts).toContain("Zero asset observations are recorded in this deployment");
    expect(accounts).toContain("none is invented");
    expect(accounts).toContain("observer identity, freshness");
    // No balance-shaped fabrication.
    expect(accounts).not.toMatch(/\$\s?\d/);
    expect(accounts).not.toMatch(/\d+\.\d{2}\s+(USD|EUR|BTC|ETH)/);
  });
});
