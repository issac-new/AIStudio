# R40 运行时刷新（2026-09-19，用户 /goal 显式触发）

> 触发：用户 /goal 三目标指令之「自动更新 research 目录下运行时（claude code、codex、deepseek harness 等）到最新稳定版本，比较功能差异并吸收」——R31/R32/R34/R35/R38 同款先例（用户显式触发豁免「同日复核废止」节奏限制；上轮运行时刷新为 R38，R39 全量回归轮与 D9 契约同步均不含刷新面）。
> 扫描面：research 克隆区 15 仓 `git fetch --tags` 全量比对 + npm registry 两线（claude-code/codex）实测 + codegraph GitHub API 活跃度核。
> 结论：**6 行升基线**（claude-code 2.1.276→2.1.278 / codex rust-v0.155.0→0.155.1 / ocr 1.12.6→1.12.7 / graphify v0.9.63→0.9.64 / superpowers v6.3.0→v6.4.1 / codex-security npm-v0.1.28→0.1.29），11 行零稳定增量。中厚轮：六载体注记级吸收，无门禁增量，不改 SKILL.md，不发版。五克隆物化（codex/ocr/graphify/superpowers/codex-security checkout 新 tag；graphify 过 merge-base 祖先核验确认 v8 线）。
> **跨仓主线（本轮归纳）**：①**机密/敏感数据不落索引与展示面族**（graphify Terraform secret redaction + claude 子代理输出防伪 + codex-security bound reads）——界画在「数据进入持久面/展示面之前」；②**诚实错误语义族**（claude Grep/Glob 资源耗尽报错而非无匹配、codex-security 结构化 JSON 错误、ocr 临时豁免清零）——「没找到 ≠ 没能力找」，错误必须可机读可处置；③**IaC（Terraform）双仓同启**（graphify 图谱提取 + codex-security 扫描清单同期加 Terraform）——IaC 成图谱/安全双域趋势；④**修复轮即回归源第三例**（codex 0.155.1 回滚 0.155.0 默认值，claude 270/276 同族）——默认值变更与行为变更同权入回归面。
> **预算门**：R37 第七次登记预算 317440B，本轮注记增量 +4206B → 实测 320563B 超 3123B → **第八次登记 317440→323584B**（成因逐例留 facts.conf：六行升基线 references 版本注记，非内容膨胀）。

## 一、升级 6 行

### claude-code v2.1.276 → v2.1.278（npm latest；277 实质批 + 278 小版）

- **AGENTS.md 进宿主**（277）：无 CLAUDE.md 的项目改读 AGENTS.md（/config Project instructions 可切；Bedrock/Vertex/Foundry 暂缺）——项目指令文件向 codex 惯例收敛，**多宿主部署的指令面可单一事实源**（对本仓多宿主生成技能有直接运维意义）。
- **子代理输出防伪**（277）：子代理结果以 header 标记为 subagent output 并缩进——子代理文本不得冒充会话自身指令（prompt injection 防线）；workflow 脚本计算的 agent() prompt 以 script-authored 框架呈现给安全分类器。
- **TaskOutput 工具移除**：deprecated 工具删除，后台任务输出改 Read 输出文件；taskOutputMaxChars/TASK_MAX_OUTPUT_LENGTH 失效——淘汰即移除，不留长期并存面。
- **诚实错误族三例**：Grep/Glob 资源耗尽（进程/内存/句柄）报错而非「无匹配」；claude -p/SDK 内部错误报错 exit 1 而非无果挂死；Write 目标为已存在目录报清晰错误。
- **沙箱豁免复合命令全匹配**（277）：sandbox.excludedCommands 部分匹配不再豁免整条复合命令——fail-closed。
- **auto mode 服务端分类器默认**（278）：全通道默认 server-side classifier（不收分类器开销费，CLAUDE_CODE_AUTO_MODE_SERVER=0 退出）+ /status 增 Auto mode server 行——effort 治理成本面收敛。
- **网关面两例**：CLAUDE_GATEWAY_PROXY_IS_EGRESS_BOUNDARY（出口域名交代理解析）+ gateway upstream 静态 headers map。
- 登记不吸收：malformed state 容错批与 plugin 稳定性修复批（质量面无方法论原语）、PDF Windows 长路径、VSCode 面更新。

**吸收判定**：注记级入 `references/claude-code-capabilities.md` R40 段（AGENTS.md 跨宿主收敛 + 子代理输出防伪为两条主线；顺带修正文档头部版本核至标记 273/274 双双滞后的漂移）。

### codex-cli rust-v0.155.0 → rust-v0.155.1（stable hotfix，2 commits）

- **恢复 TUI reasoning summary 默认 none**：0.155.0 变更默认值引发回归，0.155.1 回滚——默认值变更与行为变更同权入回归面（修复轮即回归源族第三例）。

**吸收判定**：注记级入 `references/codex-methodology.md` R40 段。

### ocr v1.12.6 → v1.12.7（8 commits，门禁收口批）

- **最后一个 TEMPORARY english-only 豁免撤销**（#1445）：临时豁免必须有退出机制，license 门禁承诺全量兑现。
- **allowlist 排除 pytest-style test_*.py 出评审**（#1439）：评审对象选择显式化——进入分析前先分类（与 1.12.4 untracked binary 判 binary 同族）。
- viewer 会话导出自包含 HTML（#1167，查看器面不吸收先例）+ IDEA/VSCode 注释英译批（卫生面）。

