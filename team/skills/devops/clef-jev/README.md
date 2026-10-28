# clef-jev

本地 clef-flash 决策守门。上游 jev-skill 五个 skill 合并为一个：协议层合成
`scripts/clef_jev.py` 单体，场景差异降为 SKILL.md 场景小节加四件模板。

- transport：本机 `http://127.0.0.1:8000/v1/systemone`（clef_serve.py）
- 依赖：Python 3.10+ 标准库，零第三方包，零 API key
- 出口码：0=全部 selected/scored；2=任一 needs_review；1=错误

## 目录

```
SKILL.md                    使用说明与场景小节
scripts/clef_jev.py         clef-decide CLI（协议层 + 本地 transport）
scripts/prepare.py          eval 场景 transcripts→requests 离线转换
assets/templates/           noul / choice / score / batch 四类请求模板
```

## 跑起来

```bash
curl -s -m 5 http://127.0.0.1:8000/health      # 必须 200，status=ok
python3 scripts/clef_jev.py setup              # 只报可达性，不发决策请求

python3 scripts/clef_jev.py decide assets/templates/noul.json --dry-run   # rc 0
python3 scripts/clef_jev.py decide assets/templates/noul.json             # 真实判定
python3 scripts/clef_jev.py classify --criteria labels.json --text "..."
python3 scripts/prepare.py transcripts.jsonl --out-dir requests/
```

## 与上游 jev-decide 的偏差

协议层（validate_request / build_report / 退出码 / CLI 参数集）逐字保留，
差异全部来自 clef 服务契约，共 8 项：

| 项 | 上游 | 本 skill |
|---|---|---|
| transport | OpenRouter 或 TypeSafe | 仅本地 clef，无云端分支 |
| 端点 | endpoints 白名单三 URL | `CLEF_BASE_URL` 覆盖，默认 127.0.0.1:8000 |
| `--provider` | 二选一 | 参数位保留，值域只有 `clef` |
| `status` 字段 | 响应里有 | clef 无，wrapper 按同规则合成 |
| score 值 | 整数级 | clef 给 [0,N-1] 连续期望值，量化后另存 `raw_score` |
| `margin` | top1-top2 | wrapper 从 probabilities 计算 |
| choice 缺 probabilities | 装均匀 1/N fallback | 报错，不猜 |
| state 超 24000 字符 | 无截断 | wrapper 前置检查，进 `warnings` |

`model` 字段必填非空以保持兼容，clef 忽略它（单模型 backend）。

### score 量化口径（deviation，待复核）

design-doc §4 写 `round(score*(N-1))`。C-1 实证 clef 的 score 是层级概率的
期望值：4 级量表 probabilities {0:0.4334, 1:0.3946, 2:0.087, 3:0.085} 加权得
0.8237，值域本就是 [0, N-1]。按 doc 公式会把 0.8237 映射到 2 级，与模型自身
分布矛盾。实现取 `floor(raw_score + 0.5)`，原值进 `raw_score` 供调用方判断。
本机复跑同题得 raw_score 1.111 → value 1（Light review），概率分布同指 1 级。

## score 门控阈值（未决）

clef 连续值低置信（C-1 实测 0.8237 仅 conf 0.4334），门控阈值由 orchestrator
裁决。实现保持上游 `status="scored"` 恒真，额外暴露 `answer_confidence`。

## 不移植

OpenRouter/TypeSafe transport（用户红线禁绕 cc-switch 直连云端）、上游
evals/ 27 个跑数脚本与 108 个 scenarios（需云端 key）。离线校准部分已在
`eval-calibration` skill 落地，不在本包重复。

## 来源

合并自 jev-skill v0.2.1（wuyoscar/jev-skill，MIT）的 skills/jev、jev-act、
jev-documents、jev-eval、jev-triage。上游五者中四个无自有可执行代码，共用
jev.py 协议层；prepare.py 来自 jev-eval。本机 clef 契约见
`~/.hermes/scripts/clef_serve.py`。
