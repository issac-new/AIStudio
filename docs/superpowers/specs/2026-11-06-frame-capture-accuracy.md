# 2026-11-06 帧采集准确性根治：双帧伪模型退役＋EFFECTIVE_ACTION 执行 bug＋探针出池＋审计口径对齐＋run27 收口

用户红线（2026-11-06）：「19 个步骤的截图前后一模一样（等于没证据），修复该问题，截图务必准确，不要冒充」。

## 变更

run27 实测 19 步 before/after 帧 md5 相同却按「实拍」入报告证据池。根因四层叠加：

1. **双帧伪模型（主因）**：`mux/r18-frames.mjs` 对无动作步拍两帧——before 拍完原地等 SETTLE 再拍 after，步完成态页面静态，两帧必然字节相同，却以「操作前后帧」语义注册（`mux/mx-scenario-lib.sh` capture_step 注册标题即「操作前后帧」）。run27 里「前后不同」的 9 步实为计时器/动画噪声差，同样不是操作证据。
2. **EFFECTIVE_ACTION 解析 bug**：`r18-frames.mjs:285` 算出 `EFFECTIVE_ACTION = PLAN_ACTION || ACTION` 后，执行却解析 CLI 参数 `ACTION.split(':')`——capture-plan.env 第 4 列声明的规划动作从未真正执行，动作步退化成静态双帧。
3. **探针污染证据池**：`aipay-scenario.sh` 采集链开跑预检的探针帧（capture-precheck-op1-*.png）落在 steps/ 证据目录，被帧盘点（同图/零变化扫描）计为一个「步」（19 = 17 弱承载步 + ide_done + 探针）。
4. **审计反向激励**：`mux/mx-report-audit.py` 查 8 断言「每组 ops 须 ≥2 帧=操作前+系统响应」——该断言正是孪生帧的生产强制力；单帧模型不改断言则未来轮全红。

本批五件（对齐 capture-plan.env 四态语法与 O3 批（c36496d9f）的拍后即验隔离）：

- **A 射手二态化**（`mux/r18-frames.mjs`）：修 EFFECTIVE_ACTION 解析 bug（规划动作真实执行）；无动作步只拍单帧 `<step>-op1-after.png`（完成态实拍），不再产孪生 before；有动作步保持 before/action/after 三帧。
- **B 探针出池**（`aipay-scenario.sh`）：预检探针帧拍后即移出 steps/ 至 screenshots/ 父目录（保留可查、不入证据池）。
- **C 审计口径对齐**（`mux/mx-report-audit.py`）：查 8 每组 ops 期望帧数改为「注册帧含 -before/-action → ≥2（操作对）；否则 ≥1（完成态）」；`frame-zero-change-voided` 加入查 3 预解析与 A5d④ 的降级配对族（与 frame-capture-failed / r18-collection-missing 同通道）。
- **D 生成器诚实注**（`mux/mx-report-gen.py`）：摘要图注新增「零变化已隔离 N 步（不入证据池）」（按盘上 `*-op1-before.png.invalid` 实测计数）；`_missing_ref` 排除已隔离步（隔离≠冒配）；O1 指标行 frames 增 voided_steps。
- **E frame-verify 隔离跳过**（`mux/frame-verify.py`）：after/before 双缺席且 .invalid 在案=已隔离帧，跳过不产「缺帧」偏差行（隔离帧不在证据池，无内容可核）。
- **F run27 收口**（运行态 `ncwk-sim-mux/runs/20261105-v8-run27/evidence/`，仓外操作留痕）：19 对零变化帧隔离 .invalid＋剥离子探针帧；r18-steps.json 剥离对应 ops 帧注册；issues.log 逐键记 `frame-zero-change-voided` 单（标注复盘补隔离时点）；重跑 frame-verify → 重生成报告 → 重审计。

## 决策记录

- **单帧而非补动作**：无动作步补一个「点击某处」的动作是制造表演性差异（点的不是该步真实操作，只是让两帧不同）——与「不冒充」相反。完成态单帧本身就是准确证据（页面真实呈现该步产物），before/after 对只对真实发生的操作有意义。
- **9 个噪声差步不动**：run27 里前后不同的 9 步（anexec/audit/defect/deliver_gate/plan/ready/register/review/uat）虽非操作证据，但两帧均为真实页面实拍且逐帧过 frame-verify 内容核验——不是本批用户指认的「一模一样」问题；未来轮经 A 自动收敛为单帧。历史帧不回溯改写。
- **隔离而非删除**：.invalid 后缀保留盘上原帧可查证（历史可复核），只是退出证据池；与 O3 批未来轮拍后即验同构，机制单一。
- **审计断言按注册帧形态判**：不新增载荷字段（op 条目不加 action 布尔）——注册帧名含 -before/-action 即动作对，只有 -after 即完成态；判据从既有数据派生，旧载荷零迁移。
- **scope 边界**：none 步渲染声明态与 repo 步产物证据链为 O3 批已落能力，本批不重复实现；run27 的 7 个 repo 步因采集早于重分类无 repo-shots，按降级凭证如实呈现缺帧＋单，不回补拍摄。

## 验证

- 守门：`simharness/tests/frame-four-state.test.ts` 扩展四断言（射手源级：EFFECTIVE_ACTION.split 在位、无动作路径无 before 帧产出；预检源级：探针帧 mv 出 steps/；审计源级：单帧口径 + 零变化族配对）。
- 单测：`npx vitest run simharness/tests/frame-four-state.test.ts` 全绿；既有套件零新红。
- 活体（run27 收口）：隔离后 `frame-verify.py --run 20261105-v8-run27` 不再对隔离键报缺帧；`mx-report-gen.py` 重生成报告摘要含「零变化已隔离」且不再把隔离帧计入实拍；`mx-report-audit.py` 零新 FAIL（隔离步走降级 WARN）。
- 射手单帧路径：对任一 URL 步干跑 `r18-frames.mjs` 验证只产 after 帧（若采集环境在位）。

## 设计文档影响

DESIGN_SYNC: none —— 本批为 simharness 采集机制内部修复，能力语义正本即 `simharness/mux/capture-plan.env` 头部注释（本批随改动同步其帧模型描述）；不触及整合正本与数字总账。关联前批：`2026-11-06-run27-design-optimizations.md`（O3 四态语法，本批为其采集端闭环）。
