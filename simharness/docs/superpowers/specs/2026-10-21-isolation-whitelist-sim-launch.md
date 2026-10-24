# 隔离边界白名单：受控 harness 启动器 sim-launch（2026-10-21）

## 背景

run22 开跑前 30 项预检第 ① 项（门禁测试套件）红：`tests/isolation-boundary.test.sh` 断言 ① 判
overlay `custom/server/harness/sim-launch.ts:25` 为「产品运行时代码反向引用 harness」。

该文件来自 overlay 2026-10-20 提交 7dc600ad（feat(sim): 受控 harness 启动器——显式开关/
super_admin/固定脚本/单进程/驱动锁），是 Studio 产品内一键起推演的能力，决策记录在 overlay
`docs/superpowers/specs/2026-10-20-ia-daily-sim-separation-and-ux-cleanup.md`。overlay 侧测试
（含 `custom/server/harness/__tests__/sim-launch.test.ts`）全绿，但 simharness 的隔离门未同步
——0.7.38 升级轮跑的是 overlay 全量测试，不覆盖 simharness 门禁，两边决策到 run22 预检才相撞。

## 判定

这不是无意识运行时依赖，是两侧都已显式提交的产品决策：产品→harness 存在一个受控调用面。
隔离门的本意是拦「边界随时间回蚀」的意外依赖；对显式受控面，正解是登记白名单（与断言 ②
为 qgate 只读消费开白名单同构），不是撤产品能力，也不是放宽整条断言。

## 改动

两处对账（同因：overlay 10-20/21 轮落了产品决策，simharness 守门侧未同步，run22 预检 ① 相撞）：

1. `tests/isolation-boundary.test.sh` 断言 ① 增加路径级豁免 `custom/server/harness/sim-launch.ts`
   （仅此一文件，带出处注释）。断言语义不变：其余任何 custom/patches 运行时引用 harness 仍然 FAIL。
2. `tests/graph-spec-smoke.test.ts` 终点断言由 `g6_verdict` 更新为
   `__resume:g6-final-gate.approved`（overlay 3939e804，产品内导演台轮：模板 29 节点线性化）。
   继续强钉具体值，模板再变仍当场红。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 豁免按文件路径精确到 sim-launch.ts，不做目录或关键字级放宽 | 目录级豁免会把 harness-controller 等后续文件一并放行，失去守门意义；精确路径续增时必须逐文件评审。 |
| D2 | 豁免注释与本文互为出处（overlay 侧引用 7dc600ad 与其方案文档） | 边界豁免必须可追溯：产品侧决策、豁免理由、评审记录三方对应，防止白名单 drift 成默认放行。 |
| D3 | 终点断言更新为钉新具体值，而非放松为「已定义即过」（overlay 侧自测口径） | overlay 侧守门只断言 endCondition 已定义；本仓保持更强口径，模板终点漂移在本仓先红。 |
| D4 | 本文件随测试改动一起提交 | 源码改动随附含决策记录的 spec 是仓库既有纪律。 |
