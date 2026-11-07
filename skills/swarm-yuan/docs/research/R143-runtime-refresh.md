# R143 运行时刷新＋吸收＋JVM 全栈回归＋发版轮（2026-11-07）

> 触发：用户指令——research 运行时更新到最新稳定版＋差异比较＋吸收优化＋全栈回归（vuejs/elementUI/spring framework/mybatis/sharding-jdbc/druid/spring batch/spring boot/dubbo/rocketmq 生成技能并做典型研发工作）＋缺陷排查修复＋发版 GitHub＋离线包（除 npm/pip 可安装插件外）。第九轮同型例行轮（R124/R132/R140/R141/R142 谱系），R142 后 13 天窗口。本档记运行时面与吸收；回归与发版实录见 §五与 CHANGELOG v2.100.0。

## 一、移动面（22 行多通道查新，2026-11-07 实测：18 移动 / 4 零移动）

| 运行时 | R142 基线 | 远端最新 | 判定 |
|---|---|---|---|
| claude-code | v2.1.310 | **v2.1.319**（+8 patch；2.1.313/2.1.315 跳版） | **移动·安全大版本**（auto mode 硬化：telemetry/feature flags 关闭或 LLM 网关后服务器无法核查的调用改询问或拒绝不回落内置分类器/**`permissions.denyInsteadOfPrompting`**：本会弹权限提示的调用直接拒绝并继续回合/**`permissions.blockWritesOutsideWorkingDirectories`**：全权限模式拒工作目录外写/Bash 环境变量前缀构造可对权限检查隐藏部分命令=权限绕过修复/sed 在 accept-edits/auto 模式跳权限检查修复/创建 worktree 沙箱逃逸修复/`--trust-workspace false` 阻止仓库 settings 内 hooks 与 skills/只读超大 CLAUDE.md 后 Write 整体覆盖=数据丢失防护/PostToolUse hooks 被新消息打断后仍跑（上限 10s）/MCP 长任务自动移后台/subagent effort 基线 `CLAUDE_CODE_SUBAGENT_EFFORT`/prompt hooks 并发上限 24/`CLAUDE_CODE_AUTO_MODE_SERVER=0` 保旧行为；证据=`git -C ~/lab/upstream/claude-code show origin/main:CHANGELOG.md` 2.1.311-2.1.319 段） |
| codex-cli | rust-v0.164.0 | **rust-v0.167.0**（0.165/0.166/0.167 三稳定版） | **移动·3 minor**（0.165：本地响应 future 丢弃时取消远端 MCP 工具请求/marketplace URL userinfo 反斜杠绕校验连未审核主机修复/托管网络审查域名先于 allow 规则注入/队列 agent 消息中断或切 Plan 后不自动重启；0.166：resume/fork 保留已确认 approval 与 permission/**状态变更类多代理调用改经 Guardian 审查**/共享连接调用方隔离 inputs 与超时/拦截时给解释与更安全后续提示/独立执行器进发布包；0.167：**托管命令检查点要求全新人工批准**/**PreToolUse 钩子先于 Guardian 策略检查**/网络审批提示随请求结束自动关闭同端点并发逐个提示/共享 MCP 连接按会话租约/上下文压缩计入失败响应保留输出防过早压缩；证据=`gh release view rust-v0.165.0/0.166.0/0.167.0 -R openai/codex`） |
| ruflo | v3.62.0 | **v3.72.2**（10 minor+多 patch） | **移动·实质**（**v3.64 验证结果学习环**：回合结局唯一裁决=测试/构建/typecheck/lint 命令的退出状态，**`|| true`、管道与 `;` verify nothing，模型自述永不采信**；**v3.65 防作弊学习**：改过测试/验证器配置/收窄检查的 turn 标 tainted 不参与训练，可选轮换 re-verify 在临时 worktree 重跑；v3.63.7 `coordination_sync` trigger 等 50ms 谎报同步完成改明确拒绝；v3.68 episode 从未真正落库修复+未验证结局存中性 reward 0；**v3.70/71 上下文委派**：廉价 worker 只回引文且引文必须匹配 SHA-256 快照整行伪造即拒；v3.67 披露 npm aidefence latest 携带从未提交源码的检测逻辑（供应链不一致）并回植；安全面贯穿八版：SSRF 三连（v3.63.2/63.5/65.1 DNS 重绑定）、ReDoS、符号链接逃逸（CWE-59）、`browser_open` Chromium 开关白名单、memory 导入导出限项目内拒符号链接、attention NAPI 边界捕获 Rust panic；v3.72.0 支持 MCP 2026-07-28 规范双时代同进程；证据=`gh release view v3.64.0 -R ruvnet/ruflo` 原文抽验✓） |
| gstack | v1.91.188 tip 1e3ee83c4 | **v1.96.0.0 tip 6666b729**（tag 通道恢复） | **移动·大窗**（基线后 main +498 提交、仓内 package.json 已 1.97.0；v1.96.0.0 起改 changelog fragments＋定期折叠发布、新装默认 stable 通道；**判级以结构化字段为准**：审查收集器不再被否定词骗（"no CRITICAL except"后的 blocker 不丢），finding 以自身 Severity 字段定级而非正文措辞，**fix-check 永不充当 pass**；/ship review 深度跟随代码实际改动而非文件名；redact 捕获 diff 行凭证+lookup 参数不算密钥；**v1.96.0.0 头条：Claude Code/Cursor 不再自动发起 /land-and-deploy 与 /modernize，须显式键入（`manual_only: true` 模板位）防自然语言误触发合并/重写**；merge train/wave 发布工程；子代理 /ship 成本自报为根计数器上界；证据=`gh api repos/garrytan/gstack/compare/1e3ee83c4...main` + `gh release view v1.96.0.0`） |
| deepseek-harness | dsh-v0.2.1-rc.3 | **dsh-v0.2.2-rc.1**（tag；master +1914 提交至 fcc0ad4621） | **移动·tag+tip 双进**（0.2.1-rc.4→rc.5→0.2.2-alpha.1/2/3→rc.1；**CUA 计算机操控成最大战场**（fix(cua) 54 条居首）：独立 macOS helper 应用身份与嵌套 helper 权限/按可执行路径持久授权/审批风险卡/Experimental 插件可选 bundle；**apply_patch 全面转正**：默认开启且 observation policy 关+applyPatchGuard 无观察守卫运行+参数名 `input` 对齐 Codex；experimental 会话性能 Statistics 视图（每步计时/totals/上下文增量列）；desktop 发布工程（分阶段 rollout/prerelease 降级拒绝/Intel Mac 打包）；compaction 超限摘要更小前缀重试；多代理子代理命名与 ID 身份共享；forge 代码审查面板（文件树+行内评论）；liveshare 三端分享面；schedule 并入 WebUI；Windows ACL 沙箱放宽；证据=克隆面 git log 22ddee3792..origin/master 聚类） |
| claude-mem | v15.0.2 | **v15.11.0**（+9 minor） | **移动**（**15.7 修隐性花费：My Work 刷新被拒后整批切下一 agent，致 Codex 机器偷跑 `codex exec --ephemeral` 烧 ChatGPT 账号**——刷新失败的处理路径=成本面；15.9 Devin CLI/Desktop 支持；15.10 onboarding「发现既有工作」优先+匿名统计默认勾选保留取消；15.11 安装器分屏遥测） |
| openspec | v1.15.0 | **v1.16.1** | **移动**（1.16.0 破坏性：npm 安装要求 Node≥22.12（Node 20 EOL）；validate 对缺 WHEN/GIVEN 或 THEN 步骤的 Scenario 告警、`--strict` 失败；config.yaml 非法时 validate 退出码 1 不再静默；行内三反引号不再开幻影代码栅栏吞后续需求；1.16.1：闭合标题（`## Purpose ##`）等价未闭合形式/delta spec 未识别 section 改 validate 失败＋archive 拒绝） |
| codex-security | npm-v0.6.0 | **npm-v0.8.3** | **移动·2 minor**（0.7.0 `--validate` 扫后二次校验独立 validation.md+外部导入须 env 显式开启；0.8.0 OpenGrep 报告导入+`ScanResult.coverage` 改 `review/manifest`；0.8.1 Dependabot 告警导入+密封文件校验后变更返回失败回执；0.8.2 威胁模型导出交互式 HTML/SVG+被拒去重决定可在原开放审查更正；0.8.3 Black Duck/Veracode/SonarQube Cloud/Semgrep Code/AWS Continuum 五导入源+严重度分级跨尝试保留） |
| gsd-core | v1.18.0 | **v1.20.1** | **移动**（1.19 Pi 原生包 parity 矩阵；1.20 code-review 必要性与 CI/CD 可靠性 rubric+review-lane 提示词默认上限+**修「queued fix-forward 绕过红 next 且重跑隐藏失败」**；1.20.1 修 fork-probe 缓存经符号链接写出项目外） |
| comet | 0.5.0 | **0.5.2** | **移动**（0.5.1 Native/Classic 工作流恢复：仅当 Runtime 可证明输入与执行条件未变才复用通过检查+跨阶段尊重既有批准与显式委托；0.5.2 WorkBuddy Code/SkillsBench 基准+变更走查 HTML 页+**Shape 后须对原始请求给对齐结论，未决需求或越权缩减不得报对齐**+**编辑不再阻塞独立审查改走 `comet edit-review observe`**+Git 暂存不再无条件重建实现候选） |
| graphify | v0.9.95 | **v0.9.103** | **移动**（九版全正确性/健壮性：0.9.96 安全升 Pillow≥13/pypdf；**0.9.98 同名关系边合并时弱置信证据进 `also_seen` 不再静默丢弃**；0.9.100 大小写同名类型/函数 id 撞号修复；0.9.103 大面正确性轮；GitHub v1.0.0 异源线维持不取） |
| ocr | v1.13.3 | **v1.13.6** | **移动**（1.13.4 Go/Node 安全升级；1.13.5 模板扩面 HAML/Slim/ERB/EJS/Liquid/Nunjucks+Scala 规则；1.13.6 C#/Starlark 规则+bot 只重写自己的 summary 评论） |
| impeccable | cli-v4.7.0 | **cli-v4.8.0** | **移动**（`--github` 每个 finding 打对应行 Actions annotation；`--list-rules` 免扫描列规则；install 增 devin/windsurf 识别 Replit Agent） |
| mattpocock-skills | v1.3.1 | **v1.3.2**（物化刷新） | **移动·物化**（20+7 技能清单不变、10 文件内容差异：code-review/codebase-design（DESIGN-IT-TWICE）/implement-spec/improve-codebase-architecture/research/setup-matt-pocock-skills 三件/wayfinder/grilling；主题=技能纪律强化——diagnosing-bugs「先证突变真落地再信红灯」、ask-matt 先读 SKILL.md 再断言、subagent 递归划为宿主职责；chief-of-staff/issue-triage 仍在 in-progress 不入取用范围；MANIFEST 基线行同步） |
| diagram-design | v2.6.120 | **v2.6.142**（物化刷新） | **移动·物化**（取用范围 21 文件实质差异：SKILL.md、box-plot 三示例新增、references 九档、scripts 四件（drawio/excalidraw/mermaid_extract/self_check）；**上游仓库级 verify-geometry.py 迁 gates/→scripts/ 且属性提取改 ATTR_RE 正则**（单引号/无引号属性值可提取）——随迁刷新 gates/ 副本；py 语法校验过；MANIFEST 基线行同步） |
| superpowers | v7.0.1 | **v7.0.2** | **移动**（brainstorming 大调优：只在答案会改变产出且别处无答案时才提问、未说明动机时第一问必问「为什么」开放式无选项（盲测 8/8：填充式提问 41→23、动机先于方案 33/33、批准前动工 0）；SessionStart hook 零子进程（Git Bash 每启动省 6 进程）；Pi 宿主每条 prompt 注 bootstrap（原 83% 二次 prompt 重写整会话缓存）；SDD helper 仓外运行 exit 2 给指引） |
| pi | v1.4.0 | **v1.5.0**（308 commits） | **移动**（Breaking：工具参数校验迁 `@earendil-works/pi-schema`，纯 JSON Schema 工具获与 TypeBox 相同 coercion；两大新子系统：chord 流式渲染增量追踪+durable 会话持久层（SQLite 事务 562/s→99/s、磁盘 14.3→4.9 MB/s）；扩展包更新 changelog 展示；**glob 模式放大 DoS 防护+MCP OAuth 端点强制 http/https（原可塞 `file:` 协议交系统句柄）**；保存的 "Do not trust" 决策优先（AGENTS.md-only 项目曾被自动信任）；Windows 盘符大小写比较修复防 skills 双载） |
| semantica | main 22109ee0 | **main c0ec77be**（+69 提交） | **移动（tip）**（弃 Python 3.10 要求 3.11-3.13；持续清依赖 CVE；provenance fail-closed+校验和单射按行版本化；vector-store 修 Qdrant/Pinecone 欧氏排序与 SQLite 元数据过滤；rank-first 检索） |

