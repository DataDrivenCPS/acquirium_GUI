from types import SimpleNamespace
import polars as pl
import pytest
from acquirium.Client.explore import REGISTRY, Not
from pydantic import ValidationError
from src.query_builder import MAX_ROWS, Call, QuerySpec, apply_calls, query_attributes, run_query, to_calls, to_python

# query_builder is a stub: the step models (the request format) are real, the behavior is not implemented yet.

def spec(*steps):
    return QuerySpec.model_validate({"steps": list(steps)})

# ---------- validation ----------

# Asserts that blank text fields mean "not set", so the frontend can send its form state as-is
@pytest.mark.fast
def test_blank_text_fields_become_none():
    step = spec({"kind": "related", "cls": "  ", "uri": "", "alias": " ro ", "frm": "", "via": "", "direction": ""}).steps[0]
    assert (step.cls, step.uri, step.alias, step.frm, step.via, step.direction) == (None, None, "ro", None, None, None)

# Asserts that filters only accept attributes Acquirium's query registry knows
@pytest.mark.fast
def test_unknown_filter_attribute_is_rejected():
    with pytest.raises(ValidationError, match="unknown attribute 'colour'"):
        spec({"kind": "entity", "cls": "Pump", "filters": [{"attr": "colour", "value": "red"}]})

# Asserts that a filter needs a value
@pytest.mark.fast
def test_blank_filter_value_is_rejected():
    with pytest.raises(ValidationError):
        spec({"kind": "entity", "cls": "Pump", "filters": [{"attr": "medium", "value": "  "}]})

# Asserts that one step cannot filter the same attribute twice (the second would silently win)
@pytest.mark.fast
def test_repeated_filter_attribute_is_rejected():
    with pytest.raises(ValidationError, match="medium"):
        spec({"kind": "measurement", "filters": [{"attr": "medium", "value": "water"},
                                                 {"attr": "medium", "value": "brine"}]})

# Asserts that a where step needs at least one filter, like Acquirium's where()
@pytest.mark.fast
def test_where_without_filters_is_rejected():
    with pytest.raises(ValidationError):
        spec({"kind": "where", "target": "ro", "filters": []})

# Asserts that an include step needs at least one non-blank column name
@pytest.mark.fast
@pytest.mark.parametrize("names", [[], [" "]])
def test_include_without_names_is_rejected(names):
    with pytest.raises(ValidationError):
        spec({"kind": "include", "names": names})

# Asserts that traversal depth cannot be negative (0 already means unbounded)
@pytest.mark.fast
def test_negative_max_depth_is_rejected():
    with pytest.raises(ValidationError):
        spec({"kind": "measurement", "max_depth": -1})

# Asserts that unknown step kinds and directions are rejected
@pytest.mark.fast
@pytest.mark.parametrize("step", [{"kind": "delete"}, {"kind": "measurement", "direction": "sideways"}])
def test_unknown_kind_or_direction_is_rejected(step):
    with pytest.raises(ValidationError):
        spec(step)

# ---------- to_calls ----------

# Asserts that an entity step becomes Query.entity with its class positional and set options as keywords
@pytest.mark.fast
def test_entity_step_becomes_an_entity_call():
    assert to_calls(spec({"kind": "entity", "cls": "Pump", "alias": "p", "uri": "ns1:pump1"})) == [
        Call("entity", ("Pump",), {"uri": "ns1:pump1", "alias": "p"})]

# Asserts that options left blank are left out, so Acquirium's defaults apply
@pytest.mark.fast
def test_unset_options_are_left_out():
    assert to_calls(spec({"kind": "entity", "cls": "Pump"}, {"kind": "measurement"})) == [
        Call("entity", ("Pump",)), Call("measurement")]

# Asserts that an entity or related step with no class and no alias is named after its position, because
# Acquirium would name its column with a bare number ("0") that the user sees as the table header
@pytest.mark.fast
def test_classless_steps_get_a_readable_default_alias():
    assert to_calls(spec({"kind": "entity", "filters": [{"attr": "label", "value": "CO2 Addition"}]},
                         {"kind": "related", "uri": "wbs:x"}, {"kind": "related"})) == [
        Call("entity", (), {"alias": "entity 1", "label": "CO2 Addition"}),
        Call("related", (), {"uri": "wbs:x", "alias": "related 2"}),
        Call("related", (), {"alias": "related 3"})]

