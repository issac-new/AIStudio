# 2026-11-05 frame-expect 连字符键归一修复（驱动起跑即死根治）

## 变更

- `simharness/mux/frame-verify.py --dump-expect`：导出键归一 `-`→`_`（`MX_EXPECT_{_k.replace("-", "_")}`）。原样导出的连字符键（如 `MX_EXPECT_capture-precheck`）不是合法 shell 赋值名，驱动 aipay-scenario.sh 启动段 `source` 该导出时按命令解析，`command not found` → rc=127 → ERR trap 杀驱动，起跑即死（burn-pre-run27 实锤：0s 退出、done 键 0）。
- `simharness/mux/mx-scenario-lib.sh` r18_frames 两分支：取值端同规则归一 `_expvar="MX_EXPECT_${step//-/_}"`。连字符步键在 bash 里既不能被 source 赋值、也不能被 `${!}` 反查，两端统一归一后期望词才能往返。
- `simharness/tests/v84-frame-gates.test.ts` 新增守门组：断言导出行行匹配 `^MX_EXPECT_[A-Za-z0-9_]+="…"$` 且 `bash -c 'set -eu; source <file>'` rc=0——本缺陷本可被该断言拦下。

## 决策记录

- 为什么烧机先炸而 run26 没炸：N13 导出接线 2026-11-04 白天合入（run26 收官之后），run26 从未执行过该启动段；烧机是这段代码第一次真跑，首跑即抓出组合缺陷——「标记断言测不出组合行为」的又一实证，烧机补课决策的直接回报。
- 修法取两端归一而非驱动侧容忍 source（过滤非法行）：容忍方案让连字符步键的期望词永远丢失（退化 settle-only），违背 N13「单一事实源可消费」的原意；归一方案 33 键无冲突（2026-11-05 实测 uniq -d 为空），语义保全。
- 变量名约束是 bash 硬边界（赋值名与 `${!}` 反查都不接受连字符），归一是唯一可往返通道，不是风格选择。

## 验证

- `python3 mux/frame-verify.py --dump-expect | sed 's/=.*//' | sed 's/-/_/g' | sort | uniq -d`：空（无冲突）。
- 导出后 `bash -c 'set -eu; source <导出文件>'`：rc=0（主树实测，含全部 33 键）。
- 守门测试 `npx vitest run simharness/tests/v84-frame-gates.test.ts`（主树实测）：全绿含新断言组。
- 烧机复跑 `bash mux/mx-burn-test.sh --run-id burn-pre-run27-r2`：过前置、起跑不再 127（收据在案）。

## 设计文档影响

DESIGN_SYNC: none——harness 内部导出/取值两端键名规约对齐，不触及整合正本/数字总账；理由=期望词表内容（单一事实源 EXPECT 字典）未动，仅修其 shell 投影的可消费性。
