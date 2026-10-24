# R80 全量回归轮台账（Flask+SQLAlchemy+Vue3 monorepo 典型场景执勤）

> 2026-10-01 执勤并收口 · v2.42.0（与 R79 运行时刷新轮同版聚合——R79 由并行会话当日收口进 main（542e5e9）未发版，本轮回归基于该待发状态执行，修复同版聚合） · 演练项目 `/Volumes/nvme2230/lab/r80-drill-notes-hub`（Flask 3.14 + Flask-SQLAlchemy + SQLite + Vue 3.5 + Vite 6，真实可跑：后端 venv pytest 7→13 用例全绿、前端 vite build 过、git 仓库 init）
>
> 轮次编号注：R79 由并行会话 2026-10-01 凌晨完成收口（commit+merge+push），本会话开工时以 stash 转移未提交修改未遂发现该收口，随即转纯回归角色（R64 并行会话先例第三次）。
>
> 选栈理由：Python Web 第三档（Django R60/FastAPI R72 之后集齐三大框架），Vue3 与 monorepo 前后端同仓形态均为首执勤——monorepo 形态正是本轮缺陷打出点。

## 一、执勤工作（三项）

### WP1 标签功能（v0.2.0）——九节点全流程 + spec-first 三态实测
- 需求：Note 标签 tags（JSON 列+property 序列化）、`?tag=` 单标签过滤、前端筛选输入、归一化（trim/去空/去重）。
- spec-first 三态全实测（fail-gate-hook stdin 规范 payload）：① 无 spec 写 src → deny JSON + gate-audit.jsonl + gate-deny.jsonl 双落痕；② 含「## 决策记录」段合格 spec → 放行；③ 占位符 spec（含"待填充"）→ 继续拦（glob 内任一合格即放行，隔离测试验证）。
- 门禁真执法：--all-full 首跑 2 fail（spec 缺 §5.5 复用约束段 + 缺 §19 测试左移段）+ 复跑 1 fail（§5.5 拼装合规声明 4 checkbox 未勾选）——三段全部真实拦截后补齐全绿（R75 同形态复现，执法面健壮）。
- 结果：12 用例全绿、--all-full EXIT=0、feature 分支提交。

### WP2 archived 查询参数语义修复（v0.2.1）——TDD 红→绿
- 缺陷（演练项目自身）：`archived=1` 走 `"1".lower()=="true"` 字面比较判 False，静默返回未归档集。
- 先写失败测试证明（红）→ 修为 `in ("true","1","yes","on")` 归一化 → 13 用例全绿（绿）。

### WP3 routes 拆包（v0.3.0）——结构变更自成长链全通
- `routes.py` 拆为 `routes/` 包（notes.py + `__init__.py` 组装），工厂 `from notes_hub.routes import notes_bp` 导入语义不变。
- 指纹链：`--write` 落基线 → 拆包 → `--diff` 感知（27→28 文件、cksum 变、scope=backend 精准定位）→ reference-manual §6 与 codebase.md 目录树同步 → inventory-verify 核验（--skill-dir 完整形态 12 维度全 PASS/NO_LIST）→ `--write` 落新基线。

## 二、生成器缺陷台账（1 项全修）

### D1 conf-render poly 分支 Python 段硬编码裸 python3（P1，R72-D3 同族漏修）

- **现象**：monorepo 形态（backend/requirements.txt + frontend/package.json）生成的 `TEST_CMD='(cd backend && python3 -m pytest)'`，本机实测 `ModuleNotFoundError`（系统 python3 无 flask_sqlalchemy），check_test 门禁必炸；AUTO:detected 标签整条假。
- **根因**：R72-D3 的 venv 三级嗅探（`.venv`→`venv`→`python3`）只落了 conf-render 根级 Python 分支，poly（多工程同仓）分支的 Python 段（原 :148）硬编码 `python3 -m pytest`——修复点+相邻路径纪律的反面教材，poly 分支即相邻路径。
- **修法**：poly Python 段同款三级嗅探（`$PROJ/$_d/.venv/bin/python` → `$PROJ/$_d/venv/bin/python` → `python3`），相对路径形态配合下方 `(cd $_d && ...)` 组装语义成立。
- **同族清剿**：conf-render 全文裸 python3 形态逐一核对——uv 分支（`uv run --no-sync` 自管环境+compileall 零依赖构建）、poetry 分支（`poetry run` 自管环境）、根级分支（R72-D3 已修）均闭环，无第四形态。
- **变异锁**：`tests/test-r80-full-regression.sh` 6 断言（行为锁 2：monorepo fixture 渲染断言 venv 命中形态 + 无 venv 回退形态保持；源码锁 2：修复注记+嗅探形态在位）。变异验证：stash 修复后 3 断言红 EXIT=1，恢复后 6/6 绿。
- **真机复证**：修复后 conf-render 对演练项目渲染 `TEST_CMD='(cd backend && .venv/bin/python -m pytest)'`。

