from types import SimpleNamespace
import acquirium
import polars as pl
import pytest
from acquirium.Client.explore import REGISTRY, Not
from pydantic import ValidationError
import query_builder.query_spec as query_spec
from query_builder import Call, QuerySpec, apply_calls, query_attributes, run_query, to_calls, to_python
from fakes import RecordingAcquirium, RecordingQuery

ADDRESS = "http://127.0.0.1:9999"

def spec(*steps):
    return QuerySpec.model_validate({"steps": list(steps)})

# One step of every kind, with values that need escaping in Python source
EVERY_KIND = spec(
    {"kind": "entity", "cls": "reverse osmosis membrane", "alias": "ro",
     "filters": [{"attr": "process", "value": "reverse osmosis"}]},
    {"kind": "related", "cls": "outlet connection point", "frm": "ro", "alias": "out",
     "via": "any", "direction": "downstream", "max_depth": 2, "nearest": False},
    {"kind": "measurement", "frm": "out", "alias": "permeate",
     "filters": [{"attr": "quantity_kind", "value": "volume flow rate"},
                 {"attr": "medium", "value": "brine", "exclude": True}]},
    {"kind": "where", "target": "permeate", "filters": [{"attr": "label", "value": "it's \"quoted\" \\ µS"}]},
    {"kind": "include", "names": ["unit", "medium"], "of": "permeate", "required": True},
)

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

# ---------- steps -> calls ----------

# Asserts that each step kind becomes the matching Query method call, leaving unset options out
@pytest.mark.fast
def test_to_calls_maps_every_step_kind():
    assert to_calls(EVERY_KIND) == [
        Call("entity", ("reverse osmosis membrane",), {"alias": "ro", "process": "reverse osmosis"}),
        Call("related", ("outlet connection point",),
             {"alias": "out", "frm": "ro", "via": "any", "direction": "downstream", "max_depth": 2, "nearest": False}),
        Call("measurement", (), {"frm": "out", "alias": "permeate", "quantity_kind": "volume flow rate", "medium": Not("brine")}),
        Call("where", ("permeate",), {"label": "it's \"quoted\" \\ µS"}),
        Call("include", ("unit", "medium"), {"of": "permeate", "required": True}),
    ]

# Asserts that steps with only defaults produce calls with no arguments
@pytest.mark.fast
def test_to_calls_with_defaults_only():
    calls = to_calls(spec({"kind": "measurement"}, {"kind": "include", "names": ["unit"]}))
    assert calls == [Call("measurement", (), {}), Call("include", ("unit",), {})]

# Asserts that an entity pinned by URI (no class) passes it as a keyword
@pytest.mark.fast
def test_to_calls_entity_by_uri():
    assert to_calls(spec({"kind": "entity", "uri": "urn:plant#pump1"})) == [Call("entity", (), {"uri": "urn:plant#pump1"})]

# Asserts that apply_calls chains every call onto the query and returns the final one
@pytest.mark.fast
def test_apply_calls_chains_in_order():
    recorder = RecordingQuery()
    assert apply_calls(recorder, to_calls(EVERY_KIND)) is recorder
    assert recorder.calls == to_calls(EVERY_KIND)

# ---------- calls -> Python ----------

# Asserts the exact script shown for a multi-step query
@pytest.mark.fast
def test_to_python_script():
    assert to_python(EVERY_KIND, ADDRESS) == """from acquirium import Acquirium
from acquirium.Client.explore import Not

aq = Acquirium(server_url='127.0.0.1', server_port=9999)

q = (
    aq.query()
    .entity('reverse osmosis membrane', alias='ro', process='reverse osmosis')
    .related('outlet connection point', alias='out', frm='ro', via='any', direction='downstream', max_depth=2, nearest=False)
    .measurement(frm='out', alias='permeate', quantity_kind='volume flow rate', medium=Not('brine'))
    .where('permeate', label='it\\'s "quoted" \\\\ µS')
    .include('unit', 'medium', of='permeate', required=True)
)
print(q.metadata())
"""

# Asserts that an empty query still produces a runnable script, without the Not import
@pytest.mark.fast
def test_to_python_without_steps():
    assert to_python(spec(), ADDRESS) == """from acquirium import Acquirium

aq = Acquirium(server_url='127.0.0.1', server_port=9999)

q = aq.query()
print(q.metadata())
"""

# Asserts that an https address connects with use_ssl=True
@pytest.mark.fast
def test_to_python_https_address():
    assert "aq = Acquirium(server_url='acq.example.org', server_port=443, use_ssl=True)" in to_python(spec(), "https://acq.example.org:443")

# Asserts that running the generated script makes exactly the calls the Run button makes,
# so the Python shown can never drift from what actually ran
@pytest.mark.fast
def test_generated_python_makes_the_same_calls(monkeypatch):
    RecordingAcquirium.instances = []
    monkeypatch.setattr(acquirium, "Acquirium", RecordingAcquirium)
    exec(to_python(EVERY_KIND, ADDRESS), {})
    [aq] = RecordingAcquirium.instances
    assert aq.connection == {"server_url": "127.0.0.1", "server_port": 9999}
    assert aq.recorder.calls == to_calls(EVERY_KIND)

# ---------- running ----------

# Asserts that a run returns the metadata table's columns and rows
@pytest.mark.fast
def test_run_query_returns_table():
    table = pl.DataFrame({"ro": ["ns1:ro1", "ns1:ro2"], "ro.process": ["watr:RO", None]})
    recorder = RecordingQuery(table=table)
    result = run_query(acq=SimpleNamespace(query=lambda: recorder), spec=spec({"kind": "entity", "cls": "ro"}))
    assert recorder.calls == [Call("entity", ("ro",), {})]
    assert result == {
        "columns": ["ro", "ro.process"],
        "rows": [["ns1:ro1", "watr:RO"], ["ns1:ro2", None]],
        "total_rows": 2,
        "truncated": False,
    }

# Asserts that very large results are cut to MAX_ROWS and flagged
@pytest.mark.fast
def test_run_query_truncates(monkeypatch):
    monkeypatch.setattr(query_spec, "MAX_ROWS", 2)
    recorder = RecordingQuery(table=pl.DataFrame({"data": ["a", "b", "c"]}))
    result = run_query(acq=SimpleNamespace(query=lambda: recorder), spec=spec({"kind": "measurement"}))
    assert result["rows"] == [["a"], ["b"]]
    assert (result["total_rows"], result["truncated"]) == (3, True)

# Asserts that running an empty query is refused with a readable message
@pytest.mark.fast
def test_run_query_without_steps():
    with pytest.raises(ValueError, match="at least one step"):
        run_query(acq=None, spec=spec())

# ---------- attributes ----------

# Asserts that the attribute list mirrors Acquirium's registry, with roles as sorted lists
@pytest.mark.fast
def test_query_attributes_mirror_registry():
    attributes = query_attributes()
    assert [a["name"] for a in attributes] == list(REGISTRY)
    medium = next(a for a in attributes if a["name"] == "medium")
    assert medium == {"name": "medium", "roles": ["data", "entity"], "doc": REGISTRY["medium"].doc}
