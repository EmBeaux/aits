import React, { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActionIcon, Alert, Badge, Button, CopyButton, MantineProvider, Modal, PasswordInput,
  SegmentedControl, Skeleton, Tabs, TextInput, Tooltip, createTheme,
} from '@mantine/core';
import { useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import {
  IconAlertCircle, IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUpRight, IconBraces,
  IconCheck, IconChevronRight, IconClock, IconCode, IconCopy, IconDatabase, IconFingerprint,
  IconGitBranch, IconHash, IconLayersIntersect, IconListDetails, IconPlugConnected, IconRefresh,
  IconRoute, IconSearch, IconShieldCheck, IconTopologyStar3, IconX,
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { readDemo } from './demo.js';
import LineageBoard from './LineageBoard.jsx';
import { formatDate, isCid, orderSteps, readLedger, readRoute, runName, shortCid, stepInfo } from './ledger.js';
import './styles.css';

const theme = createTheme({
  fontFamily: 'Inter Variable, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono Variable, monospace',
  primaryColor: 'violet',
  defaultRadius: 'md',
});
const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
const longDate = { ...dateOptions, ...timeOptions, timeZoneName: 'short' };

function useRecord(client, kind, id, refresh = 0) {
  const [result, setResult] = useState(null);
  const enabled = kind === 'roots' || Boolean(id);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    Promise.resolve().then(() => client(kind, id, controller.signal)).then(
      (data) => { if (!controller.signal.aborted) setResult({ client, kind, id, refresh, data }); },
      (error) => { if (!controller.signal.aborted) setResult({ client, kind, id, refresh, error: error.message }); },
    );
    return () => controller.abort();
  }, [client, enabled, id, kind, refresh]);
  if (!enabled) return {};
  return result?.client === client && result.kind === kind && result.id === id && result.refresh === refresh
    ? result : { loading: true };
}

