"""The query builder's steps, and how they become an Acquirium query.

The frontend sends a list of steps (QuerySpec). Each step turns into one method call on Acquirium's
explore Query (a Call), and run_query chains those calls and returns the metadata table.
to_python writes the same calls out as a standalone Python script.
"""
import re
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Optional, Union
from acquirium.Client.explore import REGISTRY, Not
from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, StringConstraints, field_validator
from src.query_builder.resolve import resolve_text

# Most rows a query run should send back; the rest are counted but left out
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

def _no_period(alias: Optional[str]) -> Optional[str]:
    """Result columns are named '<alias>.<attribute>', so a period in an alias would look like an attribute column."""
    if alias and "." in alias:
        raise ValueError(f"alias {alias!r} cannot contain a period")
    return alias

NewAlias = Annotated[Text, AfterValidator(_no_period)]

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
    alias: NewAlias = None

class RelatedStep(_FilteredStep):
    """Hop to a related entity: Query.related(cls, uri=, alias=, frm=, via=, direction=, max_depth=, nearest=, **filters)."""
    kind: Literal["related"]
    cls: Text = None
    uri: Text = None
    alias: NewAlias = None
    frm: Text = None
    via: Text = None
    direction: Direction = None
    max_depth: Optional[int] = Field(default=None, ge=0)
    nearest: Optional[bool] = None

class MeasurementStep(_FilteredStep):
    """Attach measurement points: Query.measurement(frm=, alias=, direction=, max_depth=, nearest=, **filters)."""
    kind: Literal["measurement"]
    frm: Text = None
    alias: NewAlias = None
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

def _step_call(step: Step, number: int) -> Call:
    if isinstance(step, (EntityStep, RelatedStep)):
        names = ("uri", "alias") if isinstance(step, EntityStep) else ("uri", "alias", "frm", "via", "direction", "max_depth", "nearest")
        options = _options(step, *names)
        if not step.cls and not step.alias:
            options["alias"] = f"{step.kind} {number}"  # else Acquirium names the column with a bare number
        return Call(step.kind, (step.cls,) if step.cls else (), {**options, **_filter_kwargs(step.filters)})
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
    acquirium.Client.explore.Not(value). An entity or related step with no class and no alias is named
    after its position ("entity 1"), since Acquirium would otherwise name its column with a bare number.
    """
    return [_step_call(step, number) for number, step in enumerate(spec.steps, start=1)]

def apply_calls(query: Any, calls: list[Call]) -> Any:
    """Chains each call onto an Acquirium Query (query.entity(...).measurement(...)...) and returns the result."""
    for call in calls:
        query = getattr(query, call.method)(*call.args, **call.kwargs)
    return query

# Characters that cannot be in an identifier written as <...> in a query
_BAD_IRI_CHARS = re.compile(r'[\s<>"{}|\\^`]')

def _looks_like_iri(value: str) -> bool:
    """Whether Acquirium writes this text into its query as an identifier, <value>, rather than as a literal."""
    return "://" in value or value.startswith("urn:")

def _escape_literal(value: str) -> str:
    """The text made safe to sit between double quotes in a query (Acquirium writes literals without escaping them)."""
    escapes = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}
    return "".join(escapes.get(char, char) for char in value)

def _safe_value(value: Any, literal: bool) -> Any:
    """A filter value made safe for Acquirium's query text: an identifier must be well formed, and a literal is escaped.
    Text that Acquirium matches by meaning (a medium, a unit) is left as typed, since it is never put in the query."""
    if isinstance(value, Not):
        return Not(_safe_value(value.value, literal))
    if not isinstance(value, str):
        return value
    if _looks_like_iri(value):
        if _BAD_IRI_CHARS.search(value):
            raise ValueError(f"{value!r} is not a valid identifier")
        return value
    return _escape_literal(value) if literal else value

def _safe_for_acquirium(calls: list[Call]) -> list[Call]:
    """The calls with every user-typed value made safe to be written into Acquirium's query text."""
    safe = []
    for call in calls:
        args = call.args
        if call.method in ("entity", "related") and args:
            args = (_safe_value(args[0], literal=False),)
        kwargs = {}
        for key, value in call.kwargs.items():
            if key in REGISTRY:
                value = _safe_value(value, REGISTRY[key].literal)
            elif key in ("uri", "via"):
                value = _safe_value(value, literal=False)
            kwargs[key] = value
        safe.append(Call(call.method, args, kwargs))
    return safe

def _check_text(acq: Any, spec: QuerySpec) -> None:
    """Raises ResolutionError, with candidates, for typed text that does not match one node confidently: class
    text, and filter values Acquirium matches by meaning (a medium, a unit). The query still gets the typed text.
    Literal attributes (a label) are matched verbatim, and a value that is already an identifier needs no match."""
    for step in spec.steps:
        if isinstance(step, (EntityStep, RelatedStep)) and step.cls:
            resolve_text(acq, step.cls, "class", field="class")
        for filter_ in getattr(step, "filters", []):
            attribute = REGISTRY[filter_.attr]
            if not attribute.literal and not _looks_like_iri(filter_.value):
                resolve_text(acq, filter_.value, attribute.kind, field=filter_.attr)

