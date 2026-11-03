# vendor 升级批：hermes-agent v0.22.5 → v0.22.6（2026-11-03）

## 变更

用户令升级（上游 2026-11-02 发布 v0.22.6；宿主 `~/.hermes/hermes-agent` 已自更新到 f0d94882e＝v0.22.6，SIM 快照源随之漂移致补丁 599 上下文失配，mx-setup 首跑撞 FAIL——本批为 run26 前置）。

- `vendor/hermes-agent` 基线整树替换：`bf0203a794`（v0.22.5）→ `f0d94882e`（v0.22.6），走 `npm run vendor:sync` 显式通道＋`VENDOR_SYNC=1` 提交。
- 上游跨越：3482 提交 / 4316 文件（+248579/−94077）。
- `patches/series` 中 agent 面补丁（约 119 枚）在新基线上逐枚重放对账；失配者按三型处置（上下文重生成 / 行校准 / 退役——语义已被上游吸收的退役进 `.archived-patches/`）。
- `vendor/VENDOR.md` 台账同批更新。
- 上游自带 `.gitignore`（`export*` 与 `apps/desktop/electron/**/*.d.ts`）误伤的 7 项基线文件按 2026-11-02 复核批裁定 `git add -f` 补录。

## 决策记录

1. **在主检出走 vendor:sync 通道而非 worktree**：`scripts/vendor-sync.sh` 自身定义的通道序列（rm -rf 整树替换 → VENDOR_SYNC=1 提交 → npm run inject 重放验证）以主检出注入态为工作面，与 AGENTS.md §目录规则 1 的「基线替换显式通道」一致；worktree 规则（§1）面向常规开发批，本通道是仓内立法的例外通道。
2. **SIM 运行时补丁与仓内补丁同源收敛**：`mx_apply_agent_patches` 的运行时 series 是 `patches/` 的子集，599 失配根因＝基线漂移而非补丁错——修补丁正身（对齐 0.22.6 上下文），不在 SIM 侧加旁路。
3. **宿主树已 0.22.6 的处置**：宿主自更新不回滚；仓内基线追平后，运行时覆盖层（runtime/ 模板）按内容部署通道自然对齐，无版本钉需要改。

## 验证

- **inject 重放**：clean+inject 全量 **434 补丁零 WARN 零 SKIP**（agent 面 82 枚含 17 枚重生成件全数套上；exit=0）。
- **失配处置清单（17/17）**：3way 自动合 14 枚（118/397/406/407/408/409/410/475/599/604/611/633/726/729）；手解并集 3 枚——450（上游同元组新增 timezone/grace_minutes/catch_up 与我方 base_url 并集）、470（上游签名新增 control_reserve 与我方 collab_event_id 并集）、725（上游 silence_allowed 包裹与我方回合恢复块叠放，去重合一处 run_conversation 调用）。三枚手解件 `ast.parse` 过语法门。
- **语义落树抽验**：`turn.ended`×2（conversation_loop.py）、`run_chat_recovery`×2（run_turn_runner.py）、`base_url`×2（subcommands/cron.py）。
- **重建纪律**：regen 链在上游仓临时 worktree 按真实序重放 82 枚（每枚一提交取边界 diff），完成后 `git worktree remove` 走 git 通道清理。
- **基线提交**：`60a5a849b`（4318 文件；`get-windows.d.ts` 在暂存内核验过）。
- **追加失配（SIM 运行时面，series 外）**：`643-agent-mautrix-darwin-ungate`（SIM-only 补丁、不在 series）上下文绑旧版 asyncpg==0.31.0/aiohttp-socks==0.11.0，上游 0.22.6 进位为 0.32.0/0.12.0——版本行校准后快照可套（`743a18709`）。
- **版本载体进位**：agent-teams 底座跟进入位 `v0.22.6-team.1`（扩展序归 1，方案裁定原文）——team/VERSION、team/version.json、RELEASE-MANIFEST（3 处）、team/README Current 行、requirements 两注释同步；设计文档索引机械覆盖补 13 份 spec 链接＋计数 510→523（`b544da09c`）。
- **全量测试（确认轮）**：`npm test` **1019 文件 / 7488 tests / 0 failed**（11 skipped 既有）。首轮 9 红全数定谳：3 枚版本载体红=本批真债（已修）；1 枚培训手册索引红=13 份 spec 缺登记（已补）；5 枚客户端组件红=与 mx-setup 并跑的资源挤兑假红（隔离复跑 27/27 绿，541s→15s 负载签名实锤）。

## 设计文档影响

DESIGN_SYNC: none。理由：vendor 基线替换是钉版上游的版本前进，不改本仓架构、契约与阈值；agent 面补丁语义不变（仅上下文对齐）。VENDOR.md 台账随批更新。
