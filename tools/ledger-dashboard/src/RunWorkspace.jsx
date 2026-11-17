import { useMemo, useState } from 'react';
import { Button, NativeSelect, SegmentedControl, Skeleton } from '@mantine/core';
import {
  IconArrowRight,
  IconBraces,
  IconChevronRight,
  IconGitBranch,
  IconLink,
  IconRoute,
} from '@tabler/icons-react';
import {
  CidField,
  DecisionBadge,
  DutPanel,
  ErrorNotice,
  EvidenceDock,
  StepInspector,
  TraceDetails,
} from './Evidence.jsx';
import LineageBoard from './LineageBoard.jsx';
import {
  callLabel,
  decisionLabel,
  decisionReason,
  elapsedTime,
  executionLabel,
  formatDate,
  orderSteps,
  runLabel,
  stepInfo,
  upstreamSteps,
} from './ledger.js';

const RunHeading = ({ run, desktop, view, setView, selectStep, startTrace }) => {
  const [chosen, setChosen] = useState('');
  const decision = run.decisions.find((entry) => entry.cid === chosen) || run.decisions.at(-1);

  return (
    <>
      <header className="board-heading">
        <div className="run-title-group">
          <span className="trace-hero-icon">
            <IconRoute size={23} />
          </span>
          <div>
            <h2>{runLabel(run)}</h2>
            <div className="run-byline">
              <span>{executionLabel(run)}</span>
              <span>
                Started <time dateTime={run.started_at}>{formatDate(run.started_at)}</time>
              </span>
            </div>
          </div>
        </div>
        {desktop && (
          <SegmentedControl
            size="xs"
            aria-label="Run view"
            value={view}
            onChange={setView}
            data={[
              { label: 'Canvas', value: 'canvas' },
              { label: 'Step list', value: 'steps' },
            ]}
          />
        )}
      </header>
      <div className="run-summary">
        <div className="summary-content">
          <div className="summary-label">Recorded decision</div>
          {decision ? (
            <div className="decision-summary">
              {run.decisions.length > 1 ? (
                <NativeSelect
                  size="xs"
                  aria-label="Choose recorded decision"
                  value={decision.cid}
                  onChange={(event) => setChosen(event.currentTarget.value)}
                  data={run.decisions.map((entry, index) => ({
                    value: entry.cid,
                    label: `${index + 1}. ${decisionLabel(entry.outcome)}`,
                  }))}
                />
              ) : (
                <button
                  className="decision-button"
                  onClick={() => selectStep(decision.cid)}
                  aria-label={`Open decision: ${decisionLabel(decision.outcome)}`}
                >
                  <DecisionBadge decision={decision} />
                </button>
              )}
              <p>{decisionReason(decision.reason)}</p>
            </div>
          ) : (
            <p>No decision recorded</p>
          )}
        </div>
        {decision && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconGitBranch size={15} />}
            onClick={() => startTrace(decision.cid)}
          >
            Trace inputs
          </Button>
        )}
      </div>
      <div className="run-context">
        <span>
          {run.nodes} {run.nodes === 1 ? 'step' : 'steps'} · {run.span_count}{' '}
          {run.span_count === 1 ? 'recorded call' : 'recorded calls'}
        </span>
        {run.business_keys.length === 1 && (
          <span className="run-context-key">{run.business_keys[0]}</span>
        )}
        <details className="record-details run-details">
          <summary>Run details</summary>
          <div className="run-details-body">
            <CidField
              label="Root CID"
              value={run.root}
              help="Content identifier. The fingerprint of the first step identifies this run."
            />
            {run.workflow_id && (
              <p>
                Workflow ID <code>{run.workflow_id}</code>
              </p>
            )}
            <p>
              Last activity{' '}
              <time dateTime={run.last_occurred_at}>{formatDate(run.last_occurred_at)}</time>
            </p>
            {run.business_keys.length > 0 && (
              <p>
                Issue or business keys <strong>{run.business_keys.join(', ')}</strong>
              </p>
            )}
          </div>
        </details>
      </div>
    </>
  );
};

