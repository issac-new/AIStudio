# RedEvoAgent 融合裁决矩阵（2026-10-23）

> 任务：深入调研微信转述文 + 完善 hack teams。
> 执行：orchestrator（TUI 直执行，article-methodology-fusion 流程）。
> 主落点：`~/.hermes/skills/hack-team/llm-redteam/`（v1.6.0 → v1.7.0）+ `references/redevoagent-20261023/` + `_shared/hack-knowledge-index.md` §六。

## 一、来源与存档（三源）

| 源 | 内容 | 存档 |
|---|---|---|
| 转述文（导读） | 蜜罐先生《RedEvoAgent：基于技能进化的自动红队智能体，攻得更准、调得更少》 https://mp.weixin.qq.com/s/lm4J3hEqDFgAdMwFy026tQ | `wechat-article.md`（5,689 字符） |
| 一手·论文 | Zhang, Liu, Chen, Mo, Chen, Li（香港城市大学/深圳北理莫斯科大学）《RedEvoAgent: Automatic Red-Teaming Agent with Experience-Driven Skill Evolution》arXiv 2608.27439（2026-08）https://arxiv.org/abs/2608.27439 | `arxiv-v1.html` / `arxiv-v2.html` / `arxiv-paper-v2.txt`（54,237 字符，v2 全文已通读） |
| 一手·配套仓库 | yechao-zhang/red-team-agent-skills（Claude Code red-team skill：payload 模式库/成功判据/套娃攻击/双审批绕过/transport 自检） | `github-readme.md` + `gh-*.md` 8 件 + `github-tree.json`（719 路径） |

## 二、已收基线对账（防重复融合）

- 关键词横扫（`RedEvoAgent|skill evolution|技能进化|验证棘轮|validation ratchet|deciding-tool|experience-driven`）扫 `~/.hermes/skills/hack-team/` 全部 47 技能 + `~/.hermes/shared/`：**hack 资产零命中**。
- 唯一命中 `wx-onto-ddd-20261021/corpus-onto/2247510030-1.json`：为 DDD 语料中的英文短语 "experience-driven"，与 hack 域无关，排除。
- 昨日调研 `hexstrike-cyberstrike-20261022`（HexStrike/CyberStrike 攻击工具框架）异源异主题，grep 技能进化关键词零命中，无重叠。
- 结论：**首次融合，无重复收录风险**。

## 三、机制清单与裁决矩阵（20 行）

判定口径：吸收（落新节）/ 收缩吸收（机制成立但只取纪律子集，注明收缩依据）/ 等效印证（集群已有等效物，加引用不建机制）/ 不吸收（附理由）。

### P 系：论文机制（11 行）

| # | 机制 | 判定 | 理由与落点 |
|---|---|---|---|
| P1 | 执行环境配对目标观：目标=(模型, harness)，同模型换 harness 抗性谱不同；jailbreak 后果=命令执行/数据外传/状态篡改 | 吸收 | llm-redteam 缺 harness 维度 → 新节「执行环境配对目标观」+ When to Use 补行 |
| P2 | 混合工具箱四类覆盖：梯度/模板/语义伪装/角色扮演 + 意图保持改写；单一技术跨目标不稳定实证（GCG 63.6 vs FlipAttack 91.8 vs 不越狱 72.5，迁移后缀在产品级 harness 反升拒绝率） | 吸收 | 新节「混合工具箱四类覆盖」——「防御有效」结论的最低覆盖门槛 |
| P3 | 工具效能画像：campaign 前对目标孤立测量各技术效能→经验排序；消融去掉后 ASR 93.2→76.9（-16.3，影响最大） | 吸收 | 新节「工具效能画像 preflight」；与 §10 攻击者模型选型互补（§10 选攻击者模型，本节测攻击技术对目标效能），分工写明 |
| P4 | 攻击技能文档：经验蒸馏为人类可读 Markdown（工具优先级+编排启发式），替代轨迹检索；轨迹检索实证反拖累（RedCodeAgent 37.5 vs 技能文档 74.3）；工具调用 3.0→1.8/2.2 | 吸收 | 新节「攻击技能文档」+ 报告必须附可读策略摘要的交付纪律 |
| P5 | 决定工具归因：成功归因到紧邻成功查询的技术，非共现频次；防自强化偏差→策略塌缩 | 吸收 | 新节「决定工具归因」；接线 attack_chain 报告字段与 failure-trace-index 留痕口径 |
| P6 | 验证棘轮+拒绝上下文+train/val/test 三分（test 锁定终评） | 收缩吸收 | 只收**更新准入纪律**（候选更新须在独立验证集严格超过在位版本才接受；拒绝记录防重复失败方向）；不建自动进化循环（Reflect/Rewrite/minibatch=8/L=6 管线）。收缩依据：集群无攻击者 agent harness、无基准判定器，自动循环属无前提基础设施；人工/半自动可执行纪律全量保留 |
| P7 | 棘轮深度边界：R4 验证分 18.5→28.1 但测试分 28.8→20.8（验证集过拟合，技能塌缩到反复采样 FlipAttack/RolePlay）；缓解=验证集多样化 | 吸收 | 新节「棘轮深度边界」——进化轮数上限+验证集多样化+更新后抽测 |
| P8 | 零样本迁移生命周期：技能跨攻击模型 +5.6/+7.3pp、跨 harness +9.7pp，保留大部分效果但低于针对性进化 | 吸收 | 新节「迁移生命周期与收益区判断」——迁移=初筛，终评须目标重进化 |
| P9 | 技能何时有用判据：抗性不均+技术互补→收益大；单一技术近饱和→无空间 | 吸收 | 同节——campaign 前判收益区，防空烧预算 |
| P10 | Prompt Substitution 工具：辅助 LLM 改写失败提示词保持意图 | 收缩吸收 | 作为第五类技术命名并入工具箱分类表；不建 aux LLM 自动改写循环（与 P6 同收缩依据）。与 §6 自适应博弈有部分重叠：自适应博弈=按响应动态派生，本条=意图保持改写作为独立技术类，二者互补不重复 |
| P11 | GCG/AutoDAN/AmpleGCG 白盒优化实现（代理模型 Qwen2.5-7B 等） | 不吸收 | 集群无白盒代理模型/梯度优化基础设施；工具名保留为 P2 分类轴引用，不建实现 |

