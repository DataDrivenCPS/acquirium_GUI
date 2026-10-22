"""The query builder's steps, and how they should become an Acquirium query and the matching Python.

STUB: the request format (the step models below) is defined and validated, but the behavior is not
implemented yet. Every function below raises NotImplementedError; its docstring says what it should do.
The backend's /query/* routes already call these functions and answer 501 until they are filled in.

Intended design: the frontend sends a list of steps (QuerySpec). Each step turns into one method call
on Acquirium's explore Query (a Call). The same calls are executed by run_query and printed by
to_python, so the Python shown always matches what ran.
"""
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Optional, Union
from acquirium.Client.explore import REGISTRY
from pydantic import BaseModel, BeforeValidator, Field, StringConstraints, field_validator

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

Step = Annotated[Union[EntityStep, RelatedStep, MeasurementStep, WhereStep, IncludeStep], Field(discriminator="kind")]

class QuerySpec(BaseModel):
    """The query builder's steps, in order."""
    steps: list[Step] = []

def to_calls(spec: QuerySpec) -> list[Call]:
    """One Call per step, e.g. an entity step with cls="Pump", alias="p" -> Call("entity", ("Pump",), {"alias": "p"}).

    Should leave unset options out (so Acquirium's defaults apply) and turn an excluded filter into
    acquirium.Client.explore.Not(value).
    """
    raise _not_implemented("to_calls")

def apply_calls(query: Any, calls: list[Call]) -> Any:
    """Should chain each call onto an Acquirium Query (query.entity(...).measurement(...)...) and return the result."""
    raise _not_implemented("apply_calls")

def run_query(acq: Any, spec: QuerySpec) -> dict:
    """Should build the query on acq.query(), run .metadata(), and return
    {"columns": [...], "rows": [[...], ...] (at most MAX_ROWS), "total_rows": int, "truncated": bool}.

    Should raise ValueError for an empty spec; Acquirium itself raises ValueError for queries it
    rejects. The backend turns ValueError into HTTP 400.
    """
    raise _not_implemented("run_query")

def to_python(spec: QuerySpec, address: str) -> str:
    """Should return a standalone script that connects to the Acquirium at `address` (e.g.
    "http://127.0.0.1:58999") with acquirium.Acquirium and makes the same calls as run_query.
    """
    raise _not_implemented("to_python")

def query_attributes() -> list[dict]:
    """Should list the attributes steps can filter on, from Acquirium's REGISTRY:
    [{"name": "medium", "roles": ["data", "entity"], "doc": "..."}, ...].
    """
    raise _not_implemented("query_attributes")
