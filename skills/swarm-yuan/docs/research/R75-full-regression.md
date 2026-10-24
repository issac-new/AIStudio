# R75 全量回归轮台账（NestJS 典型场景执勤）

> 2026-09-29 执勤 · 2026-09-30 收口 · v2.39.0 · 演练项目 `/Volumes/nvme2230/lab/r75-drill-tasks-api`（NestJS 11 + TypeORM 0.3 + better-sqlite3 + jest，真实可跑，tsc 零错误 + jest 9/9）
>
> 轮次编号注：本轮回前会话 2026-09-29 完成执勤（原拟 R73），与当日已发布的 R73/R74 运行时刷新轮撞号，收口时顺延 R75（v2.37.2→v2.37.4 先例）；演练项目目录与生成技能目录同名顺延（r73-→r75-）。收口验收由独立会话执行：rebase 至 v2.38.2 后全量 sweep 揪出 4 项新缺陷（§六），修满后全绿收口。

## 一、执勤工作（三项）

### WP1 分派功能（v0.2.0）——九节点全流程
- 需求：任务分派 assignee（PUT /tasks/:id/assign、DELETE /tasks/:id/assign），done 任务 409 拒分派。
- spec-first 三态实测：无 spec 写 src → hook deny（JSON + gate-audit.jsonl + gate-deny.jsonl 落盘）→ 写 spec（含「## 决策记录」段）→ 放行。
- 门禁真执法：--all-full 首跑 5 fail（保护分支 master 开发 / spec 缺 §5.5 勾选、影响范围、§19 测试左移段）——分支守卫与 spec 模板段要求全部真实拦截；补齐后全绿。
- 结果：8 端点、9 tests、门禁绿、feature 分支提交。

### WP2 done 锁定修复（v0.2.1）——修 bug + Bash 拦截实测
- 缺陷：assign 对 done 409 但 unassign 不拦——语义不对称。
- 实测 rules.d 无条件面：`rm -rf`、`npm publish` 均 deny（含替代方案与 --persist 落痕指引）。
- 修：unassign 对 done 抛 409（对称化）；9 tests 绿。

### WP3 statistics 模块（v0.3.0）——结构变更指纹反馈
- `project-fingerprint --write` 落基线 → 新增模块（+3 文件）→ `--diff` 感知（Δ3、scope=src、更新链指引）→ reference-manual 对应节更新 → 计数核验 → 落新基线。自成长链全通。

## 二、缺陷台账（5 项全修）

### D0 根 README badge 滞留（流程缺陷）
R72 发版时根 README badge=v2.37.4（其余两面 v2.38.0）。基线 self-check 决策 38 机器锚抓到，但收口五件套无 badge 同步强制面。修：本轮三面统一 v2.39.0 + 防复发锁 L10 升格为机器断言。

### D1 detect-frameworks scope 前缀死信号（P0，"规则集在册≠链路可达"第九现）
`nestjs|@nestjs|pkgjson`/`antd|@ant-design|pkgjson` 含 `@` 不含 `/`，落入 scoped 包 `grep -qxF` **整行精确匹配**分支——依赖桶是 `@nestjs/common` 等完整包名，裸前缀永不命中（对照组 `angular|@angular/core` 完整包名能命中）。**nestjs 8 条门禁自建表以来从未注入过任何项目**；五环全断：检测→ACTIVE_FRAMEWORKS→懒补 NEST_SRC_GLOBS→门禁注入→framework-knowledge 节。修：改完整包名（`@nestjs/core`/`@ant-design/icons`）+ scope 前缀防御分支（`@xxx` 无 `/` → `^@xxx/` 前缀匹配）。

### D2 check_deps 版本对比假阳性
`_norm_ver` 剥前缀后字面比较，`^5.7` vs `^5.7.0` 判"变更"（数字段缺省不参与比较）。修：数字段补齐三段（5.7→5.7.0），`-v OFS=.` 防 BSD awk 字段重建用空格连接（实测踩中：无 OFS 时输出 "5 7 0"）；真差异（0.3 vs 0.3.20）与后缀版本（2.1.4.RELEASE）保留。

### D3 mark-active spec-first 联动缺口
骨架 conf `WRITABLE_DIRS=()  # TODO:model` 漏配时，spec-first 门按设计"WRITABLE_DIRS 未配 → 放行"——SPEC_REQUIRED=1 整链静默空转，mark-active 六关不校验。修：`check_spec_first_wiring` 抽函数串入 mark-active（SPEC_REQUIRED=1 且 WRITABLE_DIRS 空 → fail + 指引）。

### D4 DIM 枚举器 NestJS 形态缺位（同族三维度）
接口端点恒 0（只认 Spring `@GetMapping` 族，NestJS 裸动词 `@Get(` 族缺，实测 8 端点枚举 0）、后端 controller 恒 0（`@Controller(` 缺）、异步消费者恒 0（`@EventPattern(/@MessagePattern(` 缺）。修：三维度补形态（alternation Spring 在前 + `\b` 防二次命中）。修后端点 8/8 PASS、controller 2。

## 三、执勤侧观察（非生成器缺陷）

