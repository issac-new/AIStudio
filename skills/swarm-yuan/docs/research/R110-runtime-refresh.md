# R110 运行时例行刷新轮（2026-10-14）

> 触发：用户 /goal 三目标（「research 目录下运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版」目标）。口径同 R107 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。本轮号位 R110（R108/R109 号位被 Rust 族回归轮与债务清偿轮占用）。

## 一、移动面（5 移动，15 行零移动）

| 运行时 | 旧基线 | 新基线 | 跨度 | 实质判定 |
|---|---|---|---|---|
| graphify | v0.9.86 | v0.9.89 | 3 patch（28 提交） | 实质（**跨仓成员调用「先停靠后链接」族**——Go/Kotlin/ObjC/PHP/TS 成员调用的接收者类型声明在另一仓时先 park 再跨仓链接；泛型类型参数不入引用（Swift/C++/Scala/Kotlin 四语言）；接口成员链到每个实现者且守门失败者不计入置信度；AST schema 13） |
| claude-mem | v13.35.0 | v13.37.0 | 3 版（28 提交） | 实质（**隐私剥离先于服务端遥测**——`<private>` 内容在 server-runtime events 落盘前剥离；**环境退出权先于 worker 启动**——hooks 在拉起 worker 前先核 opt-out；**只放自己拿的锁**——chroma writer-lock 只释放本连接获取的；sqlite schema-writer 原子盖章+busy_timeout 等待） |
| open-code-review | v1.12.13 | v1.13.0 | 1 minor（10 提交） | 中等（**ACP 服务形态暴露评审能力**（#1218）——评审从 CLI 升格为可被 agent 宿主接入的服务；**渲染溢出记为失败评审**——prompt overflow=failed review 不是跳过；删除文件经 file_read_diff 可读+按自身路径列出；ChatGPT plan 走公共 Responses API） |
| gstack | main tip e23f7b80 | main tip 7edaf4f5（v1.91.98.0） | +5 提交 | 中等（**计划义务与仓门禁对账**（plan obligations meet repo gates）；**无人值守 autoplan 必须可关闭**；**诚实安装与自升级**；重开的门禁修订里决策 id 保持唯一；codex --effort 覆盖推理档） |
| ruflo | v3.56.7 | v3.56.9 | 2 patch（26 提交） | 薄（worktree 移除后 status/diff 不再全仓跑——作用域纪律；console 钉定 Skills 页跑的 skills CLI；real-CLI 测试隔离进 quarantine 套件；witness 117/117 重生） |

零移动：claude-code（npm 2.1.296=最新，live CLI 同版零漂移）、codex（rust-v0.162.1=最新 stable，0.163 全 alpha 不取）、openspec（1.14.1）、codex-security（npm-v0.2.0）、ECC（v2.2.3）、mattpocock-skills（v1.3.1）、pua（v3.5.1）、semantica（v0.7.0）、gsd-core（v1.16.0）、comet（0.4.5）、superpowers（v7.0.0）、gitnexus（v1.6.12）、better-harness（v0.6.6）、dsh（dsh-v0.2.1-alpha.2 维持 alpha 通道）、harnesseval-w（tip 零前移）。

**诱取拦截第九例**：graphify 远端 v1.0.0（0a31c08 异源）仍在，v0.9.89 世系核验通过（`git merge-base --is-ancestor v0.9.86 v0.9.89` 实测成立，v8 线延续）。

## 二、核验锚点

- graphify v0.9.89：v8 世系核验通过（merge-base 祖先确认）；28 提交 log 实读；关键提交 41b4e19（ObjC member calls 跨仓）/1695efa（Go 接收者声明类型解析）/9aa9d03（守门失败实现者不计置信度）/836fb8f-6d64681（四语言泛型参数不入引用）message 全读。
- claude-mem v13.37.0：3 版 tag 排序核验（13.36.0/13.36.1/13.37.0）；fcc4b3be（隐私剥离）/a9551380（opt-out 先于 worker）/84ff79a0（只放自己拿的锁）message 全读。
- open-code-review v1.13.0：10 提交逐条读；e96c79d（ACP service）/4a3844c（prompt overflow=failed review）message 全读。
- gstack tip 7edaf4f5：+5 提交逐条读（v1.91.94.0→v1.91.98.0 五版本号全读）。
- ruflo v3.56.9：2 patch 26 提交 head 逐条读（薄轮定性）。
- live CLI：claude 2.1.296（`claude --version` 实测=漂移归零）/codex 0.160.0（`codex --version` 实测，滞后 0.162.1 记档，升级窗口待用户）。

## 三、吸收（过决策 46 两问：是否改变本技能工作方式/是否为可复用方法论原语）