零移动 4 行：GitNexus npm 1.6.12（license-risk 不追）/ECC tag v2.2.3 持平（**tip +1285 提交未发版记档**：CI 审计已关闭 issue 的交付声明须引用真合并 PR #3522、x402 支付技能防重放 guard fail-closed、GateGuard 识别 sudo/doas/env 包装的 rm、continuous-learning 观测脱敏云密钥/DSN/PEM、opencode 修复不再在旧 stub 保留时谎报修复成功——src-pins SHA 不动）/pua v3.5.1（2026-09-09 后零 push）/codegraph 未接线（无 tag，pushed 11-01）。

本轮主题观察：**验证的可信构造**（ruflo 退出状态唯一裁决+tainted 防作弊；本仓 npm test 管道吞码实录坑同构）＋**判级的结构化事实源**（gstack Severity 字段定级+fix-check 不充当 pass；codex 检查点全新人工批准；本仓「审计失败只认 ok===false」先例续案）＋**拒绝优于提示**（claude-code denyInsteadOfPrompting/blockWritesOutsideWorkingDirectories——提示疲劳即安全缺陷）＋**隐性成本路径**（claude-mem 刷新被拒偷跑 ephemeral exec；comet Git 暂存无条件重建候选）。

## 二、吸收（三档最小增量，决策 46 两问筛选后落 references）

