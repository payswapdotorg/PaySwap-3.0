/**
 * @payswap/app — the SETTINGS workspace section (console surface).
 *
 * §6: the PaySwap identity; the upstream attribution (legal,
 * PRODUCT-IDENTITY §4 — preserved as attribution, never the brand); the
 * store durability fact for THIS mount (label per durability — the
 * browser profile is honestly labeled "stored in this browser profile
 * only"); and the advanced developer-workspace entry (clearly labeled,
 * secondary — an anchored reference to /console/advanced, the upstream
 * platform's developer interface the mounts route to).
 */

import { Card, KeyValue } from "@zcode/ui/payswap";
import type { ConsoleSectionRecord, WorkspaceStoreDurability } from "../contracts.js";
import {
  ADVANCED_DEVELOPER_ENTRY,
  CONSOLE_UPSTREAM_ATTRIBUTION,
  PAYSWAP_IDENTITY,
  storeDurabilityLabel,
} from "../section-vocabulary.js";
import { SectionScaffold } from "./shared.js";

export function SettingsSection({
  section,
  durability,
}: {
  readonly section: ConsoleSectionRecord;
  readonly durability: WorkspaceStoreDurability;
}) {
  const storeLabel = storeDurabilityLabel(durability);
  return (
    <SectionScaffold section={section}>
      <section aria-labelledby="ps-console-settings-identity" className="ps-console-block">
        <h2 id="ps-console-settings-identity" className="ps-console-block-title">
          Identity
        </h2>
        <Card className="ps-console-card">
          <p className="ps-console-identity-name">{PAYSWAP_IDENTITY.name}</p>
          <p className="ps-console-line">{PAYSWAP_IDENTITY.line}</p>
        </Card>
      </section>

      <section aria-labelledby="ps-console-settings-store" className="ps-console-block">
        <h2 id="ps-console-settings-store" className="ps-console-block-title">
          Mission store
        </h2>
        <Card className="ps-console-card">
          <KeyValue
            entries={[
              { key: "Durability", value: storeLabel.label },
              { key: "Fact", value: storeLabel.fact },
            ]}
          />
        </Card>
      </section>

      <section aria-labelledby="ps-console-settings-attribution" className="ps-console-block">
        <h2 id="ps-console-settings-attribution" className="ps-console-block-title">
          Upstream platform
        </h2>
        <Card className="ps-console-card">
          <p className="ps-console-line">{CONSOLE_UPSTREAM_ATTRIBUTION}</p>
        </Card>
      </section>

      <section aria-labelledby="ps-console-settings-advanced" className="ps-console-block">
        <h2 id="ps-console-settings-advanced" className="ps-console-block-title">
          Advanced
        </h2>
        <Card className="ps-console-card">
          <p className="ps-console-line">
            <a className="ps-console-action" href={ADVANCED_DEVELOPER_ENTRY.path}>
              {ADVANCED_DEVELOPER_ENTRY.label}
            </a>
          </p>
          <p className="ps-console-line">{ADVANCED_DEVELOPER_ENTRY.description}</p>
        </Card>
      </section>
    </SectionScaffold>
  );
}
