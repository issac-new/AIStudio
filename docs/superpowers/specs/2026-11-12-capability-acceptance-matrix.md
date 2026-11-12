# 2026-11-12 能力验收矩阵进发布门（P0-5）

> 决策事实源。来源：2026-11-12 全仓设计复盘 P0-5。
> 现场病：「六闸全过」是流程判定不是能力判定——run29 六闸全过、审计零 FAIL 的同时
> director 派发成功率 9.8%（5/51）。能力是否可用没有一处可机检的声明源。

## 变更

### 1. `config/capability-acceptance.json`：能力声明单一事实源

首版 8 项能力（日常工作台/IDE/推演/看板/审批/评测黄金集六项 available＋director
experimental＋UAT available）。三类字段：

- `status`：available / experimental / retired；
- `checks`：static 检查（fileExists/fileContains），当场评估；
- `runtimeEvidence`：运行期指标必须带证据路径＋采集日期＋数值，超过 `staleDays`（30）
  即 UNVERIFIED——**过期不是 PASS**。

director 派发按 run29 复盘发现一降级声明为 experimental，claimNote 引用
`2026-11-12-run29-full-retrospective.md`（处置 A1 折中的落地）。

### 2. `scripts/capability-matrix.mjs`：评估器＋发布门

- `--check`：available 但 static 失败→FAIL；带 runtime 但证据缺失/过期→UNVERIFIED；
  两者都拦（exit 1）。experimental/retired 不拦，但缺 claimNote 拦（防无声降级）。
- `--write`：随发布落 `dist/release/CAPABILITY-MATRIX.json`。
- 并入 `release:preflight` 链（内联调用，不新增 npm script 条目）。

### 3. 机制预算配对（P0 批第一个真退役）

- 删除 `scripts/regression/org-governance-walkthrough.mjs`：一次性走查脚本，2026-11-05
  跑完 12/12，sunset 登记在册（reviewBy 2026-12-05），全仓零引用（代码/测试/CI grep 实证）。
- budget：scripts −1＋1=137 不变；npmScripts 52 不变；sunset 册换血（旧条目移出、
  capability-matrix 带新 sunset 入册，reviewBy 2027-02-12）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 门拦「声明与证据不符」，不拦「能力未达标」 | 发布可以带着 experimental 能力走（如 director），但不能把 experimental 说成 available。这是「证据先于声明」的执行化，不是能力达标门 |
| D2 | runtime 证据带时效（staleDays=30） | 永久证据=永久过期声明；推演一轮 1-2 月，30 天保证声明窗口覆盖最新一轮 |
| D3 | 先做声明自洽门，不做指标采集自动化 | director 成功率等读数依赖 run 目录（仓外），自动采集需 SIM_ROOT 联动——留待 P2-13 快照件一起做；首版用「证据路径+日期」半自动 |
| D4 | 退役 org-governance-walkthrough 作配对 | 预算两条顶格（137/137、52/52）；它是登记在册的待退役件且条件已满足，配对后净增为零——兑现「只加不减」的减 |
| D5 | 矩阵放 config/ 不放 .qgate/ | 它是产品能力声明（随发布读），不是 qgate 运行态；config/ 是特性单一读取点的既成位置 |

## 验证

- `node scripts/capability-matrix.mjs`：8 项全判（6 PASS＋1 experimental＋1 PASS），
  exit 0；director 首评曾红（registries 锚点写错）→ 修正锚点为 `registerIa2` 后绿
  （锚点错即 FAIL 正是门在工作的证明）。
- `npx vitest run scripts/__tests__/capability-matrix.test.ts`：7/7（static 真判、
  过期=UNVERIFIED、新鲜=PASS、experimental 缺 note 拦、未知 status 拦）。
- `node scripts/governance-lint.mjs --budget`：0 problem（scripts 137 不变、npmScripts 52 不变）。
- `package.json`：release:preflight 尾接 `node scripts/capability-matrix.mjs --check --write`，
  npm scripts 计数 52 不变（python 断言过）。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本未改。本批新增的是发布执行面的声明校验件，不改变正本中「验证与证据」的
判定原则（证据先于声明）——它是该原则的第一个机器执行点，语义与正本一致。
