#!/usr/bin/env python3
"""智能路由阈值口径一致性校验（2026-08-27 四轮体检落地）
复盘记录：阈值在 SOUL / orchestrator_rules 两处人工维护（system prompt 顶部块由 SOUL 生成），
数值曾漂移。本脚本机械校验两处的分级数字与关键词逐字一致，漂移即 exit 1。
单一事实源：SOUL.md §智能路由留痕表为正典；rules §0.2 是镜像（带指向正典的注释）。
"""
import re, sys
from pathlib import Path

SOUL = Path.home() / ".hermes/profiles/orchestrator/SOUL.md"
RULES = Path.home() / ".hermes/profiles/orchestrator/orchestrator_rules.md"

def thresholds(text):
    out = set()
    for m in re.finditer(r"工具调用\s*(≤|>=|≥)\s*(\d+)\s*次?(?:且|或)?\s*文件写入?\s*(=|≤|>=|≥)?\s*(\d*)", text):
        out.add((m.group(1), m.group(2)))
    for m in re.finditer(r"(?:调用|写入)\s*(\d)\s*[-–]\s*(\d)", text):
        out.add(("range", m.group(1) + "-" + m.group(2)))
    return out

problems = []
s, r = SOUL.read_text(errors="replace"), RULES.read_text(errors="replace")
ts, tr = thresholds(s), thresholds(r)
if not ts or not tr:
    problems.append(f"阈值抽取失败 soul={ts} rules={tr}")
elif ts != tr:
    problems.append(f"阈值漂移: SOUL={sorted(ts)} vs rules={sorted(tr)}")
# 关键词组校验
for kw in ["不留痕", "轻量留痕", "完整看板流程", "研究/编码/安全/部署"]:
    if kw not in s: problems.append(f"SOUL 缺关键词 {kw}")
    if kw not in r: problems.append(f"rules 缺关键词 {kw}")

if problems:
    print("routing-threshold drift:")
    for p in problems: print("  -", p)
    sys.exit(1)
print("routing-threshold OK")
