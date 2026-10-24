"""Test bootstrap: import the plugin directory as the package ``homeassistant_plugin``.

The Hermes plugin loader imports a directory plugin as a package (``hermes_plugins.<slug>``) so the
relative imports in ``__init__.py`` resolve; tests mirror that under a stable alias. Hermes core
(``gateway``, ``agent``, ...) must be importable — run with a hermes-agent checkout on ``PYTHONPATH``.

The adapter resolves ``Platform("homeassistant")``. Once core no longer ships a ``HOMEASSISTANT``
enum member, that only resolves for a platform the registry knows, so register the plugin's real
``PlatformEntry`` up front exactly as the loader would.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

PACKAGE = "homeassistant_plugin"
_ROOT = Path(__file__).resolve().parents[1]

# ``python -m pytest`` from the repo root puts the root on sys.path, where this plugin's ``tools.py``
# would shadow core's ``tools`` package when core is imported below.
sys.path[:] = [p for p in sys.path if Path(p or ".").resolve() != _ROOT]


def _load_plugin_package():
    if PACKAGE in sys.modules:
        return sys.modules[PACKAGE]
    spec = importlib.util.spec_from_file_location(
        PACKAGE, _ROOT / "__init__.py", submodule_search_locations=[str(_ROOT)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[PACKAGE] = module
    spec.loader.exec_module(module)
    return module


def _ensure_platform_registered(plugin) -> None:
    from gateway.platform_registry import PlatformEntry, platform_registry

    if platform_registry.is_registered(plugin.PLATFORM_NAME):
        return
    platform_registry.register(PlatformEntry(source="plugin", **plugin._platform_kwargs()))


_ensure_platform_registered(_load_plugin_package())


class _RepoRootIsNotATestPackage:
    """The repo root *is* the plugin package (it has an ``__init__.py`` with relative imports), so
    pytest would collect it as a test ``Package`` and import that ``__init__.py`` standalone during
    setup, where the relative imports cannot resolve. Collect the root as a plain directory instead.

    Registered as a global plugin (not a conftest hook) because the root directory's collector is
    created through its *parent's* hook proxy, which never sees a conftest inside the root."""

    @pytest.hookimpl(tryfirst=True)
    def pytest_collect_directory(self, path, parent):
        if Path(path).resolve() == _ROOT:
            return pytest.Dir.from_parent(parent, path=path)
        return None


def pytest_configure(config):
    if not config.pluginmanager.has_plugin("homeassistant-repo-root"):
        config.pluginmanager.register(_RepoRootIsNotATestPackage(), "homeassistant-repo-root")
