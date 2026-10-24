# R82 全量回归轮台账（NestJS+TypeORM+better-sqlite3 典型场景执勤）

> 2026-10-01 执勤并收口 · v2.45.0 · 演练项目 `/Volumes/nvme2230/lab/r81-drill-taskboard`（NestJS ^11 + TypeORM ^0.3.20 + better-sqlite3 ^12 + class-validator + jest/supertest，真实可跑：nest build 绿 + 单元 3/3 + e2e 9/9 + git 仓库三 tag v0.1.0→v0.3.0）。
>
> 轮次编号注：本会话开工时 main=fe8bb1c（R80 收口位）；收口前 fetch 发现并行会话已将 **R81 运行时刷新轮**合入 main（ef8dee6/v2.44.0）——本轮独立发现并修复的 mine-habits 时间炸弹（下文 D3）与其撞根因，按「已合入形态优先」弃用本会话 epoch 偏移修法、采用其绝对锚点修法；轮次顺延 R82（R75/R80 撞号先例第三、四次）。演练项目目录名 r81-* 系撞号前所建，轮次编号以本台账为准。

## 选栈理由

Node/TS 企业后端第一形态 NestJS 首执勤（R30 Express+Prisma / R66 React+Express 之后的 Node 第三棒）：装饰器（experimentalDecorators+emitDecoratorMetadata）+ 模块 DI 装配（@Module imports/forFeature/InjectRepository）+ TypeORM 声明式耦合（@Entity 表名/@JoinTable 联结表/QueryBuilder 别名字符串——TS 类型系统不校验的字符串耦合面）+ class-validator DTO + jest 单元/supertest e2e 双测试面。

## 一、生成流程 12 步（全通，mark-active active）

- ⓪ self-check --check-only 绿；⓪.5 mine-habits 真跑（2 commits 窗口，诚实降级记录）；① 探查六阶链 cognition.md 落盘；①.5 relations-extract 29 条 import 边 + §4 清单 12/12（计数核验 1.00）+ 端点 8/8 + DIM 表；② 特征卡 17 项；③ generate-skill create（standard 档 107 文件）；④ 六文件填充（SKILL.md meta/反借口表/假设清单 + codebase/dev-guide/release/reference-manual/recipes）+ framework-knowledge 61 条规律全带 file:line 证据；④.5 --inject-frameworks（5 框架区块 sha 落痕）；⑤ conf-render（TEST_CMD/BUILD_CMD AUTO:detected 正确）+ 4 个 TODO:model 语义变量人工填；⑤.5 hooks.json 双宿主；⑥ precheck --all（check_test 真跑 jest）；⑦ --review（ocr 无 LLM endpoint 诚实降级→AI 五维自审留痕 docs/reviews/）；⑦.5 框架 glob 填充（VITEST_* 四变量，jest-vitest 伞形命名覆盖 jest）；⑧ memory-writeback 3/3；⑨ verify-completeness --strict → mark-active active（六关全过：spec-first 联动/框架 glob 12/12/计数核验/占位符零/决策账本/HALLUCINATION 真拦截）。

mark-active 执法实录：recipes 把技能内文档写成"复用件"→ HALLUCINATION 拦（路径校验对项目仓库跑，契约正确——修正配方行为项目路径后过）；jest-vitest 零变量→框架空转拦截（填 VITEST_* 后过）。

## 二、执勤工作（三项）

### WP1 标题关键词搜索（v0.2.0）——九节点全流程
- spec-first 三态实测：① 无 spec 写 src → deny + gate-audit/gate-deny 双落痕；② 合格 spec（## 决策记录）→ 静默放行；③ 占位符 spec（待填充）→ 继续拦（真 spec 出现前隔离验证）。
- TDD：e2e 红（2 用例）→ 实现（QueryTasksDto.q + qb LOWER LIKE 参数化）→ 绿。
- 门禁真执法：--all-full 首跑 2 fail（spec 缺 §5.5 复用约束段 + 缺 §19 测试左移段——R75/R80 同形态三现）→ 补齐后全绿（28 调用 26 执行 fail 0）。
- 状态机六阶段：open→design→build→verify→archive 全走通；跳级拦截（design→verify 跨级 ERROR）与 verify 证据门（verify_result=pass+verify_evidence 必填，自我声明不改持久状态）均真执法。
- rules.d Bash 拦截：rm -rf src / npm publish 双 deny（均带替代方案）。
- 清单同步：reference-manual §6 端点行 + recipes §A 配方行追加。

