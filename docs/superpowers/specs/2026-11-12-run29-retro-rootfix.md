# 2026-11-12 run29 复盘根治批（挂账 N29-14~23 清偿）

> 决策事实源。复盘对象：`20261111-v8-run29`（27h20m，六闸全过，report_done=1794446778，审计零 FAIL/46 WARN）。run29 值守实录的九项人工干预与审计环收敛过程暴露的工装/产品缺口，本批逐项根治；证据取自 run29 运行产物与源码，不引用记忆转述。

## 问题台账与根因

| 编号 | 级别 | 现象（run29 实证） | 根因锚点 | 处置 |
|---|---|---|---|---|
| N29-14 | P1 | v0.23.1 agent 行为漂移七例（静默/迟滞/交付面只剩完成摘要/评审无收敛判据/派发通道不响应/队列挤压），值守人工 DM 唤醒 7 发 7 中（3-43 分钟/发） | agent 侧回合行为（vendor 面）；harness 面的可自动化部分=N29-15（静默自动催办）＋已落的 G2 第三通道/烧机续跑环 | N29-15 落地后静默类自动催办；vendor 面遗留四例（summary-only 交付/600s+ 深评/复评重派迟滞/队列挤压）登记为已知限制，agent 补丁另案（不为观测行为盲改 vendor） |
| N29-15 | P0 | xiao 静默 78 分钟、wei 空转、bella 纯心跳 2.3h——驱动的滞锚催办一次未发 | `mx-scenario-lib.sh` 催办桶 sig 以 `_agent_log_last_work_ts`（任意工作行，含单轮 API call#1 嘴炮回合）刷新——稀疏滴流活动（每小时一条嘴炮）永不过 idle_half，催办永不触发；`_agent_log_last_realwork_ts`（真做判据）已存在但只用于催办资格复位 | 催办桶工作判据改 `_agent_log_last_realwork_ts`（嘴炮回合不续命；工具轮/会话第 2+ 轮才算干活），单发（wait_alive_truth cur_work）与分桶（wait_alive_truth_multi _w）两处同步 |
| N29-16 | P1 | director 需求移交超时降级后，xiao 收到的「自主组织」消息丢失原任务书全部交付物锚点——xiao 自主拆分直奔 T04 实现，漏交付 AN-MP 系分稿（值守双 DM 补救 2h） | `mx-scenario-lib.sh:2400` 降级消息 `set -- "$1" "【自主组织】…（通用文）"` 整体替换原 $2 任务书文本——交付物锚点/验收行被丢 | 降级消息保留原任务书要点（追加「原始需求要点：${原文本截断}」），通用自主组织语义与具体交付锚并存 |
| N29-21 | P1 | UAT 判读 AC-1~7 全「未见」而覆盖判读全过——验收被迫走「有条件」语义 | `custom/server/governance/lifecycle/verdict.ts:99` UAT_SEG_RE 只认 AC-id 共位判词（40 字窗内 通过/不通过…）；fanfan 实发集合式声明「G1 冻结 AC-1~7 逐条判定，七条全过」——范围形态（1~7）与集合判词（全过）双双不在判据内 | UAT_SEG_RE 扩范围形态（AC-N~M／AC-N~AC-M）；UAT_VERDICT_ALT 扩集合判词（全过/全部通过→通过，全不通过/全部不通过→不通过——长词在前防子串）；范围成员按数字区间归属 |
| N29-22 | P0 | 审计 R18「载荷全缺」FAIL 打在 none 型步上（步 1-8 等 9 步）——这些步按 capture-plan 四态设计**无界面承载**（真值=state/API/消息流），值守被迫逐条 DISP 降级 | `mx-report-audit.py:678-682` 落尾断言只排除 DIALOG/OP/EFFECT/SKILL/DELIVERY 五个步集，未读 capture-plan.env 的 `step|none|` 四态声明——N28-5a 四态收敛后 none 型步仍被按「任一位在位」断言 | 审计启动时解析 capture-plan.env 的 none 型步集，落尾断言前豁免（none 型步真值在 state.env/消息转录，另有专项断言；豁免≠放行——repo 型步维持原断言） |
| N29-23 | P1 | 查14a 跨轮产物冒充 8 件中，2 件是「同目录新档已产出、旧档仍被真值扫描计罪」（AN-PAYCORE 新旧 materials 并存，旧 run28 件被读为本轮交付物） | `mx-report-gen.py` `_artifact_text`/`_art_truth` 对交付物路径无新鲜度选择——路径在清单即读、声明轮≠本轮即计 stale，同目录已被本轮新档取代的旧档不豁免；archive/ 归档路径也不排除 | `_art_truth` 判 stale 前两步豁免：①路径含 /archive/ 跳过（归档件已出交付面）②同目录存在声明轮==RUN_ID 的更新文件=被取代，跳过并注 src；无取代者才计 stale（跨轮冒充硬判不动） |

