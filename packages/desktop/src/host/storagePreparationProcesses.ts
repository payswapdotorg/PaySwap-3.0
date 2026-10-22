import { realpath } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { Worker } from "node:worker_threads";
import { createInterface } from "node:readline";
import { z } from "zod";
import {
  databaseStartupErrorCodeSchema,
  databaseMigrationFactsSchema,
  type DatabaseMigrationFacts,
  type DatabaseStartupFailure,
  type DatabaseStartupState,
  databaseStartupErrorDetailsSchema,
  zcodeStoragePreparationFrameSchema,
} from "@zcode/shared";
import { resolveDefaultZCodeAgentCommand } from "@zcode/services/storage-startup";

type Phase = NonNullable<DatabaseStartupState["databasePhase"]>;

/**
 * P12-A (Issue #2 Lane A): every distinct transport failure mode now carries
 * a sanitized cause instead of collapsing onto the generic
 * `transport_closed`:
 *
 *   worker_spawn_failed        — the Worker could not even be constructed
 *   worker_load_failed         — the worker errored before completing
 *                                (module load, runtime bootstrap), with its
 *                                short system code (ERR_MODULE_NOT_FOUND …)
 *   worker_early_exit          — the worker exited without the expected
 *                                frames/exit code (carries the exit code)
 *   worker_protocol_violation  — malformed / duplicate / oversize frames
 *   aborted                    — the caller's AbortSignal fired (shutdown)
 *   first_state_timeout        — 30s without a first progress frame
 *   database_failed            — the worker itself reported a classified
 *                                database failure (sqlite/OS codes preserved)
 *
 * `errorCode` keeps its v1.2.0 values (transport_closed etc.) so existing
 * consumers/telemetry stay coherent; the cause disambiguates.
 */
type FailureCause = Omit<DatabaseStartupFailure, "migrationPreserved">;

function sanitizeSystemCode(code: unknown): string | undefined {
  return typeof code === "string" && /^[A-Z_0-9]{1,64}$/.test(code) ? code : undefined;
}

/** Attach the sanitized cause to an error without disturbing its chain. */
function withFailureCause(error: unknown, cause: FailureCause): unknown {
  if (error && typeof error === "object") {
    try {
      (error as { startupFailure?: unknown }).startupFailure = cause;
    } catch {
      /* frozen/exotic error objects keep their original classification */
    }
  }
  return error;
}

const statusError = (
  kind: string,
  details?: {
    sqliteCode?: number;
    systemCode?: string;
    migrationId?: string;
    migration?: DatabaseMigrationFacts;
  },
  databaseId?: string,
  cause?: FailureCause,
) =>
  Object.assign(new Error(`Storage preparation failed: ${kind}`), {
    kind,
    errcode: details?.sqliteCode,
    code: details?.systemCode,
    migrationId: details?.migrationId,
    startupFailure: cause,
    migrationUpdate:
      databaseId && details?.migration ? { databaseId, migration: details.migration } : undefined,
  });

const workerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("progress"),
      migration: databaseMigrationFactsSchema.optional(),
      phase: z.enum([
        "checking",
        "waiting_for_lock",
        "migrating",
        "committing",
        "maintaining",
        "ready",
      ]),
    })
    .strict(),
  z.object({ type: z.literal("done") }).strict(),
  z
    .object({
      type: z.literal("failed"),
      errorCode: databaseStartupErrorCodeSchema,
      migration: databaseMigrationFactsSchema.optional(),
      ...databaseStartupErrorDetailsSchema.shape,
    })
    .strict(),
]);

/** The worker-facing surface the transport drives (test seam friendly). */
interface WorkerTransport extends Worker {
  /* structural: a real Worker satisfies this trivially */
}

export interface PrepareHostStorageOptions {
  /**
   * Test seam: overrides the tasks-storage worker spawn. Production callers
   * omit it and get the bundled worker (same URL resolution as v1.2.0).
   */
  readonly createWorker?: () => WorkerTransport;
}

export function prepareHostStorage(
  path: string,
  report: (phase: Phase, migration?: DatabaseMigrationFacts) => void,
  signal: AbortSignal,
  options?: PrepareHostStorageOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let worker: WorkerTransport;
    try {
      worker =
        options?.createWorker?.() ??
        new Worker(new URL("./tasksStorageWorker.js", import.meta.url), {
          workerData: { path },
        });
    } catch (error) {
      // A synchronous construction failure (invalid options, resource
      // exhaustion) is a SPAWN failure — distinct from anything the worker
      // itself did.
      reject(withFailureCause(error, { category: "worker_spawn_failed" }));
      return;
    }
    let settled = false;
    let done = false;
    let failure: unknown;
    let firstState = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      outcome();
    };
    const firstStateTimer = setTimeout(() => {
      failure = statusError("startup_status_timeout", undefined, undefined, {
        category: "first_state_timeout",
      });
      void worker.terminate();
    }, 30_000);
    const abort = () => {
      failure = statusError("transport_closed", undefined, undefined, { category: "aborted" });
      void worker.terminate();
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.on("message", (raw: unknown) => {
      const result = workerMessageSchema.safeParse(raw);
      if (!result.success) {
        failure = statusError("transport_closed", undefined, undefined, {
          category: "worker_protocol_violation",
        });
        void worker.terminate();
        return;
      }
      firstState = true;
      clearTimeout(firstStateTimer);
      const message = result.data;
      if (message.type === "progress") report(message.phase, message.migration);
      else if (message.type === "done") done = true;
      else
        failure = statusError(message.errorCode, message, "tasks-index", {
          category: "database_failed",
          ...(typeof message.systemCode === "string"
            ? { systemCode: message.systemCode }
            : {}),
        });
    });
    worker.once("error", (error) => {
      if (failure === undefined) {
        failure = withFailureCause(error, {
          category: "worker_load_failed",
          ...(sanitizeSystemCode((error as { code?: unknown }).code)
            ? { systemCode: sanitizeSystemCode((error as { code?: unknown }).code)! }
            : {}),
        });
      }
    });
    worker.once("exit", (code) => {
      clearTimeout(firstStateTimer);
      signal.removeEventListener("abort", abort);
      if (done && code === 0 && !failure && firstState) {
        settle(resolve);
        return;
      }
      if (failure === undefined) {
        // The worker ended without the expected frames and without an error
        // event — the v1.2.0 blind spot (generic transport_closed with no
        // exit code). Carry the code.
        failure = statusError("transport_closed", undefined, undefined, {
          category: "worker_early_exit",
          workerExitCode: code,
        });
      }
      settle(() => reject(failure));
    });
    if (signal.aborted) abort();
  });
}

