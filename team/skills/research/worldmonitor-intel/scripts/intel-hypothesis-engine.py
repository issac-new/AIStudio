#!/usr/bin/env python3
"""Hypothesis-Feedback 闭环引擎 (Intel Hypothesis Engine)

迁移自 RD-Agent (microsoft/RD-Agent) 的 R/D 双组件框架 + Trace DAG 设计，
适配为情报分析的"假设生成→证据收集→评估→修正假设"闭环。

核心概念:
  - Hypothesis: 情报假设（如"某国即将进行军事演习"）
  - Evidence: 支持/反对假设的证据
  - IntelFeedback: 评估结果，含 hypothesis_evaluation + new_hypothesis（双向耦合）
  - IntelTrace: 假设链 DAG（非线性，支持分叉/合并）
  - TraceScheduler: 多假设并行探索的调度策略

纯 stdlib 实现，无外部依赖。

用法:
  python3 intel-hypothesis-engine.py trace-new --question "某国意图评估" --hypothesis "..."
  python3 intel-hypothesis-engine.py trace-add --trace trace.json --evidence "..." --supports true
  python3 intel-hypothesis-engine.py trace-schedule --trace trace.json --strategy mcts
  python3 intel-hypothesis-engine.py trace-fuse --trace trace.json
  python3 intel-hypothesis-engine.py trace-assess --trace trace.json
"""
import argparse
import json
import math
import os
import sys
import time
import uuid
from collections import defaultdict

# ============ Core Data Structures ============

class Hypothesis:
    """情报假设 — 迁移自 RD-Agent Hypothesis"""

    def __init__(self, hypothesis, reason="", concise_reason="",
                 concise_observation="", concise_knowledge="",
                 parent_id=None, sibling_hypotheses=None):
        self.id = str(uuid.uuid4())[:8]
        self.hypothesis = hypothesis          # 假设陈述
        self.reason = reason                  # 提出理由
        self.concise_reason = concise_reason or reason[:200]
        self.concise_observation = concise_observation  # 关键观察
        self.concise_knowledge = concise_knowledge      # 领域知识
        self.parent_id = parent_id            # DAG 父节点
        self.sibling_hypotheses = sibling_hypotheses or []  # 并行分支的假设（diversity 机制）
        self.created_at = time.time()
        self.confidence = 0.5                 # 初始置信度

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, d):
        h = cls(d["hypothesis"], d.get("reason", ""), d.get("concise_reason", ""),
                d.get("concise_observation", ""), d.get("concise_knowledge", ""),
                d.get("parent_id"), d.get("sibling_hypotheses", []))
        h.id = d.get("id", h.id)
        h.created_at = d.get("created_at", time.time())
        h.confidence = d.get("confidence", 0.5)
        return h


class Evidence:
    """情报证据 — 迁移自 FundaPod Evidence Store（只追加、可溯源）"""

    def __init__(self, source, content, supports=True, confidence=0.5,
                 url=None, timestamp=None, evidence_type="osint"):
        self.id = str(uuid.uuid4())[:8]
        self.source = source                  # 来源（媒体/卫星/信号/人力）
        self.content = content                # 证据内容
        self.supports = supports              # True=支持假设, False=反对
        self.confidence = confidence          # 来源可信度 0-1
        self.url = url                        # 原始链接（溯源）
        self.timestamp = timestamp or time.time()
        self.evidence_type = evidence_type    # osint/humint/sigint/geo

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, d):
        e = cls(d["source"], d["content"], d.get("supports", True),
                d.get("confidence", 0.5), d.get("url"),
                d.get("timestamp"), d.get("evidence_type", "osint"))
        e.id = d.get("id", e.id)
        return e


class IntelFeedback:
    """情报评估反馈 — 迁移自 RD-Agent HypothesisFeedback

    核心创新: new_hypothesis 字段实现 评估器→假设生成 的双向耦合
    与 cognition-lattice 结合: biases 字段标注触发的认知偏差
    """

    def __init__(self, hypothesis_id, decision=False, observations="",
                 hypothesis_evaluation="", new_hypothesis="",
                 acceptable=False, biases=None, confidence_delta=0.0):
        self.hypothesis_id = hypothesis_id
        self.decision = decision               # 假设是否被证据支持
        self.observations = observations       # 观察到的事实
        self.hypothesis_evaluation = hypothesis_evaluation  # 对假设的评判
        self.new_hypothesis = new_hypothesis   # 评估器建议的下一个假设方向（双向耦合）
        self.acceptable = acceptable           # 假设是否可接受（即使未完全验证）
        self.biases = biases or []             # 触发的认知偏差（来自 cognition-lattice）
        self.confidence_delta = confidence_delta  # 置信度变化量

    def __bool__(self):
        return self.decision

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, d):
        return cls(
            d["hypothesis_id"], d.get("decision", False),
            d.get("observations", ""), d.get("hypothesis_evaluation", ""),
            d.get("new_hypothesis", ""), d.get("acceptable", False),
            d.get("biases", []), d.get("confidence_delta", 0.0)
        )


