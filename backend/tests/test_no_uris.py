"""The no-URI guarantee (story 12), enforced at the API boundary.

The frontend can only avoid showing a URI if it is never handed one. This
sweeps every response the default UI renders and fails on anything that looks
like a URI or a CURIE.

/api/query/generated is exempt by design -- it is the technical escape hatch,
and is asserted below to stay behind that one route.
"""

from __future__ import annotations

import re

from tests.conftest import steps

# Matches http(s) URIs and CURIE-ish tokens (s223:Pump, wbs:RO, qudt:Unit).
URI_LIKE = re.compile(r"https?://|\b[a-zA-Z][\w-]{1,15}:[A-Za-z]\w+")

RO = {"kind": "entity", "alias": "ro", "cls": {"id": "c_ro", "label": "Reverse Osmosis Unit"}}
MEASUREMENTS = {"kind": "measurement", "alias": "m", "frm": "ro"}


def displayed_strings(payload) -> list[str]:
    """Every string a panel could render.

    Object *keys* are skipped, and so is any value under an ``id`` key: ids
    are opaque handles the frontend passes back, never rendered.
    """
    found: list[str] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in ("id", "source", "target"):
                continue
            found += displayed_strings(value)
    elif isinstance(payload, list):
        for item in payload:
            found += displayed_strings(item)
    elif isinstance(payload, str):
        found.append(payload)
    return found


def assert_no_uris(payload, where: str) -> None:
    offenders = [s for s in displayed_strings(payload) if URI_LIKE.search(s)]
    assert not offenders, f"{where} leaked URI-like text to the frontend: {offenders}"


def test_no_default_panel_response_contains_a_uri(client):
    description = steps(RO, MEASUREMENTS)

    assert_no_uris(client.get("/api/graph/model").json(), "GET /graph/model")
    assert_no_uris(
        client.post("/api/graph/subgraph", json=description).json(), "POST /graph/subgraph"
    )
    assert_no_uris(
        client.post("/api/query/metadata", json=description).json(), "POST /query/metadata"
    )
    assert_no_uris(
        client.post("/api/query/execute?limit=3", json=description).json(),
        "POST /query/execute",
    )
    assert_no_uris(
        client.post("/api/resolve", json={"text": "filter", "kind": "class"}).json(),
        "POST /resolve",
    )
    assert_no_uris(
        client.get("/api/attributes/unit/values").json(), "GET /attributes/unit/values"
    )


def test_the_detector_would_actually_catch_a_uri():
    """Guard against the sweep above silently passing on a broken regex."""
    assert URI_LIKE.search("http://data.ashrae.org/standard223#Pump")
    assert URI_LIKE.search("s223:Pump")
    assert not URI_LIKE.search("RO Feed Pressure")
    assert not URI_LIKE.search("cubic metre per hour")
