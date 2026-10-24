# R37：《Harness实践》上下篇调研与吸收（2026-09-18）

> 来源：行者明灵《Harness实践：OpenSpec + Superpowers + CodeGraph + Ponytail + Caveman + RTK》上篇（2026-09-16，https://mp.weixin.qq.com/s/OfGmlh8R6PHdvyjoz34Gsg）+ 下篇（2026-09-17，https://mp.weixin.qq.com/s/ECw5lXpCw54iPdtn9PYaMw）。
> 性质：整合实践文章吸收——七上游对象（3 已在册 + 4 新核验），文章自带 A/B/C 证据分级与时效性清单方法论（本身即吸收对象）。
> 证据分级（本档全程口径）：A=本机实测（GitHub API / 本仓 research/comet 克隆源码与 README 直查 / 本机命令）；B=官方一手（上游 README/benchmark 直查）；C=文章转述（未经本机核实）。

## 一、四新对象仓库核验（文章指针全部重核，A 级）

| 对象 | 文章指针 | 本机 API 核验（2026-09-18） | 处置 |
|------|---------|---------------------------|------|
| CodeGraph | colbymchenry/codegraph，MIT | ✓ 71,356★ / MIT / 2026-01-18 创建 / 2026-09-16 仍推送 | **进基线表第 17 行**（watch，登记未接线）+ code-graph-tools.md 第三选型 |
| RTK | rtk-ai/rtk，Apache 2.0 | ✓ 80,864★ / Apache-2.0 / 2026-09-18 仍推送（本机 0.49.0 已装） | 机制吸收（改写胜过说教/tee 底牌/bytes÷4），不进基线表（宿主层工具，无 swarm-yuan 接线面） |
| Ponytail | DietrichGebert/ponytail，MIT | ✓ 141,551★ / MIT / 2026-06-12 创建 / 2026-09-14 推送 | 机制吸收（七层阶梯），新建 lazy-generation-methodology.md 随发；不进基线表 |
| Caveman | JuliusBrussee/caveman，Skill=MIT/Proxy=BSL-1.1 | ✓ 106,373★ / API NOASSERTION（混合许可与文章一致）/ 2026-09-17 推送 | 机制吸收（不可压缩物清单+诚实警告）；Proxy/Engine=BSL-1.1 零接触（GitNexus PolyForm 处置同构）；不进基线表 |

已在册三对象（comet 0.4.1 / openspec 1.13.1 / superpowers 6.3.0）：文章版本口径（0.4.0-beta.20 / 1.11.0 / 6.3.0）均落后本仓基线，无版本动作；价值在其披露的实操层机制（见 §二）。

**源码核实修正项**（媒体报道要源码核实纪律的直接收益）：
- 文章"Shape→Build→Verify→Archive"相名在克隆 0.4.1 未见——A 级证实的是 native CLI 门面存在 + classic 状态机 `workflow!=="full"` 时 Open 直进 Build（仪式裁剪机制本身成立），相名登记为文章用语。
- comet 官方评测数字（−76.8%/−57.4%/−47.4%/pass^3 87.5%）与 hook.allow_paths 语义在克隆 README L57/L208 直查可证——从 C 级升 B/A 级后才写入载体。

## 二、机制吸收清单（载体落点）

| # | 机制 | 来源 | 载体 |
|---|------|------|------|
| 1 | 七层懒人阶梯 + 懒≠偷工四不砍 + issue #126 基线伪影教训 + 装完≠激活（trusted_hash） | Ponytail | **新建** `references/lazy-generation-methodology.md`（随发执勤侧） |
| 2 | 上下文三漏（读/拿/说）+ 改写胜过说教 + tee 底牌 + bytes÷4 诚实稀释 + 不可压缩物清单 + Caveman/RTK Proxy 不引用声明 | RTK + Caveman + 文章框架 | `context-engineering-layering.md` §十一（R37 增补） |
| 3 | pass^3/pass@3 双口径评测判据 + 裁判运动员四重分离 + 独立只读 Verifier + 评测集纪律 | comet eval（README 直查） | `review-methodology.md` R37 条目 |
| 4 | comet 实操层七机制（Native 四相 / Verifier / resume-probe 四值 / allow_paths / doctor 判据 / eval 分离 / 官方数字）+ Superpowers 三引擎安全审查附记 | comet + 文章 | `subagent-orchestration.md` comet R37 增量段 |
| 5 | 工具面设计三原则（单强工具 / CLI 覆盖子代理盲区 / 生效=多前提同时就位） | CodeGraph + 文章 | `mcp-governance.md` 工具面三原则节 |
| 6 | Codex hooks 事件面（11 类）/ matcher 正则 / trusted_hash / 多来源并发 / timeout 语义 / hooks=false 披露 / $@语义 | 文章下篇实测（C 级，宿主基线 0.154.0） | `codex-methodology.md` R37 版本注记 |
| 7 | 三种熵分类学（流程熵/代码熵/上下文熵——正交治理面） | 文章上篇 | `four-theories-methodology.md` 信息论篇 |
| 8 | CodeGraph 第三图谱选型（含 +80% 上下文残留官方诚实声明、未本机实测披露） | CodeGraph | `code-graph-tools.md` 选型表 + 三者对比表 |
| 9 | 流程档位×代码引入档位正交声明 | 本轮综合 | `task-methodology-router.md` 路由决策准则 #5 |
| 10 | A/B/C 证据分级口径（媒体报道默认 C 级，核实后才可升级入引用基线） | 文章自带方法论 | `docs/upstream-baseline.md` 证据分级口径注 |

