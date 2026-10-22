"""The query builder's steps, and how they become an Acquirium query.

The frontend sends a list of steps (QuerySpec). Each step turns into one method call on Acquirium's
explore Query (a Call), and run_query chains those calls and returns the metadata table.
to_python is still a stub: it is meant to print the same calls as a standalone script.
"""
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Optional, Union
from acquirium.Client.explore import REGISTRY, Not
from pydantic import BaseModel, BeforeValidator, Field, StringConstraints, field_validator
from src.query_builder.resolve import resolve_text

# Most rows a query run should send back; the rest are counted but left out
MAX_ROWS = 1000

def _not_implemented(name: str) -> NotImplementedError:
    return NotImplementedError(f"query_builder.{name} is not implemented yet")

def _blank_to_none(value: Any) -> Any:
    """Trims text and treats blank text as "not set", so the frontend can send its form fields as-is."""
    if isinstance(value, str):
        return value.strip() or None
    return value

Text = Annotated[Optional[str], BeforeValidator(_blank_to_none)]
Direction = Annotated[Optional[Literal["upstream", "downstream"]], BeforeValidator(_blank_to_none)]
NonBlank = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

@dataclass(frozen=True)
class Call:
    """One method call on an Acquirium Query: method(*args, **kwargs)."""
    method: str
    args: tuple = ()
    kwargs: dict = field(default_factory=dict)

class Filter(BaseModel):
    """One attribute filter, e.g. medium = "brine"; exclude=True means medium is NOT "brine"."""
    attr: str
    value: NonBlank
    exclude: bool = False

    @field_validator("attr")
    @classmethod
    def _known_attribute(cls, attr: str) -> str:
        if attr not in REGISTRY:
            raise ValueError(f"unknown attribute {attr!r}; known: {', '.join(REGISTRY)}")
        return attr

class _FilteredStep(BaseModel):
    filters: list[Filter] = []

    @field_validator("filters")
    @classmethod
    def _one_filter_per_attribute(cls, filters: list[Filter]) -> list[Filter]:
        attrs = [f.attr for f in filters]
        repeated = sorted({a for a in attrs if attrs.count(a) > 1})
        if repeated:
            raise ValueError(f"filter each attribute at most once per step (repeated: {', '.join(repeated)})")
        return filters

class EntityStep(_FilteredStep):
    """Start a pattern at an entity: Query.entity(cls, uri=, alias=, **filters)."""
    kind: Literal["entity"]
    cls: Text = None
    uri: Text = None
    alias: Text = None

class RelatedStep(_FilteredStep):
    """Hop to a related entity: Query.related(cls, uri=, alias=, frm=, via=, direction=, max_depth=, nearest=, **filters)."""
    kind: Literal["related"]
    cls: Text = None
    uri: Text = None
    alias: Text = None
    frm: Text = None
    via: Text = None
    direction: Direction = None
    max_depth: Optional[int] = Field(default=None, ge=0)
    nearest: Optional[bool] = None

class MeasurementStep(_FilteredStep):
    """Attach measurement points: Query.measurement(frm=, alias=, direction=, max_depth=, nearest=, **filters)."""
    kind: Literal["measurement"]
    frm: Text = None
    alias: Text = None
    direction: Direction = None
    max_depth: Optional[int] = Field(default=None, ge=0)
    nearest: Optional[bool] = None

class WhereStep(_FilteredStep):
    """Filter an existing node: Query.where(target, **filters)."""
    kind: Literal["where"]
    target: Text = None
    filters: list[Filter] = Field(min_length=1)

class IncludeStep(BaseModel):
    """Add output columns: Query.include(*names, of=, required=)."""
    kind: Literal["include"]
    names: list[NonBlank] = Field(min_length=1)
    of: Text = None
    required: bool = False

class RefocusStep(BaseModel):
    """Point the query at an existing node: Query.refocus(alias)."""
    kind: Literal["refocus"]
    alias: NonBlank

Step = Annotated[Union[EntityStep, RelatedStep, MeasurementStep, WhereStep, IncludeStep, RefocusStep],
                 Field(discriminator="kind")]

