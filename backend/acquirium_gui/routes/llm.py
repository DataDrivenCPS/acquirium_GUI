"""Natural-language query building. Placeholder -- no functionality yet.

A stated bonus goal, explicitly out of scope for this iteration (design.md,
requirements.md). The route exists so the shape of the eventual feature is
fixed now and the frontend panel has something real to call:

    plain English in  ->  a QueryDescription out  ->  replayed through the
    same builder the buttons drive.

That is the whole design constraint. The LLM must emit the same step list the
query builder produces, so everything downstream -- metadata preview, graph
highlighting, execute, the generated-query view -- keeps working untouched
and the user can edit an LLM-produced query by hand afterwards. It must not
get its own query path, and it must not emit SPARQL.

Nothing here calls a model, and nothing decides which model to call; that is
a later decision, along with whether an offline-capable local model is
required by the "fully offline" constraint.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/llm", tags=["llm"])


class TranslateRequest(BaseModel):
    text: str


class TranslateResponse(BaseModel):
    """The intended response shape once this is implemented."""

    # A QueryDescription-shaped payload, replayed through the normal builder.
    description: dict
    # Plain-language account of what was built, so the user can check it.
    explanation: str


@router.get("/status")
def llm_status() -> dict:
    """Whether natural-language querying is available. Always false for now."""
    return {
        "available": False,
        "detail": (
            "Natural-language query building is not implemented. It is a bonus "
            "goal for a later iteration."
        ),
    }


@router.post("/translate", response_model=TranslateResponse)
def translate(request: TranslateRequest) -> TranslateResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Natural-language query building is not implemented yet.",
    )
