export const isCid = (value) => /^[a-f0-9]{64}$/i.test(value ?? '');
export const shortCid = (value) => `${value.slice(0, 8)}…${value.slice(-6)}`;

const apiBase = import.meta.env.DEV ? '/api/aits' : __AITS_API_URL__.replace(/\/$/, '');

const paths = {
  runs: (query) => `/lineage/runs/?${query}`,
  root: (id) => `/lineage/${id}/?include_run=true`,
  node: (id) => `/lineage/nodes/${id}/`,
  traceback: (id) => `/lineage/nodes/${id}/traceback/`,
  dut: (id) => `/duts/${id}/`,
  config: (id) => `/configs/${id}/`,
  commits: (id) => `/commits/?cid=${id}&limit=1`,
  verify: (id) => `/verify/${id}/`,
  audit: () => '/audit/',
};

export const readLedger = async (kind, id, key, signal) => {
  let response;
  try {
    response = await fetch(`${apiBase}${paths[kind](id)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      'Could not reach AITS. Check the API URL, server, and allowed browser origin.',
      { cause: error },
    );
  }
  if (response.status === 401)
    throw new Error('AITS rejected the service key. Check it and reconnect.');
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (
    kind === 'runs' &&
    (response.status === 404 || data?.detail?.includes?.('root_cid is not a 64-character'))
  ) {
    throw new Error(
      'This AITS server does not support run search. Restart AITS from this checkout.',
    );
  }
  if (response.status === 404)
    throw new Error('AITS could not find this record. Check the ID and record type.');
  if (response.ok && data !== null) return data;
  if (response.status < 500 && typeof data?.detail === 'string') throw new Error(data.detail);
  throw new Error('AITS could not load this data. Check the local server and try again.');
};

export const initialFilters = {
  q: '',
  range: 'all',
  from: '',
  until: '',
  sort: 'started',
  workflow: '',
  businessKey: '',
  decision: '',
};

export const hasRunFilters = ({ q, range, workflow, businessKey, decision }) => {
  return Boolean(range !== 'all' || q.trim() || workflow.trim() || businessKey.trim() || decision);
};

export const runSearch = (filters, now) => {
  const { q, range, from, until, sort, workflow, businessKey, decision } = filters;
  const params = new URLSearchParams({ sort });
  for (const [key, value] of [
    ['q', q],
    ['workflow', workflow],
    ['business_key', businessKey],
  ]) {
    if (value.trim()) params.set(key, value.trim());
  }
  if (decision === 'missing' || decision === 'recorded') {
    params.set('has_decision', String(decision === 'recorded'));
  } else if (decision) {
    params.set('decision', decision);
  }

  let start;
  let end;
  if (range === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (range === 'week') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    end = new Date(now);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  } else if (range === 'day') {
    start = new Date(now - 24 * 60 * 60 * 1000);
    end = new Date(now + 1);
  } else if (range === 'custom') {
    start = from ? new Date(from) : null;
    end = until ? new Date(until) : null;
  }
  if ((start && !Number.isFinite(+start)) || (end && !Number.isFinite(+end))) {
    return { error: 'Enter a valid date and time.' };
  }
  if (start && end && start >= end) return { error: 'Start must be before the end of the range.' };
  if (start) params.set('started_from', start.toISOString());
  if (end) params.set('started_before', end.toISOString());
  return { query: params.toString() };
};

export const runLabel = (run) => {
  if (run.workflow_name) return run.workflow_name;
  if (run.workflow_id) return `Workflow ${run.workflow_id}`;
  if (run.root_step_id && !isCid(run.root_step_id)) return run.root_step_id;
  return `${run.actor_id || 'Ledger'} run`;
};

export const executionLabel = (run) =>
  run.execution_id ? `n8n run #${run.execution_id}` : run.actor_id;

export const decisionLabel = (outcome) => {
  if (outcome === 'allow') return 'Allowed';
  if (outcome === 'review') return 'Needs review';
  return humanize(outcome);
};

export const decisionReason = (reason) => {
  const descriptions = {
    reproduction_present: 'The issue includes steps to reproduce the problem.',
    needs_maintainer_review: 'A maintainer needs to review this proposal.',
    invalid_json: 'The model output could not be read as JSON.',
  };
  if (!reason) return 'No reason recorded.';
  return Object.hasOwn(descriptions, reason) ? descriptions[reason] : humanize(reason);
};

export const decisionColor = (outcome) => {
  if (outcome === 'allow') return 'teal';
  if (outcome === 'review') return 'orange';
  return 'gray';
};

const humanize = (value) => {
  return (value ?? '').replace(/[_-]+/g, ' ').replace(/^./, (first) => first.toUpperCase());
};

export const stepInfo = (node, decision) => {
  if (!node.prev.length) return { title: 'Run started', kind: 'Run start', color: 'blue' };
  const title = humanize(node.step_id) || humanize(node.transformation) || 'Recorded step';
  if (decision) return { title, kind: 'Decision', color: 'green' };
  if (node.dut) return { title, kind: callLabel(node), color: 'violet' };
  return { title, kind: 'Workflow step', color: 'gray' };
};

export const callLabel = (node) => {
  if (node?.transformation?.startsWith('tool:')) return 'Tool call';
  if (node?.transformation === 'chat_model_call') return 'Model call';
  return 'Recorded call';
};

export const orderSteps = (graph) => {
  // Visit predecessors first. Parallel events are already sorted by event time in the API.
  const byId = new Map(graph.nodes.map((node) => [node.cid, node]));
  const ordered = [];
  const seen = new Set();
  const visit = (node) => {
    if (seen.has(node.cid)) return;
    seen.add(node.cid);
    for (const parent of node.prev) {
      if (byId.has(parent)) visit(byId.get(parent));
    }
    ordered.push(node);
  };
  for (const node of graph.nodes) visit(node);
  return ordered;
};

export const upstreamSteps = (graph, stepCid) => {
  const byId = new Map(graph.nodes.map((node) => [node.cid, node]));
  const seen = new Set();
  const stack = [stepCid];
  while (stack.length) {
    const cid = stack.pop();
    const node = byId.get(cid);
    if (!node || seen.has(cid)) continue;
    seen.add(cid);
    stack.push(...node.prev);
  }
  return seen;
};

export const rootRoute = (root, step, dut, trace) => {
  const path = `#root/${root}${step ? `/step/${step}${dut ? `/dut/${dut}` : ''}` : ''}`;
  if (!trace) return path;
  return `${path}?trace=${trace}${dut && !step ? `&call=${dut}` : ''}`;
};
export const stepRoute = (cid) => `#step/${cid}`;
export const dutRoute = (cid) => `#dut/${cid}`;

export const readRoute = (hash = location.hash) => {
  if (hash === '#audit') return { audit: true };
  const [path, query] = hash.slice(1).toLowerCase().split('?');
  const [type, id, stepType, stepId, dutType, dutId] = path.split('/');
  if (!isCid(id)) return {};
  if (type === 'root') {
    const step = stepType === 'step' && isCid(stepId) ? stepId : '';
    const params = new URLSearchParams(query);
    const trace = params.get('trace');
    const call = params.get('call');
    const dut = step && dutType === 'dut' && isCid(dutId) ? dutId : '';
    return {
      root: id,
      step,
      dut,
      trace: isCid(trace) ? trace : '',
      traceDut: !step && isCid(trace) && isCid(call) ? call : '',
    };
  }
  if (type === 'step') return { lookupStep: id };
  return type === 'dut' ? { dut: id } : {};
};

export const exactDate = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
};
export const runDate = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
};
export const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

export const formatDate = (value, options = exactDate) => {
  const date = new Date(value);
  return value && !Number.isNaN(+date)
    ? new Intl.DateTimeFormat(undefined, options).format(date)
    : 'Unavailable';
};

export const elapsedTime = (value, startMs) => {
  const seconds = Math.floor((Date.parse(value) - startMs) / 1000);
  if (seconds < 1) return '+0s';
  if (seconds < 60) return `+${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `+${minutes}m ${seconds % 60}s`;
  return `+${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export const findingLabel = (property) => {
  const labels = {
    cid_mismatch: 'Fingerprint mismatch',
    dangling_link: 'Linked record is missing',
    malformed_node: 'Invalid record structure',
    canonical_encoding_error: 'Record content could not be hashed',
    unlogged_node: 'Record has no ledger entry',
    unobserved_link: 'Linked record has no ledger entry',
    temporal_order: 'Linked record was recorded later',
    missing_node: 'Ledger entry points to a missing record',
    chain_broken: 'Broken link in the ledger log',
    entry_hash_mismatch: 'Ledger entry fingerprint mismatch',
  };
  return Object.hasOwn(labels, property)
    ? labels[property]
    : humanize(property) || 'Unknown verification error';
};