const StepList = ({ nodes, decisions, startMs, selected, select, upstream }) => {
  const byId = new Map(nodes.map((node) => [node.cid, node]));
  return (
    <section
      className="trace-panel step-list"
      aria-label="Step list"
    >
      <div className="timeline-heading">
        <h3>Step list</h3>
        <span>Dependencies first</span>
      </div>
      <ol className="timeline">
        {nodes.map((node, index) => {
          const decision = decisions.get(node.cid);
          const info = stepInfo(node, decision);
          const parentTitles = node.prev
            .map((cid) => byId.get(cid))
            .filter(Boolean)
            .map((parent) => stepInfo(parent, decisions.get(parent.cid)).title);
          const showParents =
            node.prev.length > 1 ||
            (node.prev.length === 1 && nodes[index - 1]?.cid !== node.prev[0]);
          return (
            <li
              className="timeline-row"
              key={node.cid}
              data-color={info.color}
              data-muted={Boolean(upstream && !upstream.has(node.cid))}
            >
              <span
                className="timeline-marker"
                aria-hidden="true"
              >
                {node.dut ? <IconBraces size={17} /> : <IconGitBranch size={17} />}
              </span>
              <button
                className="step-button"
                aria-current={selected === node.cid ? 'step' : undefined}
                onClick={() => select(node.cid)}
              >
                <span className="step-text">
                  <strong>{info.title}</strong>
                  <span>
                    {decision ? decisionLabel(decision.outcome) : info.kind}
                    {showParents && ` · From ${parentTitles.join(', ')}`}
                  </span>
                </span>
                <span className="step-trailing">
                  {node.derived_from.length > 0 && (
                    <IconLink
                      size={14}
                      aria-label="Uses evidence from another run"
                    />
                  )}
                  <time
                    dateTime={node.occurred_at}
                    title={formatDate(node.occurred_at)}
                  >
                    {elapsedTime(node.occurred_at, startMs)}
                  </time>
                  <IconChevronRight size={15} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const Legend = ({ hasHandoffs }) => {
  return (
    <div
      className="board-legend"
      aria-label="Canvas legend"
    >
      <span>
        <IconArrowRight size={15} /> Depends on earlier steps
      </span>
      <span>
        <IconBraces size={15} /> Attached call record
      </span>
      {hasHandoffs && (
        <span>
          <IconLink size={15} /> Evidence from another run
        </span>
      )}
      <span>Times are relative to the earliest event</span>
    </div>
  );
};

const RunWorkspace = ({
  graph,
  client,
  demo,
  desktop,
  view,
  setView,
  selection,
  dut,
  traceCid,
  openDut,
  selectStep,
  closeDetails,
  startTrace,
  clearTrace,
  share,
}) => {
  const nodes = useMemo(() => orderSteps(graph), [graph]);
  const decisions = useMemo(
    () => new Map(graph.run.decisions.map((decision) => [decision.cid, decision])),
    [graph.run],
  );
  const upstream = useMemo(
    () => (traceCid ? upstreamSteps(graph, traceCid) : null),
    [graph, traceCid],
  );
  const startMs = graph.nodes.reduce(
    (first, node) => Math.min(first, Date.parse(node.occurred_at)),
    Infinity,
  );
  const selected = nodes.find((node) => node.cid === selection.step);
  const invalid = Boolean(
    selection.step && (!selected || (selection.dut && selected.dut !== selection.dut)),
  );
  const dockOpen = Boolean(traceCid || selection.step);
  const canvas = desktop && view === 'canvas';
  const showingTrace = traceCid && !selection.step && !selection.dut;
  const label = invalid
    ? 'Record lookup'
    : showingTrace
      ? 'Decision inputs'
      : selection.dut
        ? `${callLabel(selected)} details`
        : 'Selected step';
  return (
    <section
      className="board-panel"
      aria-label="Selected run"
    >
      <RunHeading
        run={graph.run}
        desktop={desktop}
        view={view}
        setView={setView}
        selectStep={selectStep}
        startTrace={startTrace}
      />
      {canvas && <Legend hasHandoffs={nodes.some((node) => node.derived_from.length > 0)} />}
      {traceCid && (
        <div
          className="trace-active"
          role="status"
        >
          <IconGitBranch size={15} /> Highlighting the steps that contributed to this decision
          <button
            className="text-button"
            onClick={clearTrace}
          >
            Clear trace
          </button>
        </div>
      )}
      <div
        className="board-stage"
        data-layout={canvas ? 'canvas' : 'steps'}
        data-has-dock={dockOpen}
      >
        {canvas ? (
          <LineageBoard
            nodes={nodes}
            decisions={decisions}
            startMs={startMs}
            selected={selection.step}
            selectedDut={selection.dut}
            select={selectStep}
            openDut={openDut}
            dockOpen={dockOpen}
            upstream={upstream}
            traceCid={traceCid}
          />
        ) : (
          <StepList
            nodes={nodes}
            decisions={decisions}
            startMs={startMs}
            selected={selection.step}
            select={selectStep}
            upstream={upstream}
          />
        )}
        {dockOpen && (
          <div id="step-details">
            <EvidenceDock
              label={label}
              close={showingTrace ? clearTrace : closeDetails}
              share={!invalid ? share : ''}
            >
              {traceCid && !showingTrace && (
                <button
                  className="text-button return-to-trace"
                  onClick={closeDetails}
                >
                  Back to decision inputs
                </button>
              )}
              {invalid ? (
                <div className="dock-status">
                  <ErrorNotice message="The selected step or call does not belong to this run." />
                </div>
              ) : showingTrace ? (
                <TraceDetails
                  key={traceCid}
                  cid={traceCid}
                  graph={graph}
                  upstream={upstream}
                  client={client}
                  openDut={openDut}
                  selectStep={selectStep}
                />
              ) : selection.dut ? (
                <>
                  {dut.loading && (
                    <div className="dock-status">
                      <Skeleton h={60} />
                      <Skeleton h={120} />
                    </div>
                  )}
                  {dut.error && (
                    <div className="dock-status">
                      <ErrorNotice message={dut.error} />
                    </div>
                  )}
                  {dut.data && (
                    <DutPanel
                      key={dut.data.cid}
                      data={dut.data}
                      node={selected}
                      client={client}
                      demo={demo}
                      back={selected && (() => selectStep(selected.cid))}
                    />
                  )}
                </>
              ) : (
                selected && (
                  <StepInspector
                    key={selected.cid}
                    node={selected}
                    decision={decisions.get(selected.cid)}
                    graph={graph}
                    client={client}
                    demo={demo}
                    openDut={openDut}
                    selectStep={selectStep}
                    startTrace={startTrace}
                  />
                )
              )}
            </EvidenceDock>
          </div>
        )}
      </div>
    </section>
  );
};

export default RunWorkspace;
