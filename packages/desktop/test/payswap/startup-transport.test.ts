/**
 * PaySwap storage-preparation transport laws (P12-A, Issue #2 Lane A).
 *
 * Defect being locked out: the v1.2.0 transport collapsed every failure
 * mode onto the generic `transport_closed` — the operator's startup
 * failure payload (failedPhase preparing_host_storage, 15 ms, no disk
 * samples, no baselines) could not be root-caused from the evidence the
 * app emitted, and `canRetryDatabaseStartup` excluded transport_closed
 * so the failure screen offered NO retry.
 *
 * The laws proven here:
 *   - every failure mode carries its sanitized cause category (+ worker
 *     exit code / short system code where they exist);
 *   - the promise settles EXACTLY ONCE under adversarial interleavings
 *     (abort/error/exit races, post-settle events);
 *   - timers and listeners are disposed on every terminal path;
 *   - the retry law: legacy states classify exactly as before; the new
 *     transient categories are retryable; aborted never is; corrupt /
 *     checksum / starting_services never are.
 */

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  canRetryDatabaseStartup,
  extractDatabaseStartupFailure,
  type DatabaseStartupState,
} from "@zcode/shared";
import {
  prepareHostStorage,
  type PrepareHostStorageOptions,
} from "../../src/host/storagePreparationProcesses.js";

/** A minimal fake worker thread: event-emitter + async terminate. */
class FakeWorker extends EventEmitter {
  terminated = false;
  terminate(): Promise<number> {
    this.terminated = true;
    return Promise.resolve(0);
  }
}

function createFakeWorkerHarness() {
  const worker = new FakeWorker();
  const options: PrepareHostStorageOptions = { createWorker: () => worker };
  return { worker, options };
}

const phases: string[] = [];

function prepare(
  options: PrepareHostStorageOptions,
  signal: AbortSignal = new AbortController().signal,
) {
  phases.length = 0;
  return prepareHostStorage(
    "/tmp/p12-test-tasks-index.sqlite",
    (phase) => {
      phases.push(phase);
    },
    signal,
    options,
  );
}

function failureOf(error: unknown) {
  return extractDatabaseStartupFailure(error);
}

describe("storage preparation transport classification (P12-A)", () => {
  it("resolves on the happy path and reports worker progress phases", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("message", { type: "progress", phase: "checking" });
    worker.emit("message", { type: "progress", phase: "migrating", migration: { kind: "initialize", executedCount: 1, committedCount: 0 } });
    worker.emit("message", { type: "progress", phase: "ready" });
    worker.emit("message", { type: "done" });
    worker.emit("exit", 0);
    await expect(promise).resolves.toBeUndefined();
    expect(phases).toEqual(["checking", "migrating", "ready"]);
  });

  it("classifies an exit without frames as worker_early_exit WITH the exit code", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("exit", 1);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    const cause = failureOf(error);
    expect(cause?.category).toBe("worker_early_exit");
    expect(cause?.workerExitCode).toBe(1);
    // The observable errorCode keeps the v1.2.0 value for consumers…
    expect((error as { kind?: string }).kind).toBe("transport_closed");
  });

  it("classifies a worker error event as worker_load_failed with the sanitized system code", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    const loadError = Object.assign(new Error("Cannot find module 'some/worker/path.js'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    worker.emit("error", loadError);
    worker.emit("exit", 1);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    const cause = failureOf(error);
    expect(cause?.category).toBe("worker_load_failed");
    expect(cause?.systemCode).toBe("ERR_MODULE_NOT_FOUND");
    // …and the original error object (not a wrapper) reaches the classifier
    // so its system code also flows through databaseStartupErrorDetails.
    expect(error).toBe(loadError);
  });

  it("classifies a synchronous spawn failure as worker_spawn_failed", async () => {
    const options: PrepareHostStorageOptions = {
      createWorker: () => {
        throw new Error("spawn failed");
      },
    };
    const error = await prepare(options).then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    expect(failureOf(error)?.category).toBe("worker_spawn_failed");
  });

  it("classifies a malformed frame as worker_protocol_violation and terminates the worker", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("message", { type: "progress", phase: "definitely-not-a-phase" });
    expect(worker.terminated).toBe(true);
    worker.emit("exit", 1);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    expect(failureOf(error)?.category).toBe("worker_protocol_violation");
  });

  it("classifies an abort as aborted (shutdown, not a product failure)", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const controller = new AbortController();
    const promise = prepare(options, controller.signal);
    controller.abort();
    expect(worker.terminated).toBe(true);
    worker.emit("exit", 1);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    expect(failureOf(error)?.category).toBe("aborted");
  });

  it("classifies a classified worker failure frame as database_failed with sqlite details", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("message", {
      type: "failed",
      errorCode: "permission_denied",
      sqliteCode: 13,
    });
    worker.emit("exit", 1);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    const cause = failureOf(error);
    expect(cause?.category).toBe("database_failed");
    expect((error as { kind?: string }).kind).toBe("permission_denied");
    expect((error as { errcode?: number }).errcode).toBe(13);
  });

  it("classifies a missing first state as first_state_timeout (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const { worker, options } = createFakeWorkerHarness();
      const promise = prepare(options);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(worker.terminated).toBe(true);
      worker.emit("exit", 0);
      const error = await promise.then(
        () => {
          throw new Error("expected rejection");
      },
        (failure: unknown) => failure,
      );
      expect(failureOf(error)?.category).toBe("first_state_timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a done frame satisfies the first-state contract even with no prior progress (v1.2.0 semantics preserved)", async () => {
    // The real worker always reports progress("checking") synchronously
    // before anything else, so done-without-progress cannot occur without a
    // worker-side protocol bug — the transport's contract is frames +
    // exit code, and ANY valid frame (done included) proves the transport
    // works. Behavior identical to v1.2.0; pinned so the P12-A change
    // cannot silently tighten it.
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("message", { type: "done" });
    worker.emit("exit", 0);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("storage preparation transport settling (P12-A)", () => {
  it("settles exactly once when error, exit and abort race", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const controller = new AbortController();
    const promise = prepare(options, controller.signal);
    worker.emit("message", { type: "progress", phase: "checking" });
    // Adversarial order: abort AND error AND exit.
    controller.abort();
    worker.emit("error", Object.assign(new Error("late error"), { code: "ERR_MODULES_NOT_RUNNING" }));
    worker.emit("exit", 1);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    // The FIRST precise cause wins (abort), not the later noise.
    expect(failureOf(error)?.category).toBe("aborted");
  });

  it("ignores post-settle events (no unhandled rejections, no double settle)", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("message", { type: "progress", phase: "checking" });
    worker.emit("message", { type: "done" });
    worker.emit("exit", 0);
    await expect(promise).resolves.toBeUndefined();
    // Late events after a settled promise must be inert.
    worker.emit("message", { type: "progress", phase: "migrating" });
    worker.emit("error", new Error("late error"));
    worker.emit("exit", 1);
  });

  it("a failure frame beats a later done+exit0", async () => {
    const { worker, options } = createFakeWorkerHarness();
    const promise = prepare(options);
    worker.emit("message", { type: "progress", phase: "checking" });
    worker.emit("message", { type: "failed", errorCode: "corrupt", sqliteCode: 11 });
    worker.emit("message", { type: "done" });
    worker.emit("exit", 0);
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (failure: unknown) => failure,
    );
    expect(failureOf(error)?.category).toBe("database_failed");
    expect((error as { kind?: string }).kind).toBe("corrupt");
  });
});

