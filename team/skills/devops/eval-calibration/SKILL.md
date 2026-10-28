---
name: eval-calibration
description: 需要离线评估决策/分类质量与置信度校准时用：ECE/Brier/NLL/准确率/三桶路由风险；二分判定另附 Cohen's κ 与假阴性检出率口径（见「一致率口径警示」节）。
version: 0.2.0
license: MIT
metadata:
  hermes:
    tags: [eval, calibration, metrics, reliability]
    derived_from: "jev-skill evals/calibration.py + calibration_metrics.py (MIT, (c) 2026 wuyoscar, rev 9ee07bd)"
---

# 决策校准评估 (eval-calibration)

离线分析「已落盘的决策 receipts」：给定每条记录的预测标签、金标、概率分布，
计算准确率（含无效记录计错口径）、Brier、NLL、10 桶 ECE、Wilson 95% 区间，
以及 0.9/0.7 阈值的三桶路由模拟（auto / stronger_model / human candidate）。
纯 stdlib，零网络调用，零模型调用——只读本地 JSONL，只写本地 JSON。

**不做什么**：不发任何 API 请求（不评测模型本身），不改任何路由线上配置，
路由桶是离线候选标签而非放行动作。

## 何时用

- 有一批 LLM/分类器的决策记录（JSONL），要回答「它自报的置信度可信吗」
- 要为「score >= 0.9 自动通过、>= 0.7 升级复核、否则人工」这类门槛找数据依据
- 上游 jev/clef 类 judge 产出了带概率的 receipts，需要做校准体检

**不用**：需要在线调用模型评测（本 skill 只分析已有记录）；记录无概率分布
（只能出准确率，校准指标为 null）；需要因果分析（本 skill 只有描述统计）。

## 输入格式

每行一个 JSON 对象（receipt）：

```json
{"id": "task:12", "task": "disambiguation_qa", "target": "(A)",
 "prediction": "(A)", "kind": "jev",
 "probabilities": {"(A)": 0.95, "(B)": 0, "(C)": 0.05}, "confidence": 0.93}
```

必填：`id` / `task` / `target` / `prediction`（均非空字符串）。
校准指标必填：`probabilities`（有限 [0,1] 值、和≈1 容差 min(0.05, 0.0051×类数)、
prediction 须为最大概率类）。带 `error` 键的记录=无效尝试（计错、路由到 human）。
无 `probabilities` 的记录（如纯标签输出）只会出准确率统计。

## 怎么跑

```bash
SKILL=~/.hermes/profiles/ops-eval/skills/devops/eval-calibration
# 1) 自检（合成 fixture 手算值 + 捆绑样例，25 断言）
python3 "$SKILL/scripts/selftest.py"
# 2) 分析一批 receipts（jev=按 kind 字段过滤；省略 --kind 分析全部）
python3 -m eval_calibration events.jsonl --kind jev
#    完整报告落盘（含 by_task 切片 + metadata 口径说明）
python3 -m eval_calibration events.jsonl --kind jev --output summary.json
```

`python3 -m` 需在 `$SKILL` 目录下执行（包名 eval_calibration）。
捆绑样例：`assets/sample-events.jsonl`（上游 2026-09-20 真实跑批摘录，12 行）。

## 读数口径（关键）

- **accuracy 分母 = 全部尝试**，无效记录计错；`accuracy_valid` 才是仅有效记录
- **ECE** 只用有效记录的自报 top_probability；confidence 的 ECE 仅为分布形状
  诊断，不是正确性概率
- **路由桶**：top_probability >= 0.9 → auto_candidate；>= 0.7 →
  stronger_model_candidate；否则（含无效）→ human_candidate。bucket 的
  risk = 1 - accuracy，无 oracle 补分
- 空分母返回 null 而非 0；Wilson 区间未做多重比较校正

## Alert subcommand（path-C，2026-10-19 新增）

`scripts/calibrate.py` 与 `python3 -m eval_calibration` 共享同一 CLI：原
`events.jsonl` + `--kind` + `--output` 全部保留；新增 `alert` 子命令，
检测 ECE 漂移。

```bash
python3 ~/.hermes/profiles/ops-eval/skills/devops/eval-calibration/scripts/calibrate.py alert \
    --drift 0.1 \
    --window 7d \
    --baseline 30d \
    --events <events.jsonl>     # 默认 ./events.jsonl
```

退出码（与 cost-ledger 现有惯例一致）：

- 0 = 正常（漂移 < 阈值）
- 1 = 漂移 ≥ 阈值（`[CALIBRATION_DRIFT]`）
- 2 = 脚本崩溃（IO/参数错误）

