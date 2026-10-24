---
name: worldmonitor-intel
description: 全球情报分析算法集——Keyword Spike 突增检测、News Clustering 聚类去重、Geo Convergence 地理汇聚、Focal Point 焦点检测、Hotspot Escalation 热度评分、Hypothesis-Feedback 假设闭环(迁移自RD-Agent)、Trace DAG 多假设并行探索、Trace Fusion 多源融合、竞争性假设评估ACH、认知偏差检测。源移植自 worldmonitor (AGPL-3.0) + RD-Agent (MIT) + TradingAgents + FundaPod。适用于调研任务的信息突增判断、多源去重合并、热点追踪、情报假设验证闭环。
version: 2.0.0
author: Hermes Agent (orchestrator)
license: AGPL-3.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, intelligence, osint, analysis]
    category: research
    source: worldmonitor
---

# WorldMonitor 情报分析算法集

> 来源：https://github.com/koala73/worldmonitor（AGPL-3.0）
> 移植：5 个核心分析算法，从 TypeScript 核心模块移植为纯 Python（无依赖，stdlib only）

## 触发条件

- 调研任务需要判断"某话题是否正在发酵/突增"
- 多源调研结果需要去重合并（同一事件的多个报道）
- OSINT 任务需要检测多域事件在同一实体/地点的汇聚
- 需要给调研主题做热度评分和趋势追踪

## 算法 1：Keyword Spike 检测（关键词突增）

**原理**：某词在近期窗口的出现频率显著高于其自身历史基线。

**参数**（源自 worldmonitor 默认值）：
- `rolling_window = 2h`（近期窗口）
- `baseline_window = 7d`（基线窗口）
- `min_spike_count = 5`（最低出现次数，防低频词误报）
- `spike_multiplier = 3`（必须超过基线 3 倍）
- `min_source_count = 2`（必须 ≥2 个不同来源，防单一来源刷量）
- 无基线时退化为纯频率计数（需标注）

```python
def detect_keyword_spikes(stories, keyword, rolling_window_ms=2*3600*1000,
                          baseline_window_ms=7*24*3600*1000,
                          min_spike_count=5, spike_multiplier=3,
                          min_source_count=2):
    """stories: [{title, source, timestamp_ms}]"""
    now = max(s['timestamp_ms'] for s in stories)
    rolling = [s for s in stories if now - s['timestamp_ms'] <= rolling_window_ms]
    baseline = [s for s in stories if now - s['timestamp_ms'] <= baseline_window_ms]
    kw_lower = keyword.lower()
    roll_hits = [s for s in rolling if kw_lower in s['title'].lower()]
    base_hits = [s for s in baseline if kw_lower in s['title'].lower()]
    roll_count = len(roll_hits)
    base_rate = len(base_hits) / max(1, baseline_window_ms / rolling_window_ms)  # 归一化到滚动窗口
    if roll_count < min_spike_count:
        return {'spike': False, 'reason': f'count {roll_count} < floor {min_spike_count}'}
    sources = len({s['source'] for s in roll_hits})
    if sources < min_source_count:
        return {'spike': False, 'reason': f'sources {sources} < {min_source_count}'}
    if base_rate > 0 and roll_count >= base_rate * spike_multiplier:
        return {'spike': True, 'count': roll_count, 'baseline_rate': base_rate,
                'multiplier': roll_count / max(base_rate, 0.001), 'sources': sources}
    if base_rate == 0:  # 无基线 → 纯频率计数
        return {'spike': roll_count >= min_spike_count, 'count': roll_count,
                'note': 'no baseline, frequency-only', 'sources': sources}
    return {'spike': False, 'reason': f'count {roll_count} < {base_rate * spike_multiplier:.1f}'}
```

**实体形状识别**（自动标记为高价值关键词）：
- `CVE-\d{4}-\d{4,}`（漏洞编号）
- `APT\d+`（高级持续性威胁组织）
- `FIN\d+`（金融威胁组织）
- 领导人人名表（putin/zelensky/xi jinping/trump...）

## 算法 2：News Clustering（新闻聚类去重）

**原理**：Jaccard 相似度聚类，将同一事件的多个报道合并为一个簇。

**参数**：
- `similarity_threshold = 0.45`（Jaccard 相似度阈值，worldmonitor 用 ~0.45）
- 威胁等级优先级：critical > high > medium > low > info

