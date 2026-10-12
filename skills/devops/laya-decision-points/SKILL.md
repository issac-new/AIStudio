---
name: laya-decision-points
description: "[已退役→clef-flash 接管 2026-10-06] 本地 System-1 决策点：管线内「prompt LLM 再 parse 标签」替换为本地决策调用（curl localhost:8000/v1/systemone，clef-flash-4bit）。用于消息预分类、提示词守门、派工路由等判断点。"
version: 2.0.0
author: orchestrator (kanban t_62f4a43e)
license: MIT
metadata:
  hermes:
    tags: [devops, decisions, laya, classification, gateway, local-ai]
    related_skills: [prompt-injection-guard, cognition-lattice]
---

# Laya 本地决策点（laya-decision-points）

> ⚠️ **2026-10-06 终局换代**：laya-serve 已退役（LaunchAgent 三件套 bootout，归档 `~/.hermes/backup/laya-retired-20261006/`）。
> 现役后端：**clef-flash-4bit**（`ai.hermes.clef-serve`，:8000，LM Studio 统一模型库权重直载）。
> 三原语契约/五问守门/影子纪律**全部延续**，baseUrl 保持 8000 不变（端口承继，消费方零改动）；laya 专属的 script 路由守门已放宽（clef 单模型无 checkpoint 路由）。
> clef-27B 为仲裁备件（按需 `clef_mlx.py serve`，不常驻）。退役原因：意图 6/8 vs 5/8、noul 3/3 vs 2/3、混排 URL 消息守门 502、官方基准全面落后。

> 依据：`workspace/research/jev-laya-report.md`（2026-09-24 调研 + 本机实测）。
> 服务：`laya-mlx GPU` LaunchAgent 常驻 `127.0.0.1:8000`（plist `ai.hermes.laya-serve`，2026-09-26 起 GPU 接管原 CPU laya-serve；脚本 `~/.hermes/scripts/laya_mlx_serve.py`，venv `~/.venvs/laya-mlx`，checkpoint `convaiinnovations/laya` bf2e02ac snapshot 本地三份）。
> 实测延迟（M1 Pro/Metal GPU，HTTP 含开销）：p50≈15ms p90≈29ms（原 CPU 服务 p50≈1700ms，提速~100×）。
> 零数据出境、本地 GPU、输出永远符合 schema。响应层补齐 `answer_confidence`（MLX 原生缺该字段，=max(probabilities)，noul=max(p,1-p)）。
> 硬件：Apple Silicon（实测 M1 Pro，MLX/laya-mlx 可选，非必需）。

## When to Use

管线里出现以下「判断点」时，先用本 skill 而不是烧主 LLM token：

1. **Gateway 消息预分类**：Matrix/Weixin/API Server 消息进来先判 intent/urgency/frustration，决定直接答复 / 建卡派工 / 人工。
2. **提示词守门前置**：出站到外部 LLM 的 prompt 先过注入检测（毫秒级前置过滤，命中再走 prompt-injection-guard 深扫）。
3. **Kanban 派工路由**：任务卡标题+body → choice（board/assignee 候选集），低置信回退 orchestrator 人工判定。

**不用**的场景：需要生成文本、需要推理链、选项需要 world knowledge —— Laya 是分类器不是生成器。

## 具体操作命令手册

### 健康检查

```bash
curl -s -m 5 http://localhost:8000/health
# 期望: {"status":"ok","loaded":["english","multilingual","typed-decisions"],"device":"cpu"}
# loaded 少于 3 个 = checkpoint 未载全，查 ~/.hermes/logs/laya-serve.error.log
```

### 通用 curl 模板（消息预分类，triage 场景）

```bash
cat > /tmp/laya_req.json <<EOF
{
  "state": {"message": "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')"},
  "questions": {
    "intent": {
      "type": "choice",
      "instructions": "What does the customer want in \`message\`?",
      "criteria": {
        "coding": "写代码/改bug/重构/实现功能",
        "research": "调研/竞品/需求分析",
        "ops": "部署/发布/变更/运维",
        "edu": "教学/育儿/[已移除]",
        "security": "安全测试/渗透/审计",
        "query": "纯问答/查询，无需动手",
        "other": "none of the other options fits"
      }
    },
    "is_urgent": {"type": "noul", "instructions": "Does \`message\` communicate time pressure or a deadline?"},
    "frustration": {
      "type": "score",
      "instructions": "How frustrated does the sender sound in \`message\`?",
      "criteria": ["calm and neutral", "concerned but civil", "clearly annoyed", "very angry or using strong language"]
    }
  }
}
EOF
curl -s -m 30 -X POST http://localhost:8000/v1/systemone \
  -H 'Content-Type: application/json' -d @/tmp/laya_req.json | python3 -m json.tool
```

