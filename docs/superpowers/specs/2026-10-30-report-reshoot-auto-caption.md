# 收尾补拍图注自动标注（V8.4③ 对齐审计同口径）

日期：2026-10-30（提交时点 10-31 凌晨）｜ 类型：fix（报告生成器）｜ 触发：run23 收尾补拍轮「补拍替换掉报告中的图片」

## 变更

**`simharness/mux/mx-report-gen.py`**（孤儿帧自动挂接循环，~L4782）——每帧判定「mtime 晚于步键 epoch+120s」，命中即在图注追加「·收尾补拍」。判定口径与 `mx-report-audit.py` V8.4③ 完全同源：键取帧前缀 `split('-op')[0]`、epoch 读 `state.env` 数值键、容差 +120s、`OSError` 静默（帧缺席本就有缺帧呈现路径）。本轮实例：`audit_done-op1-{before,after}`、`appinit_done-op1-after` 三帧此前因「晚拍无补拍标注」FAIL，本改动后合规降级为 WARN（带标注晚拍帧）。

## 决策记录

- **为什么在生成器侧自动判定而非手工写死帧名**：补拍帧集合随收尾轮动态变化（本轮 room_done/9/devimpl/ide 四组共 12 帧重拍），手工清单必滞后；mtime vs epoch 是审计已在用的机器可判事实，同源自动判定零维护。
- **为什么只对「有 epoch 的键」生效**：state.env 里 `devimpl_done=1`/`ide_done=1` 是标志位非时刻，审计同口径跳过晚拍检查——生成器不造出审计不认的标注（两处判定任何一侧变更须同步，已在代码注释声明）。
- **图注仍守「说人话」口径**（2026-10-30 用户复评指令）：正文图注只加「·收尾补拍」五字，帧的完整来历（补拍时点/拍摄配方）留在 r18-steps.json ops 标题与 reshoot.log 侧车，不进正文。

## 验证

- `python3 mx-report-gen.py --run 20261028-v8-run23` → 900KB/65 图；`final-report-merge.py` → final-report.html 75 帧全唯一。
- `mx-report-audit.py --run 20261028-v8-run23` → **四查全过**；V8.4③ 由 FAIL（3 帧晚拍无标注）转为 WARN「带补拍标注的窗外/晚拍帧 3 张（合规降级）」，其余 WARN 为收尾前既有的登记降级项，无新增。
- 图注抽检：`audit_done-op1-after` → 「本步界面实拍（操作后·收尾补拍）· 点图放大查看」；无 epoch 键帧（room_done 等）不加后缀，与审计判定一致。

## 设计文档影响

DESIGN_SYNC: none——报告生成器图注措辞级变更，V8.4③ 判定口径未动（审计为单一事实源，生成器对齐之）；不触及整合正本与数字总账。