# Asserts that a step that has a class, or an alias, keeps what the user gave it
@pytest.mark.fast
def test_default_alias_is_only_for_steps_with_neither_class_nor_alias():
    calls = to_calls(spec({"kind": "entity", "cls": "Pump"}, {"kind": "entity", "alias": "x", "uri": "wbs:x"},
                          {"kind": "measurement"}))
    assert [c.kwargs.get("alias") for c in calls] == [None, "x", None]

# Asserts that a related step passes every set traversal option, keeping falsy ones like nearest=False and max_depth=0
@pytest.mark.fast
def test_related_step_keeps_falsy_options():
    step = {"kind": "related", "cls": "Valve", "alias": "v", "frm": "p", "via": "ns1:feeds", "direction": "downstream",
            "max_depth": 0, "nearest": False}
    assert to_calls(spec(step)) == [Call("related", ("Valve",), {
        "alias": "v", "frm": "p", "via": "ns1:feeds", "direction": "downstream", "max_depth": 0, "nearest": False})]

# Asserts that filters become attribute keywords and an excluded filter becomes Not(value)
@pytest.mark.fast
def test_filters_become_keywords_and_exclusions_become_not():
    filters = [{"attr": "medium", "value": "brine", "exclude": True}, {"attr": "unit", "value": "BAR"}]
    assert to_calls(spec({"kind": "measurement", "frm": "p", "filters": filters})) == [
        Call("measurement", (), {"frm": "p", "medium": Not("brine"), "unit": "BAR"})]

# Asserts that where passes its target positionally, and omits it to mean the current node
@pytest.mark.fast
def test_where_step_becomes_a_where_call():
    filters = [{"attr": "medium", "value": "water"}]
    assert to_calls(spec({"kind": "where", "target": "p", "filters": filters},
                         {"kind": "where", "filters": filters})) == [
        Call("where", ("p",), {"medium": "water"}), Call("where", (), {"medium": "water"})]

# Asserts that a refocus step becomes Query.refocus(alias)
@pytest.mark.fast
def test_refocus_step_becomes_a_refocus_call():
    assert to_calls(spec({"kind": "refocus", "alias": "p"})) == [Call("refocus", ("p",))]

# Asserts that a refocus step needs an alias
@pytest.mark.fast
def test_refocus_without_alias_is_rejected():
    with pytest.raises(ValidationError):
        spec({"kind": "refocus", "alias": " "})

# Asserts that an include step passes its names positionally and sets required only when asked
@pytest.mark.fast
def test_include_step_becomes_an_include_call():
    assert to_calls(spec({"kind": "include", "names": ["unit", "label"], "of": "m", "required": True},
                         {"kind": "include", "names": ["unit"]})) == [
        Call("include", ("unit", "label"), {"of": "m", "required": True}), Call("include", ("unit",))]

# Asserts that steps keep their order
@pytest.mark.fast
def test_calls_keep_step_order():
    steps = [{"kind": "entity", "cls": "Pump"}, {"kind": "measurement", "frm": "Pump"}, {"kind": "refocus", "alias": "Pump"}]
    assert [c.method for c in to_calls(spec(*steps))] == ["entity", "measurement", "refocus"]

# ---------- apply_calls ----------

class Recorder:
    """Stands in for an Acquirium Query: records each call and returns itself, like the chained builder."""
    def __init__(self):
        self.log = []
    def __getattr__(self, method):
        def record(*args, **kwargs):
            self.log.append(Call(method, args, kwargs))
            return self
        return record

# Asserts that each call is chained onto the query in order with its arguments
@pytest.mark.fast
def test_apply_calls_chains_each_call():
    recorder = Recorder()
    calls = [Call("entity", ("Pump",), {"alias": "p"}), Call("measurement", (), {"frm": "p"})]
    assert apply_calls(recorder, calls) is recorder
    assert recorder.log == calls

# Asserts that applying no calls returns the query unchanged
@pytest.mark.fast
def test_apply_no_calls_returns_the_query():
    query = object()
    assert apply_calls(query, []) is query

# ---------- run_query ----------