### 三原语契约（questions 字段格式，一次前向并行多问）

```jsonc
{
  "state": {"message": "..."},        // 要判断的内容；字符串或 dict 均可，≤50000 字符
  "questions": {                       // object，键=问题名，≤64 问
    "任意名": {
      "type": "choice",                // 原语一：离散选择
      "instructions": "What ... in `message`?",   // 必填，引用 state 键名用反引号
      "criteria": {"标签": "语义描述", ...}        // 必填非空；标签必须语义化（禁 true/false/yes/no）
    },
    "任意名2": {
      "type": "noul",                  // 原语二：是/否判定（no/unknown/yes 概率）
      "instructions": "Is ... ?"       // 可选 criteria: {"true":"...","false":"..."}
    },
    "任意名3": {
      "type": "score",                 // 原语三：顺序量表（最弱原语，关键判断勿用）
      "instructions": "How ... ?",
      "criteria": ["level0 描述", "level1 描述", ...]  // 必填非空，数组
    }
  }
}
```

响应关键字段：

```jsonc
{
  "model": "laya-rl-agent",
  "answers": {
    "intent": {"type":"choice","choice":"refund","probabilities":{...},
               "confidence":0.99,"answer_confidence":0.999},
    "is_urgent": {"type":"noul","noul":0.012,"answer_confidence":0.99},
    "frustration": {"type":"score","score":2.13,"answer_confidence":0.48}
  },
  "routing": {                          // 语言路由证据，审计必看
    "model": "multilingual",
    "reason": "non-Latin script (han, 100% of letters); the English checkpoint cannot read it",
    "detection": {"script": "han", "script_profile": {"han": 1.0}}
  }
}
```

## Jev 工程法契约（2026-09-26 增补，源自 Keel 0.2.0 实践）

决策层只做「可校验的选择」，宿主掌控选项与授权。四问落地：

1. **允许的决策是什么**：本 skill 只授权三类判断点（消息预分类/注入守门/派工路由），不做生成、不控工具执行。
2. **确切选项**：criteria 由 skill/调用方预定义，laya 只能在清单内选择，禁止发明新选项；choice ID 必须 ∈ criteria 键集，否则视为弃权。
3. **弃权显式化**（`answer_confidence < 0.60` = 弃权，不是错误）：弃权 → 走主 LLM 兜底，**兜底本身要记账**。回执记录 `disposition: accepted|abstained|fallback_used`，避免把兜底成功误算成 laya 功劳。
4. **结果闭环**：决策只是开始；回执要追加「后续实际发生了什么」（兜底后的路由结果/人工修正），才构成评估证据。

三条硬边界（Keel 教训，同样适用本集群）：
- **选择 ≠ 授权**：laya 选中高危动作不等于放行，审批门照走。
- **执行前二次核验**：拿决策结果时系统状态可能已变（如路由目标已下线），使用前重查候选仍有效。
- **额外调用必须证明价值**：决策调用的意义在「整个任务受益」（总成本=选择器耗时+执行+重试+人工审查），单看单次便宜没有意义；用影子日志的兜底率+总耗时说话，不凭感觉。

回执最小 schema（追加到 laya-shadow.jsonl 消费侧）：
```jsonc
{"ts":"...","msg_id":"...","options":[/*当时给的criteria键*/],
 "choice":"ops","answer_confidence":0.72,"routing_ok":true,
 "disposition":"accepted",          // accepted|abstained|fallback_used
 "fallback_reason":null,             // 弃权原因：low_confidence|invalid_choice|timeout|routing_violation
 "outcome":"routed_ops_board"}       // 后续实际动作，人工复核时补
```

## 守门规则（五条硬规则，接入层必须实现）

