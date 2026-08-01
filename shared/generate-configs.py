#!/usr/bin/env python3
"""
Hermes Agent 统一配置生成器 (精简模式)
============================================================
只输出 override 字段（~60行），其余靠 DEFAULT_CONFIG 自动补全。
api_key 等密钥用 ${VAR} 语法引用 .env 变量，由 _expand_env_vars() 展开。

读取:
  ~/.hermes/shared/.env.common     共享密钥/通用变量
  ~/.hermes/shared/profiles.yaml   profile 差异清单

生成:
  每个 profile 的 .env    (common + profile 专属)
  每个 profile 的 config.yaml (仅 override，保留 mcp_servers 等自动段)

用法:
  python3 generate-configs.py             # 生成全部
  python3 generate-configs.py --dry-run   # 预览不写入
  python3 generate-configs.py --diff      # 显示与现有文件差异
  python3 generate-configs.py --profile orchestrator  # 单个 profile
============================================================
"""
import argparse
import os
import sys
import yaml
import textwrap

def yaml_str_literal(dumper, data):
    """Custom string representer for YAML — use literal block style | for multiline."""
    if '\n' in data:
        return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
    return dumper.represent_scalar('tag:yaml.org,2002:str', data)

yaml.add_representer(str, yaml_str_literal)
import difflib
import json
from pathlib import Path

HERMES_HOME = Path(os.path.expanduser("~/.hermes"))
SHARED_DIR = HERMES_HOME / "shared"
PROFILES_DIR = HERMES_HOME / "profiles"


def _resolve_disabled_skills_by_category(categories):
    """Expand category names (e.g. 'creative', 'media') into the concrete skill
    names living under each profile's ``skills/<category>/`` directory, so they
    can be written to config.yaml ``skills.disabled``.

    ``get_disabled_skill_names()`` (agent/skill_utils.py) reads
    ``skills.disabled`` as a flat list of *skill names* — it has no
    category-level notion — so we resolve categories to skill names here by
    scanning each profile's own ``skills/`` tree. Returns a list (deduped,
    order-stable). Empty if the profile has no skills dir.
    """
    if not isinstance(categories, list):
        return []
    # Called per-profile; the caller passes the profile dir via a closure
    # attribute set by generate_config_yaml. This keeps the helper pure-ish
    # while still reading from disk once per generation.
    skills_dir = getattr(_resolve_disabled_skills_by_category, "_skills_dir", None)
    if skills_dir is None or not skills_dir.exists():
        return []
    resolved = []
    seen = set()
    for cat in categories:
        if not isinstance(cat, str):
            continue
        cat_dir = skills_dir / cat
        if not cat_dir.is_dir():
            continue
        for entry in sorted(cat_dir.iterdir()):
            if entry.is_dir() and (entry / "SKILL.md").exists():
                name = entry.name
                if name not in seen:
                    seen.add(name)
                    resolved.append(name)
    return resolved


def _resolve_skills_by_category(skills_dir, categories):
    """Expand category names into concrete skill names under ``skills_dir``.

    Same expansion as the disabled-list helper but as a standalone function
    (profiles.yaml uses it for ``skills_enabled``). Missing categories are
    silently skipped — the config generator prints a coverage report at the
    end of each run so typos surface there.
    """
    if skills_dir is None or not skills_dir.exists() or not isinstance(categories, list):
        return []
    resolved = []
    seen = set()
    for cat in categories:
        if not isinstance(cat, str):
            continue
        cat_dir = skills_dir / cat
        if not cat_dir.is_dir():
            continue
        for entry in sorted(cat_dir.iterdir()):
            if entry.is_dir() and (entry / "SKILL.md").exists():
                if entry.name not in seen:
                    seen.add(entry.name)
                    resolved.append(entry.name)
    return resolved


