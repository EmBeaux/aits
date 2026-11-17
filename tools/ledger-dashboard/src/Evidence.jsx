import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Skeleton,
  Tabs,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowUpRight,
  IconBraces,
  IconCheck,
  IconCopy,
  IconFingerprint,
  IconGitBranch,
  IconShieldCheck,
  IconX,
} from '@tabler/icons-react';
import {
  callLabel,
  decisionColor,
  decisionLabel,
  decisionReason,
  dutRoute,
  findingLabel,
  formatDate,
  isCid,
  shortCid,
  stepInfo,
  stepRoute,
} from './ledger.js';
import useRecord from './useRecord.js';

export const ErrorNotice = ({ message }) => {
  return (
    <Alert
      className="error-notice"
      variant="light"
      color="red"
      icon={<IconAlertCircle size={17} />}
    >
      {message}
    </Alert>
  );
};

export const CopyControl = ({ value, label = 'Copy record CID' }) => {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copied' : label}>
          <ActionIcon
            aria-label={copied ? 'Copied' : label}
            variant="subtle"
            color="gray"
            size="sm"
            onClick={copy}
          >
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
};

export const CidField = ({ label, value, help }) => {
  return (
    <div className="metadata-field">
      <span>{label}</span>
      {help && <small>{help}</small>}
      <div className="cid-value">
        <code>{value}</code>
        <CopyControl
          value={value}
          label={`Copy ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
};

const Field = ({ label, children }) => {
  return (
    <div className="metadata-field">
      <span>{label}</span>
      {children}
    </div>
  );
};

export const DecisionBadge = ({ decision }) => {
  return (
    <Badge
      variant="light"
      color={decisionColor(decision.outcome)}
    >
      {decisionLabel(decision.outcome)}
    </Badge>
  );
};

export const Verification = ({ client, cid, demo }) => {
  const [attempt, setAttempt] = useState(0);
  const result = useRecord(client, 'verify', attempt ? cid : null, attempt);
  return (
    <section
      className="verification-box"
      aria-label="Record verification"
    >
      <div className="verification-title">
        <IconShieldCheck size={16} />
        <strong>Record integrity</strong>
      </div>
      <p>
        Checks the record’s fingerprint, linked records, and the order in which AITS received its
        direct inputs.
      </p>
      {result.error && <ErrorNotice message={result.error} />}
      {result.data?.valid && (
        <Badge
          variant="light"
          color="teal"
        >
          {demo ? 'Sample check passed' : 'Record verified'}
        </Badge>
      )}
      {result.data?.valid === false && (
        <Alert
          variant="light"
          color="red"
          title={findingLabel(result.data.property_violated)}
        >
          {result.data.message || 'AITS reported a verification failure for this record.'}
        </Alert>
      )}
      <Button
        variant="default"
        size="xs"
        loading={result.loading}
        onClick={() => setAttempt((value) => value + 1)}
      >
        {result.data ? 'Check again' : 'Verify record'}
      </Button>
    </section>
  );
};

const RecordTimes = ({ client, cid, occurredAt }) => {
  const { data, loading, error } = useRecord(client, 'commits', cid);
  const first = data?.[0];
  return (
    <dl className="record-times">
      <div>
        <dt title="Event time supplied by the recorder">Happened at</dt>
        <dd>
          <time
            dateTime={occurredAt}
            title={occurredAt}
          >
            {formatDate(occurredAt)}
          </time>
        </dd>
      </div>
      <div>
        <dt title="When AITS first received this record">First recorded at</dt>
        <dd>
          {first ? (
            <time
              dateTime={first.recorded_at}
              title={first.recorded_at}
            >
              {formatDate(first.recorded_at)}
            </time>
          ) : loading ? (
            'Loading…'
          ) : error ? (
            'Unavailable'
          ) : (
            'No ledger entry found'
          )}
        </dd>
      </div>
      {first && (
        <div>
          <dt>Recorded by</dt>
          <dd>{first.principal}</dd>
        </div>
      )}
      {error && (
        <div className="time-error">
          <dd>{error}</dd>
        </div>
      )}
    </dl>
  );
};

const EvidenceSource = ({ cid, client }) => {
  const node = useRecord(client, 'node', cid);
  const label = node.data ? stepInfo(node.data).title : `Step ${shortCid(cid)}`;
  return (
    <a
      className="evidence-link"
      href={stepRoute(cid)}
      title={cid}
    >
      <IconArrowUpRight size={15} />
      <span>
        <strong>{label}</strong>
        <small>Step in another run · {shortCid(cid)}</small>
      </span>
    </a>
  );
};

export const TraceDetails = ({ cid, graph, upstream, client, openDut, selectStep }) => {
  const [attempt, setAttempt] = useState(0);
  const calls = useRecord(client, 'traceback', cid, attempt);
  const steps = graph.nodes.filter((node) => upstream.has(node.cid));
  const external = [...new Set(steps.flatMap((node) => node.derived_from))];
  const localCalls = new Map(steps.filter((node) => node.dut).map((node) => [node.dut, node]));
  return (
    <section
      className="trace-evidence"
      aria-label="Contributing records"
    >
      <h4>Contributing calls</h4>
      {calls.loading && <Skeleton h={42} />}
      {calls.error && (
        <>
          <ErrorNotice message={calls.error} />
          <Button
            size="xs"
            variant="default"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry trace
          </Button>
        </>
      )}
      {calls.data?.length === 0 && <p>No calls were recorded on this path.</p>}
      {calls.data?.map((call) => {
        const step = localCalls.get(call.dut_cid);
        return (
          <button
            className="evidence-link"
            key={call.dut_cid}
            onClick={() => openDut(call.dut_cid, step?.cid)}
          >
            <IconBraces size={15} />
            <span>
              <strong>{step ? stepInfo(step).title : 'Call from another run'}</strong>
              <small>{formatDate(call.occurred_at)} · View input, output, and configuration</small>
            </span>
            <IconArrowUpRight size={14} />
          </button>
        );
      })}
      {external.length > 0 && (
        <>
          <h4>Evidence from other runs</h4>
          {external.map((source) => (
            <EvidenceSource
              key={source}
              cid={source}
              client={client}
            />
          ))}
        </>
      )}
      <details className="record-details">
        <summary>Contributing steps in this run</summary>
        <div className="parent-links">
          {steps
            .filter((node) => node.cid !== cid)
            .map((node) => (
              <button
                key={node.cid}
                onClick={() => selectStep(node.cid)}
              >
                <IconArrowLeft size={13} />
                {stepInfo(node).title}
              </button>
            ))}
        </div>
      </details>
    </section>
  );
};

export const StepInspector = ({
  node,
  decision,
  graph,
  client,
  demo,
  openDut,
  selectStep,
  startTrace,
}) => {
  const info = stepInfo(node, decision);
  const parents = node.prev
    .map((cid) => graph.nodes.find((step) => step.cid === cid))
    .filter(Boolean);
  const next = graph.nodes.filter((step) => step.prev.includes(node.cid));
  return (
    <section
      className="inspector-body"
      aria-label="Step details"
    >
      <div className="inspector-title">
        <h3>{info.title}</h3>
        <Badge
          variant="light"
          color={info.color}
        >
          {info.kind}
        </Badge>
      </div>
      <RecordTimes
        cid={node.cid}
        occurredAt={node.occurred_at}
        client={client}
      />
      {decision && (
        <div className="step-decision">
          <DecisionBadge decision={decision} />
          <p>{decisionReason(decision.reason)}</p>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconGitBranch size={15} />}
            onClick={() => startTrace(node.cid)}
          >
            Trace inputs
          </Button>
        </div>
      )}
      {node.dut && (
        <button
          className="record-link"
          onClick={() => openDut(node.dut, node.cid)}
        >
          <span className="record-icon">
            <IconBraces size={19} />
          </span>
          <span>
            <strong>Open {callLabel(node).toLowerCase()}</strong>
            <small>Input, output, and configuration</small>
          </span>
          <IconArrowUpRight size={16} />
        </button>
      )}
      {(parents.length > 0 || next.length > 0) && (
        <div className="step-connections">
          {parents.length > 0 && (
            <div>
              <h4>Depends on</h4>
              <div className="parent-links">
                {parents.map((parent) => (
                  <button
                    key={parent.cid}
                    onClick={() => selectStep(parent.cid)}
                  >
                    <IconArrowLeft size={13} />
                    {stepInfo(parent).title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {next.length > 0 && (
            <div>
              <h4>Used by</h4>
              <div className="parent-links">
                {next.map((child) => (
                  <button
                    key={child.cid}
                    onClick={() => selectStep(child.cid)}
                  >
                    <IconArrowUpRight size={13} />
                    {stepInfo(child).title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {node.derived_from.length > 0 && (
        <section className="trace-evidence">
          <h4>Used evidence from another run</h4>
          {node.derived_from.map((cid) => (
            <EvidenceSource
              key={cid}
              cid={cid}
              client={client}
            />
          ))}
        </section>
      )}
      <Verification
        key={node.cid}
        client={client}
        cid={node.cid}
        demo={demo}
      />
      <details className="record-details">
        <summary>Record details</summary>
        <CidField
          label="Step CID"
          value={node.cid}
          help="Content identifier. A fingerprint of this stored step."
        />
        <Field label="Recorded actor">
          <code>{node.actor_id}</code>
        </Field>
        <Field label="Step identifier">
          <code>{node.step_id}</code>
        </Field>
        <Field label="Recorded operation">
          <code>{node.transformation}</code>
        </Field>
      </details>
    </section>
  );
};

const decodePayload = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const Payload = ({ label, value }) => {
  const decoded = decodePayload(value);
  const messages =
    Array.isArray(decoded) &&
    decoded.length > 0 &&
    decoded.every((item) => typeof item?.role === 'string' && Object.hasOwn(item, 'content'))
      ? decoded
      : null;
  return (
    <div className="payload">
      <div className="payload-toolbar">
        <span>{label}</span>
        <CopyControl
          value={value}
          label={`Copy ${label.toLowerCase()}`}
        />
      </div>
      {messages ? (
        <div className="message-list">
          {messages.map((message, index) => (
            <div
              className="record-message"
              key={index}
            >
              <strong>{message.role}</strong>
              <pre>
                {typeof message.content === 'string'
                  ? message.content
                  : JSON.stringify(message.content, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <pre>
          {decoded === undefined ? value || 'No text recorded.' : JSON.stringify(decoded, null, 2)}
        </pre>
      )}
    </div>
  );
};

const ConfigPanel = ({ client, cid }) => {
  const [attempt, setAttempt] = useState(0);
  const config = useRecord(client, 'config', cid, attempt);
  if (config.loading)
    return (
      <div className="config-panel">
        <Skeleton h={65} />
      </div>
    );
  if (config.error)
    return (
      <div className="config-panel">
        <ErrorNotice message={config.error} />
        <Button
          size="xs"
          variant="default"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry configuration
        </Button>
      </div>
    );
  if (!config.data) return null;
  const { system_prompt, llm_config, tools, metadata } = config.data;
  const { model, ...settings } = llm_config;
  return (
    <div className="config-panel">
      <p>Configuration referenced by this recorded call.</p>
      {typeof model === 'string' && (
        <Field label="Model">
          <strong>{model}</strong>
        </Field>
      )}
      {system_prompt && (
        <Payload
          label="System prompt"
          value={system_prompt}
        />
      )}
      {Object.keys(settings).length > 0 && (
        <Payload
          label="Model settings"
          value={JSON.stringify(settings, null, 2)}
        />
      )}
      {tools.length > 0 && (
        <Payload
          label="Configured tools"
          value={JSON.stringify(tools, null, 2)}
        />
      )}
      {Object.keys(metadata).length > 0 && (
        <Payload
          label="Configuration metadata"
          value={JSON.stringify(metadata, null, 2)}
        />
      )}
    </div>
  );
};

export const DutPanel = ({ data, node, client, demo, back }) => {
  const [tab, setTab] = useState('output');
  return (
    <section
      className="inspector-body dut-body"
      aria-label="Recorded call details"
    >
      {back && (
        <Button
          className="evidence-back"
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={15} />}
          onClick={back}
        >
          Back to step
        </Button>
      )}
      <div className="inspector-title">
        <h3>{callLabel(node)}</h3>
      </div>
      <RecordTimes
        cid={data.cid}
        occurredAt={data.occurred_at}
        client={client}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        keepMounted={false}
        className="dut-tabs"
      >
        <Tabs.List>
          <Tabs.Tab value="output">Output</Tabs.Tab>
          <Tabs.Tab value="input">Input</Tabs.Tab>
          <Tabs.Tab value="config">Configuration</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="output">
          <Payload
            label="Recorded output"
            value={data.agent_output}
          />
        </Tabs.Panel>
        <Tabs.Panel value="input">
          <Payload
            label="Recorded input"
            value={data.input_context}
          />
        </Tabs.Panel>
        <Tabs.Panel value="config">
          <ConfigPanel
            client={client}
            cid={data.config_cid}
          />
        </Tabs.Panel>
      </Tabs>
      {data.business_object_keys.length > 0 && (
        <Field label="Issue or business keys">
          {data.business_object_keys.map((key) => (
            <strong key={key}>{key}</strong>
          ))}
        </Field>
      )}
      <Verification
        key={data.cid}
        client={client}
        cid={data.cid}
        demo={demo}
      />
      <details className="record-details">
        <summary>Record details</summary>
        <p>AITS stores calls as DUTs (Data Unique Tags).</p>
        <CidField
          label="Call CID"
          value={data.cid}
          help="Content identifier. A fingerprint of this stored call."
        />
        <CidField
          label="Configuration CID"
          value={data.config_cid}
        />
        <CidField
          label="Agent CID"
          value={data.agent_cid}
        />
        <Field label="Runtime span ID">
          <code>{data.span_id}</code>
        </Field>
        <Field label="Recorded sequence">
          <code>{data.sequence}</code>
          <small>Index supplied by the recorder. The n8n demo records one call and uses 0.</small>
        </Field>
        {data.artifact_cids.map((cid) => (
          <CidField
            key={cid}
            label="Artifact CID"
            value={cid}
          />
        ))}
      </details>
    </section>
  );
};

export const AuditView = ({ client, demo }) => {
  const [attempt, setAttempt] = useState(0);
  const { data, loading, error } = useRecord(client, 'audit', attempt ? true : null, attempt);
  return (
    <section
      className="audit-panel"
      aria-labelledby="audit-title"
    >
      <div className="audit-heading">
        <span className="trace-hero-icon">
          <IconShieldCheck size={22} />
        </span>
        <div>
          <h1 id="audit-title">Ledger audit</h1>
          <p>Check the integrity of stored records and the ledger’s chain of entries.</p>
        </div>
      </div>
      <Button
        leftSection={<IconFingerprint size={16} />}
        loading={loading}
        onClick={() => setAttempt((value) => value + 1)}
      >
        {demo ? 'Run sample audit' : 'Run full audit'}
      </Button>
      {error && <ErrorNotice message={error} />}
      {data && (
        <div
          className="audit-result"
          aria-live="polite"
        >
          <Badge
            size="lg"
            variant="light"
            color={data.valid ? 'teal' : 'red'}
          >
            {data.valid ? (demo ? 'Sample audit passed' : 'Audit passed') : 'Audit found issues'}
          </Badge>
          <p>
            {data.nodes_verified} of {data.nodes_checked} records passed · {data.commit_entries}
            {' ledger entries checked'}
          </p>
          {data.failures.length > 0 && (
            <ul className="audit-findings">
              {data.failures.map((finding, index) => (
                <li key={index}>
                  <strong>{findingLabel(finding.property_violated)}</strong>
                  <p>{finding.message}</p>
                  {finding.record_kind === 'node' && isCid(finding.record_key) ? (
                    <code>{finding.record_key}</code>
                  ) : (
                    <small>
                      {finding.record_kind} {finding.record_key}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export const EvidenceDock = ({ label, close, share, children }) => {
  return (
    <aside
      className="board-dock"
      aria-label={label}
    >
      <div className="dock-toolbar">
        <strong>{label}</strong>
        <div>
          {share && (
            <CopyControl
              value={share}
              label="Copy link to selection"
            />
          )}
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Close details"
            onClick={close}
          >
            <IconX size={17} />
          </ActionIcon>
        </div>
      </div>
      {children}
    </aside>
  );
};