行为：
1. 在 `--events` JSONL 中按 `created_at` / `started_at` 过滤出 `--window` 范围样本
   作为「窗口集」，`(--window+--baseline, --window]` 范围样本作为「基线集」（两
   区间连续、不重叠，参照 cost-ledger `alert` 的窗口/基线布局）。
2. 对两集合各自跑 `summarize(...)`，取 `top_probability_calibration.ece`。
3. 漂移 = |ECE(window) - ECE(baseline)|；若 ≥ `--drift` → 退出码 1 + 打印
   `[CALIBRATION_DRIFT]` 标记和两段 ECE 数值。

最小用例（绑定样例）：

```bash
SKILL=~/.hermes/profiles/ops-eval/skills/devops/eval-calibration
python3 "$SKILL/scripts/calibrate.py" alert \
    --events "$SKILL/assets/sample-events.jsonl" \
    --window 7d --baseline 30d --drift 0.05
# 样例 ECE=0.0550；窗口集与基线集大小取决于样例时间戳分布；
# 验证只需：rc ∈ {0,1} 且 stdout 含 ECE/window/baseline 三行
```

注：`scripts/calibrate.py` 是 `python3 -m eval_calibration` 的 thin wrapper，
两个入口等价；`scripts/selftest.py` 校验底层 metrics，不依赖 `calibrate.py`。
Alert 子命令本身接受时间戳过滤，缺失/格式错误的 `created_at` 字段记录被丢弃。

## 一致率口径警示（κ 视角，2026-10-21 增补，三账号调研融合）

> 来源：银翼AI评测室连载09（伯克利 54 万次判分体检），存档 `research/wx-onto-ddd-20261021/reports/account3-silverwing-verdict.md` X3。本 skill 已有的 ECE/Brier 校准不豁免本节——「准确率/一致率」类指标在二分判定场景下同样通胀。

**三条强制口径**（二分判定类评估报告必附，缺任一 = 报告不完整）：

1. **二分判定报 Cohen's κ，不只报一致率**：精确匹配一致率不扣随机蒙对基线（κ 通胀：语料实测平均虚高 38.6 个百分点）。两套判定/裁判与金标的一致性必须同时报 κ；κ < 0.6（substantial 下限）时一致率数字不得单独作为放行依据。
2. **假阴性检出率单列**：假阴性检出率（抓错能力）单独报，不许只报真阳性确认率——宽大偏置下裁判点头多摇头少（语料实测真阴性率普遍 <25%），高确认率可能只是裁判不敢判错。真阴性率 <25% 时按「宽大偏置高危」标注。
3. **判定提示词变更 = 裁判换版，须重跑黄金集**：评审/验收提示词（judge prompt）任何变更视为裁判换版——先重跑黄金集复测 κ 与假阴性率，再谈新旧结果对比。禁止直接对比换版前后的一致率数字。

**最稳定 ≠ 最可信**：重测一致性（self-consistency）高只说明裁判输出稳定，不说明它对——校准体检（ECE/Brier）与 κ/假阴性率三面合看，单一指标不放行。

## 陷阱

- `probabilities` 和≈1 但超容差（如四舍五入丢失）→ 整条记录判无效，
  `rounded_sum_count` 会单独计数提示
- confidence=null 的记录从其 ECE/均值中剔除并路由到 human，不是错误
- 上游 receipts 里 base 模型（纯标签）与 jev 模型（带概率）混在同一文件时，
  必须 `--kind` 过滤，否则 base 全进 invalid 拉低口径

## 验证

```bash
SKILL=~/.hermes/profiles/ops-eval/skills/devops/eval-calibration
python3 "$SKILL/scripts/selftest.py"        # 预期: 25 passed, 0 failed, rc=0
cd "$SKILL" && python3 -m eval_calibration "$SKILL/assets/sample-events.jsonl" --kind jev
# 预期首行: records: 6  valid: 6  invalid: 0（样例摘录的 jev 行全有效）
```

上游 160 条全量复现基准（自检口径锚点）：accuracy 0.8500 / Brier 0.2560 /
NLL 0.5974 / ECE 0.0994；auto 桶 118 条 accuracy 0.8898。

## 来源

由 jev-skill 仓 `evals/calibration.py`（229 行）+ `evals/calibration_metrics.py`
（144 行）改造：指标核心字节级保留，剥离 jev SDK/OpenRouter 依赖与冻结采样
协议，新增 JSONL CLI（`__main__.py`）与合成 fixture 自检。上游协议与结论见
其 `evals/CALIBRATION.md` / `CALIBRATION_RESULTS.md`（MIT, (c) 2026 wuyoscar）。