class FakeAcquirium:
    """Stands in for Acquirium: query() hands out a Recorder whose metadata() returns the given table."""
    def __init__(self, table, existing=()):
        self.recorder = Recorder()
        self.recorder.metadata = lambda: table
        self.asked = []  # the existence queries sent
        def sparql_query(query):
            self.asked.append(query)
            return {"columns": [], "rows": [[any(f"<{uri}>" in query for uri in existing)]]}
        def expand_uri(text):
            if text.startswith("nope:"):
                raise ValueError(f"Cannot expand '{text}': no matching namespace")
            return text.replace("wbs:", "urn:wbs#")
        # every class text matches confidently, so run_query's text check passes
        self.client = SimpleNamespace(resolve=lambda text, kind=None, **kw: [{"uri": f"ns1:{text}", "label": text, "score": 1.0}],
                                      expand_uri=expand_uri, sparql_query=sparql_query)
    def query(self):
        return self.recorder

# Asserts that the steps are applied to a fresh query and the metadata table comes back as columns and rows
@pytest.mark.fast
def test_run_query_returns_the_metadata_table():
    acq = FakeAcquirium(pl.DataFrame({"point": ["ns1:a", "ns1:b"], "point.unit": ["unit:BAR", None]}))
    result = run_query(acq, spec({"kind": "measurement", "alias": "point"}))
    assert acq.recorder.log == [Call("measurement", (), {"alias": "point"})]  # measurements need no label include
    assert result == {"columns": ["point", "point.unit"], "rows": [["ns1:a", "unit:BAR"], ["ns1:b", None]],
                      "total_rows": 2, "truncated": False}

# Asserts that each entity and related node also gets its label, so the page can show names instead of identifiers;
# measurement nodes already carry a label column, and including it again makes Acquirium fail
@pytest.mark.fast
def test_run_query_asks_for_labels_of_entities_only():
    acq = FakeAcquirium(pl.DataFrame({"x": ["a"]}))
    run_query(acq, spec({"kind": "entity", "cls": "Pump", "alias": "p"}, {"kind": "related", "cls": "Valve"},
                        {"kind": "measurement"}, {"kind": "refocus", "alias": "p"}))
    assert [(c.method, c.args) for c in acq.recorder.log] == [
        ("entity", ("Pump",)), ("include", ("label",)), ("related", ("Valve",)), ("include", ("label",)),
        ("measurement", ()), ("refocus", ("p",))]

# Asserts that an include step never asks for "label": entity and related nodes get it automatically and
# measurement nodes already have it, and asking again makes Acquirium fail on a duplicate column
@pytest.mark.fast
@pytest.mark.parametrize("names, kept", [(["label"], None), (["label", "unit"], ("unit",)), (["unit", "label"], ("unit",))])
def test_run_query_drops_label_from_include_steps(names, kept):
    acq = FakeAcquirium(pl.DataFrame({"x": ["a"]}))
    run_query(acq, spec({"kind": "measurement"}, {"kind": "include", "names": names, "of": "m"}))
    includes = [c for c in acq.recorder.log if c.method == "include"]
    assert [c.args for c in includes] == ([kept] if kept else [])
    assert all(c.kwargs == {"of": "m"} for c in includes)

# Asserts that steps which add no node once labels are dropped (only an include of "label") are rejected
# before Acquirium is asked, rather than running an empty query
@pytest.mark.fast
def test_run_query_rejects_steps_that_leave_nothing_to_run():
    acq = FakeAcquirium(pl.DataFrame())
    with pytest.raises(ValueError, match="nothing to run"):
        run_query(acq, spec({"kind": "include", "names": ["label"]}))
    assert acq.recorder.log == []

# ---------- text that reaches Acquirium's query language ----------
# Acquirium writes a literal value as "{value}" and an identifier as <{value}> without escaping either, so
# run_query must make the value safe first. These tests check the calls Acquirium receives.

def calls_sent(*steps):
    acq = FakeAcquirium(pl.DataFrame({"x": ["a"]}))
    run_query(acq, spec(*steps))
    return acq.recorder.log

def label_filter(value, attr="label", exclude=False):
    return {"kind": "measurement", "filters": [{"attr": attr, "value": value, "exclude": exclude}]}

