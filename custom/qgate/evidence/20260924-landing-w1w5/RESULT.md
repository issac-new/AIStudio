# 2026-09-24 落地方案执行轮（W1-W5）实证

上游方案：`docs/superpowers/plans/2026-09-24-qgate-v0.1-landing-plan.md`（用户裁定：⚖️1-5 维持建议，⚖️6 全做）。

## W1 · L0 域门族（此前唯一整域空白，v0.1 §6.1）

三门落地（`gate-packs/l0/`），demo-l0 五分支实测：

| 门 | executor | 实测 |
|---|---|---|
| `L0.scope-check` | scope(mode=scope)：.qgate/scope.yaml 声明 glob vs 变更集 | 超范围 `db/x.sql` → FAIL 点名（exit 1，明细在证据摘要）；全在 src → PASS；未声明 scope.yaml → error/INCONCLUSIVE（不是 PASS） |
| `L0.acceptance-coverage` | scope(mode=acceptance)：criteria 逐条须有 covered-by | 全映射 PASS；缺映射条目 FAIL 点名；文件缺失 error |
| `L0.registers` | files+mustContain：assumptions/decisions 在档且含标记段 | 标记齐 → PASS（exercised 级——mustContain 是真实内容检查，见语义校准）；缺标记 → warn 档呈现带解除条件的 CONDITIONAL（明细 `registers-present:fail`） |

**语义校准（实测逼出）**：mustContain 从 present 升为 exercised——纯存在性=在档≠验证（present），标记检查真实执行过（exercised），缺失即真 FAIL 而非降档。

**缓存适用面收窄（真漏洞）**：demo-l0 复测逮住 files/scope 类执行器输入是**文件内容**，非 git 目录下 cache key 不随内容漂移（改登记文件后命中旧证据）。修复：仅 argv 确定性 executor（command/llm）参与缓存；文件类门毫秒级无需缓存。

## W2 · 命令面（§35 全集）

补 `/qgate-evidence`、`/qgate-risk` 两命令文档 → 插件命令面 7 个（status/run/explain/plan/init/evidence/risk）。

## W3 · CI adapter（§2.1 最小面）

`.github/workflows/qgate.yml`：push/PR 触及 custom/qgate 时 node24 + install + tsc + vitest。另建 `custom/qgate/vitest.config.ts`（独立 include `__tests__/*.test.ts`——修复 standalone `npm test` 误扫 demo *.test.mjs 的旧问题）。CI 只跑 qgate 面：overlay 全量依赖本地注入态 upstream 树，不可复现。

## W4 · Claude Code 双宿主实测

- claude CLI 2.1.278；settings.json 注入 SessionStart+Stop 两钩子（同形态 schema）→ headless `claude -p` 一轮 → **settings 已还原**（备份 settings.json.bak-qgate-w4）。
- **实证**：SessionStart 执行 ✓（hooks.log，claude sessionId 格式）；Stop 执行并发射 block ✓（attempt:1, blocking=engineering.basic-check:INCONCLUSIVE(never)）。模型 403（用户 claude 额度耗尽）不影响钩子面证据——钩子在回合首尾均运行。
- **逮出残余缺陷并修复**：stop.mjs 过滤条件 `blocking || verdict==='INCONCLUSIVE'` 的 OR 兜底绕开了 isBlockingVerdict 的 policy 求值 → never-run 的 warn 档门仍被拦（advisory 形同虚设）。修复：只认 CLI 计算的 blocking 字段。双对照实测：demo-l0（全 warn never-run）→ approve ✓；demo-lint-fail（block 档 FAIL）→ 仍拦 ✓。

## W5 · 归档 + 脱敏（§50/§51）

- **脱敏**：store 写入路径统一 redactForStore——secret 名值模式（api_key/token/secret/password/authorization/credential）+ 环境变量值打码。泄漏负例测试：命令 stderr 打印 env secret → 落盘证据 `***REDACTED***` ✓。
- **evidenceCommit**：qgate.yaml 开启后 `qgate run` 把证据复制进 `docs/delivery-evidence/<runId>/`（可提交区，对齐交付标准"证据落卡"）——CLI 实测绿。

## 验证

qgate 套件 **6 文件 52/52 绿**（+7 例：scope×2/mustContain/L0 端到端/脱敏×2/归档）；tsc 零错；worktree 隔离开发（并行会话占主检出）。
