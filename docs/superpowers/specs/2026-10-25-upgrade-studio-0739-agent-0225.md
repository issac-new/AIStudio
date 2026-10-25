# hermes-studio v0.7.39 + hermes-agent v0.22.5 升级轮（驾驶舱/技能面回归）

- 日期：2026-10-25
- 分支：feat/upgrade-0739-0225
- 范围：vendor 基线同步至上游最新稳定 tag，补丁全量重放适配，重启前后端服务，驾驶舱与技能面完整回归。

## 变更

| 组件 | 升级前 | 目标 | 依据 |
|---|---|---|---|
| hermes-studio | v0.7.38 (`04e5d9aa7`) | **v0.7.39** (`8f215f59d3a`) | GitHub 最新非预发布 release（2026-10-23）；`v1.0.x` 为 Android/其他发布线，不进入桌面基线 |
| hermes-agent | v0.22.4 (`4d04303818`) | **v0.22.5** (`bf0203a794a`) | GitHub 最新非预发布 release（2026-10-23） |
| zcode | `3c5b2276` | `3c5b2276` | 零移动（**按 origin/main 变更对账**，不按 tag；origin/main 现为 `3c5b2276`） |
| research 组件 | agent v0.22.4 内置 | agent v0.22.5 内置 | `skills/research` + `optional-skills/research` 随 agent 基线；`team/skills/research` 为部署副本，需同步核对（worldmonitor-intel 为本地独有） |

差异规模（实测）：

- studio：24 提交 / 212 文件（client 42、server 34、tests/server 24、e2e 20、desktop 11）。
- agent：261 提交 / 804 文件（apps/desktop 208、tests/hermes_cli 62、website/docs 37、tests/tools 35、ui-tui 24）。
- 补丁面：series 454 个补丁；与上游改动文件相交 studio 140、agent 10（相交≠必冲突，以 `git apply` 实测为准）。

## 决策记录

1. **studio/agent 取 tag，zcode 取 origin/main**：studio/agent 沿用稳定线策略（最新非预发布 release）；zcode 按用户 2026-10-25 口径以上游 main 变更对账，不按版本 tag（当前 main 与基线同 commit，零移动）。
2. **试重放先行**：在 `/tmp/aistudio-upgrade-trial`（detached worktree）替换 vendor 后跑 inject，先拿到完整失败清单，再决定补丁移植范围；主检出基线暂不动。
3. **agent 补丁失败不静默吞掉**：inject 对 agent 补丁历史上容忍跳过；本轮要求逐条确认——若失败必须手工移植或明确记录降级理由，禁止以「WARN 跳过」作为完成标准。
4. **运行时镜像随基线刷新**：`runtime/` 镜像与 `runtime-manifest.json` 按 agent v0.22.5 工作树重刷，保留镜像独有文件（noise_filter、style-charter 等）。
5. **依赖锁随注入态重生成**：vendor/hermes-studio 注入态 `npm install` 后，按既有 687 补丁通道收口差异，不让锁漂移进基线。
6. **服务重启顺序**：停 8649/8647 → 确认无监听 → inject 完成态 → 后端 8647 → 前端 8649 → 活体探针。
7. **回归口径**：全量 vitest + typecheck:harness + zcode catalog + bundle 预算 + IDE smoke + 浏览器走查（驾驶舱、技能页、聊天主路径）。
8. **research 组件同步**：research 族（`skills/research`、`optional-skills/research`）随 agent 基线升级；`team/skills/research` 与基线逐字节核对——上游三件（arxiv/llm-wiki/competitor-news-monitor）保持一致，grounded-citations 保留本地补丁（URL 尾括号百分号编码指引），worldmonitor-intel 为本地独有件不覆盖。research 参考仓（`upstream/dsh-*`、deepseek-harness 等）仅作研究缓存、无运行时引用，不进入 vendor。

## 验证

| 门 | 标准 |
|---|---|
| ① 补丁重放 | studio 零 FAILED（硬门）；agent 失败项全部有处置结论；zcode 7 补丁通过；`npm run clean` 可反向回 pristine |
| ② 依赖与类型 | vendor `npm install` 成功；`npm run typecheck:harness` rc=0 |
| ③ 全量测试 | `npm test` 零失败（或失败项有基线对照证明非本轮引入） |
| ④ 活体 | 8647 `/health` 200 且版本号为新基线；8649 页面 200 且驾驶舱/技能页渲染无 console error |
| ⑤ 元数据 | `vendor/VENDOR.md`、runtime mask/manifest、技能版本说明同步更新 |

## 验证结果

（待回填）
