/**
 * @payswap/app — page/view-model CONTRACTS for the PaySwap web
 * product (P7-W1, MMP-36 REWRITE: a NEW product on the @zcode/web
 * substrate; the old @payswap/web is content/IA evidence only).
 *
 * LAW: every view here is a PROJECTION (INV-23) — data arrives via
 * props/contracts, never via fetch inside the product's view layer; the
 * product holds no financial state of its own; every money/execution state
 * rendered comes from provider-verified observations in the pinned
 * vocabulary (../pins/). Views are honest by construction: UNKNOWN renders
 * as UNKNOWN, an unavailable surface says so, and nothing fabricates
 * success (INV-24 posture at the web boundary).
 */

import type {
  OutcomeActionIdPin,
  OutcomeCapabilityStatePin,
  OutcomeDeploymentContextPin,
  UniversalAreaPin,
  UniversalAreaIdPin,
} from "../pins/surface-pins.js";
import type { ExternalEffectOutcomePin } from "../pins/provider-runtime-pins.js";

/* ====================================================================
 * Honest-state view contract (the shared state vocabulary of the product)
 * ==================================================================== */

/**
 * The honest render tone of a state view — a PRESENTATION tone only. It is
 * deliberately disjoint from the authority vocabulary: an UNKNOWN outcome
 * never maps to "negative"; a FAILED outcome never maps to "positive".
 */
export type HonestTone = "positive" | "neutral" | "attention" | "unknown" | "negative";

/** A typed, honest state view any page can render (data via props only). */
export interface HonestStateView {
  /** Which pinned vocabulary the state came from (provider-verified observation). */
  readonly source: "provider-runtime-envelope" | "surface-progress" | "deployment-fact";
  /** The verbatim authority word (CONFIRMED / UNKNOWN / FAILED / stage id ...). */
  readonly authorityWord: string;
  readonly tone: HonestTone;
  readonly headline: string;
  /** The person-actionable explanation (reconciliation-first for UNKNOWN). */
  readonly guidance: string;
}

/** The deployment-phase honesty contract for gated surfaces. */
export interface DeploymentPhaseGateView {
  /** The surface is NOT available in this deployment phase (an honest fact). */
  readonly available: false;
  readonly reason: string;
  /** What the gate renders instead of a fabricated surface. */
  readonly honestAlternative: string;
}

/* ====================================================================
 * Outcome board view (the five outcome actions with honest dispatchability)
 * ==================================================================== */

export interface OutcomeBoardRow {
  readonly actionId: OutcomeActionIdPin;
  readonly label: string;
  readonly outcomeLine: string;
  readonly advancedDisclosure: readonly string[];
  readonly capability: OutcomeCapabilityStatePin;
}

export interface OutcomeBoardView {
  readonly rows: readonly OutcomeBoardRow[];
  /** Honest deployment context the board was folded for (recorded verbatim). */
  readonly deployment: OutcomeDeploymentContextPin;
  /** True when NO outcome action is dispatchable — the board leads with that fact. */
  readonly nothingDispatchable: boolean;
}

/* ====================================================================
 * Honest coverage view (the capabilities/coverage explorer)
 * ==================================================================== */

/** Connection-record status vocabulary (recorded evidence — never upgraded). */
export type CoverageRecordStatus =
  | "VERIFIED"
  | "ELIGIBLE"
  | "BLOCKED"
  | "NO_CREDENTIAL_HELD"
  | "NOT_ACTIVATED";

/** One connected-provider record from recorded evidence. */
export interface ConnectedProviderRecord {
  readonly providerName: string;
  readonly authorizationMode: string;
  readonly configKey: string;
  readonly probeEvidence: {
    readonly probedAt: string;
    readonly verdict: string;
    readonly summary: string;
  };
  readonly certification: {
    readonly certificationId?: string;
    readonly executed: number;
    readonly passed: number;
    readonly failed: number;
    readonly notApplicable: number;
    readonly evidencePath?: string;
  };
  readonly limitations: readonly string[];
}

/** One non-connection record (blocked / awaiting credentials / local rail). */
export interface NonConnectionRecord {
  readonly providerName: string;
  readonly status: string;
  readonly reason: string;
}

/** A supporting platform service record — never a payment rail. */
export interface SupportingServiceRecord {
  readonly id: string;
  readonly mode: string;
  readonly authentication: string;
  readonly verdict: string;
  readonly note: string;
}

/** The recorded-evidence input the coverage fold consumes (explicit input). */
export interface CoverageSource {
  /** When the provider probes were executed (ISO-8601; "" when never probed). */
  readonly probedAt: string;
  readonly releaseId: string;
  readonly connected: readonly ConnectedProviderRecord[];
  readonly nonConnections: readonly NonConnectionRecord[];
  readonly supportingServices: readonly SupportingServiceRecord[];
}

/** The honest coverage view — statuses are rendered verbatim, never upgraded. */
export interface CoverageView {
  readonly probedAt: string;
  readonly releaseId: string;
  readonly connected: readonly ConnectedProviderRecord[];
  readonly blocked: readonly NonConnectionRecord[];
  readonly awaitingCredentials: readonly NonConnectionRecord[];
  readonly localRail: readonly NonConnectionRecord[];
  readonly supportingServices: readonly SupportingServiceRecord[];
  /** True when the deployment has NO recorded provider evidence at all. */
  readonly noEvidenceRecorded: boolean;
}

/* ====================================================================
 * Site view (public-site chrome + navigation)
 * ==================================================================== */

/** One navigation link in the public site header. */
export interface NavLink {
  readonly href: string;
  readonly label: string;
}

/** The app-plane navigation view over the pinned eleven-area IA. */
export interface NavigationAreaView {
  readonly areas: readonly UniversalAreaPin[];
  /** Every area id in canonical order (the pinned AREA SET). */
  readonly areaIds: readonly UniversalAreaIdPin[];
}

/* ====================================================================
 * Page view models
 * ==================================================================== */

/** The home page view: positioning + outcome board + coverage summary. */
export interface HomePageView {
  readonly positioning: {
    readonly headline: string;
    readonly subheadline: string;
  };
  readonly outcomeBoard: OutcomeBoardView;
  readonly coverageSummary: CoverageView;
  readonly commitments: readonly string[];
}

/** The honest API runtime state for the developers page view. */
export interface DevelopersPageView {
  readonly apiRuntime: {
    readonly configured: boolean;
    readonly baseUrl: string | null;
    readonly envVar: string;
  };
  readonly consumableContracts: readonly string[];
}

/**
 * The advanced developer tooling catalogue (P12 Lane C, C5): the
 * ZCode-derived capabilities that are REAL in the advanced developer
 * workspace of the PaySwap Agent Console (FEATURE-MAP §6). Surfaced
 * from the PaySwap IA as honest catalogued pointers — the services
 * themselves live in the advanced workspace and are NEVER duplicated
 * here. Wording law: no upstream product branding on the normal user
 * surfaces (attribution stays in the legal/footer location per
 * PRODUCT-IDENTITY §4).
 */
export const ADVANCED_TOOLING_CATALOGUE: readonly string[] = [
  "Model & provider selection",
  "Projects & workspaces",
  "Tasks, sessions & history",
  "Agents & subagents",
  "Terminal",
  "Command palette",
  "Artifacts & files",
  "Browser tooling",
  "Tools & MCP",
  "Extensions",
  "Automations (hooks & commands)",
];

/** Render outcome of a provider-verified observation (display vocabulary). */
export type ObservationOutcomeWord = ExternalEffectOutcomePin;
