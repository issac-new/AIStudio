#!/usr/bin/env python3
"""soul_integrity_watchdog.py — 集群提示词资产守护 cron wrapper (gap-20260904-004)

聚合三层检测（cron no_agent 模式：stdout 即消息；exit 1 时 scheduler 才报警）：
  L1 soul_integrity_guard.py --check : sha256 台账对比（快）
  L2 soul_git_sync.py --sync         : 白名单 .md 全量 vs git HEAD（版本化 + 兜底）
  L3 基线对账（SCM-B, t_9851f2ea）    : git diff <最新 cfg-* tag>..<现状> --stat，超阈值并入告警

双层语义：两层保护面一致（SOUL/rules/SKILL.md），任一层检出漂移即告警——
guard 基线被删/被污染时 git 层仍能检出（检测器自身也被纳入保护语义）。

L3 语义：cfg-* tag = 人工验收后打制的「已验证配置状态」锚点（SCM-B，git 即 CMDB）。
巡检时对账「上次验证过的状态 vs 现状」，回答 9-04 事故「修复提交≠修复生效」所需的对账问题。
  - 漂移超阈值 → 并入 problems 走既有 stdout 告警通道（零新增告警渠道），提示人工核验后打新 tag
  - fail-open：git/tag 基础设施异常（仓库缺失/无 tag/diff 失败/任何异常）一律降级为 warning，
    不影响退出码，不得让 tag 检查炸掉原有哈希巡检（9-04 教训：护栏炸=全板停摆）
  - 不自动打 tag：tag 是独立的人工验收后动作，自动化会让基线失去「验证态」含义

阈值校准（2026-09-07 实测，仓库 5 commit 历史 diff --stat）：
  常规单次 sync 间隔 1-2 files / 3-135 行；最大累积区间（9-04→9-07，3 天）32 files / 1834 行；
  阈值取最大观测累积加余量（40 files / 2000 行）——超过即疑似异常批量变更。

处置顺序（漂移时）：
  1. git sync 先行 —— 漂移内容先版本化留痕（证据保全，commit 可 diff/回滚/归因）
  2. 再刷新 guard 基线 —— 与已版本化状态对齐，同一次变更只告警一次（防告警疲劳）
  3. 告警段附 git 最新快照 hash 供人工归因
  4. L3 对账超阈值 → 人工核验当前配置状态后打新基线 tag（cfg-YYYYMMDD[-N]）

不自动处置的情形（fail-visible，需人工介入）：
  rc=2 环境错误（含 guard 基线被删）→ 只告警不重建基线（重建会掩盖事件）
  git sync 自身失败 → 告警，漂移未版本化
  L3 对账超阈值 → 只告警不自动打 tag（tag 必须人工验收后打制）

退出码：0 = L1/L2 全净且 L3 未超阈值（L3 降级为 warning 时不影响退出码）；
        1 = 漂移/L3 超阈值（已告警留痕）；2 = wrapper 自身环境错误
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

GUARD = Path.home() / ".hermes" / "scripts" / "soul_integrity_guard.py"
SYNC = Path.home() / ".hermes" / "scripts" / "soul_git_sync.py"
REPO = Path.home() / ".hermes" / "backup" / "soul-integrity-git"

# L3 基线对账阈值（校准依据见模块 docstring）
DRIFT_FILES_LIMIT = 40
DRIFT_LINES_LIMIT = 2000


def run(cmd: list[str], timeout: int = 300) -> tuple[int, str]:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr).strip()


def latest_cfg_tag(repo: Path) -> str | None:
    """最新 cfg-* 基线 tag 名（creatordate 降序第一个，annotated tag 取打制时间）；无则 None。"""
    rc, out = run(["git", "-C", str(repo), "tag", "-l", "cfg-*", "--sort=-creatordate"], timeout=30)
    if rc != 0 or not out.strip():
        return None
    return out.splitlines()[0].strip()


def parse_stat_summary(out: str) -> tuple[str, int, int]:
    """解析 diff --stat 末行汇总 → (summary 行, files 数, insertions+deletions 行数)。"""
    for ln in reversed(out.splitlines()):
        ln = ln.strip()
        m = re.search(r"(\d+) files? changed", ln)
        if not m:
            continue
        files_n = int(m.group(1))
        ins = re.search(r"(\d+) insertions?\(\+\)", ln)
        del_m = re.search(r"(\d+) deletions?\(-\)", ln)
        lines_n = (int(ins.group(1)) if ins else 0) + (int(del_m.group(1)) if del_m else 0)
        return ln, files_n, lines_n
    return "", 0, 0


def check_baseline(repo: Path) -> tuple[list[str], list[str], str]:
    """L3 基线对账（fail-open）。

    返回 (alerts, warnings, status)：
      alerts   超阈值漂移段 → 并入 problems 走既有告警通道（exit 1）
      warnings 基础设施异常降级提示 → 只打印，不影响退出码
      status   对账状态一句话（健康摘要用）；降级时为空串
    现状取工作区（git diff <tag> 为 tag vs 工作区），L2 sync 失败留下未 commit 变更时同样计入。
    """
    if not (repo / ".git").exists():
        return [], ["[L3 基线对账] warning: 基线仓库缺失，无法对账（降级：仅 L1/L2）"], ""

    tag = latest_cfg_tag(repo)
    if tag is None:
        return [], ["[L3 基线对账] warning: 无 cfg-* 基线 tag，无法对账（降级：仅 L1/L2；人工验收后打 cfg-YYYYMMDD）"], ""

    rc, out = run(["git", "-C", str(repo), "diff", tag, "--stat"], timeout=60)
    if rc != 0:
        return [], [f"[L3 基线对账] warning: git diff {tag} 失败 rc={rc}（降级：仅 L1/L2）"], ""

    summary, files_n, lines_n = parse_stat_summary(out)
    label = f"对账 {tag}"
    if files_n == 0 and lines_n == 0:
        return [], [], f"{label}: 现状与已验证基线一致"
    if files_n > DRIFT_FILES_LIMIT or lines_n > DRIFT_LINES_LIMIT:
        alerts = [
            f"[L3 基线对账] 相对基线 {tag} 漂移超阈值（限 {DRIFT_FILES_LIMIT} files / {DRIFT_LINES_LIMIT} 行）:",
            f"  {summary or f'{files_n} files changed'}",
            "  → 人工核验当前配置状态后打新基线 tag（cfg-YYYYMMDD[-N]，验收后人工打制）",
        ]
        return alerts, [], f"{label}: {files_n} files/{lines_n} 行漂移（超阈值）"
    return [], [], f"{label}: {files_n} files/{lines_n} 行漂移（阈值内）"


def main() -> int:
    for p in (GUARD, SYNC):
        if not p.is_file():
            print(f"SOUL-WATCHDOG ERROR: 缺脚本 {p}")
            return 2

    rc_g, out_g = run([sys.executable, str(GUARD), "--check"])
    rc_s, out_s = run([sys.executable, str(SYNC), "--sync"])

    problems: list[str] = []

    if rc_g == 1:
        problems.append("[L1 sha256台账] 检出漂移:")
        problems += ["  " + ln for ln in out_g.splitlines() if ln.strip()]
    elif rc_g == 2:
        # 基线缺失/环境错误：只告警，不自动重建（重建=掩盖事件）
        problems.append(f"[L1 sha256台账] 环境错误 rc=2 (基线被删需人工重建?): {out_g or '(无输出)'}")

    if rc_s == 1:
        problems.append("[L2 git版本化] DRIFT-COMMITTED（变更已入库留痕）:")
        problems += ["  " + ln for ln in out_s.splitlines() if ln.strip()]
    elif rc_s == 2:
        problems.append(f"[L2 git版本化] 环境错误 rc=2 (漂移未被版本化!): {out_s or '(无输出)'}")

    # L3 基线对账（SCM-B）：漂移超阈值并入告警；基础设施异常降级为 warning（fail-open）
    l3_alerts: list[str] = []
    l3_warnings: list[str] = []
    l3_status = ""
    try:
        l3_alerts, l3_warnings, l3_status = check_baseline(REPO)
    except Exception as e:  # noqa: BLE001 — 任何异常都不许炸掉原有哈希巡检
        l3_warnings.append(f"[L3 基线对账] warning: 对账异常降级 ({e})")
    if l3_alerts:
        problems += l3_alerts

    if problems:
        print(f"SOUL-INTEGRITY DRIFT ({len(problems)} 段) @ {time_str()}:")
        for ln in problems:
            print(ln)
        for ln in l3_warnings:
            print(ln)
        if l3_status:
            print(f"[L3 基线对账] {l3_status}")
        # 附最新 git 快照供归因（失败不阻塞告警本身）
        if (REPO / ".git").exists():
            rc, out = run(["git", "-C", str(REPO), "log", "--oneline", "-3"], timeout=30)
            if rc == 0 and out:
                print("[归因线索] git 快照最近 3 条:")
                print("  " + out.replace("\n", "\n  "))
        # 漂移已版本化后，把 guard 基线对齐到当前（版本化）状态：
        # 同一次变更集合只告警一次；历史漂移永久留在 git 里可追溯。
        if rc_g == 1 and rc_s in (0, 1):
            rc_b, out_b = run([sys.executable, str(GUARD), "--baseline"])
            print(f"[基线对齐] guard --baseline rc={rc_b} {out_b.splitlines()[-1] if out_b else ''}")
        return 1

    # 全净：一行健康摘要（含 L3 对账锚点；deliver=local 落 job 输出历史，不打扰任何渠道）
    ok = f"soul-integrity OK @ {time_str()} (sha256台账 + git快照 双层全净"
    if l3_status:
        ok += f"; L3 {l3_status}"
    ok += ")"
    print(ok)
    for ln in l3_warnings:
        print(ln)
    return 0


def time_str() -> str:
    import time
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


if __name__ == "__main__":
    sys.exit(main())