不列入本批：b557d30b4 空提交（他会话属主处置，已通报）；审计意见书 S-1~S-12 运行面缺陷（属 run29 组织复盘域，随 retro 材料走）。

## 变更

1. **`simharness/mux/mx-scenario-lib.sh`**（N29-15/16）：wait_alive_truth 主循环 `cur_work` 与 wait_alive_truth_multi 分桶 `_w` 改用 `_agent_log_last_realwork_ts`（注释注明嘴炮不续命语义与 run29 xiao/bella 实证）；dispatch_in_room 降级分支消息文本追加原任务书要点（`${2:0:800}` 截断）。
2. **`custom/server/governance/lifecycle/verdict.ts`**（N29-21）：UAT_SEG_RE AC 组扩 `AC-\d+[~～]\s*(?:AC-)?\d+` 范围形态；UAT_VERDICT_ALT 增 `全部通过|全过|全部不通过|全不通过`（排序长词在前）；uatVerdictFor 对命中段做范围成员归属（把 m[1] 内所有 `AC-a~b` 区间展开比对，共位单 id 逻辑不变）。
3. **`simharness/mux/mx-report-audit.py`**（N29-22）：新增 `_CAPTURE_NONE_STEPS`（解析 capture-plan.env `^\w+\|none\|` 行→步名→经既有别名表折算步号），落尾「任一位在位」断言对 none 型步跳过（FAIL→不产生；该步真值断言面=state 键＋消息转录，已在查 9/逐步问题单覆盖）。
4. **`simharness/mux/mx-report-gen.py`**（N29-23）：`_artifact_text` 读文件后若 `_art_truth` 判 stale：①rel 含 `/archive/` → stale 豁免；②同目录 glob 兄弟文件中存在 `stale_verdict(text)==False 且 declared==RUN_ID` 的文件（按 git 提交序更新）→ 豁免并在 src 注「已被本轮 <file> 取代」；TRUTH_FINDINGS 只收无豁免者。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | N29-15 用既存 realwork 判据换桶刷新，不新建「锚物新鲜度」判据 | realwork（tool completed/API#≥2）已是仓库内单一事实源（run19 嘴炮三例立）；锚物判据需按步配路径映射，过设计 |
| D2 | N29-16 降级消息追加而非保留全文替换 | Matrix 消息长度上限与可读性；800 字截断保交付锚点（任务书验收行都在头段） |
| D3 | N29-21 在 verdict.ts 正本扩形态，不在 harness 侧预整形 | 判词语义正本=产品 lifecycle（README 融合批二立法）；harness 预整形=第二套判读 |
| D4 | N29-22 豁免只对 none 型；repo 型维持断言 | repo 型步（analysis/g2/close 等）run29 实测有载荷承载（dialogs/门禁灯）；none 型才是无承载设计 |
| D5 | N29-23 取代判据=同目录同轮声明件存在，不做跨目录智能匹配 | 交付物槽位=目录级约定（materials/AN-XXX/）；跨目录匹配引入误豁免风险 |
| D6 | N29-14 vendor 面四例登记不修 | 盲改 vendor 回合行为无观测复现路径（每例都是运行期涌现）；先让 N29-15 自动化兜静默类，vendor 面待 0.23.x 后续版本对拍 |

## 验证

- **N29-15**：构造 agent.log 夹具（仅 API call #1 回合行 vs tool completed 行），bash 行为测断言 sig 刷新差异（提取函数体法，先例 run27 批）。
- **N29-16**：`bash -n`＋行为测——降级分支消息含原任务书前 800 字子串断言。
- **N29-21**：`custom/server/governance/__tests__/` 增判例——「G1 冻结 AC-1~7 逐条判定，七条全过」→ AC-3 通过；「AC-2~4 全不通过」→ AC-3 不通过；既有共位判例不回归。`npx vitest run custom/server/governance/__tests__/lifecycle-verdict.test.ts`（存在则跑该文件，否则跑 governance 域）。
- **N29-22**：审计单测/行为——capture-plan.env 含 `smoke_done|none|` 时步 1 无载荷不再入 fails；`triage_done|repo|` 无载荷仍入。
- **N29-23**：python 单测式验证——构造同目录新档场景 stale 豁免、archive 路径豁免、无取代者仍计。
- 全批：`bash simharness/tests/run-gates.sh` 全绿；`npm run typecheck:harness` 不涉（未新增服务端模块）；合并前 `npm test` 全量。

## 设计文档影响

DESIGN_SYNC: none——五件均在推演工装与治理判读层，不触及 DESIGN_DOCS 四正本；方案 §5.12 增补一条随批（N29-15/16/22/23 属 run29 复盘条款范畴，收编进 §5.13 随批登记）。
