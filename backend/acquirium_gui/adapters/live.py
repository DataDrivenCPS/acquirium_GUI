"""The real Acquirium-backed adapter. Not implemented yet.

This file is the checklist for wiring the GUI to a live server. It is
deliberately present and importable so the seam is visible: nothing outside
this module needs to change when it is filled in.

Prerequisites (see CLAUDE.md's development setup):

    pip install acquirium[watertap]
    acquirium server --config deployments/WATERTAP/models/seawater-ro/acquirium.toml

Implementation notes for whoever picks this up:

* Build the query by replaying ``QueryDescription.steps`` onto a real
  ``acq.query()``, one verb per step. ``Query`` is immutable, so each step
  produces a new object -- keep the alias map as you go.
* ``metadata()`` and ``dataframe()`` return polars frames; convert to
  :class:`~acquirium_gui.models.Table` with values stringified, and strip any
  column holding a URI before it reaches the frontend. Name the metadata
  columns with :func:`acquirium_gui.naming.metadata_columns` rather than from
  the frame's own headers, which are aliases -- both adapters have to produce
  the same headers for the same query.
* ``graph_model`` has no ready-made endpoint upstream. Build it from
  ``client.sparql_query()`` over the ontology's class hierarchy plus the
  deployment's connection triples, then map URIs to opaque ids here so they
  never leave this module. ``client.compact_uri`` and the namespace manager
  are the tools for readable labels.
  Each node also carries ``instance_count`` -- how many real units of that
  class the deployment has, which the UI shows on the node. A count query
  per class over the same SPARQL results is enough.
  A class-level node's ``id`` must also be a valid ``cls`` reference id: the
  builder sends graph node ids straight back as ``QueryStep.cls`` when the
  user clicks a node or a suggestion chip, so the two id spaces have to be
  the same one. Deriving both from the same URI-to-id mapping is enough.
* ``subgraph`` should use ``Query.resolved_nodes()`` for the matched URIs and
  the same id mapping to translate them into model-graph node ids.
* ``resolve`` maps onto ``client.resolve(text, kind, top_k=..., min_score=...)``.
  Keep min_score at Acquirium's floor and let the route apply the
  user-configured confidence threshold, so the two stay separable.
* ``generated_query`` is the one place a URI or SPARQL string is allowed out:
  ``Query.to_sparql()`` plus the Python chain.
"""

from __future__ import annotations

from acquirium_gui.models import (
    AttributeName,
    Candidate,
    GeneratedQuery,
    GraphModel,
    QueryDescription,
    Ref,
    ResolveKind,
    Subgraph,
    Table,
)

from .base import AcquiriumAdapter, AdapterError

_NOT_READY = (
    "The live Acquirium adapter is not implemented yet. Start the app with "
    "ACQUIRIUM_GUI_ADAPTER=stub (the default) to use sample data."
)


class LiveAdapter(AcquiriumAdapter):
    name = "live"

    def __init__(self, server_url: str = "localhost", server_port: int = 8000) -> None:
        self.server_url = server_url
        self.server_port = server_port
        self._acq = None

    def connected(self) -> bool:
        return False

    def graph_model(self, node_limit: int) -> GraphModel:
        raise AdapterError(_NOT_READY)

    def subgraph(self, description: QueryDescription) -> Subgraph:
        raise AdapterError(_NOT_READY)

    def resolve(self, text: str, kind: ResolveKind, top_k: int) -> list[Candidate]:
        raise AdapterError(_NOT_READY)

    def attribute_values(self, attr: AttributeName) -> list[Ref]:
        raise AdapterError(_NOT_READY)

    def metadata(self, description: QueryDescription) -> Table:
        raise AdapterError(_NOT_READY)

    def dataframe(self, description: QueryDescription, *, limit: int = 50) -> Table:
        raise AdapterError(_NOT_READY)

    def generated_query(self, description: QueryDescription) -> GeneratedQuery:
        raise AdapterError(_NOT_READY)
