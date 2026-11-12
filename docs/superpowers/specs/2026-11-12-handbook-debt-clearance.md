# 2026-11-12 handbook 吸收批清债：守门红定谳＋raci 白名单＋插件部署链＋manifest 重建

> 来源：2026-11-12-ai-agent-handbook-absorption 交付说明「未做/未验证项」清偿。
> LLM 硬准入（spec D11）与批 5（用户裁决后置）不在本批。

## 变更

### 1. N-4 根治：ensure-injected 的 zcode 预自愈双跑（确定性缺陷，非 flake）

- 真因（活体实锤）：`ensure-injected.mjs` 的 `healZcodePatches()` 在**清单缺席的
  pristine 树**上无条件先把 zcode lane 整套应用（本批复现：落盘时刻与 inject 失败
  同一秒，树内容与主树注入态 diff 全同），随后主流程 `inject.mjs` 再放 zcode lane，
  002 对已应用树 forward-check 必炸（"patch does not apply"＋blocked-by-failed
  连锁跳过 003-011）。即 fresh worktree `npm test`（pretest=ensure-injected）确定性
  红＝N-4；`npm run inject` 直跑与 clean+inject 路径不经 heal，故守门测试可绿——
  这解释了「补丁明明 pristine 适用却必炸」的表象。
- 修复：heal 只在「v2 清单在位且无 failed」时运行（其服务对象=清单在位但 zcode 树
  被 reset 的漂移态与脏树缺新文件两个原始场景）；清单缺席/failed/v1 时跳过并打点，
  由主流程全量 inject 自覆盖 zcode lane。
- 回归门：overlay-pristine-replay 增第二用例——无清单 pristine 临时 worktree 直跑
  `node scripts/ensure-injected.mjs`，断言 exit 通＋complete＋002/011/767 在册。
- 遗留观察：主树 11:53 独立 replay 红的 16.7s 快败形态未复现，与本缺陷不同签名，
  如实记未定位环境态（不影响本缺陷的确定性证明）。

### 2. raci-rest-guard ④ 白名单补录 run30 守门

- `custom/server/matrix/__tests__/raci-rest-guard.test.ts` 的 `HARNESS_REST_WHITELIST`
  追加 `tests/run30-actions.test.sh`：该文件仅在 grep 断言里引用 `mx_wait_sender`
  验证 A1 接线（全文 0 处 curl/_matrix），与 `tests/dm-send-tracked.test.sh`
  「测试引用原语≠直连」先例同族；正则不放宽。

### 3. mx-enable-run-trace.sh 扩为双插件部署（run-trace＋action-ledger）

- 同源 `custom/hermes-agent-plugins/`，部署面不变（SIM 根 home＋全部 profile
  home，幂等 cp＋enable）；action-ledger guard 默认关
  （HERMES_ACTION_LEDGER_GUARD 未设=只记账），enable 后新会话即写动作账。
- 文件名保留（调用方兼容），头注更新职责描述。

### 4. 主树 manifest 重建（clean+inject 全量重放）

- 主树 `.overlay-injected.json` 漏登 767（vendor 实含内容，reverse-check 实证）
  → ensure-injected 判 insert 拒绝 → 主树 `npm test` 起跑即被挡。
- 处置：主树执行 `npm run clean && npm run inject` 重建 complete manifest，
  `node scripts/ensure-injected.mjs` 判 v2 noop。manifest gitignored，不入提交。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 根治 heal 双跑而非重生成补丁 | 002 对 pristine 本就适用（直测证明）；重生成 sha 变化强制全线重放，且治不了 pretest 双跑。首次「flake 定谳」亦被推翻——复现链（12:32 落盘＝inject 失败同秒）证明确定性 |
| D2 | 16.7s 快败单独记档不并入本缺陷 | 与双跑签名不同（该次是 replay 测试路径）；混计会污染根因链 |
| D3 | raci 白名单补录而非放宽正则 | 守门本意=直连面收敛；测试文件引用原语名不是直连，dm-send-tracked 先例已在白名单 |
| D4 | manifest 重建走 clean+inject 而非手工补登 | 手工补登是应急（上批 worktree 用过）；全量重放一步到位且被守门测试证明可用 |
| D5 | 插件部署脚本扩展而非新建 | 部署面/幂等逻辑完全同构；新脚本=机制通胀（机制预算纪律） |

## 验证

- 活体根治证明：本 worktree 还原 pristine＋删清单后 `node scripts/ensure-injected.mjs`
  一次走通——471 补丁全 applied（含 zcode 002 与 767）、manifest complete、0 failed
  （旧代码同路径 12:32 实锤必炸）。
- `npx vitest run scripts/__tests__/overlay-pristine-replay.test.ts`：双用例（原
  clean+inject 管线＋新增 ensure 直跑回归门）均绿。回归门为自引用守门——临时树
  检出 HEAD，只能验证已提交的修复；提交前运行该用例红属预期（实跑佐证：提交前
  旧代码在临时树复现「重放自愈」双跑日志，与 12:32 实锤互证）。
- `npx vitest run custom/server/matrix/__tests__/raci-rest-guard.test.ts`：④ 转绿。
- `bash -n simharness/mux/mx-enable-run-trace.sh`＋临时 home 冒烟部署双插件。
- worktree `npm test` 全量（fresh pristine 直跑，含 pretest 注入）。
- 主树（合并后）：`npm run clean && npm run inject` → `ensure-injected` v2 noop。

## 设计文档影响

DESIGN_SYNC: none

理由：守门白名单补录与部署脚本扩展不改变设计正文机制描述；§6.4「补丁注入」
边界行的验收要求（以目标代码为准、不把 applied 清单当成功凭证）不受影响。

## 任务卡

### 完成条件

raci-rest-guard ④ 转绿；worktree 全量 npm test 通过；主树 manifest complete 且
ensure-injected noop；pristine-replay 维持绿。

### 输入与来源

来源=2026-11-12-ai-agent-handbook-absorption 交付说明未做项；原 002 诊断=
该批 worktree 首跑注入报错（本批证伪）。

### 工作流边界

只动 `scripts/ensure-injected.mjs`、`scripts/__tests__/overlay-pristine-replay.test.ts`、
`custom/server/matrix/__tests__/raci-rest-guard.test.ts`、
`simharness/mux/mx-enable-run-trace.sh` 与四份文档登记；不动 vendor/、patches/、
zcode-patches/、series、插件源码。

### 工具与副作用

- 主树 clean+inject 会短暂把主树 vendor 还原 pristine 再重注入（运行态中间态），
  完成后与现注入态等价；执行前核无服务占用（8647/8801/8802）。
- /tmp 临时 pristine 树与 mini-repo 仅用于验证，用后删除（新目录，无 rm -rf）。

### 结果与证据

随批记录各验证命令真实输出；16.7s 快败未复现如实标注。

### 异常与恢复

- 若主树 clean+inject 中断：可重复执行（幂等链）；失败则回退为手工补登 767
  应急口径并挂账。
- 若 worktree 全量重现 replay 红：区分签名——ensure 路径红=本修复回归（拦截），
  clean+inject 路径红按 D2 记环境态证据。

### 验收反例

- raci 正则不放宽：白名单外文件引用原语仍红（②③①层断言不动）。
- 主树 manifest 重建后 series 再加新补丁时增量补套路径不受影响（v2 前缀机制原样）。
