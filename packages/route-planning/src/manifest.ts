/**
 * @payswap/route-planning — the fail-closed routine manifest (P16-D part
 * 1; ROUTINE-CONTRACT Appendix A.2; ADR-0009 D1/D2/D6).
 *
 * PAYMENT_ROUTE_PLANNING_MANIFEST_V1 is the canonical frozen versioned
 * routine definition: routineId "payment-route-planning", the pinned
 * schemaVersion + routineVersion, the TWELVE stages (0 match+load; 1
 * validate/clarify; 2 discover sender rails; 3 discover recipient rails;
 * 4 compile routes; 5 hard gates + rank; 6 bounded counterfactuals — the
 * ADVISORY alternative; 7 discover opportunities; 8 present choices; 9a
 * proceed now — the ONLY effect-bearing stage, precondition fresh scoped
 * authorization; 9b wait — the ADVISORY alternative that can never
 * dispatch; 10 reconcile + close), the count-based bounded search
 * policy, the trigger event types, the skill identifier + content digest
 * and the permitted tool/service scopes. loadRoutineManifest enforces
 * the ORDERED fail-closed gates, each a DISTINCT machine code on the
 * typed RoutineManifestError: SHAPE -> SCHEMA_VERSION -> DIGEST ->
 * HANDLER_ALLOWLIST -> AUTHORITY_CLASS (the WAIT branch is checked
 * BEFORE the generic execute law and can never declare execute) ->
 * CAPABILITY_BINDINGS -> MISSION_VERSION_PIN.
 *
 * ADR-0009 D4: the digest gate re-derives the VALUE-FORM digest over the
 * manifest VALUE EXCLUDING the routineDigest field itself (the canonical
 * b:/n: projection via this package's canonical.ts helpers — NEVER a
 * JSON.stringify round-trip of already-parsed text; the exclusion is
 * structural: a digest cannot cover itself).
 */

import { RoutePlanningError } from "./errors.ts";
import { contentDigest, deepFreeze, isNonEmptyString, isRecord } from "./canonical.ts";

/** The routine identity (frozen). */
export const ROUTINE_ID = "payment-route-planning" as const;
/** The pinned manifest schema version (the gate-2 expected value). */
export const ROUTINE_MANIFEST_SCHEMA_VERSION = "route-planning.routine-manifest/1" as const;
/** The canonical routine version. */
export const ROUTINE_VERSION = "1.0.0" as const;
/** The routine skill identifier (skills/payment-route-planning/SKILL.md). */
export const ROUTINE_SKILL_ID = "payment-route-planning" as const;
/**
 * VALUE PIN — the fnv1a64 of the REAL skills/payment-route-planning/SKILL.md
 * bytes (this package's namespaced flavor). The battery re-reads the file
 * and asserts this pin: a drifted skill content is a load failure — fail
 * closed, never a silent mismatch.
 */
export const PINNED_SKILL_CONTENT_DIGEST = "fnv1a64:1abba70f0107d1b2" as const;
/** The append-only mission version pin policy (the gate-7 expected value). */
export const ROUTINE_VERSION_PIN_POLICY = "MISSION_PINNED_APPEND_ONLY" as const;

/** The closed first-party handler allowlist (no skill-bundled shell/script/code is ever a handler). */
export const ROUTINE_STAGE_HANDLER_ALLOWLIST = Object.freeze([
  "route-planning/match-and-load", "route-planning/validate-and-clarify",
  "route-planning/discover-sender-rails", "route-planning/discover-recipient-rails",
  "route-planning/compile-available-routes", "route-planning/apply-hard-gates-and-rank",
  "route-planning/explore-bounded-counterfactuals", "route-planning/discover-opportunities",
  "route-planning/present-choices", "route-planning/proceed-now",
  "route-planning/wait-for-opportunities", "route-planning/reconcile-and-close",
] as const);

/** The closed engine-binding vocabulary (the ADR-0009 D2 injected-port names). */
export const ROUTINE_ENGINE_BINDINGS = Object.freeze([
  "corridor-projection:sender", "corridor-projection:recipient", "route-compilation",
  "scenario-exploration", "opportunity-matching",
] as const);