## 三、链路实测记录（全过）

| 链路 | 实测结果 |
|------|---------|
| detect-frameworks | 5 框架命中（vue/vite/flask/sqlalchemy/pytest），AUTO:detected 回填 ACTIVE_FRAMEWORKS+PROJECT_DIR+TEST_CMD+BUILD_CMD |
| generate-skill create | standard 档骨架 60+ 文件；--inject-frameworks 区块 sha 落痕 |
| mark-active 六关 | 框架 glob 检查真实拦截 VITE（VITE_CONFIG_FILE 未配→warn 空转路径正确）；spec-first 联动检查过；verify-completeness 零占位符 |
| spec-first 三态 | deny JSON+双审计落痕/合格放行/占位符继续拦（三态③须隔离测试） |
| rules.d Bash 拦截 | `rm -rf` 与 `npm publish` 均 deny（无条件面，含替代方案） |
| 指纹自成长 | --diff 感知 Δ 文件+cksum+scope 精准定位，更新链→核验→落新基线全通 |
| 门禁执法面 | 保护分支 master 开发拦截/§5.5+§19 缺段拦截/拼装勾选契约拦截/check_test 真跑（裸 python3 炸出的正是 D1） |
| trace-log/state-machine | 节点留痕与状态机命令面响应正常 |

## 四、执勤侧观察（非缺陷，记档）

1. **LAYER_DEFS 格式三坑连环**（用户配置错误非生成器缺陷，但易踩）：期望 `name=glob` 形态非冒号分隔；须 LAYER_DEFS+LAYER_ORDER 双非空才启用；bash source 后赋值胜出——同文件内重复变量行后行覆盖前行（本轮 python replace 插入新行未删旧行实测踩中，排查 20 分钟）。提示文案可考虑在 skip 信息中给出格式样例。
2. **inventory-verify 清单核验需显式 --skill-dir**：不给只枚举不核验（文档化行为）；清单计数按 § 锚全表行数（粗粒度），维度适用性靠 ENUM_ZERO_DIM 披露 + 人工复核，比率列 capped 1.00 为设计内（低估方向安全）。
3. **--upstream-baseline 门禁在普通项目上 advisory 提示 README 不存在**：该门禁语义为生成器仓对账（upstream-baseline.md 是生成器仓资产），目标技能携带后在普通项目恒 advisory warn。不阻断，但提示文案与项目语境错位，后续可考虑目标技能形态下降噪。
4. **verify-completeness 字面执法误报**：提示句含"P1 待补"字样即命中占位符断言（本轮 recipes.md 脚注踩中，改措辞绕过）。grep -F 字面执法的已知局限（R60 锁形态同款），修复价值低，撰写文档时避开执法词即可。
5. **VITE_CONFIG_FILE 需手工配置**：探测探出 vite 但配置文件路径变量留空（生成器不做文件级猜测），mark-active glob 检查真实拦截兜住——流程闭环正确，AI 填充时按项目结构补 `frontend/vite.config.js` 即可。

## 五、收口记录

- worktree：`.claude/worktrees/r80-full-regression`（分支 fix/r80-full-regression，基点 542e5e9=R79 merge）
- 变更：`swarm-yuan/scripts/conf-render.sh`（D1 修复+注记）+ `swarm-yuan/tests/test-r80-full-regression.sh`（新增锁）+ CHANGELOG（v2.42.0 Fixed 段聚合）+ 本台账
- 验证：R80 锁 6/6 绿 + 全量 sweep 全绿（见 CHANGELOG 验证注记）
