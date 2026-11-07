# 2026-11-07 swarm-yuan R143 运行时刷新＋吸收＋JVM 全栈回归＋v2.100.0 发版

> 第九轮同型例行轮（R124/R132/R140/R141/R142 谱系；R141 后首轮）。触发：用户指令——research 运行时更新到最新稳定版＋差异比较＋吸收优化＋全栈回归（vuejs/elementUI/spring framework/mybatis/sharding-jdbc/druid/spring batch/spring boot/dubbo/rocketmq 生成技能并做典型研发工作）＋缺陷排查修复＋发版 GitHub＋离线包（除 npm/pip 可安装插件外）。

## 变更

### 一、R143 运行时刷新（查新实测 2026-11-07，R142 基线后 13 天；18 移动/4 零移动）

- `assets/registry/runtimes.tsv` 18 行基线更新：claude-code v2.1.310→**v2.1.319**（+8 patch；安全大版本：auto mode 服务器不可核查即拒绝、`denyInsteadOfPrompting`、`blockWritesOutsideWorkingDirectories`、Bash 环境变量前缀权限绕过修复、worktree 沙箱逃逸修复）/ codex-cli rust-v0.164.0→**rust-v0.167.0**（托管命令检查点全新人工批准、PreToolUse 钩子先于 Guardian、共享 MCP 连接会话租约）/ ruflo v3.62.0→**v3.72.2**（10 minor；v3.64 验证结果学习环——退出状态唯一裁决、`|| true`/管道/`;` 不算验证、模型自述永不采信；v3.65 tainted 防作弊；v3.70/71 上下文委派引文须匹配 SHA-256 快照）/ gstack tip 1e3ee83c4→**v1.96.0.0**（tag 通道恢复；finding 以 Severity 字段定级不被正文措辞骗、fix-check 永不充当 pass、manual_only 防自然语言误触发合并）/ claude-mem 15.0.2→**15.11.0** / openspec 1.15.0→**1.16.1** / codex-security 0.6.0→**0.8.3** / gsd-core 1.18.0→**1.20.1** / comet 0.5.0→**0.5.2** / graphify 0.9.95→**0.9.103** / ocr 1.13.3→**1.13.6** / impeccable cli-v4.7.0→**cli-v4.8.0** / mattpocock v1.3.1→**v1.3.2**（物化刷新）/ diagram-design 物化核差异 / superpowers 7.0.1→**7.0.2** / dsh dsh-v0.2.1-rc.3→**dsh-v0.2.2-rc.1**（tag 通道；master 1914 提交：CUA helper 权限面+apply_patch 转正）/ pi 1.4.0→**v1.5.0** / semantica tip 前进。零移动 3 行：GitNexus（license-risk 不追）/pua v3.5.1/codegraph 未接线。
- `scripts/src-pins.conf`：gstack/superpowers SHA 随基线同步（ECC tag v2.2.3 持平不动，tip +1285 记档不升）。
- `docs/research/R143-runtime-refresh.md` 新档＋`docs/research/upstream-changelog.md` 增 R143 节＋`registry-render.sh --write-upstream-baseline` 重渲状态表块。
- `runtime/mattpocock-skills/` 物化刷新（v1.3.2，51 提交：chief-of-staff/issue-triage 出 in-progress 转正与否按上游目录实况、技能纪律强化）＋MANIFEST 基线行；`runtime/diagram-design/` 物化差异核验（有差异则刷新+四处同步：MANIFEST/facts/test-r122/capability-map）。
- `scripts/offline-manifest.conf` 九通道行随基线追平＋R143 复扫记档注释行。
- 宿主克隆面（~/lab/upstream/，仓外同步不入提交）：claude-code→v2.1.319、codex→rust-v0.167.0、deepseek-harness→dsh-v0.2.2-rc.1、dsh-context→v0.82.1、dsh-TUI→v0.19.0、kimi-code→main eb2035f3c、minimax-code→v0.7.2、multica→v0.8.1、fibo/element-web/routa 零移动（fibo master tip 前进无 Q4 tag 维持）。

### 二、吸收（三档最小增量，落 references）

