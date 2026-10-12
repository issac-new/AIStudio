#!/usr/bin/env python3
"""意图簇判定回归（intent-cluster-regression）

用途：domain_closure.py 的 _INTENT_CLUSTERS 新增/修改簇后，入表前跑历史语料回归——
验证「同族全拦、异族全放、误杀 0」。没跑回归的簇不入表（防新簇拦住异族误杀有效建议）。

用法：
    python3 scripts/intent-cluster-regression.py
    退出码 0 = 回归通过；非 0 = 有误杀/漏拦，逐条 ✓/✗ 与 FAILS 计数已打印。

判定逻辑（新簇入表时同步维护 HISTORY 与 EXPECT）：
- HISTORY = 近期同主题的 llm_advice 建议全量语料（含拟拦的同族 + 必须放行的异族）
- EXPECT  = 每条的期望结果（'拦' / '放'），标注期望理由
- 对每条调 _same_intent_cluster(w)；非空簇且 gap_register 已有同簇 open 条目 → 拦，否则放
- 与 EXPECT 对照计数，ok < len(cases) 时 sys.exit(1)

约束：
- 断言用真实 gap_register.yaml 的 open 条目作判据，不用手造 fixture——防 fixture 与账本漂移。
- 异族保护专项必须在列（主题同、动作异的建议至少 2 条全 '放'），否则回归只验拦不验放。
- 仿真「三层 + 新层」全链时，前三层的输入结构（existing/new_gaps 集合）必须对齐真实 gaps
  数据——手造集合与账本不一致会报「同前40」假命中，误判既有层误杀。
"""
import importlib.util
import os
import sys

import yaml

WORKBENCH = os.path.expanduser("~/hermes-docker-sandbox/workspace/life-workbench")
DC_PATH = os.path.join(WORKBENCH, "scripts", "domain_closure.py")
GAP_REGISTER = os.path.join(WORKBENCH, "gap_register.yaml")

# --- 语料与期望（新簇入表时在此追加）-------------------------------------
# 每条 (what, expect)：expect ∈ {'拦', '放'}
HISTORY = [
    # fluss-poc-eval 簇（2026-10-08 首例）
    ("Fluss 1.0.0 PoC：Flink+Paimon+Fluss 端到端链路", "拦"),
    ("搭 Fluss 1.0.0 PoC：Gateway 部署 + Flink 读写 + Lakehouse 联通", "拦"),
    ("Fluss 1.0 隔离 PoC：对照 Kafka→Flink→Paimon 链路测延迟", "拦"),
    ("对 Fluss 1.0 做选型 POC：实测「Fluss 实时层+Paimon 湖底座」", "拦"),
    ("Fluss 1.0 封闭 POC：单机 mini cluster 验证写入吞吐", "拦"),
    # 异族保护专项（主题同、动作异 → 必须放行）
    ("建 Paimon/Fluss 升级风险清单：RC→GA 判据、KEYS 签名校验", "放"),
    ("评估并引入 Fluss Gateway 进行多语言客户端接入实时数据平面", "放"),
    ("Paimon/Fluss 升级评估流程：RC 跟踪、changelog diff、灰度验证清单", "放"),
    ("ASF 系依赖（Paimon/Fluss 等）入库前强制签名校验", "放"),
]
# --------------------------------------------------------------------------


def load_module(path):
    spec = importlib.util.spec_from_file_location("dc", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["dc"] = mod
    spec.loader.exec_module(mod)
    return mod


def main():
    if not os.path.exists(DC_PATH):
        print(f"FATAL: 找不到 {DC_PATH}")
        return 2
    dc = load_module(DC_PATH)

    gaps = yaml.safe_load(open(GAP_REGISTER)).get("gaps", [])
    open_desc = [g.get("description") or "" for g in gaps if g.get("status") == "open"]
    open_clusters = {dc._same_intent_cluster(d) for d in open_desc}
    open_clusters.discard(None)

    ok = 0
    fails = []
    for w, expect in HISTORY:
        cl = dc._same_intent_cluster(w)
        got = "拦" if (cl and cl in open_clusters) else "放"
        mark = "✓" if got == expect else "✗"
        if got == expect:
            ok += 1
        else:
            fails.append((w, expect, got))
        print(f"  {mark} [{got} 期望{expect}] {w[:50]}")

    print(f"\n回归: {ok}/{len(HISTORY)} | open 簇: {sorted(open_clusters) or '无'}")
    if fails:
        print(f"FAILS: {len(fails)}")
        for w, exp, got in fails:
            print(f"  ✗ 期望{exp}实得{got}: {w[:60]}")
        return 1
    print("PASS: 同族全拦、异族全放、误杀 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
