/**
 * @payswap/lab error taxonomy (P6-W1; the Lab-local base + family errors,
 * fail-closed, field paths in messages).
 *
 * Every family error extends LabError. Old W2-004 taxonomies are carried
 * forward re-cited to canonical 3.0 invariants; the old imports from
 * sibling packages are replaced by local declarations (lane
 * self-containment — the TL reconciles at integration).
 */

/** Base class of every @payswap/lab error. */
export class LabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabError";
  }
}

/** A Domain Pack declaration is incomplete or inconsistent. */
export class DomainPackValidationError extends LabError {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid domain pack: ${errors.join("; ")}`);
    this.name = "DomainPackValidationError";
    this.errors = [...errors];
  }
}

/** A building-block index operation used an unknown/illegal shape. */
export class LabBuildingBlockIndexError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "LabBuildingBlockIndexError";
  }
}

/** A candidate registry operation violated the lifecycle laws. */
export class CandidateRegistryError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "CandidateRegistryError";
  }
}

/** Raised for any illegal promotion attempt (INV-L02/L03). */
export class PromotionError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "PromotionError";
  }
}

/** A promotion attempted to skip a stage (INV-L03 adjacency). */
export class PromotionSkipError extends PromotionError {
  constructor(fromStage: string, toStage: string) {
    super(
      `illegal stage transition ${fromStage} -> ${toStage}: promotions advance one stage at a time (INV-L03)`,
    );
    this.name = "PromotionSkipError";
  }
}

/** A promotion lacks the required evidence bundle (INV-L02). */
export class PromotionEvidenceError extends PromotionError {
  readonly missing: readonly string[];

  constructor(targetStage: string, missing: readonly string[]) {
    super(
      `promotion to ${targetStage} is missing required evidence: ${missing.join(", ")} (INV-L02: replay + counterfactual + robustness, plus the per-stage shadow/canary reports)`,
    );
    this.name = "PromotionEvidenceError";
    this.missing = [...missing];
  }
}

/** A Director control operation violated the advisory-only laws. */
export class DirectorControlError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "DirectorControlError";
  }
}

/** A recorded production fact set failed its integrity check. */
export class RecordedFactsError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "RecordedFactsError";
  }
}

/** A search plug-in operation violated the grounding laws. */
export class LabSearchError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = "LabSearchError";
  }
}
