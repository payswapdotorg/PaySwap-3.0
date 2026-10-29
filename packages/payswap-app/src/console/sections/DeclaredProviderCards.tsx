/**
 * @payswap/app — the DECLARED PROVIDER CARDS (P22-B, ADR-0016 D8/D9):
 * the connect cards of the newly-declared providers (Paystack + the
 * Stellar testnet onchain rail) inside the Connections section's
 * provider catalogue — ONE card per provider, the DEFAULT form, the
 * typed prerequisite verbatim on each card, never a connected state.
 *
 * Extracted from ConnectionsSection.tsx (the ≤400-line file law).
 */

import { Button, Card, StatusPill } from "@zcode/ui/payswap";
import type { AgentProviderSetupEntry } from "../../lib/agent-provider-entries.js";

/** Render the declared-provider cards (the entries after the primary Stripe card). */
export function DeclaredProviderCards({
  declaredEntries,
  onSeedEntry,
}: {
  readonly declaredEntries: readonly AgentProviderSetupEntry[];
  readonly onSeedEntry: (entryIndex: number) => void;
}): React.ReactNode {
  return (
    <>
      {declaredEntries.map((entry, entryIndex) => (
        <Card key={`${entry.providerId}:${entry.useCaseRef}`} className="ps-console-card ps-connections-card">
          <div className="ps-connections-card-head">
            <span
              className={`ps-connections-mark ps-connections-mark--${
                entry.providerId === "paystack" ? "paystack" : "stellar"
              }`}
              aria-hidden="true"
            >
              {entry.providerId === "paystack" ? "P" : "✦"}
            </span>
            <div className="ps-connections-card-titles">
              <h3 className="ps-connections-card-title">{entry.label}</h3>
              <StatusPill tone="disabled">Not connected</StatusPill>
            </div>
          </div>
          <p className="ps-connections-card-line">{entry.cardLine}</p>
          <div className="ps-connections-card-actions">
            <Button type="button" variant="secondary" onClick={() => onSeedEntry(entryIndex)}>
              {entry.providerId === "paystack" ? "Connect Paystack" : "Connect Stellar testnet"}
            </Button>
          </div>
        </Card>
      ))}
    </>
  );
}

/**
 * The P13 concept's other provider surfaces — DECLARED UX surfaces only.
 * These entries name the concept's provider-card slots with its honest
 * catalogue lines. Their "Explore setup" action opens the embedded
 * agent panel with a provider mention in the draft — the deterministic
 * router answers honestly (it never guesses an undeclared provider).
 * (P22-B: Paystack and the Stellar testnet rail are NOW declared — their
 * real connect cards render from the mention entries, not from here.)
 */
const DECLARED_SURFACE_PROVIDERS: readonly {
  readonly id: string;
  readonly label: string;
  readonly mark: string;
  readonly markKind: "paypal" | "adyen" | "blockchain";
  readonly line: string;
  readonly exploreDraft: string;
}[] = [
  {
    id: "paypal",
    label: "PayPal",
    mark: "P",
    markKind: "paypal",
    line: "Shown as catalogue entry until verified.",
    exploreDraft: "connect PayPal",
  },
  {
    id: "adyen",
    label: "Adyen",
    mark: "A",
    markKind: "adyen",
    line: "Provider-specific prerequisites shown.",
    exploreDraft: "connect Adyen",
  },
  {
    id: "blockchain",
    label: "Blockchain wallet",
    mark: "⬡",
    markKind: "blockchain",
    line: "Separate wallet and signing permissions.",
    exploreDraft: "connect a blockchain wallet",
  },
];

/** Render the concept's declared-UX-surface explore cards. */
export function DeclaredSurfaceProviderCards({
  onExplore,
}: {
  readonly onExplore: (draft: string) => void;
}): React.ReactNode {
  return (
    <>
            {DECLARED_SURFACE_PROVIDERS.map((provider) => (
              <Card key={provider.id} className="ps-console-card ps-connections-card">
                <div className="ps-connections-card-head">
                  <span
                    className={`ps-connections-mark ps-connections-mark--${provider.markKind}`}
                    aria-hidden="true"
                  >
                    {provider.mark}
                  </span>
                  <div className="ps-connections-card-titles">
                    <h3 className="ps-connections-card-title">{provider.label}</h3>
                    <StatusPill tone="disabled">Not connected</StatusPill>
                  </div>
                </div>
                <p className="ps-connections-card-line">{provider.line}</p>
                <div className="ps-connections-card-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onExplore(provider.exploreDraft)}
                  >
                    Explore setup
                  </Button>
                </div>
              </Card>
            ))}
    </>
  );
}