# Skills 收敛采用「允许列表」(skills_enabled) 而非「屏蔽列表」(skills_disabled)。
# 允许列表模式下，平台后续 bundle 的新技能不会悄悄出现在 worker 的技能清单里
# （屏蔽列表模式会，需人工追着屏蔽）。逐个 skill 名展开会导致 config.yaml 巨大，
# 因此允许列表整体进 extra.skills_enabled_by_category（config.yaml 里不存在的
# 键，对运行时零影响），config.yaml skills.disabled 只写未选中类目下的具体
# skill 名。
DEFAULT_UNSELECTED_CATEGORIES = ["creative", "media"]
# 全量类目（2026-07 基线，对应当前 bundle 的 22 个类目）。生成器启动时与磁盘
# 实际类目求差集并打印 PLATFORM-DRIFT 警告 —— 平台 bundle 新类目时提示人工
# 评审是否加入 ALL_CATEGORIES 及各 profile 的 skills_enabled。
ALL_CATEGORIES = [
    "apikey-image-gen", "apple", "autonomous-ai-agents", "computer-use",
    "creative", "cybersecurity", "data-science", "devops", "diagramming",
    "dogfood", "domain", "email", "gaming", "gifs", "github",
    "grok-image-to-video", "hermes-desktop-plugins", "hyperframes",
    "inference-sh", "markdown-viewer", "mcp", "media", "mlops",
    "note-taking", "productivity", "red-teaming", "remotion", "research",
    "smart-home", "social-media", "software-development", "yuanbao",
]


def _apply_skills_curation(profile_cfg, skills_dir, cfg, report):
    """Populate cfg["skills"]["disabled"] + cfg["extra"]["skills_enabled_by_category"]
    from profiles.yaml skills_enabled/skills_disabled declarations."""
    enabled_categories = profile_cfg.get("skills_enabled", [])
    disabled_categories = profile_cfg.get("skills_disabled", [])
    if not isinstance(enabled_categories, list):
        enabled_categories = []
    if not isinstance(disabled_categories, list):
        disabled_categories = []

    if enabled_categories:
        # 未选中类目 = ALL_CATEGORIES 中既未启用也未显式屏蔽的部分。
        # 这些类目下的具体 skill 名写入 config.yaml skills.disabled。
        selected = set(
            _resolve_skills_by_category(skills_dir, enabled_categories)
        )
        unselected_categories = [
            c for c in ALL_CATEGORIES
            if c not in enabled_categories and c not in disabled_categories
        ]
        unselected = _resolve_disabled_skills_by_category(unselected_categories)
        disabled = sorted(name for name in unselected if name not in selected)
        extra = cfg.setdefault("extra", {})
        extra["skills_enabled_by_category"] = enabled_categories
        if disabled:
            cfg["skills"] = {"disabled": disabled}
        report["mode"] = "allowlist"
        report["enabled_categories"] = enabled_categories
        report["enabled_skill_count"] = len(selected)
        report["disabled_count"] = len(disabled)
    elif disabled_categories:
        resolved = _resolve_disabled_skills_by_category(disabled_categories)
        if resolved:
            cfg["skills"] = {"disabled": sorted(resolved)}
        report["mode"] = "blocklist"
        report["enabled_categories"] = []
        report["enabled_skill_count"] = None
        report["disabled_count"] = len(resolved)
    else:
        report["mode"] = "none"
        report["enabled_categories"] = []
        report["enabled_skill_count"] = None
        report["disabled_count"] = 0
PROFILES_DIR = HERMES_HOME / "profiles"

# config.yaml 中自动管理的段，生成器保留不动
# 使用 list 而非 set 以保证输出顺序一致
PRESERVE_KEYS = ["mcp_servers", "platform_toolsets", "known_plugin_toolsets",
                 "onboarding", "updates", "_config_version"]


