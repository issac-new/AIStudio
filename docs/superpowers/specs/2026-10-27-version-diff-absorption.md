# 2026-10-27 版本差异吸收第一批：外部 CLI 会话索引

## 变更

本轮兑现上一轮复盘里的承诺：把"只记录版本差异"补成"有吸收落码＋逐项裁定"。范围与取舍如下。

### 一、吸收落码（本批一项）

新增只读的外部 CLI 会话索引，吸收源是 kimi-code 2.3.3「导入 Claude Code 与 Codex 会话」（上游 #4342）。

1. `custom/server/sessionarchive/external-cli-sessions.ts`：扫描 `~/.claude/projects/**/*.jsonl` 与
   `~/.codex/sessions/**/rollout-*.jsonl`，归一成「来源／会话 id／工作区／用户轮数／助手轮数／
   最近活跃时间／源文件路径」。
2. `GET /api/harness/external-sessions`：只读端点，支持 `limit`（1-200，默认 30）、
   `includeTitles=1`、`source=claude-code|codex`。
3. `custom/server/sessionarchive/__tests__/external-cli-sessions.test.ts`：11 例（两种格式解析、
   sidechain 排除、半行容错、压缩件跳过、单源在场、截断标注、标题超长）。

与上游语义的差别（如实声明）：上游把会话内容搬进自己的会话库；本仓只做只读索引，不复制正文、
不写入源目录。要看内容按 `file` 路径回源读取，避免制造第二份真相。

隐私边界：标题只取首条用户消息前 120 字，且 `includeTitles` 默认关闭；助手正文不进返回值。

### 二、剩余 8 项版本差异的处置

逐项裁定写进台账 `docs/upstream-analysis/component-ledger.md` §3 的「差异吸收裁定」表，
本批不落码的项目都写明理由与触发条件。

### 三、两个现场问题的处置（非本仓代码）

- `docs/superpowers/specs/2026-10-26-cockpit-full-audit-refactor.md`：并行会话在 2026-10-26 留在
  main 工作区的未跟踪文件，使 `docs-ssot-guard` 在 main 上持续报 missing。已原样移入
  `.claude/worktrees/.quarantine/stray-20261027/` 并附 README（内容未改、可随时取回），守门复核转绿。
- 仓根畸形目录 `${PROJECT_DIR:-/`（2026-10-27 10:22，早于本会话）：已原样移入同一隔离目录。
  成因是某个脚本把未展开的变量字面量当路径传入，本会话多次提交未复现，未定位到具体产出方，如实记录。

## 决策记录

- D1：吸收只做只读索引，不做内容搬运。理由：搬运会造出与源目录并存的第二份会话真相，且需要处理
  增量同步与删除语义；只读索引零写入风险，且足以支撑"先发现有哪段历史"的用途。
- D2：隐私默认收紧。`includeTitles` 默认关闭、标题截断 120 字、助手正文一律不返回。理由：会话正文
  可能含密钥与客户信息，端点按需开启比默认全量更稳。
- D3：压缩件 `.jsonl.zst` 不做隐式解压，进 skipped 并标 `compressed-unsupported`。理由：引入 zstd
  依赖超出本批范围；静默丢弃会让"扫到 N 个"变成假数。
- D4：其余 8 项差异不硬凑落码。逐项给出理由：
  - dsh-context v0.77 Fleet 驾驶舱：形态是 UI 重构，现有 Fleet 子树聚合（`tokens/fleet-tree.ts`）
    已覆盖数据面，缺的是界面；等有页面改版需求再做。
  - mimo-code 0.1.16 `/compose-next` 六段流：与本仓 spec-first 九节点同构，属方法论参考，无新增代码。
  - qgate v2.0 `scope:event`：仓内无 AsyncAPI 事件契约消费者，维持上一轮"暂缓"裁定。
  - claude-code 2.1.311 / codex 0.164 / kimi 2.3.3 的其余条目：集中在运行时（自动压缩、MCP 迟连接、
    TUI 申诉通道、沙箱禁读路径），属 agent/CLI 自身行为，overlay 无接线点，随上游升级轮跟进。
  - multica 0.7.0 移动端与 Gantt 分页：本仓无移动端与 Gantt 视图。
  - diagram-design 2.6.131：21 个 patch 全为修复，物化镜像版本口径另记，不触发技能升级。
- D6：S1 分层口径修正（活体走查驱动）。fail-open 的 PASS 之前同时进「逃逸」与「不可用」，
  指标自相矛盾；改为先剔不可用再分档，比率只在可用样本上算。理由：不可用不是逃逸，
  混算会让护栏效果虚高或虚低。
