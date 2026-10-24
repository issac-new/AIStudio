#!/usr/bin/env python3
"""cron-failure-rca — cron/task 失败自动 RCA（原型 gap-20260927-020）

职责：失败发生后自动拉日志/最近变更，按指纹归类，产出根因候选 + 对策建议。
输入源（全部只读）：
  1. 各业务板 kanban.db 的 task_runs（failed/crashed/gave_up/timed_out）
  2. failure-mode-playbook FM-* 模式表（对策口径）
  3. git 最近提交（变更嫌疑排查，cron 失败第一步）

指纹库（FM-* 映射）源自 playbook v1.2.0 + 实测语料（2026-10-09 采样 393 条）：
  - ModuleNotFoundError / cannot import  → FM-R6 工具链半更新
  - provider 503/429/timeout            → FM-R1 provider 熔断
  - stdout >50KB 截断/数据丢失            → FM-R4 tool_output 截断
  - Iteration budget exhausted          → 预算耗尽（非 FM，专项）
  - SQLite no such table / locked       → FM-P1 guardrail / DB 争用
  - conn refused / DNS                  → 网络/依赖服务不可达
  - unknown                            → 需人工（自动 RCA 的边界）

输出：JSON（stdout）或 --markdown 报告。只读，不写任何状态。
用法：
  cron-failure-rca.py                     # 全板最近 14 天聚合
  cron-failure-rca.py --since 3d          # 自定义窗口
  cron-failure-rca.py --task t_xxx         # 单任务深查
  cron-failure-rca.py --markdown          # 输出 markdown 报告
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

HOME = Path.home()
BOARDS = ["swarm", "hack", "product", "ops", "[已移除]", "platform", "[已移除]", "aiteam", "pay", "data"]
FAIL_OUTCOMES = {"crashed", "timed_out", "failed", "gave_up", "abandoned"}

# ── 指纹库：错误模式 → FM 模式 + 根因候选 + 对策 ──────────────────────────
PATTERNS = [
    {
        "name": "toolchain_half_update",
        "fm": "FM-R6",
        "regex": re.compile(
            r"ModuleNotFoundError|cannot import name|partially-updated|"
            r"Error while finding module specification|No module named",
            re.I,
        ),
        "root_cause": "Hermes 工具链半更新（hermes_cli 模块缺失/import 断裂）",
        "countermeasure": "先 import 冒烟核验工具链现状再定性；已修复则记「缺口不存在+时间线」不建卡；跑 hermes-update-safe.sh",
    },
    {
        "name": "provider_circuit_break",
        "fm": "FM-R1",
        "regex": re.compile(r"503|429|rate.?limit|circuit.?break|upstream.*fail|provider.*unavailable", re.I),
        "root_cause": "provider 熔断/限流（cc-switch 上游失效）",
        "countermeasure": "cc-switch-provider-troubleshooting skill；切换备用上游；不裸 retry",
    },
    {
        "name": "tool_output_truncated",
        "fm": "FM-R4",
        "regex": re.compile(r"50KB|truncat|output.*too.*large|head/tail", re.I),
        "root_cause": "tool_output 截断丢失关键数据",
        "countermeasure": "spill 文件路径落盘，read_file(offset=...) 分页读；不依赖 inline 全文",
    },
    {
        "name": "iteration_budget_exhausted",
        "fm": "N/A(budget)",
        "regex": re.compile(r"Iteration budget exhausted|iteration.*limit|max.*turns", re.I),
        "root_cause": "goal-mode 迭代预算耗尽（任务 scope 超出允许轮次）",
        "countermeasure": "裁 scope 拆子卡，或 goal_max_turns 调大；预算耗尽类禁自动重试",
    },
    {
        "name": "db_guardrail",
        "fm": "FM-P1",
        "regex": re.compile(r"no such table|database is locked|sqlite.*readonly|unknown id or already terminal", re.I),
        "root_cause": "kanban DB guardrail/争用（直写被拒或 schema 漂移）",
        "countermeasure": "禁 sqlite 直写；走 kanban_* 工具链；kanban-db-guarded-writes skill 排查",
    },
    {
        "name": "network_unreachable",
        "fm": "N/A(infra)",
        "regex": re.compile(r"Connection refused|ECONNREFUSED|Name or service not known|DNS|network is unreachable", re.I),
        "root_cause": "依赖服务不可达/网络故障",
        "countermeasure": "检查依赖服务健康（curl /health）；网络 zone 配置；重试策略",
    },
    {
        "name": "worker_pid_dead",
        "fm": "N/A(transient)",
        "regex": re.compile(r"pid \d+ not alive|worker.*abandoned|deadline.*timed out", re.I),
        "root_cause": "worker 进程死亡/超时（transient，可能 OOM/慢系统）",
        "countermeasure": "transient 类可直接重试；连续 ≥3 次升级人工（watchdog 形态 C）",
    },
    {
        "name": "plugin_load_fail",
        "fm": "FM-R6",
        "regex": re.compile(r"Failed to load plugin|plugin.*timed out|register\(\) never returned", re.I),
        "root_cause": "plugin 加载失败/超时（依赖缺失或初始化阻塞）",
        "countermeasure": "hermes pm doctor 检查依赖；hermes pm install 补装；重启 gateway",
    },
    {
        "name": "protocol_violation",
        "fm": "FM-P2",
        "regex": re.compile(r"protocol violation|without kanban_complete|rc=0.*without", re.I),
        "root_cause": "worker 未按规定终态化（未调 kanban_complete/block 就退出）",
        "countermeasure": "检查退出协议（exit-protocol.md）；审查 worker SOUL 是否漏注入终态段",
    },
    {
        "name": "workspace_setup_fail",
        "fm": "N/A(workspace)",
        "regex": re.compile(r"workspace:.*Permission denied|workspace:.*File exists|workspace:.*worktree|workspace:.*git.*worktree|workspace:.*not inside a git", re.I),
        "root_cause": "workspace 准备失败（路径权限/目录已存在/worktree 创建失败）",
        "countermeasure": "检查 workspace_kind/路径配额；rm -rf 遗留目录；worktree-lifecycle-hygiene skill",
    },
    {
        "name": "runtime_name_error",
        "fm": "N/A(codebug)",
        "regex": re.compile(r"name '.*' is not defined|NameError|AttributeError", re.I),
        "root_cause": "运行时 NameError/AttributeError（代码 bug：变量/方法未定义）",
        "countermeasure": "读 traceback 定位代码行；systematic-debugging skill 排查；补单测",
    },
    {
        "name": "runtime_limit_exceeded",
        "fm": "N/A(timeout)",
        "regex": re.compile(r"elapsed \d+s > limit \d+s|max_runtime_seconds.*exceeded", re.I),
        "root_cause": "运行超时（elapsed > max_runtime_seconds）",
        "countermeasure": "调大 max_runtime_seconds 或裁 scope；超时类禁自动重试",
    },
]

UNCLASSIFIED = {"name": "unclassified", "fm": "N/A", "root_cause": "未知（需人工读日志）", "countermeasure": "升级人工：读 errors.log + task_events 时间线，按假设-反证法定因"}


def parse_since(s: str) -> int:
    s = s.strip().lower()
    if s.endswith("d"):
        return int(time.time()) - int(s[:-1]) * 86400
    if s.endswith("h"):
        return int(time.time()) - int(s[:-1]) * 3600
    if s.endswith("m"):
        return int(time.time()) - int(s[:-1]) * 60
    return int(time.time()) - 30 * 86400


def classify(text: str) -> dict:
    if not text:
        return UNCLASSIFIED
    for p in PATTERNS:
        if p["regex"].search(text):
            return p
    return UNCLASSIFIED


def load_failures(since: int, board_filter: str | None = None) -> list[dict]:
    rows = []
    boards = [board_filter] if board_filter else BOARDS
    for b in boards:
        p = HOME / ".hermes" / "kanban" / "boards" / b / "kanban.db"
        if not p.exists() or p.stat().st_size == 0:
            continue
        conn = sqlite3.connect(f"file:{p}?mode=ro&immutable=1", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            rs = conn.execute(
                """SELECT r.task_id, r.id AS run_id, r.profile, r.outcome, r.error, r.started_at, r.ended_at, t.title, t.assignee
                   FROM task_runs r LEFT JOIN tasks t ON t.id=r.task_id
                   WHERE r.ended_at IS NOT NULL AND r.outcome IN ({})
                   AND r.started_at >= ?""".format(",".join(f"'{o}'" for o in FAIL_OUTCOMES)),
                (since,),
            ).fetchall()
            for r in rs:
                d = dict(r)
                d["board"] = b
                rows.append(d)
        except Exception as e:
            print(f"[warn] {b}: {e}", file=sys.stderr)
        finally:
            conn.close()
    return rows


def recent_git_changes(n: int = 5) -> list[str]:
    """最近 git 提交（变更嫌疑，cron 失败排查第一步）。~/.hermes 非 git 仓库时退回工作区 repo。"""
    for cwd in [HOME / ".hermes", HOME / "hermes-docker-sandbox" / "workspace"]:
        try:
            out = subprocess.run(
                ["git", "-C", str(cwd), "log", f"-{n}", "--oneline", "--no-decorate"],
                capture_output=True, text=True, timeout=10,
            )
            if out.returncode == 0:
                return [l for l in out.stdout.strip().splitlines() if l]
        except Exception:
            pass
    return []


def build_report(rows: list[dict], since: int, git_changes: list[str]) -> dict:
    groups: dict[str, list] = collections.defaultdict(list)
    for r in rows:
        pat = classify(r.get("error") or "")
        r["pattern"] = pat
        groups[pat["name"]].append(r)

    # 按严重度排序：unclassified 优先（需人工），然后按数量
    sorted_groups = sorted(groups.items(), key=lambda kv: (kv[0] == "unclassified", -len(kv[1])))

    root_causes = []
    for name, items in sorted_groups:
        pat = items[0]["pattern"]
        sample_tasks = []
        for it in items[:3]:
            sample_tasks.append({"task_id": it["task_id"], "board": it["board"], "outcome": it["outcome"],
                                 "title": (it.get("title") or "")[:60]})
        root_causes.append({
            "pattern": name,
            "fm_mode": pat["fm"],
            "root_cause": pat["root_cause"],
            "countermeasure": pat["countermeasure"],
            "count": len(items),
            "pct": round(100 * len(items) / max(len(rows), 1), 1),
            "boards": sorted(set(i["board"] for i in items)),
            "sample_tasks": sample_tasks,
        })

    return {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "window_since": dt.datetime.fromtimestamp(since).isoformat(timespec="seconds"),
        "total_failures": len(rows),
        "root_causes": root_causes,
        "recent_changes": git_changes,
        "unclassified_pct": round(100 * len(groups.get("unclassified", [])) / max(len(rows), 1), 1),
    }


def to_markdown(rep: dict) -> str:
    lines = [
        "# Cron 失败自动 RCA 报告",
        f"生成时间: {rep['generated_at']}  | 窗口: {rep['window_since']} 起  | 失败总数: {rep['total_failures']}",
        "",
        "## 根因候选（按严重度排序）",
        "",
        "| # | 根因模式 | FM | 计数 | 占比 | 对策建议 |",
        "|---|---------|-----|------|------|---------|",
    ]
    for i, rc in enumerate(rep["root_causes"], 1):
        lines.append(f"| {i} | {rc['root_cause']} | {rc['fm_mode']} | {rc['count']} | {rc['pct']}% | {rc['countermeasure']} |")
    lines += ["", "## 最近变更（嫌疑排查）"]
    if rep["recent_changes"]:
        for c in rep["recent_changes"]:
            lines.append(f"- {c}")
    else:
        lines.append("- (git log 不可用)")
    lines += ["", f"## 未分类率: {rep['unclassified_pct']}%（>30% 需扩指纹库或人工介入）"]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="cron 失败自动 RCA")
    ap.add_argument("--since", default="14d", help="窗口，如 7d/3d/12h")
    ap.add_argument("--board", help="单板过滤")
    ap.add_argument("--task", help="单任务深查")
    ap.add_argument("--markdown", action="store_true", help="输出 markdown 报告")
    args = ap.parse_args()

    since = parse_since(args.since)
    rows = load_failures(since, args.board)
    if args.task:
        rows = [r for r in rows if r["task_id"] == args.task]
    git_changes = recent_git_changes()
    rep = build_report(rows, since, git_changes)

    if args.markdown:
        print(to_markdown(rep))
    else:
        print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