def load_env_common(path: Path) -> dict[str, str]:
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def load_profiles(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def generate_env(profile_name: str, profile_cfg: dict, common_env: dict) -> str:
    lines = [
        f"# === {profile_name} .env (auto-generated) ===",
        f"# Source: ~/.hermes/shared/.env.common + profiles.yaml",
        f"# DO NOT EDIT MANUALLY — edit shared files and re-run:",
        f"#   python3 ~/.hermes/shared/generate-configs.py",
        "",
        "# --- Shared (from .env.common) ---",
    ]
    for k in sorted(common_env.keys()):
        lines.append(f"{k}={common_env[k]}")
    lines.append("")
    extra = profile_cfg.get("env_extra", {})
    if extra:
        lines.append(f"# --- {profile_name} specific ---")
        for k in sorted(extra.keys()):
            lines.append(f"{k}={extra[k]}")
        lines.append("")
    return "\n".join(lines)


def generate_config_yaml(profile_name: str, profile_cfg: dict, existing_cfg: dict,
                         shared_config: dict = None) -> str:
    """Generate minimal config.yaml: only overrides + preserved auto-managed sections."""
    shared_config = shared_config or {}

    # Tell the category-expansion helper which profile's skills/ tree to scan.
    _resolve_disabled_skills_by_category._skills_dir = PROFILES_DIR / profile_name / "skills"

    # PLATFORM-DRIFT 哨兵：仅对声明了 skills_enabled 的 profile（即真正依赖
    # ALL_CATEGORIES 的）检查平台 bundle 类目变化；ALL_CATEGORIES 以 worker
    # profile 的完整 skills/ 树为基线，非 worker profile 目录缺类目属正常。
    skills_dir = PROFILES_DIR / profile_name / "skills"
    if skills_dir.exists() and profile_cfg.get("skills_enabled"):
        on_disk = sorted(
            e.name for e in skills_dir.iterdir()
            if e.is_dir() and not e.name.startswith(".")
        )
        # PLATFORM-DRIFT 哨兵：仅 worker（全量 skills 树）做磁盘对比；基线 worker
        # 之外缺类目属正常（各 profile 的 bundle 快照可能不同步）。
        is_full_tree_worker = "devops" in on_disk
        drift_new = [c for c in on_disk if c not in ALL_CATEGORIES]
        drift_gone = [c for c in ALL_CATEGORIES if c not in on_disk] if is_full_tree_worker else []
        if drift_new:
            print(f"  ⚠ PLATFORM-DRIFT {profile_name}: 磁盘出现未登记类目 {drift_new} —— "
                  f"默认被 allowlist 屏蔽，请评审是否加入 ALL_CATEGORIES / skills_enabled")
        if drift_gone:
            print(f"  ⚠ PLATFORM-DRIFT {profile_name}: ALL_CATEGORIES 中类目磁盘已不存在 {drift_gone} —— 请清理声明")

    shared = shared_config
    # Per-profile model override (e.g. specialized profiles pinned to custom providers)
    # wins over shared_config.model; fall back to shared, then the built-in default.
    model_cfg = profile_cfg.get("model") or shared.get("model", {"default": "glm-5.2", "provider": "damoxing", "base_url": "${DAMOXING_BASE_URL}"})
    providers_cfg = shared.get("providers", {})
    custom_providers_cfg = shared.get("custom_providers", [])
    agent_cfg = shared.get("agent", {})
    terminal_cfg = shared.get("terminal", {})
    compression_cfg = shared.get("compression", {})
    memory_cfg = shared.get("memory", {})
    kanban_cfg = shared.get("kanban", {})
    display_cfg = shared.get("display", {})
    security_cfg = shared.get("security", {})
    approvals_cfg = shared.get("approvals", {})
    auxiliary_cfg = shared.get("auxiliary", {})

    cfg = {
        "model": model_cfg,
        "providers": providers_cfg,
        "custom_providers": custom_providers_cfg,
        "toolsets": profile_cfg.get("toolsets", []),
        "agent": agent_cfg if agent_cfg else {
            "max_turns": 90,
            "reasoning_effort": "xhigh",
            "tool_use_enforcement": "auto",
            "task_completion_guidance": True,
            "parallel_tool_call_guidance": True,
            "environment_probe": False,
            "environment_hint": profile_cfg.get("environment_hint", ""),
        },
    }
    # When shared agent_cfg is used, inject per-profile environment_hint
    if agent_cfg and profile_cfg.get("environment_hint"):
        cfg["agent"]["environment_hint"] = profile_cfg["environment_hint"]
    cfg["terminal"] = terminal_cfg if terminal_cfg else {
        "backend": "local",
        "cwd": "~/hermes-docker-sandbox/workspace",
        "timeout": 180,
        "persistent_shell": True,
    }
    cfg["compression"] = compression_cfg if compression_cfg else {
        "enabled": True,
        "threshold": 0.5,
        "target_ratio": 0.2,
    }
    cfg["memory"] = memory_cfg if memory_cfg else {
        "memory_enabled": True,
        "user_profile_enabled": True,
        "provider": "hindsight",
    }
    cfg["kanban"] = {
        **(kanban_cfg if kanban_cfg else {
            "dispatch_in_gateway": True,
            "dispatch_interval_seconds": 60,
            "failure_limit": 2,
            "max_in_progress_per_profile": 2,
            "auto_decompose": False,
            "orchestrator_profile": "orchestrator",
        }),
        "default_assignee": profile_cfg.get("kanban", {}).get("default_assignee", ""),
    }
    cfg["display"] = display_cfg if display_cfg else {
        "skin": "daylight",
        "language": "zh",
        "personality": "kawaii",
    }
    cfg["security"] = security_cfg if security_cfg else {
        "redact_secrets": True,
        "tirith_enabled": True,
    }
    # Privacy settings (PII redaction) — passed through from shared_config
    privacy_cfg = shared.get("privacy", {})
    if privacy_cfg:
        cfg["privacy"] = privacy_cfg
    else:
        cfg["privacy"] = {"redact_pii": True}
    cfg["approvals"] = approvals_cfg if approvals_cfg else {
        "mode": "manual",
    }
    # Auxiliary tasks (title/compression/session_search/web_extract/vision/approval):
    # REQUIRED for k3-main profiles — api.kimi.com/coding speaks Anthropic wire only,
    # aux defaulting to main provider → OpenAI-format → HTTP 404. Pin to damoxing.
    if auxiliary_cfg:
        cfg["auxiliary"] = auxiliary_cfg

    # Fallback chain (top-level list of {provider, model, base_url?, api_mode?}):
    # tried in order when the primary fails with rate-limit/overload/connection
    # errors. Per-profile override wins, else shared fallback, else empty.
    fallback_cfg = profile_cfg.get("fallback_providers", shared.get("fallback_providers", []))
    if fallback_cfg:
        cfg["fallback_providers"] = fallback_cfg

    # platforms
    api_cfg = profile_cfg.get("api_server", {})
    cfg["platforms"] = {}
    cfg["platforms"]["api_server"] = {"enabled": api_cfg.get("enabled", False)}
    if api_cfg.get("enabled"):
        cfg["platforms"]["api_server"]["extra"] = {
            "host": api_cfg.get("host", "127.0.0.1"),
            "port": api_cfg.get("port", 8650),
        }
    cfg["platforms"]["matrix"] = {"enabled": profile_cfg.get("matrix", {}).get("enabled", False)}
    email_cfg = profile_cfg.get("email", {})
    if email_cfg:
        cfg["platforms"]["email"] = {"enabled": email_cfg.get("enabled", True)}

    # plugins
    cfg["plugins"] = {
        "disabled": [],
        "enabled": profile_cfg.get("plugins", []),
    }

    # Skills 收敛：支持两种声明（见 _apply_skills_curation 注释）：
    # - skills_enabled: 允许列表（推荐，抗平台新增技能静默渗入）
    # - skills_disabled: 屏蔽列表（旧模式，仅当未声明 skills_enabled 时生效）
    skills_report = {}
    _apply_skills_curation._existing_cfg = existing_cfg
    _apply_skills_curation(profile_cfg, _resolve_disabled_skills_by_category._skills_dir, cfg, skills_report)
    _apply_skills_curation._skills_report = skills_report

    # Preserve auto-managed sections from existing config
    for key in PRESERVE_KEYS:
        if key in existing_cfg:
            cfg[key] = existing_cfg[key]

    # Serialize with yaml — use block style for multiline strings
    return yaml.dump(cfg, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120, default_style=None)


def main():
    parser = argparse.ArgumentParser(description="Hermes Agent unified config generator")
    parser.add_argument("--dry-run", action="store_true", help="Print to stdout")
    parser.add_argument("--diff", action="store_true", help="Show diff with existing files")
    parser.add_argument("--profile", help="Generate only this profile")
    args = parser.parse_args()

    common_env = load_env_common(SHARED_DIR / ".env.common")
    profiles_data = load_profiles(SHARED_DIR / "profiles.yaml")
    profiles = profiles_data.get("profiles", {})

    if args.profile:
        if args.profile not in profiles:
            print(f"Error: profile '{args.profile}' not found in profiles.yaml")
            sys.exit(1)
        profiles = {args.profile: profiles[args.profile]}

    for pname, pcfg in profiles.items():
        profile_dir = PROFILES_DIR / pname
        if not profile_dir.exists():
            print(f"  ⚠ {pname}: profile dir missing, skipping")
            continue

        env_content = generate_env(pname, pcfg, common_env)

        # Read existing config to preserve auto-managed sections
        cfg_path = profile_dir / "config.yaml"
        existing_cfg = {}
        if cfg_path.exists():
            try:
                existing_cfg = yaml.safe_load(cfg_path.read_text()) or {}
            except Exception:
                pass

        # DAMOXING_CONTEXT_LENGTH is a string in .env, needs int conversion
        # We use a placeholder and fix it after yaml dump
        shared_cfg = profiles_data.get("shared_config", {})
        cfg_content = generate_config_yaml(pname, pcfg, existing_cfg, shared_config=shared_cfg)
        # Fix: ${DAMOXING_CONTEXT_LENGTH} as int — yaml.safe_load won't expand it,
        # and _expand_env_vars only processes strings. So we keep it as a string
        # reference; Hermes' _expand_env_vars will expand it to the string "1048576",
        # and the provider code does int() on context_length. To be safe, just
        # hardcode the numeric value since it's not a secret.
        cfg_content = cfg_content.replace(
            'context_length: int("${DAMOXING_CONTEXT_LENGTH}")',
            'context_length: 1048576'
        )

        env_path = profile_dir / ".env"

        if args.diff:
            print(f"\n{'='*60}")
            print(f"  {pname} — .env diff:")
            print(f"{'='*60}")
            old_env = env_path.read_text() if env_path.exists() else ""
            diff = list(difflib.unified_diff(
                old_env.splitlines(keepends=True),
                env_content.splitlines(keepends=True),
                fromfile=str(env_path),
                tofile="(generated)",
            ))
            print("".join(diff) if diff else "  (no changes)")

            print(f"\n{'='*60}")
            print(f"  {pname} — config.yaml diff:")
            print(f"{'='*60}")
            old_cfg = cfg_path.read_text() if cfg_path.exists() else ""
            diff = list(difflib.unified_diff(
                old_cfg.splitlines(keepends=True),
                cfg_content.splitlines(keepends=True),
                fromfile=str(cfg_path),
                tofile="(generated)",
            ))
            # Truncate huge diffs
            diff_text = "".join(diff)
            if len(diff_text) > 5000:
                print(diff_text[:5000])
                print(f"\n  ... ({len(diff_text)-5000} more chars truncated)")
            else:
                print(diff_text if diff_text else "  (no changes)")

        elif args.dry_run:
            print(f"\n{'='*60}")
            print(f"  {pname} .env ({len(env_content)} bytes):")
            print(f"{'='*60}")
            print(env_content)
            print(f"\n{'='*60}")
            print(f"  {pname} config.yaml ({len(cfg_content)} bytes):")
            print(f"{'='*60}")
            print(cfg_content)

        else:
            env_path.write_text(env_content)
            cfg_path.write_text(cfg_content)
            print(f"  ✓ {pname}: .env ({len(env_content)}B), config.yaml ({len(cfg_content)}B)")

        # Skills 收敛覆盖报告（所有模式都打印，供人工核对）
        skills_report = getattr(_apply_skills_curation, "_skills_report", None)
        if skills_report and skills_report.get("mode") != "none":
            print(f"    skills: mode={skills_report['mode']}"
                  f" enabled={skills_report.get('enabled_skill_count')}"
                  f" disabled={skills_report.get('disabled_count')}")

    if not args.dry_run and not args.diff:
        print(f"\n✅ Done. {len(profiles)} profiles generated.")
        print(f"   Source: {SHARED_DIR}/.env.common + {SHARED_DIR}/profiles.yaml")
        print(f"   Restart gateway: hermes -p orchestrator gateway run --replace")


if __name__ == "__main__":
    main()
