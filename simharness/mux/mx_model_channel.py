#!/usr/bin/env python3
"""SIM 直连 LLM 通道单一事实源（2026-11-05 用户指令）。

cc-switch 本地代理在长深思考流上反复崩溃（run27 烧机三连熔断实录：idle 掐流/
流截断/请求风暴），SIM 全编制（根配置 + 全部 profile）改直连 bigmodel anthropic
端点：XGLM 主通道、SGLM fallback、模型 glm-5.3、上下文 1M、协议
anthropic_messages。base_url 与两把 api_key 运行时从 cc-switch DB
（providers 表 app_type='hermes' 的 XGLM/SGLM 行）读取——配置值不在本文件硬
编码，cc-switch 侧换钥后重跑 mx-setup 即生效。

CLI：
  --emit-config [--cc-db PATH]   打印 model/fallback_providers/custom_providers YAML 段
  --check FILE...                校验 config.yaml 已是直连形态（setup 后守门/幂等检查）

库接口：apply_direct_channel(out)——mx-lib.sh 三处生成器
（write_root_config/write_user_profile/write_agent_profile）在拷贝宿主快照模型
段后调用，整段替换模型三键；MX_MODEL_CHANNEL=host 时不改（回滚开关，沿用宿主
快照模型段）。
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

DEFAULT_CC_DB = Path.home() / ".cc-switch" / "cc-switch.db"
PROVIDERS = ("xglm", "sglm")  # 主通道在前，fallback 在后（cc-switch 同名小写）
MODEL = "glm-5.3"
CONTEXT_LENGTH = 1048576  # 1M
API_MODE = "anthropic_messages"  # 协议统一 anthropic（用户指令 2026-11-05）


def _fetch_channel(cc_db: Path | str = DEFAULT_CC_DB) -> dict[str, dict[str, str]]:
    """从 cc-switch DB 读 XGLM/SGLM 两行的 base_url/api_key。

    只读打开（immutable URI），失败即抛 RuntimeError——setup 阶段响亮失败，
    不产出半套配置。
    """
    uri = f"file:{Path(cc_db)}?immutable=1"
    try:
        con = sqlite3.connect(uri, uri=True)
        try:
            rows = con.execute(
                "SELECT name, settings_config FROM providers "
                "WHERE app_type='hermes' AND name IN ('XGLM','SGLM')"
            ).fetchall()
        finally:
            con.close()
    except sqlite3.Error as exc:
        raise RuntimeError(f"cc-switch DB 不可读（{cc_db}）：{exc}") from exc
    channel: dict[str, dict[str, str]] = {}
    for name, raw in rows:
        try:
            cfg = json.loads(raw)
            base_url = str(cfg.get("base_url") or "").strip().rstrip("/")
            api_key = str(cfg.get("api_key") or "").strip()
        except (json.JSONDecodeError, AttributeError) as exc:
            raise RuntimeError(f"cc-switch provider {name} settings_config 异常：{exc}") from exc
        if base_url and api_key:
            channel[name.lower()] = {"base_url": base_url, "api_key": api_key}
    missing = [p for p in PROVIDERS if p not in channel]
    if missing:
        raise RuntimeError(
            f"cc-switch DB 缺 hermes 通道行：{missing}（改钥/删行后请同步 cc-switch 或设 MX_MODEL_CHANNEL=host 回滚）"
        )
    if channel["xglm"]["api_key"] == channel["sglm"]["api_key"]:
        raise RuntimeError("XGLM/SGLM api_key 相同：fallback 失去意义，疑似取数异常")
    return channel


def direct_channel_section(cc_db: Path | str = DEFAULT_CC_DB) -> dict[str, Any]:
    """直连通道三键段（model/fallback_providers/custom_providers）。"""
    ch = _fetch_channel(cc_db)
    providers: list[dict[str, Any]] = []
    for name in PROVIDERS:
        base_url = ch[name]["base_url"]
        if not base_url.endswith("/anthropic"):
            raise RuntimeError(
                f"{name} base_url 不以 /anthropic 结尾（{base_url}）：hermes host_mandated_api_mode "
                "靠该后缀把协议钉死在 anthropic_messages，通道换端点须重新评估协议"
            )
        providers.append({
            "name": name,
            "base_url": base_url,
            "api_key": ch[name]["api_key"],
            "api_mode": API_MODE,
            "models": {MODEL: {"context_length": CONTEXT_LENGTH}},
            "model": MODEL,
        })
    return {
        "model": {"default": MODEL, "provider": PROVIDERS[0]},
        "fallback_providers": [{"provider": PROVIDERS[1], "model": MODEL}],
        "custom_providers": providers,
    }


def apply_direct_channel(out: dict[str, Any]) -> dict[str, Any]:
    """生成器钩子：直连模式下整段替换模型三键；host 模式原样返回（回滚开关）。"""
    if os.environ.get("MX_MODEL_CHANNEL", "direct").strip().lower() != "direct":
        return out
    cc_db = os.environ.get("MX_MODEL_CC_DB") or DEFAULT_CC_DB
    out.update(direct_channel_section(cc_db))
    return out


def check_config(path: Path | str) -> list[str]:
    """校验一份 config.yaml 已是直连形态；返回问题清单（空=通过）。"""
    import yaml

    cfg = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    problems: list[str] = []
    model = cfg.get("model") or {}
    if model.get("provider") != PROVIDERS[0]:
        problems.append(f"model.provider 应为 {PROVIDERS[0]}，实为 {model.get('provider')!r}")
    if model.get("default") != MODEL:
        problems.append(f"model.default 应为 {MODEL}，实为 {model.get('default')!r}")
    fb = cfg.get("fallback_providers") or []
    if not (len(fb) == 1 and fb[0].get("provider") == PROVIDERS[1] and fb[0].get("model") == MODEL):
        problems.append(f"fallback_providers 应为 [{{provider: {PROVIDERS[1]}, model: {MODEL}}}]，实为 {fb!r}")
    cps = {c.get("name"): c for c in (cfg.get("custom_providers") or []) if isinstance(c, dict)}
    for name in PROVIDERS:
        c = cps.get(name)
        if not c:
            problems.append(f"custom_providers 缺 {name}")
            continue
        if c.get("api_mode") != API_MODE:
            problems.append(f"{name}.api_mode 应为 {API_MODE}，实为 {c.get('api_mode')!r}")
        if not str(c.get("base_url") or "").rstrip("/").endswith("/anthropic"):
            problems.append(f"{name}.base_url 不以 /anthropic 结尾：{c.get('base_url')!r}")
        models = c.get("models") or {}
        if (models.get(MODEL) or {}).get("context_length") != CONTEXT_LENGTH:
            problems.append(f"{name}.models[{MODEL}].context_length 应为 {CONTEXT_LENGTH}")
        if not str(c.get("api_key") or "").strip():
            problems.append(f"{name}.api_key 为空")
    if len(cps) == 2 and cps[PROVIDERS[0]].get("api_key") == cps[PROVIDERS[1]].get("api_key"):
        problems.append("xglm/sglm api_key 相同，fallback 失效")
    return problems


def main(argv: list[str]) -> int:
    args = argv[1:]
    if args[:1] == ["--emit-config"]:
        cc_db = DEFAULT_CC_DB
        if "--cc-db" in args:
            cc_db = args[args.index("--cc-db") + 1]
        import yaml

        yaml.safe_dump(direct_channel_section(cc_db), sys.stdout,
                       allow_unicode=True, sort_keys=False)
        return 0
    if args[:1] == ["--check"]:
        files = args[1:]
        if not files:
            print("用法：mx_model_channel.py --check FILE...", file=sys.stderr)
            return 2
        bad = 0
        for f in files:
            problems = check_config(f)
            if problems:
                bad += 1
                print(f"NOT-DIRECT {f}: {'; '.join(problems)}")
            else:
                print(f"direct-ok {f}")
        return 1 if bad else 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