class IntelTrace:
    """情报假设链 DAG — 迁移自 RD-Agent Trace

    非线性结构: 支持多假设并行探索、分叉(NEW_ROOT)、合并(fusion)
    """

    NEW_ROOT = ()

    def __init__(self, question=""):
        self.question = question               # 情报问题
        self.hist = []                         # [(Hypothesis, [Evidence], IntelFeedback)]
        self.dag_parent = []                   # 每个节点的父节点索引
        self.current_selection = self.NEW_ROOT  # 下一个假设从哪个节点生长

    def add_node(self, hypothesis, evidences=None, feedback=None, parent_idx=None):
        """添加一个假设节点到 DAG"""
        idx = len(self.hist)
        self.hist.append({
            "hypothesis": hypothesis,
            "evidences": evidences or [],
            "feedback": feedback
        })
        if parent_idx is not None:
            self.dag_parent.append((parent_idx,))
        else:
            self.dag_parent.append(self.current_selection)
        return idx

    def get_leaves(self):
        """获取所有叶子节点（可扩展的分支末端）"""
        all_parents = set()
        for parents in self.dag_parent:
            all_parents.update(parents)
        return [i for i in range(len(self.hist)) if i not in all_parents]

    def get_sota_node(self):
        """获取当前最优假设（置信度最高的已验证节点）— 迁移自 get_sota_experiment"""
        best_idx = None
        best_conf = -1
        for i, node in enumerate(self.hist):
            fb = node.get("feedback")
            if fb and fb.decision:
                conf = self._node_confidence(i)
                if conf > best_conf:
                    best_conf = conf
                    best_idx = i
        return best_idx

    def _node_confidence(self, idx):
        """计算节点置信度：假设初始置信度 + 证据支持 - 证据反对 + 反馈调整"""
        node = self.hist[idx]
        conf = node["hypothesis"].confidence
        for ev in node["evidences"]:
            if ev.supports:
                conf += ev.confidence * 0.1
            else:
                conf -= ev.confidence * 0.15
        fb = node.get("feedback")
        if fb:
            conf += fb.confidence_delta
        return max(0.0, min(1.0, conf))

    def get_parent_chain(self, idx):
        """获取节点的祖先链（用于 MCTS 回传）"""
        chain = [idx]
        current = idx
        while True:
            parents = self.dag_parent[current]
            if not parents or parents == self.NEW_ROOT:
                break
            parent = parents[0]
            chain.append(parent)
            current = parent
        return chain

    def to_dict(self):
        return {
            "question": self.question,
            "hist": [{
                "hypothesis": h.to_dict() if hasattr(h, 'to_dict') else h,
                "evidences": [e.to_dict() if hasattr(e, 'to_dict') else e for e in evs],
                "feedback": fb.to_dict() if fb and hasattr(fb, 'to_dict') else fb
            } for h, evs, fb in [(n["hypothesis"], n["evidences"], n["feedback"]) for n in self.hist]],
            "dag_parent": [list(p) if p != self.NEW_ROOT else [] for p in self.dag_parent],
            "current_selection": list(self.current_selection) if self.current_selection != self.NEW_ROOT else []
        }

    @classmethod
    def from_dict(cls, d):
        t = cls(d.get("question", ""))
        t.hist = [{
            "hypothesis": Hypothesis.from_dict(n["hypothesis"]),
            "evidences": [Evidence.from_dict(e) for e in n.get("evidences", [])],
            "feedback": IntelFeedback.from_dict(n["feedback"]) if n.get("feedback") else None
        } for n in d.get("hist", [])]
        t.dag_parent = [tuple(p) if p else cls.NEW_ROOT for p in d.get("dag_parent", [])]
        cs = d.get("current_selection", [])
        t.current_selection = tuple(cs) if cs else cls.NEW_ROOT
        return t

    def save(self, path):
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            return cls.from_dict(json.load(f))


