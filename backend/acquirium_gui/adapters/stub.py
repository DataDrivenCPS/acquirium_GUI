"""A fixture-backed adapter, so the UI works before Acquirium is installed.

It walks :mod:`acquirium_gui.fixtures.seawater_ro` with a deliberately tiny
binding evaluator. The point is to produce *realistically shaped* responses --
the same JSON the live adapter will produce -- not to be a correct or complete
query engine. Anything subtle about Acquirium's real semantics (nearest-match
defaults, max_depth walks, hidden predicates, dependency inclusion) is
approximated here and must not be relied on.

A "binding" is one candidate answer row: a mapping of alias -> fixture id,
exactly like a SPARQL solution. Each verb expands or filters the binding list.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from acquirium_gui.fixtures import seawater_ro as fx
from acquirium_gui.naming import metadata_columns
from acquirium_gui.models import (
    AttributeName,
    Candidate,
    GeneratedQuery,
    GraphEdge,
    GraphModel,
    GraphNode,
    QueryDescription,
    QueryStep,
    Ref,
    ResolveKind,
    Subgraph,
    Table,
)

from .base import AcquiriumAdapter, AdapterError

# Fixed epoch so generated timeseries are identical across runs and tests.
_SERIES_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
_SERIES_INTERVAL = timedelta(minutes=5)

# Steps that introduce a new alias into the binding, in the order the user
# applied them. where/refocus constrain or move, they do not bind.
_BINDING_KINDS = ("entity", "related", "measurement")


class Binding(dict):
    """alias -> fixture id, plus the connection ids walked to get here."""

    def __init__(self, *args, edges: frozenset[str] = frozenset(), **kwargs):
        super().__init__(*args, **kwargs)
        self.edges = edges

    def extended(self, alias: str, value: str, *, edge: str | None = None) -> "Binding":
        merged = dict(self)
        merged[alias] = value
        return Binding(
            merged,
            edges=self.edges | ({edge} if edge else set()),
        )


def alias_of(step: QueryStep) -> str:
    """The alias a step binds to, generated when the user did not name it."""
    if step.alias:
        return step.alias
    return f"{step.kind}_{step.id}"


class StubAdapter(AcquiriumAdapter):
    name = "stub"

    def connected(self) -> bool:
        # Never talks to a server; /api/health reports this so the UI can say
        # plainly that it is showing sample data.
        return False

    # --- graph -------------------------------------------------------------

    def graph_model(self, node_limit: int) -> GraphModel:
        """The plant at class level: one node per class actually installed.

        Classes the ontology defines but this plant does not use are left out
        -- this is the plant's model, not the whole ontology.
        """
        counts: dict[str, int] = {}
        for entity in fx.ENTITIES:
            counts[entity.class_id] = counts.get(entity.class_id, 0) + 1

        nodes = [
            GraphNode(
                id=class_id,
                label=fx.CLASS_BY_ID[class_id].label,
                level="class",
                kind="system" if class_id == "c_system" else "equipment",
                instance_count=counts[class_id],
            )
            for class_id in sorted(counts)
        ]

        # Collapse instance connections up to the class level, deduplicating.
        seen: dict[tuple[str, str, str], GraphEdge] = {}
        for conn in fx.CONNECTIONS:
            src = fx.ENTITY_BY_ID[conn.source].class_id
            dst = fx.ENTITY_BY_ID[conn.target].class_id
            if src == dst:
                continue
            label = fx.PREDICATE_BY_ID[conn.predicate_id].label
            key = (src, dst, label)
            seen.setdefault(
                key, GraphEdge(id=f"{src}__{label}__{dst}", source=src, target=dst, label=label)
            )

        total = len(nodes)
        simplified = total > node_limit
        if simplified:
            keep = {n.id for n in nodes[:node_limit]}
            nodes = [n for n in nodes if n.id in keep]
            seen = {k: e for k, e in seen.items() if e.source in keep and e.target in keep}

        return GraphModel(
            nodes=nodes,
            edges=list(seen.values()),
            simplified=simplified,
            total_nodes=total,
        )

    def subgraph(self, description: QueryDescription) -> Subgraph:
        bindings = self._evaluate(description)
        if not bindings:
            return Subgraph()

        # Which entities each alias matched, so a class node can be relabeled
        # when exactly one instance survives.
        per_class: dict[str, set[str]] = {}
        edges: set[str] = set()
        for binding in bindings:
            edges |= binding.edges
            for value in binding.values():
                entity = fx.ENTITY_BY_ID.get(value)
                if entity is None:
                    # Measurement points hang off their entity, which is
                    # already bound by an earlier alias.
                    continue
                per_class.setdefault(entity.class_id, set()).add(entity.id)

        relabeled = {
            class_id: fx.ENTITY_BY_ID[next(iter(matches))].label
            for class_id, matches in per_class.items()
            if len(matches) == 1
        }

        highlighted_edges = set()
        for conn_id in edges:
            conn = next((c for c in fx.CONNECTIONS if c.id == conn_id), None)
            if conn is None:
                continue
            src = fx.ENTITY_BY_ID[conn.source].class_id
            dst = fx.ENTITY_BY_ID[conn.target].class_id
            label = fx.PREDICATE_BY_ID[conn.predicate_id].label
            highlighted_edges.add(f"{src}__{label}__{dst}")

        return Subgraph(
            highlighted_nodes=sorted(per_class),
            highlighted_edges=sorted(highlighted_edges),
            relabeled=relabeled,
        )

    # --- resolution --------------------------------------------------------

    def resolve(self, text: str, kind: ResolveKind, top_k: int) -> list[Candidate]:
        text = text.strip()
        if not text:
            return []

        pool: list[tuple[str, str, ResolveKind]] = []
        if kind in ("class", "entity"):
            # The entity slot legitimately accepts either a class name
            # ("pump") or a specific tag ("RO"), so both are offered and the
            # candidate carries which one it is.
            for entity_class in fx.CLASSES:
                pool.append((entity_class.id, entity_class.label, "class"))
            for entity in fx.ENTITIES:
                pool.append((entity.id, entity.label, "entity"))
        elif kind == "predicate":
            for predicate in fx.PREDICATES:
                pool.append((predicate.id, predicate.label, "predicate"))
        elif kind == "attribute_value":
            for attr_value in fx.ATTR_VALUES:
                pool.append((attr_value.id, attr_value.label, "attribute_value"))

        scored = [
            Candidate(id=item_id, label=label, kind=item_kind, score=_score(text, label))
            for item_id, label, item_kind in pool
        ]
        scored.sort(key=lambda c: (-c.score, c.label))
        return [c for c in scored if c.score > 0.3][:top_k]

    def attribute_values(self, attr: AttributeName) -> list[Ref]:
        return [
            Ref(id=v.id, label=v.label)
            for v in fx.ATTR_VALUES
            if v.attr == attr
        ]

    # --- results -----------------------------------------------------------

    def metadata(self, description: QueryDescription) -> Table:
        binding_steps = [s for s in description.steps if s.kind in _BINDING_KINDS]
        if not binding_steps:
            return Table(empty_reason="Add an entity to start building a query.")

        bindings = self._evaluate(description)

        # Named from what each step matched rather than from its alias --
        # see acquirium_gui.naming. The row loop below fills these in the
        # same order and grouping.
        columns = metadata_columns(binding_steps)

        rows: list[list[str]] = []
        for binding in bindings:
            row: list[str] = []
            for step in binding_steps:
                alias = alias_of(step)
                value = binding.get(alias)
                if value is None:
                    row += [""] * (3 if step.kind == "measurement" else 2)
                    continue
                if step.kind == "measurement":
                    point = fx.POINT_BY_ID[value]
                    row.append(point.label)
                    row.append(fx.label_of(point.attrs.get("quantity_kind", "")))
                    row.append(fx.label_of(point.attrs.get("unit", "")))
                else:
                    entity = fx.ENTITY_BY_ID[value]
                    row.append(entity.label)
                    row.append(fx.CLASS_BY_ID[entity.class_id].label)
            rows.append(row)

        rows = _dedupe(rows)
        empty_reason = None if rows else "Nothing in the plant model matches this query."
        return Table(columns=columns, rows=rows, empty_reason=empty_reason)

    def dataframe(self, description: QueryDescription, *, limit: int = 50) -> Table:
        """Wide-shaped timeseries: a time column plus one column per point.

        Mirrors ``Query.dataframe(shape="wide")``. Only called on an explicit
        Execute, never as part of the metadata preview.
        """
        measurement_aliases = [
            alias_of(s) for s in description.steps if s.kind == "measurement"
        ]
        if not measurement_aliases:
            return Table(
                empty_reason=(
                    "This query has no measurements attached, so there is no "
                    "data to retrieve. Add a measurement step first."
                )
            )

        bindings = self._evaluate(description)
        point_ids: list[str] = []
        for binding in bindings:
            for alias in measurement_aliases:
                value = binding.get(alias)
                if value is not None and value in fx.POINT_BY_ID and value not in point_ids:
                    point_ids.append(value)

        if not point_ids:
            return Table(empty_reason="No measurement points matched this query.")

        points = [fx.POINT_BY_ID[pid] for pid in point_ids]
        columns = ["time"] + [f"{p.label} ({fx.label_of(p.attrs.get('unit', ''))})" for p in points]
        rows = [
            [(_SERIES_START + i * _SERIES_INTERVAL).isoformat()]
            + [_sample(p, i) for p in points]
            for i in range(limit)
        ]
        return Table(columns=columns, rows=rows)

    def generated_query(self, description: QueryDescription) -> GeneratedQuery:
        chain = "acq.query()"
        for step in description.steps:
            chain += "\n    ." + _render_step(step)
        chain += "\n    .metadata()"
        return GeneratedQuery(
            python=chain,
            sparql=None,
            note=(
                "SPARQL comes from the live server's Query.to_sparql(); it is "
                "unavailable while running on sample data."
            ),
        )

    # --- evaluation --------------------------------------------------------

    def _evaluate(self, description: QueryDescription) -> list[Binding]:
        """Apply each step in order, expanding or filtering the bindings."""
        bindings: list[Binding] = [Binding()]
        current: str | None = None

        for step in description.steps:
            if step.kind == "entity":
                alias = alias_of(step)
                bindings = [
                    b.extended(alias, entity.id)
                    for b in bindings
                    for entity in self._entity_candidates(step)
                ]
                current = alias

            elif step.kind == "related":
                alias = alias_of(step)
                source_alias = step.frm or current
                if source_alias is None:
                    raise AdapterError(
                        "Add an entity before relating another one to it."
                    )
                expanded: list[Binding] = []
                for binding in bindings:
                    source = binding.get(source_alias)
                    if source is None:
                        continue
                    for conn, other in fx.neighbours(source, step.direction):
                        entity = fx.ENTITY_BY_ID[other]
                        if not self._entity_matches(step, entity):
                            continue
                        if step.via and conn.predicate_id != step.via.id:
                            continue
                        expanded.append(binding.extended(alias, other, edge=conn.id))
                bindings = expanded
                current = alias

            elif step.kind == "measurement":
                alias = alias_of(step)
                source_alias = step.frm or current
                expanded = []
                for binding in bindings:
                    sources = (
                        [binding[source_alias]]
                        if source_alias and source_alias in binding
                        else [e.id for e in fx.ENTITIES]
                    )
                    for source in sources:
                        for point in fx.points_of(source):
                            if not _attrs_match(point.attrs, step):
                                continue
                            expanded.append(binding.extended(alias, point.id))
                bindings = expanded
                current = alias

            elif step.kind == "where":
                target = step.target or current
                if target is None:
                    raise AdapterError("Add an entity before filtering it.")
                bindings = [b for b in bindings if self._where_matches(b, target, step)]

            elif step.kind == "refocus":
                if not step.target:
                    raise AdapterError("Choose which part of the query to go back to.")
                current = step.target

        return bindings

    def _entity_candidates(self, step: QueryStep) -> list[fx.Entity]:
        if step.instance is not None:
            entity = fx.ENTITY_BY_ID.get(step.instance.id)
            return [entity] if entity and self._entity_matches(step, entity) else []
        pool = (
            fx.entities_of_class(step.cls.id) if step.cls is not None else list(fx.ENTITIES)
        )
        return [e for e in pool if self._entity_matches(step, e)]

    def _entity_matches(self, step: QueryStep, entity: fx.Entity) -> bool:
        if step.cls is not None and entity.class_id != step.cls.id:
            return False
        if step.instance is not None and entity.id != step.instance.id:
            return False
        return _attrs_match(entity.attrs, step)

    def _where_matches(self, binding: Binding, target: str, step: QueryStep) -> bool:
        value = binding.get(target)
        if value is None:
            return False
        holder = fx.ENTITY_BY_ID.get(value) or fx.POINT_BY_ID.get(value)
        if holder is None:
            return False
        attrs = dict(holder.attrs)
        if isinstance(holder, fx.Entity):
            # `type` is the class, which is not stored in attrs.
            attrs["type"] = holder.class_id
        return _attrs_match(attrs, step)


# --- helpers ---------------------------------------------------------------


def _attrs_match(attrs: dict[str, str], step: QueryStep) -> bool:
    for constraint in step.attrs:
        actual = attrs.get(constraint.name)
        hit = actual == constraint.value.id
        if hit == constraint.negated:
            return False
    return True


def _score(text: str, label: str) -> float:
    """Crude stand-in for Acquirium's embedding-based resolver.

    Good enough to make exact names confident and partial names ambiguous,
    which is all the disambiguation UI needs to be exercised.
    """
    lowered, target = text.lower(), label.lower()
    if lowered == target:
        return 1.0
    ratio = SequenceMatcher(None, lowered, target).ratio()
    if lowered in target:
        # A contained word scores by how much of the label it accounts for,
        # so "filter" lands mid-range against several longer filter classes.
        return max(ratio, 0.55 + 0.3 * (len(lowered) / len(target)))
    return ratio


def _dedupe(rows: list[list[str]]) -> list[list[str]]:
    seen: set[tuple[str, ...]] = set()
    out: list[list[str]] = []
    for row in rows:
        key = tuple(row)
        if key not in seen:
            seen.add(key)
            out.append(row)
    return out


def _sample(point: fx.Point, index: int) -> float:
    """Deterministic pseudo-reading, so tests and demos are reproducible."""
    wave = math.sin((index / 12.0) + (hash(point.id) % 100) / 100.0)
    return round(point.base + point.amplitude * wave, 3)


def _render_step(step: QueryStep) -> str:
    """One builder step as the Python call it stands for."""
    args: list[str] = []
    if step.kind in ("entity", "related"):
        if step.instance is not None:
            args.append(f'uri="{step.instance.label}"')
        elif step.cls is not None:
            args.append(f'"{step.cls.label}"')
    if step.kind == "refocus":
        return f'refocus("{step.target}")'
    if step.alias:
        args.append(f'alias="{step.alias}"')
    if step.frm:
        args.append(f'frm="{step.frm}"')
    if step.kind == "where" and step.target:
        args.append(f'target="{step.target}"')
    if step.via is not None:
        args.append(f'via="{step.via.label}"')
    if step.direction:
        args.append(f'direction="{step.direction}"')
    if step.max_depth is not None:
        args.append(f"max_depth={step.max_depth}")
    for constraint in step.attrs:
        value = f'"{constraint.value.label}"'
        if constraint.negated:
            value = f"Not({value})"
        args.append(f"{constraint.name}={value}")
    return f"{step.kind}({', '.join(args)})"
