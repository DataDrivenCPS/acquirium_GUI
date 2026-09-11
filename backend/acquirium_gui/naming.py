"""What the result columns are called.

The query carries aliases -- ``e1``, ``r1``, ``m1`` -- because Acquirium's
``Query`` needs them to bind one step to another. They are bookkeeping, and
the client brief says the default UI shows the user nothing of that kind. The
builder has no aliases left in it; this is what keeps them out of the results
table too.

Shared by every adapter on purpose: the frontend renders whichever columns it
is handed and never interprets them, so the naming has to be identical
whether the rows came from the fixtures or from a live plant.
"""

from __future__ import annotations

from .models import QueryStep

# Steps that bind something, and so put columns in the table. where/refocus
# constrain or move the pointer; they have nothing of their own to show.
_BINDING_KINDS = ("entity", "related", "measurement")


def metadata_columns(steps: list[QueryStep]) -> list[str]:
    """Header names for :meth:`AcquiriumAdapter.metadata`, in step order.

    Two columns per piece of equipment (what matched, and its type) and three
    per measurement (the point, what it measures, its unit) -- the same
    grouping the adapters fill in, so the two stay in step.
    """
    columns: list[str] = []
    used: set[str] = set()

    for step in steps:
        if step.kind not in _BINDING_KINDS:
            continue

        name = _unique(_base_name(step), used)
        if step.kind == "measurement":
            columns += [name, _unique("Measures", used), _unique("Unit", used)]
        else:
            columns += [name, f"{name} type"]

    return columns


def _base_name(step: QueryStep) -> str:
    """What the user called this step, falling back to what kind it is."""
    if step.kind == "measurement":
        return "Measurement"
    if step.instance is not None:
        return step.instance.label
    if step.cls is not None:
        return step.cls.label
    # Nothing chosen yet -- the step still matches everything, and still
    # needs a column an operator can read.
    return "Equipment"


def _unique(name: str, used: set[str]) -> str:
    """Number a repeat rather than emitting the same header twice.

    Asking for two pumps is a reasonable query; two columns both called
    "Pump" is not a readable answer to it.
    """
    if name not in used:
        used.add(name)
        return name

    n = 2
    while f"{name} {n}" in used:
        n += 1
    numbered = f"{name} {n}"
    used.add(numbered)
    return numbered
