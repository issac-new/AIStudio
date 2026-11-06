#!/usr/bin/env python3
"""737 统一 registry URI 解析器表驱动测试（照 tests/tools 邻测试：从仓根可直
接 import tools.*；纯函数零 IO，不需要网络/夹具）。"""

import pytest

from tools.skills_hub_uri import parse_skill_uri

# (raw, expected)：expected=None 即回落现状分发链
CASES = [
    # --- 全前缀×2 形态：每个前缀给「浅标识符」和「深标识符」两种形状 ---
    ("official/foo", ("official", "official/foo")),
    ("official/mlops/training/trl-fine-tuning", ("official", "official/mlops/training/trl-fine-tuning")),
    ("github/owner/repo", ("github", "github/owner/repo")),
    ("github/owner/repo/skills/my-skill", ("github", "github/owner/repo/skills/my-skill")),
    ("clawhub/blender-bpy", ("clawhub", "clawhub/blender-bpy")),
    ("clawhub/art/user/pkg", ("clawhub", "clawhub/art/user/pkg")),
    ("lobehub/thing_search", ("lobehub", "lobehub/thing_search")),
    ("lobehub/user/plugin-x", ("lobehub", "lobehub/user/plugin-x")),
    ("browse-sh/airbnb.com/search-listings", ("browse-sh", "browse-sh/airbnb.com/search-listings")),
    ("browse-sh/site.example/task-id", ("browse-sh", "browse-sh/site.example/task-id")),
    # skills.sh 双拼写（适配器 _ID_PREFIX_ALIASES 全表，含 typo 拼写）
    ("skills-sh/owner/skill", ("skills-sh", "skills-sh/owner/skill")),
    ("skills.sh/owner/skill", ("skills-sh", "skills.sh/owner/skill")),
    ("skils-sh/owner/skill", ("skills-sh", "skils-sh/owner/skill")),
    ("skils.sh/owner/skill", ("skills-sh", "skils.sh/owner/skill")),
    # well-known 包装形式（well-known:<base_url>/<skill>）
    ("well-known:https://example.com/my-skill", ("well-known", "well-known:https://example.com/my-skill")),
    ("well-known:https://example.com/a/b", ("well-known", "well-known:https://example.com/a/b")),
    # --- nacos 形状（预留后端推断位：本仓无 Nacos 实例，具名解析供显式报源不存在） ---
    ("nacos://market.hiclaw.io/ns/find-skill", ("nacos", "nacos://market.hiclaw.io/ns/find-skill")),
    ("nacos://cfg.internal/skills/x", ("nacos", "nacos://cfg.internal/skills/x")),
    # --- 裸 URL 正例（照 UrlSource._matches：http(s) 且 path 以 .md 结尾） ---
    ("https://example.com/skills/foo/SKILL.md", ("url", "https://example.com/skills/foo/SKILL.md")),
    ("http://example.com/path/skill.md", ("url", "http://example.com/path/skill.md")),
    # --- 裸 URL 反例：well-known 端点 / index.json / 非 .md / 非 http(s) ---
    ("https://example.com/.well-known/skills/foo/SKILL.md", None),   # well-known 适配器自管
    ("https://example.com/.well-known/skills/index.json", None),     # 索引页非技能页
    ("https://example.com/.well-known/skills/index.json#foo", None),
    ("https://example.com/skills/foo/index.json", None),
    ("https://example.com/skills/foo/", None),                       # 目录不带 .md
    ("https://example.com/skills/foo/SKILL", None),                  # 缺 .md 后缀
    ("ftp://example.com/skills/foo/SKILL.md", None),                 # 非 http(s) 协议
    # --- 大小写：前缀匹配不敏感（照 _registry_from_identifier 的 lowered 匹配），
    #     identifier 原样保留 ---
    ("OFFICIAL/Foo", ("official", "OFFICIAL/Foo")),
    ("GitHub/owner/repo", ("github", "GitHub/owner/repo")),
    ("Skills.sh/owner/skill", ("skills-sh", "Skills.sh/owner/skill")),
    ("Well-Known:https://example.com/x", ("well-known", "Well-Known:https://example.com/x")),
    ("NACOS://host/skill", ("nacos", "NACOS://host/skill")),
    ("HTTPS://EXAMPLE.COM/SKILL.MD", ("url", "HTTPS://EXAMPLE.COM/SKILL.MD")),
    # --- None 回落：无前缀短名 / 裸 owner-repo 路径 / 空值 / 非字符串 ---
    ("my-skill", None),                    # 短名走现状短名解析链
    ("owner/repo", None),                  # 裸 GitHub 形状不带 github/ 前缀（现状：Bare owner/repo stays unresolved）
    ("", None),
    ("well-known", None),                  # 裸前缀词本身不是 URI（缺冒号后的 base）
    ("official", None),                    # 同上：official 不带 / 不是前缀命中
]


@pytest.mark.parametrize("raw,expected", CASES)
def test_parse_skill_uri_table(raw, expected):
    assert parse_skill_uri(raw) == expected


@pytest.mark.parametrize("bad", [None, 123, b"https://x/SKILL.md", ["official/x"]])
def test_parse_skill_uri_non_string_returns_none(bad):
    assert parse_skill_uri(bad) is None


def test_parse_skill_uri_does_not_strip_or_rewrite():
    """identifier 原样返回：不去空白、不改大小写——认领与否归适配器 _matches。"""
    assert parse_skill_uri("official/Foo Bar") == ("official", "official/Foo Bar")
