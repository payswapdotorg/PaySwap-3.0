/**
 * @payswap/app — the console SECTION SWITCH (shared rendering core).
 *
 * [P15 shell bridge] The one place that maps a resolved console route
 * to the eight workspace sections — shared by BOTH console consumers
 * so they can never drift:
 *
 * - PaySwapAgentWorkspace (the full product console: own chrome,
 *   sidebar, topbar, footer);
 * - PaySwapConsoleSections (the ZCode-shell bridge: the host shell
 *   provides the chrome, this switch provides the content).
 *
 * The switch owns the overview→missions intake prefill (component
 * state; the path space is unchanged — §2) and the mission-detail
 * open-from-overview flow. It renders sections ONLY — identity
 * (titles/landmarks) lives in each section's SectionScaffold.
 */

import { useCallback, useState } from "react";
import type {
  ConsoleSectionRecord,
  ModelProviderStatus,
} from "./contracts.js";
import {
  CONSOLE_ROOT,
  consoleSection,
  resolveConsoleSection,
} from "./contracts.js";
import type { PaySwapNavigation } from "../shell/navigation.js";
import type { WorkspaceStoreBinding } from "./useWorkspaceStore.js";
import { OverviewSection, type OverviewIntakePrefill } from "./sections/OverviewSection.js";
import { MissionsSection, type MissionsIntakeRequest } from "./sections/MissionsSection.js";
import { AgentsSection } from "./sections/AgentsSection.js";
import { ApprovalsSection } from "./sections/ApprovalsSection.js";
import { ConnectionsSection } from "./sections/ConnectionsSection.js";
import { ActivitySection } from "./sections/ActivitySection.js";
import { LabSection } from "./sections/LabSection.js";
import { SettingsSection } from "./sections/SettingsSection.js";

export interface ConsoleSectionSwitchProps {
  /** The resolved console route (the switch renders its section). */
  readonly route: ReturnType<typeof resolveConsoleSection>;
  /** The workspace store binding (the single mutation surface). */
  readonly workspace: WorkspaceStoreBinding;
  /** The console navigation adapter (cross-section links). */
  readonly navigation: PaySwapNavigation;
  /** The supporting-control back affordance (the host surface). */
  readonly backToProduct: {
    readonly label: string;
    readonly onActivate: () => void;
  };
  /** Optional real model-provider connection state; absent = honest none. */
  readonly modelProviders?: readonly ModelProviderStatus[];
}

/** The shared section renderer (see module header). */
export function ConsoleSectionSwitch({
  route,
  workspace,
  navigation,
  backToProduct,
  modelProviders,
}: ConsoleSectionSwitchProps): React.ReactNode {
  const openMissionFromOverview = useCallback(
    (id: string) => {
      workspace.openDetail(id);
      navigation.navigate(`${CONSOLE_ROOT}/missions`);
    },
    [navigation, workspace],
  );

  // The overview intake-entry request (P11): the prefill lives in
  // component state (the path space is unchanged — §2); the seq keys the
  // missions intake's remount so each request is consumed exactly once.
  const [intakeRequest, setIntakeRequest] = useState<MissionsIntakeRequest | null>(null);
  const startMissionFromOverview = useCallback(
    (prefill: OverviewIntakePrefill) => {
      setIntakeRequest((current) => ({
        seq: (current?.seq ?? 0) + 1,
        prefill,
      }));
      navigation.navigate(`${CONSOLE_ROOT}/missions`);
    },
    [navigation],
  );

  const sectionById = (id: string): ConsoleSectionRecord => {
    const record = consoleSection(id);
    if (record === undefined) {
      // Fail-closed: the route table never resolves an unknown section,
      // but a drifted IA mirror must never render a half-invented view.
      throw new Error(`ConsoleSectionSwitch: unknown console section ${JSON.stringify(id)}`);
    }
    return record;
  };

  return (
    <>
      {route.kind === "overview" ||
      (route.kind === "section" && route.sectionId === "overview") ? (
        <OverviewSection
          section={sectionById("overview")}
          workspace={workspace}
          navigation={navigation}
          onOpenMission={openMissionFromOverview}
          onStartMission={startMissionFromOverview}
        />
      ) : null}
      {route.kind === "section" && route.sectionId === "missions" ? (
        <MissionsSection
          section={sectionById("missions")}
          workspace={workspace}
          navigation={navigation}
          intakeRequest={intakeRequest ?? undefined}
        />
      ) : null}
      {route.kind === "section" && route.sectionId === "agents" ? (
        <AgentsSection section={sectionById("agents")} modelProviders={modelProviders} />
      ) : null}
      {route.kind === "section" && route.sectionId === "approvals" ? (
        <ApprovalsSection section={sectionById("approvals")} />
      ) : null}
      {route.kind === "section" && route.sectionId === "connections" ? (
        <ConnectionsSection
          section={sectionById("connections")}
          navigation={navigation}
          backToProduct={backToProduct}
          modelProviders={modelProviders}
        />
      ) : null}
      {route.kind === "section" && route.sectionId === "activity" ? (
        <ActivitySection
          section={sectionById("activity")}
          workspace={workspace}
          navigation={navigation}
        />
      ) : null}
      {route.kind === "section" && route.sectionId === "lab" ? (
        <LabSection section={sectionById("lab")} />
      ) : null}
      {route.kind === "section" && route.sectionId === "settings" ? (
        <SettingsSection
          section={sectionById("settings")}
          durability={workspace.durability}
          navigation={navigation}
        />
      ) : null}
    </>
  );
}
