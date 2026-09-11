"""The single launch command's decisions.

What actually runs -- uvicorn, npm, Vite -- is not exercised here; these are
the choices it makes before any of that starts, which are the parts that can
be wrong silently: whether a checkout has a frontend to build, whether what
was built is still current, and whether the one URL is actually free to
serve on.
"""

from __future__ import annotations

import os
import socket
from pathlib import Path

import pytest

from acquirium_gui import __main__, launcher
from acquirium_gui.launcher import (
    build_is_stale,
    find_frontend_dir,
    port_in_use,
    sources_of,
)


def make_frontend(root) -> None:
    """A checkout's frontend, cut down to what the launcher looks at."""
    frontend = root / "frontend"
    (frontend / "src" / "panels").mkdir(parents=True)
    (frontend / "src" / "main.tsx").write_text("main")
    (frontend / "src" / "panels" / "GraphPanel.tsx").write_text("graph")
    (frontend / "index.html").write_text("<!doctype html>")
    (frontend / "package.json").write_text("{}")
    # Never walked: it is enormous and none of it is our source.
    (frontend / "node_modules" / "react").mkdir(parents=True)
    (frontend / "node_modules" / "react" / "index.js").write_text("x")


def build_output(root, *, at: float) -> None:
    static = root / "backend" / "acquirium_gui" / "static"
    static.mkdir(parents=True, exist_ok=True)
    index = static / "index.html"
    index.write_text("<!doctype html>")
    os.utime(index, (at, at))


class TestFindingTheFrontend:
    def test_finds_the_frontend_beside_the_backend_in_a_checkout(self, tmp_path):
        make_frontend(tmp_path)
        package = tmp_path / "backend" / "acquirium_gui"
        package.mkdir(parents=True)

        assert find_frontend_dir(package) == tmp_path / "frontend"

    def test_finds_nothing_in_an_installed_package(self, tmp_path):
        """A wheel ships the built UI and no sources; there is nothing to build."""
        package = tmp_path / "site-packages" / "acquirium_gui"
        package.mkdir(parents=True)

        assert find_frontend_dir(package) is None


class TestFreshness:
    def test_a_missing_build_is_stale(self, tmp_path):
        make_frontend(tmp_path)
        static = tmp_path / "backend" / "acquirium_gui" / "static"

        assert build_is_stale(static, tmp_path / "frontend") is True

    def test_a_build_newer_than_every_source_is_current(self, tmp_path):
        make_frontend(tmp_path)
        build_output(tmp_path, at=_newest(tmp_path / "frontend") + 10)

        static = tmp_path / "backend" / "acquirium_gui" / "static"
        assert build_is_stale(static, tmp_path / "frontend") is False

    def test_an_edited_source_makes_the_build_stale(self, tmp_path):
        make_frontend(tmp_path)
        build_output(tmp_path, at=_newest(tmp_path / "frontend") + 10)

        edited = tmp_path / "frontend" / "src" / "panels" / "GraphPanel.tsx"
        edited.write_text("changed")
        later = os.stat(tmp_path / "backend" / "acquirium_gui" / "static" / "index.html").st_mtime + 5
        os.utime(edited, (later, later))

        static = tmp_path / "backend" / "acquirium_gui" / "static"
        assert build_is_stale(static, tmp_path / "frontend") is True

    def test_nothing_to_compare_against_is_never_stale(self, tmp_path):
        """An installed package: whatever shipped in the wheel is what runs."""
        build_output(tmp_path, at=1_000_000)
        static = tmp_path / "backend" / "acquirium_gui" / "static"

        assert build_is_stale(static, None) is False


class TestSources:
    def test_ignores_node_modules(self, tmp_path):
        frontend = tmp_path / "frontend"
        make_frontend(tmp_path)
        found = {path.name for path in sources_of(frontend)}

        assert "main.tsx" in found
        assert "GraphPanel.tsx" in found
        # Compared relative to the frontend, because tmp_path itself is named
        # after this test and so contains the string being looked for.
        relative = {path.relative_to(frontend).parts[0] for path in sources_of(frontend)}
        assert "node_modules" not in relative


class TestTheUrlIsFree:
    """Whether anything is already answering on the port we are about to claim.

    This is the check that keeps "one command, one URL" honest. Without it a
    second launch prints the URL, fails to bind, and leaves the *previous*
    instance answering it -- a wall of errors over an app that looks like it
    is working, which is the most confusing outcome available.
    """

    def test_an_unused_port_is_free(self):
        # Ask the OS for a port, then let go of it: whatever it hands out is
        # one nothing else on this machine is using.
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]

        assert port_in_use("127.0.0.1", port) is False

    def test_a_port_something_is_listening_on_is_taken(self):
        with socket.socket() as held:
            held.bind(("127.0.0.1", 0))
            held.listen()
            port = held.getsockname()[1]

            assert port_in_use("127.0.0.1", port) is True

    def test_the_check_does_not_itself_hold_the_port(self):
        """Twice in a row must agree, or the probe is the thing in the way."""
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]

        assert port_in_use("127.0.0.1", port) is False
        assert port_in_use("127.0.0.1", port) is False


class TestItCanSayWhatItIsDoing:
    """The launch messages must survive the console they are printed to.

    Python encodes ``print`` output with the console's codepage, and a
    Windows console is not reliably cp1252: cp437 and cp850 are still the
    default in plenty of locales, and neither has an ellipsis or an em dash.
    A message containing one does not degrade there -- ``print`` raises
    ``UnicodeEncodeError`` and takes the launcher down with it, on the first
    run, while installing dependencies. Cross-platform is one of the brief's
    non-negotiables, so these two modules stay ASCII.
    """

    @pytest.mark.parametrize("module", [launcher, __main__])
    def test_launch_messages_are_ascii(self, module):
        source = Path(module.__file__).read_text(encoding="utf-8")
        offenders = sorted({character for character in source if ord(character) > 127})

        assert offenders == [], (
            f"{Path(module.__file__).name} contains {offenders}, which cannot be "
            "printed to a cp437 or cp850 console"
        )

    def test_a_taken_port_stops_the_launch_and_says_why(self, capsys):
        with socket.socket() as held:
            held.bind(("127.0.0.1", 0))
            held.listen()
            port = held.getsockname()[1]

            with pytest.raises(SystemExit) as stopped:
                __main__._refuse_if_taken("127.0.0.1", port, what="Acquirium")

        assert stopped.value.code == 1
        message = capsys.readouterr().err
        assert str(port) in message
        # The point of the message: which instance the browser is talking to.
        assert "already in use" in message

        for codepage in ("cp1252", "cp437", "cp850"):
            # Encodes without raising, which is the whole requirement.
            message.encode(codepage)


def _newest(frontend) -> float:
    return max(os.stat(path).st_mtime for path in sources_of(frontend))
