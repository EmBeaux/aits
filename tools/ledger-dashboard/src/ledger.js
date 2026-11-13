export const isCid = (value) => /^[a-f0-9]{64}$/i.test(value ?? '');

const paths = {
  roots: () => '/lineage/?limit=100',
  root: (id) => `/lineage/${id}/`,
  dut: (id) => `/duts/${id}/`,
  verify: (id) => `/verify/${id}/`,
};

export async function readLedger(kind, id, key, signal) {
  const response = await fetch(`/api/aits${paths[kind](id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  if (response.status === 401) throw new Error('AITS rejected the service key. Check it and reconnect.');
  if (response.status === 404) throw new Error('AITS could not find this record. Check the CID and record type.');
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('AITS is unavailable. Check that your local AITS server is running and ready.');
  }
  return response.json();
}

export function runName(stepId) {
  const run = /^n8n:(.+):([^:]+)$/.exec(stepId ?? '');
  return run ? `n8n execution #${run[2]}` : (stepId || 'Lineage run');
}

export function stepInfo(node) {
  if (!node) return { title: 'Lineage step', kind: 'Step', color: 'gray' };
  const policy = /^policy-v\d+:([^:]+)(?::(.+))?$/.exec(node.transformation);
  if (policy) return { title: 'Check proposal', kind: 'Decision', color: 'green', outcome: policy[1], reason: policy[2] };
  const titles = {
    'prepare-issue': 'Prepare issue',
    'triage-agent': 'Triage agent',
    'triage-model': 'Triage model',
  };
  if (!node.prev.length) return { title: 'Workflow started', kind: 'Root', color: 'blue' };
  if (node.dut) return { title: titles[node.step_id] || node.step_id, kind: 'Model call', color: 'violet' };
  return { title: titles[node.step_id] || node.step_id, kind: 'Workflow step', color: 'gray' };
}

export function orderSteps(graph) {
  // Follow the recorded predecessor links, with event time as the tie breaker for parallel steps.
  const byId = new Map(graph.nodes.map((node) => [node.cid, node]));
  const ordered = [];
  const seen = new Set();
  function visit(node) {
    if (seen.has(node.cid)) return;
    seen.add(node.cid);
    for (const parent of node.prev) {
      if (byId.has(parent)) visit(byId.get(parent));
    }
    ordered.push(node);
  }
  for (const node of graph.nodes) visit(node);
  return ordered;
}

export function readRoute(hash = location.hash) {
  const [type, id, stepType, stepId, dutType, dutId] = hash.slice(1).split('/');
  if (type === 'root' && isCid(id)) {
    const step = stepType === 'step' && isCid(stepId) ? stepId.toLowerCase() : '';
    return { root: id.toLowerCase(), step, dut: step && dutType === 'dut' && isCid(dutId) ? dutId.toLowerCase() : '' };
  }
  return type === 'dut' && isCid(id) ? { dut: id.toLowerCase() } : {};
}

export function formatDate(value, options) {
  const date = new Date(value);
  return value && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(undefined, options).format(date) : '—';
}

export const shortCid = (value) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—';
