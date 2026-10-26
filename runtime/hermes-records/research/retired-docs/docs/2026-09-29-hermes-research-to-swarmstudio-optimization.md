# hermes agent 调研产出 → SwarmStudio 优化点清单

日期：2026-09-29
方法：扫描本机三处 hermes agent 调研产出，逐一对照 SwarmStudio（Ekko Studio 0.7.25）现有功能面（多 agent 运行时管理、共享聊天/群聊、可视化工作流+审批门、看板、文件浏览器、web 终端、会话管理、记忆面板、技能/插件管理、用量统计、日志、Journey graph、性能视图、MCP 接入），提炼可产品化的优化点。所有锚点经抽查验证。

## 调研源

| 源 | 内容 | 规模 |
|---|---|---|
| `/Volumes/nvme2230/lab/Swarm-yuan/docs/research/` | R1–R73 编号调研报告（自设计/门禁引擎/方法论/框架/上游调研/吸收轮） | 55 篇 |
| `/Volumes/nvme2230/lab/Swarm-yuan/swarm-yuan/research/` | 18 个工具源码级调研（better-harness、claude-mem、comet、openspec、superpowers、gitnexus、graphify、codex-security、ECC、pua、gsd-core、open-code-review、archify 等） | 18 仓库 |
| `/Volumes/nvme2230/lab/hermes-docker-sandbox/workspace/research/` | hermes agent 调研任务工作区（集群审计/治理框架/竞品调研/度量/报告管线） | 约 60 主题目录 |

## 分组清单（合并去重后 32 项，按 studio 功能面组织）

### A. 证据强度横切面——三处调研独立收敛的最高杠杆项

**A1. 证据强度谱系徽标（Present / Wired / Exercised / Outcome-supported）**
- 来源：`hermes-docker-sandbox/workspace/research/hermes-unified-governance-framework.md:87-97`（S0–S4 统一证据强度表，S2 以下不放行）；`feynman-autopsy-2026/00-master-report.md:8-20`（"机制存在 ≠ 机制生效"）；`Swarm-yuan/docs/research/R16-runtime-refresh.md` §五（"缺失证据不显示为零"）
- 优化：studio 所有布尔式状态展示（agent 在线/离线、技能已装、MCP 已接入、任务完成）升级为证据等级徽标；未达最高档时 hover 显示"缺什么证据、最近一次实测时间与命令"。

**A2. 门禁结果可视化（三态判定 + 覆盖报告 + invoked/result 配对审计）**
- 来源：`research/universal-delivery-gate-zcode-design-v0.1.md:109-136`（PASS/FAIL/INCONCLUSIVE 三态，没有证据≠通过；豁免可过期可重审）；`R2-gates-engine.md` L42/L158（硬/软/仪式/睡四档执法强度、"执行 X 跳过 Y 清单"覆盖报告）；`R12-dsh-rc8-resurvey.md` L32-39（invoked/result 事件配对算真实拦截率，非只看 deny 清单）
- 优化：日志面板新增 Gates tab：四态+强度徽标、覆盖条（跳过项显式列出）、跨会话拦截率趋势、fail 展开按秩折叠的获胜理由。审批豁免单独登记（带到期日进通知中心）。

**A3. "Not verified 记分卡"完成判定纪律**
- 来源：`R57-runtime-refresh.md` L48-49（openspec #1732：任一检查未跑不得宣称就绪）；`swarm-yuan/research/gsd-core/docs/explanation/the-phase-loop.md`（Verify=需求覆盖+决策覆盖+阶段对齐三重检查，非仅测试通过）
- 优化：看板卡/工作流节点的验收清单三态显示（通过/未通过/未执行），有未执行维度时完成按钮置灰；删除类变更的检查方向自动反转（查消失而非查存在）。

### B. Journey graph / 项目导航升级

**B4. 项目本体图 + 稳定标记沿调用链传播 + 影响分析查询**
- 来源：`Swarm-yuan/docs/research/R11-palantir-mapping.md` §4.1（L205 起：标记沿谱系传播是首要缺口）、§4.1.1（下游影响域 1 跳邻域方案）、§4.6（"改 X 下游什么会断"查询接口）
- 优化：studio 缺代码本体图。基于 graphify/GitNexus 边集做可交互项目导航：文件浏览器加稳定层徽标（稳定/不稳定/禁止改），右键 Impact Query 高亮下游影响域，命中禁止改单元时改动预警着色。

