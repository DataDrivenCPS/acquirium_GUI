"""Free-text matching for the query builder: pick one node for typed text, or explain why we can't."""
import re
from typing import Annotated, Any, Literal, Optional
from pydantic import BaseModel, StringConstraints

# TODO: make these two user settings in the UI (a dialog on a failed match) instead of constants.
# A text must score at least this to count as matched (Acquirium's own default for query text is 0.4)
RESOLVE_MIN_SCORE = 0.4
# A match whose runner-up scores within this much of it is ambiguous, so the user should choose
RESOLVE_MARGIN = 0.1
# Candidates asked for, and shown to the user when a match fails
CANDIDATE_COUNT = 5

Kind = Literal["class", "process", "substance", "quantity_kind", "unit", "any"]

# Plain-words names for the ontologies a node can come from, keyed by the start of its identifier
SOURCE_NAMES = {
    "http://data.ashrae.org/standard223#": "ASHRAE 223",
    "urn:nawi-water-ontology#": "Water ontology",
    "http://qudt.org/": "QUDT",
}

def _label(uri: str, label: Optional[str]) -> str:
    """The node's label, or the readable end of its identifier when it has none."""
    return label or re.split(r"[#/:]", uri)[-1]

def _source(uri: str) -> Optional[str]:
    return next((name for start, name in SOURCE_NAMES.items() if uri.startswith(start)), None)

class ResolveRequest(BaseModel):
    """Body of POST /query/resolve: text to match, and what kind of thing it should name."""
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    kind: Kind = "class"

class ResolutionError(ValueError):
    """Text that did not match one node confidently; `candidates` are the closest nodes, best first."""
    def __init__(self, message: str, candidates: list[dict], text: Optional[str] = None, field: Optional[str] = None):
        super().__init__(message)
        self.candidates = candidates
        self.text = text  # the text that failed, so a UI can tell which field to fix
        self.field = field  # where the text came from: "class", or the attribute of a filter

def _candidates(matches: list[dict]) -> list[dict]:
    """Ranked {"uri", "label", "score", "source"} dicts, one per node (a node matched through several names keeps its best score)."""
    best: dict[str, dict] = {}
    for found in matches:
        if found["uri"] not in best or found["score"] > best[found["uri"]]["score"]:
            best[found["uri"]] = {"uri": found["uri"], "label": _label(found["uri"], found.get("label")),
                                  "score": found["score"], "source": _source(found["uri"])}
    return sorted(best.values(), key=lambda c: c["score"], reverse=True)

def resolve_text(acq: Any, text: str, kind: Optional[str] = "class", field: Optional[str] = None) -> dict:
    """The one node `text` names, as {"uri", "label", "score", "source"}.

    Raises ResolutionError, carrying the closest candidates, when nothing scores at least
    RESOLVE_MIN_SCORE or when the runner-up is within RESOLVE_MARGIN of the best. Acquirium is asked
    with no score floor so near misses are available to show. `field` is passed on to the error.
    """
    candidates = _candidates(acq.client.resolve(text, kind, top_k=CANDIDATE_COUNT, min_score=0.0))
    if not candidates:
        raise ResolutionError(f"No match for {text!r}", [], text, field)
    best = candidates[0]
    if best["score"] < RESOLVE_MIN_SCORE:
        raise ResolutionError(f"No confident match for {text!r} (best score {best['score']:.2f}, needs {RESOLVE_MIN_SCORE:.2f})", candidates, text, field)
    if len(candidates) > 1 and best["score"] - candidates[1]["score"] < RESOLVE_MARGIN:
        raise ResolutionError(f"Several close matches for {text!r}; choose one", candidates, text, field)
    return best