```python
def jaccard_similarity(a, b):
    ta, tb = set(a.lower().split()), set(b.lower().split())
    if not ta or not tb: return 0.0
    return len(ta & tb) / len(ta | tb)

def cluster_news(items, threshold=0.45):
    """items: [{title, source, url, timestamp_ms}] → [{titles, sources, size}]"""
    clusters = []
    for item in items:
        placed = False
        for c in clusters:
            rep_title = c['titles'][0]
            if jaccard_similarity(rep_title, item['title']) >= threshold:
                c['titles'].append(item['title'])
                c['sources'].add(item['source'])
                c['size'] += 1
                placed = True
                break
        if not placed:
            clusters.append({'titles': [item['title']], 'sources': {item['source']}, 'size': 1})
    clusters.sort(key=lambda c: c['size'], reverse=True)
    return clusters
```

**使用场景**：
- 调研子 agent 返回 50 条新闻 → 聚类成 ~10 个独立事件
- 每个簇保留代表标题 + 来源列表 → 报告只写一次，引用多源

## 算法 3：Geo Convergence（地理汇聚检测）

**原理**：同一地理区域（cell）内，短时间内出现 ≥3 个不同领域的事件 → 告警。

**参数**：
- `convergence_window = 24h`
- `convergence_threshold = 3`（不同领域数）
- 领域：protest / military_flight / military_vessel / earthquake

```python
def geo_convergence(events, threshold=3, window_ms=24*3600*1000):
    """events: [{lat, lon, type, timestamp_ms}] → 汇聚告警列表
    type ∈ {protest, military_flight, military_vessel, earthquake}"""
    now = max(e['timestamp_ms'] for e in events)
    CELL_SIZE_DEG = 2.0  # ~200km at equator
    cells = {}
    for e in events:
        if now - e['timestamp_ms'] > window_ms: continue
        cx, cy = int(e['lat'] // CELL_SIZE_DEG), int(e['lon'] // CELL_SIZE_DEG)
        key = (cx, cy)
        cells.setdefault(key, set()).add(e['type'])
    alerts = []
    for (cx, cy), types in cells.items():
        if len(types) >= threshold:
            alerts.append({
                'cell': (cx, cy),
                'center_lat': (cx + 0.5) * CELL_SIZE_DEG,
                'center_lon': (cy + 0.5) * CELL_SIZE_DEG,
                'domains': sorted(types),
                'domain_count': len(types),
                'score': len(types) / 5.0  # 归一化 0-1
            })
    return sorted(alerts, key=lambda a: -a['score'])
```

**使用场景**：
- OSINT 目标在某地同时出现军事活动 + 网络中断 + 抗议 → 高关注区域
- 调研某冲突地区时，检测多域事件汇聚

## 算法 4：Focal Point（焦点实体检测）

**原理**：实体出现在多个独立情报流中 → 标记为焦点，按覆盖流数分级。

**参数**：
- 紧急度分级：watch（1-2 流）/ elevated（3-4 流）/ critical（≥5 流）

```python
def detect_focal_points(entity_mentions):
    """entity_mentions: {entity: {stream: count}} → 焦点实体列表
    stream ∈ {news, military, geo, cyber, economic, social}"""
    focal = []
    for entity, streams in entity_mentions.items():
        active_streams = [s for s, c in streams.items() if c > 0]
        n = len(active_streams)
        if n >= 5: urgency = 'critical'
        elif n >= 3: urgency = 'elevated'
        elif n >= 1: urgency = 'watch'
        else: continue
        focal.append({
            'entity': entity,
            'streams': active_streams,
            'stream_count': n,
            'urgency': urgency,
            'total_mentions': sum(streams.values())
        })
    return sorted(focal, key=lambda f: f['stream_count'], reverse=True)
```

**使用场景**：
- 调研公司 X：X 出现在新闻 + 专利 + 招聘 + 供应链 4 个流 → elevated，优先深挖
- 情报分析：目标实体在多流活跃 = 高价值关注对象

## 算法 5：Hotspot Escalation（热度升级评分）

**原理**：四维加权合成热度分，与静态基线混合。

**参数**：
- 权重：news 35% + cii 25% + geo 25% + military 15%
- 混合：动态 30% + 静态基线 70%
- 输出：1-5 升级刻度

```python
def escalation_score(news_activity=0, cii_score=None, geo_alert=0,
                     military_activity=0, static_baseline=1.0,
                     weights=None):
    """每维输入归一化 0-100 → 合成 0-100 → 1-5 刻度"""
    weights = weights or {'news': 0.35, 'cii': 0.25, 'geo': 0.25, 'military': 0.15}
    def norm(v, max_v=100): return min(100, max(0, v)) / max_v * 100
    components = {
        'news': norm(news_activity),
        'cii': norm(cii_score) if cii_score is not None else 0,
        'geo': norm(geo_alert),
        'military': norm(military_activity),
    }
    dynamic = sum(components[k] * w for k, w in weights.items())
    combined = dynamic * 0.3 + static_baseline * 70  # 动态30% + 静态基线70%
    scale = 1 if combined < 20 else 2 if combined < 40 else 3 if combined < 60 else 4 if combined < 80 else 5
    return {
        'dynamic_score': round(dynamic, 1),
        'combined_score': round(combined, 1),
        'scale': scale,
        'components': {k: round(v, 1) for k, v in components.items()}
    }
```

