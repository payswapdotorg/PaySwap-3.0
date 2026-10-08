# Migration Map: ZCode -> PaySwap 3.0

Upstream: `zai-org/ZCode`, pinned at `29628c9acdb81b703bbd4080c207a0e7ce5e276e`.

KEEP where product-neutral: RPC/transport; Web/Desktop/CLI substrate; session/event transport; model/provider selection; tool registry; MCP; plugins/skills; subagents/workflows; browser control; telemetry; artifacts; architecture/dependency tooling.

GENERALIZE coding-specific assumptions in workspace/session/task/workflow and command concepts so they can serve economic work without making coding the product identity.

PAYSWAP-ADAPT: command center, agent UI, permission/approval UX, marketplace, workflows, browser interaction and model selection.

DEPRECATE/REMOVE only after callers, dependencies, tests and runtime behavior are mapped and a Work Order/ADR records the decision.

Critical boundary: ZCode application permission is not PaySwap financial authorization.