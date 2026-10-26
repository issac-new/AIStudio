# swarm-yuan 设计与源码可信性重构

> 日期：2026-10-26
> 状态：已评审，实施中
> 基线：`origin/main`，分支 `refactor/swarm-yuan-core`
> 关联：用户批准的《swarm-yuan 设计与源码重构方案》。R142 挂账

## 变更

### 1. 主旨与目标

本次重构先恢复契约的可信性，再降低实现复杂度。当前主要问题不在能力数量。配置、门禁、激活和发布对同一件事采用不同判据，可能把失败记录成成功。

目标有四项：

1. 配置只保留一种运行时解释，门禁异常不再等于通过。
2. 激活检查最终交付物，必需输入缺失或检查未运行时不得激活。
3. 关键写入具备失败恢复、原子替换和并发保护。失败时保留旧良好产物。
4. 验证链在 AIStudio 单仓布局中可复现，当前规范与历史档案分离。

### 2. 范围与非目标

本批变更 `skills/swarm-yuan/` 的生成器、目标技能运行时资产、验证器、测试、分发与当前规范。仓级 CI 和本 spec 也在范围内。

本批不做以下事项：

- 不变更真实用户级技能、宿主 hooks 或 `aistudio-dev` 活体副本。
- 不新增门禁数量，不改变 81 个框架的注册模型，不升级第三方依赖。
- 不推送远端，不发布版本，不运行真实在线安装或外部运维操作。
- 不外迁 vendor-knowledge，不大规模改名测试，不重写历史研究文档。
- 不把结构指纹扩成全仓内容哈希，不把 Shell 静态检查描述成完整沙箱。

### 3. 审计口径

三路只读审计覆盖生成、配置、门禁、激活、自成长和分发。安全守卫、留痕、测试基建与设计文档也在范围内。主会话复核了关键源码。未逐行审查全部 56 个门禁算法和 81 个框架片段。这些内容由静态检查、双态夹具和变异测试补充验证。

只读阶段未运行会写夹具的测试。下表中的“源码证实”表示控制流或数据流可直接确认，不代表动态回归已通过。

### 4. 设计与源码问题台账

| 编号 | 级别 | 发现与证据 | 处置 |
|---|---|---|---|
| A01 | 高 | 单仓布局破坏验证链：`tests/run-sweep.sh:23-25,83-91` 和 `scripts/build-compendium.sh:20-32` 使用旧父目录 | 本批恢复并加 fresh-clone 契约测试 |
| A02 | 阻断 | 门禁异常可判 pass：`assets/precheck.sh:1419-1447` 丢弃或未完整使用返回码 | 本批增加 error 态与旧 flag 保护 |
| A03 | 阻断 | FAIL_IDS 与 deny 白名单口径不一致：`assets/precheck.sh:636-643`、`assets/hooks/fail-gate-hook.sh:287-304` | 本批统一稳定 ID 并做生产到消费集成测试 |
| A04 | 阻断 | 有效配置多套解析：`scripts/generate-skill.sh:377-397,1365-1453` 漏层、误判空值和覆盖 | 本批建立 effective-conf 单一实现 |
| A05 | 阻断 | 激活可跳过必需核验：`scripts/generate-skill.sh:1541-1659` 对 FAIL 和缺对象 fail-open | 本批改为最终产物检查，P0 fail-closed |
| A06 | 高 | 配置渲染失败仍成功：`scripts/conf-render.sh:287-310,427` | 本批分离嗅探降级与落盘失败 |
| A07 | 高 | 框架移除和升级可破坏一致性：`generate-skill.sh:781-910,2529-2538,3415-3419` | 本批合并 effects 事务并保留旧哈希至冲突检查完成 |
| A08 | 高 | 多处写入非原子、缺锁或 symlink 防护不足 | 本批复用 secure-fs/transaction |
| A09 | 高 | refresh 吞错、指纹重复扫描并直写、relations 可覆盖 last-good | 本批修失败语义、结构化输出和原子发布 |
| A10 | 高 | spec 选择、批准、状态证据和 UserChallenge 检查存在多套判据 | 本批复用 governing-spec 与统一 schema，保留迁移口径 |
| A11 | 高 | 安装跳过仍成功、复制缺恢复、离线失败可替换旧包、版本可写 unknown | 本批修 staging/publish/restore 与版本回退 |
| A12 | 高 | integrity 与运维只读守卫有保护缺口：`integrity-guard.sh:69-90,173-228`、`ops-readonly-guard.sh:81-149` | 本批补保护面、JSON 编码和写侧负例 |
| A13 | 高 | 最终预算、manifest 与实际交付物不一致 | 本批在激活时重算，区分提示上下文与机器文件 |
| A14 | 中 | profile、17 项特征卡和未生效配置存在文档/实现漂移 | 本批保持兼容行为，统一 resolver 并移除假承诺 |
| A15 | 中 | 九节点、Step 顺序、六段、数字和安装文档有多套权威 | 本批明确 normative/generated/archive 三类文档 |
| A16 | 中 | 主生成器约 3,431 行，顶层子命令不受尺寸门约束，重复扫描 | 行为稳定后拆模块，并复用单次 discovery 结果 |
| A17 | 中 | 项目根解析、记忆空写、证据覆盖和敏感原文落盘不统一 | 本批统一项目根、脱敏、去重与证据保留 |
| A18 | 边界 | Windows、部分宿主、外部运行时、真实数据库/SSH/JDWP 未实证 | 不作通过声明，列入未验证矩阵 |