**B5. 三泳道"会话↔提交"交付溯源 + Evidence Drawer**
- 来源：`swarm-yuan/research/better-harness/docs/docs/concepts/harness-inspector.md:44-65`（User prompts / Agent activity / Commits 三同步泳道；每条关系带 Explicit/Observed/Candidate/Contextual 证据强度标签；不把时间相邻当因果）
- 优化：Journey graph 增加 Delivery 视图模式；点击连线弹证据抽屉（为什么关联、证据多强、缺什么）。studio 数据全在本地，可做比 Inspector 自包含 HTML 更强的原生版。

**B6. 图边置信标签 + 图 diff + 待确认队列**
- 来源：`swarm-yuan/research/graphify/README.md`（每边 EXTRACTED/INFERRED/AMBIGUOUS 三类置信；GRAPH_REPORT 自动给最连通节点/社区/意外连接）；`graphify/ARCHITECTURE.md:23`（graph_diff、import cycles、watch 防抖增量重建）
- 优化：Journey graph/项目导航所有自动推断边带置信筛选器；AMBIGUOUS 边进"待确认收件箱"一键确认/否决（众包标注回路）；"Weekly diff"卡片展示项目结构周变化。

**B7. 主张级证据标签（agent 转述外部信息）**
- 来源：`research/wechat-agent-teams-evidence-matrix.md:6-12`（article / source-verified / local-exercised / pending 四级；"不把媒体转述、厂商自报升级为生产能力"）
- 优化：群聊中 agent 引用外部来源时消息气泡自动打标签；会话详情"证据矩阵"侧栏列出本次所有关键主张×证据状态×可复现命令。

### C. 记忆/知识面板升级

**C8. 知识生命周期三态治理 + 悬置清单**
- 来源：`Swarm-yuan/docs/research/R49-haibo-knowledge-base.md` §5.3（置信度三态过期：续期/降级/归档；建档绑负责人）；同文件 §4.2（查不到的事实留白进"待澄清"清单而非编造）；AB 实证知识库组提速约 44%
- 优化：记忆面板条目加状态列（active/降级/归档）+ 负责人 + log 式变更史；新增"悬置清单" tab 集中沉淀存疑项、销项回填；条目可跳源码锚点。

**C9. 类型化观察 + 五段会话摘要 + 三层渐进披露检索**
- 来源：`swarm-yuan/research/claude-mem/src/types/database.ts:31,38-50`（观察类型 decision/bugfix/feature/…；会话摘要五段：request/investigated/learned/completed/next_steps）；`claude-mem/README.md:259-287`（search 紧凑索引→timeline→按 ID 取全量，省约 10 倍 token）
- 优化：记忆面板三栏布局：类型过滤 / 紧凑索引流 / 详情抽屉 + "插入到当前会话"按钮（按三层粒度插入）。

**C10. 记忆试用→取证生命周期 + 四治理动作**
- 来源：`swarm-yuan/research/comet/README.md:52`（新经验 trial 起步、被实际采用验证后转正；inspect/correct/forget/pause）
- 优化：记忆条目状态机（trial→verified/suppressed）+ 行内四动作按钮；回写"哪些记忆本次被注入、起了什么作用"。

**C11. 摩擦信号评分——沉淀建议的机械触发器**
- 来源：`research/teamai-cli-research-report.md:45-63`（SessionFriction 四信号：interrupt/toolReject/correction/toolError；双门禁 score≥20 ∧ toolCount≥15；toolError 阶梯计分；规模加分封顶使"长而顺的会话永不触发"）
- 优化：studio 可直接从会话流统计四信号（打断≈插话/停止、toolReject≈权限拒绝、correction≈同类重发、toolError≈调用失败）；会话结束弹"高摩擦会话建议沉淀 N 条经验"。

