const { readFile } = require('node:fs/promises');

const pendingAgents = new Map();

async function ledgerClient(context) {
  let credentials;
  if (context.getNode().credentials?.aitsApi) {
    credentials = await context.getCredentials('aitsApi');
  } else if (process.env.AITS_URL && process.env.AITS_KEY_FILE) {
    credentials = {
      serverUrl: process.env.AITS_URL,
      serviceKey: await readFile(process.env.AITS_KEY_FILE, 'utf8'),
    };
  }
  if (!credentials?.serverUrl || !credentials.serviceKey?.trim()) {
    throw new Error('Select an AITS API credential with a server URL and service key.');
  }
  const url = new URL(credentials.serverUrl);
  const key = credentials.serviceKey.trim();
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(new URL(path, url), {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`AITS ${method} ${path} returned HTTP ${response.status}.`);
    }
    return response.json();
  };
  return { request, origin: url.origin };
}

async function findOrRegisterAgent(request, origin, name) {
  // The lab runs one n8n process. Share an in-flight registration across its runs.
  const registrationKey = `${origin}/${name}`;
  if (pendingAgents.has(registrationKey)) return pendingAgents.get(registrationKey);
  const registration = (async () => {
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const agents = await request(`/agents/?limit=${pageSize}&offset=${offset}`);
      const agent = agents.find((entry) => entry.name === name);
      if (agent) return agent;
      if (agents.length < pageSize) return request('/agents/', 'POST', { name });
    }
  })();
  pendingAgents.set(registrationKey, registration);
  try {
    return await registration;
  } finally {
    pendingAgents.delete(registrationKey);
  }
}

function eventTime(runData, name) {
  const runs = runData[name];
  if (runs?.length !== 1 || !Number.isFinite(runs[0].startTime)) {
    throw new Error(`Expected one executed run of ${name}. Run the full workflow from Manual Trigger.`);
  }
  return new Date(runs[0].startTime).toISOString();
}

class AitsLedger {
  description = {
    displayName: 'Record AITS Ledger',
    name: 'aitsLedger',
    group: ['output'],
    version: 1,
    description: 'Record and verify the issue-triage model call and decision in AITS',
    defaults: { name: 'Record AITS Ledger' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'aitsApi', required: false }],
    properties: [{
      displayName: 'Dashboard URL',
      name: 'dashboardUrl',
      type: 'string',
      default: 'http://localhost:5678/webhook/ledger',
      description: 'Production webhook URL for the Ledger Dashboard workflow',
    }],
  };

  async execute() {
    const items = this.getInputData();
    const decision = items[0]?.json;
    if (items.length !== 1 || typeof decision?.issueKey !== 'string' ||
        typeof decision.reason !== 'string' || !['allow', 'review'].includes(decision.decision)) {
      throw new Error('Connect Record AITS Ledger to the issue-triage Check proposal node.');
    }

    // n8n 2.47.4's ExecuteContext retains the live run data, including AI sub-node traces.
    const runData = this.runExecutionData?.resultData?.runData ?? {};
    const triggerTime = eventTime(runData, 'Manual Trigger');
    const issueTime = eventTime(runData, 'Prepare issue');
    const agentTime = eventTime(runData, 'Triage agent');
    const modelTime = eventTime(runData, 'Triage model');
    const decisionTime = eventTime(runData, 'Check proposal');
    const trace = runData['Triage model'][0];
    const messages = trace.inputOverride?.ai_languageModel?.[0]?.[0]?.json?.messages;
    const generations = trace.data?.ai_languageModel?.[0]?.[0]?.json?.response?.generations;
    const output = generations?.[0]?.[0]?.text;
    if ((!Array.isArray(messages) && typeof messages !== 'string') ||
        generations?.length !== 1 || generations[0]?.length !== 1 || typeof output !== 'string' ||
        runData['Fixture lookup']?.length) {
      throw new Error('Expected one completed text model call and no tool calls in the lab workflow.');
    }

    const modelParameters = this.getWorkflowDataProxy(0).$('Triage model').params;
    const systemPrompt = this.getWorkflowDataProxy(0).$('Triage agent').params.options?.systemMessage;
    const model = modelParameters.model?.value ?? modelParameters.model;
    if (typeof systemPrompt !== 'string' || typeof model !== 'string' || model.startsWith('=')) {
      throw new Error('The lab requires a fixed model and system prompt.');
    }
    const llmConfig = { model };
    for (const setting of ['frequencyPenalty', 'maxTokens', 'presencePenalty', 'temperature', 'topP']) {
      const value = modelParameters.options?.[setting];
      if (typeof value === 'number') llmConfig[setting] = value;
    }
    const fixture = this.getWorkflowDataProxy(0).$('Fixture lookup').params;
    const config = {
      system_prompt: systemPrompt,
      llm_config: llmConfig,
      tools: [{ name: 'Fixture lookup', description: fixture.description, code: fixture.jsCode }],
    };

    const { id: workflowId, name: workflowName } = this.getWorkflow();
    const executionId = this.getExecutionId();
    const executionKey = `n8n:${workflowId}:${executionId}`;
    const { request, origin } = await ledgerClient(this);
    const agent = await findOrRegisterAgent(request, origin, `n8n:${workflowId}:triage-agent`);
    const { config_cid: configCid } = await request(`/agents/${agent.uuid}/config/`, 'PUT', config);
    const workflowLabel = workflowName?.trim().slice(0, 2000);
    const root = await request('/lineage/', 'POST', {
      actor_id: 'n8n', step_id: executionKey, occurred_at: triggerTime,
      transformation: workflowLabel ? `workflow_execution:${workflowLabel}` : 'workflow_execution',
    });
    const nodePath = `/lineage/${root.cid}/nodes/`;
    const addStep = (previous, stepId, transformation, occurredAt, dut) => request(nodePath, 'POST', {
      actor_id: 'n8n', step_id: stepId, transformation, occurred_at: occurredAt, prev: [previous], dut,
    });
    const issueStep = await addStep(root.cid, 'prepare-issue', 'edit_fields', issueTime);
    const agentStep = await addStep(issueStep.node.cid, 'triage-agent', 'ai_agent_entry', agentTime);
    const modelStep = await addStep(agentStep.node.cid, 'triage-model', 'chat_model_call', modelTime, {
      agent_uuid: agent.uuid,
      config_cid: configCid,
      span_id: `${executionKey}:triage-model:0`,
      input_context: typeof messages === 'string' ? messages : JSON.stringify(messages),
      agent_output: output,
      business_object_keys: [decision.issueKey],
    });
    const terminal = await addStep(modelStep.node.cid, 'check-proposal',
      `policy-v1:${decision.decision}:${decision.reason}`, decisionTime);
    const verification = await request(`/verify/${terminal.node.cid}/`);
    if (verification.valid !== true) {
      throw new Error(`AITS could not verify the decision lineage for ${terminal.node.cid}.`);
    }
    return [[{
      json: {
        ...decision,
        ledger: {
          workflowId, executionId, configCid, dutCid: modelStep.dut.cid,
          rootCid: root.cid, decisionCid: terminal.node.cid, verified: true,
          dashboardUrl: `${this.getNodeParameter('dashboardUrl', 0, 'http://localhost:5678/webhook/ledger').split('#')[0]}#root/${root.cid}`,
        },
      },
      pairedItem: { item: 0 },
    }]];
  }
}

module.exports = { AitsLedger };