### 5. 复用约束

复用既有稳定单元，不建立平行体系：

- 六张注册表和 `registry-render.sh` 继续提供计数、分发和派生视图。
- `spec-first-lib.sh` 继续承载变更集与 governing spec 的关联。
- `tests/run.sh`、框架双态夹具、生成器升级异常注入测试继续作为回归底座。
- 状态机逐级转换、`run.sh` 锁、指纹 last-good 和清单原子更新语义保留。
- 目标技能模板和生成器同源变更，禁止只修生成物或只修模板。

新增胶水只限四类：effective-conf、verification result、secure-fs/transaction、生成器子命令模块。它们解决的是现有实现重复或缺失的契约，不引入新业务功能。

### 6. 版本与安全约束

第三方依赖版本不变。所有新 Shell 代码兼容 Bash 3.2 和 BSD 工具，不使用关联数组。

conf 仍是受信 Shell 配置。统一加载器不宣称提供沙箱。写入函数在写入点拒绝符号链接，临时文件与目标位于同一文件系统。原子替换只保证目录项切换，不夸大成断电持久化保证。审计记录只保留脱敏后的标识、位置和原因。

## 决策记录

| 编号 | 决策 | 选择 | 备选与否决理由 | 类型 | 用户裁定 |
|---|---|---|---|---|---|
| D01 | 工作顺序 | 先恢复验证链，再修核心语义，最后拆结构 | 先拆脚本会放大回归且无法证明行为保持 | Mechanical | approved |
| D02 | 能力范围 | 冻结新能力，修既有契约 | 继续扩门禁会扩大漂移面 | Mechanical | approved |
| D03 | 配置真值 | 一个 effective-conf 加载器，后层覆盖含空值 | 各调用点 grep/sed 已与 source 语义冲突 | Mechanical | approved |
| D04 | 门禁结果 | error 独立于 fail/pass，error 不清旧 flag | 用 fail 代替会混淆违规与基础设施异常 | Mechanical | approved |
| D05 | 激活 | strict 检查最终产物。P0 阻断，P1 写警告报告 | 全面硬堵所有 advisory 会破坏既有合理降级 | Taste | approved |
| D06 | spec 关联 | 复用 governing-spec，支持显式 change，禁 mtime 裁决 | 强制所有历史项目立即改文件布局成本过高 | Taste | approved |
| D07 | 写入 | 同目录临时文件加原子 rename、锁和恢复 | TMPDIR 跨文件系统 mv 不具备原子性 | Mechanical | approved |
| D08 | 验证器 | 评审后纳入当前技能树，正常安装与开发验证分发分离 | 继续引用 archive 无法形成可维护正本 | Taste | approved |
| D09 | 九节点 | 以现行生成器“需求、探查、spec、plan、编码、测试、审查、合入、发布”为准 | 另增分支准备会破坏现有状态机映射 | Taste | approved |
| D10 | 预算 | 区分入口、文档分片和机器查询文件，不直接上调预算 | 全量可检索不等于全部载入上下文 | Taste | approved |
| D11 | 指纹 | 保留 structure-only，修文案与发布安全 | 全仓内容哈希成本高且超出本轮根因 | Mechanical | approved |
| D12 | 部署 | 仅在临时 HOME 验证，不更新真实安装副本 | 避免源码重构改动用户全局运行环境 | Mechanical | approved |
| D13 | 交付 | 本地分阶段提交，全量验证后合并，不推送 | 遵循仓规并保留任务边界 | Mechanical | approved |

