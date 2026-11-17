"""Run search operates over the complete recorded history before paging."""

from fastapi.testclient import TestClient

from tests.helpers import create_node, create_root, make_agent, make_config, make_dut


def test_find_old_run_by_date_workflow_key_and_decision(client: TestClient) -> None:
    older = create_root(
        client,
        actor="n8n",
        step_id="n8n:triage-workflow:1041",
        transformation="workflow_execution:Issue triage: East",
        occurred_at="2026-06-10T09:00:00-04:00",
    )["cid"]
    agent = make_agent(client)
    config = make_config(client)
    dut = make_dut(client, agent["uuid"], config["cid"], business_object_keys=["demo/widgets#42"])
    call = create_node(client, older, [older], dut_cid=dut["cid"])["node"]["cid"]
    call_again = create_node(client, older, [call], dut_cid=dut["cid"])["node"]["cid"]
    decision = create_node(client, older, [call_again], transformation="policy-v1:review")["node"]
    newer = create_root(
        client,
        actor="n8n",
        step_id="n8n:legacy:1042",
        transformation="workflow_execution",
        occurred_at="2026-06-11T09:00:00-04:00",
    )["cid"]

    page = client.get("/lineage/runs/", params={"limit": 1}).json()
    assert page["total"] == 2
    assert page["runs"][0]["root"] == newer
    assert page["runs"][0]["workflow_id"] == "legacy"
    assert page["runs"][0]["workflow_name"] is None

    query = {
        "q": "n8n run #1041",
        "workflow": "TRIAGE: EAST",
        "business_key": "widgets#42",
        "decision": "review",
        "started_from": "2026-06-10T13:00:00Z",
        "started_before": "2026-06-11T13:00:00Z",
        "limit": 1,
    }
    result = client.get("/lineage/runs/", params=query)
    assert result.status_code == 200, result.text
    page = result.json()
    assert page["total"] == 1 and page["next_cursor"] is None
    summary = page["runs"][0]
    assert summary["root"] == older and summary["span_count"] == 1
    assert summary["business_keys"] == ["demo/widgets#42"]
    assert summary["decisions"] == [{"cid": decision["cid"], "outcome": "review", "reason": None}]
    assert client.get(f"/lineage/{older}/?include_run=true").json()["run"] == summary
    assert set(client.get(f"/lineage/{older}/").json()) == {"root", "nodes", "frontier"}
    assert (
        client.get("/lineage/runs/", params={**query, "business_key": "no match"}).json()["total"]
        == 0
    )
    assert (
        client.get("/lineage/runs/", params={**query, "workflow": "no match"}).json()["total"] == 0
    )
    assert client.get("/lineage/runs/", params={**query, "q": "no match"}).json()["total"] == 0
    assert client.get("/lineage/runs/", params={**query, "decision": "allow"}).json()["total"] == 0
    without_decision = client.get("/lineage/runs/?has_decision=false").json()
    assert [run["root"] for run in without_decision["runs"]] == [newer]


def test_paging_uses_sort_time_and_root_tiebreak(client: TestClient) -> None:
    when = "2026-06-10T09:00:00Z"
    first = create_root(client, step_id="First", occurred_at=when)["cid"]
    second = create_root(client, step_id="Second", occurred_at=when)["cid"]
    earlier = create_root(client, step_id="Earlier", occurred_at="2026-06-09T09:00:00Z")["cid"]
    create_node(client, earlier, [earlier], occurred_at="2026-06-12T09:00:00Z")

    params = {"sort": "started", "limit": 1}
    roots = []
    for _ in range(3):
        page = client.get("/lineage/runs/", params=params).json()
        assert page["total"] == 3
        roots.append(page["runs"][0]["root"])
        params["after"] = page["next_cursor"]
    assert roots == [*sorted([first, second], reverse=True), earlier]
    assert params["after"] is None

    active = client.get("/lineage/runs/?sort=activity").json()
    assert active["runs"][0]["root"] == earlier
    before = client.get("/lineage/runs/", params={"started_before": when}).json()
    assert [run["root"] for run in before["runs"]] == [earlier]
    assert (
        client.get(
            "/lineage/runs/", params={"started_from": when, "started_before": when}
        ).status_code
        == 400
    )
    assert client.get("/lineage/runs/?started_from=2026-06-10T09:00:00").status_code == 422
    assert client.get("/lineage/runs/?after=invalid").status_code == 400
    assert (
        client.get("/lineage/runs/", params={"after": f"2026-06-10T09:00:00~{first}"}).status_code
        == 400
    )