/** 在 Host 所属 Worker 运行同一 CLI bundle 的存储入口；Host 退出不会留下持锁孤儿进程。 */
export async function prepareSessionStorage(options: {
  cwd: string;
  env?: Record<string, string>;
  signal: AbortSignal;
  report: (
    phase: Phase,
    details?: { databaseId: string; migration?: DatabaseMigrationFacts },
  ) => void;
  preparedPaths?: Set<string>;
  observePath: (path: string) => Promise<void>;
  /** Test seam: overrides the CLI-entry worker spawn. */
  createWorker?: (entry: string) => WorkerTransport;
}): Promise<void> {
  const command = resolveDefaultZCodeAgentCommand({
    workspacePath: options.cwd,
    workspaceKey: options.cwd,
    presentationSurface: "desktop",
  });
  if (!command?.supportsStorageStartup || !command.storagePreparationEntry)
    throw statusError("unsupported_runtime");
  const entry = command.storagePreparationEntry;
  await new Promise<void>((resolve, reject) => {
    let child: WorkerTransport;
    try {
      child =
        options.createWorker?.(entry) ??
        new Worker(entry, {
          argv: ["app-server", "--stdio", "--prepare-storage", "--cwd", command.cwd ?? options.cwd],
          env: { ...process.env, ...options.env, ...command.env },
          stdin: true,
          stdout: true,
          stderr: true,
        });
    } catch (error) {
      reject(withFailureCause(error, { category: "worker_spawn_failed" }));
      return;
    }
    const input = child.stdin!;
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    let prepared = false;
    let pathReceived = false;
    let preparedPath: string | undefined;
    let failure: unknown;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      outcome();
    };
    const terminate = () => {
      void child.terminate();
    };
    const abort = () => {
      failure ??= statusError("transport_closed", undefined, undefined, { category: "aborted" });
      terminate();
    };
    const firstStateTimer = setTimeout(() => {
      failure = statusError("startup_status_timeout", undefined, undefined, {
        category: "first_state_timeout",
      });
      terminate();
    }, 30_000);
    options.signal.addEventListener("abort", abort, { once: true });
    // stdout 只有有界控制帧，stderr 排空但不把可能含本地路径的原始文本上报。
    child.stderr.resume();
    input.on("error", (error) => {
      failure ??= error;
      terminate();
    });
    lines.on("line", (line) => {
      try {
        if (line.length > 65536)
          throw statusError("transport_closed", undefined, undefined, {
            category: "worker_protocol_violation",
          });
        const frame = zcodeStoragePreparationFrameSchema.parse(JSON.parse(line));
        clearTimeout(firstStateTimer);
        if (frame.method === "startup/storagePath") {
          if (pathReceived)
            throw statusError("transport_closed", undefined, undefined, {
              category: "worker_protocol_violation",
            });
          pathReceived = true;
          void (async () => {
            // 仅复用同一次准备中已成功关闭的真实库，不能按不同 cwd 误判为不同数据库。
            preparedPath = await realpath(frame.params.path).catch(
              (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return resolvePath(frame.params.path);
                throw error;
              },
            );
            if (settled || failure || options.signal.aborted) return;
            const reuse = options.preparedPaths?.has(preparedPath) ?? false;
            if (!reuse) await options.observePath(frame.params.path);
            if (!settled && !failure && !options.signal.aborted)
              input.write(`${JSON.stringify({ method: "startup/storagePathReady", reuse })}\n`);
          })().catch((error) => {
            failure ??= error;
            terminate();
          });
        } else if (frame.method === "startup/storagePrepared") {
          prepared = pathReceived;
          input.end();
        } else if (frame.params.phase === "failed")
          failure ??= statusError(
            frame.params.errorCode ?? "sql_failed",
            frame.params,
            frame.params.databaseId,
            { category: "database_failed" },
          );
        else
          options.report(frame.params.phase, {
            databaseId: frame.params.databaseId,
            migration: frame.params.migration,
          });
      } catch (error) {
        failure ??= error;
        terminate();
      }
    });
    child.once("error", (error) => {
      failure ??= withFailureCause(error, {
        category: "worker_load_failed",
        ...(sanitizeSystemCode((error as { code?: unknown }).code)
          ? { systemCode: sanitizeSystemCode((error as { code?: unknown }).code)! }
          : {}),
      });
    });
    child.once("exit", (code) => {
      clearTimeout(firstStateTimer);
      options.signal.removeEventListener("abort", abort);
      lines.close();
      if (code === 0 && prepared && !failure) {
        if (preparedPath) options.preparedPaths?.add(preparedPath);
        settle(resolve);
        return;
      }
      if (failure === undefined) {
        failure = statusError("transport_closed", undefined, undefined, {
          category: "worker_early_exit",
          workerExitCode: code,
        });
      }
      settle(() => reject(failure));
    });
    if (options.signal.aborted) abort();
  });
}
