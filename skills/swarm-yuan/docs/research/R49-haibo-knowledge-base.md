# R49 知识生命周期吸收轮：京东海博 AI 知识库能力建设文章深调研

> 2026-09-24，用户指令触发：「深入调研分析 https://mp.weixin.qq.com/s/rNox2XcWvgt2zdwGlVmfAg，完善 swarm yuan skill 的能力」。
> 来源：京东技术公众号《拆解京东海博 AI-Native 落地保障：海博团队 AI 知识库能力建设》（2026-09-24 20:13，作者 徐双双/京东零售）。本系列上篇《Harness、双 Loop、知识库与技能自主迭代实践》此前未单独立轮吸收（其 GitNexus 引擎已有 research/gitnexus/ 克隆与 code-graph-tools.md 档）。
> 证据分级：OKF 规范要点=B（Google Cloud 官方博客一手直查，2026-09-24 核验）；机制描述=B（京东技术官方公众号自述）；AB 实验数字/文档产量/内部工具栈=C（文章自报不可外部复核，载体引用均标注"文章自报"）。
> 结论：新建 references/knowledge-lifecycle-methodology.md（FACT_REFERENCES 45→46），净增五机制接线（过期三态/回归分级/读取六步/页面三角/悬置回填），门禁 55 守恒、弧线表不加行、不引依赖（决策 26/27/40 全守）。

## 一、文章机制全景（结构化摘录，节号对原文）

文章主线：把"AI 用不好"从"换更强模型"重新定义为"怎么把上下文经营好"——一套理念（Context Engineering，供给端质量决定 AI 上限）+ 一个架构（三层知识结构）+ 两台引擎（GitNexus 图谱 + 依赖分析）+ 一个闭环（Skill 建/补/用 + 生命周期四步治理）+ 一组对照（AB 实验）。

| # | 机制（原文节） | 要点 | 文章自报数据 |
|---|--------------|------|-------------|
| 1 | 知识生产前移（§二） | 瓶颈在知识生产不在检索（向量 RAG/GraphRAG/Agentic Search 三范式重心都在运行时检索）；知识编译从运行时前移到维护期，运行时只剩导航+摘录 | — |
| 2 | OKF 规范（§二） | 一概念一文件 / YAML 头 type 唯一必填 / index.md 渐进披露 + log.md 变更追溯 / 宽容消费（降级为普通文档） | — |
| 3 | 三层知识架构（§三） | 底层项目×领域矩阵（{app}-knowledge-catalog：flows/chains/domain/views/references/待澄清问题.md）→ 中层角色化视图 → 上层 Skill 能力 | 40w 行仓 1051 篇；前端 530 篇；域 93 篇 |
| 4 | views/ 反向索引（§3.1） | 某表/Redis-key/MQ-topic 的读写方与生产消费方可直查——影响面分析底座 | — |
| 5 | 后端知识生成（§4.2） | 入口/链路/落点/影响四问；只写可查证事实，查不到留白标待澄清，抽样核对 | — |
| 6 | 前端知识生成（§4.3） | 操作/调用（真实入参调用点反推）/权限（降级提示）三角；主子应用通信单独理清 | — |
| 7 | 跨项目缝合（§4.4） | 域知识"只缝合不重造"，沿系统间调用与消息接成端到端旅程 | — |
| 8 | 消费管线（§5.1） | okf-knowledge-read 6 步：意图→发现（index+type-registry）→粗筛精筛→摘要优先→追链→按 7 Type 分组注入 | — |
| 9 | 蒸馏闭环（§5.2） | 两源（master 代码+过程产物）→distill 蒸馏（三维：业务知识/开发经验/人维度经验）→人工确认→合并；AI 不擅自覆盖 | — |
| 10 | 生命周期四步（§5.3） | 建档（绑负责人）/蒸馏反哺/冲突确认/过期治理（置信度三态：续期/降级/归档） | — |
| 11 | AB 实验（§5.4） | 同提示词同需求同仓两组对照：A 知识库 542s vs B 裸代码 967s（≈44% 提速，1.8 倍）；A=8 篇知识+3 源文件 vs B=16 源文件；A 多发现两隐藏阻塞点（跨仓缺自动重试/配置白名单静默失败） | C 级自报 |
| 12 | 用例即资产（§六） | 用例挂业务锚点+代码锚点（接口/实现文件/表）；git diff 四路反查：直接命中→必跑 / 接口命中→应跑 / 数据面命中（views 反查）→应跑 / 链路扩散→建议跑 | 4 业务组采纳率 90-100% |

