# R45 双运行时纳入轮：semantica + pua 源码级调研与机制吸收

> 2026-09-23，用户指令触发：「深入进行源码级别的调研分析 semantica 与 pua 的能力，将其作为基础运行时（后续持续更新），分析并完善 swarm-yuan skill 的能力，完成完整回归测试，更新设计文档，发版 GitHub」。
> 证据分级：本轮全部断言为 **A 级**（本机源码实测——两仓浅克隆精读 + 子代理独立深挖复核）。
> 结论：两仓登记进 upstream-baseline（17→19 行），`FACT_RUNTIMES=13` 接线口径不变（两仓均为机制源定位，同 dsh/codegraph 先例）；pua 吸收五协议增量，semantica 吸收三机制（不整包引入）。

## 一、tanweai/pua v3.5.1（MIT，2026-09-09）

**形态**：多运行时分发的 AI 编码行为治理 skill 插件（Claude Code/Codex/pi/Trae/Cursor/Kiro/CodeBuddy/OpenClaw/VSCode 等 11 宿主）。12 skills（主 SKILL.md 40.3KB + 16 家大厂方法论 references）+ 21 commands + 12 hooks（frustration-trigger/failure-detector/checkpoint-save/session-restore/pua-loop/stop-feedback/subagent-teardown/integrity-guard 等）+ 6 agents（四权分离拓扑）。

**与 swarm-yuan 的历史关系（本轮核实）**：pua 是 swarm-yuan 六项机制的既有来源（WP-loop 批，facts.conf 逐条注记），但**从未登记进 upstream-baseline——供应链登记漂移，本轮补上**：

| 已吸收机制（WP-loop 批） | swarm-yuan 落点 |
|---|---|
| 方法论智能路由 | `references/task-methodology-router.md`（改写为节点序列路由） |
| 四权分离治理拓扑 | `references/governance-agents.md`（19.8KB 完整改写） |
| Oracle Gate 循环 | `assets/hooks/loop-hook.sh`（FACT_LOOP_ORACLE=1） |
| compaction 状态续传 | builder-journal + session-restore（FACT_COMPACTION_JOURNAL=1） |
| 失败模式检测 | `assets/hooks/failure-detector.sh`（SPINNING/EXPLORING/MIXED 三态 + L1-L4 压力 + 突破降压 + 同签名去重） |
| 防作弊门 | `assets/hooks/integrity-guard.sh`（FACT_INTEGRITY_GUARD=1） |

**v3.5.1 相对已吸收批的增量（本轮吸收五协议，装配叙事不吸收——R37 裁决沿用）**：

1. **诊断先行协议**（`skills/pua/SKILL.md:72-86`）：debug/改配置前输出一行 `[PUA-DIAGNOSIS] 问题是__；证据是__；下一步动作是__`——把诊断写成外部承诺再行动，防「分析正确但不行动」与「漂亮分析零交付」。诊断依据须标注来源（错误原文/源码上下文/复现实验/官方文档/历史先例）。
2. **失败计数语义表**（`skills/pua/references/runtime-contract.md:36-49`）：升压看**已失败的实验数**，不看命令红绿——同一事件重复展示不重复计数；测试刻意证明旧缺陷存在=复现证据非失败；`grep` 无匹配/非预期版本=信息不自动算失败；读文件成功不清零不宣布突破；验收真实通过才算子目标完成；缺权限/凭据/外部服务=保留事实精确交接，不无限重试制造勤奋假象。
3. **信心门控六步**（`skills/pua/SKILL.md:390-398`，Confidence Gate）：列声明（拆可验证项）→找漏洞（蓝军逐项自检）→修或披露（P0/P1 先修，低风险明示）→跑证据（每条声明配命令）→循环判定（已有证据覆盖即复用，不为标题重跑）→「事实上的 100%」=当前可获得证据下全部可运行验收通过 + 已知高风险已修 + 剩余风险明示。
4. **四状态交付**（`runtime-contract.md:52-56`）：未验证/局部已验证/已完成/有据阻塞——替代「完成/未完成」二值叙事，「已完成」不等于「对所有未来任务保证成功」。
5. **体面的退出**（`skills/pua/SKILL.md:408-412`）：穷尽后输出结构化失败报告（已验证事实+已排除可能+缩小范围+推荐下一步+交接信息）——「问题的边界在这里」，非「我不行」。

