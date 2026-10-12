# SoL-Pi Harness 效能轮：调研结论与本机落地（2026-10-12）

## 结论

调研属实。NVIDIA SoL-Pi 是真实开源项目（NVlabs/SoL-Pi，MIT 协议，论文 arXiv:2609.20519）。它的主张：不换更大的模型、不改提示词，让 AI 优化自身运行框架就能省下大量 token。运行框架（Harness）指工具调用、上下文组装、观察回传这层工程设施。

本机本轮对位落地了四大机制中的三件运行时机制和一件产品面板。三件机制是动作融合、观察打包、证据保全精简器，全部带自动化测试与浏览器走查证据。第四件（计划步边界压缩）本机已有等价能力，本轮只留了经济闸门设计。效率收益的本机实测数字本轮不提供：没有跑基准评测，论文的节省比例不得引用为本机成绩。

## 一、调研要点

SoL-Pi 的自优化循环从 152 个候选方向筛到 4 个存活机制，存活率约四十分之一。验证用了 535 个训练环境：495 个 GitHub issue-PR 对，加 40 个验证器合成任务。留出集 EdgeBench 共 51 个长任务，单个 2 至 12 小时。论文口径的成绩：token 流量降 44.7% 到 49.0%，API 成本约降三分之一，能力保持 94%。20 个 worker 的群体任务里计算量降 17.5%，成本降 26.8%，结果反而更好。

四个存活机制，按本机落地情况排序：

1. **动作融合（Action Fusion）**：文件编辑工具接受一条校验命令，编辑与校验在同一次工具调用里完成。原来编辑、看结果、发起测试、再看结果是两次模型决策，融合后一次。执行前做内容哈希校验。写入与执行之间文件若有改动，则跳过命令并说明原因。
2. **观察打包（ObservationPack）**：超过阈值的大观察归档到本地。上下文里只留稳定句柄加摘录，原版摘录取头尾各 1KB，前两次请求仍发全文，之后才换句柄。配套 obs_recall 工具按句柄分页取回。
3. **证据保全精简器（Evidence-Preserving Reducer）**：大段诊断日志交给廉价模型出收据。收据里每一行引文都必须与归档原文逐字一致（哈希校验）。任何一环不过就把原文原样放行。省钱不许以丢证据为代价。
4. **在线上下文压缩（Online Context Compact）**：在计划步骤完成的边界做压缩判定。闸门是经济性的：重写成本能收回才压缩。

治理红线一条：省钱不得来自少干活。早期停止、跳过验证的候选一律淘汰。全部能力指标落在预先声明的容忍度内，且至少一项效率指标改善，候选才算存活。

辨伪注记：中文转述文章里的三步落地法和几处硬门槛数字均属转述加工。例证两条：token 至少降 15%、P95 延迟至少降 10%。论文、项目页和仓库一手源里都找不到。本仓引用论文数字时一律注明口径。

## 二、本机对位：落地了什么

先说对账基础。hermes-agent v0.21.6 已有溢出持久化（`tools/tool_result_storage.py`）、自动压缩与压缩归档、token 记账单点（`agent/turn_usage.py`）、辅助模型调用通道（`agent/auxiliary_client.py` 的 `call_llm`）。本轮在这些底子上补齐，不另起炉灶。

| SoL-Pi 机制 | 本机原有 | 本轮落地 |
|---|---|---|
| 动作融合 | write_file 写后自动语法校验（仅内置 linter） | write_file 与 patch 新增 then_run 参数，任意校验命令融合进同次调用，内容哈希守卫 |
| 观察打包 | 溢出持久化，预览只有头部，召回靠 read_file 走路径 | 摘录升级为头加尾。新增 obs_recall 工具按 tool_call_id 分页召回，路径限定归档目录 |
| 证据保全精简器 | 无 | 新模块，默认关闭。引文行集校验、密形校验、尺寸上限、全链 fail-through |
| 计划步边界压缩 | 阈值触发自动压缩、微压缩、原生压缩 | 未落码，经济闸门设计见后续清单 |
| 审计留痕 | 无统一机制账本 | efficiency/ledger.jsonl 四机制统一记账，studio 面板消费 |

### 落地明细与锚点

**动作融合（补丁 613）**。write_file 与 patch 的 schema 各加一个可选 then_run 字符串参数。写入成功后先做内容哈希校验，仍在路径锁作用域内：磁盘上的 sha256 必须等于写入时记录的值。通过才执行校验命令，走文件操作层自己的命令通道。超时 120 秒，输出截头 4000 加尾 2000 字符。退出码与输出合并进本次工具结果。命令的权限面与终端工具一致，没有引入新的执行通道。宿主文件：`tools/file_tools.py` 的 `_run_then_run_fused` 与 `_then_run_hash_ok`。