### R 系：配套仓库产物（9 行）

| # | 产物 | 判定 | 理由与落点 |
|---|---|---|---|
| R1 | payload 8 模式库（内部状态/完整配置/系统提示词/格式规范/reasoning rules/开发者模式/代码执行路径/嵌套委托）+原理/期望输出/后处理三件套+按目标类型自适应选择表 | 吸收 | `references/redevoagent-20261023/` 原件存档+SKILL.md 索引行；agent 内部提取专项（LLM07），按需取用 |
| R2 | 提取质量四级判据（FULL=系统提示词/PARTIAL=pydantic schema 或执行轨迹/FAILURE=无关）+机器可判指标（"You are"、$defs/$ref 等） | 收缩吸收 | 并入 references 存档与 SKILL.md 索引说明，定位为 §7 三态判定在提取类攻击的质量分级特化；不另立判分体系 |
| R3 | 嵌套委托攻击（套娃）：编排者→子代理委托链+文件系统环境泄露绕过响应过滤；高/低成功率场景+防御四条+变种+检测 | 吸收 | references 存档+SKILL.md「Agentic 攻击面/多 Agent 攻击」补向量；与 `security-domain-delegation` §7 智能体链权限纪律攻防对偶 |
| R4 | 双审批绕过：plan 审批+代码执行审批两道人审闸的浏览器自动化点击；审批不一致本身即漏洞 | 吸收 | references 存档；LLM06 审批关卡绕过执行面；防御启示（审批一致性+频次异常检测）写入索引说明 |
| R5 | 经典越狱库（AIM/DAN/Developer Mode/系统诊断等） | 不吸收 | llm-redteam 既有模板已覆盖同类（roleplay/开发者模式/系统提示泄露），收进=重复融合 |
| R6 | transport 自检层（Web UI/API/WebSocket/Gradio 自动检测代码） | 不吸收 | 基础设施代码，集群攻击执行走既有工具链（dev-browser/websec-toolbox 等）；不引入执行体 |
| R7 | probe 阶段：先探测子代理清单→动态生成载荷（防硬编码 agent 名） | 吸收 | references 存档+SKILL.md 索引行；对应本 skill Phase 1 侦察在多 agent 目标的特化 |
| R8 | NEVER SIMULATE RESULTS 规则（攻击必须实际执行，禁模拟结果） | 等效印证 | 集群「实测>推断」原则与报告复现链纪律已有等效物，加引用不建机制 |
| R9 | reports 目录模式（攻击报告落盘供未来模式学习） | 等效印证 | poc-evidence-snapshot/证据落盘纪律已有等效物，加引用不建机制 |

**判定计数（机械核验）**：吸收 12（P1-P5,P7-P9,R1,R3,R4,R7）/ 收缩吸收 3（P6,P10,R2）/ 等效印证 2（R8,R9）/ 不吸收 3（P11,R5,R6）= 20 行。

## 四、保真度分级（转述文 vs 论文一手）