## 二、吸收裁决表（对照 swarm-yuan 现状）

| 文章机制 | swarm-yuan 既有对应物 | 裁决 |
|---------|---------------------|------|
| 生产前移论断 | 流A 探查期一次生成、流B 只消费 | 吸收为理念佐证（档 §二） |
| OKF 四要点 | reference-manual 单文件地图模式 | 吸收为粒度决策参考（档 §七；裁决=保单仓地图模式，原子化须先保计数核验+last-good 两执法线） |
| 只写可查证事实+待澄清 | extracted/inferred/ambiguous 三级标记 + 多源矛盾裁决序 | 部分已有；净吸收=悬置清单回填协议（exploration-guide） |
| views/ 反向索引 | relations.jsonl 边集 + relations-query.sh + --impact | 已有，不重复吸收（档内对账注记） |
| 三层架构·角色化知识层（测试/产品/运营） | 目标技能=研发单角色场景 | **不吸收**（场景超界） |
| 领域纵向跨仓缝合 | 单仓边界（R21 边集即单仓） | **不吸收**（未来方向，档内注记） |
| build-* 技能族/文档产量/京东栈（JSF/JMQ/京ME） | — | **不吸收**（装配叙事，R37 裁决沿用） |
| 6 步读取管线 | 流B ② 两步指引（配方→地图） | 吸收=六步协议增注（SKILL.md ② + template-spec workflow 节点②） |
| 蒸馏闭环+三维+人工确认门 | memory-writeback 三路写回 + 问题沉淀三载体 + mark-active 三关核验 | 已有同构；档内三维对账表（§四） |
| 过期治理三态 | 指纹 --diff + last-good 红线（两态：更新/拒写） | 吸收=条目级三态处置（SKILL.md 反馈回路 + README；与红线正交） |
| 精准回归四路反查分级 | --impact diff 反查 warn + §19 回归范围声明字段 | 吸收=分级推导协议（template-spec 左移要求；边集为底座） |
| 前端页面三角 | exploration-guide 前端节（构建配置层面） | 吸收=页面三角要点（操作/调用点反推/权限+微前端通信） |
| AB 实验法 | verifier 司法理念 | 吸收为价值对照法（档 §七，数字 C 级标注） |
| 平台化/"知识找人"展望 | — | **不吸收**（展望非机制） |

## 三、外部锚点核验记录（2026-09-24）

- **OKF**：Google Cloud 官方博客《How the Open Knowledge Format can improve data sharing》直查确认——"a directory of markdown files representing concepts: Each concept is one file. The file path is the concept's identity"；"OKF requires exactly one thing of every concept: a type field"；index.md/log.md 为**可选**保留文件（渐进披露/变更史）。与文章转述一致。差异点：**"宽容消费"官方博客未明示**（仅 type 必填隐含），载体标注为文章转述。规范正文在 github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf（未逐条核验，v0.1 单页规范）。
- **Karpathy LLM Wiki**：文章转述，未独立核验（C 级，载体仅出处注记）。

## 四、落地清单与守恒核验

- 新档：references/knowledge-lifecycle-methodology.md（四段协议 + 对账表 + 粒度决策 + 不吸收清单）。
- 接线五处：SKILL.md（②读法/反馈回路三态/第六层引用）、README.md（结构通道三态句）、template-spec.md（workflow 节点②回归分级指引 + 左移要求·测试左移分级协议）、exploration-guide.md（前端页面三角 + 悬置清单回填协议）。
- 载体：facts.conf FACT_REFERENCES 45→46；CHANGELOG v2.21.0；design-evolution 决策 41。
- 守恒：门禁 55 不变（零新增 check_*）；FACT_RUNTIMES 13 不变（不登记新运行时——文章是方法论源非运行时）；弧线表不加行（新概念全部挂到既有诞生步/消费方格内）；认知面预算实测见本轮 self-check 输出。