**使用场景**：
- 调研主题热度追踪：新闻频率 + 讨论量 + 实体聚焦 + 事件数 → 1-5 分
- 多天对比跟踪热度趋势

---

## 快速使用示例

```python
# 1. 关键词突增检测
spike = detect_keyword_spikes(stories, "Taiwan strait")
if spike['spike']:
    print(f"⚠️ {spike['count']} 条新闻来自 {spike['sources']} 个来源，基线 {spike['baseline_rate']:.1f}，倍数 {spike['multiplier']:.1f}")

# 2. 多源去重
clusters = cluster_news(items, threshold=0.45)
print(f"{len(items)} 条新闻 → {len(clusters)} 个独立事件")

# 3. 焦点实体
focal = detect_focal_points(entity_mentions)
for f in focal:
    if f['urgency'] == 'critical':
        print(f"🔴 {f['entity']}: {f['streams']}")

# 4. 热度评分
score = escalation_score(news_activity=80, cii_score=45, geo_alert=60, military_activity=30)
print(f"热度 {score['scale']}/5 (动态 {score['dynamic_score']}, 合成 {score['combined_score']})")
```

## Pitfalls（从 worldmonitor 源码学到的教训）

1. **无基线退化为频率计数**：新词无 7 天基线时，spike 检测退化为 `count >= floor`，必须标注"无基线"避免误读
2. **单一来源不能算 spike**：`min_source_count=2` 防止一个刷量媒体制造假突增
3. **Jaccard 对短标题敏感**：标题 <5 词的相似度不稳定，聚类时优先比较代表标题
4. **地理 cell 边界效应**：事件恰好在 cell 边界时可能分到不同 cell，用重叠网格（offset half cell）缓解
5. **热度评分是相对值**：1-5 刻度只在同主题纵向对比时有意义，跨主题直接比较会误导

---

## 算法 6-10：假设-反馈闭环引擎（v2.0 新增）

> 迁移自 RD-Agent (microsoft/RD-Agent, MIT) + TradingAgents + FundaPod + CIA ACH 方法论
> 实现文件: `scripts/intel-hypothesis-engine.py`（纯 stdlib，无依赖）

### 触发条件（v2.0 新增）

- 调研任务需要验证一个假设（而非仅收集信息）→ 用假设-反馈闭环
- 同一情报问题存在多个竞争假设 → 用 Trace DAG 并行探索
- 多个分析师/多源调研结果需要综合 → 用 Trace Fusion
- 担心分析中存在认知偏差（confirmation bias等）→ 用认知偏差检测
- 需要对情报结论做正式评估 → 用竞争性假设评估(ACH)

### 算法 6：Hypothesis-Feedback 闭环（迁移自 RD-Agent）

**原理**：情报分析不是"数据→结论"的单向流，而是"假设→证据→评估→修正假设"的闭环。评估器不仅评判当前假设，还**主动建议下一个假设方向**（`new_hypothesis` 字段），形成双向耦合。

**核心数据结构**：

```python
class IntelFeedback:
    hypothesis_id: str        # 评估的假设
    decision: bool            # 假设是否被证据支持
    observations: str         # 观察到的事实
    hypothesis_evaluation: str # 对假设的评判
    new_hypothesis: str       # ★ 评估器建议的下一个假设方向（双向耦合）
    biases: list              # 触发的认知偏差（与 cognition-lattice 集成）
    confidence_delta: float   # 置信度变化量
```

**与 RD-Agent 的映射**：
- RD-Agent `HypothesisFeedback.new_hypothesis` → `IntelFeedback.new_hypothesis`
- RD-Agent `HypothesisFeedback.decision` → `IntelFeedback.decision`
- RD-Agent `HypothesisFeedback.observations` → `IntelFeedback.observations`

### 算法 7：Trace DAG + Multi-Trace（迁移自 RD-Agent）

**原理**：对同一情报问题维护多条假设链，DAG 结构支持分叉(NEW_ROOT)/合并(fusion)。4种调度器决定"下一步扩展哪条分支"。

**调度器**（迁移自 RD-Agent `trace_scheduler.py`）：

| 调度器 | 策略 | 适用场景 |
|--------|------|---------|
| `RoundRobinScheduler` | 轮询各叶子，优先创建新分支 | 基础并行 |
| `SOTABasedScheduler` | 偏好最优假设分支 | 利用优先 |
| `MCTSScheduler` | PUCT: `Q(s,a) + c_puct·P(s,a)·√N/(1+N(s,a))` | AlphaGo式探索-利用平衡 |
| `DiversityScheduler` | MCTS + Sibling Diversity强制差异化 | 防confirmation bias |

