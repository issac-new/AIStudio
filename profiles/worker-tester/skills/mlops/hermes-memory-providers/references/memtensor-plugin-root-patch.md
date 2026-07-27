# memtensor _plugin_root() Patch

## Problem

When the memtensor adapter is installed as a separate directory (not inside
`memos-local-plugin/`), the `_plugin_root()` function in `daemon_manager.py`
returns an incorrect path. The function assumes it lives inside the
memos-local-plugin directory tree and traverses 4 parent directories to find it,
but when installed in a separate `memtensor/` directory, this traversal lands
in a completely wrong location.

## Symptom

- `_bridge_script()` returns a path like `~/.hermes/profiles/bridge.cts`
  instead of the correct `.../memos-local-plugin/dist/bridge.cjs`
- `ensure_bridge_running(probe_only=True)` returns `False`

## Full Replacement Code

Edit `~/.hermes/plugins/memtensor/daemon_manager.py` (or
`~/.hermes/profiles/<profile>/plugins/memtensor/daemon_manager.py`).

**Replace:**

```python
def _plugin_root() -> Path:
    plugin_root = Path(__file__).resolve().parent.parent.parent.parent
    if plugin_root.name == "dist":
        return plugin_root.parent
    return plugin_root
```

**With:**

```python
def _plugin_root() -> Path:
    """Find the memos-local-plugin root directory.
    
    The memtensor adapter is typically installed alongside or inside
    the memos-local-plugin directory. We search for it in several locations.
    """
    current = Path(__file__).resolve().parent
    
    for parent in [current.parent, current.parent.parent, current.parent.parent.parent]:
        if parent.exists():
            for sibling in parent.iterdir():
                if sibling.is_dir() and sibling.name == "memos-local-plugin":
                    return sibling
            if parent.name == "memos-local-plugin":
                return parent
    
    for home in [Path.home() / ".hermes", Path.home() / ".hermes/profiles/orchestrator"]:
        plugin_dir = home / "plugins" / "memos-local-plugin"
        if plugin_dir.exists():
            return plugin_dir
    
    plugin_root = Path(__file__).resolve().parent.parent.parent.parent
    if plugin_root.name == "dist":
        return plugin_root.parent
    return plugin_root
```

## Verification

```python
from daemon_manager import _plugin_root, _bridge_script
print("Root:", _plugin_root())
print("Bridge:", _bridge_script())
print("Exists:", _bridge_script().exists())
# Expected:
#   Root: .../memos-local-plugin
#   Bridge: .../memos-local-plugin/dist/bridge.cjs
#   Exists: True
```
