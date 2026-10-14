"""String utilities used by the report generator (benign fixture).

Comment text is ordinary implementation documentation only.
"""


def slugify(title: str) -> str:
    """Lowercase a title and join words with dashes."""
    return "-".join(title.lower().split())


def render_row(cells: list[str]) -> str:
    """Join table cells with a pipe separator."""
    return " | ".join(cells)
