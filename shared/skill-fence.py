#!/usr/bin/env python3
"""
skill-fence.py — 技能边界围栏 + 主模型漂移守卫 (2026-08-18)
============================================================
单一事实源: ~/.hermes/shared/profiles.yaml
  skills_enabled = 允许的类目; skills_pinned = 允许的顶层单例技能。

职责(对每个已声明 skills_enabled 的 profile):
  1. 剪除 skills/ 下不在 board(=enabled ∪ pinned)内的条目:
     - 符号链接 → unlink(共享层 ~/.hermes/skills/ 不动)
     - 真实目录/文件 → 移入 ~/.hermes/skills-archive/<profile>/(可召回, 不删除)
  2. 补链: board 内、共享层存在、profile 缺失的条目 → symlink 到共享层;
     board 内但以真实目录存在且共享层同名 → 降级为 symlink(update copytree 残留)。
  3. 漂移守卫: config.yaml 的 model.provider 必须 == shared_config.model.provider
     (统一 cc-switch)。漂移时打印 ⚠; --with-configs 则调用生成器重建该 profile。
  4. 清理断链。

用法(必须用 hermes venv 的 python, 需要 yaml):
  ~/.hermes/hermes-agent/venv/bin/python ~/.hermes/shared/skill-fence.py            # 预览(dry-run)
  ~/.hermes/hermes-agent/venv/bin/python ~/.hermes/shared/skill-fence.py apply      # 执行
  ... apply --with-configs   # 剪除后同步重新生成 configs(修模型/工具漂移)
  ... apply --profile worker-coder
  ... --log /path/to/log     # 追加报告到日志(post-merge 用)

update 防护链: hermes update → .git/hooks/post-merge → 本脚本 apply --with-configs。
召回: 见 ~/.hermes/skills/skill-recall/SKILL.md 与 shared/skill-lifecycle.py。
"""
import argparse
import datetime
import shutil
import sys
import time
from pathlib import Path

import yaml

HERMES = Path.home() / ".hermes"
SHARED_YAML = HERMES / "shared" / "profiles.yaml"
SHARED_LAYER = HERMES / "skills"
PROFILES_DIR = HERMES / "profiles"
ARCHIVE = HERMES / "skills-archive"
GENERATOR = HERMES / "shared" / "generate-configs.py"


def log_out(msgs, line, log_fh=None):
    msgs.append(line)
    if log_fh:
        log_fh.write(line + "\n")


def load_boards():
    data = yaml.safe_load(SHARED_YAML.read_text()) or {}
    profiles = data.get("profiles", {}) or {}
    shared_model = (data.get("shared_config", {}) or {}).get("model", {}) or {}
    boards = {}
    for name, cfg in profiles.items():
        cfg = cfg or {}
        enabled = [c for c in cfg.get("skills_enabled", []) if isinstance(c, str)]
        if not enabled:
            continue  # 未声明 allowlist 的 profile 不治理(避免误伤)
        pinned = [s for s in cfg.get("skills_pinned", []) if isinstance(s, str)]
        boards[name] = {
            "board": set(enabled) | set(pinned),
            "enabled": enabled,
            "pinned": pinned,
            "toolsets": cfg.get("toolsets", []),
        }
    return boards, shared_model


