/**
 * @payswap/app — the CONVERSATION LOOP ENGINE battery (P24-3, ADR-0017
 * D8/D11 — the handoff §13.4 model/task gates).
 *
 * The bounded selected-model loop, machine-checked against the REAL
 * engine with deterministic fakes on every seam (model port, tool
 * runtime, clock, timeout, abort):
 *
 * - the §13.4 gate list: zero tools, one tool, multiple sequential
 *   tools, tool-call errors, timeout, cancellation, max-turn cutoff,
 *   max-tool-step cutoff, malformed-argument error results, invalid
 *   tool names, duplicate tool-call ids, loop detection, byte budgets;
 * - the honesty laws: the SAME persisted selection is invoked every
 *   turn (no silent substitution), a tool-calling-incapable model is
 *   reported (never worked around), provider failures surface with
 *   their retry classification (at most ONE bounded retry), a stream
 *   without a completion chunk is a protocol violation, UNKNOWN stays
 *   UNKNOWN, and the two-phase pause leaves the prepare call
 *   UNANSWERED (the human decision owns its result);
 * - the persistence discipline: only user-visible events are emitted
 *   (TEXT_DELTA is transient; hidden chain-of-thought has no kind at
 *   all).
 */
import { describe, expect, it } from "vitest";

import { runAgentConversationLoop } from "../../src/agent/conversationLoopEngine.js";
import { AgentModelConversationError, type AgentModelConversationPort, type AgentModelToolContractPin, type AgentModelTurnChunk, type AgentModelTurnRequest } from "../../src/agent/modelConversationPort.js";
import type { AgentToolRuntimePort } from "../../src/agent/stripeToolExecutionPort.js";
import type { AgentConversationLoopResult, AgentConversationStreamEvent } from "../../src/agent/conversationLoopTypes.js";
import type { StripePreparedActionPin } from "../../src/agent/stripePreparedActionPins.js";

const SELECTION = { providerId: "zai", modelId: "glm-5.2", reasoningLevel: "high" } as const;
const NOW = () => "2026-10-31T12:00:00Z";

/* ----------------------------- the fakes ------------------------------ */

type TurnScript = (request: AgentModelTurnRequest) => AgentModelTurnChunk[];

interface RecordedRequest {
  readonly turnId: string;
  readonly selection: AgentModelTurnRequest["selection"];
  readonly messages: AgentModelTurnRequest["messages"];
  readonly tools: readonly AgentModelToolContractPin[];
  readonly toolChoice: AgentModelTurnRequest["toolChoice"];
}

function fakeModel(scripts: readonly TurnScript[], support = { supportsToolCalling: true, supportsStreaming: true }) {
  const requests: RecordedRequest[] = [];
  let cursor = 0;
  const port: AgentModelConversationPort = {
    tier: "HOST_BRIDGED",
    async describeModelSupport() {
      return support;
    },
    async *startTurn(request): AsyncGenerator<AgentModelTurnChunk> {
      requests.push({
        turnId: request.turnId,
        selection: request.selection,
        messages: [...request.messages],
        tools: [...request.tools],
        toolChoice: request.toolChoice,
      });
      const script = scripts[cursor];
      cursor += 1;
      if (script === undefined) {
        throw new AgentModelConversationError("PROVIDER_FAILURE", "the scripted model ran out of turns", false);
      }
      for (const chunk of script(request)) {
        yield chunk;
      }
    },
  };
  return { port, requests };
}

const text = (t: string): AgentModelTurnChunk => ({ kind: "TEXT_DELTA", text: t });
const call = (id: string, name: string, input: unknown): AgentModelTurnChunk => ({
  kind: "TOOL_CALL",
  call: { id, name, input },
});
const done = (finish: "STOP" | "TOOL_CALLS" | "LENGTH" = "STOP"): AgentModelTurnChunk => ({
  kind: "TURN_COMPLETED",
  finish,
});

/** A tool runtime whose results are fully scripted per call id. */
function fakeTools(results: Readonly<Record<string, unknown>> = {}) {
  const executed: { id: string; name: string; input: unknown }[] = [];
  const runtime: AgentToolRuntimePort = {
    async executeCall({ call }) {
      executed.push({ id: call.id, name: call.name, input: call.input });
      const result = results[call.id];
      if (result === undefined) {
        return { status: "OK", output: { echo: call.name } };
      }
      return result as never;
    },
  };
  return { runtime, executed };
}

