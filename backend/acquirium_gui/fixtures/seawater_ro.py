"""A small in-memory plant, shaped after the WaterTAP seawater-ro deployment.

This exists so every panel can be built and demoed before a live Acquirium
server is available. It is *not* a second query engine for production use --
:class:`~acquirium_gui.adapters.stub.StubAdapter` walks it directly, and the
live adapter ignores this module entirely.

Deliberately small: one feed train, one RO skid, one energy recovery loop.
It has the properties the acceptance checks in requirements.md lean on:

* three pressure points across the RO (feed / permeate / brine), for the
  cookbook's "pressure drop across the RO" example;
* feed and permeate flow, for the recovery example;
* the word "filter" matching several different things, so free-text
  resolution has something genuinely ambiguous to disambiguate.

Ids here are opaque strings. They stand in for URIs and must never be shown
to the user.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EntityClass:
    id: str
    label: str


@dataclass(frozen=True)
class Entity:
    id: str
    label: str
    class_id: str
    # Attribute name -> attribute-value id, using models.AttributeName names.
    attrs: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Connection:
    id: str
    source: str
    target: str
    predicate_id: str


@dataclass(frozen=True)
class Point:
    """A measurement point: what a sensor on a piece of equipment reports."""

    id: str
    label: str
    entity_id: str
    attrs: dict[str, str] = field(default_factory=dict)
    # Deterministic synthetic timeseries parameters.
    base: float = 0.0
    amplitude: float = 0.0


@dataclass(frozen=True)
class Predicate:
    id: str
    label: str


@dataclass(frozen=True)
class AttrValue:
    """One selectable value of an attribute, e.g. quantity_kind = Pressure."""

    id: str
    label: str
    attr: str


# Three filter classes exist in the ontology but only one is installed in this
# plant. That is deliberate: it makes the word "filter" genuinely ambiguous to
# the resolver, which is what requirements.md story 5 tests the disambiguation
# picker against.
CLASSES: list[EntityClass] = [
    EntityClass("c_tank", "Tank"),
    EntityClass("c_pump", "Pump"),
    EntityClass("c_filter_cartridge", "Cartridge Filter"),
    EntityClass("c_filter_media", "Media Filter"),
    EntityClass("c_filter_membrane", "Membrane Filter"),
    EntityClass("c_ro", "Reverse Osmosis Unit"),
    EntityClass("c_px", "Pressure Exchanger"),
    EntityClass("c_valve", "Valve"),
    EntityClass("c_system", "Treatment System"),
]

# Instance labels are the short tags an operator would recognise on a P&ID
# ("P1", "RO"), which is what the graph relabels a class node to once a query
# pins it down -- see design.md's class-to-instance rule.
ENTITIES: list[Entity] = [
    Entity("e_sys", "Seawater RO Train", "c_system", {"process": "p_desal"}),
    Entity("e_t1", "T1", "c_tank", {"medium": "m_seawater", "process": "p_intake"}),
    Entity("e_p1", "P1", "c_pump", {"medium": "m_seawater", "process": "p_intake"}),
    Entity("e_cf1", "CF1", "c_filter_cartridge",
           {"medium": "m_seawater", "process": "p_pretreat"}),
    Entity("e_p2", "P2", "c_pump", {"medium": "m_seawater", "process": "p_desal"}),
    Entity("e_ro", "RO", "c_ro", {"medium": "m_seawater", "process": "p_desal"}),
    Entity("e_px", "PX1", "c_px", {"medium": "m_brine", "process": "p_recovery"}),
    Entity("e_t2", "T2", "c_tank", {"medium": "m_permeate", "process": "p_product"}),
    Entity("e_v1", "V1", "c_valve", {"medium": "m_brine", "process": "p_recovery"}),
]

PREDICATES: list[Predicate] = [
    Predicate("pr_feeds", "feeds"),
    Predicate("pr_contains", "contains"),
]

# The piping topology. direction= walks these.
CONNECTIONS: list[Connection] = [
    Connection("x_t1_p1", "e_t1", "e_p1", "pr_feeds"),
    Connection("x_p1_cf1", "e_p1", "e_cf1", "pr_feeds"),
    Connection("x_cf1_p2", "e_cf1", "e_p2", "pr_feeds"),
    Connection("x_p2_ro", "e_p2", "e_ro", "pr_feeds"),
    Connection("x_ro_t2", "e_ro", "e_t2", "pr_feeds"),
    Connection("x_ro_px", "e_ro", "e_px", "pr_feeds"),
    Connection("x_px_v1", "e_px", "e_v1", "pr_feeds"),
    Connection("x_px_p2", "e_px", "e_p2", "pr_feeds"),
    # The system contains its equipment.
    *[
        Connection("x_sys_" + eid, "e_sys", eid, "pr_contains")
        for eid in ("e_t1", "e_p1", "e_cf1", "e_p2", "e_ro", "e_px", "e_t2", "e_v1")
    ],
]

ATTR_VALUES: list[AttrValue] = [
    AttrValue("q_pressure", "Pressure", "quantity_kind"),
    AttrValue("q_flow", "Volume Flow Rate", "quantity_kind"),
    AttrValue("q_level", "Level", "quantity_kind"),
    AttrValue("q_salinity", "Salinity", "quantity_kind"),
    AttrValue("q_power", "Power", "quantity_kind"),
    AttrValue("u_bar", "bar", "unit"),
    AttrValue("u_m3h", "cubic metre per hour", "unit"),
    AttrValue("u_m", "metre", "unit"),
    AttrValue("u_gl", "gram per litre", "unit"),
    AttrValue("u_kw", "kilowatt", "unit"),
    AttrValue("m_seawater", "Seawater", "medium"),
    AttrValue("m_brine", "Brine", "medium"),
    AttrValue("m_permeate", "Permeate", "medium"),
    AttrValue("s_nacl", "Sodium Chloride", "substance"),
    AttrValue("s_water", "Water", "substance"),
    AttrValue("p_intake", "Intake", "process"),
    AttrValue("p_pretreat", "Pretreatment", "process"),
    AttrValue("p_desal", "Desalination", "process"),
    AttrValue("p_recovery", "Energy Recovery", "process"),
    AttrValue("p_product", "Product Storage", "process"),
]

POINTS: list[Point] = [
    Point("d_t1_level", "T1 Level", "e_t1",
          {"quantity_kind": "q_level", "unit": "u_m", "medium": "m_seawater"}, 3.4, 0.4),
    Point("d_p1_flow", "P1 Flow", "e_p1",
          {"quantity_kind": "q_flow", "unit": "u_m3h", "medium": "m_seawater"}, 120.0, 8.0),
    Point("d_p1_disch", "P1 Discharge Pressure", "e_p1",
          {"quantity_kind": "q_pressure", "unit": "u_bar", "medium": "m_seawater"}, 3.1, 0.2),
    Point("d_cf1_dp", "CF1 Differential Pressure", "e_cf1",
          {"quantity_kind": "q_pressure", "unit": "u_bar", "medium": "m_seawater"}, 0.6, 0.15),
    Point("d_p2_power", "P2 Power", "e_p2",
          {"quantity_kind": "q_power", "unit": "u_kw", "medium": "m_seawater"}, 210.0, 12.0),
    # The three pressure points across the RO -- the cookbook's example.
    Point("d_ro_feed_p", "RO Feed Pressure", "e_ro",
          {"quantity_kind": "q_pressure", "unit": "u_bar", "medium": "m_seawater"}, 55.0, 2.0),
    Point("d_ro_perm_p", "RO Permeate Pressure", "e_ro",
          {"quantity_kind": "q_pressure", "unit": "u_bar", "medium": "m_permeate"}, 1.2, 0.1),
    Point("d_ro_brine_p", "RO Brine Pressure", "e_ro",
          {"quantity_kind": "q_pressure", "unit": "u_bar", "medium": "m_brine"}, 53.4, 1.8),
    # Feed / permeate flow -- the recovery example.
    Point("d_ro_feed_f", "RO Feed Flow", "e_ro",
          {"quantity_kind": "q_flow", "unit": "u_m3h", "medium": "m_seawater"}, 118.0, 7.0),
    Point("d_ro_perm_f", "RO Permeate Flow", "e_ro",
          {"quantity_kind": "q_flow", "unit": "u_m3h", "medium": "m_permeate"}, 51.0, 4.0),
    Point("d_ro_feed_sal", "RO Feed Salinity", "e_ro",
          {"quantity_kind": "q_salinity", "unit": "u_gl", "medium": "m_seawater",
           "substance": "s_nacl"}, 35.0, 1.0),
    Point("d_ro_perm_sal", "RO Permeate Salinity", "e_ro",
          {"quantity_kind": "q_salinity", "unit": "u_gl", "medium": "m_permeate",
           "substance": "s_nacl"}, 0.32, 0.05),
    Point("d_px_press", "PX1 Outlet Pressure", "e_px",
          {"quantity_kind": "q_pressure", "unit": "u_bar", "medium": "m_brine"}, 52.0, 1.5),
    Point("d_t2_level", "T2 Level", "e_t2",
          {"quantity_kind": "q_level", "unit": "u_m", "medium": "m_permeate"}, 5.1, 0.6),
]

# --- lookups ---------------------------------------------------------------

CLASS_BY_ID = {c.id: c for c in CLASSES}
ENTITY_BY_ID = {e.id: e for e in ENTITIES}
POINT_BY_ID = {p.id: p for p in POINTS}
PREDICATE_BY_ID = {p.id: p for p in PREDICATES}
ATTR_VALUE_BY_ID = {v.id: v for v in ATTR_VALUES}


def label_of(item_id: str) -> str:
    """The display label for any fixture id, whatever kind of thing it is."""
    for table in (CLASS_BY_ID, ENTITY_BY_ID, POINT_BY_ID, PREDICATE_BY_ID, ATTR_VALUE_BY_ID):
        found = table.get(item_id)
        if found is not None:
            return found.label
    return item_id


def entities_of_class(class_id: str) -> list[Entity]:
    return [e for e in ENTITIES if e.class_id == class_id]


def points_of(entity_id: str) -> list[Point]:
    return [p for p in POINTS if p.entity_id == entity_id]


def neighbours(entity_id: str, direction: str | None = None) -> list[tuple[Connection, str]]:
    """Connections touching entity_id, paired with the entity at the other end.

    A direction of "downstream" follows connections outward only, "upstream"
    inward only, and None follows both -- the coarse shape of Acquirium's
    direction= walk over the piping topology.
    """
    out: list[tuple[Connection, str]] = []
    for conn in CONNECTIONS:
        if conn.source == entity_id and direction in (None, "downstream"):
            out.append((conn, conn.target))
        elif conn.target == entity_id and direction in (None, "upstream"):
            out.append((conn, conn.source))
    return out