# Asserts that quotes, backslashes and line breaks in a literal value are escaped, so the value stays one string
@pytest.mark.fast
@pytest.mark.parametrize("value, sent", [
    ('a"b', 'a\\"b'),
    ("a\\b", "a\\\\b"),
    ('a"} UNION {?x ?y ?z', 'a\\"} UNION {?x ?y ?z'),
    ("two\nlines\ttab\rend", "two\\nlines\\ttab\\rend"),
    ("it's fine", "it's fine"),
], ids=["quote", "backslash", "injection", "whitespace-controls", "single-quote-untouched"])
def test_literal_values_are_escaped(value, sent):
    assert calls_sent(label_filter(value))[0].kwargs == {"label": sent}

# Asserts that an excluded literal is escaped too, inside its Not
@pytest.mark.fast
def test_excluded_literal_is_escaped():
    assert calls_sent(label_filter('a"b', exclude=True))[0].kwargs == {"label": Not('a\\"b')}

# Asserts that a value Acquirium matches by text, not as a literal (a medium, a unit), is sent as typed so the match still works
@pytest.mark.fast
def test_text_matched_values_are_not_escaped():
    assert calls_sent(label_filter('sea "water"', attr="medium"))[0].kwargs == {"medium": 'sea "water"'}

# Asserts that something that looks like an identifier but could break out of <...> is rejected, wherever it appears
@pytest.mark.fast
@pytest.mark.parametrize("step", [
    label_filter("urn:x> } UNION { ?a ?b ?c #"),
    label_filter("http://x/y z"),
    label_filter("urn:x>", attr="medium"),
    {"kind": "entity", "cls": "http://x/y> } #"},
    {"kind": "entity", "uri": "urn:x> } #"},
    {"kind": "related", "cls": "Tank", "via": "urn:p> } #"},
], ids=["literal-iri-like", "space", "text-attr", "cls", "uri", "via"])
def test_malformed_identifiers_are_rejected_before_acquirium(step):
    acq = FakeAcquirium(pl.DataFrame())
    steps = [{"kind": "entity", "cls": "Tank", "alias": "t"}, step] if step["kind"] == "related" else [step]
    with pytest.raises(ValueError, match="not a valid identifier"):
        run_query(acq, spec(*steps))
    assert acq.recorder.log == []

# Asserts that a well-formed identifier passes through unchanged
@pytest.mark.fast
def test_well_formed_identifiers_pass_through():
    assert calls_sent(label_filter("urn:nawi-water-ontology#Pump", attr="medium"))[0].kwargs == {"medium": "urn:nawi-water-ontology#Pump"}

# ---------- entities named by identifier must exist ----------
# Acquirium answers an entity step for an identifier that is not in the graph with one made-up row, so run_query asks first.

# Asserts that an identifier that is not in the graph is rejected with a message, before the query is built
@pytest.mark.fast
@pytest.mark.parametrize("step", [{"kind": "entity", "uri": "wbs:nope-not-here"},
                                  {"kind": "related", "uri": "wbs:nope-not-here", "cls": "Tank"}])
def test_unknown_entity_identifier_is_rejected(step):
    acq = FakeAcquirium(pl.DataFrame({"x": ["a"]}), existing=["urn:wbs#other"])
    steps = [{"kind": "entity", "cls": "Tank"}, step] if step["kind"] == "related" else [step]
    with pytest.raises(ValueError, match="No entity found for 'wbs:nope-not-here'"):
        run_query(acq, spec(*steps))
    assert [c.method for c in acq.recorder.log if c.method in ("related",)] == []

# Asserts that an identifier that exists runs, and Acquirium still receives it as typed
@pytest.mark.fast
def test_known_entity_identifier_runs():
    acq = FakeAcquirium(pl.DataFrame({"x": ["a"]}), existing=["urn:wbs#co2-addition"])
    run_query(acq, spec({"kind": "entity", "uri": "wbs:co2-addition", "alias": "m"}))
    assert acq.recorder.log[0] == Call("entity", (), {"uri": "wbs:co2-addition", "alias": "m"})

# Asserts that an identifier whose expansion could break out of <...> is rejected without being sent in a query
@pytest.mark.fast
def test_identifier_that_expands_to_something_unsafe_is_rejected():
    acq = FakeAcquirium(pl.DataFrame(), existing=[])
    with pytest.raises(ValueError, match="not a valid identifier"):
        run_query(acq, spec({"kind": "entity", "uri": "wbs:a> } UNION { ?s ?p ?o #"}))
    assert acq.asked == [] and acq.recorder.log == []