function CopyControl({ value, label = 'Copy CID' }) {
  return <CopyButton value={value}>{({ copied, copy }) => (
    <Tooltip label={copied ? 'Copied' : label}>
      <ActionIcon aria-label={copied ? 'Copied' : label} variant="subtle" color="gray" size="sm" onClick={copy}>
        {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
      </ActionIcon>
    </Tooltip>
  )}</CopyButton>;
}

function CidField({ label, value }) {
  return <div className="metadata-field">
    <span>{label}</span>
    <div className="cid-value"><code title={value}>{value}</code><CopyControl value={value} label={`Copy ${label.toLowerCase()}`} /></div>
  </div>;
}

function ErrorNotice({ message }) {
  return <Alert className="error-notice" variant="light" color="red" icon={<IconAlertCircle size={18} />}>
    {message}
  </Alert>;
}

function Verification({ client, cid, demo }) {
  const [requested, setRequested] = useState('');
  const verification = useRecord(client, 'verify', requested);
  if (verification.error) return <ErrorNotice message={verification.error} />;
  if (verification.data) return <Badge variant="light" color={verification.data.valid ? 'teal' : 'red'}
    leftSection={verification.data.valid ? <IconShieldCheck size={13} /> : <IconAlertCircle size={13} />}>
    {verification.data.valid ? (demo ? 'Sample verified' : 'Verified by AITS') : 'Verification failed'}
  </Badge>;
  return <Button variant="default" size="compact-sm" leftSection={<IconShieldCheck size={15} />}
    loading={verification.loading} onClick={() => setRequested(cid)}>Verify record</Button>;
}

function RunRail({ roots, active, names, filter, setFilter, open, refresh }) {
  const query = filter.trim().toLowerCase();
  const filtered = roots.data?.filter((root) => [root.root, root.title, names[root.root]].some((field) => field?.toLowerCase().includes(query)));
  return <aside className="rail" aria-label="Lineage runs">
    <div className="rail-heading"><div className="rail-title"><IconLayersIntersect size={18} /><h2>Lineage runs</h2></div>
      <Tooltip label="Refresh lineage">
        <ActionIcon variant="subtle" color="gray" aria-label="Refresh lineage" onClick={refresh}>
          <IconRefresh size={17} />
        </ActionIcon>
      </Tooltip>
    </div>
    <TextInput aria-label="Filter lineage runs" placeholder="Search runs or CIDs…" value={filter}
      onChange={(event) => setFilter(event.currentTarget.value)} leftSection={<IconSearch size={16} />}
      rightSection={filter && <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Clear search" onClick={() => setFilter('')}><IconX size={15} /></ActionIcon>}
      className="run-search" />
    <div className="rail-caption"><span>{query ? 'Search results' : 'Recent runs'}</span><span>{filtered?.length ?? '—'}</span></div>
    {roots.error && <ErrorNotice message={roots.error} />}
    {roots.loading && <div className="rail-loading">{[1, 2, 3].map((index) => <Skeleton key={index} h={74} radius="md" />)}</div>}
    <div className="run-list">
      {filtered?.map((root) => <button className="run-card" key={root.root} data-active={active === root.root}
        aria-current={active === root.root ? 'true' : undefined} onClick={() => open(root.root)}>
        <span className="run-icon"><IconRoute size={18} stroke={1.7} /></span>
        <span className="run-copy"><strong>{root.title || names[root.root] || shortCid(root.root)}</strong>
          <span>{formatDate(root.started_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
        <IconChevronRight className="run-arrow" size={15} />
        <span className="run-meta"><code>{shortCid(root.root)}</code><span>{root.nodes} {root.nodes === 1 ? 'step' : 'steps'}</span></span>
      </button>)}
    </div>
    {filtered?.length === 0 && <div className="rail-empty">{query ? 'No runs match your search.' : 'No lineage runs recorded yet.'}</div>}
  </aside>;
}

function Trace({ graph, nodes, selected, select }) {
  const endIds = new Set(graph.frontier);
  const nodesById = new Map(nodes.map((node) => [node.cid, node]));
  const root = nodesById.get(graph.root);
  const modelCount = nodes.filter((node) => node.dut).length;
  return <section className="trace-panel" aria-label="Execution trace">
    <div className="trace-hero">
      <div className="trace-hero-icon"><IconGitBranch size={25} stroke={1.6} /></div>
      <div className="trace-hero-heading"><h2>{runName(root?.step_id)}</h2>
        <span className="trace-date"><IconClock size={14} />{formatDate(root?.occurred_at, longDate)}</span>
        <span className="trace-root"><code>{shortCid(graph.root)}</code><CopyControl value={graph.root} label="Copy root CID" /></span>
      </div>
      <div className="trace-stats">
        <div><strong>{nodes.length}</strong><span>Steps</span></div>
        <div><strong>{modelCount}</strong><span>Model calls</span></div>
        <div><strong>{endIds.size}</strong><span>End points</span></div>
      </div>
    </div>
    <div className="timeline-heading"><h3>Execution timeline</h3><span><IconArrowDown size={13} /> Predecessor order</span></div>
    <ol className="timeline">
      {nodes.map((node, index) => {
        const info = stepInfo(node);
        const Icon = node.dut ? IconBraces : info.outcome ? IconShieldCheck : info.kind === 'Root' ? IconGitBranch : IconLayersIntersect;
        const parents = node.prev.map((cid) => nodesById.get(cid)).filter(Boolean);
        const adjacent = nodes[index - 1]?.cid;
        const hasBranch = parents.length > 1 || (parents.length === 1 && parents[0].cid !== adjacent);
        return <li className="timeline-row" key={node.cid} data-color={info.color}>
          <span className="timeline-marker"><Icon size={17} stroke={1.85} /></span>
          <button className="step-button" data-active={selected?.cid === node.cid}
            aria-current={selected?.cid === node.cid ? 'step' : undefined} onClick={() => select(node.cid)}>
            <span className="step-text"><strong>{info.title}</strong>
              <span>{info.kind}{hasBranch ? ` · From ${parents.map((parent) => stepInfo(parent).title).join(', ')}` : ''}</span>
            </span>
            <span className="step-trailing">
              {info.outcome && <Badge variant="light" size="sm" color={info.outcome === 'allow' ? 'teal' : 'orange'}>{info.outcome}</Badge>}
              {endIds.has(node.cid) && !info.outcome && <Badge variant="light" size="sm" color="gray">End point</Badge>}
              <time dateTime={node.occurred_at}>{formatDate(node.occurred_at, timeOptions)}</time>
              <IconChevronRight size={16} />
            </span>
          </button>
        </li>;
      })}
    </ol>
  </section>;
}

function StepInspector({ node, graph, client, demo, openDut, select }) {
  const info = stepInfo(node);
  const parents = node.prev.map((cid) => graph.nodes.find((entry) => entry.cid === cid)).filter(Boolean);
  return <aside className="inspector" id="step-details" aria-label="Step details">
    <div className="inspector-top"><span><IconListDetails size={16} /> Step details</span><Badge color={info.color} variant="light">{info.kind}</Badge></div>
    <div className="inspector-body">
      <h3>{info.title}</h3>
      <p className="event-time"><IconClock size={15} /> {formatDate(node.occurred_at, longDate)}</p>
      {info.outcome && <div className="decision-callout"><IconShieldCheck size={19} /><span><strong>{info.outcome}</strong>{info.reason && <span>{info.reason.replaceAll('_', ' ')}</span>}</span></div>}
      {node.dut && <button className="record-link" onClick={() => openDut(node.dut)}>
        <span className="record-icon"><IconBraces size={20} /></span>
        <span><strong>Open model record</strong><code>{shortCid(node.dut)}</code></span><IconArrowUpRight size={17} />
      </button>}
      <div className="metadata">
        <CidField label="Step CID" value={node.cid} />
        <div className="metadata-field"><span>Actor</span><code>{node.actor_id}</code></div>
        <div className="metadata-field"><span>Transformation</span><code>{node.transformation}</code></div>
        {parents.length > 0 && <div className="metadata-field"><span>Predecessors</span><div className="parent-links">
          {parents.map((parent) => <button key={parent.cid} onClick={() => select(parent.cid)}><IconArrowLeft size={13} />{stepInfo(parent).title}</button>)}
        </div></div>}
        {node.derived_from.length > 0 && <div className="metadata-field"><span>Derived from</span>{node.derived_from.map((cid) => <code key={cid}>{cid}</code>)}</div>}
      </div>
      <Verification key={node.cid} client={client} cid={node.cid} demo={demo} />
    </div>
  </aside>;
}

function formatPayload(value) {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function DutPanel({ data, client, demo, back }) {
  return <div className="detail-grid">
    <section className="trace-panel dut-panel">
      {back && <Button variant="subtle" color="gray" size="compact-sm" leftSection={<IconArrowLeft size={15} />} onClick={back}>Back to timeline</Button>}
      <div className="dut-heading"><span className="record-icon"><IconBraces size={24} /></span><div><h2>Model call</h2><code>{data.span_id}</code></div></div>
      <Tabs defaultValue="output" key={data.cid} className="dut-tabs">
        <Tabs.List>
          <Tabs.Tab value="output" leftSection={<IconArrowUpRight size={15} />}>Model output</Tabs.Tab>
          <Tabs.Tab value="input" leftSection={<IconCode size={15} />}>Input context</Tabs.Tab>
        </Tabs.List>
        {[['output', 'Model output', data.agent_output], ['input', 'Input context', data.input_context]].map(([id, label, value]) => (
          <Tabs.Panel key={id} value={id}><div className="payload">
            <div className="payload-toolbar"><span>{label}</span><CopyControl value={value} label={`Copy ${label.toLowerCase()}`} /></div>
            <pre>{formatPayload(value) || 'No text recorded.'}</pre>
          </div></Tabs.Panel>
        ))}
      </Tabs>
    </section>
    <aside className="inspector" aria-label="Model call metadata">
      <div className="inspector-top"><span><IconFingerprint size={16} /> Record metadata</span><Badge color="violet" variant="light">DUT</Badge></div>
      <div className="inspector-body">
        <div className="metadata dut-metadata">
          <CidField label="Model record CID" value={data.cid} />
          <div className="metadata-field"><span>Occurred at</span><code>{formatDate(data.occurred_at, longDate)}</code></div>
          <CidField label="Agent CID" value={data.agent_cid} />
          <CidField label="Configuration CID" value={data.config_cid} />
          <div className="metadata-field"><span>Sequence</span><code>{data.sequence}</code></div>
          {!!data.business_object_keys.length && <div className="metadata-field"><span>Business keys</span>{data.business_object_keys.map((key) => <code key={key}>{key}</code>)}</div>}
          {!!data.artifact_cids.length && <div className="metadata-field"><span>Artifacts</span>{data.artifact_cids.map((cid) => <code key={cid}>{cid}</code>)}</div>}
        </div>
        <Verification key={data.cid} client={client} cid={data.cid} demo={demo} />
      </div>
    </aside>
  </div>;
}

function ConnectionDialog({ opened, close, connect, useSample, demo }) {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState({});
  const submit = async (event) => {
    event.preventDefault();
    const value = secret.trim();
    if (!value) return;
    setState({ loading: true });
    try {
      await readLedger('roots', undefined, value, AbortSignal.timeout(8000));
      connect(value);
      setSecret('');
      setState({});
      close();
    } catch (error) {
      setState({ error: error.name === 'TimeoutError' ? 'AITS did not respond in time.' : error.message });
    }
  };
  return <Modal opened={opened} onClose={close} title="Connect to local AITS" centered
    closeOnEscape={!state.loading} closeOnClickOutside={!state.loading} withCloseButton={!state.loading}>
    <form className="dialog-form" onSubmit={submit}>
      <p>Enter the service key from your running AITS server. The key is kept in this tab until you reload or disconnect.</p>
      <PasswordInput label="AITS service key" placeholder="Enter service key" autoComplete="off" value={secret}
        onChange={(event) => setSecret(event.currentTarget.value)} data-autofocus required />
      {state.error && <ErrorNotice message={state.error} />}
      <div className="dialog-actions">
        <Button variant="subtle" color="gray" disabled={state.loading} onClick={() => { setSecret(''); setState({}); useSample(); close(); }}>
          {demo ? 'Keep sample ledger' : 'Disconnect and use sample'}
        </Button>
        <Button type="submit" loading={state.loading} leftSection={<IconPlugConnected size={16} />}>Connect</Button>
      </div>
    </form>
  </Modal>;
}

function LookupDialog({ opened, close, open }) {
  const [type, setType] = useState('root');
  const [value, setValue] = useState('');
  return <Modal opened={opened} onClose={close} title="Open a record by CID" centered>
    <form className="dialog-form" onSubmit={(event) => {
      event.preventDefault();
      if (isCid(value.trim())) {
        open(type, value.trim().toLowerCase());
        setValue('');
        close();
      }
    }}>
      <SegmentedControl fullWidth value={type} onChange={setType} aria-label="Record type"
        data={[{ value: 'root', label: 'Lineage root' }, { value: 'dut', label: 'Model call (DUT)' }]} />
      <TextInput label="Content identifier" placeholder="Paste the 64-character CID" value={value} autoComplete="off" spellCheck={false}
        onChange={(event) => setValue(event.currentTarget.value)} data-autofocus />
      <div className="dialog-actions"><Button type="submit" disabled={!isCid(value.trim())} rightSection={<IconArrowRight size={15} />}>Open record</Button></div>
    </form>
  </Modal>;
}

function App() {
  const [key, setKey] = useState('');
  const [route, setRoute] = useState(readRoute);
  const [filter, setFilter] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [names, setNames] = useState({});
  const desktop = useMediaQuery('(min-width: 881px)');
  const [connectOpen, connection] = useDisclosure(false);
  const [lookupOpen, lookup] = useDisclosure(false);
  const demo = !key;
  const client = useMemo(() => key ? (kind, id, signal) => readLedger(kind, id, key, signal) : readDemo, [key]);
  const roots = useRecord(client, 'roots', undefined, refresh);
  const rootId = route.root || (!route.dut ? roots.data?.[0]?.root : '');
  const graph = useRecord(client, 'root', rootId, refresh);
  const dut = useRecord(client, 'dut', route.dut, refresh);
  const nodes = useMemo(() => graph.data ? orderSteps(graph.data) : [], [graph.data]);
  const selected = (route.step && nodes.find((node) => node.cid === route.step)) || nodes.find((node) => node.dut) || nodes[0];

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    const root = graph.data?.nodes.find((node) => node.cid === graph.data.root);
    if (root) setNames((current) => ({ ...current, [root.cid]: runName(root.step_id) }));
  }, [graph.data]);

  useHotkeys([['mod+K', lookup.open]]);

  function go(hash) {
    location.hash = hash;
    setRoute(readRoute(hash));
  }
  function showNarrowDetail(id) {
    if (window.matchMedia('(max-width: 880px)').matches) {
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    }
  }
  function openRoot(id) { go(`#root/${id}`); showNarrowDetail('record-detail'); }
  function selectStep(id) { go(`#root/${rootId}/step/${id}`); showNarrowDetail('step-details'); }
  function openDut(id, stepId) {
    go(stepId ? `#root/${rootId}/step/${stepId}/dut/${id}` : `#dut/${id}`);
    showNarrowDetail('record-detail');
  }
  function switchSource(nextKey) {
    setKey(nextKey);
    setNames({});
    setFilter('');
    if (!nextKey || (demo && (roots.data?.some((root) => root.root === route.root) || dut.data))) go('');
  }

  const backToStep = route.step ? () => selectStep(route.step) : null;
  const detail = route.dut && (!desktop || !rootId) ? dut : graph;
  const boardRoot = nodes.find((node) => node.cid === rootId);
  const boardDockOpen = Boolean(route.step || route.dut);
  return <>
    <header className="topbar"><div className="topbar-content">
      <a href="#" className="brand" aria-label="AITS Ledger Explorer home"><span className="brand-mark"><IconTopologyStar3 size={23} stroke={1.75} /></span>
        <span>AITS<span className="brand-divider" />Ledger Explorer</span></a>
      <div className="top-actions">
        <Badge className="source-badge" variant="outline" color={demo ? 'gray' : 'teal'} leftSection={<span className="status-dot" />}>
          {demo ? 'Sample data' : 'Local AITS'}
        </Badge>
        <Button className="connect-button" onClick={connection.open} variant={demo ? 'filled' : 'default'} size="sm"
          leftSection={<IconPlugConnected size={17} />}>{demo ? 'Connect AITS' : 'Connection'}</Button>
      </div>
    </div></header>
    <main className="main-shell">
      <div className="page-heading">
        <div><div className="breadcrumb"><IconDatabase size={14} /> Ledger <IconChevronRight size={12} /> Lineage
          <span className="mobile-source">{demo ? 'Sample data' : 'Local AITS'}</span></div>
          <h1>Lineage explorer</h1><p>Follow a workflow run from its first step to its recorded decision.</p></div>
        <Button variant="default" className="lookup-button" leftSection={<IconHash size={17} />} onClick={lookup.open}
          rightSection={<kbd>Ctrl K</kbd>}>Open CID</Button>
      </div>
      <div className="workspace">
        <RunRail roots={roots} active={rootId} names={names} filter={filter} setFilter={setFilter} open={openRoot} refresh={() => setRefresh((value) => value + 1)} />
        <div className="workspace-detail" id="record-detail" aria-live="polite">
          {(detail.loading || (!rootId && !route.dut && roots.loading)) && <section className="loading-panel" aria-label="Loading record"><Skeleton h={108} /><Skeleton h={60} /><Skeleton h={60} /></section>}
          {detail.error && <div className="loading-panel"><ErrorNotice message={detail.error} /><Button variant="light" onClick={() => setRefresh((value) => value + 1)}>Retry</Button></div>}
          {route.dut && (!desktop || !rootId) && dut.data && <DutPanel data={dut.data} client={client} demo={demo} back={backToStep} />}
          {desktop && graph.data && <section className="board-panel" aria-label="Execution trace">
            <div className="board-heading">
              <span className="trace-hero-icon"><IconGitBranch size={23} /></span>
              <div><h2>{runName(boardRoot?.step_id)}</h2><span className="board-root"><code>{shortCid(rootId)}</code><CopyControl value={rootId} label="Copy root CID" /></span></div>
              <div className="board-totals"><span>{nodes.length} steps</span><span>{nodes.filter((node) => node.dut).length} DUTs</span></div>
            </div>
            <div className="board-stage">
              <LineageBoard key={rootId} nodes={nodes} selected={route.step} selectedDut={route.dut}
                select={selectStep} openDut={openDut} dockOpen={boardDockOpen} />
              {boardDockOpen && <div className="board-dock" aria-label={route.dut ? 'DUT details' : 'Selected step'}>
                <div className="dock-toolbar">
                  <span>{route.dut ? 'DUT details' : 'Selected step'}</span>
                  <ActionIcon variant="subtle" color="gray" aria-label="Close details" onClick={() => openRoot(rootId)}><IconX size={17} /></ActionIcon>
                </div>
                {route.dut ? <>
                  {dut.loading && <div className="dock-status"><Skeleton h={60} /><Skeleton h={120} /></div>}
                  {dut.error && <div className="dock-status"><ErrorNotice message={dut.error} /></div>}
                  {dut.data && <DutPanel data={dut.data} client={client} demo={demo} back={backToStep} />}
                </> : selected && <StepInspector node={selected} graph={graph.data} client={client} demo={demo}
                  openDut={(id) => openDut(id, selected.cid)} select={selectStep} />}
              </div>}
            </div>
          </section>}
          {!desktop && !route.dut && graph.data && selected && <div className="detail-grid">
            <Trace graph={graph.data} nodes={nodes} selected={selected} select={selectStep} />
            <StepInspector node={selected} graph={graph.data} client={client} demo={demo} openDut={(id) => openDut(id, selected.cid)} select={selectStep} />
          </div>}
          {!rootId && !route.dut && !roots.loading && <section className="empty-panel"><span className="trace-hero-icon"><IconRoute size={24} /></span>
            <h2>{roots.error ? 'Ledger unavailable' : 'No lineage runs yet'}</h2>
            <p>{roots.error ? 'Check the connection to your AITS service.' : 'Record an n8n workflow execution or open an existing record by CID.'}</p>
            <Button variant="light" onClick={roots.error ? connection.open : lookup.open}>{roots.error ? 'Connection settings' : 'Open CID'}</Button>
          </section>}
        </div>
      </div>
    </main>
    <ConnectionDialog opened={connectOpen} close={connection.close} connect={switchSource} demo={demo} useSample={() => switchSource('')} />
    <LookupDialog opened={lookupOpen} close={lookup.close} open={(type, id) => type === 'root' ? openRoot(id) : openDut(id)} />
  </>;
}

createRoot(document.getElementById('root')).render(<StrictMode><MantineProvider theme={theme}><App /></MantineProvider></StrictMode>);
