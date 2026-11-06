# 2026-11-06 截图-章节匹配全量核查与采集程序修订

## 变更

用户令「检查报告中所有截图与章节内容，确保匹配正确，修订采集程序」。run27 全量核查（58 帧/29 步：机检 33 帧 26ok/7bad＋视觉抽验）后四处修订＋一处联动：

1. **降级守卫有限重试**（`mx-scenario-lib.sh` capture_step）：原「frame-capture-failed 在案即永久跳过」在环境性失败上过杀——run27 testpass/eval 两步在网关停摆窗（19:38）失败一次，网关恢复后三轮重放全被跳过、缺帧永不补。修订：降级在案时若网关健康（8801 可达）且未重试过（`frame-retried-<step>` 幂等键）→ 清标记重拍一次；每步至多一次环境恢复重试（防循环）。
2. **收尾补拍 report_view**（`aipay-scenario.sh` report 段）：frame-verify 期望表有 report_view 键（步 26 查看面深链）但**无任何拍摄调用**＝期望-采集契约缺口，run27 恒缺帧。报告 HTML 落盘后补拍（`/app/sim?run=${RUN_ID}` 深链定位本轮）。
3. **18b 文件域帧条件补拍**：mp_runtime_proof 期望键同样无主——runtime-proof 在位分支内补 `capture_step "mp_runtime_proof" "file:docs/evidence/DEV-MP-runtime-proof.png"`（源缺席由 capture_step 记 frame-file-missing 单，不再静默缺帧）。
4. **预检拍内容等待**：capture-precheck 裸拍 `/app` 在冷启动期拍出「未开始/还没有」空态帧（run27 内容不符 7 帧之一）。加 `--expect "流程总览"`（N13 射手既有机制），等内容装载完成再拍。
5. **期望表-采集方契约联动**（守门首跑抓出的两个真缺口）：①期望键 `26` 无采集方（与 report_done/report_view 重复语义）→ 删；②O3 重分类的 17 个 none/repo 步仍在期望表（恒缺帧假红）→ 同步删除 9 none 键＋8 repo 键。

## 决策记录

- 核查方法：机检面（frame-verify 33 帧 OCR 期望词）为主判据＋视觉抽验（uat_done 确证机检可信：需求追溯页签＋4 条真实对账卡与章节匹配）；7bad 三类根因（2 环境失败永禁/3 无人拍契约缺口/2 空白态）逐一定谳修订，17 零变化步已由 O3 四态根治（前批）。
- 重试设计取「每步至多一次」而非无限：run19 壳页复读风险仍在——环境恢复重试一次若再失败，维持降级（真采集链缺陷走人工）。
- 期望表清键而非「none 步免核验」特判：期望表语义=「盘上帧该长什么样」，无帧步不进表；特判会让表里混入两种语义。
- 契约守门（期望键必须有采集方）进 `frame-program-rev.test.ts`——再出现「期望表加键没人拍」直接红。

## 验证

- `npx vitest run tests/frame-program-rev.test.ts`：**5/5**（四修接线＋契约一致性），与 frame-four-state 合跑 **11/11**。
- 契约守门首跑即抓两真缺口（键 26 无主＋9 none 键未联动）——守门有效性实证。
- `bash -n` 两脚本＋`py_compile` frame-verify 全过。

## 设计文档影响

DESIGN_SYNC: none——采集程序行为修订与期望表数据联动，§5.5 验收线与六闸判据未变。
