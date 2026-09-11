"""Health and the settings round-trip (design.md's Configuration section)."""

from __future__ import annotations


def test_health_reports_which_adapter_is_wired_in(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["adapter"] == "stub"
    # The UI says plainly that it is showing sample data rather than implying
    # it is connected to a plant.
    assert body["acquirium_connected"] is False
    assert body["detail"]


def test_config_returns_defaults_when_no_file_exists(client):
    body = client.get("/api/config").json()
    assert 0.0 <= body["confidence_threshold"] <= 1.0
    assert body["graph_node_limit"] >= 1
    # Readings are fetched as the query changes by default; a plant with big
    # timeseries can turn that off rather than pay for it on every edit.
    assert body["auto_retrieve_data"] is True
    assert body["resolve_top_k"] >= 1


def test_config_put_persists_and_is_read_back(client):
    current = client.get("/api/config").json()
    current["confidence_threshold"] = 0.99
    current["graph_node_limit"] = 7

    written = client.put("/api/config", json=current)
    assert written.status_code == 200
    assert written.json()["confidence_threshold"] == 0.99

    # Survives a fresh read, i.e. it actually reached the file rather than
    # living in process memory.
    assert client.get("/api/config").json()["graph_node_limit"] == 7


def test_config_rejects_an_out_of_range_threshold(client):
    current = client.get("/api/config").json()
    current["confidence_threshold"] = 4.2
    assert client.put("/api/config", json=current).status_code == 422