## 三、同构对照（吸收前找同构，拓扑不重复吸收）

| 文章机制 | swarm-yuan 既有同构 | 增量性质 |
|---------|--------------------|---------|
| 独立只读 Verifier | 三权分立（特征卡立法/门禁执法/verifier 司法） | 方向验证级（上游第二实证） |
| 路由门禁表（什么走全流程） | task-methodology-router | 已覆盖，仅补档位正交声明 |
| fail closed / 防漂移三层链 | fail-gate-hook + 状态机 + rules.d | 已覆盖，不重复吸收 |
| Context Compression 交接包 | comet R20 已吸收（subagent-orchestration 表） | 零增量 |
| 单强工具 vs 17 工具 | code-graph-tools 平权选型 | 增选型维度（非替换） |
| 熵减 | 控制论吸收（four-theories） | 增分类学透镜 |

## 四、不吸收清单（显式登记）

- **RTK 代理接线/命令改写路由表**：宿主层工具（用户环境已有 rtk-bridge），目标技能不接线；crates.io 同名包陷阱（brew install rtk 才是正主）登记于此。
- **Caveman Proxy/Engine（BSL-1.1）**：非 OSI 开源零接触；电报体话术层不引入（门禁驱动开发天然简洁，吸收的只是边界清单）。
- **Ponytail 六 skills / 20 宿主插件形态**：不 vendor 上游 skill（superpowers 不 vendor 决策 A8 同构），只蒸馏方法论。
- **Comet Native 四相直接改造目标技能 workflow 模板**：登记候选（见 §五），不做行为面大改。
- **文章五问框架/分层原则叙事**：纯叙事框架，机制已逐项落载体，不另立文档。
- **装配/安装器类内容**（用户裁决，2026-09-18 收口后追加指令"去除脚手架相关内容"）：吸收机制、不吸收装配叙事——已从载体移除 codegraph"自动为 9 类 Agent 写 MCP 配置"（选型表/对比表/基线行三处）、comet init 接入语境（Superpowers 附记改为纯机制句）、Codex 插件安装行为、Ponytail 生命周期 hooks 安装面（SessionStart/SubagentStart/UserPromptSubmit 罗列，保留"装完≠激活"机制句）。原则回写本仓方法论吸收口径：上游的安装器/骨架装配行为描述属脚手架内容，一律不进载体。

## 五、候选登记（已登记未实施）

| 候选 | 触发条件 |
|------|----------|
| 目标技能 workflow 轻流程变体（Native 四相同构：按模型/任务档砍仪式） | 强模型档执勤出现仪式过重实证 |
| state-machine.sh 增 resume-probe 恢复探测子命令（四值） | 执勤侧出现会话中断恢复真实需求 |
| self-check 增"恰好一个受管入口"判据（doctor 同构） | 多入口重复注册真实案例 |
| ⑤编码"造轮子拦截 hook 化"（层 2 未命中且新增 >N 行 warn） | lazy-generation 执勤侧出现重复造轮子案例 |
| codegraph 升级 synced/接线 | 本机跑通一次索引+查询（A 级） |

## 六、载体与计数变更对账

- references 44→45（lazy-generation-methodology.md）；UNIVERSAL_FILES 70→71（同文件随发）；FACT_ARTIFACT_BYTES_BUDGET 第七次登记 303104→317440（实测 313499B，功能性增量逐例登记）。
- 基线表 16→17 行（codegraph 行，watch）；口径注/表题/行数断言同步；FACT_RUNTIMES=13 不变（codegraph 是图谱平权选型，非接线运行时）。
- README（swarm-yuan/README.md）外部方法论 12→13 份 + 懒生成能力行；SKILL.md 第六层方法论清单 +lazy-generation。
- 门禁 55 不增（决策 26/27）；零新 check_*，全部纯文档/登记载体。

## 七、时效性声明

本档星数/版本号为 2026-09-18 快照：codegraph 71,356★、ponytail 141,551★、caveman 106,373★、rtk 80,864★、本机 rtk 0.49.0；comet 克隆 tag 0.4.1。文章时效信息（以文章时点为准）：Comet 0.4.0-beta.20 / OpenSpec 1.11.0 / CodeGraph 1.6.0 / RTK 0.45.0 / Codex 0.150.1 / Ponytail 4.9.0 / Caveman v2.3.1 / Superpowers 6.3.0。
