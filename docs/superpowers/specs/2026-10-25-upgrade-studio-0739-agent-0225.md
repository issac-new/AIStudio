# hermes-studio v0.7.39 + hermes-agent v0.22.5 升级轮（驾驶舱/技能面回归）

- 日期：2026-10-25
- 分支：feat/upgrade-0739-0225（收口于 trial 链：基线 215eed9e0 + 补丁迁移提交 + 收口批）
- 范围：vendor 基线同步至上游最新稳定 tag，补丁全量重放适配，重启前后端服务，驾驶舱与技能面完整回归。
- 执行实录：两会话接力（晨会话逐补丁迁移至 566 号后停摆；接管会话续跑器完成余量并收口——含并行/接管边界两轮 15 分钟判据实测）。

## 变更

| 组件 | 升级前 | 升级后 | 依据 |
|---|---|---|---|
| hermes-studio | v0.7.38 (`04e5d9aa7`) | **v0.7.39** (`8f215f59d3a`) | GitHub 最新非预发布 release tag；`v1.0.x` 为 Android/其他发布线，不进桌面基线 |
| hermes-agent | v0.22.4 (`4d04303818`) | **v0.22.5** (`bf0203a794a`) | GitHub 最新非预发布 release tag（origin/main 为 canary 线不取） |
| zcode | `3c5b2276` | `3c5b2276` | 零移动（**同步口径=上游 main 变更，非版本 tag**，2026-10-25 用户裁定；实测 main 0 落后） |

补丁迁移面：series 397 项全量迁移完成；相对旧版实际内容变更 **12 个补丁文件**（+351/-335），其余 385 项在新基线上逐字节可用。真实冲突手工迁移：567（ekko mcp tool_mode——上游 requestTimeoutMs 字段致上下文漂移，五 hunk 手工落位）；042 重生成（链提交父态异常，按文件级基线→终态差量重生成）；611/612 双号撞名族按全名精确匹配重生成。

连带交付：`runtime/gateway/run_busy.py` 同步至 vendor 补丁版（原落后 30 行，缺 capacity sidecar 特性——pytest 拼合树实抓）；`zcode-patches/series` 基线头对齐 3c5b2276（差一提交历史挂账清偿）；`vendor/VENDOR.md` 基线表更新+zcode 同步口径入册。

## 决策记录

1. **取 tag 不取 origin/main**：稳定线策略不变。
2. **接管续跑器**（resume-inject 语义）：跳过依据=apply 提交链补丁号名单 + 反向 check 双保险；路由复刻 inject.mjs 前缀表；干净段自动批量应用，真冲突停下待手工。实测：停摆会话剩余 112 项中仅 567 需手工，其余全自动。
3. **补丁回写=从提交链差量重生成**：晨会话只改 vendor 不回写 patches/（干净重注入会再炸的结构性缺口）——收口批以「reset→regen→inject 全量重放」原子循环收口，直至 397 项零失败零跳过。
4. **双号撞名（611/612 各两个不同补丁）按全名匹配**：号匹配会让后提交内容覆盖前者文件（实测两个 WARN 跳过+gateway 侧内容缺失）。
5. **重放树 vs 晨链终态差异处置**：非 zcode 差异=0；zcode 15 文件=重放树更完整（七补丁在 pristine 全量重放=VENDOR.md 认证态，晨链 zcode 段不完整）——以重放树为准。
6. **环境类测试失败不判回归**：/tmp 树位对相对路径回退族天然敌意（up-4/up-5 布局假设+共享 vite 缓存烙印），最终门=合并后在规范位（serve-main）跑全量，与基线背靠背对照。
7. **服务重启顺序**沿用：停 8649/8647 → inject 完成态 → 后端 → 前端 → 活体探针。

## 验证

| 门 | 标准 | 结果 |
|---|---|---|
| ① 补丁重放 | studio 零 FAILED；agent 零 WARN 跳过；可从 pristine 基线完全复现 | ✅ inject rc=0、397 项全应用零跳过；重放树==链终态（非 zcode 差 0，zcode 差=合法完整态） |
| ② 依赖与类型 | 依赖齐备；typecheck rc=0 | ✅ 上游零依赖增量；npm install 补 three@0.170.0（锁内久缺装）；typecheck:harness rc=0 |
| ③ 测试 | pytest 拼合树全绿；vitest 全量与基线背靠背对照 | ✅ pytest **44/44**（含估算 8+分解 9+围栏 5+容量 5+外发 12+并发，拼合树=vendor 补丁版+runtime 覆盖+run_busy 权威版）；基线 vitest 全量 **868 文件/6257 用例 0 失败**（09:17 的 41 败为 node_modules 缺损所致，install 后自愈）；升级树规范位全量见收口批回填 |
| ④ 活体 | 8647 health 200 且 webui_version=0.7.39；8649 页面 200；驾驶舱/技能页走查 | 见收口批回填（换装 serve-main 后执行） |
| ⑤ 元数据 | VENDOR.md/runtime/zcode series 同步 | ✅ 本批齐（基线表/zcode 口径/series 头/run_busy） |

## 收口批回填（合并后）

（换装与规范位全量结果落此段：8647 health 版本号、8649 走查、vitest 对照）
