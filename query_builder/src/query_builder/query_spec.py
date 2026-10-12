"""The query builder's steps, and how they become an Acquirium query and the matching Python.

The frontend sends a list of steps (QuerySpec). Each step turns into one method call on Acquirium's
explore Query (a Call). The same calls are executed by run_query and printed by to_python, so the
Python shown always matches what ran.
"""
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Optional, Union
from urllib.parse import urlsplit
from acquirium.Client.explore import REGISTRY, Not
from pydantic import BaseModel, BeforeValidator, Field, StringConstraints, field_validator

# Most rows a query run sends back; the rest are counted but left out
MAX_ROWS = 1000

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

def _filter_kwargs(filters: list[Filter]) -> dict:
    return {f.attr: Not(f.value) if f.exclude else f.value for f in filters}

def _set_kwargs(**kwargs: Any) -> dict:
    """Keeps only the options that were set, so Acquirium's own defaults apply to the rest."""
    return {name: value for name, value in kwargs.items() if value is not None}

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

    def to_call(self) -> Call:
        return Call("entity", (self.cls,) if self.cls else (),
                    {**_set_kwargs(uri=self.uri, alias=self.alias), **_filter_kwargs(self.filters)})

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

    def to_call(self) -> Call:
        options = _set_kwargs(uri=self.uri, alias=self.alias, frm=self.frm, via=self.via,
                              direction=self.direction, max_depth=self.max_depth, nearest=self.nearest)
        return Call("related", (self.cls,) if self.cls else (), {**options, **_filter_kwargs(self.filters)})

class MeasurementStep(_FilteredStep):
    """Attach measurement points: Query.measurement(frm=, alias=, direction=, max_depth=, nearest=, **filters)."""
    kind: Literal["measurement"]
    frm: Text = None
    alias: Text = None
    direction: Direction = None
    max_depth: Optional[int] = Field(default=None, ge=0)
    nearest: Optional[bool] = None

    def to_call(self) -> Call:
        options = _set_kwargs(frm=self.frm, alias=self.alias, direction=self.direction,
                              max_depth=self.max_depth, nearest=self.nearest)
        return Call("measurement", (), {**options, **_filter_kwargs(self.filters)})

class WhereStep(_FilteredStep):
    """Filter an existing node: Query.where(target, **filters)."""
    kind: Literal["where"]
    target: Text = None
    filters: list[Filter] = Field(min_length=1)

    def to_call(self) -> Call:
        return Call("where", (self.target,) if self.target else (), _filter_kwargs(self.filters))

class IncludeStep(BaseModel):
    """Add output columns: Query.include(*names, of=, required=)."""
    kind: Literal["include"]
    names: list[NonBlank] = Field(min_length=1)
    of: Text = None
    required: bool = False

    def to_call(self) -> Call:
        return Call("include", tuple(self.names), _set_kwargs(of=self.of, required=self.required or None))

Step = Annotated[Union[EntityStep, RelatedStep, MeasurementStep, WhereStep, IncludeStep], Field(discriminator="kind")]

class QuerySpec(BaseModel):
    """The query builder's steps, in order."""
    steps: list[Step] = []

def to_calls(spec: QuerySpec) -> list[Call]:
    return [step.to_call() for step in spec.steps]

def apply_calls(query: Any, calls: list[Call]) -> Any:
    """Chains each call onto an Acquirium Query and returns the resulting Query."""
    for call in calls:
        query = getattr(query, call.method)(*call.args, **call.kwargs)
    return query

def run_query(acq: Any, spec: QuerySpec) -> dict:
    """Builds the query on Acquirium and returns its metadata table. Acquirium raises ValueError for bad queries."""
    if not spec.steps:
        raise ValueError("Add at least one step before running the query.")
    table = apply_calls(acq.query(), to_calls(spec)).metadata()
    rows = [list(row) for row in table.rows()]
    return {
        "columns": table.columns,
        "rows": rows[:MAX_ROWS],
        "total_rows": len(rows),
        "truncated": len(rows) > MAX_ROWS,
    }

def _literal(value: Any) -> str:
    """Python source for a value. repr() gives a correctly escaped literal for str/int/bool."""
    if isinstance(value, Not):
        return f"Not({value.value!r})"
    return repr(value)

def _arguments(args: tuple, kwargs: dict) -> str:
    return ", ".join([_literal(a) for a in args] + [f"{name}={_literal(v)}" for name, v in kwargs.items()])

def to_python(spec: QuerySpec, address: str) -> str:
    """A standalone script that connects to the Acquirium at `address` and runs the same query."""
    calls = to_calls(spec)
    url = urlsplit(address)
    connection = _set_kwargs(server_url=url.hostname, server_port=url.port,
                             use_ssl=True if url.scheme == "https" else None)
    uses_not = any(isinstance(v, Not) for call in calls for v in call.kwargs.values())

    lines = ["from acquirium import Acquirium"]
    if uses_not:
        lines.append("from acquirium.Client.explore import Not")
    lines += ["", f"aq = Acquirium({_arguments((), connection)})", ""]
    if calls:
        lines += ["q = (", "    aq.query()"]
        lines += [f"    .{call.method}({_arguments(call.args, call.kwargs)})" for call in calls]
        lines.append(")")
    else:
        lines.append("q = aq.query()")
    lines.append("print(q.metadata())")
    return "\n".join(lines) + "\n"

def query_attributes() -> list[dict]:
    """The attributes steps can filter on, from Acquirium's registry, for the builder's menus."""
    return [{"name": a.name, "roles": sorted(a.roles), "doc": a.doc} for a in REGISTRY.values()]
