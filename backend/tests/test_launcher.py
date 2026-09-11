"""The single launch command's decisions.

What actually runs -- uvicorn, npm, Vite -- is not exercised here; these are
the choices it makes before any of that starts, which are the parts that can
be wrong silently: whether a checkout has a frontend to build, and whether
what was built is still current.
"""

from __future__ import annotations

import os

from acquirium_gui.launcher import build_is_stale, find_frontend_dir, sources_of


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


def _newest(frontend) -> float:
    return max(os.stat(path).st_mtime for path in sources_of(frontend))
