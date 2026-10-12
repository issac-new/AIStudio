"""LCM context-engine plugin.

Exports ``LCMEngine`` (the ``ContextEngine`` subclass host discovery looks for).
Select via config: ``context: {engine: "lcm"}`` — plugins are never auto-activated.
"""

from .dag import DAGState, KnowledgeNode
from .digest import extract_nodes
from .engine import LCMEngine
from .validators import validate_message_list

__all__ = ["LCMEngine", "DAGState", "KnowledgeNode", "extract_nodes", "validate_message_list"]
