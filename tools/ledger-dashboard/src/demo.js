const makeCid = (prefix, number) => prefix + number.toString(16).padStart(56, '0');
const agentCid = makeCid('2604c405', 426);
const configCid = makeCid('cc6d1abd', 592);
const systemPrompt = 'Classify the GitHub issue. Return a label and reason.';

const sampleRun = ({ prefix, execution, workflow, name, issue, day, hour, review, source }) => {
  const times = [5, 12, 16, 21, 23].map((second) =>
    new Date(Date.UTC(2026, 10, day, hour, 32, second)).toISOString(),
  );
  const root = makeCid(prefix, 100);
  const dutId = makeCid('7fb2412a', execution);
  const nodeIds = [root, ...[1, 2, 3, 4].map((value) => makeCid(prefix, 100 + value))];
  const decision = review ? 'review' : 'allow';
  const reason = review ? 'needs_maintainer_review' : 'reproduction_present';
  const nodes = [
    [`n8n:${workflow}:${execution}`, `workflow_execution:${name}`],
    ['prepare-issue', 'edit_fields'],
    ['triage-agent', 'ai_agent_entry'],
    ['triage-model', 'chat_model_call'],
    ['check-proposal', `policy-v1:${decision}:${reason}`],
  ].map(([step_id, transformation], position) => ({
    cid: nodeIds[position],
    root,
    actor_id: 'n8n',
    step_id,
    transformation,
    occurred_at: times[position],
    prev: position ? [nodeIds[position - 1]] : [],
    derived_from: [],
    dut: position === 3 ? dutId : null,
  }));
  if (source) {
    const branchId = makeCid(prefix, 400);
    nodes.splice(4, 0, {
      cid: branchId,
      root,
      actor_id: 'n8n',
      step_id: 'Check issue context',
      transformation: 'check_issue_context',
      occurred_at: times[3],
      prev: [nodeIds[2]],
      derived_from: [source.graph.frontier[0]],
      dut: null,
    });
    nodes.at(-1).prev.push(branchId);
  }
  const frontier = [nodeIds.at(-1)];
  const run = {
    root,
    root_step_id: nodes[0].step_id,
    actor_id: 'n8n',
    workflow_id: workflow,
    workflow_name: name,
    execution_id: String(execution),
    started_at: times[0],
    last_occurred_at: times.at(-1),
    nodes: nodes.length,
    span_count: 1,
    business_keys: [issue],
    decisions: [{ cid: frontier[0], outcome: decision, reason }],
  };
  return {
    graph: { root, nodes, frontier, run },
    dut: {
      cid: dutId,
      span_id: `n8n:${workflow}:${execution}:triage-model:0`,
      sequence: 0,
      business_object_keys: [issue],
      occurred_at: times[3],
      input_context: JSON.stringify([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            'Export hangs on empty projects. Reproduction: ' +
            'create an empty project, open Export, and select CSV.',
        },
      ]),
      agent_output: JSON.stringify({
        label: review ? 'needs-repro' : 'bug',
        reason: review
          ? 'Maintainer review requested.'
          : 'The issue includes concrete reproduction steps.',
      }),
      agent_cid: agentCid,
      config_cid: configCid,
      artifact_cids: [],
    },
  };
};

const triage = { workflow: 'issue-triage', name: 'Issue triage' };
const source = sampleRun({
  ...triage,
  prefix: 'cfde7a81',
  execution: 1040,
  day: 11,
  hour: 12,
  issue: 'demo/widgets#42',
});
const examples = [
  sampleRun({
    ...triage,
    prefix: 'a521f2bd',
    execution: 1042,
    day: 12,
    hour: 14,
    issue: 'demo/widgets#42',
    source,
  }),
  sampleRun({
    ...triage,
    prefix: 'bb1d8006',
    execution: 1041,
    day: 12,
    hour: 13,
    issue: 'demo/widgets#56',
    review: true,
  }),
  source,
  sampleRun({
    workflow: 'support-triage',
    name: 'Support triage',
    prefix: 'e4d1fa99',
    execution: 1039,
    day: 11,
    hour: 11,
    issue: 'demo/support#8',
  }),
];