/** The ordered fail-closed gate codes (frozen; DISTINCT machine codes). */
export const ROUTINE_MANIFEST_GATE_CODES = Object.freeze([
  "MANIFEST_SHAPE", "MANIFEST_SCHEMA_VERSION", "MANIFEST_DIGEST", "MANIFEST_HANDLER_ALLOWLIST",
  "MANIFEST_AUTHORITY_CLASS", "MANIFEST_CAPABILITY_BINDINGS", "MANIFEST_MISSION_VERSION_PIN",
] as const);

export type RoutineManifestGateCode = (typeof ROUTINE_MANIFEST_GATE_CODES)[number];
export type RoutineStageHandlerId = (typeof ROUTINE_STAGE_HANDLER_ALLOWLIST)[number];
export type RoutineEngineBindingName = (typeof ROUTINE_ENGINE_BINDINGS)[number];
export type RoutineStageBranch = "LINEAR" | "ALTERNATIVE";
export type RoutineAuthorityClass =
  | "DISCOVERY" | "ADVISORY" | "PRESENTATION" | "EFFECT_BEARING" | "RECONCILIATION";

/** One deterministic stage declaration (typed handler + authority + bindings). */
export interface RoutineStageDeclaration {
  readonly stageId: string; readonly title: string; readonly handlerId: RoutineStageHandlerId;
  readonly branch: RoutineStageBranch; readonly advisory: boolean; readonly authorityClass: RoutineAuthorityClass;
  readonly requiresEngine: boolean; readonly requiresFreshScopedAuthorization: boolean;
  readonly requiredEngineBinding?: RoutineEngineBindingName;
}
/** The count-based bounded search policy (ADR-0009 D6 — counts only, never a wall clock). */
export interface RoutineSearchPolicyDeclaration {
  readonly basis: "COUNT_BASED_ONLY"; readonly dimensions: readonly string[];
  readonly truncationReceipts: "TRUE_PRE_CUT_COUNTS"; readonly coverage: "COMPLETE_ONLY_WITHOUT_RECEIPT";
}

/** The canonical routine manifest (deep-frozen; the only loaded shape). */
export interface PaymentRoutePlanningManifest {
  readonly routineId: string; readonly schemaVersion: string; readonly routineVersion: string;
  readonly stages: readonly RoutineStageDeclaration[]; readonly searchPolicy: RoutineSearchPolicyDeclaration;
  readonly triggerEventTypes: readonly string[];
  readonly skill: { readonly skillId: string; readonly contentDigest: string };
  readonly permittedToolScopes: readonly string[];
  readonly versionPinPolicy: typeof ROUTINE_VERSION_PIN_POLICY; readonly routineDigest: string;
}
/** A manifest violated one of the ordered fail-closed gates. */
export class RoutineManifestError extends RoutePlanningError {
  constructor(message: string, gate: RoutineManifestGateCode, details?: unknown) {
    super(message, gate, details);
    this.name = "RoutineManifestError";
  }
}

/** A mission version pin was re-targeted divergently (append-only law). */
export class RoutineVersionPinError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "ROUTINE_VERSION_PIN_FAILED", details);
    this.name = "RoutineVersionPinError";
  }
}

const STAGE_BASE_KEYS: readonly string[] = [
  "stageId", "title", "handlerId", "branch", "advisory",
  "authorityClass", "requiresEngine", "requiresFreshScopedAuthorization",
];
const MANIFEST_FIELDS: readonly string[] = [
  "routineId", "schemaVersion", "routineVersion", "stages", "searchPolicy",
  "triggerEventTypes", "skill", "permittedToolScopes", "versionPinPolicy", "routineDigest",
];
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const PACKAGE_DIGEST_PATTERN = /^fnv1a64:[0-9a-f]{16}$/;
const BRANCHES: readonly string[] = ["LINEAR", "ALTERNATIVE"];
const AUTHORITY_CLASSES: readonly string[] = [
  "DISCOVERY", "ADVISORY", "PRESENTATION", "EFFECT_BEARING", "RECONCILIATION",
];