# ============ Trace Schedulers (迁移自 RD-Agent trace_scheduler.py) ============

class TraceScheduler:
    """调度器基类: 决定下一步扩展哪条假设分支"""

    def select(self, trace):
        raise NotImplementedError

    def observe(self, trace, node_idx):
        """观察反馈，更新内部状态（MCTS 回传等）"""
        pass


class RoundRobinScheduler(TraceScheduler):
    """轮询各叶子，优先创建新分支"""

    def __init__(self, max_traces=3):
        self.max_traces = max_traces
        self._counter = 0

    def select(self, trace):
        leaves = trace.get_leaves()
        if len(leaves) < self.max_traces:
            return trace.NEW_ROOT
        return (leaves[self._counter % len(leaves)],)

    def observe(self, trace, node_idx):
        self._counter += 1


class SOTABasedScheduler(TraceScheduler):
    """偏好 SOTA（最优假设）更多的分支 — 利用优先"""

    def select(self, trace):
        leaves = trace.get_leaves()
        if not leaves:
            return trace.NEW_ROOT
        sota = trace.get_sota_node()
        if sota is not None and sota in leaves:
            return (sota,)
        # 选置信度最高的叶子
        best = max(leaves, key=lambda i: trace._node_confidence(i))
        return (best,)


class MCTSScheduler(TraceScheduler):
    """MCTS PUCT 调度 — AlphaGo 式探索-利用平衡

    Q(s,a) + c_puct · P(s,a) · √N(parent) / (1 + N(s,a))

    迁移自 RD-Agent MCTSScheduler
    """

    def __init__(self, c_puct=1.414, max_traces=4):
        self.c_puct = c_puct
        self.max_traces = max_traces
        self.node_value_sum = defaultdict(float)
        self.node_visit_count = defaultdict(int)

    def select(self, trace):
        leaves = trace.get_leaves()
        if len(leaves) < self.max_traces:
            return trace.NEW_ROOT
        if not leaves:
            return trace.NEW_ROOT

        total_parent_visits = sum(self.node_visit_count.get(l, 0) for l in leaves)
        best_score = -float('inf')
        best_leaf = leaves[0]

        for leaf in leaves:
            q = self.node_value_sum.get(leaf, 0.0) / max(1, self.node_visit_count.get(leaf, 0))
            # P(s,a) 用节点置信度作为先验
            p = trace._node_confidence(leaf)
            u = self.c_puct * p * math.sqrt(total_parent_visits + 1) / (1 + self.node_visit_count.get(leaf, 0))
            score = q + u
            if score > best_score:
                best_score = score
                best_leaf = leaf
        return (best_leaf,)

    def observe(self, trace, node_idx):
        """沿祖先链回传 reward"""
        node = trace.hist[node_idx]
        fb = node.get("feedback")
        if fb:
            reward = 1.0 if fb.decision else 0.0
            confidence = trace._node_confidence(node_idx)
            reward = reward * 0.7 + confidence * 0.3
        else:
            reward = 0.5

        for ancestor in trace.get_parent_chain(node_idx):
            self.node_value_sum[ancestor] += reward
            self.node_visit_count[ancestor] += 1


class DiversityScheduler(MCTSScheduler):
    """带 Sibling Diversity 的 MCTS — 强制并行假设差异化

    迁移自 RD-Agent diversity_strategy.py + InjectUntilSOTAGainedStrategy
    并行分支必须探索不同方向，避免 confirmation bias
    """

    def __init__(self, c_puct=1.414, max_traces=4, diversity_keywords=None):
        super().__init__(c_puct, max_traces)
        self.diversity_keywords = diversity_keywords or []
        self._used_directions = set()

    def select(self, trace):
        selection = super().select(trace)
        # 记录已探索方向
        if selection != trace.NEW_ROOT:
            leaf_idx = selection[0]
            hyp_text = trace.hist[leaf_idx]["hypothesis"].hypothesis.lower()
            for kw in self.diversity_keywords:
                if kw.lower() in hyp_text:
                    self._used_directions.add(kw)
        return selection

    def get_available_directions(self):
        """返回未被探索的方向（用于生成 sibling_hypotheses）"""
        return [d for d in self.diversity_keywords if d not in self._used_directions]


