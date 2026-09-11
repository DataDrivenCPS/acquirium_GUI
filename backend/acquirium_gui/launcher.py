"""Everything ``acquirium-gui`` does before uvicorn starts.

The brief asks for **one command, one URL**. That is easy once the frontend
has been built into :mod:`acquirium_gui`'s ``static`` directory -- but in a
checkout it is the building that people forget, and a stale bundle is worse
than no bundle: the app runs, looks right, and serves last week's UI.

So the launcher checks. In a checkout it notices that a source file is newer
than the build and runs ``npm run build`` itself; in an installed wheel there
are no sources to compare against and it serves what shipped. Either way the
user types one thing.

The helpers here are pure decisions about the filesystem, kept apart from the
processes they cause so they can be tested without starting anything.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterator

# Frontend files worth rebuilding for. Everything else in that directory is
# either build output or dependencies.
SOURCE_DIRS = ("src", "public")
SOURCE_FILES = ("index.html", "package.json", "package-lock.json", "vite.config.ts")

# Never walked: it holds tens of thousands of files and none of them are ours.
IGNORED_DIRS = {"node_modules", "dist", ".vite"}


def find_frontend_dir(package_dir: Path) -> Path | None:
    """The frontend sources, if this is a checkout rather than an install.

    ``backend/acquirium_gui`` sits beside ``frontend`` in the repository and
    nowhere near it in site-packages, which is exactly the distinction that
    decides whether building is even possible.
    """
    candidate = package_dir.parent.parent / "frontend"
    return candidate if (candidate / "package.json").is_file() else None


def sources_of(frontend_dir: Path) -> Iterator[Path]:
    """Every file a rebuild would care about."""
    for name in SOURCE_FILES:
        path = frontend_dir / name
        if path.is_file():
            yield path

    for name in SOURCE_DIRS:
        root = frontend_dir / name
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
            for filename in filenames:
                yield Path(dirpath) / filename


def build_is_stale(static_dir: Path, frontend_dir: Path | None) -> bool:
    """Whether the built UI is missing or older than the sources it came from.

    With no sources to compare against -- an installed wheel -- the answer is
    always no: what shipped is what runs.
    """
    index = static_dir / "index.html"
    if not index.is_file():
        # Nothing built. Stale only if there is something to build from;
        # otherwise the caller has a different problem to report.
        return frontend_dir is not None

    if frontend_dir is None:
        return False

    built_at = index.stat().st_mtime
    return any(source.stat().st_mtime > built_at for source in sources_of(frontend_dir))


def npm_executable() -> str | None:
    """npm's path, or None if it is not installed.

    ``shutil.which`` resolves ``npm.cmd`` on Windows, which is what has to be
    executed there -- ``npm`` alone is not a runnable file.
    """
    return shutil.which("npm")


def build_frontend(frontend_dir: Path, *, npm: str) -> None:
    """Install dependencies if they are missing, then build.

    Output is inherited rather than captured: a build takes a few seconds and
    watching it happen is the difference between "it is working" and "it has
    hung".
    """
    if not (frontend_dir / "node_modules").is_dir():
        print("Installing frontend dependencies (first run only)…", flush=True)
        subprocess.run([npm, "install"], cwd=frontend_dir, check=True)

    print("Building the user interface…", flush=True)
    subprocess.run([npm, "run", "build"], cwd=frontend_dir, check=True)


def ensure_frontend(static_dir: Path, frontend_dir: Path | None, *, allow_build: bool) -> None:
    """Make sure there is a UI to serve, building it if that is possible.

    Deliberately never fatal on its own. A missing bundle is reported by the
    caller once it knows which port it is serving on, and a stale one still
    runs -- refusing to start because npm is absent would be the wrong trade
    for someone who just wants to look at the app.
    """
    if not build_is_stale(static_dir, frontend_dir) or frontend_dir is None:
        return

    if not allow_build:
        print("Skipping the frontend build (--no-build).", file=sys.stderr)
        return

    npm = npm_executable()
    if npm is None:
        print(
            "The user interface needs building but npm was not found. "
            "Install Node.js, or run `npm run build` in frontend/ elsewhere.",
            file=sys.stderr,
        )
        return

    build_frontend(frontend_dir, npm=npm)