/** The canonical manifest VALUE (routineDigest excluded — it covers the rest). */
const PAYMENT_ROUTE_PLANNING_MANIFEST_V1_VALUE = {
  routineId: ROUTINE_ID,
  schemaVersion: ROUTINE_MANIFEST_SCHEMA_VERSION,
  routineVersion: ROUTINE_VERSION,
  stages: [
    { stageId: "0", title: "Match + load", handlerId: "route-planning/match-and-load", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: false, requiresFreshScopedAuthorization: false },
    { stageId: "1", title: "Validate / clarify", handlerId: "route-planning/validate-and-clarify", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: false, requiresFreshScopedAuthorization: false },
    { stageId: "2", title: "Discover sender rails", handlerId: "route-planning/discover-sender-rails", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: true, requiresFreshScopedAuthorization: false, requiredEngineBinding: "corridor-projection:sender" },
    { stageId: "3", title: "Discover recipient rails", handlerId: "route-planning/discover-recipient-rails", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: true, requiresFreshScopedAuthorization: false, requiredEngineBinding: "corridor-projection:recipient" },
    { stageId: "4", title: "Compile available routes", handlerId: "route-planning/compile-available-routes", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: true, requiresFreshScopedAuthorization: false, requiredEngineBinding: "route-compilation" },
    { stageId: "5", title: "Apply hard gates and rank", handlerId: "route-planning/apply-hard-gates-and-rank", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: false, requiresFreshScopedAuthorization: false },
    { stageId: "6", title: "Explore bounded counterfactuals", handlerId: "route-planning/explore-bounded-counterfactuals", branch: "ALTERNATIVE", advisory: true, authorityClass: "ADVISORY", requiresEngine: true, requiresFreshScopedAuthorization: false, requiredEngineBinding: "scenario-exploration" },
    { stageId: "7", title: "Discover offers and opportunities", handlerId: "route-planning/discover-opportunities", branch: "LINEAR", advisory: false, authorityClass: "DISCOVERY", requiresEngine: true, requiresFreshScopedAuthorization: false, requiredEngineBinding: "opportunity-matching" },
    { stageId: "8", title: "Present user choices", handlerId: "route-planning/present-choices", branch: "LINEAR", advisory: false, authorityClass: "PRESENTATION", requiresEngine: false, requiresFreshScopedAuthorization: false },
    { stageId: "9a", title: "Proceed now", handlerId: "route-planning/proceed-now", branch: "ALTERNATIVE", advisory: false, authorityClass: "EFFECT_BEARING", requiresEngine: false, requiresFreshScopedAuthorization: true },
    { stageId: "9b", title: "Wait for opportunities", handlerId: "route-planning/wait-for-opportunities", branch: "ALTERNATIVE", advisory: true, authorityClass: "ADVISORY", requiresEngine: false, requiresFreshScopedAuthorization: false },
    { stageId: "10", title: "Reconcile and close", handlerId: "route-planning/reconcile-and-close", branch: "LINEAR", advisory: false, authorityClass: "RECONCILIATION", requiresEngine: false, requiresFreshScopedAuthorization: false },
  ] as const,
  searchPolicy: {
    basis: "COUNT_BASED_ONLY",
    dimensions: [
      "maxCandidates", "maxShapes", "maxCandidatesPerShape",
      "maxScenarios", "maxInterventionsPerRun", "maxDemands", "maxPools", "maxRails",
    ],
    truncationReceipts: "TRUE_PRE_CUT_COUNTS",
    coverage: "COMPLETE_ONLY_WITHOUT_RECEIPT",
  },
  triggerEventTypes: ["MoneyMovementIntentAccepted", "PaymentIntentAccepted"],
  skill: { skillId: ROUTINE_SKILL_ID, contentDigest: PINNED_SKILL_CONTENT_DIGEST },
  permittedToolScopes: [
    "capability:corridor:read", "route-compiler:compile",
    "lab:scenario-exploration:read", "opportunities:read",
  ],
  versionPinPolicy: ROUTINE_VERSION_PIN_POLICY,
} as const;

/** The value-form digest over the canonical manifest VALUE (routineDigest excluded). */
export const PAYMENT_ROUTE_PLANNING_MANIFEST_V1_DIGEST = contentDigest(
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1_VALUE,
);

/** The canonical, frozen, versioned routine manifest (the load target). */
export const PAYMENT_ROUTE_PLANNING_MANIFEST_V1: PaymentRoutePlanningManifest = deepFreeze({
  ...PAYMENT_ROUTE_PLANNING_MANIFEST_V1_VALUE,
  routineDigest: PAYMENT_ROUTE_PLANNING_MANIFEST_V1_DIGEST,
});

function fail(gate: RoutineManifestGateCode, message: string, details?: unknown): never {
  throw new RoutineManifestError(message, gate, details);
}

/** The closed top-level key set (gate 1: unknown or missing fields are rejected). */
function requireExactManifestKeys(record: Readonly<Record<string, unknown>>): void {
  const actual = Object.keys(record).sort();
  const expected = [...MANIFEST_FIELDS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("MANIFEST_SHAPE", `a routine manifest must carry exactly the keys [${expected.join(", ")}] — unknown or missing fields are rejected`);
  }
}

