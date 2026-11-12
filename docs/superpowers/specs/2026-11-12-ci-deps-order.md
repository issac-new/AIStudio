# 2026-11-12 CI 依赖安装顺序修正（product-tests 首跑失败定谳）

> 决策事实源。来源：P1-7 的 CI 首跑失败（run 43175364805：typecheck 步 TS2307×8）。

## 变更

`product-tests.yml` 依赖链三处修正：

1. **顺序**：注入① → `npm install`（vendor studio）→ 注入② → typecheck。原工作流把装依赖放在注入前。
2. **install 而非 ci**。
3. **注入②**：注入①时 vendor 尚未装依赖，`ensureNodeModulesSymlink` 跳过根软链；装完补跑一次（v2 noop 快路径）建链。

## 根因链（fresh 克隆三连实证）

- patch 017/136 向 vendor package.json **追加** overlay 依赖（matrix-js-sdk×4 重复键／cron-parser）；
- vendor lock 按 pristine 清单生成、从不随补丁重生成 → 清单/lock 永久漂移；
- 装依赖在注入前＝读 pristine 清单（两包不在）→ 漏装；装依赖在注入后＋`npm ci`＝漂移上静默漏装（903 包无此二件）；
- 唯一正确组合＝先注入＋`npm install`（fresh 克隆：added 942，deps present，typecheck rc=0）。
- 主检出长期无感：README 次序恰为「先注入后 install」，且历史上手动 install 会顺手改 lock（仓内记忆有「注入树上 npm install 改写 lock」坑条）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 修顺序而非重生成 vendor lock | lock 重生成牵动 1078 包解析面与基线政策（vendor 是钉版基线），超出当日批；且重复键补丁族（017/103 叠在同一区域）需一并压实——挂 P1-9 |
| D2 | 保留 patch 017 的 4×重复键不动 | 实测去重会打断 103 的 hunk 上下文（inject FAILED→lane 回滚）；补丁族必须整族压实，单独去重是伪修复 |
| D3 | 注入②复用 ensure-injected 而非手工 ln -s | 幂等 noop 快路径成本 <1s；手工链是第二实现 |

## 验证

- fresh 克隆全链三步实证：注入①（complete）→ install（added 942，matrix-js-sdk/cron-parser 在位）→ 注入②（noop）→ `npm run typecheck:harness` rc=0。
- 反例留档：反序＋ci＝903 包缺二件 TS2307×8；正序＋ci＝同样漏装（漂移面）。
- CI 实跑以 push 后 Actions 为准（本 spec 落地时待首验）。

## 设计文档影响

DESIGN_SYNC: none

理由：CI 执行面顺序修正，机制与契约不变；根因（补丁改清单+lock 不随补丁重生成）已作为
P1-9 补丁族压实的输入登记。
