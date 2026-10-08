# PaySwap 3.0 Authority Model

ZCode application permission and PaySwap financial authorization are different authorities.

## Platform authority

ZCode-derived services own session lifecycle, transport, runtime execution, model/tool selection, platform permissions, window/desktop lifecycle, plugin lifecycle and client/server connectivity.

## PaySwap authorities

Financial Protocol Authority owns financial truth and admissible external effects.

Trust and Authorization Authority owns delegated power and approval artifacts.

Capability and Network Authority owns capability definitions/certification and connection state, not account-level authorization.

Policy and Governance Authority owns hard constraints.

Intelligence and Learning Authority owns proposals, discovery, simulation and promotion proposals.

## Consequential boundary

Agent / UI / Plugin / MCP / Workflow -> Economic Proposal or Intent -> Eligibility -> Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation / Finality -> Reconciliation / Evidence.

The direction of authority is one-way. External systems provide observations/provider state; they cannot directly declare PaySwap financial truth.