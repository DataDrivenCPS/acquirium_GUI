import pytest
from pydantic import ValidationError
from query_builder import MAX_ROWS, Call, QuerySpec, apply_calls, query_attributes, run_query, to_calls, to_python

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

# ---------- stub behavior ----------

MEASUREMENT = {"steps": [{"kind": "measurement"}]}

# Asserts that every behavior is an explicit stub that says so, rather than silently returning nothing
@pytest.mark.fast
@pytest.mark.parametrize("call", [
    lambda: to_calls(QuerySpec.model_validate(MEASUREMENT)),
    lambda: apply_calls(object(), [Call("measurement")]),
    lambda: run_query(object(), QuerySpec.model_validate(MEASUREMENT)),
    lambda: to_python(QuerySpec.model_validate(MEASUREMENT), "http://127.0.0.1:9999"),
    lambda: query_attributes(),
], ids=["to_calls", "apply_calls", "run_query", "to_python", "query_attributes"])
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
    ]}).steps] == ["EntityStep", "RelatedStep", "MeasurementStep", "WhereStep", "IncludeStep"]
