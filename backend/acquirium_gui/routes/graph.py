"""The plant graph: the full model, and which parts a query touches.

Neither of these exists upstream -- Acquirium has no endpoint that returns a
renderable topology graph, which is exactly why this service exists.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from acquirium_gui.adapters import AcquiriumAdapter
from acquirium_gui.deps import get_adapter, get_config
from acquirium_gui.models import AppConfig, GraphModel, QueryDescription, Subgraph

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/model", response_model=GraphModel)
def graph_model(
    adapter: AcquiriumAdapter = Depends(get_adapter),
    config: AppConfig = Depends(get_config),
) -> GraphModel:
    """The whole plant, class-level, for the empty-query state.

    Cheap enough to fetch once on load; the frontend caches it and only
    re-requests when the graph size limit changes.
    """
    return adapter.graph_model(node_limit=config.graph_node_limit)


@router.post("/subgraph", response_model=Subgraph)
def subgraph(
    description: QueryDescription,
    adapter: AcquiriumAdapter = Depends(get_adapter),
) -> Subgraph:
    """Highlighting and class-to-instance relabeling for the current query."""
    return adapter.subgraph(description)
