/**
 * @payswap/app — the CONNECTIONS workspace section (console surface).
 *
 * §6: the honest no-provider state — zero connected capabilities, the
 * real truth of this deployment (the recorded NO_EVIDENCE_COVERAGE
 * fact: no connected instances, no recorded provider evidence) — with
 * the setup-required state typed and routed (capability connection
 * happens in the PaySwap product, via the mount's back affordance);
 * the connection lifecycle vocabulary as clearly-labeled reference; and
 * the substrate model-provider connections when the mount supplies
 * them.
 */

import type { ConsoleSectionRecord, ModelProviderStatus } from "../contracts.js";
import { NO_EVIDENCE_COVERAGE } from "../../contracts/harness.js";
import {
  CONNECTIONS_EMPTY_STATE,
  CONNECTION_LIFECYCLE_VOCABULARY,
  REFERENCE_SECTION_ANCHORS,
} from "../section-vocabulary.js";
import type { PaySwapNavigation } from "../../shell/navigation.js";
import {
  ConsoleEmptyStateView,
  ModelProvidersCard,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

export function ConnectionsSection({
  section,
  navigation,
  backToProduct,
  modelProviders,
}: {
  readonly section: ConsoleSectionRecord;
  readonly navigation: PaySwapNavigation;
  readonly backToProduct: { readonly label: string; readonly onActivate: () => void };
  readonly modelProviders?: readonly ModelProviderStatus[];
}) {
  // The real coverage fact of this repository phase (the recorded
  // harness constant — never a live probe from the views).
  const connectedCount = NO_EVIDENCE_COVERAGE.connected.length;
  return (
    <SectionScaffold section={section}>
      <ConsoleEmptyStateView
        spec={CONNECTIONS_EMPTY_STATE}
        navigation={navigation}
        backToProduct={backToProduct}
        title={`Zero connected capabilities — the honest state (${connectedCount} connected)`}
      />
      <ModelProvidersCard
        modelProviders={modelProviders}
        id="connections-model-providers"
      />
      <ReferenceCard
        id={REFERENCE_SECTION_ANCHORS.connections}
        title="The connection lifecycle vocabulary"
        note="Reference only — the connected-instance model. A catalogue capability is never a connection; execution is scoped to actual account authorization."
        terms={CONNECTION_LIFECYCLE_VOCABULARY}
      />
    </SectionScaffold>
  );
}