**C12. Context Inspector + 注入成本面板**
- 来源：`R16-runtime-refresh.md` §五（better-harness Inspector：上下文演进/compaction 边界/cache reuse/模型调用数）；`research/orchestrator-context-injection-protocol.md:63-78`（naive 全量内联 39,289 tokens vs compact 子集 4,221 tokens，降 89.3% 且路由结论一致）
- 优化：会话管理页新增上下文剖面抽屉（按 turn 的构成占比条、compaction 发生点标记、cache 命中曲线）；用量统计加"上下文注入成本"维度与注入预览。

### D. 看板/任务管理升级

**D13. 四状态交付模型 + 诊断先行 + 体面退出**
- 来源：`Swarm-yuan/docs/research/R45-dual-runtime-absorption.md` §一 L24-28（未验证/局部已验证/已完成/有据阻塞；行动前一行诊断承诺；穷尽后结构化失败报告）
- 优化：看板状态列从 todo/doing/done 扩为四态；卡片附"验证证据"清单；群聊新增 DiagnosisLine / ExitReport 两种结构化消息渲染组件。

**D14. openspec 工件流水线作为看板后端**
- 来源：`swarm-yuan/research/openspec/README.md:58-77`（proposal→specs→design→tasks 四工件；apply 勾任务；archive 落带日期目录）；`openspec/docs/opsx.md`（依赖是"使能"而非强制顺序）
- 优化：看板卡=change，卡内清单与 tasks.md 双向同步；拖卡到 Done 触发归档落盘；向导式四工件生成。

**D15. 差距台账（Gaps）视图**
- 来源：`research/gap-closure-ledger.md:1-4`（`<!-- gap-closed:id -->` 幂等锚点；ADOPT/TRACK/REJECT 三态裁决，拒绝须写理由；reopen 强制填原因）
- 优化：审计/评审产出的差距自动入台账视图，带裁决徽章、验证信号、复评触发条件；与任务卡双向链接。

**D16. 交付六包 + RTM 追溯 + 术语一致性 lint**
- 来源：`Swarm-yuan/docs/research/R7-quality-standards.md` §⑫ L181-193（需求/设计/测试/部署/运维/管理六包）、§三 L203-225（RTM 覆盖率 100% 门禁、glossary lint、TBD 清零）
- 优化：看板尾部 Delivery Gate 泳道：六包 checklist + 覆盖率环形图 + TBD 计数 + 同概念多词告警——把 studio 从过程工作台延伸到出口合规工作台。

**D17. 变更→回归四路反查推荐**
- 来源：`R49-haibo-knowledge-base.md` §六（用例挂业务锚点+代码锚点；git diff 四路反查：直接命中→必跑/接口命中→应跑/数据面反查→应跑/链路扩散→建议跑；4 业务组采纳率 90-100%）
- 优化：文件浏览器检测 git diff 后侧栏显示分级回归清单，一键在 web 终端执行选中集；数据面复用 B4 的关系边集。

### E. 工作流编排增强

**E18. 对象标记驱动的审批门**
- 来源：`R11-palantir-mapping.md` §1.5/§2.3/§4.3（动作授权由对象标记而非流程位置驱动；拟改文件命中"禁止改"下游影响域时自动升级审批）
- 优化：审批门规则可绑定本体标记；命中时自动插入/升级审批节点，审批卡片展示"为什么触发"（依赖链证据 X 依赖 Y@file:line）。与 B4 共用底座。

**E19. 工作流断点续跑 + 状态审计 + doctor**
- 来源：`swarm-yuan/research/comet/docs/architecture/ARCHITECTURE.md:61,70,123-130`（用户态 yaml 与引擎态 run-state.json 分离；state-events.jsonl 追加式审计；doctor 只读报告）
- 优化：工作流节点显示"上次中断点"+Resume 按钮；日志视图新增状态转移流（from→to 过滤）；doctor 健康检查入口。

