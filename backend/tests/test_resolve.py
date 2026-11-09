import pytest
from src.query_builder import MAX_ROWS, RESOLVE_MARGIN, RESOLVE_MIN_SCORE, ResolutionError, resolve_text, run_query, QuerySpec

def match(uri, score, label=None, stage="semantic"):
    return {"uri": uri, "label": label, "score": score, "match_stage": stage}

class FakeClient:
    """Stands in for Acquirium's client: resolve() records its arguments and returns canned ranked matches."""
    def __init__(self, matches):
        self.matches = matches
        self.log = []
    def resolve(self, text, kind=None, *, top_k=1, min_score=0.5, context=None):
        self.log.append((text, kind, top_k, min_score))
        return self.matches

class FakeAcq:
    def __init__(self, matches):
        self.client = FakeClient(matches)

PUMP, PIPE = match("ns1:Pump", 0.91, "Pump"), match("ns1:Pipe", 0.55, "Pipe")

# Asserts that the thresholds are the agreed starting values, kept in one place
@pytest.mark.fast
def test_threshold_and_margin_defaults():
    assert (RESOLVE_MIN_SCORE, RESOLVE_MARGIN) == (0.4, 0.1)

# Asserts that a clear winner is returned as a plain uri/label/score
@pytest.mark.fast
def test_confident_match_is_returned():
    assert resolve_text(FakeAcq([PUMP, PIPE]), "pump", "class") == {"uri": "ns1:Pump", "label": "Pump", "score": 0.91, "source": None}

# Asserts that Acquirium is asked for several candidates with no score floor, so near misses come back for the error
@pytest.mark.fast
def test_asks_acquirium_for_ranked_candidates():
    acq = FakeAcq([PUMP])
    resolve_text(acq, "pump", "class")
    assert acq.client.log == [("pump", "class", 5, 0.0)]

# Asserts that a best score under the threshold raises an error that carries the near misses, best first
@pytest.mark.fast
def test_low_confidence_raises_with_candidates():
    weak = [match("ns1:Pipe", 0.3, "Pipe"), match("ns1:Pump", 0.35, "Pump")]
    with pytest.raises(ResolutionError, match="pmup") as error:
        resolve_text(FakeAcq(weak), "pmup", "class")
    assert error.value.candidates == [{"uri": "ns1:Pump", "label": "Pump", "score": 0.35, "source": None},
                                      {"uri": "ns1:Pipe", "label": "Pipe", "score": 0.3, "source": None}]
    assert error.value.text == "pmup"  # which typed text failed, so the UI knows which field to fill

# Asserts that a confident best match still raises when the runner-up is within the margin
@pytest.mark.fast
def test_close_margin_raises_with_candidates():
    close = [match("ns1:Pump", 0.82, "Pump"), match("ns1:Pipe", 0.78, "Pipe"), match("ns1:Tank", 0.2, "Tank")]
    with pytest.raises(ResolutionError, match="close") as error:
        resolve_text(FakeAcq(close), "p", "class")
    assert [c["uri"] for c in error.value.candidates] == ["ns1:Pump", "ns1:Pipe", "ns1:Tank"]

# Asserts that the same node matched through two surface forms is not counted as ambiguity with itself
@pytest.mark.fast
def test_duplicate_uri_is_not_ambiguous():
    twice = [match("ns1:Pump", 0.9, "Pump"), match("ns1:Pump", 0.88, "Pump"), match("ns1:Pipe", 0.4, "Pipe")]
    assert resolve_text(FakeAcq(twice), "pump", "class")["uri"] == "ns1:Pump"

# Asserts that the error says which field the text came from (a class, or the attribute of a filter), so a pick lands in the right place
@pytest.mark.fast
def test_error_carries_the_field():
    with pytest.raises(ResolutionError) as error:
        resolve_text(FakeAcq([match("ns1:Pump", 0.2)]), "pmup", "class", field="medium")
    assert (error.value.text, error.value.field) == ("pmup", "medium")

