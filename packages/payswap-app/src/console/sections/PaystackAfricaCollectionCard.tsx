/**
 * @payswap/app — THE PAYSTACK AFRICA COLLECTION + ONBOARDING CARD (P27-C,
 * ADR-0020 D4/D10/D11): the Paystack Africa journeys' own surface inside
 * the connections activation panel — the collection-journey declaration
 * (the honest capability state), the recipient/payout K3/K4 gate note, and
 * the Africa Extended Network onboarding links (the V6-verified
 * paystack.com/stripe/* URLs as external anchors).
 *
 * Extracted to its own file per the ≤400-line file law (the
 * StellarRailActivationCard precedent). ZERO FINANCIAL AUTHORITY: the
 * card is a DECLARATION — its one action seeds the SAME Paystack
 * own-store test-mode connection journey the primary Paystack card seeds
 * (the same sealed test key; the collection/recipient grants derive at
 * dispatch inside the seal, never a connection-scope growth). The
 * onboarding links open the provider's own pages (external anchors) —
 * opening one never connects an account.
 */

import { Button, Card, StatusPill } from "@zcode/ui/payswap";
import {
  PAYSTACK_AFRICA_ONBOARDING_LINKS,
  PAYSTACK_AFRICA_ONBOARDING_NOTE,
  PAYSTACK_AFRICA_K34_GATE_NOTE,
  PAYSTACK_COLLECTION_JOURNEY_DECLARATION,
  PAYSTACK_RECIPIENT_JOURNEY_DECLARATION,
} from "../../lib/paystack-africa-pins.js";

/** The card's title (the journey's people-language name). */
export const PAYSTACK_AFRICA_CARD_TITLE =
  "Paystack — Africa local rails (test mode)" as const;

/** The card's honest catalogue line (the journey in one sentence). */
export const PAYSTACK_AFRICA_CARD_LINE =
  "Local collection through Paystack's hosted payment pages, plus the typed recipient and bank/mobile-money payout lanes for your own business account — per market, and only where the live-doc evidence confirms support." as const;

/**
 * The Paystack Africa journeys card. `onSeedConnection` seeds the same
 * own-store test-mode connection journey (the panel's Paystack seed);
 * the onboarding links are external anchors with their dated evidence.
 */
export function PaystackAfricaCollectionCard({
  onSeedConnection,
}: {
  readonly onSeedConnection: () => void;
}): React.ReactElement {
  return (
    <Card
      className="ps-console-card ps-connections-card ps-connections-activation-card"
      data-testid="ps-connections-activation-paystack-africa"
    >
      <div className="ps-connections-card-head">
        <span className="ps-connections-mark ps-connections-mark--paystack" aria-hidden="true">
          P
        </span>
        <div className="ps-connections-card-titles">
          <h3 className="ps-connections-card-title">{PAYSTACK_AFRICA_CARD_TITLE}</h3>
          <StatusPill tone="disabled">Not connected</StatusPill>
        </div>
      </div>
      <p className="ps-connections-card-line">{PAYSTACK_AFRICA_CARD_LINE}</p>
      <div className="ps-connections-activation-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={onSeedConnection}
          data-testid="ps-connections-seed-paystack-africa"
        >
          Connect Paystack — own-store (test mode)
        </Button>
      </div>
      <p className="ps-connections-activation-note">
        {PAYSTACK_COLLECTION_JOURNEY_DECLARATION.capabilityState}
      </p>
      <p className="ps-connections-activation-note">
        {PAYSTACK_COLLECTION_JOURNEY_DECLARATION.purposeLaw}
      </p>
      <p className="ps-connections-activation-note" data-testid="ps-connections-paystack-africa-k34-note">
        {PAYSTACK_RECIPIENT_JOURNEY_DECLARATION.capabilityState} {PAYSTACK_AFRICA_K34_GATE_NOTE}
      </p>
      <div className="ps-connections-activation-probe" data-testid="ps-connections-paystack-africa-onboarding">
        <p className="ps-connections-activation-probe-head">
          Africa Extended Network onboarding (verified {PAYSTACK_AFRICA_ONBOARDING_LINKS[0]?.evidence.retrievedAt} —
          {" "}stripe.com/global)
        </p>
        {PAYSTACK_AFRICA_ONBOARDING_LINKS.map((link) => (
          <p key={link.market} className="ps-connections-activation-probe-result">
            <a
              href={link.onboardingUrl}
              target="_blank"
              rel="noreferrer noopener"
              data-testid={`ps-connections-paystack-africa-link-${link.market}`}
            >
              {link.label} — onboarding
            </a>
          </p>
        ))}
        <p className="ps-connections-activation-note">{PAYSTACK_AFRICA_ONBOARDING_NOTE}</p>
      </div>
    </Card>
  );
}