**E20. 实现者/审查者配对 + 修复轮升级 + 裁决账本**
- 来源：`swarm-yuan/research/superpowers/skills/subagent-driven-development/SKILL.md:19,27-31,75,103`（Rulings not stalls——冲突 agent 自裁并记账本；仅四类硬停：不可逆/安全敏感/worktree 外副作用/计划崩坏；修复轮 R≤3 原人、R≥4 换人换模型）
- 优化：工作流"实现→审查→修复轮"流水线可视化，升级点标注；审批门支持四类硬停条件预设；Rulings 时间线可事后审计/一键回滚。

**E21. Supervisor 子变更 DAG + 隔离 worktree**
- 来源：`swarm-yuan/research/comet/README.md:65,74-76`（复杂目标→子变更 DAG→隔离 worktree→并行实现验证→按序集成→父级 Verify）
- 优化：内置"监督者拆分"模板：父任务展开为可拖拽 DAG，每子任务绑独立 worktree（解决多 agent 互踩工作区痛点），集成节点按拓扑序执行。

**E22. 五角色流水线模板 + 决策回执日志**
- 来源：`research/autopt-findings.md:11-17`（Strategist/Deputy/Operator/Auditor/Reporter 职责锁死、状态与证据分离）；`research/laya_decision_receipt.py:1-46`（disposition: accepted/abstained/fallback_used + 置信门控）
- 优化：工作流模板库预置五角色流水线；所有自动路由/审批决策统一落决策回执日志，会话时间线可查、可过滤 abstained/human_override。

**E23. 严格 schema IR + 画布结构化诊断 + 拓扑 delta compare**
- 来源：`research/archify-fusion/RESEARCH.md:15-39`（typed JSON IR、additionalProperties:false 拦幻觉字段、失败返回 diagnostics[]（code+subject+evidence+supportedFixes）、真实浏览器 visual-check、delta compare）
- 优化：工作流定义用严格 schema 校验（防 agent 生成坏工作流）；画布渲染问题给结构化诊断+建议坐标；多 runtime 拓扑"配置漂移"diff 视图；交付自动截图留证。

### F. 运行时管理 / 安全

**F24. 二维权限矩阵 + 审批沉淀规则 + deny 带替代建议**
- 来源：`Swarm-yuan/docs/research/R13-codex-deep-dive.md` §2.1/§2.2/§2.5（审批轴 untrusted…never × 沙箱轴 danger…external，三值决策取最严；批准可沉淀 prefix_rule 热更新；"拒绝消息=给模型的 API"，须含替代动作）
- 优化：运行时管理新增 Permission Matrix 子页（agent×runtime 网格、批量预设、冲突取最严预览）；审批弹窗加"仅本次/沉淀为规则"两档；deny 通知附"建议替代命令"按钮。

**F25. MCP inventory 跨运行时归一化 + 漂移检测 + 脱敏**
- 来源：`Swarm-yuan/docs/research/R6-upstream-web.md` §1.9 L128（ecc.mcp.v1 跨 harness 归一化视图、碎片化/漂移检测、secret redaction 开发期抓到真实泄漏、最小默认+opt-in 理由）
- 优化：MCP 面板改矩阵视图（runtime × server）+ 漂移高亮 + 配置预览一律脱敏 + 策略模板。

**F26. AgentShield 供应链安全扫描**
- 来源：`swarm-yuan/research/ECC/README.md:174,910,953`（扫描 prompts/hooks/MCP config/权限/secrets；102 条规则；"agent 配置默认被信任"本身是攻击面）
- 优化：studio 缺"装进来的东西"的安全呈现。安装第三方技能/MCP 时插入扫描步骤（红黄绿+逐条规则命中）；条目加安全徽章；MCP 页显示每个 server 的工具清单与权限面。

**F27. 能力地图台账 + 任务→技能分派表**
- 来源：`Swarm-yuan/docs/research/R50-integration-capability-map.md` §一/§二（三裂缝：路由断层/孤岛/无台账）；`R51-dispatch-integration.md` §二 L22（14 任务类型×方法论分派表）；`R52-ship-gap-node-refs.md` §二（"随发或声明"：分派技能必须随会话可达）
- 优化：技能管理新增 Capability Map tab（技能×消费场景矩阵、孤儿检测、来源溯源）；新建任务/工作流时按分派表自动推荐技能集。

### G. 运行监控 / 质量

