# 2026-11-08 run28 收官批（N28 挂账族四修＋N28-5b 定谳关闭＋burn-fixes spec 对齐）

> 来源：run28 全流程收官（14h29m 六闸全过，report_done=1794090918）值守 11 次干预沉淀的挂账台账。本批清偿代码面四件＋定谳关闭一件；P1 wei 职能词与 GATE_ENFORCE_DENY 恢复在环境面另行处置。

## 变更

1. **N28-1 `simharness/mux/mx-report-gen.py` metrics 写入锚校验**：净环境/断锚下 RUN_ID 回落远古轮名（run28 实录：写 20261002-v5-run7 脏行两轮）——写入前 `fullmatch` 当年轮命名形态（`20\d{6}-v\d+-run\d+|burn-*`），不过则跳过+stderr 告警（fail-open 不阻断报告）。
2. **N28-2 `simharness/mux/mx-scenario-lib.sh` 复位签名卡面哈希从仅 G5 扩到 G2/G5**：run28 实录 arch 判词落卡（卡面变化）但 G2 签名只含 itip/mtip → 熔断永等（值守以 OVERRIDE 复议通道人工破局）。评审卡 owner 落判词即证据变化，走评审卡的闸同权复位。
3. **N28-5a `simharness/mux/r18_matrix.py` OP_STEPS 随 run27 四态收敛**（{8,10,25}→{25}）：8(dispatch)/10(register) 为 none 型（真值=matrix 消息流，capture-plan 四态口径），不再硬要求 UI 操作前后帧；25(IDE) 保留真 UI 承载。分母 15→13（STEP_TOTAL 12→11）。`tests/harness-gate-integrity.test.ts` 断言随批对齐（132/132 全绿）。
4. **N28-4b `scripts/plan-html/jargon-check.py` 加词即回扫纪律**：词表活文档新增词后当日必须跑 `jargon-source-gate.test.sh`（读提交态全量扫）清存量——run28 实录「落档」后加进词表未回扫，mx-report-gen.py 存量携带到 A10 报告审计才暴露（jargon 双检查本同源此文件，缺的只是加词后回扫动作）。
5. **N28-5b 定谳关闭（无代码变更）**：capture 注册器对 UI 型步预注册 before 位属设计内（拍摄失败走 frame-capture-failed 凭证降级，run28 已验证该通道）；run28 缺口根因=事故段采集时机跳拍，非注册器缺陷。

### 随批（spec 对齐）

- `2026-11-07-run28-burn-fixes.md` 验证段修订（SPEC_REBIND=1 显式重绑）：原文「烧机第三轮至 archgate 达步＋新收据 pass」与实际终态不符——第三轮 fail（G2 600s 超时未达 archgate）、第四轮按用户加速指令中止；两修实证以第三轮 done 21/64 分钟深度覆盖（repo 帧采集/jq 归一零复发）为准。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | N28-1 校验放写入点（生成器内）而非追加器入口 | 追加器多入口（report-gen/collect），写入点是唯一汇聚处；fail-open 语义与该段既有设计一致 |
| D2 | N28-2 用 case 扩 G2 而非抽象通用「所有评审卡闸」 | 最小面：当前走评审卡复位的闸仅 G2/G5；抽象通用需改签名函数契约（过设计） |
| D3 | N28-5a OP_STEPS 收敛而非逐步加降级凭证 | 凭证是运行期补偿（每轮都要人登记）；矩阵是事实源（一次收敛永久生效）——根治优于代偿 |
| D4 | N28-4b 写纪律注释而非门禁自动化 | 词表是活文档（用户点名即加），加词时点在对话流中不可挂机；纪律注释+gate 存在已构成「加词→跑门」最短路径 |

## 验证

- `npx vitest run simharness/tests/harness-gate-integrity.test.ts`——132/132 全绿（矩阵断言随批对齐）。
- `bash -n simharness/mux/mx-scenario-lib.sh`＋`python3 -m py_compile simharness/mux/mx-report-gen.py`——语法过。
- N28-1 行为验证：RUN_ID 非法形态时 stderr `[metrics-skip]` 且不写台账（正则单测式验证 fullmatch 三形态）。
- `bash simharness/mux/tests/jargon-source-gate.test.sh`——存量绿（「落档」已清）。

## 设计文档影响

DESIGN_SYNC: none——四修均 simharness 推演工装与词表注释面（行为恢复设计意图），不触及整合正本与数字总账；机制地图无行级变更（N28-2 属既有熔断复位机制的覆盖面修正）。