## 详细设计

### 7. 配置与结果模型

effective-conf 按 `core → arch → compliance → industry → patch` 加载，提供标量、数组、是否已赋值、是否为空和来源层查询。运行时、激活、refresh、trace、dump/stats 与 renderer 使用同一实现。

门禁结果限定为 pass、fail、skip、warn、advisory、error。门禁函数返回非零且没有业务 fail 时记 error。error 使用独立退出语义，不得移除已有失败标记。已有正常返回约定先迁移，再启用新判定。

### 8. 激活与分发

激活依次核验有效配置、框架实现、必需产物、P0 清单、决策、最终预算和 manifest。任一必需对象缺失或验证器未完整运行都保持 draft。警告写入激活报告，不新增状态机状态。

`dist.tsv` 通过 audience 区分目标技能、生成器运行和开发验证资产。正常安装不包含无法独立运行的整套测试。源码仓保留完整验证面。manifest 在激活时按最终文件集合重渲染。

### 9. 事务与模块边界

secure-fs/transaction 提供同目录临时文件、原子替换、owner-token 锁、symlink 拒绝和恢复。优先生效于 inject、fingerprint、relations、inventory-update、renderer，之后覆盖 install/offline。

行为对拍稳定后，`generate-skill.sh` 只负责参数解析和 dispatch。create、upgrade、inject、activate、refresh、render-tools 分别进入模块，尺寸门扫描所有模块。discovery context 只在单次 create 内共享，不引入跨运行陈旧缓存。

### 10. 风险与回滚

| 风险 | 缓解与回滚 |
|---|---|
| error 态暴露既有门禁异常返回 | 先跑全量表征，逐门迁移正常返回。保留旧输出适配 |
| strict 激活使旧技能升级后回 draft | activation schema 明示，提供具体缺失项。不自动变更活体副本 |
| 模块拆分造成内部函数不可见 | 先行为对拍再移动，入口和子命令契约测试全覆盖 |
| 原子写与锁在 BSD 上差异 | 使用 POSIX/Bash 3.2 子集，在 macOS `/bin/bash` 实测 |
| 大改跨批失控 | 每批独立提交和回归，任一批失败只回退该批，不带着红测进入下一批 |

## 验证

### 11. 测试左移与验证矩阵

每类修复先有旧实现必红的负向测试，再修生产代码，并跑相邻路径：