**G28. 五类懒惰模式检测 + 一键干预**
- 来源：`swarm-yuan/research/pua/README.md:67` 起（暴力重试/甩锅用户/工具闲置/原地空转/被动等待；触发条件可机检：连续失败 2+、放弃话术、同命令重复、修表层就停；首次失败与已知修复中不触发）
- 优化：studio 看得到全部会话工具调用流，比 CLI 插件更有条件做卡转检测：规则引擎可配阈值，命中时会话卡亮黄灯 + 干预菜单（注入检查单/换模型/人工接管）。

**G29. 控制回路健康面板 + 盲区标注**
- 来源：`research/engineering-cybernetics/hermes-as-control-system.md:20-76,161`（每条回路：测什么→阈值→谁执行→多快生效→是否真的触发过；观测盲区显式列出；"基础设施层已闭环、过程质量层大面积缺失、元层无监督者"）
- 优化：性能视图新增"控制回路" tab：watchdog/自动修复/重试显示为回路卡片（测量信号、阈值、最近触发时间、连续未触发告警）；盲区徽标；watchdog 自身失效检测。

**G30. 五维工作回路体检 + 证据封顶计分**
- 来源：`swarm-yuan/research/better-harness/docs/docs/concepts/agent-work-loop.md:30-38,50-80`（五维×3 检查；证据态 Present/Wired/Exercised/Outcome-supported 封顶 59/74/84/94/100 分；Unobserved≠Missing；历史趋势）
- 优化：项目级五维体检雷达图+15 项明细（每项标证据态）；历史折线；改进建议带验收清单，完成复检解锁分数。

**G31. 失败四轴分类 + 发现去重分组 + rubric 定级**
- 来源：`research/metrics/failure-classify-2026-09-15.json:6-11`（失败按 tool-use/instruction/long-context/plan-reasoning 四轴按板聚合）；`swarm-yuan/research/codex-security/README.md:77-91`（findings 服务：嵌入去重分组、只读 dashboard、severity 按用户 rubric 定级可复评）
- 优化：用量统计失败分析按四轴堆叠聚合（定位换模型还是改提示词）；新增 Findings 视图：跨会话发现池、重复组折叠、severity 徽章 hover 显示 rubric 依据、一键转看板卡。

**G32. 一源多格式报告管线**
- 来源：`research/ai-status-report-2026-09/`（同一数据集产出完整版/两页高管简报（30 秒结论+行动建议矩阵）/总裁讲稿/公文版 docx 四格式，数字可溯源至附录）
- 优化：内置"汇报生成"：从看板/会话/用量圈选素材，按模板一键多格式导出；每个数字回链源会话/任务。

## 优先级建议（Top 5）

1. **A 组证据强度横切面**（A1–A3）：三处调研独立收敛到同一设计（S0-S4 谱系 / Present-Wired-Exercised / Not verified 纪律），改动集中在徽标组件与完成判定逻辑，横跨所有现有面板，杠杆最大。
2. **B 组 Journey graph 升级**（B4–B7）：studio 已有图渲染底座，补交付溯源维度与置信标签；B4 本体图是明显缺口型新增面。
3. **C 组记忆面板治理**（C8–C12）：现有面板偏静态列表，四项调研（haibo/claude-mem/comet/teamai）给出完整的生命周期+触发器+检索分层设计。
4. **G28–G29 卡转看门狗与控制回路**：studio 作为运行时管理者天然比 CLI 插件有优势（可见全部工具调用流），是差异化能力。
5. **F26+ F25 安全与配置治理**：多 runtime 管理的固有痛点（碎片化/供应链），缺口明显且用户感知强。

## 落地约束提醒

- upstream 只读（`upstream/hermes-studio/` 禁改），全部改动走 `overlay/patches/` + `overlay/custom/`，经 `npm run inject` 注入。
- 新增视图/面板类（Gates tab、Gaps 视图、Findings 视图、Context Inspector）优先做 custom 组件挂载，避免深改 upstream 路由。
- 涉及后端数据契约的（门禁 JSONL 事件、决策回执、摩擦信号统计）需 runtime（hermes-agent）侧同步产出，纯 studio 侧只能做展示面。
