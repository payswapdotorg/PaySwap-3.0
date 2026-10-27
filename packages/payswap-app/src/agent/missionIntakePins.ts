/**
 * @payswap/app — STRUCTURAL PINS of the composer↔mission intake plane
 * (P21-B, ADR-0014 D2).
 *
 * MIRROR DISCIPLINE (the paymentMissionsPins.ts pattern): @payswap/app
 * src NEVER imports the desktop host — the mission-plane channel members
 * this port rides are pinned STRUCTURALLY here (same shapes), and the
 * platform host's composition root binds the REAL channel members behind
 * it. The channel member contracts live in
 * packages/desktop/src/host/payswap/shell/payment-mission-members.ts
 * (READ-ONLY reference, never imported).
 *
 * LAWS (ADR-0014 D2):
 * - The composer's classified PAYMENT_MISSION intents seed REAL missions
 *   through the EXISTING `paymentMissionSeed` member — the ORIGIN stays
 *   HOST-PINNED (COMPOSER_TEXT); this port carries NO origin field and
 *   the binding never supplies one (a host contract is never loosened
 *   renderer-side).
 * - The clarification loop surfaces IN the composer conversation through
 *   the EXISTING `paymentMissionAskNextField` / `paymentMissionCapture`
 *   members (the deterministic nine-field intake, fail-closed capture —
 *   never invented inputs).
 * - ZERO FINANCIAL AUTHORITY: the port seeds/asks/captures demand-side
 *   records only; nothing here dispatches, authorizes or observes.
 * - The app ships NO default (an unbound plane renders the honest
 *   unbound note — the ADR-0010 D7 web analogue: the web build renders
 *   what is real there, never fakes the mission tier).
 */

/* ------------------------------ the inputs --------------------------- */

/** The mission seed input (mirrors PaymentMissionSeedInputDto's two caller fields — origin stays host-pinned). */
export interface MissionIntakeSeedInput {
  readonly direction: string;
  readonly goalStatement: string;
}

/** The mission seed outcome (mirrors the member's return shape). */
export interface MissionIntakeSeedOutcome {
  readonly missionId: string;
  readonly action: "CREATED" | "RESUMED";
}

/** One deterministic ask (mirrors askNextField's return shape). */
export interface MissionIntakeAsk {
  readonly fieldId: string;
  readonly question: string;
}

/* ------------------------------- the port ---------------------------- */

/**
 * The mission-intake plane port (the pinned mirror of the three channel
 * members the composer binding rides). The platform host's composition
 * root binds the REAL channel adapter; the app ships NO default.
 */
export interface MissionIntakePlanePort {
  /** Seed-or-resume a REAL mission (the host pins the origin COMPOSER_TEXT). */
  seedMission(input: MissionIntakeSeedInput): Promise<MissionIntakeSeedOutcome>;
  /** The next missing intake field in the deterministic order, or null when complete. */
  askNextField(missionId: string): Promise<MissionIntakeAsk | null>;
  /**
   * Capture one intake field (the host's own fail-closed validation — an
   * invalid value is a typed refusal, never coerced). Rejects on refusal.
   */
  captureField(missionId: string, fieldId: string, value: unknown): Promise<void>;
}

/* ---------------------------- the state pin -------------------------- */

/** The binding's phases (the intake ask-loop state machine). */
export const MISSION_INTAKE_PHASES = Object.freeze([
  "UNBOUND", "IDLE", "ASKING", "CAPTURING", "COMPLETE", "ERROR",
] as const);
export type MissionIntakePhase = (typeof MISSION_INTAKE_PHASES)[number];

/** The composer-projected intake state (the ask the conversation owns). */
export interface MissionIntakeState {
  readonly phase: MissionIntakePhase;
  /** The linked mission (absent until the plane seeds/attaches one). */
  readonly missionId?: string;
  /** The agent task the mission is linked to. */
  readonly taskId?: string;
  /** The pending ask the user's next text answers (absent when none). */
  readonly pendingAsk?: MissionIntakeAsk;
  /** The honest error line when a plane call failed (rendered, never masked). */
  readonly error?: string;
}

export const MISSION_INTAKE_UNBOUND_STATE: MissionIntakeState = Object.freeze({ phase: "UNBOUND" });

/* -------------------------- the honest notes -------------------------- */

/** The unbound-mission note (the web tier's honest truth — never a faked mission). */
export const MISSION_INTAKE_UNBOUND_NOTE =
  "The mission plane is not wired in this deployment — your request is recorded as a task in this browser profile only, and no payment mission can be started honestly here. The platform host binds the mission-plane channel at its composition root; until then this composer states the gap instead of simulating a mission." as const;

/** The intake law, in people language (rendered while the ask loop owns the conversation). */
export const MISSION_INTAKE_ASK_NOTE =
  "The guided intake asks one question at a time, in its fixed order — every field is missing until you answer it explicitly, and nothing is guessed, defaulted or inferred. An invalid answer is refused with the accepted format named, and the question repeats." as const;

/** The complete-intake note. */
export const MISSION_INTAKE_COMPLETE_NOTE =
  "The intake is complete — every required field has an explicit answer, and the mission can compile its typed intent on the authority surface. Route planning starts only from that validated intent." as const;