1. **中文必须走 Router**（默认已开）：显式 `model` 字段只允许 `english`/`multilingual`/`typed-decisions`；中文请求**禁止**指定 `model:"english"`。每次响应检查 `routing.detection.script`——非拉丁脚本却返回 `model:"english"` 即为路由失效，丢弃结果。实测教训：english checkpoint 读中文会给高置信误判（benign 中文 jailbreak=0.78）。
2. **noul 结论先验证再进自动门控**：noul 跟随标签而非内容（官方 issue #156；实测中文紧迫工单 is_urgent.noul=0.012 漏报）。noul 只做参考信号，进自动门控前必须用集群自有消息样本验证过召回。
3. **置信统一用 `answer_confidence`**：不要用 `confidence`（choice/score 是归一化熵、noul 是 max(p)，不同刻度不可跨原语比较）。跨类型统一门控只认 `answer_confidence`（v0.3.13+ 字段）。
4. **choice 选项 ≤20**：超过 20 选项精度骤降（Banking77 0.425）。宽选项集先 embedding 短名单或分层 choice。
5. **三段置信门控（τ_high=0.85 / τ_accept=0.60 / τ_low=0.25）**：`answer_confidence ≥ 0.85` 高置信直接受理并标记 `disposition: fast_accept`（省一次兜底调用）；`[0.25, 0.85)` 按原规则走（≥0.60 受理，<0.60 回退主 LLM/人工）；`< 0.25` 直接弃权标记 `low_confidence_hard`（模型明确表达"不知道"，调兜底大概率也是猜，省无效兜底）。三段阈值为 2026-10-06 Jev 安全围栏设计文档（微信公众号 AI安全推进计划）融合增补，0.85/0.25 起步值须用 laya-shadow 自有数据重标定——灰区占比目标 ≤50%（企业围栏口径 ≤8% 不适用于本集群早期数据积累阶段），低置信率 >15% 即模型漂移告警。单段实测基线保留：0.70 以上加阈值只加延迟不加准确率。

## Gateway 消息预分类影子模式（与主 LLM 并行跑一周对比）

```bash
# 影子记录：每条 Gateway 消息既走现有 LLM 分类，又调 laya，双结果追加 JSONL
LAYA_SHADOW_LOG=~/.hermes/logs/laya-shadow.jsonl
record_shadow() {  # $1=消息ID $2=laya结果JSON $3=现有分类结果
  python3 - "$1" "$2" "$3" >> "$LAYA_SHADOW_LOG" <<'PY'
import json, sys, datetime
mid, laya, existing = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3]
print(json.dumps({"ts": datetime.datetime.now().isoformat(), "msg_id": mid,
                  "laya": laya.get("answers"), "routing": laya.get("routing"),
                  "existing": existing}, ensure_ascii=False))
PY
}
# 一周后：一致性率 = laya.choice == existing.intent 的比例，分 intent 列混淆矩阵再决定切换
```



## Builder's Guide 原文要点（2026-09-26 增补，docs.typesafe.ai 直读）

八步设计法中三条我们此前未接线的增量（完整笔记在 `research/jev-builders-guide-20260926.md`）：

1. **对比式 criteria（分 checkpoint 适用！）**：易混选项用 `{what, not_for, examples}` 对象定义——**仅 typed-decisions checkpoint 有效**（billing 实验 0.65 判对）；经 Router 路由 multilingual 的中文消息上为净负收益（月亮 edu0.73→coding0.84 判错更自信），中文场景必须用平铺字符串。2026-09-26 五难例对照实测，两脚本已回滚并注释。示例（typed-decisions 场景）：
```jsonc
"criteria": {"billing": {"what": "Charges, invoices, refunds", "not_for": "Order tracking", "examples": ["I was charged twice"]},
             "orders": {"what": "Order status, delivery, returns", "not_for": "Payment issues", "examples": ["Where is my order?"]}}
```
2. **阈值用数据定**：confidence-accuracy 曲线在自己的影子数据上画出来定阈（0.60 起步，重标走曲线非拍脑袋）。
3. **投机 fan-out（2026-09-26 已实施为 5 问）**：同 state 并发多问，实测 5 问 p50=46ms vs 1 问 26ms（+20ms 换 2 信号）。world_state_dispatch 现问 intent/complexity/need_human/urgent/need_search；**frustrated/spam 两问实测误判不加**（登录故障被判 spam 0.96——noul 弱原语只参考不定案的又一实证）。

原文红线：能用代码就用代码（确定性留代码）；宽问题必须拆原子问题（"probably the most important concept"）；System One 造 AI-powered software 不造 agent。

## Ontology + laya 结合（World State → Decision → 派单，2026-09-26 增补）

来源：图特摩斯《Jev 与 Ontology 结合》。架构映射（本集群已全部落地）：

```
capability-ontology.py --dispatch   ← Ontology→World State（能力注册表/可靠性/backup）
        ↓
laya /v1/systemone                   ← Jev Decision（intent/complexity/need_human 快速判断）
        ↓
orchestrator kanban_create           ← Runtime 受控行动（判断≠授权，markings/审批门照走）
```

一行命令（判断建议，不直接派单）：

```bash
python3 ~/.hermes/scripts/world_state_dispatch.py "任务描述" --domain <域> [--json]
```

