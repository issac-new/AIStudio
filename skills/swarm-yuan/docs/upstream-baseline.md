# 上游运行时基线（upstream-baseline）

> **定位**：22 项上游运行时的当前基线状态表。唯一权威源为 `swarm-yuan/assets/registry/runtimes.tsv`；本表由 `registry-render.sh --write-upstream-baseline` 生成，`--check` 校验，禁止手改标记区块。
> **历史**：逐轮核验、版本差异与旧表全文见 `docs/research/upstream-changelog.md`（append-only）。状态表只保留当前值，不携带版本史。
> **证据分级**：A=本机实测；B=官方一手直查；C=二手转述（未核验不进基线）。最近一次全量核验：2026-10-25 R142。

## 一、状态表

<!-- >>> registry:runtimes >>> (generated from assets/registry/runtimes.tsv; do not edit) -->
| 名称 | 仓库 | 许可证 | 当前基线 | 接入 | 证据 | 机器标记 |
|---|---|---|---|---|---|---|
| graphify | Graphify-Labs/graphify | Apache-2.0 | v0.9.95 | deep | M1 | baseline_status=synced |
| GitNexus | abhigyanpatwari/GitNexus | PolyForm Noncommercial 1.0.0 | npm 1.6.12 | deep | M1 | baseline_status=license-risk |
| claude-mem | thedotmack/claude-mem | Apache-2.0 | v15.0.2 | deep | M1 | baseline_status=watch |
| ocr | alibaba/open-code-review | Apache-2.0 | v1.13.3 | deep | M1 | baseline_status=synced |
| openspec | Fission-AI/OpenSpec | MIT | v1.15.0 | cli | M1 | baseline_status=synced |
| comet | rpamis/comet | MIT | 0.5.0 | cli | M1 | baseline_status=synced |
| gsd-core | open-gsd/gsd-core | MIT | v1.18.0 | cli | M1 | baseline_status=synced |
| codex-security | openai/codex-security | Apache-2.0 | npm-v0.6.0 | cli | M1 | baseline_status=synced |
| mattpocock-skills | mattpocock/skills | MIT | v1.3.1 | cli | M1 | baseline_status=synced |
| diagram-design | cathrynlavery/diagram-design | MIT | v2.6.120 | cli | M1 | baseline_status=synced |
| superpowers | obra/superpowers | MIT | v7.0.1 | method | M1 | baseline_status=synced |
| gstack | garrytan/gstack | MIT | v1.91.188 tip 1e3ee83c4 | method | M1 | baseline_status=synced |
| ruflo | ruvnet/ruflo | MIT | v3.62.0 | method | M1 | baseline_status=synced |
| ECC | affaan-m/ECC | MIT | v2.2.3 | method | M1 | baseline_status=synced |
| impeccable | pbakaus/impeccable | Apache-2.0 | cli-v4.7.0 | method | M1 | baseline_status=synced |
| dsh | deepseek-ai/deepseek-harness | MIT | dsh-v0.2.1-rc.3 | source | M0 | baseline_status=synced |
| pua | tanweai/pua | MIT | v3.5.1 | source | M0 | baseline_status=synced |
| semantica | semantica-agi/semantica | MIT | main 22109ee0 | source | M0 | baseline_status=synced |
| pi | earendil-works/pi | MIT | v1.4.0 | source | M0 | baseline_status=synced |
| codegraph | colbymchenry/codegraph | MIT | 未定 | none | M0 | baseline_status=watch |
| claude-code | anthropics/claude-code | 专有（Anthropic Commercial Terms） | v2.1.310 | host | M3 | baseline_status=synced |
| codex-cli | openai/codex | Apache-2.0 | rust-v0.164.0 | host | M3 | baseline_status=synced |
<!-- <<< registry:runtimes <<< -->

列口径：`接入` = deep / cli / method / source / none / host；`证据` = M0–M4 五级记分；`机器标记` 供 `check_upstream_baseline` 与自检漂移检测消费。当前基线为最近一次核验后钉定的引用版本；tag 与 tip 的差异、逐版本变更说明一律进变更记录。

## 二、关键结论

1. **许可证风险（最高优先）**：GitNexus 为 PolyForm Noncommercial 1.0.0，禁止商业使用。全仓库统一措辞：GitNexus 降级为非默认；graphify（Apache-2.0）为默认代码图谱工具。
2. **漂移状态**：以状态表 `机器标记` 为准。`synced` 表示基线已对齐最近核验；`watch` 表示上游迭代快或能力未定，持续观察；`license-risk` 表示许可证限制，不得默认启用。本轮无 `drifted`。
3. **观察项**：claude-mem 迭代快且 npm 通道曾被人为回钉，版本判断以 GitHub tag 为主；codegraph 尚未跑通索引/查询，保持登记不整合。
4. **整合分层**：本表 22 行，覆盖 22 个上游运行时；其中 15 整合运行时（深度 4 + CLI 6 + 方法论 5，FACT_RUNTIMES=15），2 个宿主 CLI，5 个机制源/观察源登记未整合。
5. **未整合项**：dsh / pua / semantica / pi / codegraph 为机制源或观察源，`wiring=none|source` 且证据等级 M0；它们的方法论已按需蒸馏进 `references/`，不宣称运行时整合。
6. **存续风险**：个人/小团队项目占比较高（comet / GitNexus / claude-mem / gsd-core / codegraph），存续监测纳入吸收审计；gsd-core 的旧上游已归档，引用 open-gsd/gsd-core 为既定应对。
7. **gstack 节奏**：上游 tag 密集、vendor 离线包内容不随引用基线升级；引用基线只表示“跟踪到哪个上游版本”。

## 三、漂移检测与更新流程

`baseline_status=` 标记由 `precheck.sh --upstream-baseline`（advisory）与 `self-check.sh` 消费；`drifted` 行触发提示，不阻断交付。

更新一步到位：

1. 只改 `swarm-yuan/assets/registry/runtimes.tsv` 一行（基线 / 接入 / 证据 / 状态）。
2. 运行 `bash swarm-yuan/scripts/registry-render.sh --write-upstream-baseline` 重渲本表。
3. 把本轮核验结论追加到 `docs/research/upstream-changelog.md`（不写回状态表）。
4. 运行 `bash swarm-yuan/scripts/registry-render.sh --check` 与 `bash swarm-yuan/scripts/self-check.sh --check-only`。

`registry-render.sh --check` 同时校验：状态表与注册表逐行一致、状态表面积不超过 40KB、状态表不含逐轮历史头注。三项任一失败即视为双源漂移。
