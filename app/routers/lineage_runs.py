"""Search and display projections over recorded lineage, outside the hashed records."""

import re
from datetime import datetime
from itertools import batched
from typing import Literal

from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, Field
from sqlmodel import Session, select

from ..models import DataUniqueTag, LineageTag
from .common import Label, cid_from_hex

_POLICY = re.compile(r"policy-v\d+:([^:]+)(?::(.+))?")


class RecordedDecision(BaseModel):
    cid: str
    outcome: str
    reason: str | None


class RunSummary(BaseModel):
    root: str
    root_step_id: str
    actor_id: str
    workflow_id: str | None
    workflow_name: str | None
    execution_id: str | None
    started_at: datetime = Field(description="Event time of the root lineage step")
    last_occurred_at: datetime = Field(description="Latest step event time in the run")
    nodes: int
    span_count: int = Field(description="Number of distinct attached DUT records")
    business_keys: list[str]
    decisions: list[RecordedDecision]


class RunQuery(BaseModel):
    q: Label = ""
    workflow: Label = ""
    business_key: Label = ""
    decision: Label = ""
    has_decision: bool | None = None
    started_from: AwareDatetime | None = Field(default=None, description="Inclusive start bound")
    started_before: AwareDatetime | None = Field(default=None, description="Exclusive start bound")
    sort: Literal["started", "activity"] = "started"
    limit: int = Field(default=24, ge=1, le=100)
    after: str | None = Field(default=None, max_length=140, description="Previous page's cursor")


class RunPage(BaseModel):
    runs: list[RunSummary]
    total: int
    next_cursor: str | None


def business_keys_by_dut(
    session: Session, rows: list[LineageTag] | None = None
) -> dict[bytes, list[str]]:
    """Read just the searchable DUT columns, without loading prompts or outputs."""
    query = select(DataUniqueTag.cid, DataUniqueTag.business_object_keys)
    if rows is None:
        attached = select(LineageTag.dut_cid).where(LineageTag.dut_cid.is_not(None))
        return dict(session.exec(query.where(DataUniqueTag.cid.in_(attached))).all())

    keys: dict[bytes, list[str]] = {}
    attached_cids = {row.dut_cid for row in rows if row.dut_cid is not None}
    for batch in batched(attached_cids, 500):
        keys.update(session.exec(query.where(DataUniqueTag.cid.in_(batch))).all())
    return keys


def _n8n_identity(root: LineageTag) -> tuple[str | None, str | None, str | None]:
    if root.actor_id != "n8n" or not root.step_id.startswith("n8n:"):
        return None, None, None
    workflow_id, _, execution_id = root.step_id.removeprefix("n8n:").rpartition(":")
    if not workflow_id or not execution_id:
        return None, None, None
    kind, _, name = root.transformation.partition(":")
    return (
        workflow_id,
        execution_id,
        (name.strip() or None) if kind == "workflow_execution" else None,
    )


def _recorded_decisions(rows: list[LineageTag]) -> list[RecordedDecision]:
    decisions = []
    for row in rows:
        match = _POLICY.fullmatch(row.transformation)
        if match:
            decision = RecordedDecision(cid=row.cid.hex(), outcome=match[1], reason=match[2])
            decisions.append((row.occurred_at, decision))
    decisions.sort(key=lambda entry: (entry[0], entry[1].cid))
    return [decision for _, decision in decisions]


def summarize_run(
    root_cid: bytes, rows: list[LineageTag], keys_by_dut: dict[bytes, list[str]]
) -> RunSummary:
    root = next(row for row in rows if row.cid == root_cid)
    workflow_id, execution_id, workflow_name = _n8n_identity(root)
    dut_cids = {row.dut_cid for row in rows if row.dut_cid is not None}
    return RunSummary(
        root=root.cid.hex(),
        root_step_id=root.step_id,
        actor_id=root.actor_id,
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        execution_id=execution_id,
        started_at=root.occurred_at,
        last_occurred_at=max(row.occurred_at for row in rows),
        nodes=len(rows),
        span_count=len(dut_cids),
        business_keys=sorted({key for cid in dut_cids for key in keys_by_dut.get(cid, ())}),
        decisions=_recorded_decisions(rows),
    )


def _matches(query: RunQuery, run: RunSummary) -> bool:
    if query.started_from is not None and run.started_at < query.started_from:
        return False
    if query.started_before is not None and run.started_at >= query.started_before:
        return False
    if query.has_decision is not None and bool(run.decisions) != query.has_decision:
        return False
    outcome = query.decision.strip().casefold()
    if outcome and all(decision.outcome.casefold() != outcome for decision in run.decisions):
        return False

    workflow = (run.workflow_name or "", run.workflow_id or "")
    if query.workflow.strip() and not _contains(query.workflow, workflow):
        return False
    if query.business_key.strip() and not _contains(query.business_key, run.business_keys):
        return False
    if not query.q.strip():
        return True
    execution = f"n8n run #{run.execution_id}" if run.execution_id else ""
    return _contains(
        query.q,
        (run.root, run.root_step_id, run.actor_id, execution, *workflow, *run.business_keys),
    )


def _contains(needle: str, fields: list[str] | tuple[str, ...]) -> bool:
    folded = needle.strip().casefold()
    return any(folded in field.casefold() for field in fields)


def _cursor_key(after: str) -> tuple[datetime, str]:
    timestamp, _, root = after.partition("~")
    try:
        time = datetime.fromisoformat(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid run search cursor") from exc
    if time.utcoffset() is None:
        raise HTTPException(status_code=400, detail="Invalid run search cursor")
    return time, cid_from_hex(root, field="cursor root").hex()


def search_runs(
    grouped: dict[bytes, list[LineageTag]], keys_by_dut: dict[bytes, list[str]], query: RunQuery
) -> RunPage:
    if query.started_from and query.started_before and query.started_from >= query.started_before:
        raise HTTPException(status_code=400, detail="Start bound must precede end bound")
    cursor = _cursor_key(query.after) if query.after else None

    def order(run: RunSummary) -> tuple[datetime, str]:
        return (run.last_occurred_at if query.sort == "activity" else run.started_at), run.root

    summaries = (summarize_run(root, rows, keys_by_dut) for root, rows in grouped.items())
    matches = sorted((run for run in summaries if _matches(query, run)), key=order, reverse=True)
    remaining = [run for run in matches if order(run) < cursor] if cursor else matches
    page = remaining[: query.limit]
    next_cursor = None
    if len(remaining) > len(page):
        timestamp, root = order(page[-1])
        next_cursor = f"{timestamp.isoformat()}~{root}"
    return RunPage(runs=page, total=len(matches), next_cursor=next_cursor)