**不吸收**：16 味道大厂叙事/职级扮演（p7/p9/p10）/旁白协议/抗合理化话术表（叙事装配层，swarm-yuan 用三权分立叙事不混搭）；PUA-CHECKPOINT 格式（swarm-yuan 已有 builder-journal compaction 续传等价物，FACT_COMPACTION_JOURNAL=1）。

## 二、semantica-agi/semantica v0.7.0（MIT，PyPI，Python ≥3.10,<3.14）

**形态**：图原生知识基础设施（Context Graph/知识图谱/RETE 推理/溯源/本体），26 模块 Python 包 + 21 工具 MCP server（自研 stdio JSON-RPC 2.0，无 SDK 依赖）+ 5.5k 行 click CLI。治理水准高：Dockerfile 逐镜像 digest + CVE 不可达性论证、osv-scanner 豁免逐条长文论证、CLI 自述能力边界（`cli.py:1985-1989` 明示 ingest→图库直写未实现）。HEAD b14a2b8（2026-09-23）为 0.7.0 后未发布特性：双时态图证据投影进真值维护。

**适配度判定（诚实结论）**：本质是企业数据/文档 KG 平台，**不是代码分析工具**——RepoIngestor 代码结构提取是正则级且仅 Python/JS/TS 两语种（`repo_ingestor.py:336-360`），无 AST/调用图/符号解析；22 个核心直接依赖（含 grpcio/protobuf/pyarrow/sklearn/scipy）对 skill 型项目不可接受。**读源码借鉴设计优于引依赖**。

**吸收三机制（数百行以内、可独立重写）**：

1. **溯源哈希链**（`provenance/schemas.py:102-109` + `manager.py:1450-1476`）：`checksum + sequence_id + previous_checksum` 三件套，`verify_chain()` 按序校验自身 checksum/前驱链/序号连续无空洞——专防整行删除；checksum 故意不含 entity_id 以暴露序号空洞。→ swarm-yuan 落点：`assets/trace-log.sh` 新增 `--verify-chain`，给 decisions.jsonl 加防篡改审计（机器执法「不隐瞒失败」红线）。
2. **冲突解决策略枚举**（`conflicts/conflict_resolver.py:102-111` + `source_tracker.py:379-397`）：7 种 ResolutionStrategy（VOTING/CREDIBILITY_WEIGHTED/MOST_RECENT/FIRST_SEEN/HIGHEST_CONFIDANCE/MANUAL_REVIEW/EXPERT_REVIEW）+ 来源可信度打分。→ swarm-yuan 落点：`references/exploration-guide.md` 多源探查矛盾裁决节（三路并行探查对同一组件矛盾结论的裁决层）。
3. **双时态窗口语义**（`reasoning/_temporal_support_projection.py:41-56`）：`Window{valid_from, valid_until, recorded_at, superseded_at}`——valid-time（代码何时如此）与 transaction-time（第 N 轮探查何时知道）分离；「两区间同时命中才 active」+「改历史必须换新 support_id」不可变约束。→ swarm-yuan 落点：exploration-guide 反馈回路注记（清单单条更新 last-good 防坏的时态语义参照）。

**不吸收**：整包依赖/RepoIngestor/图存储四后端（Neo4j/FalkorDB/Neptune/AGE 全要外部服务）/30+ 企业数据源连接器/AgentMemory-RAG 栈/管线 DAG 编排/NER-共指抽取/Rete 增量匹配网络（swarm-yuan 规则量级用不上）/TMS support-derivation 模型（过度工程）/去重 blocking（Levenshtein/Jaro-Winkler/Soundex 手写实现可参考但当前非痛点，暂缓）。

## 三、口径影响

- upstream-baseline：17→19 行（pua + semantica，均 synced，机制源定位——登记不接线）。
- `FACT_RUNTIMES=13` 不变（接线分层口径：深度 4 + CLI 4 + 方法论 5；pua/semantica 同 dsh（方法论/机制源）与 codegraph（选型备选 watch）一样不进分层计数）。
- 新增 FACT：`FACT_TRACE_CHAIN=1`（决策审计轨迹哈希链，semantica 机制）。
- 预算税：本轮 references 注记与协议节增量，逐例登记（第十次）。

## 四、复核与回归

- 两仓版本/许可核实：pua `plugin.json:5-6`（3.5.1, MIT）；semantica `pyproject.toml:6-10`（0.7.0, MIT）。A 级实测。
- 回归：self-check --check-only + 门禁族（--all-full/--compliance-suite）+ tests/ + verifier/v1 + 预算断言，见 CHANGELOG v2.17.0。