**吸收判定**：注记级入 `references/review-methodology.md` R40 条目。

### graphify v0.9.63 → v0.9.64（15+ commits，tag 2026-09-18）

- **Terraform block attributes 提取 + secret 命名属性值 redaction**：机密不落图谱索引（机密面族，界画在索引入口）。
- **PHP 内联 script 的 JS 索引 + PHP/JS 节点碰撞边丢弃修复**：跨语言嵌入代码归属判别（同文件多语言共存消歧族）。
- Kotlin object 成员调用 resolver + generic Rust self calls（跨语言边扩展族延续）+ Markdown 链接 parse 失败保持与后缀 reconcile（容错不丢数据）。
- 物化核验：merge-base 祖先核验 v0.9.63 ∈ v0.9.64（v8 线确认，异源 v1.0.0 裁决维持不取）。

**吸收判定**：注记级入 `references/code-graph-tools.md` R40 条目。

### superpowers v6.3.0 → v6.4.1（80 文件 squash 发版）

- **新技能 diagnosing-superpowers**：技能系统自身的根因诊断（session-discovery/skill-timeline/stumbles/repeated-work/scrub-audit 十 prompt 族 + redaction-policy + context-safety）——「技能要有诊断自身效能的元技能」，与本仓 24h review 轮同构。
- **executing-plans task-start/task-done 原子标记脚本**：计划执行推进可观测。
- **OpenCode 2.0 + Muse 宿主支持**：宿主面加宽。
- **codex plugin hooks 自动发现兜底修复**：关闭一个行为只有唯一显式形态（hooks:{} 才生效；缺席/[]/空列表都回退 fallback）——「缺席 ≠ 关闭」配置语义显式化族。

**吸收判定**：注记级入 `references/subagent-orchestration.md` R40 条目。

### codex-security npm-v0.1.28 → npm-v0.1.29（约 20 commits）

- **model refusals 后保留 undecided findings**（#960）：去重不得吞掉模型拒绝面的未决发现——「模型拒绝 ≠ 发现不存在」（诚实完整族）。
- **失败扫描发结构化 JSON 错误**（#709）：错误可机读，门禁可消费。
- **Terraform 进 scan inventories**（#944）：IaC 安全面扩展（与 graphify 同期）。
- **bound source preview reads**（#947，有界读取族）+ patch verified findings（#961）与 patching 进度显示（#931）+ policy discovery 容忍 malformed archived Git metadata（#935）。
- dashboard 排序/过滤 UI 批不吸收。

**吸收判定**：注记级入 `references/codex-security-methodology.md` R40 条目。

## 二、零增量 11 行对账

| 运行时 | 基线 | 本轮实测 | 判定 |
|---|---|---|---|
| openspec | v1.13.1（R34） | tag + npm 均 1.13.1 | 零增量 |
| comet | 0.4.1（R29） | GitHub Latest 0.4.1 | 零增量 |
| GitNexus | npm 1.6.9 | tags 新增 v1.6.13-rc.22 | rc 线不取 + license-risk 维持（R28 裁决） |
| gsd-core | v1.14.0（R28） | GitHub Latest v1.14.0 | 零增量 |
| claude-mem | v13.24.23（R26） | GitHub Latest v13.24.23 | 零增量（watch，oracle 以 GitHub tag 为准） |
| codegraph | watch（R37 增行） | GitHub main pushed 2026-09-16 仍活跃 | watch 维持（接线前提=本机跑通 A 级） |
| gstack | v1.87.4.0（R31） | main tip a6b3a57（09-15）不变 | 零增量 |
| ruflo | v3.42.4（R38） | GitHub Latest v3.42.4 | 零增量 |
| ECC | v2.2.1（R20） | GitHub Latest v2.2.1 | 零增量 |
| impeccable | v4.1.1（引用基线） | 无克隆，skill-v4.3.1 候选级在案 | 候选级引用不升（R16 裁决沿用） |
| dsh | dsh-v0.1.5-rc.2（R24） | tags 新增至 dsh-v0.1.6-alpha.2 | alpha 线不取（rc/stable 出线即深读） |

（另：better-harness v0.7.0-alpha2 维持——未入台账的非登记克隆，alpha 不取；harness-practice/harnesseval-w 为文章源物化克隆，无版本基线面。）

## 三、live 漂移对账（本轮已消）

| CLI | live 改前 | live 改后 | 基线 | 判定 |
|---|---|---|---|---|
| claude（`~/.local/bin/claude`） | 2.1.273 | **2.1.278**（native 通道 `claude update` 实测成功） | 2.1.278 | 零漂移 |
| codex（homebrew npm 全局） | 0.154.0 | **0.155.1**（`npm i -g @openai/codex@latest`） | 0.155.1 | 零漂移 |

（`/usr/local/bin/claude` 2.0.44 陈旧影子装处置仍待用户裁决，R32 在案。）

## 四、消费方

[[aiships-zcodeproject-state]]（AIShips 第十七轮同步收编本轮 runtime 束与技能版本）。
