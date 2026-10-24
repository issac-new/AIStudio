# 群体协作评测基准吸收轮·清账批：五件挂账全落地

- 日期：2026-10-24
- 状态：已落地（overlay `feat/swarm-eval-followup`；simharness `feat/swarm-eval-followup`）
- 前批：spec 2026-10-24-swarm-eval-benchmark-absorption.md（D1-D9）——本批清偿其全部五件挂账
- 关联正本：全流程方案 V8.52 §2.6.11 增补；整合正本 R8 §3.10 增补；总账刷新

## 背景与清账对照

| 前批挂账 | 本批处置 |
|---|---|
| ① 实验性 Leave-One-Out 消融 | 落机制：`MX_ABLATE_ROLES` 旋钮（派发原语过滤被消融角色+台账留痕）＋overlay `GET /swarm-collab?run=&compare=<消融run>` 基线/消融对比算实验性 criticality（D10）；**执行需消融 run**（每角色一轮），机制与度量已就绪待 run |
| ② 拜占庭行为级注入 | 落机制：`MX_BYZANTINE_SPEC=<agent>:<mode>` 三模式（corruption/noise/gaslight）派发期标记注入＋swarm-collab 读注入标记算 BCR（被拦截率）/隔离滞后（D11）；**执行需注入 run**，机制与度量已就绪 |
| ③ 混合动机场景 | 落场景：`scenarios/mixed-motive-bidding/`（资源竞标市场：4 账号 3 业务单元+仲裁者，多轮竞标+契约锁定）＋`mux/mx-mixed-motive.py` 指标器（社会福利 W=ΣU／基尼系数／纳什偏离度——对竞标台账纯函数），不触 26 步主链（D12） |
| ④ 消息全文采集进 r18 | 采集已在（步 9 任务书/步 11 RACI 派发 dialog，V8.47 后加）；本批补消费面：swarm-collab 读 r18-steps.json dialogs，意图保真度升**全文相似度口径**（字符双线相似度，锚点口径降为缺席回退）（D13） |
| ⑤ per-profile token 分桶 | run-trace 插件 header/chunk 增 `profile` 字段（HERMES_HOME 基名推导，显式 env 覆盖）＋obs-signals 增 `byProfile` 聚合（同 byModel 形态）（D14）；存量 span 无 profile 如实不归桶 |

## 落地内容

### 1. overlay `custom/server/delivery/swarm-collab.ts` 三项扩展

- **全文意图保真度**：输入增 r18 dialogs（任务书全文+各任务派发明细）；`intentFidelity` 升级为 `basis: 'dialog-text'`（任务书与派发明细的双行相似度均值，difflib 口径），dialogs 缺席回退锚点口径（`basis: 'anchor'`）。
- **拜占庭读数**：`social.byzantine` 从常量 no_data 升实测三态——scenario.log 中 `[BYZANTINE-INJECT mode=X target=Y ts=Z]` 标记 → injections 列表＋`bcr`（注入后被拦截比例：该 agent 名下问题单/打回计入 caught）＋`exposureDispatches`（注入点之后的派发数=暴露窗；轮级时间戳不可得，如实以派发计数降档）；无标记=no_data。
- **消融对比**：新纯函数 `ablationCompare(base, ablated, roles)`——两 run 读数的任务完成率差分=被消融角色的实验性 criticality；端点 `GET /swarm-collab?run=<基线>&compare=<消融run>` 返回 `ablation` 节。

### 2. overlay 观测面 per-profile token 分桶

`custom/hermes-agent-plugins/run-trace/__init__.py`：`_correlation_fields()` 增 `profile`（显式 env `HERMES_RUN_TRACE_PROFILE` 优先，否则 HERMES_HOME 基名；根 home= 'root'）；legacy header/chunk 均携带。`custom/server/obssignals/signals.ts`：`ObsSpanRow.profile`＋`byProfile` 聚合（llmCalls+TokenSplit，同 byModel），报告透传。

### 3. simharness 旋钮（默认零行为变化，26 步/六闸/判据零改动）

- `mux/mx-scenario-lib.sh dispatch_in_room`：入口读 `MX_ABLATE_ROLES`（逗号表）过滤 mention 清单+`compensate ablation-skip` 台账留痕；读 `MX_BYZANTINE_SPEC`（`agent:mode` 逗号表）对命中的被 @ agent 追加一条标记化污染指令 DM（三模式文案，`[BYZANTINE-INJECT ...]` 前缀可回查）。
- `scenarios/mixed-motive-bidding/`：roster.env（mediator+3 业务单元）+scenario.sh（需求发布→N 轮竞标报价→契约锁定→结算断言→报告）骨架；`mux/mx-mixed-motive.py`：竞标台账 JSONL → welfare/gini/nashDeviation/成交分布纯函数指标器+CLI。
- 守卫测试：`tests/swarm-eval-followup.test.ts`（旋钮结构断言＋mixed-motive 指标器用例＋默认态零行为断言）。

## 决策记录

- **D10 消融机制先行、实验待 run**：旋钮+对比度量本批全就绪；实验性 criticality 的数字必须来自真实消融 run（每被消融角色一轮），不在没有 run 的情况下用观察口径冒充实验口径。
- **D11 拜占庭注入走「标记化出站指令」**：污染以追加 DM 指令实现（文章包装器模式：恶意行为加在被污染 agent 的入站任务上），`[BYZANTINE-INJECT]` 标记保证事后可回查、可度量；不改编排结构、不动其他 agent。
- **D12 混合动机场景独立成场景不动主链**：竞标市场做在新 scenarios/ 目录（与 aipaydev 主链平行），主链与判据零风险；指标器独立可测。
- **D13 全文保真度字符相似度口径**：任务书↔派发明细用字符级相似度（无模型依赖、可回放）；嵌入/裁判口径挂后续（依赖 S1 在线）。
- **D14 profile 从 HERMES_HOME 推导**：插件按 profile home 部署是既有事实（mx-enable-run-trace.sh），基名即身份，零部署变更；显式 env 优先；存量 span 无字段如实不归桶（unknown 不造数）。
- **D15 两旋钮默认关=零行为**：MX_ABLATE_ROLES/MX_BYZANTINE_SPEC 未设时 dispatch_in_room 行为逐字节不变（守卫测试锁默认路径）。

## 验证

- overlay：swarm-collab.test.ts 扩全文保真/拜占庭/消融对比用例；obssignals byProfile 用例；run-trace 插件 profile 字段用例；vitest 全量＋typecheck。
- simharness：mixed-motive 指标器纯函数用例（真实竞标台账 fixture）；旋钮结构断言；bash -n 语法门。
- web：交付效能页⑤区拜占庭/保真度读数呈现（8649 链路）。

## 挂账（残余，待 run 执行）

1. 消融 run 执行（每角色一轮）与注入 run 执行——机制就绪，产出实验数字后回填 spec。
2. mixed-motive-bidding 场景首跑（RUN_ID 自定，不占主链轮次）。
