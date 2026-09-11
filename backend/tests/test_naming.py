"""Column names for the metadata table.

These are read by a plant operator, so they are checked as English rather
than as a serialization detail. The aliases the query uses internally
(``e1``, ``r1``) must never reach them.
"""

from __future__ import annotations

from acquirium_gui.models import AttrFilter, QueryStep, Ref
from acquirium_gui.naming import metadata_columns

PUMP = Ref(id="c_pump", label="Pump")
TANK = Ref(id="c_tank", label="Tank")
P1 = Ref(id="e_p1", label="P1")
PRESSURE = Ref(id="q_pressure", label="Pressure")


def entity(**kwargs) -> QueryStep:
    return QueryStep(id="s1", kind="entity", **kwargs)


def test_a_class_names_its_own_columns():
    assert metadata_columns([entity(alias="e1", cls=PUMP)]) == ["Pump", "Pump type"]


def test_a_specific_unit_names_its_columns():
    assert metadata_columns([entity(alias="e1", instance=P1)]) == ["P1", "P1 type"]


def test_an_unresolved_step_still_gets_a_readable_name():
    assert metadata_columns([entity(alias="e1")]) == ["Equipment", "Equipment type"]


def test_a_measurement_names_what_it_carries():
    step = QueryStep(id="s2", kind="measurement", alias="m1")
    assert metadata_columns([step]) == ["Measurement", "Measures", "Unit"]


def test_repeated_names_are_numbered_rather_than_duplicated():
    columns = metadata_columns(
        [
            entity(alias="e1", cls=PUMP),
            QueryStep(id="s2", kind="entity", alias="e2", cls=PUMP),
        ]
    )
    assert columns == ["Pump", "Pump type", "Pump 2", "Pump 2 type"]


def test_only_binding_steps_get_columns():
    """where/refocus constrain the query; they bind nothing to show."""
    columns = metadata_columns(
        [
            entity(alias="e1", cls=PUMP),
            QueryStep(
                id="s2",
                kind="where",
                target="e1",
                attrs=[AttrFilter(name="quantity_kind", value=PRESSURE)],
            ),
            QueryStep(id="s3", kind="refocus", target="e1"),
        ]
    )
    assert columns == ["Pump", "Pump type"]


def test_a_chain_names_every_step_in_order():
    columns = metadata_columns(
        [
            entity(alias="e1", cls=PUMP),
            QueryStep(id="s2", kind="related", alias="r1", frm="e1", cls=TANK),
            QueryStep(id="s3", kind="measurement", alias="m1", frm="r1"),
        ]
    )
    assert columns == [
        "Pump",
        "Pump type",
        "Tank",
        "Tank type",
        "Measurement",
        "Measures",
        "Unit",
    ]


def test_no_alias_survives_into_a_column_name():
    columns = metadata_columns(
        [
            entity(alias="e1", cls=PUMP),
            QueryStep(id="s2", kind="measurement", alias="m1", frm="e1"),
        ]
    )
    assert not any("e1" in column or "m1" in column for column in columns)
