# n8n execution trace mapping

## Mapping used by the spike

Each workflow execution becomes a lineage graph. The root identifies the n8n workflow ID and execution ID. Ordinary executed nodes become lineage steps. Each actual model call becomes a DUT attached to its corresponding step. This preserves workflow context and model-call input and output in the same graph.

The current recorder supports the supplied issue-triage workflow's single text model call. It reads the executed **Triage model** input messages and returned generation from n8n's live execution data. It reads the fixed system prompt, model options, and tool definition from the workflow parameters and stores them as an AgentConfig. It registers the workflow's triage agent and records the config CID with the DUT.

| n8n data | AITS field or record |
| --- | --- |
| Workflow ID and execution ID | Root `step_id`, formatted as `n8n:<workflowId>:<executionId>` |
| Workflow name | Root transformation `workflow_execution:<name>` |
| Manual Trigger start time | Root `occurred_at` |
| Prepare issue | `prepare-issue` lineage step |
| Triage agent entry | `triage-agent` lineage step |
| Triage model input messages | DUT `input_context` |
| Actual returned model text | DUT `agent_output` |
| Fixed prompt, model settings, declared tool | AgentConfig and its `config_cid` |
| Model call within this execution | DUT `span_id`, ending in `:triage-model:0` |
| Synthetic GitHub issue key | DUT `business_object_keys` |
| Check proposal result | Terminal transformation `policy-v1:<decision>:<reason>` |
| Executed node start times | Step `occurred_at` |

The recorder returns the config, DUT, root, and decision CIDs plus n8n workflow and execution IDs, `verified`, and the run-specific `dashboardUrl`. It verifies the terminal lineage through `GET /verify/<decisionCid>/`. The dashboard separately runs the full ledger audit.

## Current trace contract

The custom node uses n8n's `runExecutionData.resultData.runData`, including the model sub-node's `inputOverride` and `data.ai_languageModel` generation. This integration depends on n8n internals. The deployed check used n8n **2.47.5**. Recheck this contract when changing n8n versions.

The recorder requires exactly one execution of each expected node, one returned text generation, a fixed model and system prompt, and zero executed tool calls. It rejects executions outside those conditions. The configuration records the declared tool definition. An executed tool would need its own captured call record and lineage step before this recorder can support it.

The execution ID identifies the workflow run. This spike captures the ordered steps observed in that run. LangGraph thread IDs, checkpoints, resumptions, and multi-call retries require additional trace metadata and mapping work. The current recorder does not capture those concepts.

## Verified example

On November 17, 2026, workflow `UXmu2AR3S1i4ONtx`, execution **11**, recorded a root,
four subsequent steps, and one model DUT. The terminal verification returned
`valid: true`. The dashboard's full audit passed for **39 records and 44 ledger entries**.
The [setup guide](your-first-n8n-ledger.md) explains how to repeat the check and retrieve
the recorded CIDs from the workflow output.