SCHEDULERS = {
    "round_robin": RoundRobinScheduler,
    "sota": SOTABasedScheduler,
    "mcts": MCTSScheduler,
    "diversity": DiversityScheduler,
}


# ============ Trace Fusion (迁移自 RD-Agent merge.py) ============

def trace_fusion(trace, min_branches=2):
    """多假设链融合 — 找"最互补"的分支合并

    迁移自 RD-Agent MergeExpGen: 不是简单投票，而是找
    "与主流判断差异最大但仍有证据支持"的分支融合（互补潜力最大）

    逻辑: get_exp_index 的 min(abs(final_score - sota_score))
    """
    leaves = trace.get_leaves()
    if len(leaves) < min_branches:
        return {
            "fused": False,
            "reason": f"只有 {len(leaves)} 条分支，需要 ≥{min_branches}",
            "leaves": leaves
        }

    # 计算各叶子置信度
    scored = [(i, trace._node_confidence(i)) for i in leaves]
    scored.sort(key=lambda x: -x[1])

    sota_idx, sota_conf = scored[0]

    # 找"与 SOTA 分数差最小"的分支 — 最有互补潜力
    # (迁移自 RD-Agent: min(abs(final_score - sota_score)))
    best_merge_idx = None
    best_diff = float('inf')
    for idx, conf in scored[1:]:
        diff = abs(conf - sota_conf)
        if diff < best_diff:
            best_diff = diff
            best_merge_idx = idx

    # 检查证据互补性: SOTA 的支持证据 vs 融合候选的反对证据
    sota_node = trace.hist[sota_idx]
    merge_node = trace.hist[best_merge_idx]

    sota_supports = {e.source for e in sota_node["evidences"] if e.supports}
    merge_opposes = {e.source for e in merge_node["evidences"] if not e.supports}
    complementary_sources = sota_supports & merge_opposes  # 同一来源在两链中结论不同

    # 融合后的综合判断
    sota_hyp = sota_node["hypothesis"].hypothesis
    merge_hyp = merge_node["hypothesis"].hypothesis
    fused_confidence = (sota_conf + trace._node_confidence(best_merge_idx)) / 2

    return {
        "fused": True,
        "sota_branch": {
            "index": sota_idx,
            "hypothesis": sota_hyp,
            "confidence": round(sota_conf, 3),
            "evidence_count": len(sota_node["evidences"])
        },
        "merge_branch": {
            "index": best_merge_idx,
            "hypothesis": merge_hyp,
            "confidence": round(trace._node_confidence(best_merge_idx), 3),
            "evidence_count": len(merge_node["evidences"])
        },
        "complementary_sources": list(complementary_sources),
        "fused_confidence": round(fused_confidence, 3),
        "fusion_rationale": f"SOTA假设({sota_conf:.2f})与分支{best_merge_idx}({trace._node_confidence(best_merge_idx):.2f})差异最小({best_diff:.3f})，互补潜力最大",
        "suggested_synthesis": f"综合两条假设链: 1) {sota_hyp} 2) {merge_hyp}。互补来源: {list(complementary_sources) if complementary_sources else '无直接冲突'}"
    }


# ============ Competing Hypotheses Assessment ============
# 迁移自 TradingAgents Bull/Bear debate + FundaPod Independence before Synthesis

