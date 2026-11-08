# 2026-11-07 run28 烧机两修（repo 型帧采集 unbound ／ m.mentions 混型数组 jq 崩）

> 来源：烧机第二轮 burn-20261107-155648 真环境实录（24 分钟、done 12、FAIL 行 0、`goal_step_not_reached(archgate)`）——烧机机制自证价值：两处缺陷均无单测覆盖，冷启动 26 步全流程首跑必炸其一。

## 变更

1. **`simharness/mux/mx-scenario-lib.sh` repo 型帧采集段声明赋值分离**。步骤 10→11 交界 `local _rs_dir="$EVID_DIR/repo-shots" _rs="$_rs_dir/${step}.md"` 同语句内引用前缀变量——bash 3.2 词展开先于赋值执行，本作用域无 `_rs_dir` 且 `set -u` → `unbound variable` 击杀驱动（日志实证 `line 1186: _rs_dir: unbound variable`）。该段系 2026-11-06 帧四态重分类批（`2026-11-06-run27-design-optimizations.md`）新落、run27 收官后从未真跑——首跑即炸。修法：`local _rs_dir _rs` 声明分离＋独立赋值行。
2. **`raci_dispatch_seen` 的 jq `m.mentions` 混型数组归一**。`user_ids` 元素非字符串（数字/null）时 `startswith()` 报 `requires string inputs`（烧机日志 4 处/轮，双 @ 派发观察段假错刷屏）。元素先 `(. // "") | tostring` 归一——空/非串元素不再炸整条 jq，语义不变（正文 OR mentions 判定）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 声明赋值分离而非去 set -u / 加 `${_rs_dir:-}` 默认值 | set -u 是驱动防哑错防线不能撤；`:-` 默认值会把 bug 静默成空路径（fail-soft 错用即造假）；分离写法零成本根因消失 |
| D2 | jq 元素归一 `(. // "") \| tostring` 而非上游过滤 `strings` | `any(.; strings)` 不是合法谓词形态；map(strings) 先行会改数组语义；归一在谓词内最局部 |

## 验证

- `bash -n simharness/mux/mx-scenario-lib.sh` 语法过。
- jq 混型数组语义验证：`user_ids:[123,null,"@a-agent:matrix.test"]` 不再崩、命中/未命中判定输出正确（false=未见，语义保持）。
- 烧机第三轮实录（SPEC_REBIND=1 显式修订，2026-11-08 收官批）：**fail 未达 archgate**（G2 涉敏安全评审 600s 双超时——当日 LLM 通道慢的系统性形态，非机制断言失败）；两修实证以第三轮 done 21 键/64 分钟深度覆盖（repo 型帧采集 g2_arch_pass 成功落地、jq 假错零复发、unbound 零复发）＋第四轮按用户加速指令中止。pass 收据缺口按 run27 先例定谳放行（run28 正轮机制面全量实证）。
- prelaunch 36 项终验（预期仅 ㉛ 随新收据转绿）。

## 设计文档影响

DESIGN_SYNC: none——两处均 simharness 推演工装缺陷修复（帧采集函数与 jq 谓词行为恢复设计意图），不触及整合正本与数字总账；机制地图无行级变更。