**观察打包（补丁 612）**。溢出报文从只有头部预览升级为头加尾双摘录，尾部 512 字符。诊断结论常在日志末尾，这一段此前正好丢。报文里写入 Result id 作为召回句柄。新工具 obs_recall（`tools/obs_recall_tool.py`）按 tool_call_id 或归档路径取回，行号分页。路径引用限定在溢出目录与沙箱结果目录内，不能当第二个 read_file 用。read_file 的设备与进程文件黑名单因此绕不过。

**证据保全精简器（补丁 614）**。模块 `tools/evidence_reducer.py`，接线在观察提交点，即 `agent/tool_executor.py` 的 `_commit_tool_result`，位于溢出持久化之前。处理对象是目标工具白名单内、超过 4096 字符的诊断输出。流程三步。第一步先把原文归档到溢出目录，全保真留在模型上下文之外。第二步交廉价辅助模型出收据。第三步机械校验：收据不超 2500 字符，不含密形字符串，每行引文都是原文行的逐字成员。任何一环失败，原文原样进入上下文。配置块 evidence_reducer 支持 provider、model、threshold_chars 等字段，默认关闭，不开就不花一分钱。

**机制账本（补丁 612 内）**。`tools/efficiency_ledger.py` 向 `<hermes home>/efficiency/ledger.jsonl` 追加 JSON 行，best-effort，永不抛错。四类事件：observation_archive、obs_recall、action_fusion、evidence_reduce，各带会话、字符数、结果码。这是 SoL-Pi 模型输入之外保全审计这条治理规则的本机实现。

**产品面板（overlay A 类改动，零补丁）**。工程效能页签（/app/board?tab=gov-harness）新增「运行时效率机制」分区，组件 `custom/client/governance/components/EfficiencyRuntimeSection.vue`。内容是四张机制卡加 Token 四账户卡，再加最近事件表。四账户数据来自既有 /api/studio/usage/stats。服务端新增 GET /api/token-meter/runtime-ledger，挂在既有 patch 403 控制器上，聚合逻辑在 `custom/server/tokens/runtime-ledger.ts` 纯函数。token-meter 域由此首次有了 UI 消费方。走查实录：四账户卡显示真实数据，近 30 天输入 495.8M、缓存读 1922.1M、命中率 79.5%、343 会话。机制卡如实显示零，因为本栈运行时尚未部署新机制，不做假数据。

**压缩三档列（第二批，同日落地）**。会话健康页签每会话新增压缩档位列：充裕、临近、立即。数据链三段。第一段，602 遥测 sidecar 本就落了上下文绝对值（last_prompt_tokens 与 context_length）。集群巡检收集器此前只透传百分比，现在一并透传。第二段，档位判定在收集器内调用 compact-threshold 域的 90% 线公式：容量扣输出预留后的九成为触发线。输出预算用披露的 8K 缺省。第三段，UI 只渲染投影结果。绝对值缺席（旧 sidecar 或非回合采样）时不出档位，不拿百分比倒推。compact-threshold 纯函数由此获得第一个 UI 消费方。

## 三、验证证据

- hermes-agent 侧 pytest：新增三个测试文件共 40 用例全绿，即 `tests/tools/test_observation_pack_recall.py`、`test_action_fusion_then_run.py`、`test_evidence_reducer.py`。相邻路径回归全绿：test_tool_result_storage.py 53 通过，test_file_tools.py 41 通过 2 跳过。
- overlay 侧 vitest：`custom/server/tokens/__tests__/runtime-ledger.test.ts` 15 用例全绿，其中一例断言新路由确实挂在控制器上。
- 第二批测试全绿。集群巡检域新增 3 用例：绝对值透传、三档边界、缺值不出档。会话健康组件测试 2 用例：三档渲染与占位、空态诚实。
- 补丁重放验证：四个新补丁（611 至 614）先在基线快照树上 git apply。之后再与工作树逐文件比对，十个文件全部一致。此步防手改补丁静默截断。
- 浏览器走查：隔离端口栈，后端 8657、前端 8659。DOM 快照确认分区渲染、端点通、空态与数据源脚注正常。走查中发现一处文案笔误并当场修正。
- 功能冒烟走真实执行链：then_run 通过与失败两种裁决均正确合并。归档尾摘录含最终裁决行。obs_recall 跨页与末页正确。精简器默认关时原文直通。引文校验器还抓住了测试作者手写时间戳与生成器取模不一致的编造，机制按设计工作。

