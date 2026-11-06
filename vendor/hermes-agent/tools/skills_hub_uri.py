#!/usr/bin/env python3
"""统一 registry URI 解析器（overlay[737]）。

把带显式 registry 前缀的技能标识符解析成 ``(source_id, identifier)``，供
``hermes_cli.skills_hub`` 分发链在最前面短路——命中已知源即只对该源
inspect/fetch（等同 ``--source`` 固定）；解析不出返回 None，调用方回落现状
分发链。纯函数、零 IO、零第三方依赖（仅标准库 urlparse）。

前缀映射的真源（本表与其保持一致，改适配器时同步这里）：
- ``hermes_cli/skills_hub.py::_registry_prefixes``——``<SOURCE_ID>/`` 家族、
  skills.sh 拼写族（含 SkillsShSource._ID_PREFIX_ALIASES 接受的 typo 拼写）、
  ``well-known:`` 包装形式；
- ``tools/skills_hub_install.py::_SOURCE_ID_ALIASES``——``skills.sh`` →
  ``skills-sh`` 的别名归一；
- ``tools/skills_hub_sources.py::UrlSource._matches``——裸 ``http(s)://….md``
  归 ``url`` 源，排除 ``/.well-known/skills/``（well-known 适配器自管）与
  ``/index.json``（索引页非技能页）。

``nacos://`` 是预留后端推断位：本仓无 Nacos 实例、skills_hub_sources 无
nacos 源，解析结果仅用于让分发链显式报「源不存在」（照常走完现状链、无
适配器认领后由既有失败路径报错），不静默回落其他源。
"""

from urllib.parse import urlparse

# 显式前缀 → 适配器 SOURCE_ID（大小写不敏感匹配，照 _registry_from_identifier 的 lowered 前置匹配）
_PREFIX_TO_SOURCE = (
    # <SOURCE_ID>/ 家族（官方目录/GitHub/ClawHub/LobeHub/browse.sh）
    ("official/", "official"),
    ("github/", "github"),
    ("clawhub/", "clawhub"),
    ("lobehub/", "lobehub"),
    ("browse-sh/", "browse-sh"),
    # skills.sh 双拼写 + 适配器接受的 typo 拼写（照 SkillsShSource._ID_PREFIX_ALIASES）
    ("skills-sh/", "skills-sh"),
    ("skills.sh/", "skills-sh"),
    ("skils-sh/", "skills-sh"),
    ("skils.sh/", "skills-sh"),
    # well-known 包装形式（well-known:<base_url>/<skill>）
    ("well-known:", "well-known"),
    # 预留后端推断位（本仓无 Nacos 实例，见模块头）
    ("nacos://", "nacos"),
)


def parse_skill_uri(raw) -> tuple[str, str] | None:
    """(source_id, identifier)；解析不出（含无前缀短名/裸路径）返回 None。

    identifier 原样返回（不改写大小写/不去空白）——是否认领由各适配器自己的
    ``_matches`` 决定，本函数只回答「它想从哪个源来」。
    """
    if not isinstance(raw, str) or not raw:
        return None
    lowered = raw.lower()
    for prefix, source_id in _PREFIX_TO_SOURCE:
        if lowered.startswith(prefix):
            return (source_id, raw)
    # 裸 http(s)://….md → url 源（照 UrlSource._matches：排除 well-known 端点
    # 与 index.json 索引页；这两类不是 url 源的标识符形态，回落现状链处理）
    if lowered.startswith(("http://", "https://")):
        if "/.well-known/skills/" in lowered or lowered.rstrip("/").endswith("/index.json"):
            return None
        try:
            if urlparse(raw).path.lower().endswith(".md"):
                return ("url", raw)
        except ValueError:
            return None
    return None
