> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 任务类型 × 方法论路由表

# 任务类型 × 方法论路由表

> 来源：[tanweai/pua](https://github.com/tanweai/pua)（方法论智能路由理念；methodology-router）。
> pua 按「任务类型 → 大厂味道 + 方法论」路由（Debug→华为RCA、新功能→Musk Algorithm）。
> swarm-yuan 路由的是「**任务类型 × 项目形态 → 生成流程节点序列 + 门禁聚焦**」——
> 不路由"味道"（swarm-yuan 无 PUA 话术），路由"该跑哪些节点 + 聚焦哪些门禁"。

## 核心理念

swarm-yuan 的 13 步生成流程是线性的（Step 1-13，唯一编号口径见 generation-flow.md【生成器侧】），但不同任务类型的关键节点不同：
- **新项目生成**：全 13 步 + compliance 档合规矩阵
- **框架规则注入**：Step 3（探查框架）→ Step 4 框架深化与门禁注入→ Step 12（记忆写回）+ framework-gates 四要素核验
- **升级已有技能**：Step 4（项目形态重判）→ Step 7（填充，保留 PROJECT_SPECIFIC_FILES）→ Step 12（记忆写回）→ Step 13（最终检查）
- **合规审计**：Step 5（特征卡含合规基线）→ Step 8（合规门禁配置）→ Step 9（集成拓扑）→ Step 13（fail-closed 核验）+ industry-profiles

**路由表的价值**：避免「所有任务都跑全量 13 步」的浪费，聚焦关键路径。

**路由三维度**：节点序列（跑哪些步）+ 门禁聚焦（守哪些门）+ **方法论分派（读哪些参考文档）**——第三维见下方路由表：开工时按任务类型直接查该读什么。

## 路由表

| 任务类型 | 触发信号 | 关键节点序列 | 门禁聚焦 | profile 档 |
|---------|---------|-------------|---------|-----------|
| **新项目生成** | `generate-skill.sh <name> <project-dir>`（无 --upgrade） | 全 13 步（Step 1-13） | --all-full（标准 28）+ 按需 --compliance-suite | auto（默认 standard，合规信号→compliance） |
| **框架规则注入** | `--inject-frameworks` 或 ACTIVE_FRAMEWORKS 变更 | Step 3（探查框架）→ Step 4 框架深化与门禁注入→ Step 12（记忆写回） | 框架四要素核验（计数/规则/函数/约束）+ --framework <id> exit 0 | 继承现有 profile |
| **升级已有技能** | `--upgrade <name> <project-dir>` | Step 4（项目形态重判）→ Step 7（填充，保留 PROJECT_SPECIFIC_FILES）→ Step 12（记忆写回）→ Step 13（最终检查） | --verify-completeness + 维度计数核验 + 框架四要素 | 继承现有 profile |
| **合规审计** | `--compliance-suite` 或 compliance 档项目 | Step 5（特征卡含合规基线）→ Step 8（合规门禁配置）→ Step 9（四权分离拓扑）→ Step 13（Z3 fail-closed 核验） | --compliance-suite（合规 19：sbom/crypto/dengbao/pia/sast-deep/oss-eval/release-sign）+ 行业 profile | compliance |
| **占位符修复** | `--verify-completeness` 报占位符残留 | Step 7（填充缺失文件）→ Step 8（conf 占位符）→ Step 13（复验） | --verify-completeness --strict（列 file:line）+ self-check 数字漂移 | 继承现有 profile |
| **门禁 fail 修复** | precheck.sh --all-full 报 fail | Step 8（conf 调整）→ Step 10（重跑门禁）→ Step 12（记忆写回） | gate-runs.jsonl fail-id 级断言 + conf-render.sh 重嗅探 | 继承现有 profile |
| **数字漂移修复** | self-check.sh 报文档数字与 facts.conf 不符 | Step 7（文档同步）→ Step 13（self-check 复验） | self-check.sh --check-only（数字漂移检测） | N/A（生成器自身维护） |
| **Oracle Gate 循环** | `setup-loop.sh` 启动 | 无固定节点——AI 自主迭代直到 verify_command 通过 | verify_command（默认 self-check + precheck --all-full） | 继承现有 profile |
| **架构设计/演进类变更** | spec 变更触及服务划分/数据模型重构/技术选型/迁移升级 | Step 3 探查加 §D.0.6 四层枚举（TOGAF BDAT）→ Step 7 spec 填 §24 架构映射（四层+纵向链验证） | --adr + --contract + --consistency-cross + --impact（治理三角已机器化）+ spec §24 纵向链完整性 | 继承现有 profile；纯编码/文案类不触发（适配矩阵 ★★+ 才路由，见 togaf-metamodel-methodology.md §4） |

## 路由决策准则

1. **任务类型从命令/意图识别**：`--upgrade` → 升级；`--inject-frameworks` → 注入；`--compliance-suite` → 合规审计；其余 → 新项目生成
2. **profile 从项目特征识别**（auto_detect_profile）：合规关键词命中 → compliance；文件数 <80 → lite；其余 → standard
3. **门禁聚焦取并集**（质量优先取更重档）：任务类型基础集 + 规模档叠加，两者取并集
4. **Oracle Gate 是逃生舱**：常规路由搞不定时（self-check/precheck 持续 fail），启动无限迭代模式让 AI 自动修到通过

## 文档路由表（任务开工该读什么）

> 本表与文档索引（capability-map.md，生成器仓维护）配套：那张表从**文档**查"它在哪里被使用"，本表从**任务**查"开工该读什么"——48 份参考文档由此全部可达。表内序号（②⑤⑦…）是执勤工作流（开发工作流，目标技能 references/workflow.md）的节点号；【必】=该任务必读，【按】=命中条件才读。覆盖纪律：`*-methodology.md` 每份必须能从本表查到（生成器自检的 G25 断言把关）。
> **可及性**：本表引用的文档都随目标技能分发（在生成器 UNIVERSAL_FILES 分发清单里，拷进目标技能 references/ 直接可读）；标【生成器侧】的文档只在生成器仓里存在——引用它的任务在生成器里做，不会进目标技能。同样由 G25 断言把关。

| 任务类型 | 触发信号 | 该读的参考文档（按执勤工作流节点序） |
|---------|---------|---------------------------|
| **feature（新功能）** | 分支 feat/*、用户开发需求 | ①【按·需求模糊】mattpocock-skills-methodology（访谈协议 §一）→ ②【必】knowledge-lifecycle（读法六步）+【按】mattpocock-skills-methodology（spec 测试缝/防腐 §二）→ ③【按】mattpocock-skills-methodology（纵切拆分 §三）+ cost-estimation-methodology（§25 估算）→ ⑤【必】lazy-generation（先查再写）；复杂变更加 subagent-orchestration（任务图并行实现）、长任务加 mea-loop-methodology；⑦【必】review-methodology → ⑧ decision-governance（用户确认点）；全程 ai-process-records |
| **fix（缺陷修复）** | 分支 fix/*、报障 | ②【必】knowledge-lifecycle（影响面查法）→ ⑤【必】lazy-generation +【按·硬 bug】mattpocock-skills-methodology（诊断回路 §四：反馈回路先行/red-capable/可证伪假设）→ ⑦【必】review-methodology（回归面=修复点+相邻路径）；全程 codex-methodology（执行纪律）+ ai-process-records |
| **refactor（重构）** | 分支 refactor/* | ②【必】knowledge-lifecycle（影响面）→ ③【按·架构类】togaf-metamodel-methodology（§24）/ cordis-composability-methodology（可组合性）→ ⑤ lazy-generation → ⑦【必】review-methodology |
| **test（测试）** | 分支 test/* | ⑦【必】review-methodology（测试有效性判定）+ 回归分级（template-spec §19【生成器侧】，执勤侧载体是 spec §19 本身）；长测试计划 mea-loop-methodology |
| **docs（文档）** | 分支 docs/* | ②【必】knowledge-lifecycle（知识四阶段协议，文档即知识）→ ⑦ review-methodology（三方一致核对） |
| **chore（杂务/依赖）** | 分支 chore/* | ⑤【必】codex-methodology（版本锁定例外四条件）；全程 ai-process-records |
| **exp（实验）** | 分支 exp/* | 全程【必】ai-process-records（实验不入 main 须留痕）；长实验 mea-loop-methodology |
| **架构设计/演进类** | 触服务划分/数据模型/选型 | ③【必】togaf-metamodel-methodology + four-theories-methodology（【生成器侧】系统建模/划边界）→ ⑤ cordis-composability-methodology → ⑦【必】review-methodology |
| **前端/UI 类** | 含页面/组件/交互 | ③【必】frontend-design-methodology（Modes/三层权威）→ ⑤ lazy-generation → ⑦ review-methodology |
| **安全类** | 含认证/加密/权限/输入处理 | ③【必】codex-security-methodology（威胁建模五要素）→ ⑦ review-methodology |
| **治理机制设计** | 改 swarm-yuan 自身门禁/hooks/流程 | ③【必】four-theories-methodology（【生成器侧】门禁拦得住/拦太多评估）+ dsh-engineering-methodology（【生成器侧】审计/状态韧性）+ agent-skills-methodology（Prove-It 自证）→ ⑦【必】review-methodology |
| **发布/运维类** | 灰度/监控/runbook | ⑨【必】canary-monitoring（发布后基线对比）+ ai-process-records |
| **验收/交付类** | 何时可宣称完成 | ⑦【必】agent-skills-methodology（Prove-It 五步/自治硬停）+ review-methodology +【按·改进型变更】rsi-evidence-methodology（三类证据分离：任务增益/能力保留/改进器增益各给一句） |
| **记忆/知识沉淀类** | 记忆写回/知识更新 | ⑧【必】memory-persistence（工具族/蒸馏）+ knowledge-lifecycle-methodology（过期三态） |

**生成侧任务同样按本表分派**（叠加在上表"路由表"节点序列之上）：升级已有技能 → 加 knowledge-lifecycle（反馈回路三态）+ memory-persistence（记忆写回）+【生成器侧】rsi-evidence-methodology（吸收与升级收口的三类证据对账）；合规审计 → 加 four-theories-methodology（剪裁评估）+ quality-management-standards（【生成器侧】认证资产映射）。

**其余档按场景补充到达**：计划/状态管理 → gsd-patterns；方案对抗 → logic-razor + cognitive-bias（spec §16）；治理拓扑 → governance-agents；MCP 接入 → mcp-governance；图谱工具 → code-graph-tools；宿主原生能力 → claude-code-capabilities；规则分层 → context-engineering-layering（【生成器侧】）；领域规律 → domain-knowledge；**人面输出（会话回复/进度汇报/回归轮报告/审查意见）→ controlled-language-methodology（全任务类型全程适用）**。安全合规族（crypto-spec/cwe-database/security-certification-profiles/standards-compliance/行业八档）不走任务分派——由 `--security`/`--industry`/compliance 档门禁条件加载。

## 与 pua methodology-router 的差异

| 维度 | pua | swarm-yuan |
|------|-----|-----------|
| 路由对象 | 大厂味道（旁白风格）+ 方法论（行为约束） | 生成流程节点序列 + 门禁聚焦 + 方法论档分派 |
| 路由依据 | 失败模式（原地打转/放弃/质量差/没搜就猜/被动等待/空口完成/思维固化） | 任务类型（新项目/注入/升级/合规/修复） |
| 切换信号 | PostToolUse hook 检测失败模式 → 切味道 | 命令参数 + 项目特征 → 选节点序列 |
| 切换后果 | 换旁白风格 + 换方法论步骤 | 换跑哪些节点 + 聚焦哪些门禁 |
| 叙事 | PUA 话术（阿里味/华为味/Musk味...） | 无叙事（swarm-yuan 用三权分立隐喻，不用 PUA） |

## 与现有机制的关系

- **与 task-type-gates.conf 的关系**：task-type-gates.conf 是「任务类型 → 门禁命令映射」（feature→--all-full；fix→--all --reuse），本路由表是「任务类型 → 生成流程节点序列 + 方法论档分派」，三者互补——门禁 conf 管运行什么门禁，节点表管跑哪些生成节点，路由表管读哪些方法论档。
- **与 capability-map 的关系（互为反查）**：capability-map 是正向索引（档 → 消费节点/触发），本表文档路由表是反向索引（任务 → 档）——两表互为反查；`*-methodology.md` 每档必须可从本表分派到达（self-check G25 文档路由覆盖断言守），吸收层由此闭环：建档必整合（正向）、整合必可达（反向）。
- **与 profile 档的关系**：profile（auto/lite/standard/compliance）管生成什么文件集，路由表管跑哪些节点——compliance 档 + 合规审计任务 = 全节点 + 合规门禁聚焦。
- **与 Oracle Gate（E1）的关系**：路由表是常规路径，Oracle Gate 是非常规逃生舱——常规路由持续 fail 时切到无限迭代模式。
- **与四权分离拓扑（E3）的关系**：compliance 档 + 改治理资产任务 → 路由表指向 Step 7 强制走四权分离拓扑。

## 使用方式

AI 在开工（Step 1 自检/任务路由）时读本表，按任务类型选节点序列 + 门禁聚焦，在 trace-log 公告路由结果：

```
→ [任务路由] 合规审计 → 节点序列 Step 5/8/9/12（同路由表行）→ 门禁聚焦 --compliance-suite + Z3 fail-closed
```

用户也可手动指定：`/swarm-yuan <项目路径> --task-type compliance-audit`（AI 按指定类型路由，不自动识别）。

5. **流程档位之外还有代码引入档位**：路由表调的是"跑哪些节点"（流程仪式复杂度）；写入新代码前的"先查再写"下探顺序（已有吗→标准库→平台原生→已装依赖→一行→最小实现）是另一维档位，见 `lazy-generation-methodology.md`——两档正交：小任务轻流程不豁免复用检查，大任务全流程也不禁止层 6 一行解。
