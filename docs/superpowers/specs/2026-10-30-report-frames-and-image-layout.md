# 报告补帧与图版面放大批（run23 用户复评）

日期：2026-10-30 ｜ 轮次：20261028-v8-run23 ｜ 类型：fix（报告生成器/拍摄位注册）

## 变更

1. **`simharness/mux/capture-plan.env`**——补两条缺失拍摄位：`defect_done`（④开发·看板缺陷闭环现场）、`ready_done`（⑤验收·G5 审批）。二者此前无注册，`capture_step` 只能落回落 URL 或直接失败 → 报告恒显「截图缺失·defect_done / ·ready_done」。
2. **`simharness/aipay-scenario.sh`**——补 `capture_step "defect_done"`（步骤 19 收口处）与 `capture_step "ready_done"`（G5 准出落键处）。此前步 20 只拍了旧标签 `release_done`，与报告步键 `ready_done` 不一致，帧永远挂不上。
3. **`simharness/mux/mx-report-gen.py`**：
   - **图版面放大**（用户指令）：步级证据图容器从 `repeat(auto-fill,minmax(230px,1fr))`（实拍 2880×1800 被压成 230px 缩略图）改为 `repeat(auto-fill,minmax(min(100%,720px),1fr))`，并去掉 44px 左缩进——`.main` 内容宽 1116px 下即为单列大图（约 1116px 宽，较原 230px 放大 4.8 倍），窄屏自动单列；产品成效系列帧从 4 列改 2 列。点图全屏放大交互沿用。
   - **拍摄位双名并集**（`_STEP33_MULTI_KEYS` + 统一并集循环）：驱动 `capture_step` 的标签与报告步键曾有三处分叉——步 8 `room_done` vs `room_analysis`、步 20 `release_done` vs `ready_done`、步 19 缺 `eval_done`。分叉时帧文件永不被引用，报告只能显示「截图缺失」。现按别名并集，且对「已注册叙事」与「骨架兜底」两种来源同样生效（旧代码只对空键补别名，骨架轮拿不到）。
   - **图数真值口径**（修「自相矛盾」）：页头原只数「叙事 imgs 显式注册」，骨架兜底轮因此报「0 图次/本轮未拍摄」而正文实际嵌 53 张。改为与渲染器同判据：显式注册 ∪ 按状态键自动挂接（`report_truth.orphan_frames_for`）；「盘上未引用帧」告警同步用该集合，不再把所有已嵌帧误报为漏配。
4. **本批实拍补帧 8 张步位 × 前后帧**（room_done / defect_done / ready_done / uat_done / workmgr_done / audit_done / retro_done / ide_done），存 `runs/20261028-v8-run23/evidence/screenshots/steps/`，图注按 V8.4③ 明示补拍时点；未执行步（21-25）的帧标注为「当前产品面实况」，待该步执行时由 `capture_step` 自然覆盖。

5. **`simharness/mux/mx-report-audit.py`**——「✅步无帧」三态判定补一档：`data-shared-key`（V8.4② 同源帧单嵌、后续步出「与前步共用」声明）归入声明态，不再掉进 ticketed 分支。旧判据取不到「截图缺失·<键>」还会打出空键告警（`V8.4④ ✅步无帧已登记降级：` 后面空着），属 run23 值守复评时抓到的假告警；ticketed 分支同时改为按步号兜底取名，永不输出空键。

## 决策记录

- **补拍而非「功能不存在」声明**：8 个缺帧步都有确切的页面承载（capture-plan 已注册或有等价页），不适用「无对应产品界面」声明；因此按 §5.6 采集纪律⑩「补拍须准确+图注明示时点」执行，而不是登记降级了事。
- **未执行步也补帧**：步 21-25 本轮尚未执行，报告将其标 ⬜；补拍帧以「当前产品面实况」入块，仅作承载面证据，不改变完成态判定（`_step_done` 只看 state 键）。执行时 `capture_step` 以同名覆盖，不会出现两份。
- **不动 vendor/**：本批全在 harness（拍摄位注册、驱动调用、报告生成器）。

## 验证

- `python3 mux/mx-report-gen.py --run 20261028-v8-run23` → `55 images`（原 0 图次口径）、`缺失占位：0`（原 8 处「截图缺失」）、盘上未引用帧 0（原 55 误报）。
- `python3 mux/mx-report-audit.py --run 20261028-v8-run23` → FAIL 从 9 项收敛到 **1 项**（仅剩查15 评测摘要缺席，属 G5 缺项①/评测链样本源未落，待 qi 交整合测试报告后自解；A3a/R5/A5a 均已通过）。
- 版面孔径：报告内 `.st-shots` 规则为 `minmax(min(100%,720px),1fr)`、`.po-shots` 为 2 列（HTML 实测各 1 处命中）。
- `bash -n aipay-scenario.sh` 通过；`python3 -c 'ast.parse'` 校验生成器通过。

## 设计文档影响

DESIGN_SYNC: none——只改报告生成器版面与拍摄位注册表（harness 面），方案 §2.5 承载范围清单与 §5.5/§5.6 采集纪律的语义未变（拍摄位仍是这些页面，只是把「名字分叉」纠正）。26 步/六闸/判据零改动。
