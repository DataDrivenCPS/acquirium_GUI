"""The natural-language placeholder.

Not a feature test -- these pin the fact that the route reports itself as
unavailable rather than half-working, so the panel can say so honestly.
"""

from __future__ import annotations


def test_llm_reports_itself_unavailable(client):
    body = client.get("/api/llm/status").json()
    assert body["available"] is False
    assert body["detail"]


def test_translate_is_not_implemented(client):
    response = client.post("/api/llm/translate", json={"text": "show me pump pressures"})
    assert response.status_code == 501