### WP2 分页 off-by-one 修复（v0.2.0 内合入）
- 预埋缺陷 `skip = page * limit`：WP1 组合断言 `items[0].status` 暴露（**空真教训：`items.every` 在空数组上恒真**——默认分页把第 1 页跳空，既有列表断言全部空真通过）。
- 专项红测试（page=1&limit=2 返回前两条 / page=2 返回第三条）→ 修 `(page-1)*limit` → e2e 9/9 绿。

### WP3 结构重构 + 指纹自成长链（v0.3.0）
- labels.controller 内联 CreateLabelDto 提取为 dto/create-label.dto.ts（e2e 9/9 保持绿）。
- 指纹链全通：--write 基线（24 文件/cksum 1897036069）→ 重构 → --diff 感知（24→25、Δ1、.ts 14→15、scope=src 精准定位）→ 清单单条更新 → relations-extract 边集重建（29→30，新增 import 边自动检出）→ inventory-verify 核验（--skill-dir 形态）→ --write 新基线（25/3880978077）。

## 三、生成器缺陷台账（2 修 1 撞号 1 排除）

### D1 版本表语义未钉死（P2 修）——check_deps 假阳性复发面
- **现象**：codebase.md 技术栈版本表诚实记录 better-sqlite3 实装版 12.11.1（npm install 实测）+ manifest 声明 `^12.0.0` → check_deps 报"依赖版本被变更"fail（基线=12.11.1 当前=12.0.0）。
- **根因**：版本表该记哪种语义（manifest 声明值 vs lock 实装值）在填充规范里无单一约定——check_deps 的比较契约是两侧同为声明值（awk 剥 range 前缀+_norm_ver 三段补齐），诚实填实装值即撞假阳性。R30"npm 版本号假报"（提取侧）的姊妹形态：基线语义侧。
- **修法**：双触点钉死——generate-skill.sh fill_guide codebase.md 行 + template-spec ★版本锁定原则："版本表一律记 manifest 声明值、range 原样；lock 实装写说明列"。
- **同族清剿**：exploration-guide ★版本号提取节（已是 manifest 口径，零残留）；check_deps awk 侧剥 range 前缀逻辑（与"range 原样"兼容，零残留）。

### D2 verify-completeness 决策账本回退盲区（P1 修，R36-D6 同族第三现）
- **现象**：自定义 target-dir（`rNN-drill-skills/` 先例形态）生成的技能，按文档把决策写进项目侧 .swarm-yuan/decisions.jsonl（trace-log 正确写入）后，独立调用 `--verify-completeness --strict` 仍误报"缺少决策记录"死锁——技能 conf 里明明有 PROJECT_DIR 真值却不读。
- **根因**：回退链从 `skill_dir/../../..` 推导项目根——只对默认安装位 `.claude/skills/<name>` 成立。R36-D6 在 check_deps 修过同族（读 _CONF_DIR conf），detect-profile-drift:39 有三级解析先例（①env②conf③旧推导），mark-active 入口有 R28-DF7（conf 读出导出）——唯独 verify_completeness 的独立调用路径没跟上。**且 conf 行带 `# AUTO:detected` 溯源尾注（conf-render 固定形态），不剥则路径拼接失明**——detect-profile-drift ②级同款尾注盲区一并修。
- **修法**：generate-skill.sh 回退补三级解析（①env ②技能 conf PROJECT_DIR=R28-DF7 剥法含 # 尾注+占位符守卫 ③旧布局兜底）+ detect-profile-drift ②级对齐同款剥法。
- **同族清剿**：全仓 grep `PROJECT_DIR=` conf 读取点 3 处（generate-skill:804/generate-skill:1029/detect-profile-drift:43）——1029 已是 R28-DF7 修法零残留；其余两处本轮修齐。
- **变异锁**：`tests/test-r82-full-regression.sh` 8 断言（行为锁 3：真生成器造自定义 target-dir fixture+conf 带尾注+项目侧账本→独立调用回退命中；无账本形态如实报缺 fail 方向保持；骨架填充行带版本语义——源码锁 5）。变异验证：stash generate-skill→4 红；stash detect-profile-drift→1 红；stash template-spec→1 红；恢复→8/8 绿。

