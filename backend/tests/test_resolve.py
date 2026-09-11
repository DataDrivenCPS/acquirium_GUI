"""Free-text resolution and the disambiguation rule (story 5).

The behaviour under test is the safety net described in design.md: a
confident match is accepted silently, an ambiguous one must be handed back to
the user as labels to choose between.
"""

from __future__ import annotations


def resolve(client, text, kind="class", **extra):
    return client.post("/api/resolve", json={"text": text, "kind": kind, **extra}).json()


def test_an_exact_name_resolves_confidently(client):
    body = resolve(client, "pump")
    assert body["confident"] is True
    assert body["candidates"][0]["label"] == "Pump"


def test_an_ambiguous_word_asks_the_user_instead_of_guessing(client):
    """"filter" matches several equipment classes, so it must not auto-pick."""
    body = resolve(client, "filter")
    assert body["confident"] is False
    labels = [c["label"] for c in body["candidates"]]
    assert len(labels) > 1
    assert all("Filter" in label for label in labels)


def test_candidates_are_capped_by_the_configured_top_k(client):
    config = client.get("/api/config").json()
    config["resolve_top_k"] = 2
    client.put("/api/config", json=config)

    assert len(resolve(client, "filter")["candidates"]) == 2


def test_relaxing_the_settings_stops_an_ambiguous_word_prompting(client):
    """Story 9b: how much ambiguity is tolerated is the user's call.

    Same input, same candidates -- only the settings change, and with them
    whether the picker appears at all.
    """
    assert resolve(client, "filter")["confident"] is False

    config = client.get("/api/config").json()
    config["confidence_threshold"] = 0.05
    config["close_runner_up_margin"] = 0.0
    client.put("/api/config", json=config)

    assert resolve(client, "filter")["confident"] is True


def test_nonsense_input_returns_no_candidates_rather_than_a_wrong_one(client):
    assert resolve(client, "zzzzqqqq")["candidates"] == []


def test_attribute_values_are_offered_as_labels(client):
    values = client.get("/api/attributes/quantity_kind/values").json()
    assert {"Pressure", "Level"} <= {v["label"] for v in values}


def test_an_unknown_attribute_name_is_rejected(client):
    assert client.get("/api/attributes/not_an_attribute/values").status_code == 422
