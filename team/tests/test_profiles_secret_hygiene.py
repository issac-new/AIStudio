"""Profile 配置的密钥卫生与环境变量展开契约。"""
from __future__ import annotations

from io import StringIO
from pathlib import Path
import re

from dotenv import dotenv_values
import yaml

REPO = Path(__file__).resolve().parents[2]
PROFILES = REPO / "team" / "shared" / "profiles.yaml"
EXAMPLE = REPO / "team" / "shared" / ".env.common.example"
SENSITIVE = re.compile(r"password|api_key|token|secret", re.I)
PLACEHOLDER = re.compile(r"^\$\{[A-Z][A-Z0-9_]*\}$")


def _raw_secrets(node, path=""):
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            child = f"{path}.{key}" if path else str(key)
            if SENSITIVE.search(str(key)) and isinstance(value, str) and value.strip():
                if not PLACEHOLDER.fullmatch(value.strip()):
                    found.append(child)
            found.extend(_raw_secrets(value, child))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            found.extend(_raw_secrets(value, f"{path}[{index}]"))
    return found


def test_profiles_have_no_literal_credentials():
    # Regression: ISSUE-010 — team/shared 脱敏正本不得包含可直接使用的密钥
    data = yaml.safe_load(PROFILES.read_text(encoding="utf-8"))
    assert _raw_secrets(data) == []


def test_profile_references_are_registered_and_expand_independently(monkeypatch):
    text = PROFILES.read_text(encoding="utf-8")
    data = yaml.safe_load(text)
    refs = set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)\}", text))
    example_names = {
        line.split("=", 1)[0].strip()
        for line in EXAMPLE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#") and "=" in line
    }
    assert refs <= example_names

    orchestrator = data["profiles"]["orchestrator"]["env_extra"]
    k12 = data["profiles"]["k12edu-orchestrator"]["env_extra"]
    assert orchestrator["WEIXIN_TOKEN"] != k12["WEIXIN_TOKEN"]
    assert "MATRIX_PASSWORD" not in orchestrator

    monkeypatch.setenv("ORCHESTRATOR_WEIXIN_TOKEN", "synthetic-orchestrator")
    rendered = f"WEIXIN_TOKEN={orchestrator['WEIXIN_TOKEN']}\n"
    assert dotenv_values(stream=StringIO(rendered))["WEIXIN_TOKEN"] == "synthetic-orchestrator"
