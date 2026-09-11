"""Metadata preview, execute, and the generated-query view."""

from __future__ import annotations

from tests.conftest import steps

PUMP = {"kind": "entity", "alias": "pump", "cls": {"id": "c_pump", "label": "Pump"}}
RO = {"kind": "entity", "alias": "ro", "cls": {"id": "c_ro", "label": "Reverse Osmosis Unit"}}
RO_MEASUREMENTS = {"kind": "measurement", "alias": "m", "frm": "ro"}
ONLY_PRESSURE = {
    "kind": "where",
    "target": "m",
    "attrs": [{"name": "quantity_kind", "value": {"id": "q_pressure", "label": "Pressure"}}],
}


def test_metadata_lists_matches_with_their_type(client):
    body = client.post("/api/query/metadata", json=steps(PUMP)).json()
    # Named for what was matched, not for the alias that bound it: the alias
    # is bookkeeping, and the brief keeps bookkeeping out of the default UI.
    assert body["columns"][:2] == ["Pump", "Pump type"]
    assert {row[0] for row in body["rows"]} == {"P1", "P2"}
    assert all(row[1] == "Pump" for row in body["rows"])


def test_metadata_on_an_empty_query_explains_itself(client):
    body = client.post("/api/query/metadata", json={"steps": []}).json()
    assert body["rows"] == []
    assert body["empty_reason"]


def test_a_query_matching_nothing_gets_a_message_not_a_crash(client):
    """Non-functional requirement: no results is a message, not an error."""
    impossible = dict(PUMP)
    impossible["attrs"] = [
        {"name": "medium", "value": {"id": "m_permeate", "label": "Permeate"}}
    ]
    response = client.post("/api/query/metadata", json=steps(impossible))

    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert body["empty_reason"]


def test_relating_an_entity_walks_the_topology(client):
    body = client.post(
        "/api/query/metadata",
        json=steps(
            RO,
            {"kind": "related", "alias": "tank", "frm": "ro",
             "cls": {"id": "c_tank", "label": "Tank"}},
        ),
    ).json()
    assert [row[0] for row in body["rows"]] == ["RO"]
    assert [row[2] for row in body["rows"]] == ["T2"]


def test_where_narrows_measurements_to_the_three_ro_pressures(client):
    """The cookbook's "pressure drop across the RO" shape: three points."""
    body = client.post(
        "/api/query/metadata", json=steps(RO, RO_MEASUREMENTS, ONLY_PRESSURE)
    ).json()

    point_labels = {row[2] for row in body["rows"]}
    assert point_labels == {
        "RO Feed Pressure",
        "RO Permeate Pressure",
        "RO Brine Pressure",
    }


def test_a_negated_filter_excludes_instead_of_includes(client):
    negated = dict(ONLY_PRESSURE)
    negated["attrs"] = [{**ONLY_PRESSURE["attrs"][0], "negated": True}]

    body = client.post(
        "/api/query/metadata", json=steps(RO, RO_MEASUREMENTS, negated)
    ).json()

    assert body["rows"]
    assert all("Pressure" not in row[3] for row in body["rows"])


def test_refocus_branches_from_an_earlier_node(client):
    """Story 6: go back to a pinned node and relate a second thing to it."""
    body = client.post(
        "/api/query/metadata",
        json=steps(
            RO,
            {"kind": "related", "alias": "tank", "frm": "ro",
             "cls": {"id": "c_tank", "label": "Tank"}},
            {"kind": "refocus", "target": "ro"},
            {"kind": "related", "alias": "px",
             "cls": {"id": "c_px", "label": "Pressure Exchanger"}},
        ),
    ).json()

    assert body["rows"], "refocus must branch from RO, not continue from the tank"
    assert {row[4] for row in body["rows"]} == {"PX1"}


def test_execute_returns_a_wide_frame_with_a_time_column(client):
    body = client.post(
        "/api/query/execute?limit=5", json=steps(RO, RO_MEASUREMENTS, ONLY_PRESSURE)
    ).json()

    assert body["columns"][0] == "time"
    assert len(body["columns"]) == 4  # time + the three RO pressure points
    assert len(body["rows"]) == 5
    # The unit belongs in the header, so an operator reads a number in context.
    assert all("bar" in column for column in body["columns"][1:])


def test_execute_without_a_measurement_says_why_there_is_no_data(client):
    body = client.post("/api/query/execute", json=steps(RO)).json()
    assert body["rows"] == []
    assert "measurement" in body["empty_reason"].lower()


def test_generated_query_reads_as_the_python_it_stands_for(client):
    body = client.post(
        "/api/query/generated", json=steps(RO, RO_MEASUREMENTS)
    ).json()

    assert body["python"].startswith("acq.query()")
    assert ".entity(" in body["python"]
    assert ".measurement(" in body["python"]
    assert body["python"].rstrip().endswith(".metadata()")


def test_relating_before_any_entity_is_a_readable_message(client):
    response = client.post(
        "/api/query/metadata",
        json=steps({"kind": "related", "cls": {"id": "c_tank", "label": "Tank"}}),
    )
    assert response.status_code == 422
    assert "entity" in response.json()["detail"].lower()
