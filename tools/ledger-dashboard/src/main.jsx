import React, { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge,
  Button,
  MantineProvider,
  Modal,
  NativeSelect,
  PasswordInput,
  Skeleton,
  TextInput,
  createTheme,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import {
  IconArrowRight,
  IconHash,
  IconPlugConnected,
  IconRoute,
  IconShieldCheck,
  IconTopologyStar3,
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { readDemo } from './demo.js';
import { AuditView, DutPanel, ErrorNotice, EvidenceDock } from './Evidence.jsx';
import {
  dutRoute,
  hasRunFilters,
  initialFilters,
  isCid,
  readLedger,
  readRoute,
  rootRoute,
  runSearch,
  stepRoute,
} from './ledger.js';
import RunRail from './RunRail.jsx';
import RunWorkspace from './RunWorkspace.jsx';
import useRecord from './useRecord.js';
import useRunList from './useRunList.js';
import './styles.css';

const theme = createTheme({
  fontFamily: 'Inter Variable, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono Variable, monospace',
  primaryColor: 'violet',
  defaultRadius: 'md',
});

const ConnectionDialog = ({ close, connect, useSample, demo }) => {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState({});
  const submit = async (event) => {
    event.preventDefault();
    const value = secret.trim();
    if (!value) return;
    setState({ loading: true });
    try {
      await readLedger('runs', 'limit=1', value, AbortSignal.timeout(8000));
      connect(value);
      close();
    } catch (error) {
      setState({
        error: error.name === 'TimeoutError' ? 'AITS did not respond in time.' : error.message,
      });
    }
  };
  return (
    <Modal
      opened
      onClose={close}
      title="Connect to AITS"
      centered
      closeOnEscape={!state.loading}
      closeOnClickOutside={!state.loading}
      withCloseButton={!state.loading}
    >
      <form
        className="dialog-form"
        onSubmit={submit}
      >
        <p>
          Enter the service key from your running AITS server. The key stays in this tab until you
          reload or disconnect.
        </p>
        <PasswordInput
          label="AITS service key"
          placeholder="Enter service key"
          autoComplete="off"
          value={secret}
          onChange={(event) => setSecret(event.currentTarget.value)}
          data-autofocus
          required
        />
        {state.error && <ErrorNotice message={state.error} />}
        <div className="dialog-actions">
          {!demo && (
            <Button
              variant="subtle"
              color="gray"
              disabled={state.loading}
              onClick={() => {
                useSample();
                close();
              }}
            >
              Disconnect and use sample
            </Button>
          )}
          <Button
            type="submit"
            loading={state.loading}
            leftSection={<IconPlugConnected size={16} />}
          >
            Connect
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const LookupDialog = ({ close, open }) => {
  const [type, setType] = useState('step');
  const [value, setValue] = useState('');
  return (
    <Modal
      opened
      onClose={close}
      title="Open a record by CID"
      centered
    >
      <form
        className="dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isCid(value.trim())) return;
          open(type, value.trim().toLowerCase());
          close();
        }}
      >
        <p>
          A CID is the fingerprint of an exact record. A run’s root CID also identifies its first
          step.
        </p>
        <NativeSelect
          label="Record type"
          value={type}
          onChange={(event) => setType(event.currentTarget.value)}
          data={[
            { value: 'root', label: 'Run' },
            { value: 'step', label: 'Step' },
            { value: 'dut', label: 'Recorded call (DUT)' },
          ]}
        />
        <TextInput
          label="Content identifier (CID)"
          placeholder="Paste the 64-character CID"
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setValue(event.currentTarget.value)}
          data-autofocus
        />
        <div className="dialog-actions">
          <Button
            type="submit"
            disabled={!isCid(value.trim())}
            rightSection={<IconArrowRight size={15} />}
          >
            Open record
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const App = () => {
  const [key, setKey] = useState('');
  const [route, setRoute] = useState(readRoute);
  const [filters, setFilters] = useState(initialFilters);
  const [clock, setClock] = useState(Date.now);
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState('canvas');
  const [connectOpen, connection] = useDisclosure(false);
  const [lookupOpen, lookup] = useDisclosure(false);
  const [searchText] = useDebouncedValue(filters.q, 220);
  const [workflowText] = useDebouncedValue(filters.workflow, 220);
  const [businessKey] = useDebouncedValue(filters.businessKey, 220);
  const desktop = useMediaQuery('(min-width: 881px)');
  const demo = !key;
  const client = useMemo(
    () => (key ? (kind, id, signal) => readLedger(kind, id, key, signal) : readDemo),
    [key],
  );
  const search = runSearch(
    { ...filters, q: searchText, workflow: workflowText, businessKey },
    clock,
  );
  const list = useRunList(client, route.audit ? null : search.query, refresh);
  const resolved = useRecord(client, 'node', route.lookupStep || null, refresh);
  const rootId =
    route.root ||
    resolved.data?.root ||
    (!route.lookupStep && !route.dut ? list.runs[0]?.root : null);
  const graph = useRecord(client, 'root', route.audit ? null : rootId, refresh);
  const traceCid = graph.data?.run?.decisions.some((decision) => decision.cid === route.trace)
    ? route.trace
    : '';
  const dutId = route.dut || (traceCid ? route.traceDut : '') || null;
  const dut = useRecord(client, 'dut', dutId, refresh);
  const standaloneDut = route.dut && !rootId;

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useHotkeys([['mod+K', lookup.open]]);

  const go = (hash) => {
    setRoute(readRoute(hash));
    if (location.hash !== hash) location.hash = hash;
  };
  const scrollNarrow = (id) => {
    if (!desktop)
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  };
  const openRoot = (id) => {
    go(rootRoute(id));
    scrollNarrow('record-detail');
  };
  const selectStep = (id) => {
    go(rootRoute(rootId, id, null, traceCid));
    scrollNarrow('step-details');
  };
  const openDut = (id, stepId) => {
    go(stepId || traceCid ? rootRoute(rootId, stepId, id, traceCid) : dutRoute(id));
    scrollNarrow(stepId || traceCid ? 'step-details' : 'record-detail');
  };
  const startTrace = (id) => {
    go(rootRoute(rootId, null, null, id));
    scrollNarrow('step-details');
  };
  const closeDetails = () => {
    go(rootRoute(rootId, null, null, traceCid));
  };
  const clearTrace = () => {
    go(rootRoute(rootId, route.step || route.lookupStep, route.step && route.dut));
  };
  const switchSource = (nextKey) => {
    setKey(nextKey);
    setFilters(initialFilters);
    if (!nextKey || (demo && graph.data) || (demo && dut.data)) go('');
  };
  const updateFilter = (name, value) => {
    if (name === 'range') setClock(Date.now());
    setFilters((current) => ({ ...current, [name]: value }));
  };
  const clearFilters = () => {
    setFilters(initialFilters);
  };
  const reload = () => {
    setClock(Date.now());
    setRefresh((value) => value + 1);
  };
  const openByCid = (type, id) => {
    if (type === 'root') openRoot(id);
    else if (type === 'step') {
      go(stepRoute(id));
      scrollNarrow('record-detail');
    } else openDut(id);
  };

  const loading =
    resolved.loading ||
    graph.loading ||
    (standaloneDut && dut.loading) ||
    (!rootId && !standaloneDut && list.loading);
  const error = resolved.error || graph.error || (standaloneDut && dut.error);
  const share = new URL(location.href);
  if (route.lookupStep && rootId) share.hash = rootRoute(rootId, route.lookupStep);
  const matchingSelection = list.runs.some((run) => run.root === rootId);
  const showOutsidePage =
    route.root && list.total != null && !matchingSelection && !list.loading && graph.data;
  const filtered = hasRunFilters(filters);
  const emptyTitle = search.error
    ? 'Check the date range'
    : list.error
      ? 'Runs could not load'
      : list.total === 0 && filtered
        ? 'No matching runs'
        : 'No recorded runs';

  return (
    <>
      <header className="topbar">
        <div className="topbar-content">
          <a
            href="#"
            className="brand"
            aria-label="AITS Ledger Explorer home"
          >
            <span className="brand-mark">
              <IconTopologyStar3
                size={23}
                stroke={1.75}
              />
            </span>
            <span>
              AITS
              <span className="brand-divider" />
              Ledger Explorer
            </span>
          </a>
          <nav
            className="top-navigation"
            aria-label="Ledger views"
          >
            <a
              href="#"
              aria-current={!route.audit ? 'page' : undefined}
            >
              <IconRoute size={16} />
              Lineage
            </a>
            <a
              href="#audit"
              aria-current={route.audit ? 'page' : undefined}
            >
              <IconShieldCheck size={16} />
              Ledger audit
            </a>
          </nav>
          <div className="top-actions">
            <Badge
              className="source-badge"
              variant="outline"
              color={demo ? 'gray' : 'teal'}
              leftSection={<span className="status-dot" />}
            >
              {demo ? 'Sample ledger' : 'Connected to AITS'}
            </Badge>
            <Button
              className="connect-button"
              onClick={connection.open}
              variant={demo ? 'filled' : 'default'}
              size="sm"
              leftSection={<IconPlugConnected size={17} />}
            >
              {demo ? 'Connect AITS' : 'Connection'}
            </Button>
          </div>
        </div>
      </header>
      <main className="main-shell">
        {route.audit ? (
          <AuditView
            key={demo ? 'sample' : key}
            client={client}
            demo={demo}
          />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <h1>Lineage explorer</h1>
                <p>Find a run and follow the recorded inputs behind its decisions.</p>
              </div>
              <Button
                variant="default"
                className="lookup-button"
                leftSection={<IconHash size={17} />}
                onClick={lookup.open}
                rightSection={<kbd>Ctrl K</kbd>}
              >
                Open by CID
              </Button>
            </div>
            <div className="workspace">
              <RunRail
                filters={filters}
                update={updateFilter}
                clear={clearFilters}
                list={{ ...list, error: search.error || list.error }}
                active={rootId}
                open={openRoot}
                refresh={reload}
              />
              <div
                className="workspace-detail"
                id="record-detail"
              >
                {loading && (
                  <section
                    className="loading-panel"
                    aria-label="Loading record"
                  >
                    <Skeleton h={78} />
                    <Skeleton h={58} />
                  </section>
                )}
                {error && (
                  <div className="loading-panel">
                    <ErrorNotice message={error} />
                    <Button
                      variant="light"
                      onClick={reload}
                    >
                      Retry
                    </Button>
                  </div>
                )}
                {showOutsidePage && (
                  <p
                    className="outside-results"
                    role="status"
                  >
                    The open run is outside the displayed results.
                  </p>
                )}
                {standaloneDut && dut.data && (
                  <div className="standalone-details">
                    <EvidenceDock
                      label="Recorded call"
                      close={() => go('')}
                      share={share.href}
                    >
                      <DutPanel
                        key={dut.data.cid}
                        data={dut.data}
                        client={client}
                        demo={demo}
                      />
                    </EvidenceDock>
                  </div>
                )}
                {graph.data?.run && (
                  <RunWorkspace
                    key={rootId}
                    graph={graph.data}
                    client={client}
                    demo={demo}
                    desktop={desktop}
                    view={view}
                    setView={setView}
                    selection={{ step: route.step || route.lookupStep, dut: dutId }}
                    dut={dut}
                    traceCid={traceCid}
                    openDut={openDut}
                    selectStep={selectStep}
                    closeDetails={closeDetails}
                    startTrace={startTrace}
                    clearTrace={clearTrace}
                    share={share.href}
                  />
                )}
                {!loading && !error && !graph.data && !standaloneDut && (
                  <section className="empty-panel">
                    <span className="trace-hero-icon">
                      <IconRoute size={22} />
                    </span>
                    <h2>{emptyTitle}</h2>
                    <p>
                      {search.error
                        ? search.error
                        : list.error
                          ? 'Try refreshing the run list or reconnecting to AITS.'
                          : list.total === 0 && filtered
                            ? 'Try a wider date range or clear your filters.'
                            : 'Record an n8n workflow execution or open a record using its CID.'}
                    </p>
                    {list.error ? (
                      <Button
                        variant="light"
                        onClick={reload}
                      >
                        Refresh runs
                      </Button>
                    ) : filtered ? (
                      <Button
                        variant="light"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button
                        variant="light"
                        onClick={lookup.open}
                      >
                        Open by CID
                      </Button>
                    )}
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </main>
      {connectOpen && (
        <ConnectionDialog
          close={connection.close}
          connect={switchSource}
          demo={demo}
          useSample={() => switchSource('')}
        />
      )}
      {lookupOpen && (
        <LookupDialog
          close={lookup.close}
          open={openByCid}
        />
      )}
    </>
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
);