- D5：修复 `--strict false` 下的类型窄化陷阱。`typecheck:harness` 关闭 strictNullChecks 后，布尔字面量
  判别式（`{ok:true}|{ok:false}`）不会收窄，本仓已两次踩到（board-ownership、本模块）。本批改用属性
  存在性窄化（`'row' in parsed`），并在注释里写明原因；不改 tsconfig，避免牵动全仓。

## 验证

- `npx vitest run custom/server/sessionarchive`：13/13（新增 11 例）。
- `npx vitest run custom/server/sessionarchive custom/server/harness/__tests__`：88/88。
- `npm run typecheck:harness`：0 错（新模块已并入点名清单）。
- 本机真实数据实测（node strip-types）：两源均可读，命中会话含 117/215 轮的长会话；skipped 如实给出
  `file-too-large（9.2MB>`8MB）` 与 `无 user/assistant 消息行` 两类原因。
- 活体走查（2026-10-27，worktree 独立端口 8652 起服，官方 CLI 建临时 admin 后实测，用后即删）：
  - `GET /api/harness/callgate` 200，返回 `enforcing:false` 与空状态列表；
  - `POST /api/harness/callgate/rule` 200，规则登记后 `GET /callgate` 可见 `tool:web_search`；
  - `GET /api/harness/taskledger` 200，10 条登记（mention 源 8 条 executing、2 条 pending）；
  - `GET /api/harness/board-ownership` 200，available=true，读到本机 9 个域的归属；
  - `GET /api/harness/external-sessions?limit=3&includeTitles=1` 200，两源可读并返回标题预览；
  - `POST /api/hermes/eval/redteam/runs` 建 run → `POST /runs/:id/s1` 200。
- 活体走查抓到一个真实缺陷并已修：S1 分层把 fail-open 的 PASS 也算作逃逸，同批样本
  `passed=8 + failOpen=7 > 8`（两数相加超总数）。口径抽成纯函数 `redteam/s1-layer.ts`：
  先剔不可用再分档，修复后实测 `isolated 0 + confirmed 0 + passed 1 + failOpen 7 = 8`。
  守门用例 `redteam/__tests__/s1-layer.test.ts` 4 例锁住该口径。
- 全量：`npm test` = 928 文件 6,660 过 0 败 11 跳过（rc=0）。
- 后续补充（同日，边界闭合后）：见下节「补充：压缩件与大会话」。

## 设计文档影响

DESIGN_SYNC: none（新增只读端点与索引模块，未改变整合正本的机制描述、路由与端点计数以外的事实；
端点计数随总账下一轮对账，不在本批改动正本）

## 补充：压缩件与大会话（同日第二批）

原第一版把两件事列为"有意不做"，实现后发现两者都不需要新依赖，遂闭合。

- **压缩件就地解压**：`node:zlib` 自 Node 22+ 提供 `zstdDecompressSync`，本机 Node 24 具备。改为能力探测：有则解压 `.jsonl.zst` 再解析，无则进 skipped 标 `compressed-unsupported（当前 Node 无 zstd API）`，不假装支持。解压失败标 `decompress-failed`，不拖垮整批。
- **单文件上限 8MB→32MB，且可注入**：原上限把本机一个 8.8MB 真实会话挡在门外。上限通过 `maxFileBytes` 传入（默认 32MB，夹 1KB-256MB），解压后再判一次（`file-too-large-after-decompress`），压缩比异常不透支内存。
- 验证：`external-cli-sessions` 17/17（新增压缩件等价、损坏压缩件、超限、解压后超限四类）；`typecheck:harness` 0 错；真实数据复核——Codex 单源 65 个 `.zst` 全部解析；8.8MB 会话直接解析成功（轮数/工作区/时间可读），且它已不再出现在 skipped 里。

- D7：这两个边界用运行时内置能力关闭，不引入第三方解压库。理由：新增依赖与"零依赖纪律"冲突，而 Node 22+ 的 zstd 已够用；老 Node 走如实降级。

## 补充二：source 过滤下推（同日第三批）

活体走查发现 `?source=codex&limit=3` 返回空——过滤发生在截断之后，前 3 条被 Claude 会话占满，
筛完自然为空。修法：把 `source` 下推到扫描层（只收指定源，limit 作用于过滤后的集合）；
指定源缺席时 `available:false` 并点名该源，不再返回"空列表"让人误以为没有会话。
未知取值（如 `source=codex-cli`）直接 400 列出合法值——静默忽略会让人误以为筛过了。
守门用例 2 例（过滤下推、指定源缺席）。HTTP 面复核需重启 8647 后生效，结果记在交付说明里。