/** The value-form digest over a manifest VALUE minus the routineDigest field (the gate-3 law). */
function rederiveRoutineDigest(record: Readonly<Record<string, unknown>>): string {
  const value: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (key !== "routineDigest") value[key] = record[key];
  }
  return contentDigest(value);
}

function requireStringArray(value: unknown, subject: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => isNonEmptyString(entry))) {
    fail("MANIFEST_SHAPE", `${subject} must be a non-empty array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) fail("MANIFEST_SHAPE", `${subject} entries must be unique`);
  return value as readonly string[];
}

function requireStageShape(stage: unknown, index: number): RoutineStageDeclaration {
  if (!isRecord(stage)) fail("MANIFEST_SHAPE", `stages[${index}] must be an object record`);
  const keys = Object.keys(stage);
  for (const key of keys) {
    if (key !== "requiredEngineBinding" && !STAGE_BASE_KEYS.includes(key)) {
      fail("MANIFEST_SHAPE", `stages[${index}] carries the unknown field '${key}' — the stage key set is closed`);
    }
  }
  for (const key of STAGE_BASE_KEYS) {
    if (!keys.includes(key)) fail("MANIFEST_SHAPE", `stages[${index}] is missing the required field '${key}'`);
  }
  const requiresEngine = stage["requiresEngine"];
  if (typeof requiresEngine !== "boolean" || requiresEngine !== keys.includes("requiredEngineBinding")) {
    fail("MANIFEST_SHAPE", `stages[${index}].requiresEngine must be a boolean and name requiredEngineBinding IFF it requires an engine`);
  }
  if (!isNonEmptyString(stage["stageId"]) || !isNonEmptyString(stage["title"]) || !isNonEmptyString(stage["handlerId"])) {
    fail("MANIFEST_SHAPE", `stages[${index}] must carry non-empty stageId, title and handlerId`);
  }
  if (!BRANCHES.includes(stage["branch"] as string) || typeof stage["advisory"] !== "boolean") {
    fail("MANIFEST_SHAPE", `stages[${index}] must carry branch LINEAR|ALTERNATIVE and a boolean advisory`);
  }
  if (!AUTHORITY_CLASSES.includes(stage["authorityClass"] as string) || typeof stage["requiresFreshScopedAuthorization"] !== "boolean") {
    fail("MANIFEST_SHAPE", `stages[${index}] must carry a known authorityClass and a boolean requiresFreshScopedAuthorization`);
  }
  return stage as unknown as RoutineStageDeclaration;
}

/**
 * THE ORDERED FAIL-CLOSED LOADER (Appendix A.2): shape -> schema version
 * -> digest -> handler allowlist -> authority-class law (the WAIT branch
 * checked BEFORE the generic execute law) -> capability bindings ->
 * mission version pin. Every gate throws the typed RoutineManifestError
 * carrying its DISTINCT machine code; a manifest that passes all seven
 * gates is returned deep-frozen (immutable from the moment it loads).
 */
export function loadRoutineManifest(candidate: unknown): PaymentRoutePlanningManifest {
  // Gate 1 — MANIFEST_SHAPE: an object carrying the required top-level fields.
  if (!isRecord(candidate)) {
    fail("MANIFEST_SHAPE", "a routine manifest must be an object record");
  }
  requireExactManifestKeys(candidate);
  if (!isNonEmptyString(candidate["routineId"])) fail("MANIFEST_SHAPE", "routineId must be a non-empty string");
  if (typeof candidate["routineVersion"] !== "string" || !SEMVER_PATTERN.test(candidate["routineVersion"])) {
    fail("MANIFEST_SHAPE", "routineVersion must be a semantic version (major.minor.patch)");
  }
  if (!Array.isArray(candidate["stages"]) || candidate["stages"].length === 0) {
    fail("MANIFEST_SHAPE", "stages must be a non-empty array of stage declarations");
  }
  const stages = candidate["stages"].map((stage, index) => requireStageShape(stage, index));
  const stageIds = stages.map((stage) => stage.stageId);
  if (new Set(stageIds).size !== stageIds.length) fail("MANIFEST_SHAPE", "stage ids must be unique across the manifest");
  const searchPolicy = candidate["searchPolicy"];
  if (
    !isRecord(searchPolicy) || searchPolicy["basis"] !== "COUNT_BASED_ONLY" ||
    searchPolicy["truncationReceipts"] !== "TRUE_PRE_CUT_COUNTS" ||
    searchPolicy["coverage"] !== "COMPLETE_ONLY_WITHOUT_RECEIPT" ||
    !Array.isArray(searchPolicy["dimensions"]) || searchPolicy["dimensions"].length === 0 ||
    !searchPolicy["dimensions"].every((dimension) => isNonEmptyString(dimension))
  ) {
    fail("MANIFEST_SHAPE", "searchPolicy must declare the count-based bounded-search law (basis COUNT_BASED_ONLY, TRUE_PRE_CUT_COUNTS receipts, COMPLETE_ONLY_WITHOUT_RECEIPT coverage, non-empty dimensions)");
  }
  requireStringArray(candidate["triggerEventTypes"], "triggerEventTypes");
  requireStringArray(candidate["permittedToolScopes"], "permittedToolScopes");
  const skill = candidate["skill"];
  if (!isRecord(skill) || !isNonEmptyString(skill["skillId"]) || typeof skill["contentDigest"] !== "string") {
    fail("MANIFEST_SHAPE", "skill must be { skillId, contentDigest }");
  }
  if (typeof candidate["versionPinPolicy"] !== "string" || candidate["versionPinPolicy"].length === 0) {
    fail("MANIFEST_SHAPE", "versionPinPolicy must be a non-empty string");
  }
  if (typeof candidate["routineDigest"] !== "string" || !PACKAGE_DIGEST_PATTERN.test(candidate["routineDigest"])) {
    fail("MANIFEST_SHAPE", "routineDigest must be a value-form digest of this package's one flavor (fnv1a64:<16-hex>)");
  }

  // Gate 2 — MANIFEST_SCHEMA_VERSION.
  if (candidate["schemaVersion"] !== ROUTINE_MANIFEST_SCHEMA_VERSION) {
    fail("MANIFEST_SCHEMA_VERSION", `schemaVersion must equal the pinned expected value '${ROUTINE_MANIFEST_SCHEMA_VERSION}'`, { expected: ROUTINE_MANIFEST_SCHEMA_VERSION, actual: candidate["schemaVersion"] });
  }

  // Gate 3 — MANIFEST_DIGEST: the re-derived VALUE-form digest over the
  // manifest VALUE excluding routineDigest (never a JSON round-trip).
  if (rederiveRoutineDigest(candidate) !== candidate["routineDigest"]) {
    fail("MANIFEST_DIGEST", "the re-derived value-form digest over the manifest value (routineDigest excluded) does not equal the self-declared routineDigest — a tampered manifest never loads", {
      expected: candidate["routineDigest"], actual: rederiveRoutineDigest(candidate),
    });
  }

  // Gate 4 — MANIFEST_HANDLER_ALLOWLIST: first-party handlers only.
  for (const stage of stages) {
    if (!(ROUTINE_STAGE_HANDLER_ALLOWLIST as readonly string[]).includes(stage.handlerId)) {
      fail("MANIFEST_HANDLER_ALLOWLIST", `stage '${stage.stageId}' names handler '${stage.handlerId}' which is not in the pinned first-party allowlist — no shell/script/code bundled from a skill is executable as a routine handler`, {
        stageId: stage.stageId, handlerId: stage.handlerId,
      });
    }
  }

  // Gate 5 — MANIFEST_AUTHORITY_CLASS: the WAIT branch is checked BEFORE
  // the generic execute law and can NEVER declare execute; stage 9a is
  // the only effect-bearing stage and must carry the fresh-authorization
  // precondition; no discovery/advisory stage declares an effect class.
  for (const stage of stages) {
    if (stage.stageId === "9b" && stage.authorityClass === "EFFECT_BEARING") {
      fail("MANIFEST_AUTHORITY_CLASS", "the WAIT branch (stage 9b) can never declare an effect class — a wait match never dispatches (checked before the generic execute law)", { stageId: stage.stageId });
    }
  }
  for (const stage of stages) {
    if (stage.authorityClass === "EFFECT_BEARING" && stage.stageId !== "9a") {
      fail("MANIFEST_AUTHORITY_CLASS", `stage '${stage.stageId}' declares an effect class — stage 9a (proceed now) is the ONLY effect-bearing stage`, { stageId: stage.stageId });
    }
    if (stage.stageId === "9a" && (stage.authorityClass !== "EFFECT_BEARING" || stage.requiresFreshScopedAuthorization !== true)) {
      fail("MANIFEST_AUTHORITY_CLASS", "stage 9a (proceed now) must be the effect-bearing stage carrying the fresh scoped authorization precondition", { stageId: stage.stageId });
    }
    if ((stage.advisory || stage.authorityClass === "ADVISORY") && stage.authorityClass === "EFFECT_BEARING") {
      fail("MANIFEST_AUTHORITY_CLASS", `advisory stage '${stage.stageId}' declares an effect class — advisory stages are never effect-bearing`, { stageId: stage.stageId });
    }
  }

  // Gate 6 — MANIFEST_CAPABILITY_BINDINGS: every engine-requiring stage
  // names its required port binding, and every pinned engine binding is
  // covered (a manifest that silently drops an engine stage fails closed).
  for (const stage of stages) {
    if (stage.requiresEngine) {
      const binding = (stage as { requiredEngineBinding?: unknown }).requiredEngineBinding;
      if (typeof binding !== "string" || !(ROUTINE_ENGINE_BINDINGS as readonly string[]).includes(binding)) {
        fail("MANIFEST_CAPABILITY_BINDINGS", `engine-requiring stage '${stage.stageId}' must name a required port binding from the pinned vocabulary (ADR-0009 D2)`, {
          stageId: stage.stageId, binding,
        });
      }
    }
  }
  for (const binding of ROUTINE_ENGINE_BINDINGS) {
    if (!stages.some((stage) => stage.requiresEngine && (stage as { requiredEngineBinding?: string }).requiredEngineBinding === binding)) {
      fail("MANIFEST_CAPABILITY_BINDINGS", `the required engine binding '${binding}' is named by no stage — the manifest cannot silently drop an engine`, { binding });
    }
  }

  // Gate 7 — MANIFEST_MISSION_VERSION_PIN: the append-only pin policy.
  if (candidate["versionPinPolicy"] !== ROUTINE_VERSION_PIN_POLICY) {
    fail("MANIFEST_MISSION_VERSION_PIN", `versionPinPolicy must equal '${ROUTINE_VERSION_PIN_POLICY}' — a mission pinned to a routine version is never silently re-targeted`, { expected: ROUTINE_VERSION_PIN_POLICY, actual: candidate["versionPinPolicy"] });
  }

  return deepFreeze(candidate as unknown as PaymentRoutePlanningManifest);
}

/** One mission version pin outcome: the first pin pins; a same-version re-pin replays. */
export interface RoutineVersionPin {
  readonly missionId: string; readonly routineVersion: string; readonly pinned: boolean;
}

/**
 * The APPEND-ONLY mission version pin ledger (gate 7's law): a mission
 * pinned to a routine version is never silently re-targeted. A re-pin of
 * the SAME version replays (`pinned: false` — the original pin stands);
 * a DIVERGENT re-pin is the typed RoutineVersionPinError.
 */
export class RoutineVersionPinLedger {
  #pins = new Map<string, string>();

  pinRoutineVersion(missionId: string, routineVersion: string): RoutineVersionPin {
    if (!isNonEmptyString(missionId)) {
      throw new RoutineVersionPinError("missionId must be a non-empty string");
    }
    if (typeof routineVersion !== "string" || !SEMVER_PATTERN.test(routineVersion)) {
      throw new RoutineVersionPinError("routineVersion must be a semantic version (major.minor.patch)");
    }
    const existing = this.#pins.get(missionId);
    if (existing === routineVersion) {
      return deepFreeze({ missionId, routineVersion, pinned: false });
    }
    if (existing !== undefined) {
      throw new RoutineVersionPinError(
        `mission '${missionId}' is pinned to routine version '${existing}' — an append-only pin is never silently re-targeted (divergent re-pin '${routineVersion}' rejected)`,
        { missionId, pinnedVersion: existing, attemptedVersion: routineVersion },
      );
    }
    this.#pins.set(missionId, routineVersion);
    return deepFreeze({ missionId, routineVersion, pinned: true });
  }

  /** The honest lookup: null when the mission was never pinned. */
  versionFor(missionId: string): string | null {
    if (!isNonEmptyString(missionId)) {
      throw new RoutineVersionPinError("versionFor requires a non-empty missionId");
    }
    return this.#pins.get(missionId) ?? null;
  }
}
