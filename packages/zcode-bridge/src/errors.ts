/**
 * @payswap/zcode-bridge — internal validation issue reporting (P3-W3).
 *
 * NOT exported from the package index. Wire validators throw PLAIN Error
 * instances (the bridge deliberately exports no error CLASS — the accepted
 * build's export-surface law is "plain functions / frozen data / strings
 * only"); the issue list below travels in the message so test assertions and
 * callers can match structurally without depending on a custom class.
 */

/** One structural validation failure. */
export interface BridgeIssue {
  readonly subject: string;
  readonly problem: string;
}

/** Render issues as a single deterministic message. */
export function renderIssues(issues: readonly BridgeIssue[]): string {
  return issues
    .map((issue) => `${issue.subject}: ${issue.problem}`)
    .join("; ");
}

/** Collect issues while validating (total; never throws). */
export class IssueCollector {
  private readonly issues: BridgeIssue[] = [];

  add(subject: string, problem: string): void {
    this.issues.push({ subject, problem });
  }

  requireNonEmptyString(
    subject: string,
    value: unknown,
    problem = "must be a non-empty string",
  ): void {
    if (typeof value !== "string" || value.length === 0) {
      this.add(subject, problem);
    }
  }

  requireBoolean(subject: string, value: unknown): void {
    if (typeof value !== "boolean") {
      this.add(subject, "must be a boolean");
    }
  }

  requireNonNegativeInteger(subject: string, value: unknown): void {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      this.add(subject, "must be a non-negative integer");
    }
  }

  requirePositiveInteger(subject: string, value: unknown): void {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1
    ) {
      this.add(subject, "must be a positive integer");
    }
  }

  requireOneOf<T extends string>(
    subject: string,
    value: unknown,
    vocabulary: readonly T[],
  ): void {
    if (typeof value !== "string" || !vocabulary.includes(value as T)) {
      this.add(
        subject,
        `must be one of: ${vocabulary.join(", ")}`,
      );
    }
  }

  get length(): number {
    return this.issues.length;
  }

  get list(): readonly BridgeIssue[] {
    return this.issues;
  }

  /** Throw a plain Error carrying all collected issues, if any. */
  throwIfAny(subject: string): void {
    if (this.issues.length > 0) {
      throw new Error(`Invalid ${subject}: ${renderIssues(this.issues)}`);
    }
  }
}
