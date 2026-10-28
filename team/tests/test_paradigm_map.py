"""三范式归属守门（2026-10-28 K11 落库）。

口径：整合正本 §4.3 的三范式（基座/领域/治理），映射表在 team/shared/paradigm-map.yaml。
本测锁三件事：① 取值合法；② 与 team/profiles 目录一一对应（无遗漏、无幽灵、无重复）；
③ 分档计数与报告 §八 一致（治理 8 / 基座 5 / 领域 17）——改判须同时改映射表与本处计数。
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PROFILES = ROOT / "profiles"
MAP = ROOT / "shared" / "paradigm-map.yaml"
VALID = {"base", "domain", "governance"}


def _mapping() -> dict[str, str]:
    doc = yaml.safe_load(MAP.read_text(encoding="utf-8"))
    assert isinstance(doc, dict) and isinstance(doc.get("mapping"), dict), "paradigm-map.yaml 缺 mapping 段"
    return {str(k): str(v) for k, v in doc["mapping"].items()}


def _profile_dirs() -> set[str]:
    return {
        p.name
        for p in PROFILES.iterdir()
        if p.is_dir() and p.name != "_shared" and not p.name.startswith(".")
    }


def test_values_are_valid() -> None:
    for name, paradigm in _mapping().items():
        assert paradigm in VALID, f"{name} 的范式取值非法：{paradigm}（合法值 {sorted(VALID)}）"


def test_covers_every_profile_exactly_once() -> None:
    mapping = _mapping()
    dirs = _profile_dirs()
    assert sorted(set(mapping) - dirs) == [], f"映射表有幽灵 profile：{sorted(set(mapping) - dirs)}"
    assert sorted(dirs - set(mapping)) == [], f"映射表漏 profile：{sorted(dirs - set(mapping))}"
    # dict 天然无重键；再对原始文本查重复键（YAML 静默取后者，容易掩盖误加）
    raw = MAP.read_text(encoding="utf-8").splitlines()
    keys = [line.split(":", 1)[0].strip() for line in raw if line.startswith("  ") and ":" in line and not line.strip().startswith("#")]
    dup = [k for k, c in Counter(keys).items() if c > 1]
    assert dup == [], f"映射表存在重复键：{dup}"


def test_paradigm_counts_match_report() -> None:
    counts = Counter(_mapping().values())
    assert counts == Counter({"domain": 17, "governance": 8, "base": 5}), (
        f"范式计数与报告 §八 不一致：{dict(counts)}；改判请同批更新映射表与本断言"
    )


def test_governance_set_is_explicit() -> None:
    """治理面必须是显式名单，新增治理岗要在这里可见（防悄悄升格）。"""
    gov = sorted(name for name, p in _mapping().items() if p == "governance")
    assert gov == [
        "aiteam-orchestrator",
        "data-orchestrator",
        "hack-auditor",
        "ops-eval",
        "orchestrator",
        "pay-orchestrator",
        "platform-ontology-curator",
        "platform-skill-miner",
    ], f"治理面发生变化：{gov}"
