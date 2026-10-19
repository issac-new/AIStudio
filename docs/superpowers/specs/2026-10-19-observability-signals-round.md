# 观测层信号与告警扩展轮（Observability Signals Round）

- 日期：2026-10-19
- 分支：`feat/obs-signals-round`
- 调研源：微信公众号文章《AI-Native可观测层｜可观测性架构解析：追踪到评估的生产级监控体系》（陈骁的数字工厂，2026-10-19，https://mp.weixin.qq.com/s/1nLkCo29S-E1uLXH5g0P5A ）

## 决策记录

| 决策 | 取值 | 理由 |
|---|---|---|
| 落地形态 | 文件账本 + 只读聚合端点（沿用现状），不引入 ClickHouse/S3 | 文章架构是参照系不是照搬对象；现有存储形态已支撑 5400+ 测试，引入重型组件违背本轮「完善」定位 |
| 采样位置 | 会话末保留决策（tail-decision at session_end），非头部丢弃 | 文件型采集无法在会话开始时预判错误；会话末按内容决策才能落实「错误全量」第一层 |
| 采样默认 | 默认全留（rate=1.0），显式 env 开启 | 不破坏 eval 取证与既有消费面；文章反例（$81k 账单）针对的是规模部署，本机默认无成本压力 |
| 告警口径 | 最近 24h vs 前 N 天基线的比率/差值，不用绝对值 | 文章明确「告警阈值应该基于系统自己的基线漂移来定，而不是拍一个绝对数值」 |
| 评估粒度 | 新增 span 级采样入口，不改既有 trace 级判定管线 | Langfuse 2026-02 起 observation 级为主、trace 级为 legacy；本轮先开入口，判定管线下沉留后续轮 |
| 挂载方式 | 复用 harness-controller 前缀，不新增 bootstrap patch | 与 workbench 子路由同款惯例（patch 543 注释） |
| 错误源 | 新接 `api_request_error` 钩子 | 上游失败请求走该钩子（turn_response_intake.py / api_request_hooks.py），现状 trace 完全没有 API 错误数据，429 率无从算起 |

## 文章要点 → 现状 → 本轮落地映射

文章信号体系五分法与 SwarmStudio 现状对账（现状锚点见各条 file:line）：

1. **链路信号（Traces）**
   - 现状：llm/tool/subagent 三类 span + TTFT（`custom/hermes-agent-plugins/run-trace/__init__.py`）；无 API 错误 span（上游失败走 `api_request_error` 钩子，插件未订阅）；无 guardrail/workflow 独立 span（以 tool_span 形式间接存在）
   - 本轮：接入 `api_request_error` → `llm_span phase:"error"`（status_code/retry_count/error.type 落盘）；retrieval/guardrail span 类型留后续轮（需上游埋点配合）
2. **度量信号（Metrics）**
   - 现状：无统一聚合；token 拆分（cache_read/cache_write/reasoning）在上游 usage 载荷里有（`usage_pricing.py:69-71`）但 OTel 格式化器只取 input/output（`otel_formatter.py:140-141`）；429 率/工具成功率/TTFT 分布无在线口径
   - 本轮：新增 `custom/server/obssignals/` 聚合模块 + `GET /api/harness/obs-signals`；OTel 格式化器补 cache/reasoning 用量属性
3. **内容信号（Content）**
   - 现状：prompt 全文落盘；completion 只有 500 字符预览（`__init__.py:380-383`）；reasoning 不落盘；工具 args/result 截 1000
   - 本轮：reasoning 与主回答分离记录（标签正则提取，独立 `reasoning_preview` 字段，与上游 `_RELAY_THINKING` 同款标签集）；completion 全文维持预览（大 body 分离已由 patch 612 tool_result_storage 承担，不重复造）
4. **侧翼产出（Evals/Cost）**
   - 现状：Eval Studio 存在但判定粒度是 trace/session 级（`eval/types.ts:201` Attempt 绑 sessionId）；人工裁决有入口无 span 级
   - 本轮：`sampleSpanFromTrace` + `POST /api/hermes/eval/sample-span-from-trace`，单 span（LLM 调用 + 其子工具调用）→ Evidence，spanRef 入 meta
5. **横贯关联字段**
   - 现状：session/task/turn/span 四级 ID + model/provider + collab_event_id；**无 user_id、无 prompt 模板版本**
   - 本轮：header 增 `user_id`/`prompt_template`/`prompt_version`（env 注入：`HERMES_RUN_TRACE_USER_ID` / `HERMES_RUN_TRACE_PROMPT_TEMPLATE` / `HERMES_RUN_TRACE_PROMPT_VERSION`，缺省 null 不猜）
6. **三层混合采样**（文章落地指南核心）
   - 现状：全量无采样
   - 本轮：会话末三层保留决策——①有错误 span/trailer error 全量保留 ②成功会话按 session_id 稳定哈希采样（`HERMES_RUN_TRACE_SAMPLE_RATE`，默认 1.0）③未命中但总 token ≥ `HERMES_RUN_TRACE_TAIL_TOKENS`（默认 0=禁用）保留；决策写 `trailer.sampling`，未保留删文件
7. **告警四类 + 基线漂移**
   - 现状：无统一告警；阈值全绝对值（budget-policy、cluster-inspector、releaseGate）
   - 本轮：`custom/server/obsalerts/` + `GET /api/harness/obs-alerts`——成本尖峰（token 代理，默认 2x）、延迟尖峰（TTFT p95，默认 1.5x）、错误率（工具失败+API 错误，+10pp）、质量漂移（eval 均分，-10pp）；基线=前 N 天（默认 7），不足如实 `no_baseline`
8. **OTel 语义漂移防护**（文章风险节）
   - 现状：OTel 格式化器存在（`otel_formatter.py`），无键名钉测
   - 本轮：golden-span 钉测锁定 `gen_ai.*` 属性键名与 span name 规范（`operation name + model`）

## 实施清单

- A. run-trace 插件 v2（Python）：错误钩子 / reasoning 分离 / 关联字段 / usage 拆分 / 三层保留 / OTel 用量属性补全
- B. `custom/server/obssignals/`：纯函数聚合 + 采集 + 端点（按天分桶，供告警复用）
- C. `custom/server/obsalerts/`：四类基线漂移判定纯函数 + 端点
- D. eval span 级采样入口（trace-sampler 扩展 + controller 端点）
- E. 前端治理页「观测信号」区块（指标卡 + 告警列表）
- F. 测试：Python 插件测试（采样三层/reasoning/错误 span/关联字段/golden-span）+ TS 测试（聚合/告警/span 采样/HTTP）

## 验收

1. `pytest overlay/custom/hermes-agent-plugins/run-trace` 全绿（含 golden-span）
2. `npm test`（vitest）相关套件全绿、全量无新增失败
3. 双 tsc 零错（overlay 既有口径）
4. 8649 热更新走查：治理页观测信号区块渲染、端点 200
5. 默认配置零行为变化（采样 rate=1.0 时 trace 文件全留）