class QuerySpec(BaseModel):
    """The query builder's steps, in order."""
    steps: list[Step] = []

def _options(step: BaseModel, *names: str) -> dict:
    """The named fields of a step that are set, so unset ones fall back to Acquirium's defaults."""
    return {name: getattr(step, name) for name in names if getattr(step, name) is not None}

def _filter_kwargs(filters: list[Filter]) -> dict:
    return {f.attr: Not(f.value) if f.exclude else f.value for f in filters}

def _step_call(step: Step) -> Call:
    if isinstance(step, (EntityStep, RelatedStep)):
        names = ("uri", "alias") if isinstance(step, EntityStep) else ("uri", "alias", "frm", "via", "direction", "max_depth", "nearest")
        return Call(step.kind, (step.cls,) if step.cls else (), {**_options(step, *names), **_filter_kwargs(step.filters)})
    if isinstance(step, MeasurementStep):
        return Call("measurement", (), {**_options(step, "frm", "alias", "direction", "max_depth", "nearest"), **_filter_kwargs(step.filters)})
    if isinstance(step, WhereStep):
        return Call("where", (step.target,) if step.target else (), _filter_kwargs(step.filters))
    if isinstance(step, IncludeStep):
        return Call("include", tuple(step.names), {**_options(step, "of"), **({"required": True} if step.required else {})})
    return Call("refocus", (step.alias,))

def to_calls(spec: QuerySpec) -> list[Call]:
    """One Call per step, e.g. an entity step with cls="Pump", alias="p" -> Call("entity", ("Pump",), {"alias": "p"}).

    Leaves unset options out (so Acquirium's defaults apply) and turns an excluded filter into
    acquirium.Client.explore.Not(value).
    """
    return [_step_call(step) for step in spec.steps]

def apply_calls(query: Any, calls: list[Call]) -> Any:
    """Chains each call onto an Acquirium Query (query.entity(...).measurement(...)...) and returns the result."""
    for call in calls:
        query = getattr(query, call.method)(*call.args, **call.kwargs)
    return query

def _with_labels(calls: list[Call]) -> list[Call]:
    """The calls with an include("label") right after each entity and related call, so every node comes back
    with its name and the page need not show identifiers. Measurement nodes already carry a label column, and
    including it again makes Acquirium fail, so they are left alone."""
    labelled = []
    for call in calls:
        labelled.append(call)
        if call.method in ("entity", "related"):
            labelled.append(Call("include", ("label",)))
    return labelled

def run_query(acq: Any, spec: QuerySpec) -> dict:
    """Builds the query on acq.query(), runs .metadata(), and returns
    {"columns": [...], "rows": [[...], ...] (at most MAX_ROWS), "total_rows": int, "truncated": bool}.

    Raises ValueError for an empty spec, ResolutionError (a ValueError) for entity text that does not
    match confidently, and Acquirium itself raises ValueError for queries it rejects. The backend turns ValueError into HTTP 400.
    """
    if not spec.steps:
        raise ValueError("Add at least one step before running the query")
    for step in spec.steps:
        if isinstance(step, (EntityStep, RelatedStep)) and step.cls:
            resolve_text(acq, step.cls, "class")  # fail early with candidates; the query still gets the typed text
    table = apply_calls(acq.query(), _with_labels(to_calls(spec))).metadata()
    return {
        "columns": table.columns,
        "rows": [list(row) for row in table.head(MAX_ROWS).rows()],
        "total_rows": table.height,
        "truncated": table.height > MAX_ROWS,
    }

def to_python(spec: QuerySpec, address: str) -> str:
    """Should return a standalone script that connects to the Acquirium at `address` (e.g.
    "http://127.0.0.1:58999") with acquirium.Acquirium and makes the same calls as run_query.
    """
    raise _not_implemented("to_python")

def query_attributes() -> list[dict]:
    """Lists the attributes steps can filter on, from Acquirium's REGISTRY:
    [{"name": "medium", "roles": ["data", "entity"], "doc": "..."}, ...].
    """
    return [{"name": name, "roles": sorted(attr.roles), "doc": attr.doc} for name, attr in REGISTRY.items()]
