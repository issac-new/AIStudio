# 2026-11-04 vendor 升级批：hermes-agent v0.22.6 → v0.22.7

> 状态：草稿（预演产物，换血轮搬入 worktree 后补实测验证段）
> 预演证据：/tmp/agent-v0227-prep/report.tsv（85 枚 dry-run 明细）＋ /tmp/agent-v0227-prep/repo（重放终态仓库）
> 上游身份：v0.22.6 = `f0d94882e`（现基线，与 VENDOR.md 一致）→ v0.22.7 = `b200f5bc6`，589 提交 / 554 文件 / +24012 −3144

## 变更

1. **vendor/hermes-agent 基线换血**：`npm run vendor:sync` 显式通道（`VENDOR_SYNC=1` 提交），upstream/hermes-agent 缓存树 checkout v0.22.7 后整树 archive 替换。
2. **agent 面 85 枚补丁新基线重放**（预演结论）：
   - 82 枚 direct 全过，零改动。
   - `408-agent-tool-model-overrides`：真冲突——上游在 `_load_tools` 的 `agent.tools = agent_tool_surface(...)` 前新增 `_tool_snapshot_selection` 赋值行并删其后空行，408 插入块上下文漂移；重生成（并集型）。
   - `470-hosted-rooms-collab-event-id`：真冲突——`gateway/hosted_rooms.py:956` 上游 17+/8-（room lead 路由主题）；3way 出冲突标记，手解并集（上轮同族 450/470/725 手解先例）。
   - `593-agent-per-tool-allowlist`：预演假阳性大概率——临时仓缺 pre-image blob 报 "lacks the necessary blob"；真仓 git 历史含旧基线 blob，3way 预期自动合，若仍冲突按重生成处置。
3. **载体链六处同批**：
   - `vendor/VENDOR.md`：台账表 hermes-agent 行（commit/版本）＋ dated 升级条目。
   - `AGENTS.md:27`：vendor 行 v0.22.6 → v0.22.7。
   - `README.md:117`：agent 版本列。
   - `team/VERSION`：`v0.22.7-team.1`（底座段跟进、扩展序归 1，2026-10-27 版本方案）。
   - `team/README.md`：Current 行＋What changed 节（base bump only）。
   - `RELEASE-MANIFEST.json`：version / notes / vendorBaseline 三处。
   - `release:check` 门校验 VERSION 两段对齐（team/VERSION:3 注释）。
4. **runtime 覆盖层三型重灌复核**：63 dest 条目中 5 条命中上游变更——`hermes_cli/subcommands/cron.py`、`gateway/hosted_rooms.py`（与补丁 470 双重碰撞）、`gateway/platforms/base.py`、`toolsets.py`、`agent/tool_executor.py`；按 runtime-rebase-v0226 配方（镜像化/3way/签名并集后 body 使用行单补）重灌＋`scripts/deploy-agent-runtime.mjs --force` 宿主对齐复核差异 0。
5. **`.gitignore` 误伤补录核验**：vendor-sync 重建基线后 `git add -f` 补录 electron `*.d.ts`/`export*` 误伤面（上轮 7 件先例规则）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 预演先行、席位空后换血（用户裁决 C 案） | patches/vendor 席位 2/2 被 739/740 占用（2026-11-04 14:06 起），分层上限禁止第 3 任务；只读预演不产生提交不占席位（AGENTS.md §0/§1.0） |
| D2 | 不为 0.22.7 新增补丁号 | 85 枚存量覆盖面完整，升级只重生成存量（408/470/593），无新行为面 |
| D3 | 739 兼容性预判放行：3way 全清 | 预演末位附测 5 个 kanban 文件 cleanly（/tmp/agent-v0227-prep/report.tsv），升级与 dispatch-debt 任务互不阻断；合并顺序任一方先走摩擦均低 |
| D4 | simharness 0.22.6 字面引用不随批改 | final-report-merge.py:598 / mx-lib.sh:948,970 为历史叙事与轮次注释（来历归 git），非版本载体 |
| D5 | docs/manuals/aistudio-design-document-index.md 不改 | 快照基线记录（核实日 2026-11-03），记录当时事实 |

## 验证

- [x] 预演（本轮）：85 枚 agent 补丁 v0.22.7 pristine 顺序重放，82 direct / 3 CONFLICT；739 附测 3way 清。路由谓词镜像 `resolvePatchTargetRoot`（首 ---/+++ 目标＋全前缀清单）。
- [ ] 换血轮门（净 pristine 单跑，禁止半注入态起测——0.22.6 轮教训）：
  - `npm run clean && npm run inject` 全量零 WARN（agent+studio+zcode 全树）。
  - `npx vitest run` 目标面（vendor 路径）→ `npm test` 全量。
  - 拼合树 pytest（runtime/tests 94 例，v0226 轮配方：manifest 条目覆盖＋runtime cp＋custom 软链＋PYTHONPATH）。
  - `release:check`（team/VERSION 两段对齐）。
  - runtime 部署复核：manifest 全条目差异 0（含 5 条重灌件）。
- [ ] 台账一致性：VENDOR.md 基线 commit = upstream/hermes-agent HEAD = v0.22.7^{commit}（pristine 规则）。

## 设计文档影响

DESIGN_SYNC: touched —— `vendor/VENDOR.md`（vendor 台账正本，本批修订）、`AGENTS.md`（vendor 行版本）、`team/README.md`（版本方案叙述）。数字总账面无涉（team 版本真源=team/VERSION，随批）。

## 换血轮 TODO 清单（搬入 worktree 后照单执行）

1. worktree：`feat/vendor-agent-v0227`（等 739/740 收口释放席位）＋IN-FLIGHT＋`npm install` 级依赖按 worktree-flow。
2. `git -C upstream/hermes-agent status` 核 pristine → checkout v0.22.7 → vendor:sync 换血 → .gitignore 误伤补录。
3. 净 pristine 起点单跑 inject → 3 枚失配处置（408 重生成/470 手解/593 期望 3way 自合）→ 全量零 WARN。
4. 载体链六处＋A.1 登记三处（docs-ssot-guard 实测裁决计数口径）。
5. 验证门全跑（上节）。
6. 合入：fetch → main ff-only → rebase → `--no-ff` → 删 worktree 走 git 通道。
