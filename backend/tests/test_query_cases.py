"""Awkward query step combinations run through POST /query/run against the WaterTAP data.

Each test is one case, chosen because it could plausibly break the translation or Acquirium's query.
Tests marked xfail(strict=True) document a bug that exists today: the test states the behavior we want,
fails now, and will report an unexpected pass (so the marker can be removed) once the bug is fixed.
"""
import pytest
from fastapi.testclient import TestClient
import src.server as server
from src.server import app
from test_server import wait_for_rows

# Classes in the WaterTAP graph: "tank" matches exactly one class, but "pump" matches an ASHRAE 223 class
# and a water ontology class equally well, so it needs a pick
TANK, MIXER = "tank", "StaticMixer"

def attr(name, value, exclude=False):
    return {"attr": name, "value": value, "exclude": exclude}

def entity(cls, alias=None, **extra):
    return {"kind": "entity", "cls": cls, "alias": alias, **extra}

def related(cls, alias=None, **extra):
    return {"kind": "related", "cls": cls, "alias": alias, **extra}

class TestWatertapQueryCases:

    @pytest.fixture(autouse=True)
    def ready(self, watertap_server):
        """The streams are loaded, and `run` posts steps and returns the response without raising on a server error."""
        wait_for_rows(lambda: server.acq.query().measurement().metadata())
        client = TestClient(app=app, raise_server_exceptions=False)  # no `with`: the fixture's server is already running
        self.run = lambda *steps: client.post("/query/run", json={"steps": list(steps)})

    def pairs(self, response, left, right):
        """The (left, right) alias pairs of a run, ignoring row order and the label columns."""
        body = response.json()
        i, j = body["columns"].index(left), body["columns"].index(right)
        return {(row[i], row[j]) for row in body["rows"]}

    # ---------- pointer and ordering ----------

    # Asserts that a refocus sends a later measurement step back to the first node, not the last one added:
    # tank -> mixer -> refocus tank -> measurements gives the same tank/measurement pairs as tank -> measurements
    @pytest.mark.slow
    def test_refocus_moves_where_later_steps_attach(self):
        plain = self.run(entity(TANK, "t"), {"kind": "measurement", "alias": "d"})
        refocused = self.run(entity(TANK, "t"), related(MIXER, "m"), {"kind": "refocus", "alias": "t"},
                             {"kind": "measurement", "alias": "d"})
        assert plain.status_code == refocused.status_code == 200
        assert self.pairs(plain, "t", "d")  # not vacuous: tanks do have measurements
        assert self.pairs(refocused, "t", "d") == self.pairs(plain, "t", "d")

    # Asserts that without the refocus the measurement attaches to the newest node (a mixer, which has no
    # measurements nearby), so the same steps minus the refocus find nothing
    @pytest.mark.slow
    def test_without_refocus_the_measurement_follows_the_last_node(self):
        body = self.run(entity(TANK, "t"), related(MIXER, "m"), {"kind": "measurement", "alias": "d"}).json()
        assert body["total_rows"] == 0
        assert "m" in body["columns"]

    # Asserts that a filter and its exclusion split a result exactly: every mixer is in one set or the other
    @pytest.mark.slow
    def test_filter_and_its_exclusion_partition_the_rows(self):
        everything = self.run(entity(MIXER)).json()["total_rows"]
        named = self.run(entity(MIXER, filters=[attr("label", "CO2 Addition")])).json()["total_rows"]
        others = self.run(entity(MIXER, filters=[attr("label", "CO2 Addition", True)])).json()["total_rows"]
        assert (named, others) == (1, everything - 1)

    # Asserts that a where step after a related step can aim back at an earlier alias by name
    @pytest.mark.slow
    def test_where_can_target_an_earlier_alias(self):
        response = self.run(entity(MIXER, "m"), related(TANK, "t"),
                            {"kind": "where", "target": "m", "filters": [attr("label", "CO2 Addition")]})
        assert response.status_code == 200
        assert {row[response.json()["columns"].index("m.label")] for row in response.json()["rows"]} <= {"CO2 Addition"}

    # ---------- steps that cannot work: a clear message, never a crash ----------

    # Asserts that each of these mistakes is a 400 whose message names the problem, and carries no candidates
    @pytest.mark.slow
    @pytest.mark.parametrize("steps, message", [
        ([entity(TANK, "x"), entity(MIXER, "x")], "already used"),
        ([entity(TANK), {"kind": "refocus", "alias": "nope"}], "unknown alias 'nope'"),
        ([related(TANK)], "no source node"),
        ([entity(TANK), {"kind": "measurement", "frm": "nope"}], "no source node"),
        ([entity(TANK), {"kind": "where", "target": "nope", "filters": [attr("label", "x")]}], "unknown target alias 'nope'"),
        ([entity(TANK), {"kind": "include", "names": ["bogus"]}], "unknown column 'bogus'"),
        ([entity(TANK), {"kind": "include", "names": ["unit"]}], "does not apply to entity"),
        ([entity(TANK, filters=[attr("unit", "BAR")])], "does not apply to entity"),
        ([entity(TANK, "t"), related(MIXER, via="zzqx wkp")], "could not resolve via predicate"),
        ([entity(None)], "provide cls"),
        ([{"kind": "refocus", "alias": "p"}], "unknown alias"),
        ([{"kind": "include", "names": ["unit"]}], "no current node"),
        ([{"kind": "include", "names": ["label"]}], "nothing to run"),
        ([{"kind": "where", "filters": [attr("label", "x")]}], "no current node"),
    ], ids=["duplicate-alias", "refocus-unknown", "related-first", "measurement-from-unknown", "where-unknown-target",
            "include-bogus", "include-unit-on-entity", "data-only-filter-on-entity", "bad-via", "blank-entity",
            "refocus-first", "include-first", "include-label-only", "where-first"])
    def test_mistakes_are_400_with_a_message(self, steps, message):
        response = self.run(*steps)
        assert response.status_code == 400
        assert message in response.json()["detail"]
        assert response.json()["candidates"] == []

    # ---------- naming and identifiers ----------

    # Asserts that the same class used twice without aliases gets two distinct columns, not one overwritten column
    @pytest.mark.slow
    def test_same_class_twice_without_aliases_gives_distinct_columns(self):
        body = self.run(entity(TANK), related(TANK)).json()
        names = [c for c in body["columns"] if not c.endswith(".label")]
        assert len(names) == 2 and len(set(names)) == 2

    # Asserts that asking for the label again after the automatic label does not duplicate its column
    @pytest.mark.slow
    def test_asking_for_a_label_twice_gives_one_label_column(self):
        body = self.run(entity(TANK, "t"), {"kind": "include", "names": ["label"]}).json()
        assert body["columns"] == ["t", "t.label"]

    # Asserts the whole pick flow on the ambiguous class: "pump" lists two sources, and the first candidate's
    # identifier, sent as the class the way the page does after a pick, runs
    @pytest.mark.slow
    def test_ambiguous_class_can_be_run_once_a_candidate_is_picked(self):
        ambiguous = self.run(entity("pump", "p"))
        assert ambiguous.status_code == 400
        candidates = ambiguous.json()["candidates"]
        assert {c["source"] for c in candidates} == {"ASHRAE 223", "Water ontology"}
        assert ambiguous.json()["text"] == "pump"
        for candidate in candidates:
            picked = self.run(entity(candidate["uri"], "p"))
            assert picked.status_code == 200, candidate

    # Asserts that class text is trimmed and case-insensitive, so what a user types loosely still matches
    @pytest.mark.slow
    def test_class_text_ignores_case_and_spaces(self):
        assert self.run(entity("  STATICMIXER  ")).json()["total_rows"] == self.run(entity(MIXER)).json()["total_rows"]

    # ---------- known bugs (expected to fail until fixed) ----------

    # Asserts that including a label on a measurement node is not a server error (measurement nodes already
    # carry a label column, and Acquirium fails on a duplicate)
    @pytest.mark.slow
    def test_label_include_on_a_measurement_is_not_a_server_error(self):
        response = self.run({"kind": "measurement", "alias": "d"}, {"kind": "include", "names": ["label"]})
        assert response.status_code == 200
        assert response.json()["columns"] == ["d", "d.label"]

    # Asserts that a single quote in a filter value is harmless (it matches nothing, rather than breaking the query)
    @pytest.mark.slow
    def test_single_quote_in_a_filter_value_is_harmless(self):
        response = self.run({"kind": "measurement", "filters": [attr("label", "it's")]})
        assert response.status_code == 200 and response.json()["total_rows"] == 0

    # Asserts that quotes and injection text in a filter value are plain text that matches nothing, not a broken query
    @pytest.mark.slow
    @pytest.mark.parametrize("value", ['a"b', 'a\\b', 'a"} UNION {?x ?y ?z', "line\nbreak"],
                             ids=["double-quote", "backslash", "injection", "newline"])
    def test_special_characters_in_a_filter_value_match_nothing(self, value):
        response = self.run({"kind": "measurement", "filters": [attr("label", value)]})
        assert response.status_code == 200 and response.json()["total_rows"] == 0

    # Asserts that a label with quotes in it is still found, so escaping does not change what a value means
    @pytest.mark.slow
    def test_escaping_does_not_change_which_label_matches(self):
        everything = self.run({"kind": "measurement", "alias": "d"}).json()
        label = everything["rows"][0][everything["columns"].index("d.label")]
        found = self.run({"kind": "measurement", "filters": [attr("label", label)]}).json()
        assert found["total_rows"] >= 1

    # Asserts that an identifier-like value that could break out of <...> is a 400, not a query
    @pytest.mark.slow
    def test_malformed_identifier_is_a_400(self):
        response = self.run({"kind": "measurement", "filters": [attr("medium", "urn:x> } UNION { ?a ?b ?c #")]})
        assert response.status_code == 400
        assert "not a valid identifier" in response.json()["detail"]

    # Asserts that an entity step for an identifier that is not in the graph is a 400 saying so, not a made-up row
    @pytest.mark.slow
    def test_unknown_uri_is_rejected(self):
        response = self.run({"kind": "entity", "uri": "wbs:nope-not-here"})
        assert response.status_code == 400
        assert "No entity found" in response.json()["detail"]

    # Asserts that an identifier that is in the graph finds exactly that entity
    @pytest.mark.slow
    def test_known_uri_finds_that_entity(self):
        body = self.run({"kind": "entity", "uri": "wbs:co2-addition", "alias": "m"}).json()
        assert body["total_rows"] == 1
        assert body["rows"][0][body["columns"].index("m.label")] == "CO2 Addition"

    # Asserts that an entity step with only filters (no class) has a readable column name, not a bare number
    @pytest.mark.slow
    def test_filter_only_entity_has_a_readable_column_name(self):
        body = self.run(entity(None, filters=[attr("label", "CO2 Addition")])).json()
        assert body["columns"] == ["entity 1", "entity 1.label"]
        assert body["rows"] == [["wbs:co2-addition", "CO2 Addition"]]

    # Asserts that a filter value that matches nothing is a 400 naming the text and the filter, in the same shape as
    # class text. Acquirium matches exactly here (no near misses exist for "flow"), so there are no candidates to
    # offer; the candidate list for filters is covered by the "pump" cases below.
    @pytest.mark.slow
    def test_unresolved_filter_value_is_reported_with_its_field(self):
        response = self.run({"kind": "measurement", "filters": [attr("quantity_kind", "flow")]})
        body = response.json()
        assert response.status_code == 400
        assert (body["text"], body["field"], body["candidates"]) == ("flow", "quantity_kind", [])
        assert "No match for 'flow'" in body["detail"]

    # Asserts that "pump" as a filter value is reported as ambiguous, just like "pump" as class text
    @pytest.mark.slow
    def test_ambiguous_filter_value_is_reported_like_ambiguous_class_text(self):
        response = self.run(entity(None, filters=[attr("type", "pump")]))
        body = response.json()
        assert response.status_code == 400
        assert body["field"] == "type"
        assert {c["source"] for c in body["candidates"]} >= {"ASHRAE 223", "Water ontology"}

    # Asserts that a picked candidate's identifier runs as a filter value, completing the pick flow for filters
    @pytest.mark.slow
    def test_filter_value_runs_once_a_candidate_is_picked(self):
        ambiguous = self.run(entity(None, filters=[attr("type", "pump")])).json()
        for candidate in ambiguous["candidates"]:
            picked = self.run(entity(None, filters=[attr("type", candidate["uri"])]))
            assert picked.status_code == 200, candidate
            assert picked.json()["total_rows"] > 0

    # Asserts that class text and a filter value that fail are told apart by their field
    @pytest.mark.slow
    def test_class_and_filter_failures_name_different_fields(self):
        assert self.run(entity("pump")).json()["field"] == "class"