1. `references/code-graph-tools.md` 新增 R110 段 + 基线 v0.9.86→v0.9.89：
   - **跨仓边界的「先停靠后链接」**：成员调用的接收者类型声明在另一仓（或本仓解析边界外）时，graphify 不丢弃也不误绑——先「park」（显式挂起状态），待跨仓信息可得时再链接（Go/Kotlin/ObjC/PHP/TS 五语言各自落地，TS 仅对 .mjs/.cjs 激活并按 interop 家族门控索引）。方法论原语：**解析不完备时保全调用点身份，宁可挂起不可错绑**——与本仓「同名 ≠ 同物」纪律同轴的新证据面（跨仓域）。
   - **置信度计量防守门污染**：接口成员链到每个实现者，但 gate 失败的实现者不计入置信度分子——链接可以宽，置信必须净（计数口径与链接口径分离）。
   - **泛型类型参数不入引用**：Swift/C++/Scala/Kotlin 四语言把泛型参数从引用边丢弃——类型参数是声明域噪声不是依赖信号（Go 的 per-function receiver 作用域先收窄同理：接收者类型从自己函数的作用域定型，先于扁平包级查找）。
   - 其余：ObjC enum 宏提取（拒绝不完整宏解析、保 attributed 成员）、js import 解析到 tsx 源、Pi 原生 guard 扩展、AST schema bump 13（缓存代际）。
2. `references/review-methodology.md` 新增 R110 段（open-code-review v1.13.0 + gstack tip）：
   - **评审能力以 ACP 服务形态暴露**：OpenCodeReview 提供 ACP service——评审从「人跑的 CLI」升格为「agent 宿主可编排的服务面」（与本仓 ACP 委托链路同构；宿主等价面=已具备，记档形态参照）。
   - **渲染溢出=失败评审**：rendered prompt overflow 记为 failed review 而非静默跳过——评审输入构造失败必须以失败呈现（fail-closed 族在评审输入面的实例：不可构造≠不评审）。
   - **删除的文件也要可读可列**：file_read_diff 让已删文件在评审中可读+变更清单按其自身路径列出（而非塞进 diff 折叠）——评审输入完备性（删除也是变更）。
   - **计划义务与仓门禁对账**（gstack v1.91.98.0）：plan obligations meet repo gates——计划里承诺的义务必须能对上仓里真实存在的门禁（对「计划与门禁两张皮」的反向约束）；**无人值守 autoplan 必须可关闭**（closable unattended runs）+ 诚实安装/自升级（honest install and self-upgrade，字段波实录修复）；**重开的门禁修订里决策 id 保持唯一**——身份族在门禁修订域的实例（ reopened gate revision 不复用旧决策 id）。
3. `references/memory-persistence.md` 新增 R110 行（claude-mem v13.35.0→v13.37.0）：
   - **隐私剥离先于遥测落盘**：`<private>` 内容在 server-runtime events 记录前剥离——隐私边界是管道的第一站不是最后一站（顺序即语义）。
   - **退出权先于启动**：hooks 在拉起 worker 前先核环境 opt-out——用户说退出就不能先开工再补退（opt-out 生效时点前移到进程创建前）。
   - **只放自己拿的锁**：chroma writer-lock 只释放本连接获取的实例——放别人的锁=制造并发窗口（锁的持有者身份与释放者身份必须一致）；sqlite schema-writer 原子盖章+busy_timeout 等待（老二进制拒绝写新 schema）。
   - 其余：malformed Gemini answer 隔离（畸形答案不毒化会话）、嵌套 refused connections 识别、observer 默认回落 Anthropic plan、BOM 前缀 account JSON 可读。
4. ruflo v3.56.9 薄记 baseline 行（worktree 移除后 status/diff 收窄作用域=最小权限在观测面的实例；real-CLI 测试隔离 quarantine=毒性测试分区）。

## 四、同构观察（跨运行时主题）

- **「不完备时保全身份」三域会师**：graphify 跨仓成员调用先停靠后链接（图谱域）+ open-code-review 删除文件可读可列（评审输入域）+ gstack 门禁重开决策 id 唯一（治理域）——三个域同一周各自落地「不因信息不全而静默丢实体」；与本仓证据链纪律同轴。
- **fail-closed 面继续扩散**：渲染溢出=失败评审（构造面）/opt-out 先于 worker 启动（进程面）/只放自己拿的锁（并发面）——「不可构造/不该开工/不该放锁」三类不可通行都从放行改为拒绝。
- **计量与链接分离**：graphify 链接可以宽（每个实现者都链）但置信必须净（守门失败者不计入）——与 R106「评估与生成分离」同族，出现在图谱置信度面。

## 五、验证

- 门禁：self-check.sh / tests/run-sweep.sh / tests/test-r68-jargon-free.sh 见发版记录（v2.75.0）。
- 回归：典型前后端项目验证见 CHANGELOG 与 §六。

## 六、回归载体（典型前后端项目）

本轮回归载体取**典型前后端分型**：Node/TypeScript 后端（Express + Prisma + SQLite）+ Vue3 前端（Vite），对 generated skill 跑全流程验证。执行记录见 CHANGELOG v2.75.0 段。