## 四、边界与 Non-goals

1. **未做本机效率实测**。没有跑任何基准，省 45-49% 是论文数字，不是本机成绩。机制在本机省多少，要等部署后账本数据积累才有诚实答案。
2. **未做前两次全量窗口**。SoL-Pi 观察打包在归档后前两次请求仍发全文，第三次起才换句柄。本机溢出在首次就替换并带摘录。实现该窗口需要逐消息请求计数与历史改写，侵入请求组装层，列为后续可选。
3. **未做计划步边界压缩与经济闸门**。本机已有阈值触发压缩、微压缩、原生压缩三套等价能力。SoL-Pi 的增量是子任务边界时机加经济闸门。设计：在压缩阈值判定前加一道预检，重写成本小于预估未来节省才触发。留后续轮。
4. **运行时部署已执行（A 案回钉 stable，2026-10-12 深夜用户裁定）**。宿主 `~/.hermes/hermes-agent` 曾是 canary 通道树，比补丁基线多 136 个提交。做法是整树 checkout 回 v0.21.6，再按投资集逐文件恢复。恢复集三部分。其一，70 件 series 面从 ncwk 树镜像，逐件比对全等。其二，5 件镜像出处件从 overlay/runtime 镜像重建。其三，29 件本地热修按 tar 备份原样保留，含 update_cmd_stash 保护族。uv.lock 用 v0.21.6 原生版本，更新通道经官方命令钉 stable。网关重启后 health 返回 v0.21.6 正常。残留三件如实记。一，canary 时代 142 个孤儿新文件已删，git 对象内可回溯。二，29 件热修保留 canary 基底，归属他轮工作，混基经真实网关启动实测可用。三，树内 venv 未动（run16 推演借用中），installs 环境已由 pm install 同步到 v0.21.6 依赖。
5. **精简器默认关闭**。需在 cli-config 配置廉价 provider 与 model 才启用。安全注记：收据生成会把日志内容发往所配模型，信任级别与压缩摘要相同。密形校验是放行前最后一道闸。
6. **账本无轮转**。单文件追加，事件体有 4000 字符上限。按现有事件密度估计月级文件量在 MB 级，轮转留后续。

## 五、风险

- then_run 的校验命令与终端工具同权限。模型本来就能调终端，这不是新增攻击面。但融合后调用更顺滑，命令频次可能上升。账本记录全部命令与退出码，可审计。
- 精简器的收据可能夹带日志原文里的注入话术。引文校验只保证引的都是原文，不判断原文语义。缓解：收据包裹在固定标签内，且日志本就是模型可直读的内容，信任级别没有提升。
- obs_recall 依溢出目录 24 小时清理策略。归档过期后召回失败，报错并提示重跑原工具。

## 六、后续清单（按优先级）

1. 运行时部署已完成（A 案，见第四节第 4 条）。观察项：机制账本开始积累真实事件后，工程效能面板机制计数从零起步。run16 结束后树内 venv 可择机切到 v0.21.6 依赖。
2. 团队五态条：数据源缺 worker 失败态。kanban 状态词表没有 failed，blocked 不等于 failed，不硬映射。进程退出钩子也未进巡检快照。需先补 worker 生命周期的失败信号源，再接 team-summary-bar 投影。压缩三档已完成（见第二节）。
3. 计划步边界压缩的经济闸门落码，设计见第四节第 3 条。
4. 账本轮转与前两次全量窗口按数据决定是否做。

## 附录：改动清单

- 补丁四个，series 已登记：611-agent-toolsets-obs-recall、612-agent-observation-pack-recall、613-agent-action-fusion-then-run、614-agent-evidence-reducer。.overlay-injected.json 已同步 609-614 实态。
- inject.mjs 的 HERMES_AGENT_PATCH_PREFIXES 新增根层 toolsets.py 路由条目，仿照 model_tools.py 先例。
- overlay 新文件：runtime-ledger.ts、runtime-ledger.test.ts、EfficiencyRuntimeSection.vue、gov-session-health-compaction.test.ts。修改：token-meter-controller.ts、GovHarnessView.vue。
- 第二批：collectors.ts（透传+档位投影）、GovSessionHealthSection.vue（档位列）、session-telemetry-detectors.test.ts（3 用例）。
- 测试命令一：`uv run --with pytest python -m pytest tests/tools/test_observation_pack_recall.py tests/tools/test_evidence_reducer.py tests/tools/test_action_fusion_then_run.py -q`。命令二：`npx vitest run custom/server/tokens/__tests__/`。