def competing_hypotheses_assessment(trace, question=None):
    """竞争性假设评估 — Analyst of Competing Hypotheses (ACH) 方法

    融合三种范式:
    1. TradingAgents Bull/Bear debate: 正反双方对抗
    2. FundaPod Independence before Synthesis: 各假设独立评估，不通信
    3. RD-Agent Trace Fusion: 找最互补分支合并

    迁移自 CIA Psychology of Intelligence Analysis: ACH 方法论
    """

    if not trace.hist:
        return {"assessment": "insufficient_data", "reason": "无假设和证据"}

    # Step 1: 各假设独立评估（FundaPod 独立优先范式）
    assessments = []
    for i, node in enumerate(trace.hist):
        hyp = node["hypothesis"]
        evidences = node["evidences"]

        if not evidences:
            assessments.append({
                "index": i,
                "hypothesis": hyp.hypothesis,
                "verdict": "untested",
                "support_score": 0,
                "oppose_score": 0,
                "net_score": 0,
                "confidence": hyp.confidence
            })
            continue

        supports = [e for e in evidences if e.supports]
        opposes = [e for e in evidences if not e.supports]

        # 加权评分: 证据可信度 × 证据数量衰减
        support_score = sum(e.confidence for e in supports) * (1 - 0.1 * (len(supports) - 1)) if supports else 0
        oppose_score = sum(e.confidence for e in opposes) * (1 - 0.1 * (len(opposes) - 1)) if opposes else 0
        support_score = max(0, support_score)
        oppose_score = max(0, oppose_score)
        net_score = support_score - oppose_score

        if net_score > 0.3:
            verdict = "supported"
        elif net_score < -0.3:
            verdict = "refuted"
        elif abs(net_score) <= 0.1 and len(evidences) >= 3:
            verdict = "inconclusive_evidence_rich"
        else:
            verdict = "inconclusive"

        assessments.append({
            "index": i,
            "hypothesis": hyp.hypothesis,
            "verdict": verdict,
            "support_score": round(support_score, 3),
            "oppose_score": round(oppose_score, 3),
            "net_score": round(net_score, 3),
            "evidence_count": len(evidences),
            "confidence": round(hyp.confidence, 3),
            "key_supporting_evidence": [e.content[:100] for e in supports[:3]],
            "key_opposing_evidence": [e.content[:100] for e in opposes[:3]]
        })

    # Step 2: 识别分歧最大的假设对（Bull/Bear 对抗检测）
    max_disagreement = None
    max_diff = 0
    for i in range(len(assessments)):
        for j in range(i + 1, len(assessments)):
            diff = abs(assessments[i]["net_score"] - assessments[j]["net_score"])
            if diff > max_diff:
                max_diff = diff
                max_disagreement = (i, j, diff)

    # Step 3: 综合判断（不是简单投票）
    supported = [a for a in assessments if a["verdict"] == "supported"]
    refuted = [a for a in assessments if a["verdict"] == "refuted"]
    inconclusive = [a for a in assessments if "inconclusive" in a["verdict"]]

    if len(supported) == 1 and not refuted:
        synthesis = f"单一假设获证据支持: {supported[0]['hypothesis']}"
        confidence = supported[0]["confidence"]
    elif len(supported) > 1:
        synthesis = f"{len(supported)}条假设均获支持，需 Trace Fusion 进一步综合"
        fusion_result = trace_fusion(trace)
        synthesis += f"\n融合建议: {fusion_result.get('suggested_synthesis', 'N/A')}"
        confidence = fusion_result.get("fused_confidence", 0.5)
    elif refuted and not supported:
        synthesis = f"所有假设被证据反对，需生成新假设（IntelFeedback.new_hypothesis）"
        confidence = 0.2
    elif inconclusive:
        synthesis = f"证据不足或矛盾，{len(inconclusive)}条假设悬而未决"
        confidence = 0.3
    else:
        synthesis = "假设状态混合，建议补充证据"
        confidence = 0.4

    return {
        "question": question or trace.question,
        "assessment": "completed",
        "hypothesis_count": len(assessments),
        "supported": len(supported),
        "refuted": len(refuted),
        "inconclusive": len(inconclusive),
        "max_disagreement": {
            "hypothesis_a": assessments[max_disagreement[0]]["hypothesis"] if max_disagreement else None,
            "hypothesis_b": assessments[max_disagreement[1]]["hypothesis"] if max_disagreement else None,
            "score_diff": round(max_disagreement[2], 3) if max_disagreement else 0
        },
        "synthesis": synthesis,
        "confidence": round(confidence, 3),
        "detailed_assessments": assessments
    }


# ============ Cognitive Bias Detection (与 cognition-lattice 集成) ============

BIAS_PATTERNS = {
    "confirmation_bias": {
        "description": "只收集支持假设的证据，忽略反对证据",
        "detect": lambda node: len([e for e in node["evidences"] if e.supports]) > 0 and
                               len([e for e in node["evidences"] if not e.supports]) == 0 and
                               len(node["evidences"]) >= 5
    },
    "anchoring": {
        "description": "初始假设置信度过高且未被证据显著调整",
        "detect": lambda node: node["hypothesis"].confidence > 0.8 and
                               len(node["evidences"]) >= 3 and
                               abs(node.get("feedback", IntelFeedback("",)).confidence_delta) < 0.1
    },
    "availability_heuristic": {
        "description": "过度依赖近期/容易获取的证据",
        "detect": lambda node: len(node["evidences"]) >= 3 and
                               all(e.source == node["evidences"][0].source for e in node["evidences"])
    },
    "groupthink": {
        "description": "多假设链方向高度同质（无 diversity）",
        "detect": lambda trace: len(set(h["hypothesis"].hypothesis[:50] for h in trace.hist)) < len(trace.hist) * 0.7
                               if len(trace.hist) > 2 else False
    }
}