| 档 | 落点 | 一句话主题 |
|---|---|---|
| agent-skills-methodology 增量节 | **验证只认真实退出码**（ruflo v3.64/3.65）：验证结论唯一裁决=测试/构建/typecheck/lint 的退出状态；`|| true`、管道吞码、`;` 链一律不算验证；改过测试/验证器配置的回合标 tainted 不入经验池——与仓内实录坑（npm test 管道吞 exit code）同构，方法论面收口 | |
| review-methodology 增量节 | **判级以结构化字段为准**（gstack v1.96）：finding 严重度取结构化字段而非正文措辞（否定词后的 blocker 不丢）；fix-check 永不充当 pass；ECC：CI 审计已关闭 issue 的交付声明须引用真合并 PR——与仓内「审计失败判定只认 ok===false」先例同构续案 | |
| claude-code-capabilities 增量节 | **拒绝优于提示与写边界**（claude-code 2.1.314/319）：`denyInsteadOfPrompting`（提示疲劳=安全缺陷，该问的照问、该拒的直接拒并继续回合）；`blockWritesOutsideWorkingDirectories` 全权限模式拒工作目录外写；只读超大文件后整体覆盖=数据丢失防护 | |

同构不吸收（要点）：pi chord/durable 新子系统（产品面）/dsh CUA helper（无 GUI 操控面）/ruflo 学习环 SONA 实现（只取验证方法论）/gstack merge train 发布工程（本仓发布链已自有）。

### 三、JVM 全栈回归（trade-forge 十框架，全新生成＋两任务）

- 生成链：detect-frameworks 10 框架→删旧技能全新生成→真值回填→`--verify-completeness --strict` 零占位→`--mark-active`→`--all-full` 基线。
- 典型研发工作两项（九节点全流程、TDD RED→GREEN、独立审查留痕、merge --no-ff）：一项 fix＋一项 feature（具体选题以任务时项目实况定，判据=双端测试绿＋门禁 fail 0＋九节点产物齐）。
- 缺陷实抓修复：生成器/门禁/脚本实抓缺陷根治＋bats 夹具锁（数量以实抓为准，如实记档）。

### 四、版本与发版

- yuan v2.99.3→**v2.100.0**（CHANGELOG；facts 真值随动）。
- 发版 GitHub **v1.0.13-overlay 重切**（2026-11-06 中止轮载体留用口径）：三资产=full 源码包＋swarm-yuan everything 离线档＋SHA256SUMS；RELEASE-NOTES 版本节随窗口重写（v0.8.17 studio 批＋本批）。ModelScope 本轮不传（用户未令）。
- 离线包=everything 档（R134 口径：知识库+docs+源码包在内，npm/pip 可源装件不内嵌——即用户指令「除 npm 及 pip 可安装的插件外」）。

## 决策记录

- **D1 gstack 基线口径改 tag 通道**：R142 时「git tag 通道为空以 package.json 为准」；v1.96.0.0 起 tag 通道恢复且与 package.json（1.97.0）解耦出正式折叠发布线，基线取 release tag v1.96.0.0＋commit SHA（stable 通道语义），tip 前进记档不追。
- **D2 dsh 基线随 tag 推进至 dsh-v0.2.2-rc.1**：tag_regex 本含 -rc.N 线；master tip（fcc0ad4621）为 tag 祖先后续，克隆面取 tip 记档、基线取 tag（与 R141 前口径一致）。
- **D3 吸收面收敛三档**：按决策 46 两问（是否机制层/是否生成期或运行期可落地）筛选， Ruflo 退出码族/gstack 判级族/claude-code 拒绝族三档过筛，其余记同构不吸收。
- **D4 回归样本复用 trade-forge**：与 R140/R141 连续基线可比（后端 49/49、warn 23/advisory 3-4 档位），重建新样本边际收益低且脱离既有指纹链。
- **D5 版本 v2.100.0**：吸收三档＋实抓修复＋基线 18 行推进=minor 进位（R124 轮 v2.87→v2.88 同型先例）。
- **D6 发版载体 v1.0.13-overlay 重切**：中止轮 tag 已撤载体留用（用户 2026-11-06 裁定），本轮窗口覆盖 v0.8.17 studio 批＋本批，不新开 v1.0.14。
- 以上六条落 `.swarm-yuan/decisions.jsonl`（合并时点）。

