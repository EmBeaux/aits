const ids = ['a521f2bd', 'bb1d8006', 'cfde7a81', 'e4d1fa99'];
const titles = ['Issue triage · #1042', 'Issue triage · #1041', 'Issue triage · #1040', 'Issue triage · #1039'];
const makeCid = (prefix, number) => prefix + number.toString(16).padStart(56, '0');

const examples = ids.map((prefix, index) => {
  const run = 1042 - index;
  const day = index < 2 ? 12 : 11;
  const hour = 14 - index;
  const times = [5, 12, 16, 21, 23].map((second) => new Date(Date.UTC(2026, 10, day, hour, 32, second)).toISOString());
  const root = makeCid(prefix, 134 + index);
  const dutId = makeCid('7fb2412a', 1630 + index);
  const nodeIds = [root, ...[1, 2, 3, 4].map((value) => makeCid(prefix, 300 + value + index * 10))];
  const review = index === 1;
  const nodes = [
    [`n8n:issue-triage:${run}`, 'workflow_execution'],
    ['prepare-issue', 'edit_fields'],
    ['triage-agent', 'ai_agent_entry'],
    ['triage-model', 'chat_model_call'],
    ['check-proposal', review ? 'policy-v1:review:needs_maintainer_review' : 'policy-v1:allow:reproduction_present'],
  ].map(([step_id, transformation], position) => ({
    cid: nodeIds[position], root, actor_id: 'n8n', step_id, transformation,
    occurred_at: times[position], prev: position ? [nodeIds[position - 1]] : [],
    derived_from: [], dut: position === 3 ? dutId : null,
  }));
  if (index === 0) {
    const branchId = makeCid(prefix, 400);
    nodes.splice(4, 0, {
      cid: branchId, root, actor_id: 'n8n', step_id: 'Check issue context',
      transformation: 'check_issue_context', occurred_at: times[3], prev: [nodeIds[2]], derived_from: [], dut: null,
    });
    nodes.at(-1).prev.push(branchId);
  }
  const frontier = [nodeIds.at(-1)];
  return {
    summary: { root, nodes: nodes.length, started_at: times[0], last_occurred_at: times.at(-1), frontier, title: titles[index] },
    graph: { root, nodes, frontier },
    dut: {
      cid: dutId, span_id: `n8n:issue-triage:${run}:triage-model:0`, sequence: 0,
      business_object_keys: ['demo/widgets#42'], occurred_at: times[3],
      input_context: JSON.stringify([
        { role: 'system', content: 'Classify the GitHub issue. Return a label and reason.' },
        { role: 'user', content: 'Export hangs on empty projects. Reproduction: create an empty project, open Export, and select CSV.' },
      ]),
      agent_output: JSON.stringify({ label: review ? 'needs-repro' : 'bug', reason: review ? 'Maintainer review requested.' : 'The issue includes concrete reproduction steps.' }),
      agent_cid: makeCid('2604c405', 426), config_cid: makeCid('cc6d1abd', 592), artifact_cids: [],
    },
  };
});

export function readDemo(kind, id) {
  if (kind === 'roots') return examples.map((entry) => entry.summary);
  if (kind === 'verify') return { valid: examples.some((entry) => entry.dut.cid === id || entry.graph.nodes.some((node) => node.cid === id)) };
  const entry = examples.find((candidate) => kind === 'root' ? candidate.graph.root === id : candidate.dut.cid === id);
  if (!entry) throw new Error('This CID is outside the sample ledger. Connect to AITS to open your own records.');
  return kind === 'root' ? entry.graph : entry.dut;
}