- DIM 清单计数语义=RM_REF 节行数（粗粒度勾稽）——异步消费者枚举 0/清单 8 行是维度语义非漏报（ENUM_ZERO_DIM 披露机制正常工作）。
- `§测试案例` 节非 mark-active 强制——填充指引可考虑提示（本轮 reference-manual 未建该节，测试文件维度 NO_LIST 诚实披露）。
- inventory-verify 需显式 `--skill-dir`（清单在技能侧），漏传时全 NO_LIST 静默——用法已在 --help 披露，暂不动。
- BSD awk `-F.` 字段重建用 OFS（默认空格）：`$(NF+1)=0; print` 会输出 "5 7 0" 而非 "5.7.0"——多平台 awk 语义差异进 Darwin 坑清单。

## 四、防复发锁

`tests/test-r75-full-regression.sh`：16 断言（L1/L1b 行为锁 + L2/L3 死形态禁入/防御分支锁 + L4/L4b 归一行为锁 + L5/L5b 源码锁 + L6/L6b 联动源码锁 + L7 mark-active 行为锁 + L8/L8b/L8c DIM 源码锁 + L9 DIM 行为锁 + L10 badge 三面一致断言）。

## 五、预算登记

- FACT_SCRIPT_LOC 6526→6531（`_norm_ver` 单行→注释+多行归一实现，净 +5 行）。
- FACT_ARTIFACT_BYTES_BUDGET 491520→495616（第十四次登记，收口验收轮补追账，见 §六 D8）。
- FACT_SKILLMD_BYTES_BUDGET / FACT_UNIVERSAL_FILES / FACT_UNIVERSAL_FILES_CORE：零变动（本轮无随发档、无 SKILL.md 内容变化）。

## 六、收口验收轮补遗（2026-09-30，独立会话；全量 sweep 46/5 → 修后全绿）

执勤提交未跑全量 sweep 即搁置（rebase 到 v2.38.2 后 run-sweep.sh 46 通过 / 5 失败），独立验收逐项根因修复：

### D5 防复发锁自带 G20 违规（第九踩）
`test-r75-full-regression.sh` L4 断言行 `a=$a b=$b）`——`$b` 紧跟全角右括号，G20（多字节相邻变量铁律，security-spec §6.1）违规，C-locale + `set -u` 下 unbound 崩溃。self-check G20 静态扫描当场抓到。修：`${a}/${b}` 花括号形态。G20 家族第九次实证：**防复发锁自身也要过锁**。

### D6 新门禁遮蔽既有契约（fixture 前置缺失）
D3 的 `check_spec_first_wiring` 无条件先于决策账本检查执行，两个既有契约测试的 fixture 未满足新前置：
- `test-mark-active-decisions-fallback.sh`：裸骨架直接 mark-active，spec-first 拦截先于"缺少决策记录"拦截出现，反向对照断言（拦截面健在）拿不到期望拦截行；
- `tests/e2e/run-gen-e2e.sh` Step ⑧：glob 填充后 mark-active 期望成功，被 spec-first 拦截卡死（E2E 死锁回归）。
修：两处 fixture 填充步补 `WRITABLE_DIRS=("src")`（对齐真实执勤填充形态），两契约共存——D3 拦空可写区（L7 负向锁）+ 填充后放行（两测试正向锁）。教训与 R48-G5 同族：**新增 mark-active 关卡必须同步审计全部 mark-active fixture**。

### D7 main 侧禁用词残留（R74 引入，docs 轮不跑 sweep 的盲区）
`references/review-methodology.md:501`"发布面三件套再会师"——R74 运行时刷新轮写入的"三件套"命中 r68 禁用清单（该轮 docs-only 未跑全量 sweep，R70"CI 连红五轮"同族流程洞）。修："三项门禁"。

### D8 生成物预算锚未追账（R73/R74 增量，D7 同根盲区）
self-check 预算断言 fail：实测 492144B > 预算 491520B（超 624B）——R73/R74 两轮运行时刷新向 references/ 物化注记（codex 0.159 八条/R74 吸收段）未登记 FACT_ARTIFACT_BYTES_BUDGET；R70 第十三次登记实测 488608B，两轮净增 3536B。执勤台账"ARTIFACT 零变动"声称同时被证伪（基线过时）。修：第十四次登记 491520→495616（+4KiB 沿决策 38 冻结现状+显式余量形态；补核轮不发版故未过此断言，发版门补追账——R26/R33 同源先例），facts.conf 注记链 + README 预算行两处同步。

### 收口验收实证（生成器重生成链）
修复后生成器对演练项目重生成技能：detect-frameworks 探出 5 框架含 nestjs（D1 修复真机复证）；`ACTIVE_FRAMEWORKS` 含 nestjs（环②）；骨架懒补 `NEST_SRC_GLOBS=()  # TODO(framework-gates)` 在位（环③）；注入块含 `_fw_nestjs_check` 且分发循环 `fn="_fw_${fw//-/_}_check"` 覆盖（环④）；SKILL.md 检测框架行 + framework-knowledge.md `## nestjs` 节在位（环⑤）——五环全通。修复前旧产物（执勤时生成）四环皆断（无 nestjs），系 D1 修复前快照，佐证缺陷真实性。
