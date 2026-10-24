# spec：skills/swarm-yuan 同步 v2.95.0（R141 运行时刷新+派生面收口+实栈回归）

## 变更

- `skills/swarm-yuan/` 33 个已跟踪文件同步至 v2.95.0（原 Swarm-yuan 独立仓 main `f05f466`，v2.95.0 tag）。
- 范围 = 技能本体（整合决策 #6 口径不变；`tests/`、`docs/` 档案、`CHANGELOG.md`、离线包保持不入库，工作树内未跟踪副本已随源刷新，供本地参考）。
- 主要内容：
  - `generate-skill.sh`：`--upgrade --dry-run` 升级预演（零写入三态清单）+ 项目根重定位（迁移/克隆后刷新 AUTO:detected PROJECT_DIR 与操作档）。
  - `assets/state-machine.sh` / `trace-log.sh`：账本落点四级解析（--project-dir > env > 同目录 conf > CWD 上溯）。
  - `assets/framework-gates/sharding.sh` + `references/frameworks/sharding.md`：聚合函数外包表达式（COALESCE(SUM...)）阻断归并检测（第 15 条规律）。
  - `assets/registry/*`、`scripts/distill-references.sh`、`scripts/src-pins.conf`、references 六档 R141 版本增量（openspec 1.15.0 / claude-code 2.1.310 / claude-mem 15.0.2 / ruflo 3.61.1 / graphify 0.9.95 / gstack tip / diagram-design 2.6.120）。
  - README badge v2.94.0 → v2.95.0。

## 决策记录

1. **发布载体切换**：原独立仓 issac-new/Swarm-yuan 已在 GitHub 归档（只读 403，无法 push/tag/Release）；按 SwarmTeam 先例并入本单仓（`skills/swarm-yuan/`），原仓归档、本地全量迁移至 `archive/swarm-yuan-legacy/`（含全量 git bundle 备份 `swarm-yuan-full-20261024.bundle`）。
2. **v2.95.0 的权威验证在原仓布局完成**：合并后 `verifier/v1/run-verifier.sh all` rc=0、e2e×3 全绿、runner 119/120（唯一红为汇编重灌时序假红，重灌提交后复跑 PASS）、`registry-render --check` / `self-check --check-only` / `build-compendium --check` 全绿；trade-forge 十框架四任务（CAS 45/45、金额容量 49/49、重试幂等 51/51、汇总接口 55/55+前端 29/29）门禁 fail 0。
3. **AIStudio 布局下 self-check 全量模式为布局受限项**：FACT_ 豁免表按生成器仓根 `docs/facts-waivers.md` 解析，本仓布局豁免文件在 `skills/swarm-yuan/docs/`（未跟踪），死键告警因此复现——非本同步引入，不在本轮修生成器布局适配（未验证项如实披露）。
4. **离线包不入库**（整合决策 #6 / 工作规则 8）：v2.95.0 两产物保留在 `archive/swarm-yuan-legacy/dist/`（novendor 5.5M / everything 71M，SHA256SUMS 随包）。

## 验证

- 原仓权威回归：见决策 2（全绿矩阵 + R141 轮档 `archive/swarm-yuan-legacy/docs/research/R141-runtime-refresh.md`）。
- 本仓布局校验（实测）：
  - 变更 .sh 全部 `bash -n` 通过；
  - `git grep v2.94.0` 仓内（除未跟踪副本）零残留，badge=CHANGELOG 头版一致（v2.95.0）；
  - `skills/swarm-yuan/scripts/self-check.sh --check-only` rc=1（布局受限项，见决策 3；两项 ⚠ 均为原仓已有/路径解析差异，无新增 ✗）；
  - 合并前 `npm test`（AIStudio 全量 vitest）：见提交信息与验证结果段。

## 验证结果（2026-10-24 实测）

- bash -n：33 文件中全部 .sh 通过（0 FAIL）。
- badge/版本一致性：PASS。
- self-check（布局受限）：2 ⚠ / 0 新增 ✗（披露不隐瞒）。
- npm test：**未跑**（如实披露）：主树 `node_modules` 原为无效非目录占位（`npm ci` 依规清空后未重建，vitest 不在环境），完整测试面需 vendor `npm ci`+inject 链（见整合 spec 验证门）。本次变更仅触 `skills/` 下 shell/markdown，与 vitest 套件无 import 关联；作为补偿，权威回归在原 Swarm-yuan 仓布局完成（决策 2 全绿矩阵）。
- 附注：`npm ci` 清除了主树无效 `node_modules` 占位（原状即无可用依赖，未跟踪不入库，无仓库影响）。