def _check_entities_exist(acq: Any, spec: QuerySpec) -> None:
    """Raises ValueError for an entity or related step whose identifier is not in the graph. Without this,
    Acquirium answers such a step with one made-up row. The identifier is checked for safety after Acquirium
    expands a prefix (wbs:x) to a full identifier, because it is written into the query as <...>."""
    for step in spec.steps:
        if isinstance(step, (EntityStep, RelatedStep)) and step.uri:
            expanded = acq.client.expand_uri(step.uri)
            if _BAD_IRI_CHARS.search(expanded):
                raise ValueError(f"{step.uri!r} is not a valid identifier")
            exists = acq.client.sparql_query(f"ASK {{ <{expanded}> ?p ?o }}")["rows"][0][0]
            if not exists:
                raise ValueError(f"No entity found for {step.uri!r}")

def _with_labels(calls: list[Call]) -> list[Call]:
    """The calls with an include("label") right after each entity and related call, so every node comes back
    with its name and the page need not show identifiers. Measurement nodes already carry a label column, and
    including it again makes Acquirium fail on a duplicate column, so they are left alone. For the same reason
    "label" is dropped from the user's own include calls (an include left with no names is dropped)."""
    labelled = []
    for call in calls:
        if call.method == "include":
            names = tuple(name for name in call.args if name != "label")
            if not names:
                continue
            call = Call("include", names, call.kwargs)
        labelled.append(call)
        if call.method in ("entity", "related"):
            labelled.append(Call("include", ("label",)))
    return labelled

def run_query(acq: Any, spec: QuerySpec) -> dict:
    """Builds the query on acq.query(), runs .metadata(), and returns
    {"columns": [...], "rows": [[...], ...] (at most MAX_ROWS), "total_rows": int, "truncated": bool}.

    Raises ValueError for an empty spec, ResolutionError (a ValueError) for class text or a filter value
    that does not match confidently, and Acquirium itself raises ValueError for queries it rejects. The backend turns ValueError into HTTP 400.
    """
    if not spec.steps:
        raise ValueError("Add at least one step before running the query")
    _check_text(acq, spec)
    _check_entities_exist(acq, spec)
    calls = _safe_for_acquirium(_with_labels(to_calls(spec)))
    if not calls:
        raise ValueError("There is nothing to run: add an entity, related or measurement step")
    table = apply_calls(acq.query(), calls).metadata()
    return {
        "columns": table.columns,
        "rows": [list(row) for row in table.head(MAX_ROWS).rows()],
        "total_rows": table.height,
        "truncated": table.height > MAX_ROWS,
    }

def _format_call(call: Call) -> str:
    """One call as a line of the chained query, e.g. Call("entity", ("Pump",), {"alias": "p"}) -> ".entity('Pump', alias='p')"."""
    partsOfCall = [] # to hold the pieces of the call/query
    for arg in call.args:
        partsOfCall.append(repr(arg))
    for key, value in call.kwargs.items():
        partsOfCall.append(f"{key}={value!r}")
    return f".{call.method}({', '.join(partsOfCall)})"


def to_python(spec: QuerySpec, address: str) -> str:
    """Returns a standalone script that connects to the Acquirium at `address` and makes the same
    calls as run_query, minus the label includes run_query adds for the page."""
    calls = to_calls(spec)
    if not calls:
        raise ValueError("Add at least one step to see the query as Python") # if no query steps, generate error

    # Only import Not if one of the filters excludes a value
    uses_not = False
    for call in calls:
        for value in call.kwargs.values():
            if isinstance(value, Not):                      
                uses_not = True

    # Top: imports and the connection
    lines = ["import acquirium"]
    if uses_not:
        lines.append("from acquirium.Client.explore import Not")
    lines.append("")
    lines.append(f"acq = acquirium.init(address={address!r})") # the acq = acquirium.init(...) line
    lines.append("")

    # Middle: the chained query, one call per line
    lines.append("table = (")
    lines.append("    acq.query()") # indentation for readability
    for call in calls:
        lines.append("    " + _format_call(call)) # indentation for readability

    # Bottom: run it and show the table
    lines.append("    .metadata()")
    lines.append(")")
    lines.append("print(table)")

    return "\n".join(lines) + "\n"

def query_attributes() -> list[dict]:
    """Lists the attributes steps can filter on, from Acquirium's REGISTRY:
    [{"name": "medium", "roles": ["data", "entity"], "doc": "..."}, ...].
    """
    return [{"name": name, "roles": sorted(attr.roles), "doc": attr.doc} for name, attr in REGISTRY.items()]