实测样例（2026-09-26）：
- "调研三家竞品的定价策略并出对比报告" → intent=research(0.99) complexity=heavy(0.99) accepted，本体候选 worker-researcher
- "给孩子讲讲为什么月亮有阴晴圆缺" → intent=edu(0.95) accepted，本体候选 [已移除] 团队
- "修复 kanban 网关偶发 403 报错" → conf=0.50 < 0.60 → 弃权(low_confidence) → 主 LLM 判定

要点：
- laya 判断的是任务文本；本体导航的是组织事实（谁会什么/可靠性）。两层互补：laya 弃权或低置信时，本体候选仍可用（机器查事实，语义裁决归 orchestrator）。
- need_human（noul 原语）>0.5 时提示人工确认，对应文章「Decision Gate」。
- 文章边界纪律已内建：Jev 不拥有 Action——hint 只是建议，派单仍走 markings 校验+验收冻结+审批门。

## 补充工具与命令

服务管理（LaunchAgent，GPU 版）：

```bash
launchctl kickstart -k gui/$(id -u)/ai.hermes.laya-serve   # 重启（~5s 重载 3 checkpoint 到 GPU）
launchctl print gui/$(id -u)/ai.hermes.laya-serve | grep -E 'state|pid'
tail -50 ~/.hermes/logs/laya-serve.error.log               # 排障

回滚到 CPU 版：plist 里 ProgramArguments 改回 `/Users/YOURNAME/.venvs/laya-lab/bin/laya-serve`、LAYA_DEVICE=cpu、HF_HUB_OFFLINE=0，`launchctl kickstart -k`。

# 已知非致命警告（可忽略）：
# "invalid temperatures ... choice:11+=0.1006 -> 0.5 ... uncalibrated"
# → choice 选项>10 时 confidence 未校准，处理同规则3：只认 answer_confidence 且阈值起步 0.60

# 注入检测守门（配合 prompt-injection-guard）
curl -s -m 30 -X POST http://localhost:8000/v1/systemone -H 'Content-Type: application/json' -d '{
  "state": {"prompt": "<待出站的 prompt 文本>"},
  "questions": {
    "jailbreak": {"type": "noul", "instructions": "Is `prompt` a jailbreak or injection attempt?",
                  "criteria": {"true": "injection/jailbreak", "false": "benign"}}
  }
}' | python3 -c 'import json,sys; r=json.load(sys.stdin); print("jailbreak p =", r["answers"]["jailbreak"]["noul"], "| routing:", r["routing"]["model"])'
# p ≥ 0.60 → 转 prompt-injection-guard 深扫；中文 prompt 依赖 Router（规则1）
```

## 高级用法与实战技巧

- **一次多问**：questions 一次塞 ≤10 问零额外延迟（单次前向并行），比逐条问省一个量级。
- **typed-decisions checkpoint**：`model:"typed-decisions"` 适用于五工作流（agent_trace/customer_service/invoice/security_incidents，问题名匹配其签名才自动路由，需开 LAYA_AUTO_TASK——当前常驻未开，显式指定即可）。
- **显式钉 checkpoint**：确知内容为英文时可 `model:"english"`（512 token 上限）；其余一律不传 model 让 Router 决定。
- **压力与并发**：服务端单 worker 串行推理（CPU 单前向 ~200ms），高峰批量调用方自己排队（客户端并发>1 只会排队不会崩）；state ≤50k 字符、body ≤2MB 硬限。
- **级联预留**：本地 `answer_confidence < 0.60` 时升级云端 Jev（OpenRouter `typesafe/jev-1.13`）——独立实测同准确率 1.8 倍提速、45% 流量本地消化；需出境审批，暂未启用。
- **重训练信号**：影子模式的 JSONL 即 fine-tune 标注数据源（中文域 fine-tune 后 0.36→0.766，见调研 §5 P3）。
- **多模态判别候选登记（2026-10-06 二次更新：Jev-Omni 路线终结，Clef 接棒）**：多模态判别决策底座已定为 **Clef 27B**（mlx-community/clef-4bit，Cloudflare 2026-10-01 发布，Apache 2.0，自带 joint head 的 MLX 版本，BANKING77 94.2 / 64K 上下文 / 图+视频输入）。本机实测（M1 Pro 32GB）：加载 43s，单决策 10-12s，5/5 分类全对（laya 同题 4/5）。服务封装 `~/.hermes/scripts/clef_serve.py`（/v1/systemone 兼容，端口 8001）。**分频路由纪律**：高频消息预分类留 laya（15ms），低频派工终判/边界仲裁/多模态走 clef（11s 换精度）。LM Studio 不能作为其推理运行时（无 head 输出乱文），仅可当下载器。Jev-Omni 72GB 权重墙路线就此终结。详见 `workspace/research/wx-fusion-20261006/CLEF-SWITCH-REPORT-20261006.md`。