describe("the retry law (P12-A)", () => {
  const failedState = (overrides: Partial<DatabaseStartupState>): DatabaseStartupState =>
    ({
      schemaVersion: 1,
      startupId: "s",
      attemptId: "a",
      sequence: 3,
      startedAt: 0,
      updatedAt: 1,
      phase: "failed",
      failedPhase: "preparing_host_storage",
      disk: [],
      ...overrides,
    }) as DatabaseStartupState;

  it("legacy states (no startupFailure) classify EXACTLY as v1.2.0", () => {
    const legacyNonRetryable = [
      "corrupt",
      "checksum_mismatch",
      "transport_closed",
      "startup_status_timeout",
      "unsupported_runtime",
    ];
    for (const errorCode of legacyNonRetryable) {
      expect(canRetryDatabaseStartup(failedState({ errorCode }))).toBe(false);
    }
    for (const errorCode of ["sql_failed", "lock_timeout", "open_failed", "io_error", "permission_denied"]) {
      expect(canRetryDatabaseStartup(failedState({ errorCode }))).toBe(true);
    }
    expect(canRetryDatabaseStartup(failedState({ errorCode: "sql_failed", failedPhase: "starting_services" }))).toBe(false);
  });

  it("the new transient categories are retryable (the operator's dead screen is gone)", () => {
    for (const category of [
      "worker_spawn_failed",
      "worker_load_failed",
      "worker_early_exit",
      "worker_protocol_violation",
      "first_state_timeout",
      "unknown",
    ] as const) {
      expect(
        canRetryDatabaseStartup(
          failedState({ errorCode: "transport_closed", startupFailure: { category } }),
        ),
      ).toBe(true);
    }
  });

  it("aborted is never a user retry state", () => {
    expect(
      canRetryDatabaseStartup(
        failedState({ errorCode: "transport_closed", startupFailure: { category: "aborted" } }),
      ),
    ).toBe(false);
  });

  it("database_failed keeps the per-code law (corrupt/checksum stay non-retryable)", () => {
    expect(
      canRetryDatabaseStartup(
        failedState({ errorCode: "corrupt", startupFailure: { category: "database_failed" } }),
      ),
    ).toBe(false);
    expect(
      canRetryDatabaseStartup(
        failedState({ errorCode: "lock_timeout", startupFailure: { category: "database_failed" } }),
      ),
    ).toBe(true);
  });

  it("extractDatabaseStartupFailure rejects unsanitized payloads", () => {
    const error = Object.assign(new Error("x"), {
      startupFailure: { category: "worker_early_exit", secretPath: "/home/user/db.sqlite" },
    });
    expect(extractDatabaseStartupFailure(error)).toBeUndefined();
  });

  it("extractDatabaseStartupFailure walks causes", () => {
    const inner = Object.assign(new Error("inner"), {
      startupFailure: { category: "worker_early_exit", workerExitCode: 7 },
    });
    const outer = new Error("outer", { cause: inner });
    expect(extractDatabaseStartupFailure(outer)).toEqual({
      category: "worker_early_exit",
      workerExitCode: 7,
    });
  });
});
