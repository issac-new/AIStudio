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
8. **research 组件同步**：research 族（`skills/research`、`optional-skills/research`）随 agent 基线升级；`team/skills/research` 与基线逐字节核对——上游三件（arxiv/llm-wiki/competitor-news-monitor）保持一致，grounded-citations 保留本地补丁（URL 尾括号百分号编码指引），worldmonitor-intel 为本地独有件不覆盖。research 参考仓（`upstream/dsh-*`、deepseek-harness 等）仅作研究缓存、无运行时引用，不进入 vendor；11 个参考仓已全部 fetch 到最新。
9. **测试路径迁 vendor**：32 个 .test.ts 的旧 `lab/upstream` 解析统一迁到仓内 `vendor/`（相对导入/常量/`findUpstreamRoot` 三类），simharness 解析改为仓内同根；此外修复 `verify-dist`、`check-bundle-budget` 的旧路径回退。
10. **runtime 镜像三方合并**：以 v0.22.4 为 base、vendor v0.22.5 为 ours、runtime 为 theirs，保留镜像独有的 estimate/gate-guard/board 并发闸等能力，吸收上游变更；efficiency_ledger 文案取上游新词。
11. **容量泵 sidecar 补丁化（688）**：`capacity_retry.json` 旁路是纯运行时热修，上一轮镜像刷新被抹、pytest 守门复红；本轮从 `2ce5333a0` 恢复并制成 patch 688 进 series，保证后续刷新不可再抹。
12. **zcode 词条快照按宿主版本重建**：本机 ZCode 3.16.3 与仓内旧快照不匹配，按脚本要求 `catalog-check --refresh` 重建 `docs/superpowers/notes/zcode-3163`；vendor 侧 zcode 仍按 origin/main `3c5b2276` 对账，两者口径分离。

## 验证

| 门 | 标准 |
|---|---|
| ① 补丁重放 | studio 零 FAILED（硬门）；agent 失败项全部有处置结论；zcode 7 补丁通过；`npm run clean` 可反向回 pristine |
| ② 依赖与类型 | vendor `npm install` 成功；`npm run typecheck:harness` rc=0 |
| ③ 全量测试 | `npm test` 零失败（或失败项有基线对照证明非本轮引入） |
| ④ 活体 | 8647 `/health` 200 且版本号为新基线；8649 页面 200 且驾驶舱/技能页渲染无 console error |
| ⑤ 元数据 | `vendor/VENDOR.md`、runtime mask/manifest、技能版本说明同步更新 |

## 验证结果（2026-10-25 实测）

| 门 | 结果 |
|---|---|
| ① 补丁重放 | 隔离树 + 主检出双跑：**398 studio/agent + 7 zcode 零 FAILED**；17 个冲突补丁语义重定基；vendor 回 pristine 后重放通过 |
| ② 类型/构建 | `typecheck:harness` rc=0；`npm run build` rc=0（postbuild verify-dist OK）；bundle 20.94MB / 25MB |
| ③ 全量测试 | `npm test`：875 文件（868 过 / 7 跳过）、6270 用例（6257 过 / 13 跳过）**0 失败**；pytest 拼合树 6 文件 **44 passed** |
| ④ 其他门 | runtime:doctor 5/5；catalog-check 3.16.3（6995 键 / 101 命名空间）；IDE selfcheck rc=0（无工作区告警）；IDE smoke 9/11（2 例因无活动会话无法验证） |
| ⑤ 活体 | 8647 `/health` 200：agent **0.22.5** / webui **0.7.39** / gateway running / bridge attached=true；8649 200 title=SwarmStudio；驾驶舱（#/app/collab）与技能页（#/hermes/skills）实测渲染，技能页 27 分类、apple-notes 详情可见；无未捕获页面错误 |
| ⑥ research | agent research 技能 v0.22.4→v0.22.5 零 diff；team 三件逐字节一致，grounded-citations/worldmonitor-intel 本地增量保留；11 个 research 参考仓 fetch 成功 |

### 残留与未验证

- **gateway 重启**：runtime 已部署到 `~/.hermes/hermes-agent`（含 688 sidecar，冲突文件已备份），但各 profile gateway 需重启才加载新 Python 模块；本轮只按要求重启 8647/8649。
- **IDE smoke 2 例**：`会话列可进入`/`会话深链命中` 依赖活动会话，当前库无会话，属环境未验证而非失败；其余 9 例含“无未捕获页面错误”全过。
- **既有 i18n 警告**：`ia2.flow.newChat` 键缺失（组件自带默认文案），非本轮引入，未在升级轮扩面修。
- **技能目录**：`.claude/skills/aistudio-dev` 为本地生成物（`.gitignore` 忽略），版本/计数口径已在本机刷新；仓内正本仍以 `skills/swarm-yuan` 生成器为准。
- **本地产物未入库**：`runtime/hermes-records/`、`skills/.swarm-yuan/.gate-fail-flag`、`vendor/**` 注入态按既有纪律不入提交。
