---
name: llm-quota-fallback-matrix
description: 雷达/情报类报告在 LLM 配额受限（acp 限额 1310、模型降级、rate-limit）时，用确定性规则矩阵替代 LLM 研判段。结构固定（三段：机构×事件轴集中信号 + 每轴 Top 3 + 数据底座声明），输出可读、不可造伪。
applies_to:
  - nightly-intel-radar
  - fin-sentinel
  - domain_nightly
  - 所有「LLM 段缺则报告不像研判」类场景
---

# LLM 限额兜底：规则研判矩阵模板

> 适用：LLM 限流（acp 限额 1310、provider 429）、模型降级、prompt timeout——任何「研判段写不出」的状态。
> 目的：报告仍是研判结构，不是流水单。

## 不可降低的研判骨架（三段缺一不可）

### 段〇 今日研判（人话版 + 数据底座双重声明）

开头必须给三件信息，**让读者一眼分清「这是真研判还是兜底版」**：

```markdown
## 〇、今日研判（规则矩阵版 — LLM 限额 <限额> 兜底）
- **机构集中度**: Top 3 命中 = 银行/bank(245), 支付/pay(25), 清算/clearing(1)
- **事件轴集中度**: Top 3 = unmatched(174条), continuity(76条), security(63条)
- **集中信号**: 12 个「同机构×同轴」簇(≥2 条)
  - 银行/bank × continuity = 47 条
  - 银行/bank × security = 36 条
- **业务连续性**: 76 条实采,含 AWS status / 银行 status 类
- **安全/合规**: 63 条,含安全媒体
- **人事/财务/合作**: 人事 39 | 财务 31 | 合作 17
```

**判据**：若缺这一段，读者会以为后面是流水单——「研判 vs 流水单」的体感差异就在第一屏。

### 段一+二 分桶结构（双轴交叉）

两轴都列：**事件轴** + **机构类别**。缺一个就退化为单维列表。

```markdown
## 一、五事件轴分桶
- continuity: 76 | security: 63 | personnel: 39 | finance: 31 | ma: 17 | unmatched: 174

## 二、机构命中(5类)
- 银行/bank: 245 | 支付/pay: 25 | 清算/clearing: 1 | 卡组织/card: 1 | 电商/ecomm: 9 | cross: 119
```

**判据**：5×2=10 桶结构 + unmatched/cross 留位（说明兜底覆盖率），让读者知道哪些轴/类没料。

### 段三 每轴 Top 3（按置信度）

每事件轴**最多 3 条**（不是全 76 条），按规则打分排：

```python
def score(item):
    base = {"T1": 1.0, "T2": 0.7, "T3": 0.3}.get(item.get("tier", "T2"), 0.5)
    text = item["title"] + " " + item["snippet"]
    n = sum(1 for ws in AXES.values() for w in ws if w.lower() in text.lower())
    return min(1.0, base + 0.05 * n)  # tier + 关键词命中数
```

**判据**：每条标题 + 源标识 + 置信度 + link——三件缺一就退回流水单。

## 数据底座声明（段五，不可省）

报告末尾必须明示三件：

```markdown
## 五、数据底座声明
- **源覆盖**: 30/40 真源已实采,10 个未采（原因：时区窗/日零返回/源 0 items）
- **原料厚度**: Google News snippet 平均 100-150 字符;Fed/ECB 监管稿全文 200+ 字符
- **LLM 段**: 因 <限额> 限额(重置 <时间>)走规则矩阵兜底,研判深度不如 LLM 段
- **建议**: 限额解锁后明晨 loop 自动出 LLM 研判版覆盖今日报告
```

**判据**：底座声明是「兜底版 vs 真研判版」的明确分水岭——不写=伪装成真研判，写=诚实告知读者。

## 关键工程：扫描所有缓存源、不要只看 worker 报数

LLM 段缺时常因为限额——但**原料缓存通常已经写盘**。规则矩阵兜底的关键不是 LLM，是从 fs_<source>_<date>.json 全量合并——worker 自报「3 源 22 条」可能是它刚启动时的快照，**实采可能已经 30 源 400 条**。

```bash
# 合并所有真源缓存（注意排除 fs_items/fs_summary 索引）
for fp in $(ls $WORKSPACE/cache/radar/fs_*_2026-10-19.json | grep -v "fs_items\|fs_summary"); do
  jq -c '.items[]' "$fp" 2>/dev/null
done | jq -s '{items: ., count: length}'
```

**判据**：worker 自报 vs 缓存实采不一致 = worker 还在跑 / worker 用了旧快照。兜底版要取真值。

## 已知 LLM 限额场景

| 限额源 | 现象 | 兜底时机 |
|---|---|---|
| acp provider 限额 1310 | `RateLimitError` / 限额耗尽 | 看 `~/.zcode/cli/db/db.sqlite` model_usage |
| cc-switch 429 串级 | 所有 model 失败 | 看 cc-switch 监控 |
| zcode 免费窗关闭 | 00:00-08:00 外不能走 zcode | 用 `python3 ~/.hermes/bin/zcode_free_window.py` 判窗 |
| provider fallback 链断裂 | model 走不通 fallback | 查 `provider-fallback-chain-management` |

**判据**：检测到任何限额 → 立即判定为「LLM 段不可用」→ 走规则矩阵兜底 → 报告注明重置时间。

## 反模式

- **只列 Top 10 不分桶**：60+ 条目堆一块看着像研判实是流水单
- **不写底座声明**：读者以为是真研判版，被打脸就再不信
- **用 T3 源填充 Top 3**：低权威源当主菜看等于自砸招牌
- **不显式标 unmatched/cross**：让人误以为规则覆盖全，反而怀疑规则本身
- **没合并所有缓存就用 worker 自报数**：少 5-10 倍条目，「集中信号」出不来
- **不判机构×事件轴集中度**：单维看像 Top N，交叉看才发现银行 × continuity 47 条共振——这是真研判与真流水单的核心分水岭

## 与 LLM 真研判版的差异

| 维度 | LLM 真研判版 | 规则矩阵兜底版 |
|---|---|---|
| 今日态势自然语言段 | ✓（3-5 句人话） | ✗（只有统计句） |
| 跨条目因果串联 | ✓（事件 A 引致 B） | ✗（只能按簇报） |
| 反事实/假设 | ✓ | ✗ |
| 数字精确度 | ±5% | 精确（基于规则计数） |
| 可信度声明 | "本版基于 LLM" | "本版基于规则矩阵，<限额> 重置后覆盖" |
| 适用窗口 | 限额解锁时 | 限额期内 |

**两版都出后用户能比较研判深度**——这是兜底版的最大价值：让用户看清 LLM 研判到底比规则矩阵多什么，避免「LLM 段是个装饰」的错觉。
