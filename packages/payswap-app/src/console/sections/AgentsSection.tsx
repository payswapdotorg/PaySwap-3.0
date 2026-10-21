/**
 * @payswap/app — the AGENTS workspace section (console surface).
 *
 * §6: the honest empty (no agent registry exists in this deployment —
 * typed reason, no invented agents) + the agent-contract vocabulary
 * (body/capabilities/constraints/model binding/runtime status/
 * assignments) as clearly-labeled REFERENCE + the model-binding row
 * projecting the optional REAL substrate model providers from the mount
 * (absent = the honest "none configured").
 */

import type { ConsoleSectionRecord, ModelProviderStatus } from "../contracts.js";
import {
  AGENTS_EMPTY_STATE,
  AGENT_CONTRACT_VOCABULARY,
  REFERENCE_SECTION_ANCHORS,
} from "../section-vocabulary.js";
import {
  ConsoleEmptyStateView,
  ModelProvidersCard,
  ReferenceCard,
  SectionScaffold,
} from "./shared.js";

export function AgentsSection({
  section,
  modelProviders,
}: {
  readonly section: ConsoleSectionRecord;
  readonly modelProviders?: readonly ModelProviderStatus[];
}) {
  return (
    <SectionScaffold section={section}>
      <ConsoleEmptyStateView
        spec={AGENTS_EMPTY_STATE}
        title="No agents — the honest state"
      />
      <ModelProvidersCard modelProviders={modelProviders} id="agents-model-providers" />
      <ReferenceCard
        id={REFERENCE_SECTION_ANCHORS.agents}
        title="The agent-contract vocabulary"
        note="Reference only — the vocabulary an agent registry would record. Nothing here is a registered agent, and no agent identity, runtime status or assignment is invented."
        terms={AGENT_CONTRACT_VOCABULARY}
      />
    </SectionScaffold>
  );
}