**Sibling Diversity 机制**（迁移自 RD-Agent `diversity_strategy.py`）：
并行分支必须探索不同方向，`get_available_directions()` 返回未被探索的方向，避免多假设链同质化。

### 算法 8：Trace Fusion（迁移自 RD-Agent）

**原理**：多假设链后期融合，不是简单投票，而是找"与主流判断差异最大但仍有证据支持"的分支融合（互补潜力最大）。

```python
# 迁移自 RD-Agent merge.py: get_exp_index 的 min(abs(final_score - sota_score))
sota_idx, sota_conf = scored[0]  # 最优分支
# 找与 SOTA 分数差最小的分支——最有互补潜力
best_merge_idx = min(scored[1:], key=lambda x: abs(x[1] - sota_conf))
```

### 算法 9：竞争性假设评估 ACH（融合 TradingAgents + FundaPod + CIA）

**原理**：融合三种范式——TradingAgents Bull/Bear对抗检测 + FundaPod独立优先评估 + CIA Psychology of Intelligence Analysis ACH方法论。

**流程**：
1. 各假设**独立评估**（FundaPod独立优先范式），不通信
2. 加权评分: `support_score - oppose_score`，证据可信度×数量衰减
3. 识别分歧最大的假设对（Bull/Bear对抗检测: `max_disagreement`）
4. 综合判断: 不是简单投票，而是根据支持/反对/悬而未决的数量决定综合策略

### 算法 10：认知偏差检测（与 cognition-lattice 集成）

**原理**：检测假设链中的认知偏差，与 `cognition-lattice` 的 239 条认知偏差知识库集成。

**可检测偏差**：

| 偏差 | 检测条件 | 缓解建议来源 |
|------|---------|------------|
| `confirmation_bias` | 只收集支持证据，无反对证据且≥5条 | Red Team思维 + FundaPod独立优先 |
| `anchoring` | 初始置信度>0.8且未被证据显著调整 | 贝叶斯更新 |
| `availability_heuristic` | 所有证据来自同一来源 | worldmonitor focal_point多流检测 |
| `groupthink` | 多假设链方向高度同质（trace级别） | DiversityScheduler强制差异化 |

### 快速使用示例（v2.0 新增）

```bash
# 1. 创建假设链
python3 intel-hypothesis-engine.py trace-new \
  --question "X国军事调动意图评估" \
  --hypothesis "X国是针对Y国的威慑" \
  --output /tmp/intel_trace.json

# 2. 添加支持/反对证据
python3 intel-hypothesis-engine.py trace-add --trace /tmp/intel_trace.json \
  --source "卫星图像" --evidence "装甲部队集结规模超去年3倍" \
  --supports true --confidence 0.8 --etype geo

python3 intel-hypothesis-engine.py trace-add --trace /tmp/intel_trace.json \
  --source "外交声明" --evidence "X国称为例行演习" \
  --supports false --confidence 0.6 --etype osint

# 3. 分叉竞争假设
python3 intel-hypothesis-engine.py trace-fork --trace /tmp/intel_trace.json \
  --hypothesis "X国是防御性部署应对Z国" --parent 0

# 4. MCTS调度下一步
python3 intel-hypothesis-engine.py trace-schedule --trace /tmp/intel_trace.json --strategy mcts

# 5. 多假设链融合
python3 intel-hypothesis-engine.py trace-fuse --trace /tmp/intel_trace.json

# 6. 竞争性假设评估(ACH)
python3 intel-hypothesis-engine.py trace-assess --trace /tmp/intel_trace.json

# 7. 认知偏差检测
python3 intel-hypothesis-engine.py trace-biases --trace /tmp/intel_trace.json
```

## Pitfalls（v2.0 新增：假设闭环引擎）

6. **--supports 参数必须用字符串 'true'/'false'**：argparse `type=bool` 会把 `'false'` 解析为 `True`（非空字符串均为真），必须用 `choices=['true','false']` 再手动转换
7. **MCTS 无反馈时退化为置信度优先**：`node_visit_count` 为 0 时 `Q=0`，PUCT 退化为 `c_puct·P·√N_parent`，等价于按置信度选叶子
8. **Trace Fusion 需≥2条叶子分支**：单链无法融合，需先 `trace-fork` 创建竞争假设
9. **认知偏差检测是启发式非确定性**：`confirmation_bias` 的阈值(≥5条纯支持证据)可根据场景调整，不可作为唯一依据
10. **ACH 评分的衰减系数 0.1**：`support_score = sum(confidence) * (1 - 0.1*(count-1))`，防止大量低质证据堆砌高分，可根据情报类型调整