# Asserts that the field is None when the caller does not say
@pytest.mark.fast
def test_error_field_defaults_to_none():
    with pytest.raises(ResolutionError) as error:
        resolve_text(FakeAcq([]), "zzz", "class")
    assert error.value.field is None

# Asserts that no matches at all is an error with an empty candidate list
@pytest.mark.fast
def test_no_matches_raises_with_no_candidates():
    with pytest.raises(ResolutionError) as error:
        resolve_text(FakeAcq([]), "zzz", "class")
    assert error.value.candidates == []

# Asserts that an input that already is a URI passes through, with no label to show
@pytest.mark.fast
def test_uri_passthrough():
    passthrough = [{"uri": "ns1:pump1", "kind": "any", "score": 1.0, "match_stage": "passthrough"}]
    assert resolve_text(FakeAcq(passthrough), "ns1:pump1", "class")["uri"] == "ns1:pump1"

# Asserts that a node with no label is shown by the readable end of its identifier, never as a blank or None
@pytest.mark.fast
@pytest.mark.parametrize("uri, name", [
    ("urn:nawi-water-ontology#Pump", "Pump"),
    ("http://data.ashrae.org/standard223#Pump", "Pump"),
    ("http://qudt.org/vocab/unit/GAL_US-PER-MIN", "GAL_US-PER-MIN"),
    ("ns1:pump1", "pump1"),
])
def test_missing_label_falls_back_to_the_identifier_end(uri, name):
    passthrough = [{"uri": uri, "kind": "any", "score": 1.0, "match_stage": "passthrough"}]
    assert resolve_text(FakeAcq(passthrough), uri, "class")["label"] == name

# Asserts that the ontology a node comes from is named in plain words, so two nodes called Pump can be told apart
@pytest.mark.fast
@pytest.mark.parametrize("uri, source", [
    ("http://data.ashrae.org/standard223#Pump", "ASHRAE 223"),
    ("urn:nawi-water-ontology#Pump", "Water ontology"),
    ("http://qudt.org/vocab/unit/BAR", "QUDT"),
    ("urn:something-else#Pump", None),
])
def test_candidates_name_their_source(uri, source):
    assert resolve_text(FakeAcq([match(uri, 0.9, "Pump")]), "pump", "class")["source"] == source

# Asserts that a resolution failure is still a ValueError, so existing handling keeps working
@pytest.mark.fast
def test_resolution_error_is_a_value_error():
    assert issubclass(ResolutionError, ValueError)

# ---------- run_query checks entity text before running ----------

class RunnableAcq(FakeAcq):
    def __init__(self, matches):
        super().__init__(matches)
        self.calls = []
        outer = self
        class Q:
            def entity(self, *a, **k): outer.calls.append(("entity", a, k)); return self
            def related(self, *a, **k): outer.calls.append(("related", a, k)); return self
            def include(self, *a, **k): outer.calls.append(("include", a, k)); return self
            def metadata(self):
                import polars as pl
                return pl.DataFrame({"x": ["a"]})
        self._query = Q()
    def query(self):
        return self._query

# Asserts that an entity or related class that does not match confidently stops the run before any query is built
@pytest.mark.fast
@pytest.mark.parametrize("kind", ["entity", "related"])
def test_run_rejects_unmatched_class_text(kind):
    acq = RunnableAcq([match("ns1:Pump", 0.3, "Pump")])
    with pytest.raises(ResolutionError):
        run_query(acq, QuerySpec.model_validate({"steps": [{"kind": kind, "cls": "pmup"}]}))
    assert acq.calls == []

# Asserts that a confident class is run with the user's own text, so the query matches what they typed
@pytest.mark.fast
def test_run_keeps_the_typed_class_text():
    acq = RunnableAcq([PUMP])
    run_query(acq, QuerySpec.model_validate({"steps": [{"kind": "entity", "cls": "pump"}]}))
    assert acq.client.log == [("pump", "class", 5, 0.0)]
    assert acq.calls == [("entity", ("pump",), {}), ("include", ("label",), {})]
