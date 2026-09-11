"""Running the query being built.

The split here is the whole point of the four-panel design: ``/metadata`` is
cheap and fires after every builder step, ``/execute`` is expensive and only
fires when the user clicks Execute. Do not merge them, and do not call
``/execute`` on a timer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from acquirium_gui.adapters import AcquiriumAdapter
from acquirium_gui.deps import get_adapter
from acquirium_gui.models import GeneratedQuery, QueryDescription, Table

router = APIRouter(prefix="/query", tags=["query"])


@router.post("/metadata", response_model=Table)
def metadata(
    description: QueryDescription,
    adapter: AcquiriumAdapter = Depends(get_adapter),
) -> Table:
    """What the query matches right now. Lazy, no timeseries retrieval."""
    return adapter.metadata(description)


@router.post("/execute", response_model=Table)
def execute(
    description: QueryDescription,
    limit: int = Query(default=50, ge=1, le=5000),
    adapter: AcquiriumAdapter = Depends(get_adapter),
) -> Table:
    """Retrieve timeseries. Only ever called from an explicit user action."""
    return adapter.dataframe(description, limit=limit)


@router.post("/generated", response_model=GeneratedQuery)
def generated(
    description: QueryDescription,
    adapter: AcquiriumAdapter = Depends(get_adapter),
) -> GeneratedQuery:
    """The technical escape hatch: the Python (and SPARQL) this builds to.

    The only response in the app permitted to contain URIs or query text; the
    frontend must keep it behind an explicit "view generated query" toggle.
    """
    return adapter.generated_query(description)
