"""The one seam between this app and Acquirium.

Every route goes through an :class:`AcquiriumAdapter`. Swapping the fixture
stub for a real Acquirium server is meant to be a single line in
``acquirium_gui.adapters.get_adapter`` plus an implementation of this
interface -- no route, schema or frontend change.

Implementations must not leak URIs or CURIEs into anything they return,
apart from :meth:`AcquiriumAdapter.generated_query`, which exists precisely
to show technical users the real query text.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

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


class AdapterError(RuntimeError):
    """Raised when a query cannot be answered.

    Routes translate this into a 4xx with a plain-language message, so the UI
    can say what went wrong instead of showing a stack trace or crashing --
    per the non-functional requirement about missing results.
    """


class AcquiriumAdapter(ABC):
    """What the rest of the app is allowed to know about Acquirium."""

    #: Short identifier reported by /api/health, e.g. "stub" or "live".
    name: str = "abstract"

    @abstractmethod
    def connected(self) -> bool:
        """Whether a real Acquirium server is reachable behind this adapter."""

    @abstractmethod
    def graph_model(self, node_limit: int) -> GraphModel:
        """The plant topology, class-level, for the empty-query state.

        Reduced to at most ``node_limit`` nodes, with ``simplified`` set when
        that reduction actually happened.
        """

    @abstractmethod
    def subgraph(self, description: QueryDescription) -> Subgraph:
        """Which model-graph nodes and edges the query currently touches.

        Also carries the class-to-instance relabeling: once a step pins a
        class down to exactly one real piece of equipment, that node reports
        the instance label instead.
        """

    @abstractmethod
    def resolve(self, text: str, kind: ResolveKind, top_k: int) -> list[Candidate]:
        """Free text to ranked candidates, best first.

        Confidence policy (threshold, runner-up margin) lives in the route,
        not here -- adapters only rank.
        """

    @abstractmethod
    def attribute_values(self, attr: AttributeName) -> list[Ref]:
        """Selectable values for one attribute, for the where() value picker."""

    @abstractmethod
    def metadata(self, description: QueryDescription) -> Table:
        """The cheap, lazy preview. Called after every builder step."""

    @abstractmethod
    def dataframe(self, description: QueryDescription, *, limit: int = 50) -> Table:
        """The expensive timeseries retrieval. Only called on explicit Execute."""

    @abstractmethod
    def generated_query(self, description: QueryDescription) -> GeneratedQuery:
        """The read-only technical view: Python, and SPARQL when available."""
