import {
  ActionIcon,
  Badge,
  Button,
  NativeSelect,
  Skeleton,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconCalendarEvent,
  IconChevronRight,
  IconFilter,
  IconRefresh,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import {
  decisionColor,
  decisionLabel,
  executionLabel,
  formatDate,
  hasRunFilters,
  runDate,
  runLabel,
  timeZone,
} from './ledger.js';
import { ErrorNotice } from './Evidence.jsx';

const ranges = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom range' },
];
const decisions = [
  { value: '', label: 'Any decision' },
  { value: 'allow', label: 'Allowed' },
  { value: 'review', label: 'Needs review' },
  { value: 'recorded', label: 'Has a decision' },
  { value: 'missing', label: 'No decision recorded' },
];
const sorts = [
  { value: 'started', label: 'Newest start first' },
  { value: 'activity', label: 'Latest activity first' },
];

const RunRow = ({ run, active, open, sort }) => {
  const last = run.decisions.at(-1);
  const date = sort === 'activity' ? run.last_occurred_at : run.started_at;
  const keyLabel =
    run.business_keys.length > 1
      ? `${run.business_keys[0]} +${run.business_keys.length - 1}`
      : run.business_keys[0];
  return (
    <button
      type="button"
      className="run-card"
      aria-current={active ? 'true' : undefined}
      onClick={() => open(run.root)}
    >
      <span className="run-copy">
        <strong>{runLabel(run)}</strong>
        <span>{executionLabel(run)}</span>
      </span>
      <IconChevronRight
        className="run-arrow"
        size={15}
      />
      <span className="run-date">
        <time dateTime={date}>{formatDate(date, runDate)}</time>
      </span>
      <span className="run-meta">
        {keyLabel && (
          <span
            className="run-key"
            title={run.business_keys.join(', ')}
          >
            {keyLabel}
          </span>
        )}
        {last ? (
          <Badge
            variant="light"
            size="sm"
            color={decisionColor(last.outcome)}
          >
            {run.decisions.length === 1
              ? decisionLabel(last.outcome)
              : `${run.decisions.length} decisions`}
          </Badge>
        ) : (
          <span className="muted">No decision recorded</span>
        )}
      </span>
    </button>
  );
};

const RunRail = ({ filters, update, clear, list, active, open, refresh }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { runs, total, loading, error, nextCursor, loadMore } = list;
  const filtered = hasRunFilters(filters);
  const extraCount = [filters.workflow, filters.businessKey, filters.decision].filter(
    Boolean,
  ).length;
  const bind = (name) => ({
    value: filters[name],
    onChange: (event) => update(name, event.currentTarget.value),
  });

  return (
    <aside
      className="rail"
      aria-label="Run browser"
    >
      <div className="rail-heading">
        <h2>Runs</h2>
        <Tooltip label="Refresh runs">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Refresh runs"
            onClick={refresh}
          >
            <IconRefresh size={17} />
          </ActionIcon>
        </Tooltip>
      </div>
      <TextInput
        label="Search runs"
        placeholder="Workflow, issue key, or CID"
        size="sm"
        {...bind('q')}
        maxLength={2048}
        leftSection={<IconSearch size={15} />}
        rightSection={
          filters.q && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Clear search"
              onClick={() => update('q', '')}
            >
              <IconX size={15} />
            </ActionIcon>
          )
        }
      />
      <div className="run-filters">
        <NativeSelect
          label="Run start"
          size="sm"
          data={ranges}
          leftSection={<IconCalendarEvent size={15} />}
          {...bind('range')}
        />
        {filters.range === 'custom' && (
          <div className="date-range">
            <TextInput
              type="datetime-local"
              label="From"
              size="xs"
              {...bind('from')}
            />
            <TextInput
              type="datetime-local"
              label="Before"
              size="xs"
              {...bind('until')}
            />
            <small>Local time · {timeZone}. Leave either end blank for an open range.</small>
          </div>
        )}
        <div className="filter-actions">
          <Button
            variant={extraCount ? 'light' : 'default'}
            color={extraCount ? 'violet' : 'gray'}
            size="xs"
            leftSection={<IconFilter size={14} />}
            aria-expanded={moreOpen}
            aria-controls="extra-run-filters"
            onClick={() => setMoreOpen((value) => !value)}
          >
            {extraCount ? `More filters (${extraCount})` : 'More filters'}
          </Button>
          {filtered && (
            <button
              className="text-button"
              onClick={clear}
            >
              Clear filters
            </button>
          )}
        </div>
        <div
          id="extra-run-filters"
          className="extra-filters"
          hidden={!moreOpen}
        >
          <TextInput
            label="Workflow name or ID"
            size="xs"
            maxLength={2048}
            {...bind('workflow')}
          />
          <TextInput
            label="Issue or business key"
            placeholder="e.g. demo/widgets#42"
            size="xs"
            maxLength={2048}
            {...bind('businessKey')}
          />
          <NativeSelect
            label="Recorded decision"
            size="xs"
            data={decisions}
            {...bind('decision')}
          />
        </div>
        <NativeSelect
          label="Sort runs"
          size="xs"
          data={sorts}
          {...bind('sort')}
        />
      </div>
      <div
        className="rail-caption"
        role="status"
      >
        {total == null
          ? 'Runs'
          : `Showing ${runs.length} of ${total} ${filtered ? 'matching ' : ''}${
              total === 1 ? 'run' : 'runs'
            }`}
      </div>
      {error && <ErrorNotice message={error} />}
      {loading && !runs.length && (
        <div
          className="rail-loading"
          aria-label="Loading runs"
        >
          <Skeleton h={92} />
          <Skeleton h={92} />
        </div>
      )}
      <div
        className="run-list"
        aria-busy={loading}
      >
        {runs.map((run) => (
          <RunRow
            key={run.root}
            run={run}
            sort={filters.sort}
            active={active === run.root}
            open={open}
          />
        ))}
      </div>
      {nextCursor && (
        <Button
          variant="default"
          size="xs"
          fullWidth
          className="more-runs"
          loading={loading}
          onClick={loadMore}
        >
          {error ? 'Retry loading more runs' : 'Load more runs'}
        </Button>
      )}
      {total === 0 && !error && (
        <div className="rail-empty">
          {filtered ? 'No runs match these filters.' : 'No lineage runs have been recorded yet.'}
        </div>
      )}
    </aside>
  );
};
export default RunRail;
