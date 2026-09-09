# AutoDev 融合知识库 (phodal/auto-dev)

> 来源：2026-08-27 调研微信文 mp.weixin.qq.com/s/d6iObeZh1NE4EJcUJKzTbg + clone 仓库 commit 23777fe
> 用途：未来融合 AutoDev 类「多智能体编码平台」时的可移植模式速查。非镜像，浓缩决策用事实。

## 项目定位
- AutoDev 3.0 Xiuper (Alpha)，@phodal (ThoughtWorks)，Kotlin Multiplatform，MPL 2.0，4.5K star
- 口号：One Platform. All Phases. Every Device.
- 定位差异 vs Copilot/Claude Code：不是「建议代码」而是「自主把代码写完」(规划/编码/构建/测试/Git)

## 四层 AI 友好架构 (官网 ide.unitmesh.cc)
1. 基础规范与知识结构层 2. 交互情境化层(RAG+Tool Memory) 3. 引导生成与验证层(VFD 验证优先) 4. 持续改进反馈层(闭环)

## 内置 Agent 阵容 (6)
DocumentAgent / CodingAgent / CodeReviewAgent / ChatDBAgent / ArtifactAgent / WebAgent

## SubAgent 微架构 ("Agent 即工具")
NanoDSL / PlotDSL / Analysis / Codebase Investigator / Domain Dict / Error Recovery / SQL Revise / E2E Testing
(CodingAgent.kt:123-147 registerSubAgent；SubAgent.kt:27 继承 Agent，独立上下文)

## 可移植源码锚点 (file:line)
| 能力 | 位置 |
| 错误自愈 | mpp-core/.../recovery/ErrorRecoveryManager.kt:26 handleToolError + :66 shouldAttemptRecovery(关键词分类) |
| 错误诊断 | .../subagent/ErrorRecoveryAgent.kt:57/:82 execute → RecoveryResult(:443: shouldRetry/shouldAbort) |
| 领域字典 | CodingAgent.kt:100 DomainDictAgent；indexer.DomainDictService |
| 代码调研 | .../subagent/CodebaseInvestigatorAgent.kt:93 maxTurns=5 |
| 计划状态 | .../agent/plan/PlanStateService.kt:16 currentPlan:StateFlow |
| 被动观测 | provider/observer/AgentObserver.kt:11 + TestAgentObserver.kt:44 onTestFailed |
| 遗留迁移 | mpp-idea/.../devti/bridge/Bridge.kt (命令族 sealed 类) |

## 可移植模板 1：错误自愈分类关键词 (ErrorRecoveryManager.shouldAttemptRecovery)
- shell/build: `compilation failed|build failed|test failed|dependency|gradle|maven|npm|yarn|syntax error|cannot find symbol|unresolved reference|permission denied|command not found`
- file: `no such file or directory|file not found|access denied|directory not found|path does not exist|file locked`
- general: `timeout|connection|network|temporary|retry`

> 移植法：把上游 Manager 的正则/关键词表直接搬为 skill 的 Step 2 分类表，比让 LLM 自由判断更可靠、可审计。

## 可移植模板 2：Bridge.kt 命令族 (遗留迁移)
- Assessment(SCC/Dependencies) / Target(Docker/BuildTool) / Security(Semgrep/Snyk/Bandit)
- ArchViewCommand(webApiView/containerView/componentView/codeView)
- CodeTranslation(jscodeshift/OpenRewrite/VueMod/JSShift)
- DatabaseMigration(Flyway/SQL) / ApiTesting(Schemathesis/Swagger/JMeter)
- ContinuousDelivery(JenkinsFile/BuildKit) / Containerization(Docker/Podman/Colima)

## gap 判定 (× Hermes 现状实测)
- 理念层 / VFD / 多LLM / SubAgent / MCP → 已对等或领先
- 架构层 (跨IDE / KMP全设备 / 内部计划订阅) → **N/A（不适用，非缺失）**
- 可落地 gap：#1 错误自愈 #2 领域字典 #9 遗留迁移 → 均已补为 `software-development/` 下 class-level skill
- 观察项：AutoDev-as-MCP-server 模式（当前架构无需求，不补）

## 融合纪律 (Hermes 落地时修正上游缺陷)
- 上游 `maxTurns=100, terminateOnError=false` 无限重试 → Hermes 强制 ≤2 轮 + block（fail-closed 兜底）
- 零新代码：全部用提示词 + 机械校验 skill 落地，复用既有 agent-* / plan / kanban
- coding worker SOUL 注入：前台会话可 patch；后台会话改用独立 skill 交付（见 pitfall 19）