| 档 | 落点 | 一句话主题 |
|---|---|---|
| agent-skills-methodology「验证只认真实退出码（ruflo v3.64/3.65）」节 | 回合/任务的验证结论唯一裁决=测试/构建/typecheck/lint 的退出状态；`|| true`、管道吞码、`;` 链一律不算验证；改过测试或验证器配置的回合标 tainted 不入经验池；模型自述永不采信 |
| review-methodology「v1.96.0.0 增量」节 | finding 严重度以结构化字段定级不被正文措辞骗（否定词后的 blocker 不丢）；fix-check 永不充当 pass；CI 审计已关闭 issue 的交付声明须引用真合并 PR（ECC 续案）；review 深度跟随实际改动而非文件名 |
| claude-code-capabilities「2.1.314-2.1.319 拒绝与写边界」节 | 拒绝优于提示（该问的照问、该拒的直接拒并继续回合——denyInsteadOfPrompting）；写边界全权限模式兜底（blockWritesOutsideWorkingDirectories）；只读超大文件后整体覆盖=数据丢失防护；auto mode 服务器不可核查即拒绝不回落内置分类器 |

同构不吸收（要点）：pi chord/durable 新子系统（产品渲染/持久层，无对应面）/dsh CUA helper（无 GUI 操控面，权限卡理念已由审批面承载）/ruflo 学习环 SONA 训练实现（只取验证方法论不移植统计层）/gstack merge train 发布工程（本仓发布链自有）/openspec Node≥22.12 门槛（环境约束非机制）。

