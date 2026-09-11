"""Free text to a real thing in the graph.

The confidence policy lives here rather than in the adapter, so the rule is
identical whether candidates come from fixtures or from Acquirium's embedding
resolver. That rule, from design.md:

    accept silently only when the best candidate clears the configured
    threshold *and* no runner-up is close behind; otherwise return the
    candidates and let the user pick.

This matters more than it looks. Acquirium's resolver returns its closest
match above ``min_score``, so a typo produces a confidently wrong answer
rather than an error -- the picker is the only thing between a bad input and
a bad query.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from acquirium_gui.adapters import AcquiriumAdapter
from acquirium_gui.deps import get_adapter, get_config
from acquirium_gui.models import (
    AppConfig,
    AttributeName,
    Ref,
    ResolveRequest,
    ResolveResponse,
)

router = APIRouter(tags=["resolve"])


@router.post("/resolve", response_model=ResolveResponse)
def resolve(
    request: ResolveRequest,
    adapter: AcquiriumAdapter = Depends(get_adapter),
    config: AppConfig = Depends(get_config),
) -> ResolveResponse:
    top_k = request.top_k or config.resolve_top_k
    candidates = adapter.resolve(request.text, request.kind, top_k)
    if not candidates:
        return ResolveResponse(candidates=[], confident=False)

    best = candidates[0]
    runner_up = candidates[1].score if len(candidates) > 1 else 0.0
    confident = (
        best.score >= config.confidence_threshold
        and (best.score - runner_up) > config.close_runner_up_margin
    )
    return ResolveResponse(candidates=candidates, confident=confident)


@router.get("/attributes/{attr}/values", response_model=list[Ref])
def attribute_values(
    attr: AttributeName,
    adapter: AcquiriumAdapter = Depends(get_adapter),
) -> list[Ref]:
    """Selectable values for a where() filter, as labels the user recognises."""
    return adapter.attribute_values(attr)