const graphs = new Map(examples.map(({ graph }) => [graph.root, graph]));
const nodes = new Map(examples.flatMap(({ graph }) => graph.nodes.map((node) => [node.cid, node])));
const duts = new Map(examples.map(({ dut }) => [dut.cid, dut]));
const config = {
  cid: configCid,
  system_prompt: systemPrompt,
  llm_config: { model: 'Sample triage model', temperature: 0 },
  tools: [],
  metadata: {},
};
const observations = new Map(
  [...nodes.values(), ...duts.values()]
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((item, index) => [
      item.cid,
      {
        seq: index + 3,
        recorded_at: new Date(Date.parse(item.occurred_at) + 47000).toISOString(),
        principal: 'sample-recorder',
      },
    ]),
);

const search = (query) => {
  const params = new URLSearchParams(query);
  const contains = (key, fields) => {
    const value = params.get(key)?.toLowerCase();
    return !value || fields.some((field) => field.toLowerCase().includes(value));
  };
  const lower = params.has('started_from') ? Date.parse(params.get('started_from')) : -Infinity;
  const upper = params.has('started_before') ? Date.parse(params.get('started_before')) : Infinity;
  const outcome = params.get('decision');
  const hasDecision = params.get('has_decision');
  const dateField = params.get('sort') === 'activity' ? 'last_occurred_at' : 'started_at';
  const limit = Number(params.get('limit') || 24);
  const matches = examples
    .map(({ graph }) => graph.run)
    .filter((run) => {
      const workflow = [run.workflow_id, run.workflow_name];
      const started = Date.parse(run.started_at);
      return (
        started >= lower &&
        started < upper &&
        contains('q', [
          run.root,
          run.root_step_id,
          run.actor_id,
          `n8n run #${run.execution_id}`,
          ...workflow,
          ...run.business_keys,
        ]) &&
        contains('workflow', workflow) &&
        contains('business_key', run.business_keys) &&
        (hasDecision === null || Boolean(run.decisions.length) === (hasDecision === 'true')) &&
        (!outcome || run.decisions.some((decision) => decision.outcome === outcome))
      );
    })
    .sort((a, b) => b[dateField].localeCompare(a[dateField]) || b.root.localeCompare(a.root));
  const cursor = (run) => `${run[dateField]}~${run.root}`;
  const offset = params.has('after')
    ? matches.findIndex((run) => cursor(run) === params.get('after')) + 1
    : 0;
  const runs = matches.slice(offset, offset + limit);
  return {
    runs,
    total: matches.length,
    next_cursor: offset + limit < matches.length ? cursor(runs.at(-1)) : null,
  };
};

const traceback = (id) => {
  const seen = new Set();
  const calls = new Set();
  const pending = [id];
  while (pending.length) {
    const cid = pending.pop();
    if (seen.has(cid)) continue;
    seen.add(cid);
    const step = nodes.get(cid);
    pending.push(...step.prev, ...step.derived_from);
    if (step.dut) calls.add(step.dut);
  }
  return [...calls]
    .map((cid) => {
      const dut = duts.get(cid);
      return {
        dut_cid: cid,
        occurred_at: dut.occurred_at,
        config_cid: dut.config_cid,
        agent_cid: dut.agent_cid,
        agent_output: dut.agent_output,
      };
    })
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
};

export const readDemo = (kind, id) => {
  if (kind === 'runs') return search(id);
  if (kind === 'verify') return { valid: nodes.has(id) || duts.has(id) || id === configCid };
  if (kind === 'commits') return observations.has(id) ? [observations.get(id)] : [];
  if (kind === 'traceback' && nodes.has(id)) return traceback(id);
  if (kind === 'audit')
    return {
      valid: true,
      nodes_checked: observations.size + 2,
      nodes_verified: observations.size + 2,
      commit_entries: observations.size + 2,
      failures: [],
    };
  if (kind === 'root' && graphs.has(id)) return graphs.get(id);
  if (kind === 'node' && nodes.has(id)) return nodes.get(id);
  if (kind === 'dut' && duts.has(id)) return duts.get(id);
  if (kind === 'config' && id === configCid) return config;
  throw new Error(
    'This record is outside the sample ledger. Connect to AITS to open your own records.',
  );
};