## 验证

- 刷新面（已回填实测）：`registry-render.sh --check` 注册表一致性通过（22 行↔runtimes.tsv/面积 5556B）；`self-check.sh --check-only` 无 ✗ 无 drift（后台全程跑完 rc=0）；offline-manifest 对账 test-r118 PASS；doc-numbers 254/0；test-r122 36/0（五锚面随物化同步）。
- 回归面（已回填实测）：生成链 verify-completeness --strict 零占位＋mark-active 三关（全维度 1.00/预算 11064B≤11392B）；任务 A 后端 **56/56**（RED=7 编译红）＋前端 **29/29**（RED=2）＋vite build rc 0＋--all-full fail 0；任务 B 双注入三层咬合实证+还原态全绿；master 末态 --all-full **fail 0**（warn 26/advisory 4）；实抓 R143-D1 根治+六断言锁（test-r143-decisions-grandfathering PASS）。
- 全量面：`SWEEP_JOBS=2 bash skills/swarm-yuan/tests/run-sweep.sh` 全绿（与 CI 同命令，发版前跑）；AIStudio 根 `npm test` 全量绿（合并前）。
- 发版面：`release:check` 对账全绿；三资产上传后下载回验 SHA256。

## 设计文档影响

- DESIGN_SYNC: none（本批刷新/吸收/物化/回归面不触 DESIGN_DOCS 四正本——docs/DESIGN.md 与三份 design-ledger 均无机制/数字/口径变更；RELEASE-NOTES.md 不属 DESIGN_DOCS 清单，其 v1.0.13 版本节重写随发版批提交自带；设计文档索引已随批登记本 spec 条目；swarm-yuan 侧 facts 真值随动已在本批内闭环，门禁 59/变量 204 无新增）。

## 任务卡（七项）

### 完成条件

R143 档+基线 17 行+吸收三档落位；trade-forge 全新生成 active＋两任务九节点闭环＋实抓缺陷修复带锁；run-sweep 全绿；v2.100.0 CHANGELOG；v1.0.13-overlay 三资产发版回验。
### 输入与来源

runtimes.tsv/R142 档（基线）；npm view/PyPI json/GitHub releases+tags/克隆面 git log（查新实测 2026-11-07）；trade-forge 仓（样例）；四路调研子代理报告（主会话抽验 ruflo v3.64 原文/claude-code 2.1.319 键名/tag SHA 四项全中）。
### 工作流边界

改动面=skills/swarm-yuan/**＋docs/superpowers/specs/本 spec＋RELEASE-NOTES.md＋.qgate/scope.yaml＋docs/manuals/aistudio-design-document-index.md；不触 vendor/、patches/、custom/；trade-forge 仓外改动不入本仓提交。
### 工具与副作用

gh api/npm view/curl PyPI（只读查新）；克隆面 git fetch+checkout（仓外）；make-offline-bundle.sh（产物不入库）；gh release 上传（对外发布，发版前征用户确认点=无——用户指令已明示发版）。
### 结果与证据

R143 档含逐行判定表与查新证据命令；回归段含测试计数/门禁计数/RED-GREEN 实录锚；发版段含 release 资产 URL+SHA256SUMS 回验输出。
### 异常与恢复

查新通道失败（npm/gh 限流）→ 延时重试三次后如实标「未采集」；生成链红→ 按缺陷实抓流程处置不在生成物上手改；发版资产上传 408/DNS → gh 三重回试配方（仓内实录）；v1.0.13 tag 若被他会话抢先→ 停手报用户裁决。
### 验收反例

以下任一即不合格——基线表某行未实测仅凭子代理报告；生成物存在占位符（--strict 红）；回归任务未走独立审查；缺陷修复无 bats 锁；发版资产未回验；CHANGELOG 数字与 facts.conf 真值漂移。