- 转述文全部关键数字与论文 Table 1-4 逐一核对**一致**：93.2/91.8/72.5/63.6、74.3/67.9/37.5、93.2→76.9/85.0/87.5、3.0→1.8/2.2、R4 18.5→28.1 vs 28.8→20.8、迁移 90.5 vs 80.8 vs 92.8。
- 转述文遗漏（融合以论文补齐）：作者与机构、实验设置（ASB 400 例 80/40/280 切分、攻击者 GPT-4o mini、预算 B=20、棘轮 R=4/minibatch 8/编辑上限 6）、MAJIC/JailbreakOPT/SkillOpt 相关工作定位、Prompt Substitution 为论文自提出。
- 转述文无失实表述，定级：**高保真导读**，机制引用以论文为锚。

## 五、语境过滤与显式不吸收清单

| 不吸收项 | 语境理由 |
|---|---|
| 自动技能进化循环（P6 自动面） | 论文语境=大规模基准评测管线；本集群语境=人工/半自动红队卡作业，无攻击者 harness 与基准判定器 |
| GCG/AutoDAN/AmpleGCG 实现（P11） | 需白盒代理模型与梯度搜索栈，集群无此基础设施 |
| 经典越狱 prompt 库（R5） | 既有模板库已覆盖，收进=重复 |
| transport 执行代码（R6） | 集群已有等价执行工具链 |
| ASB/AgentHarm 评测管线 | 集群无此类基准评测场景 |

显式不吸收同时防后续 session 重复提议同一机制。

## 六、落地表

| 落点 | 变更 |
|---|---|
| `~/.hermes/skills/hack-team/llm-redteam/SKILL.md` | frontmatter version 1.6.0→1.7.0；When to Use 补 harness 目标行；新增「经验进化红队与执行环境测试面」节（P1-P5/P7-P10 纪律）；Source 补 v1.7 蒸馏注 |
| `~/.hermes/skills/hack-team/llm-redteam/references/redevoagent-20261023/` | 原始产物存档 10 件（论文全文/转述文/README/8 仓库产物）+ MANIFEST.json（sha256）+ how-to-use.txt（R1-R4/R7 使用说明+RoE 指针） |
| `~/.hermes/profiles/_shared/hack-knowledge-index.md` | §六 攻击技能文档载体登记（attack-skill-\<target\>.md + 验证棘轮写入门 + 决定归因，执行正本指针→llm-redteam v1.7）+ 修订记录 v1.4 行 + §五 既有 llm-redteam 版本引用对齐 1.7.0 |

## 七、验收记录（落地后回填）

见文末「验收结果」节（机械四查：新锚 grep 在位/版本一致/旧口径残留/载体计数）。

## 八、落地成色声明

- **语义落地**：P1-P5/P7-P10 纪律与 R1-R4/R7 知识已写入 llm-redteam v1.7 与 references；载体定义入 hack-knowledge-index §六。（2026-10-24 勘误：本文件写就此节时，SKILL.md 主落点与 knowledge-index 实际尚未写入——「已写入」为超前表述；同日由后续会话亲自通读论文核心节复核后补齐三落点，机械验收见文末「验收结果」。）
- **机制落地（部分）**：验证棘轮作为攻击技能文档的人工/半自动写入门定义在位，但无机械强制器（无自动化校验脚本拦截不合门写入）——升级路径=未来给 attack-skill 文档写入加检查脚本。
- **效力落地**：待首次实战（首个多 agent 目标红队 campaign 按新节作业并产出含技能摘要的报告后复评）。
- 蓝军评审：按 article-methodology-fusion 纪律降级为本验收（单主落点+无跨资产结构冲突+不新增基础设施）。

## 验收结果

（2026-10-24 补落地后回填，机械四查全过）

| 查项 | 结果 |
|---|---|
| 新锚 grep 在位 | ✓ SKILL.md「经验进化红队与执行环境测试面（v1.7）」节 + 七个小节（配对目标观/四类覆盖/画像 preflight/技能文档/决定归因/验证棘轮/迁移收益区）+ 仓库产物索引；knowledge-index §六 两小节在位 |
| 版本一致 | ✓ SKILL.md frontmatter `version: 1.7.0`；knowledge-index §五引用与修订记录均 1.7.0/v1.4；无意外旧版本残留（SKILL.md 内「1.6.0」仅存于 v1.6 历史蒸馏注，属正常记录） |
| 旧口径残留 | ✓ knowledge-index 全文无 v1.6.0 引用；llm-redteam v1.6.0 引用已对齐 |
| 载体计数 | ✓ references/redevoagent-20261023/ 12 件（存档 10 + MANIFEST.json + how-to-use.txt），与 MANIFEST 登记一致 |

补落地时的复核增量：执行会话未沿用本文件结论，逐节重读 arxiv-paper-v2.txt 方法论（§3.2-3.4）与实验区（Table 1/2/4、棘轮深度段），关键数字 93.2/91.8/72.5/63.6、77.5/78.3、3.0→1.8/2.2、76.9/85.0/87.5、+5.6/+7.3/+9.7、R4 18.5→28.1 vs 28.8→20.8 全部与原文一致。
