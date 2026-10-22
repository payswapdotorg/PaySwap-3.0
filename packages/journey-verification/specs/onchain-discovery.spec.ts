/**
 * @payswap/journey-verification — P12 journey J17: ONCHAIN DISCOVERY
 * (JOURNEY-MAP.md §1, P12 Lane C).
 *
 * The onchain rail is a first-class settlement-rail family on the
 * CONNECTIONS area: wallet/account connection is a connected-instance
 * concern, so the rail's honest home is rail setup. The surface states
 * exactly what exists and what does not in this deployment:
 *
 *   - the capability checklist: UNAVAILABLE rows with typed reasons
 *     (wallet connection, live network context, transaction preview,
 *     scoped signing), REFERENCE rows for the declared contracts (fee
 *     provenance, simulation & security checks, the state vocabulary),
 *     and NO_OBSERVATIONS rows (balances, history & evidence);
 *   - the declared chain catalogue (chain identity IS the environment);
 *   - the synthetic venue packs, rendered AS synthetic model
 *     deployments — never live venues;
 *   - the observation vocabulary cross-anchored on ACCOUNTS: balances
 *     are observations, and zero are observed.
 *
 * Zero fabricated wallets, balances, quotes, transactions, venues or
 * connected claims — every row honest.
 *
 * ENTIRELY TIER 2 (@contract — gates at TL integration): the onchain
 * rail surface (foldOnchainRail + the ConnectionsAreaSurface rail
 * block + the AccountsAreaSurface observation anchor) is Lane P12-C
 * work.
 */

import { test, expect } from "@playwright/test";
import { CONTRACT_ROUTES } from "../journeys.manifest.js";
import {
  expectZeroConsoleDefects,
  trackConsole,
  visibleText,
} from "../support/helpers.js";
import { evidenceShot } from "../support/evidence.js";

test("[J17][@contract] the onchain rail checklist: UNAVAILABLE rows carry typed reasons, REFERENCE rows carry the declared laws — never fabricated state", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);
  await expect(page.getByRole("heading", { name: "The onchain rail", level: 2 })).toBeVisible();

  const text = await visibleText(page);

  // The UNAVAILABLE rows — typed reasons, verbatim fragments (the full
  // strings are foldOnchainRail's ONCHAIN_UNAVAILABLE_REASONS; these
  // fragments pin the honest vocabulary, not the mood).
  expect(text).toContain("Wallet / account connection");
  expect(text).toContain("No wallet connection surface exists in this deployment");
  expect(text).toContain("Network context");
  expect(text).toContain("no transport is wired in this deployment");
  expect(text).toContain("Transaction preview");
  expect(text).toContain("no execution plane exists in this deployment");
  expect(text).toContain("Scoped signing authorization");
  expect(text).toContain("no signer adapter is wired at a trusted surface");

  // The REFERENCE rows — declared contracts rendered as reference.
  expect(text).toContain("Fee provenance");
  expect(text).toContain("Simulation & security checks");
  expect(text).toContain("State vocabulary");
  expect(text).toContain("OUTCOME_UNKNOWN");
  expect(text).toContain("UNKNOWN never becomes FAILED or success");

  // The NO_OBSERVATIONS rows — zero observed, none shown.
  expect(text).toContain("Externally-observed balances");
  expect(text).toContain("No externally-observed balances exist");
  expect(text).toContain("History & evidence");
  expect(text).toContain("No onchain history or evidence records exist");

  await expectZeroConsoleDefects(record);
  await evidenceShot(page, "p12-j17-onchain-rail");
});

test("[J17][@contract] the declared chain catalogue renders and the venue packs are labeled synthetic — never live venues", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appConnections);

  await expect(page.getByRole("heading", { name: "The declared chain catalogue", level: 3 })).toBeVisible();
  const text = await visibleText(page);
  // Chain identity IS the environment (the fail-closed law).
  expect(text).toContain("Chain identity IS the environment");
  // The honest extent of network context today.
  expect(text).toContain("no RPC/indexer transport is wired in this deployment");

  // The synthetic venue packs — declared AS synthetic model deployments.
  await expect(page.getByRole("heading", { name: "Venue packs — synthetic model deployments", level: 3 })).toBeVisible();
  expect(text).toContain("synthetic");

  await expectZeroConsoleDefects(record);
});

test("[J17][@contract] accounts anchors the observation vocabulary: balances are observations and zero are observed", async ({
  page,
}) => {
  const record = trackConsole(page);
  await page.goto(CONTRACT_ROUTES.appAccounts);
  await expect(page.getByRole("heading", { name: "Asset observations", exact: true, level: 3 })).toBeVisible();

  const text = await visibleText(page);
  // The observation law: a balance is an observation, never custody.
  expect(text).toContain("observation");
  // Zero observed — the honest empty, never an invented balance.
  expect(text).toContain("No asset observations");

  await expectZeroConsoleDefects(record);
});