def fence_profile(name, spec, expected_provider, apply, msgs, log_fh):
    pskills = PROFILES_DIR / name / "skills"
    stats = {"kept": 0, "linked": 0, "demoted": 0, "pruned_link": 0, "archived": 0}
    if not pskills.exists():
        log_out(msgs, f"  {name}: skills/ 不存在, 跳过", log_fh)
        return stats
    board = spec["board"]
    now = datetime.datetime.now().strftime("%F %T")

    for entry in sorted(pskills.iterdir()):
        ename = entry.name
        if ename.startswith("."):
            continue
        if ename in board:
            stats["kept"] += 1
            # 降级: 共享层同名的真实目录 → symlink(修 update copytree 残留)
            if entry.is_dir() and not entry.is_symlink() and (SHARED_LAYER / ename).is_dir():
                if apply:
                    shutil.rmtree(entry)
                    entry.symlink_to(SHARED_LAYER / ename, target_is_directory=True)
                stats["demoted"] += 1
                log_out(msgs, f"    demote dir->symlink: {name}/{ename}", log_fh)
            continue
        # 不在 board → 剪除
        if entry.is_symlink():
            if apply:
                entry.unlink()
            stats["pruned_link"] += 1
            log_out(msgs, f"    prune symlink: {name}/{ename}", log_fh)
        else:
            dest = ARCHIVE / name / ename
            if apply:
                ARCHIVE.mkdir(parents=True, exist_ok=True)
                if dest.exists():
                    dest = ARCHIVE / name / f"{ename}.{int(time.time())}"
                shutil.move(str(entry), str(dest))
                with open(ARCHIVE / "MANIFEST.md", "a", encoding="utf-8") as mf:
                    mf.write(f"- {ename} | profile={name} | {now} | 归档自 profiles/{name}/skills/ | 恢复: skill-lifecycle.py restore {ename}\n")
            stats["archived"] += 1
            log_out(msgs, f"    archive real-dir: {name}/{ename} -> skills-archive/{name}/", log_fh)

    # 补链: board 内、共享层有、profile 缺失
    for b in sorted(board):
        target = pskills / b
        if target.exists() or target.is_symlink():
            continue
        shared_t = SHARED_LAYER / b
        if shared_t.is_dir():
            if apply:
                target.symlink_to(shared_t, target_is_directory=True)
            stats["linked"] += 1
            log_out(msgs, f"    link missing: {name}/{b} -> shared", log_fh)

    # 断链清理
    for entry in pskills.iterdir():
        if entry.is_symlink() and not entry.exists():
            if apply:
                entry.unlink()
            log_out(msgs, f"    prune broken link: {name}/{entry.name}", log_fh)

    # 主模型漂移守卫
    cfg_path = PROFILES_DIR / name / "config.yaml"
    drift = None
    if cfg_path.exists():
        try:
            cfg = yaml.safe_load(cfg_path.read_text()) or {}
            model = (cfg.get("model") or {})
            if model.get("provider") and expected_provider and model.get("provider") != expected_provider:
                drift = f"model={model.get('provider')}/{model.get('default')} 期望 {expected_provider}"
        except Exception as e:
            drift = f"config 解析失败: {e}"
        if drift:
            log_out(msgs, f"    ⚠ MODEL-DRIFT {name}: {drift} — 用 --with-configs 重建", log_fh)
    return stats


def regen_profile(name):
    import subprocess
    r = subprocess.run([sys.executable, str(GENERATOR), "--profile", name],
                       capture_output=True, text=True, timeout=120)
    return r.returncode == 0, (r.stdout + r.stderr).strip()[-800:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", nargs="?", choices=["--dry-run", "apply"], default="--dry-run")
    ap.add_argument("--profile")
    ap.add_argument("--with-configs", action="store_true", help="剪除后重建漂移 profile 的 config")
    ap.add_argument("--log")
    args = ap.parse_args()
    # 兼容把 mode 省略直接 apply 的写法: 第一个位置参数
    apply = args.mode == "apply"

    log_fh = None
    if args.log:
        log_fh = open(args.log, "a", encoding="utf-8")

    msgs = []
    log_out(msgs, f"=== skill-fence {'APPLY' if apply else 'DRY-RUN'} {datetime.datetime.now():%F %T} ===", log_fh)
    boards, shared_model = load_boards()
    expected_provider = shared_model.get("provider", "")
    targets = {args.profile: boards[args.profile]} if args.profile and args.profile in boards else boards
    if args.profile and args.profile not in boards:
        log_out(msgs, f"  ⚠ {args.profile}: 未在 profiles.yaml 声明 skills_enabled, 不治理", log_fh)

    drift_profiles = []
    for name, spec in sorted(targets.items()):
        log_out(msgs, f"  [{name}] board={len(spec['board'])} 条目", log_fh)
        stats = fence_profile(name, spec, expected_provider, apply, msgs, log_fh)
        log_out(msgs, f"    kept={stats['kept']} linked={stats['linked']} demoted={stats['demoted']} "
                      f"pruned_link={stats['pruned_link']} archived={stats['archived']}", log_fh)
        # drift 检测(独立于剪枝结果)
        cfg_path = PROFILES_DIR / name / "config.yaml"
        if cfg_path.exists():
            try:
                cfg = yaml.safe_load(cfg_path.read_text()) or {}
                prov = (cfg.get("model") or {}).get("provider")
                if prov and expected_provider and prov != expected_provider:
                    drift_profiles.append(name)
            except Exception:
                pass

    if drift_profiles:
        log_out(msgs, f"  ⚠ MODEL-DRIFT profiles: {', '.join(drift_profiles)}", log_fh)
        if args.with_configs and apply:
            for p in drift_profiles:
                ok, tail = regen_profile(p)
                log_out(msgs, f"    regen {p}: {'OK' if ok else 'FAIL'} {tail if not ok else ''}", log_fh)

    if not apply:
        log_out(msgs, "  (dry-run — 加 apply 参数执行)", log_fh)
    if log_fh:
        log_fh.close()
    print("\n".join(msgs))
    sys.exit(0)


if __name__ == "__main__":
    main()
