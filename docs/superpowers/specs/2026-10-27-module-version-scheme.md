# 模块版本对齐底座与 standalone inject 跳过（2026-10-27，挂账清偿批）

分支：`fix/module-version-scheme`（自 origin/main f2793d2bb 起）

## 变更

用户裁定＋纠正：模块版本与上游底座**完整三位版本**对齐，扩展发布序挂在其后。本批清偿发布挂账三项：

1. **版本方案落地**：
   - agent teams：真源 `team/VERSION`＝**`v0.22.5-team.1`**（底座 0.22.5=vendor/VENDOR.md 的 hermes-agent；`-team.1`=本仓扩展发布序；README 双语同步；v3.3.0 为旧方案末版）。
   - 驾驶舱：真源=RELEASE-NOTES.md 版本节首行＝**`0.7.39-studio.1`**（对称落法；2.x 为旧方案历史线）。
   - `release:check` 新增底座对齐校验：两模块版本须匹配正则 `^v?\d+\.\d+\.\d+-(studio|team)\.[1-9]\d*$` 且三位底座段＝VENDOR.md 对应行；Ycode 维持底座版本即版本（3.16.2）。
2. **standalone 模块包 inject 清障**（原挂账"cockpit 独立包 inject 需搭配 agent-teams 包"）：`inject.mjs` 对路由到缺席 hermes-agent 树的补丁明确 SKIP＋汇总（全仓两树俱在零行为变化；zcode 缺席原已容错）——cockpit 源码包可独立 inject。
3. **正本入册**（原挂账"发布视角留吸收轮"）：整合正本 §3.2 补"发布视角与运行时视角并存"段。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 版本=完整三位底座＋`-<ext>.N`（用户纠正后形态） | 用户明示"上游版本是 3 位 0.22.5/0.7.39 类似这样"；底座升级（0.22.5→0.22.6）底座段跟进、扩展序归 1 | 仅 major.minor 对齐＋自维护 patch（首版 0.22.1 方案，用户纠正废弃） | 是 |
| D2 | 真源：team/VERSION 文件＋RELEASE-NOTES 版本节首行 | team 原仅散文载体（挂账明记）；cockpit 沿用 NOTES 但锚定首行 | 两模块都新建 VERSION 文件（cockpit NOTES 亦是历史台账，双真源漂移） | 是 |
| D3 | 对齐校验进 release:check（正则＋VENDOR.md 底座行双查） | 版本漂移（底座升级忘跟进/格式走样）即门禁红 | 仅测试断言不进门禁（npm test 才拦，发布前无门） | 是 |
| D4 | inject 缺树 SKIP 而非报错 | 模块包本就只含自己的 vendor 树；缺席=合法形态 | 硬死（原状，挂账）／静默 skip 无汇总（不可审计） | 是 |
| D5 | 测试 HOME 隔离（spawnSync＋$HOME=tmp） | inject 出口 deploy-agent-runtime 写 ~/.hermes（B1 双树同步）——测试绝不碰真实 home；SKIP 走 stderr 须双流合并采集 | 不隔离（实测同轮恰好零写入，但属侥幸而非保证） | 是 |

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— §3.2 补发布视角段（四模块＋版本对齐原则＋机器真源指向）。

## 决策记录（补）

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D6 | pretest 挂 ensure-injected（与 predev 同款） | 首轮干净环境实锤：inject 先于 npm install 时 node_modules 链不落，npm test 直跑必炸；幂等补链是既有设计（dev/build 已挂） | 只改测试脚本绕（否决：用户照 README 仍会踩） | 是 |

## 验证

- `npm run release:check` → ✓ 全绿（cockpit=0.7.39-studio.1 agent-teams=v0.22.5-team.1 ycode=3.16.2 yuan-skill=v2.95.0）。
- `npx vitest run scripts/__tests__/verify-release-manifest.test.ts scripts/__tests__/inject-absent-tree.test.ts` → **17/17**（含：双底座对齐断言、VERSION 漂移负例、standalone 实跑=纯净基线 336 studio 补丁全应用＋74 agent 补丁 SKIP＋汇总行＋rc=0；HOME 隔离下真实 `~/.hermes/hermes-agent/hermes_cli/kanban_db_dispatch.py` 与仓内 md5 一致=零改动实证）。
- 手动 standalone 复现（bash，HOME 隔离）：rc=0、336 应用、74 SKIP、"共 74 个补丁因 hermes-agent 树缺席跳过"。
- 未验证项：整体包干净环境安装测试（进行中，见下）；agent-teams/ycode 模块包 standalone 安装链（team 经 hermes profile install 天然独立，ycode pnpm 闭包构建独立——均未在本轮实跑）。

## 补录（13:1x）：干净环境安装测试首轮发现与根治

首轮四步实跑：解包✓→inject✓（410 应用/0 SKIP）→npm install✓→vitest ✗（`Cannot find package 'vitest'`）。根因＝fresh 环境次序坑：inject 先于 npm install 运行时，`ensureNodeModulesSymlink` 因上游 node_modules 尚不存在而只告警不落链；npm install 后链再无人补（dev/build 有 predev/prebuild 钩子，`npm test` 没有）。根治＝package.json 增 `"pretest": "node scripts/ensure-injected.mjs"`（与 predev 同款幂等补链），非脚本侧绕。复验见下。

## 验证（补录）

- 修复后干净环境四步重跑：`npm test -- custom/__tests__/docs-ssot-guard.test.ts scripts/__tests__/verify-release-manifest.test.ts custom/server/loop/graph/__tests__/assembly.test.ts` → 36/36 全绿（含 17 发布面＋graph 组装＋附录守门），**干净环境安装测试 PASS**。
- pip 侧未跑（hermes-agent Python 依赖在目标部署机安装；本测验证 npm+源码链）——如实记录。