| 维度 | 必测场景 |
|---|---|
| 配置 | 空数组、空白数组、单引号、后层置空、industry/compliance 覆盖、空格与 `#` 路径 |
| 门禁 | pass/fail/error、真实 FAIL_IDS→deny、error 保留旧 flag、JSON 与文本输出 |
| 激活 | NO_LIST、SCAN_ERROR、重复行、缺 reference、非法决策、预算和 manifest |
| 生命周期 | 移除最后框架、rollback、手改后 upgrade、新必需配置回 draft |
| 事务 | 写盘失败、中断、并发、symlink、跨文件系统边界、last-good 保留 |
| 分发 | 临时 HOME 安装、外部链接、setup/checksum 失败、离线缺件不替换正式包 |
| 安全 | 核心资产变更、Read、特殊路径 JSON、重定向、curl/wget/awk 写、非回环绑定 |
| 自成长 | refresh 非零、结构变化、空格目录、relations 特殊路径与语义边超限 |

### 12. 变更与运维左移

所有新模块保留旧入口或提供明确迁移。分发清单、模板、目标技能脚本和测试必须同批变更。异常输出包含失败对象、原因和修复入口。CI 与本地共用 `tests/run-sweep.sh`，不维护两套运行序列。

### 13. 合规与证据

最终证据包括目标测试、全量 skill sweep、self-check、registry/compendium 对拍、ShellCheck、macOS Bash 3.2、临时 HOME 端到端、变异测试和仓级 `npm test`。子代理报告必须由主会话复跑关键点。

外部环境未实测时，交付必须标为未验证。包括 Linux/Windows 实机、宿主活体和真实外部运行时。在线发布与外部运维也按此处理。

### 14. 实施记录

- 2026-10-26 未变更生产源码的基线：sweep 为 3 项通过、4 项失败。三条 E2E 通过。锁测试 120 项中 101 项通过、19 项失败。verifier 因旧路径缺件失败，self-check 与 compendium-check 也未通过。
- 19 项失败已逐份读取日志并归因。单仓路径和静态资产缺失由 Task 1 处理。vendor 哈希清单、单仓版本前缀、安装事务和术语内容分别由 Task 7、8、9 对账，不归为环境问题。
- 基线测试把未解析的项目根占位符写成两个异常目录，仅含本次生成的 trace/decisions。主会话检查内容后已清理。根因纳入 A04/A17 修复。
- builder 审查结论为 `nothing important left`。spec 与 plan 的 gongwen-lint 均为 0 发现。

## 迁移收口补充（2026-10-26）

- **版本前缀**：AIStudio 的 tag 形如 `swarm-yuan-v2.95.0`；离线包 `.bundle-version`、安装记录与 `install.sh --version` 统一剥除 `swarm-yuan-` 命名空间前缀，输出回到 `v2.95.0-...` 口径。
- **verifier 完整性**：补齐 `verifier/README.md`、`verifier/capture-baseline.sh`、`verifier/v2/run-v2.sh`、`verifier/v2/external-validity.md`；v2 的 precheck/gates 路径改到技能根 `assets/`。历史 `runs/` 日志留在旧仓归档，不随迁。
- **CI 触发**：工作流限定 `skills/swarm-yuan/**` 与自身文件；增加 concurrency 取消旧运行，避免无关改动触发全量 sweep。
- **离线包**：版本兜底修正后 `test-r133`/`test-r134` 全绿；r133 测试的包目录名同步剥前缀。

### 补充验证

```text
bash scripts/self-check.sh --check-only            # ✓ 自检通过
bash tests/test-verifier-reliability.sh            # PASS 41 / FAIL 0
bash tests/test-r129-tail-closure.sh               # 全绿
bash tests/test-r133-offline-complete.sh           # 全部通过
bash tests/test-r134-everything-bundle.sh          # 全部通过
```

## 设计文档影响

DESIGN_SYNC: none

本文件是迁移修复的实施记录；规范设计文档修订与 `DESIGN_SYNC: touched` 声明统一由同批 `2026-10-26-swarm-yuan-single-source-refactor.md` 承载，本文件不重复声明。
