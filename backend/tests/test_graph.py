"""The graph panel's two endpoints (requirements.md stories 8, 9, 9a)."""

from __future__ import annotations

from tests.conftest import steps

PUMP = {"kind": "entity", "alias": "pump", "cls": {"id": "c_pump", "label": "Pump"}}
RO = {"kind": "entity", "alias": "ro", "cls": {"id": "c_ro", "label": "Reverse Osmosis Unit"}}


def test_model_graph_is_class_level_on_an_empty_query(client):
    body = client.get("/api/graph/model").json()
    labels = {n["label"] for n in body["nodes"]}

    assert body["nodes"], "the empty-query graph must give the user a starting point"
    assert {"Pump", "Tank"} <= labels
    assert all(n["level"] == "class" for n in body["nodes"])
    # Edges connect nodes that actually exist, or the renderer breaks.
    node_ids = {n["id"] for n in body["nodes"]}
    for edge in body["edges"]:
        assert edge["source"] in node_ids and edge["target"] in node_ids


def test_model_graph_counts_the_units_behind_each_class(client):
    """How many real units a class node stands for.

    The graph is class-level, so "Pump" is one box whether the plant has one
    pump or twelve. The count is what lets the UI say which -- and it is the
    reason a node relabels to "CF1" but "Pump" stays "Pump".
    """
    nodes = {n["id"]: n for n in client.get("/api/graph/model").json()["nodes"]}

    assert nodes["c_pump"]["instance_count"] == 2  # P1 and P2
    assert nodes["c_ro"]["instance_count"] == 1
    assert all(n["instance_count"] >= 1 for n in nodes.values())


def test_model_graph_simplifies_past_the_configured_node_limit(client):
    config = client.get("/api/config").json()
    config["graph_node_limit"] = 2
    client.put("/api/config", json=config)

    body = client.get("/api/graph/model").json()
    assert body["simplified"] is True
    assert len(body["nodes"]) == 2
    # The user is told how much was left out rather than shown a partial
    # plant with no explanation.
    assert body["total_nodes"] > 2


def test_subgraph_highlights_what_the_query_touches(client):
    body = client.post("/api/graph/subgraph", json=steps(PUMP)).json()
    assert "c_pump" in body["highlighted_nodes"]
    assert "c_tank" not in body["highlighted_nodes"]


def test_subgraph_relabels_a_class_node_to_the_matched_instance(client):
    """Story 9a: once one real unit matches, the node shows its own name."""
    body = client.post("/api/graph/subgraph", json=steps(RO)).json()
    assert body["relabeled"]["c_ro"] == "RO"


def test_subgraph_keeps_the_class_label_when_several_instances_match(client):
    """Two pumps match, so "Pump" is still the honest label for that node."""
    body = client.post("/api/graph/subgraph", json=steps(PUMP)).json()
    assert "c_pump" not in body["relabeled"]


def test_related_step_highlights_the_connecting_edge(client):
    """Story 9: the edge between matched nodes highlights, not just the nodes."""
    body = client.post(
        "/api/graph/subgraph",
        json=steps(
            RO,
            {
                "kind": "related",
                "alias": "tank",
                "frm": "ro",
                "cls": {"id": "c_tank", "label": "Tank"},
            },
        ),
    ).json()

    assert {"c_ro", "c_tank"} <= set(body["highlighted_nodes"])
    assert body["highlighted_edges"], "the connection walked must highlight too"


def test_subgraph_of_an_empty_query_highlights_nothing(client):
    body = client.post("/api/graph/subgraph", json={"steps": []}).json()
    assert body["highlighted_nodes"] == []
    assert body["relabeled"] == {}
