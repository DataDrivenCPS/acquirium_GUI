"""Launch the app: ``acquirium-gui`` (or ``python -m acquirium_gui``).

**One command, one terminal, one URL** -- the third of the client's
non-negotiable constraints. Running it with no arguments builds the user
interface if it needs building and then serves the whole app, API and UI
together, from a single process at <http://127.0.0.1:5001>.

    acquirium-gui                 # the app
    acquirium-gui --dev           # the same, with hot reload while editing
    acquirium-gui --adapter live  # against a real Acquirium server

``--dev`` is the exception that still runs two processes -- Vite for hot
module reload, this API behind it -- but it starts and stops both from this
one terminal, and the browser still only ever sees one URL, because Vite
proxies ``/api`` here. The port split exists for that: Vite owns 5001 and the
API moves to 5002 so the two do not collide.

Both modes bind loopback. This iteration is single-user with no auth, so
binding anything else would expose an unauthenticated service; ``--host``
exists for deliberate exceptions, not as a default.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import uvicorn

from acquirium_gui.app import STATIC_DIR
from acquirium_gui.launcher import (
    ensure_frontend,
    find_frontend_dir,
    npm_executable,
    port_in_use,
)

PACKAGE_DIR = Path(__file__).parent

# The one URL, in the ordinary case.
DEFAULT_PORT = 5001
# Where the API moves in --dev, so Vite can have the port the user opens.
DEV_API_PORT = 5002


def main() -> None:
    args = _parse_args()

    if args.adapter:
        os.environ["ACQUIRIUM_GUI_ADAPTER"] = args.adapter

    frontend_dir = find_frontend_dir(PACKAGE_DIR)

    if args.dev:
        _run_dev(args, frontend_dir)
        return

    _refuse_if_taken(args.host, args.port, what="Acquirium")

    ensure_frontend(STATIC_DIR, frontend_dir, allow_build=not args.no_build)

    if not (STATIC_DIR / "index.html").is_file():
        print(
            "No user interface was found to serve, and it could not be built. "
            "The API alone is available at "
            f"http://{args.host}:{args.port}/api/health",
            file=sys.stderr,
        )
    else:
        print(f"\n  Acquirium is at http://{args.host}:{args.port}\n", flush=True)

    uvicorn.run(
        "acquirium_gui.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


def _refuse_if_taken(host: str, port: int, *, what: str) -> None:
    """Stop before announcing a URL this process will not be serving.

    Left to uvicorn, a port clash prints the URL, then several lines of
    startup, then the bind error -- and if the thing holding the port is an
    older copy of this app, the browser at that URL still works. The result
    is a screenful of errors above an app that looks fine, and no way to tell
    which instance is answering. Better to say so in one line and stop.
    """
    if not port_in_use(host, port):
        return

    print(
        f"\nPort {port} is already in use, so {what} cannot start there. "
        "That is usually this app still running from an earlier launch: whatever "
        f"answers http://{host}:{port} right now is that instance, not this one.\n"
        "Stop it, or start on another port with --port.\n",
        file=sys.stderr,
    )
    raise SystemExit(1)


def _run_dev(args: argparse.Namespace, frontend_dir: Path | None) -> None:
    """Vite and the API together, from this terminal.

    Vite is a child process and this one runs uvicorn, so Ctrl+C stops the
    server and the ``finally`` takes the dev server down with it -- no
    orphaned node process left holding port 5001 for the next run.
    """
    if frontend_dir is None:
        print(
            "--dev needs the frontend sources, which are only in a checkout. "
            "Run without --dev to serve the interface that was installed.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    npm = npm_executable()
    if npm is None:
        print("--dev needs npm on PATH. Install Node.js, or run without --dev.", file=sys.stderr)
        raise SystemExit(2)

    if not (frontend_dir / "node_modules").is_dir():
        print("Installing frontend dependencies (first run only)...", flush=True)
        subprocess.run([npm, "install"], cwd=frontend_dir, check=True)

    api_port = args.port if args.port != DEFAULT_PORT else DEV_API_PORT
    # Vite's own port is caught below, by its exiting immediately; the API's
    # would otherwise only surface after Vite is already up and the URL has
    # been printed.
    _refuse_if_taken(args.host, api_port, what="the API")

    vite = subprocess.Popen([npm, "run", "dev"], cwd=frontend_dir)

    # If Vite cannot take its port -- usually a dev server left running from
    # last time -- it exits at once. Announcing a URL that serves nothing and
    # then sitting there would be the worst thing this command could do, so
    # it stops instead.
    try:
        vite.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass
    else:
        print(
            f"\nThe dev server stopped immediately. Is something already using port "
            f"{DEFAULT_PORT}?\n",
            file=sys.stderr,
        )
        raise SystemExit(1)

    print(f"\n  Acquirium is at http://localhost:{DEFAULT_PORT} (hot reload)\n", flush=True)

    try:
        uvicorn.run(
            "acquirium_gui.app:app",
            host=args.host,
            port=api_port,
            # Not forced on. uvicorn's reloader runs the server in a child
            # process, and a child outlives a parent that is killed rather
            # than interrupted -- an invisible old server still holding the
            # port and answering with last hour's code. Vite already gives
            # the frontend hot reload; ask for --reload as well if you are
            # editing the backend too.
            reload=args.reload,
        )
    finally:
        vite.terminate()
        try:
            vite.wait(timeout=5)
        except subprocess.TimeoutExpired:
            vite.kill()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="acquirium-gui",
        description="Serve the Acquirium query interface: one command, one URL.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"The URL to open (default {DEFAULT_PORT}). With --dev this is Vite's, "
        f"and the API moves to {DEV_API_PORT}.",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Run the Vite dev server alongside, for hot reload while editing the UI.",
    )
    parser.add_argument(
        "--no-build",
        action="store_true",
        help="Serve whatever is already built, even if the sources are newer.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Restart the API on backend source changes. Combines with --dev.",
    )
    parser.add_argument(
        "--adapter",
        choices=("stub", "live"),
        help="Override ACQUIRIUM_GUI_ADAPTER. 'stub' serves sample plant data.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    main()