### D3 mine-habits 时间炸弹（撞号弃用本会话修法）
- 独立发现：fixture 冻结 2026-09-01..05 + `--since "30 days ago"` 滚动窗口——当日 12:40 后窗口起点越过 09-01 10:00，feat 提交整体出窗 4 断言假红（R80 凌晨收口绿→同日中午红，时刻敏感实锤）。本会话先修为 epoch 偏移（中发现 `@$(_d5)` 括号笔误=命令替换空串的调试插曲），fetch 后发现并行 R81 已以**绝对锚点 `--since "2026-08-31"`** 修法合入——形态更简（fixture 日期恒定、byte-identical 可复现），按已合入形态优先弃用本会话修法（rebase 时 checkout 还原）。

### 排除项：state-machine "首次转换未落盘"疑点（非缺陷）
- 现象：`transition build | head -3` 显示准入 ✓ 但 phase 未变。干净复现排除：head 提前退出→SIGPIPE 在 `set_field` 落盘前杀死脚本（管道家族新形态：**截断杀生产者**，与"管道吞退出码"同族）。状态机逻辑正确；记录备查——消费长输出脚本输出时勿用 head 截断管道。

## 四、链路实测记录（全过）

| 链路 | 实测结果 |
|------|---------|
| detect-frameworks | 5 框架命中（express/nestjs/typeorm/validation/jest-vitest），AUTO 回填正确 |
| conf-render Node 分支 | TEST_CMD='npm test'/BUILD_CMD='npm run build' 正确（npm scripts 嗅探） |
| generate-skill create | standard 档 107 文件；--inject-frameworks 5 框架区块+缺变量占位 warn |
| mark-active 六关 | HALLUCINATION 真拦截（技能路径误写复用件）+框架空转拦截（VITEST_* 空）+计数核验 12/12 |
| spec-first 三态 | deny 双落痕/合格放行/占位符继续拦 |
| 门禁执法面 | §5.5+§19 缺段拦截/branch 保护分支拦截/check_deps 真比较/check_test 真跑 jest/rules.d 双 deny |
| 状态机 | 六阶段逐级推进+跳级拦截+verify 证据门 |
| 指纹自成长 | --diff Δ/cksum/scope 精准；边集重建 29→30；inventory-verify PASS |

## 五、执勤侧观察（非缺陷，记档）

1. **jest-vitest 伞形命名**：jest 项目须填 VITEST_* 四变量（命名先惊后明——门禁双栈兼容设计）；fw_jest_test_location 对 jest 的 testRegex 形态报 warn（include: 语义偏 vitest）——advisory 可接受，后续可考虑按栈分化提示文案。
2. **NestJS+TypeORM 声明式耦合不在机械提取面**：@Entity/@JoinTable 装饰器字符串（表名/联结表名）无 XML 形态对应物，relations-extract 的 mapper-binding/data-mapping 家族不覆盖——本轮以 reference-manual §8 字段级映射清单+framework-knowledge 规律承载（AI 语义面）。若后续出现装饰器↔迁移文件形态，可评估DIM_ORM_SCHEMA 扩展。
3. **better-sqlite3 原生绑定 npm≥11 install-scripts 默认拦截**：prebuild 不跑则 require 即炸——release.md 失败排查已记；生成器侧 conf-render 不涉（Node 分支无嗅探面）。
4. **`items.every` 空真教训**（WP2）：列表型 e2e 断言必须索引具体条目或断言 length——空真通过会静默掩护分页类缺陷。已写入演练项目 review record，供 recipes 参考形态引用。

## 六、收口记录

- worktree：`.claude/worktrees/r81-full-regression`（分支 fix/r81-full-regression——目录名撞号前所建；基点 fe8bb1c→rebase ef8dee6=R81 运行时刷新轮 merge 位）
- 变更：`swarm-yuan/scripts/generate-skill.sh`（D2 回退三级解析+占位符守卫+D1 填充行）+ `swarm-yuan/scripts/detect-profile-drift.sh`（同族尾注剥法）+ `swarm-yuan/references/template-spec.md`（版本语义钉死）+ `swarm-yuan/tests/test-r82-full-regression.sh`（新增 8 断言锁）+ CHANGELOG（v2.45.0）+ badge 两文件 + 本台账
- 验证：R82 锁 8/8 + 全量 sweep **54/0**（53 基线含并行 R81 的 mine-habits 修复 + R82 新锁）；预算实测 503214B ≤ 503808B 零增量（增量全在 scripts/生成器侧 references——按"脚本不计税"口径，patch 零增量不登记）
- 版本：v2.45.0（v2.44.0 已被并行会话钉在 R81——R75/R80 顺延先例第三、四次）