def detect_cognitive_biases(trace):
    """检测假设链中的认知偏差 — 与 cognition-lattice 知识库集成

    迁移自 FundaPod 对 informational cascade 的批判 +
    cognition-lattice 的 239 条认知偏差
    """
    detected = []

    for i, node in enumerate(trace.hist):
        node_biases = []
        for bias_name, pattern in BIAS_PATTERNS.items():
            if bias_name == "groupthink":
                continue
            try:
                if pattern["detect"](node):
                    node_biases.append({
                        "bias": bias_name,
                        "description": pattern["description"],
                        "node_index": i,
                        "hypothesis": node["hypothesis"].hypothesis[:100],
                        "mitigation": _get_bias_mitigation(bias_name)
                    })
            except Exception:
                pass
        detected.extend(node_biases)

    # Groupthink 检测（trace 级别）
    try:
        if BIAS_PATTERNS["groupthink"]["detect"](trace):
            detected.append({
                "bias": "groupthink",
                "description": BIAS_PATTERNS["groupthink"]["description"],
                "node_index": "trace_level",
                "mitigation": _get_bias_mitigation("groupthink")
            })
    except Exception:
        pass

    return detected


def _get_bias_mitigation(bias_name):
    """偏差缓解建议 — 对应 cognition-lattice 的思维模型"""
    mitigations = {
        "confirmation_bias": "强制收集反对证据（Red Team 思维）；引入 FundaPod 独立优先范式：让不同分析师独立评估后再综合",
        "anchoring": "用贝叶斯更新动态调整置信度；初始假设置信度不超过 0.6",
        "availability_heuristic": "强制多源证据（OSINT+HUMINT+SIGINT+GEO）；用 worldmonitor-intel 的 focal_point 检测多流覆盖",
        "groupthink": "启用 DiversityScheduler 强制并行假设差异化；注入 sibling_hypotheses 机制"
    }
    return mitigations.get(bias_name, "参考 cognition-lattice 对应思维模型")


# ============ CLI ============

def cmd_trace_new(args):
    trace = IntelTrace(args.question)
    hyp = Hypothesis(args.hypothesis, args.reason or args.hypothesis)
    trace.add_node(hyp)
    path = args.output or f"trace_{int(time.time())}.json"
    trace.save(path)
    print(json.dumps({"status": "created", "trace_path": path, "node_count": len(trace.hist)}, ensure_ascii=False, indent=2))


def cmd_trace_add(args):
    trace = IntelTrace.load(args.trace)
    if args.node_idx is not None:
        idx = args.node_idx
    else:
        leaves = trace.get_leaves()
        idx = leaves[-1] if leaves else 0

    evidence = Evidence(args.source, args.evidence,
                        supports=(args.supports == 'true'),
                        confidence=args.confidence, url=args.url,
                        evidence_type=args.etype)
    trace.hist[idx]["evidences"].append(evidence)
    trace.save(args.trace)
    print(json.dumps({"status": "evidence_added", "node_index": idx,
                      "evidence_count": len(trace.hist[idx]["evidences"])}, ensure_ascii=False, indent=2))


def cmd_trace_fork(args):
    """从现有节点分叉新假设"""
    trace = IntelTrace.load(args.trace)
    parent_idx = args.parent if args.parent is not None else trace.get_leaves()[0]
    hyp = Hypothesis(args.hypothesis, args.reason, parent_id=trace.hist[parent_idx]["hypothesis"].id)
    trace.add_node(hyp, parent_idx=parent_idx)
    trace.save(args.trace)
    print(json.dumps({"status": "forked", "parent_index": parent_idx,
                      "new_node_index": len(trace.hist) - 1}, ensure_ascii=False, indent=2))