## 三、宿主克隆面（~/lab/upstream/，2026-11-07 同步；仓外不入提交）

升级 8 仓：claude-code v2.1.311→**v2.1.319**（0ed9469）；codex rust-v0.164.0→**rust-v0.167.0**（086ccc833b）；deepseek-harness 22ddee3792→**master tip fcc0ad4621**（11-04，dsh-0.2.2-rc.1 合入）；dsh-context v0.77.0→**v0.82.1**（b53e604，188 提交：token 统计重构/overview 改版/fleet mission pulse/协作时间线深化/四语言）；dsh-TUI v0.17.0→**v0.19.0**（224f847d，31 提交：onboarding 0/1/N 采纳模型/**/update 一体化双 boot entry 验证**）；kimi-code main→**eb2035f3c**（40 提交：插件市场+原生 MCP OAuth/kap-server 会话流式化/agent-core-v2 移除同文件 Edit 限制）；minimax-code da22f11→**main tip 3c21163**（tag 线至 v0.7.2 但 da22f11..v0.7.2 仅 3 有效提交：TS SDK 首发/local-runtime 修 HTTP JSON 泄露堆栈）；multica main→**282f48eed**（约 60 提交：品牌重塑/Linux pidfd 检测/运行时切换不丢 pending/CSV 引号字段与 100MiB 流式上传）。

零移动 3 仓：fibo（master tip 前进至 33a92cd34 10-27 但无 Q4 tag，master_2026Q3 维持——qgate FIBO 索引无需重同步）；element-web（v1.12.33=最新稳定 tag，1.12.34 仅 rc）；routa（origin/main 9dc7b7be 持平）。

## 四、异常记档（无）

本轮无 routa 型双线异常、无误报入册。gstack 通道口径变化见决策 D1：R142「git tag 通道为空以 package.json 为准」→ v1.96.0.0 起 tag 通道恢复且为 stable 折叠发布线，基线取 release tag（package.json 已前移 1.97.0 记档不追，与 R142 前「版本前缀滞后」反向同族——两头都不盲从，取发布语义）。

## 五、验证与本轮整合债

- `registry-render.sh --write-upstream-baseline` 重渲状态表块 → `--check` **注册表一致性通过**（22 行↔runtimes.tsv 逐行一致/面积 5556B≤40KB/无逐轮历史头注）。
- src-pins gstack→6666b729、superpowers→22f0b463（ECC 不动）；offline-manifest 九行追平＋R143 复扫注释；物化两目录 MANIFEST 基线行更新、verify-geometry.py py 语法校验过。
- 主题档与 changelog 记档：本档＋`docs/research/upstream-changelog.md` R143 节。
- 回归与发版实录（生成链/两任务/实抓缺陷/v2.100.0/v1.0.13-overlay）见 CHANGELOG v2.100.0 与 spec `docs/superpowers/specs/2026-11-07-r143-runtime-refresh-regression-release.md` 验证段回填。