# Asserts that a prefix Acquirium does not know is reported as Acquirium words it
@pytest.mark.fast
def test_unbound_prefix_is_rejected():
    with pytest.raises(ValueError, match="Cannot expand"):
        run_query(FakeAcquirium(pl.DataFrame()), spec({"kind": "entity", "uri": "nope:x"}))

# Asserts that steps without an identifier send no existence queries
@pytest.mark.fast
def test_no_identifier_means_no_existence_query():
    acq = FakeAcquirium(pl.DataFrame({"x": ["a"]}))
    run_query(acq, spec({"kind": "entity", "cls": "Tank"}, {"kind": "measurement"}))
    assert acq.asked == []

# Asserts that to_calls still returns only what the user's steps say, so the calls shown elsewhere match the steps
@pytest.mark.fast
def test_to_calls_does_not_add_label_includes():
    assert [c.method for c in to_calls(spec({"kind": "entity", "cls": "Pump"}))] == ["entity"]

# Asserts that only MAX_ROWS rows are sent back, while the total still counts every row
@pytest.mark.fast
def test_run_query_truncates_long_tables():
    acq = FakeAcquirium(pl.DataFrame({"point": [f"ns1:p{i}" for i in range(MAX_ROWS + 5)]}))
    result = run_query(acq, spec({"kind": "measurement"}))
    assert len(result["rows"]) == MAX_ROWS
    assert (result["total_rows"], result["truncated"]) == (MAX_ROWS + 5, True)

# Asserts that a table with no rows is a normal result, not an error
@pytest.mark.fast
def test_run_query_empty_table():
    result = run_query(FakeAcquirium(pl.DataFrame({"point": []}, schema={"point": pl.String})), spec({"kind": "measurement"}))
    assert result == {"columns": ["point"], "rows": [], "total_rows": 0, "truncated": False}

# Asserts that running nothing is rejected before touching Acquirium
@pytest.mark.fast
def test_run_query_rejects_an_empty_spec():
    acq = FakeAcquirium(pl.DataFrame())
    with pytest.raises(ValueError, match="at least one step"):
        run_query(acq, spec())
    assert acq.recorder.log == []

# ---------- query_attributes ----------

# Asserts that every attribute in Acquirium's registry is listed, with sorted roles and its doc, so the builder's filter menus match what validation accepts
@pytest.mark.fast
def test_query_attributes_lists_the_registry():
    attributes = query_attributes()
    assert [a["name"] for a in attributes] == list(REGISTRY)
    medium = next(a for a in attributes if a["name"] == "medium")
    assert medium == {"name": "medium", "roles": sorted(REGISTRY["medium"].roles), "doc": REGISTRY["medium"].doc}
    assert all(set(a) == {"name", "roles", "doc"} and isinstance(a["roles"], list) for a in attributes)

# ---------- stub behavior ----------

MEASUREMENT = {"steps": [{"kind": "measurement"}]}

# Asserts that every behavior is an explicit stub that says so, rather than silently returning nothing
@pytest.mark.fast
@pytest.mark.parametrize("call", [
    lambda: to_python(QuerySpec.model_validate(MEASUREMENT), "http://127.0.0.1:9999"),
], ids=["to_python"])
def test_behavior_is_not_implemented(call):
    with pytest.raises(NotImplementedError, match="not implemented yet"):
        call()

# Asserts that the rest of the public interface stays importable and shaped as documented
@pytest.mark.fast
def test_interface_is_kept():
    assert MAX_ROWS == 1000
    assert Call("include", ("unit",), {"of": "m"}) == Call(method="include", args=("unit",), kwargs={"of": "m"})
    assert [type(step).__name__ for step in QuerySpec.model_validate({"steps": [
        {"kind": "entity", "cls": "Pump"}, {"kind": "related", "cls": "Valve"}, {"kind": "measurement"},
        {"kind": "where", "filters": [{"attr": "medium", "value": "water"}]}, {"kind": "include", "names": ["unit"]},
        {"kind": "refocus", "alias": "p"},
    ]}).steps] == ["EntityStep", "RelatedStep", "MeasurementStep", "WhereStep", "IncludeStep", "RefocusStep"]
