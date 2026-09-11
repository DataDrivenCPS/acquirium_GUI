"""Wire schemas shared by every route.

These are the contract the frontend mirrors in ``frontend/src/api/types.ts``.
Keep the two files in sync; the response shapes here are what the live
Acquirium-backed adapter must also produce, not just the stub.

Hard rule from the client brief: **no URIs or CURIEs in any field the
frontend renders.** Nodes, classes, predicates and attribute values are all
identified by an opaque ``id`` plus a human-readable ``label``. The only
exception is :class:`GeneratedQuery`, which backs the deliberate read-only
"view generated query" panel for technical users.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

# Attribute names accepted by Query.where()/include()/options() and as inline
# keywords on entity()/related()/measurement(). Mirrors client-api.md.
AttributeName = Literal[
    "type",
    "process",
    "cp_type",
    "medium",
    "substance",
    "quantity_kind",
    "unit",
    "enumeration_kind",
    "data_source",
]

# What a free-text box is resolving. Maps onto AcquiriumClient.resolve(kind=...).
ResolveKind = Literal["class", "entity", "predicate", "attribute_value"]

StepKind = Literal["entity", "related", "measurement", "where", "refocus"]


class Ref(BaseModel):
    """An opaque, resolved reference to something in the graph.

    ``id`` is internal and meaningless to the user; ``label`` is what gets
    rendered. The adapter is the only thing that knows how to turn an ``id``
    back into a URI.
    """

    id: str
    label: str


class AttrFilter(BaseModel):
    """One ``where()``-style attribute constraint."""

    name: AttributeName
    value: Ref
    # Renders as Not(value) when the query is handed to Acquirium.
    negated: bool = False


class QueryStep(BaseModel):
    """One builder action, in the order the user applied it.

    This is a UI-level description, deliberately *not* ``Query.to_dict()``'s
    shape. The adapter translates a step list into real ``Query`` verb calls,
    so the frontend never has to track Acquirium's internal representation.
    """

    id: str
    kind: StepKind

    # entity / related: the class being matched. None means "any".
    cls: Ref | None = None
    # An explicit instance, when the user picked a node in the graph rather
    # than typing a class name.
    instance: Ref | None = None

    alias: str | None = None
    # related / measurement: which existing alias to hang this off.
    frm: str | None = None
    # where / refocus: which existing alias this targets.
    target: str | None = None

    # related only.
    via: Ref | None = None
    direction: Literal["upstream", "downstream"] | None = None
    max_depth: int | None = None

    attrs: list[AttrFilter] = Field(default_factory=list)


class QueryDescription(BaseModel):
    """The whole query being built. Serializable; this is the app's state."""

    steps: list[QueryStep] = Field(default_factory=list)


# --- graph -----------------------------------------------------------------


class GraphNode(BaseModel):
    id: str
    label: str
    # "class" while the node is still ontology-level ("Pump"); "instance"
    # once a query has pinned it to real equipment ("P1").
    level: Literal["class", "instance"] = "class"
    kind: Literal["equipment", "measurement", "system"] = "equipment"
    # How many real units this class node stands for. The graph is
    # class-level, so one box may be a dozen pumps; the UI shows the count
    # and it is why a node relabels only when exactly one unit matched.
    instance_count: int = 1


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str


class GraphModel(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    # True when the node count exceeded config.graph_node_limit and the
    # response was reduced. The frontend surfaces this rather than silently
    # showing a partial plant.
    simplified: bool = False
    total_nodes: int = 0


class Subgraph(BaseModel):
    """Which parts of the model graph the current query touches."""

    highlighted_nodes: list[str] = Field(default_factory=list)
    highlighted_edges: list[str] = Field(default_factory=list)
    # node id -> the instance label it should render as now, per the
    # class-to-instance relabeling rule in design.md.
    relabeled: dict[str, str] = Field(default_factory=dict)


# --- resolution ------------------------------------------------------------


class ResolveRequest(BaseModel):
    text: str
    kind: ResolveKind = "class"
    top_k: int | None = None


class Candidate(Ref):
    score: float
    kind: ResolveKind


class ResolveResponse(BaseModel):
    candidates: list[Candidate] = Field(default_factory=list)
    # True when the top candidate cleared the configured threshold with no
    # close runner-up, so the UI may accept it silently. False means show
    # the disambiguation picker.
    confident: bool = False


# --- results ---------------------------------------------------------------


class Table(BaseModel):
    """A rendered result set. Values are pre-stringified for display."""

    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    # Set when the query is valid but matched nothing, so the UI can show a
    # message instead of an empty grid (non-functional requirement).
    empty_reason: str | None = None


class GeneratedQuery(BaseModel):
    """The technical escape hatch. The one place raw query text is allowed."""

    python: str
    sparql: str | None = None
    note: str | None = None


# --- config ----------------------------------------------------------------


class AppConfig(BaseModel):
    """Runtime-tunable settings, persisted to a TOML file.

    Never hardcoded in the frontend; it always reads these from GET /api/config.
    """

    # Minimum score for a free-text match to be accepted without asking.
    confidence_threshold: float = Field(default=0.72, ge=0.0, le=1.0)
    # If the runner-up is within this of the top score, ask anyway.
    close_runner_up_margin: float = Field(default=0.08, ge=0.0, le=1.0)
    # Candidates offered in the disambiguation picker.
    resolve_top_k: int = Field(default=3, ge=1, le=20)
    # Node count past which the graph view simplifies.
    graph_node_limit: int = Field(default=150, ge=1)
    # Whether readings are retrieved as the query changes, or only when the
    # user asks. Timeseries retrieval is the expensive half of Acquirium's
    # lazy split, so this is the one knob that decides how much a plant pays
    # for an edit -- worth turning off against a large live deployment.
    auto_retrieve_data: bool = True


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    # Which AcquiriumAdapter is wired in.
    adapter: str
    # Whether a real Acquirium server is reachable behind that adapter.
    acquirium_connected: bool
    detail: str | None = None