const neverTimesOut = () => new Promise<never>(() => {});
const notAborted = () => false;

async function run(
  input: Parameters<typeof runAgentConversationLoop>[0],
  seams: Parameters<typeof runAgentConversationLoop>[1],
): Promise<{ result: AgentConversationLoopResult; events: AgentConversationStreamEvent[] }> {
  const events: AgentConversationStreamEvent[] = [];
  const result = await runAgentConversationLoop(input, seams, (event) => {
    events.push(event);
  });
  return { result, events };
}

const baseInput = (overrides: Partial<Parameters<typeof runAgentConversationLoop>[0]> = {}) => ({
  taskId: "task-1",
  connectionId: "conn-1",
  selection: SELECTION,
  history: [],
  newUserText: "what can this connection do?",
  tools: [] as readonly AgentModelToolContractPin[],
  ...overrides,
});

/* ------------------------- the §13.4 gate list ------------------------ */

describe("the §13.4 gates — zero tools, one tool, multiple sequential tools", () => {
  it("ZERO TOOLS: a plain turn answers without any tool event", async () => {
    const model = fakeModel([() => [text("Hello!"), done()]]);
    const tools = fakeTools();
    const { result, events } = await run(baseInput(), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(result.turns).toBe(1);
    expect(result.toolSteps).toBe(0);
    expect(tools.executed).toHaveLength(0);
    expect(events).toEqual([{ kind: "ASSISTANT_TEXT", text: "Hello!" }]);
    expect(model.requests[0]!.toolChoice).toBe("none");
  });

  it("ONE TOOL: a single tool call round-trips and the loop answers", async () => {
    const model = fakeModel([
      () => [text("Let me look."), call("c1", "stripe.resources.products.list", { limit: 5 }), done("TOOL_CALLS")],
      () => [text("Here is the catalogue."), done()],
    ]);
    const tools = fakeTools();
    const { result, events } = await run(baseInput({ tools: [{ name: "stripe.resources.products.list", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(result.toolSteps).toBe(1);
    expect(tools.executed).toEqual([{ id: "c1", name: "stripe.resources.products.list", input: { limit: 5 } }]);
    expect(events.map((event) => event.kind)).toEqual(["ASSISTANT_TEXT", "TOOL_CALL", "TOOL_RESULT", "ASSISTANT_TEXT"]);
    const toolResult = events.find((event) => event.kind === "TOOL_RESULT")!;
    expect(toolResult).toMatchObject({ callId: "c1", status: "OK" });
    // The tool result is fed back to the model as a tool message.
    const secondTurnMessages = model.requests[1]!.messages;
    expect(secondTurnMessages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c1" });
  });

  it("MULTIPLE SEQUENTIAL TOOLS: two rounds, each result fed to the next turn", async () => {
    const model = fakeModel([
      () => [call("c1", "stripe.search_operations", { query: "products" }), done("TOOL_CALLS")],
      () => [call("c2", "stripe.describe_operation", { operationId: "PostProducts" }), done("TOOL_CALLS")],
      () => [text("Both done."), done()],
    ]);
    const tools = fakeTools();
    const { result } = await run(baseInput({ tools: [{ name: "stripe.search_operations", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(result.toolSteps).toBe(2);
    expect(result.turns).toBe(3);
    expect(tools.executed.map((entry) => entry.id)).toEqual(["c1", "c2"]);
    expect(model.requests[1]!.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c1" });
    expect(model.requests[2]!.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c2" });
  });

  it("MULTIPLE TOOL CALLS IN ONE TURN all execute in order", async () => {
    const model = fakeModel([
      () => [call("c1", "a.tool", {}), call("c2", "b.tool", {}), done("TOOL_CALLS")],
      () => [text("done"), done()],
    ]);
    const tools = fakeTools();
    const { result } = await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.toolSteps).toBe(2);
    expect(tools.executed.map((entry) => entry.id)).toEqual(["c1", "c2"]);
  });
});

describe("the §13.4 gates — failures, timeouts, cancellation, cutoffs", () => {
  it("TOOL ERRORS: an error result is reported to the model and the loop continues", async () => {
    const model = fakeModel([
      () => [call("c1", "stripe.resources.products.list", { limit: 0 }), done("TOOL_CALLS")],
      () => [text("The limit was invalid, fixed."), done()],
    ]);
    const tools = fakeTools({ c1: { status: "ERROR", error: { code: "VALIDATION", message: "limit must be 1..100", retryable: true } } });
    const { result, events } = await run(baseInput({ tools: [{ name: "stripe.resources.products.list", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(events.find((event) => event.kind === "TOOL_RESULT")).toMatchObject({ callId: "c1", status: "ERROR" });
    expect(model.requests[1]!.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c1" });
  });

  it("TOOL ERRORS EXCEEDED: too many failed calls stop the loop honestly", async () => {
    const model = fakeModel([
      () => [call("c1", "a.tool", {}), done("TOOL_CALLS")],
      () => [call("c2", "a.tool", {}), done("TOOL_CALLS")],
      () => [text("never reached"), done()],
    ]);
    const error = { status: "ERROR", error: { code: "VALIDATION", message: "bad", retryable: false } } as const;
    const tools = fakeTools({ c1: error, c2: error });
    const { result } = await run(
      baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }], budgets: { maxFailedToolCalls: 1 } }),
      { model: model.port, tools: tools.runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("TOOL_CALL_ERRORS_EXCEEDED");
    expect(result.note).toContain("malformed arguments never execute anything");
  });

  it("TIMEOUT: a turn that never completes is cut off with TURN_TIMEOUT", async () => {
    const model = fakeModel([() => [text("streaming forever…")]]); // no TURN_COMPLETED
    const { result } = await run(baseInput(), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: () => Promise.reject(new AgentModelConversationError("TURN_TIMEOUT", "the model turn exceeded its timeout")),
      isAborted: notAborted,
    });
    expect(result.reason).toBe("TURN_TIMEOUT");
    expect(result.note).toContain("No tool was left running");
  });

  it("CANCELLATION: the user abort mid-stream keeps the recorded partials", async () => {
    let aborted = false;
    const model = fakeModel([
      function* () {
        yield text("partial answer ");
        aborted = true; // the abort lands mid-stream
        yield text("…never finished");
        yield done();
      },
    ]);
    const { result } = await run(baseInput(), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: () => aborted,
    });
    expect(result.reason).toBe("CANCELLED");
    expect(result.note).toContain("everything already recorded stays");
  });

  it("CANCELLATION between steps: an abort before a tool call stops the run", async () => {
    let callCount = 0;
    const model = fakeModel([
      () => [call("c1", "a.tool", {}), done("TOOL_CALLS")],
      () => [text("done"), done()],
    ]);
    let aborted = false;
    const tools = {
      runtime: {
        async executeCall(_input: { call: { id: string; name: string; input: unknown } }) {
          callCount += 1;
          return { status: "OK", output: {} };
        },
      } as AgentToolRuntimePort,
    };
    // Abort after the first tool executes: the loop stops before turn 2.
    const { result } = await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: {
        async executeCall(input) {
          const out = await tools.runtime.executeCall(input);
          aborted = true;
          return out;
        },
      },
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: () => aborted,
    });
    expect(result.reason).toBe("CANCELLED");
    expect(callCount).toBe(1);
  });

  it("MAX-TURN CUTOFF: a model that keeps calling tools is stopped at the turn budget", async () => {
    const spin = (): TurnScript => () => [call(`c${Math.random()}`, "a.tool", {}), done("TOOL_CALLS")];
    const model = fakeModel([spin(), spin(), spin(), spin()]);
    const { result } = await run(
      baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }], budgets: { maxModelTurns: 2 } }),
      { model: model.port, tools: fakeTools().runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("MAX_TURNS");
    expect(result.turns).toBe(2);
    expect(result.note).toContain("model-turn budget");
  });

  it("MAX TOOL STEPS: the tool-step budget stops the loop honestly", async () => {
    const spin = (i: number): TurnScript => () => [call(`c${i}`, "a.tool", {}), done("TOOL_CALLS")];
    const model = fakeModel([spin(1), spin(2), spin(3)]);
    const { result } = await run(
      baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }], budgets: { maxToolSteps: 1 } }),
      { model: model.port, tools: fakeTools().runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("MAX_TOOL_STEPS");
    expect(result.toolSteps).toBe(1);
  });

  it("RESULT BYTE BUDGET: oversized tool results stop the loop with partials kept", async () => {
    const model = fakeModel([() => [call("c1", "a.tool", {}), done("TOOL_CALLS")]]);
    const big = "x".repeat(5000);
    const tools = fakeTools({ c1: { status: "OK", output: big } });
    const { result } = await run(
      baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }], budgets: { totalToolResultBytes: 1024 } }),
      { model: model.port, tools: tools.runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("RESULT_BUDGET_EXCEEDED");
  });

  it("HISTORY BYTE BUDGET: the oldest history is trimmed, the newest user text is kept", async () => {
    const huge = "y".repeat(4000);
    const model = fakeModel([() => [text("ok"), done()]]);
    // A realistic alternating history (user asks, model answers, …).
    const history = Array.from({ length: 12 }, (_, index) =>
      index % 2 === 0
        ? { role: "user" as const, content: `${huge} #${index}` }
        : { role: "assistant" as const, content: `${huge} answer #${index}` },
    );
    await run(baseInput({ history, budgets: { historyMaxBytes: 2000 } }), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    const messages = model.requests[0]!.messages;
    // The newest user text (the live question) is always present.
    expect(messages.at(-1)).toMatchObject({ role: "user", content: "what can this connection do?" });
    // The oldest oversized messages were trimmed (12 + 1 → far fewer).
    expect(messages.length).toBeLessThan(8);
  });
});

describe("the §13.4 gates — malformed args, invalid names, duplicate ids, loops", () => {
  it("MALFORMED ARGS: a validation-error result reaches the model as the tool message", async () => {
    const model = fakeModel([
      () => [call("c1", "stripe.describe_operation", { operationId: "" }), done("TOOL_CALLS")],
      () => [text("retrying with a valid id"), done()],
    ]);
    const tools = fakeTools({ c1: { status: "ERROR", error: { code: "VALIDATION", message: "stripe.describe_operation.operationId must be a non-empty string", retryable: true } } });
    const { result } = await run(baseInput({ tools: [{ name: "stripe.describe_operation", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    const fedBack = model.requests[1]!.messages.at(-1);
    expect(fedBack?.role).toBe("tool");
    expect(String(fedBack?.content)).toContain("must be a non-empty string");
  });

  it("INVALID TOOL NAME: an unknown tool is a typed error result, never an execution", async () => {
    const model = fakeModel([
      () => [call("c1", "stripe.request", { url: "https://evil.example" }), done("TOOL_CALLS")],
      () => [text("that tool does not exist here"), done()],
    ]);
    const tools = fakeTools({ c1: { status: "ERROR", error: { code: "UNKNOWN_TOOL", message: "tool 'stripe.request' is not in this task's registry", retryable: true } } });
    const { result, events } = await run(baseInput({ tools: [{ name: "stripe.search_operations", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(events.find((event) => event.kind === "TOOL_RESULT")).toMatchObject({ status: "ERROR" });
  });

  it("DUPLICATE TOOL-CALL IDS: the second use is refused typed; distinct ids continue", async () => {
    const model = fakeModel([
      () => [call("dup", "a.tool", {}), call("dup", "a.tool", {}), done("TOOL_CALLS")],
      () => [text("understood"), done()],
    ]);
    const tools = fakeTools();
    const { result, events } = await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    const duplicates = events.filter((event) => event.kind === "TOOL_RESULT" && event.summary.includes("already used"));
    expect(duplicates).toHaveLength(1);
    // The first call executed exactly once.
    expect(tools.executed).toHaveLength(1);
  });

  it("A CALL WITH NO ID is refused typed (protocol violation)", async () => {
    const model = fakeModel([
      () => [call("", "a.tool", {}), done("TOOL_CALLS")],
      () => [text("ok"), done()],
    ]);
    const { result, events } = await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(events.some((event) => event.kind === "TOOL_RESULT" && event.summary.includes("no call id"))).toBe(true);
  });

  it("LOOP DETECTION: repeated identical tool calls stop the loop", async () => {
    const model = fakeModel([
      () => [call("c1", "a.tool", { q: "same" }), done("TOOL_CALLS")],
      () => [call("c2", "a.tool", { q: "same" }), done("TOOL_CALLS")],
      () => [call("c3", "a.tool", { q: "same" }), done("TOOL_CALLS")],
    ]);
    const { result } = await run(
      baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }], budgets: { maxIdenticalToolCalls: 1 } }),
      { model: model.port, tools: fakeTools().runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("TOOL_LOOP_DETECTED");
    expect(result.note).toContain("identical tool call");
  });

  it("DISTINCT arguments are NOT loop detection (a changed call continues)", async () => {
    const model = fakeModel([
      () => [call("c1", "a.tool", { q: "one" }), done("TOOL_CALLS")],
      () => [call("c2", "a.tool", { q: "two" }), done("TOOL_CALLS")],
      () => [text("different args, fine"), done()],
    ]);
    const { result } = await run(
      baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }], budgets: { maxIdenticalToolCalls: 1 } }),
      { model: model.port, tools: fakeTools().runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("ANSWERED");
    expect(result.toolSteps).toBe(2);
  });
});

describe("the honesty laws (D8/D11)", () => {
  it("NO SILENT SUBSTITUTION: every turn carries the exact persisted selection", async () => {
    const model = fakeModel([
      () => [call("c1", "a.tool", {}), done("TOOL_CALLS")],
      () => [text("done"), done()],
    ]);
    await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(model.requests).toHaveLength(2);
    for (const request of model.requests) {
      expect(request.selection).toEqual(SELECTION);
    }
  });

  it("A model that cannot do tool calling is reported honestly, never worked around", async () => {
    const note = "This model has no tool-calling capability.";
    const model = fakeModel([], { supportsToolCalling: false, supportsStreaming: true, note });
    const { result } = await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("TOOL_CALLING_UNSUPPORTED");
    expect(result.note).toBe(note);
    expect(result.turns).toBe(0);
  });

  it("A NON-RETRYABLE provider failure surfaces honestly", async () => {
    const model = fakeModel([
      () => {
        throw new AgentModelConversationError("PROVIDER_FAILURE", "provider 500", false);
      },
    ]);
    const { result } = await run(baseInput(), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("PROVIDER_FAILURE");
    expect(result.note).toContain("provider 500");
  });

  it("A RETRYABLE provider failure is retried exactly ONCE (the turn budget is not double-spent)", async () => {
    let attempts = 0;
    const scripts: TurnScript[] = [() => [text("good after retry"), done()]];
    const requests: RecordedRequest[] = [];
    const port: AgentModelConversationPort = {
      tier: "HOST_BRIDGED",
      async describeModelSupport() {
        return { supportsToolCalling: true, supportsStreaming: true };
      },
      async *startTurn(request) {
        requests.push({ turnId: request.turnId, selection: request.selection, messages: [...request.messages], tools: [...request.tools], toolChoice: request.toolChoice });
        attempts += 1;
        if (attempts === 1) {
          throw new AgentModelConversationError("PROVIDER_FAILURE", "transient 503", true);
        }
        for (const chunk of scripts[0]!(request)) {
          yield chunk;
        }
      },
    };
    const { result } = await run(baseInput(), {
      model: port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("ANSWERED");
    expect(attempts).toBe(2);
    expect(result.turns).toBe(1); // the retried turn does not consume the budget twice
  });

  it("A SECOND retryable failure stops the loop (one retry, not a spin)", async () => {
    const port: AgentModelConversationPort = {
      tier: "HOST_BRIDGED",
      async describeModelSupport() {
        return { supportsToolCalling: true, supportsStreaming: true };
      },
      // A turn whose stream rejects on the first pull (the provider 503s
      // again) — an explicit async iterable, not a generator: the
      // rejection surfaces through the engine's for-await exactly like a
      // mid-stream provider failure.
      startTurn: () => ({
        [Symbol.asyncIterator]: () => ({
          next: (): Promise<IteratorResult<AgentModelTurnChunk>> =>
            Promise.reject(new AgentModelConversationError("PROVIDER_FAILURE", "still 503", true)),
        }),
      }),
    };
    const { result } = await run(baseInput(), {
      model: port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("PROVIDER_FAILURE");
  });

  it("A stream without TURN_COMPLETED is a protocol violation — never guessed", async () => {
    const model = fakeModel([() => [text("incomplete")]]);
    const { result } = await run(baseInput(), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("STREAM_PROTOCOL_VIOLATION");
    expect(result.note).toContain("protocol violation");
  });

  it("A selection without a provider or model fails closed (no default model)", async () => {
    const model = fakeModel([() => [text("never"), done()]]);
    const { result } = await run(baseInput({ selection: { providerId: " ", modelId: "glm-5.2", reasoningLevel: "high" } }), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("PROVIDER_FAILURE");
    expect(result.note).toContain("no usable model selection");
    expect(model.requests).toHaveLength(0);
  });

  it("UNKNOWN tool results stay UNKNOWN all the way to the events", async () => {
    const model = fakeModel([
      () => [call("c1", "stripe.resources.payments.list", {}), done("TOOL_CALLS")],
      () => [text("the read may or may not have happened"), done()],
    ]);
    const tools = fakeTools({ c1: { status: "UNKNOWN", error: { code: "TIMEOUT_UNKNOWN", message: "timeout after possible dispatch", retryable: false } } });
    const { events } = await run(baseInput({ tools: [{ name: "stripe.resources.payments.list", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(events.find((event) => event.kind === "TOOL_RESULT")).toMatchObject({ status: "UNKNOWN" });
  });
});

describe("the two-phase pause (D10)", () => {
  const action: StripePreparedActionPin = {
    preparedActionId: "pa-1",
    operationId: "PostProducts",
    catalogueRelease: "v2596",
    accountContext: {
      connectionId: "conn-1",
      stripeAccountId: "acct_test_1",
      accountModel: "OWN_ACCOUNT_RESTRICTED_KEY",
      environment: "SANDBOX",
    },
    parameters: [{ name: "name", value: "Annual Membership", location: "body" }],
    digest: "digest-abc",
    effectClass: "STRIPE_CONFIGURATION_WRITE",
    approvalTier: "CONFIRM",
    confirmationInputs: ["Confirm creating product 'Annual Membership' on acct_test_1 (SANDBOX)"],
    idempotencyKeyRef: "idem-ref-1",
    readBackOperationId: "GetProducts",
    expiresAt: "2026-10-31T13:00:00Z",
    createdBy: "model_proposal",
  };

  it("a prepared action PAUSES the loop; the call stays UNANSWERED for the human decision", async () => {
    const model = fakeModel([
      () => [text("I will prepare that."), call("c9", "stripe.prepare_action", { operationId: "PostProducts", parameters: [] }), done("TOOL_CALLS")],
      () => [text("never invoked before the decision"), done()],
    ]);
    const tools = fakeTools({ c9: { status: "OK", output: { preparedActionId: "pa-1" }, pendingPreparedAction: action } });
    const { result, events } = await run(baseInput({ tools: [{ name: "stripe.prepare_action", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: tools.runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(result.reason).toBe("AWAITING_USER_CONFIRMATION");
    expect(result.pendingPreparedAction).toEqual(action);
    expect(result.note).toContain("Nothing executes until you confirm");
    // The prepare call was recorded — but NO tool result: the human
    // decision owns that slot.
    expect(events.some((event) => event.kind === "TOOL_CALL" && event.callId === "c9")).toBe(true);
    expect(events.some((event) => event.kind === "TOOL_RESULT" && event.callId === "c9")).toBe(false);
    expect(events.at(-1)).toMatchObject({ kind: "PREPARED_ACTION_PENDING", action });
    // The model was NOT invoked again after the pause.
    expect(model.requests).toHaveLength(1);
  });

  it("continuation results ride as tool messages after the pause", async () => {
    const model = fakeModel([() => [text("executed and read back"), done()]]);
    const { result } = await run(
      baseInput({
        newUserText: undefined,
        pendingToolResults: [{ callId: "c9", toolName: "stripe.prepare_action", status: "OK", resultText: "executed" }],
        tools: [],
      }),
      { model: model.port, tools: fakeTools().runtime, now: NOW, timeoutAfter: neverTimesOut, isAborted: notAborted },
    );
    expect(result.reason).toBe("ANSWERED");
    expect(model.requests[0]!.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c9", content: "executed" });
  });
});

describe("the persistence discipline", () => {
  it("TEXT_DELTA is transient: only the assembled ASSISTANT_TEXT is emitted", async () => {
    const model = fakeModel([() => [text("Hel"), text("lo "), text("world"), done()]]);
    const { events } = await run(baseInput(), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    expect(events).toEqual([{ kind: "ASSISTANT_TEXT", text: "Hello world" }]);
  });

  it("the tool-call event carries a bounded argument echo, never the full payload", async () => {
    const model = fakeModel([() => [call("c1", "a.tool", { blob: "z".repeat(2000) }), done("TOOL_CALLS")], () => [text("ok"), done()]]);
    const { events } = await run(baseInput({ tools: [{ name: "a.tool", description: "d", inputSchema: {} }] }), {
      model: model.port,
      tools: fakeTools().runtime,
      now: NOW,
      timeoutAfter: neverTimesOut,
      isAborted: notAborted,
    });
    const toolCall = events.find((event) => event.kind === "TOOL_CALL")!;
    expect(toolCall.kind === "TOOL_CALL" && toolCall.argsEcho.length).toBeLessThanOrEqual(301);
  });
});
