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

（执行后回填：inject 重放结果 / 失配补丁处置清单 / 目标测试 / 全量 npm test / mx-setup 复跑结果）

## 设计文档影响

DESIGN_SYNC: none。理由：vendor 基线替换是钉版上游的版本前进，不改本仓架构、契约与阈值；agent 面补丁语义不变（仅上下文对齐）。VENDOR.md 台账随批更新。