def cmd_trace_schedule(args):
    trace = IntelTrace.load(args.trace)
    scheduler_cls = SCHEDULERS.get(args.strategy, MCTSScheduler)
    scheduler = scheduler_cls()
    selection = scheduler.select(trace)
    print(json.dumps({
        "strategy": args.strategy,
        "selection": list(selection) if selection != trace.NEW_ROOT else "NEW_ROOT",
        "leaves": trace.get_leaves(),
        "recommendation": "创建新假设分支" if selection == trace.NEW_ROOT else f"继续扩展分支 {selection[0]}"
    }, ensure_ascii=False, indent=2))


def cmd_trace_fuse(args):
    trace = IntelTrace.load(args.trace)
    result = trace_fusion(trace, min_branches=args.min_branches)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_trace_assess(args):
    trace = IntelTrace.load(args.trace)
    result = competing_hypotheses_assessment(trace, args.question)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_trace_biases(args):
    trace = IntelTrace.load(args.trace)
    result = detect_cognitive_biases(trace)
    print(json.dumps({"biases_detected": result, "count": len(result)}, ensure_ascii=False, indent=2))


def cmd_trace_status(args):
    trace = IntelTrace.load(args.trace)
    leaves = trace.get_leaves()
    sota = trace.get_sota_node()
    print(json.dumps({
        "question": trace.question,
        "total_nodes": len(trace.hist),
        "leaves": leaves,
        "sota_node": sota,
        "hypotheses": [{"index": i, "hypothesis": n["hypothesis"].hypothesis[:100],
                        "confidence": round(n["hypothesis"].confidence, 3),
                        "evidence_count": len(n["evidences"]),
                        "has_feedback": n["feedback"] is not None}
                       for i, n in enumerate(trace.hist)]
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description='Intel Hypothesis Engine — 假设-反馈闭环')
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_new = sub.add_parser('trace-new', help='创建新假设链')
    p_new.add_argument('--question', required=True)
    p_new.add_argument('--hypothesis', required=True)
    p_new.add_argument('--reason', default='')
    p_new.add_argument('--output', help='输出文件路径')

    p_add = sub.add_parser('trace-add', help='添加证据到假设节点')
    p_add.add_argument('--trace', required=True)
    p_add.add_argument('--source', required=True)
    p_add.add_argument('--evidence', required=True)
    p_add.add_argument('--supports', choices=['true', 'false'], default='true')
    p_add.add_argument('--confidence', type=float, default=0.5)
    p_add.add_argument('--url', default=None)
    p_add.add_argument('--etype', default='osint', choices=['osint', 'humint', 'sigint', 'geo'])
    p_add.add_argument('--node-idx', type=int, default=None)

    p_fork = sub.add_parser('trace-fork', help='从现有节点分叉新假设')
    p_fork.add_argument('--trace', required=True)
    p_fork.add_argument('--hypothesis', required=True)
    p_fork.add_argument('--reason', default='')
    p_fork.add_argument('--parent', type=int, default=None)

    p_sched = sub.add_parser('trace-schedule', help='调度下一步扩展哪条分支')
    p_sched.add_argument('--trace', required=True)
    p_sched.add_argument('--strategy', default='mcts', choices=list(SCHEDULERS.keys()))

    p_fuse = sub.add_parser('trace-fuse', help='多假设链融合')
    p_fuse.add_argument('--trace', required=True)
    p_fuse.add_argument('--min-branches', type=int, default=2)

    p_assess = sub.add_parser('trace-assess', help='竞争性假设评估')
    p_assess.add_argument('--trace', required=True)
    p_assess.add_argument('--question', default=None)

    p_biases = sub.add_parser('trace-biases', help='认知偏差检测')
    p_biases.add_argument('--trace', required=True)

    p_status = sub.add_parser('trace-status', help='查看假设链状态')
    p_status.add_argument('--trace', required=True)

    args = parser.parse_args()

    if args.cmd == 'trace-new':
        cmd_trace_new(args)
    elif args.cmd == 'trace-add':
        cmd_trace_add(args)
    elif args.cmd == 'trace-fork':
        cmd_trace_fork(args)
    elif args.cmd == 'trace-schedule':
        cmd_trace_schedule(args)
    elif args.cmd == 'trace-fuse':
        cmd_trace_fuse(args)
    elif args.cmd == 'trace-assess':
        cmd_trace_assess(args)
    elif args.cmd == 'trace-biases':
        cmd_trace_biases(args)
    elif args.cmd == 'trace-status':
        cmd_trace_status(args)


if __name__ == '__main__':
    main()
