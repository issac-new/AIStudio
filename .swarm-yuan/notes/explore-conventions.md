# 规范探查报告（流A ① 规范子代理，2026-09-16）

## 1. 书面规则汇总

**工作区 AGENTS.md**（硬规则源）：仅允许修改 overlay/（:5）；严格禁止修改 upstream/ 任何文件，仅可 git pull（:7-9）；upstream 变更唯一通路 = overlay/patches/ + npm run inject（:11）；所有开发基于 overlay main 建 feat/fix/refactor 分支，测试验证通过后合回 main（:15-31）。

**工作区 CLAUDE.md**（操作手册）：端口 8647/8649/8650（:38-44）；A类=custom/ 纯新增走 alias+entry shim+registry，B类=patches/ 构建期 git apply（:48-53）；inject 五步（:55-62）；auto-inject 钩子幂等、脏树跳过（:63）；新增 B 类 patch 五步法：临时改 upstream→git diff>patches/NNN-desc.patch→git checkout -- . 还原→入 series→inject 验证（:128-133）；patch 冲突用 git apply --reject 手解（:160）；Node ≥23（:153）。

**overlay/README.md**（37.7KB）：三上游始终原状、.git 永不污染（:181）；A/B 类表含可逆性列（:187-190）；~7 类骨架改动是运行前置故不能全用 A 类（:192）；i18n 扩展键直接经 patch 注入上游 locale，无运行时 merge（:149-151）；新 UI zh/en 全键对称、其余语言 en 回退（:53）；**发布必须用 overlay build:full，禁上游 npm run build**（:490）；后端改动须 `lsof -ti:8647 | xargs kill -9` 重启；改 B 类 patch 后必须先 clean && inject 再重启（:413-443）；发版须递增版本号 + 删 ~/.hermes-web-ui/webui/<version>/ 缓存（:570-576）；README 自报规模口径（177 patch/113 组件/106 测试，:561-564）已滞后于实测（220 启用/146 组件/140 测试）。

## 2. Git 规范实证

- commit：Conventional Commits + 中文描述 + scope 括注模块域，如 `fix(loop-cockpit): 完成 KPI 恢复 7 日窗口口径——…`。type 分布（180 天 501 提交）：fix 148 / feat 147 / merge 46 / docs 39 / chore 17 / style 12 / refactor 8 / test 5
- merge：**显式 --no-ff**（近 10 个 merge 全部双父），风格 `merge: feat/xxx — 说明`
- 分支：feat/fix/chore/docs/release/backup 前缀严格；版本升级分支 `feat/upstream-0.7.21` 式；tag `v2.x`（v2.4…v2.22）；合入后分支保留不删（60+ 本地分支）；存在多 worktree 并行（.claude/worktrees/）

## 3. patch 规范

- series（420 行）：启用 220（grep -cE '^[0-9]'）、禁用 30-34（`# NNN-…  # 原因`，三类措辞：`disabled — keep native…` / `SKIP: …` / `FIXME: pre-existing context mismatch…Stale` / `combined into NNN`）、段注 118 行（说明一批 patch 或用户裁决，如 274 注「2026-09-16 用户裁决」）
- 命名：`NNN-desc.patch` 三位零填充，000 起步，当前最大 274；编号有空洞（归档或预留段）；描述段小写连字符常带域前缀 client-/server-/desktop-/i18n-/test-/cockpit-；撞号顺延+段注说明（271/272 例：「编号顺延——265-270 已被并行会话的麒麟兼容轮占用」）；开工前 `ls patches/ | grep ^NN` 查重
- 文件体：纯 `git diff` 输出（无 format-patch 头），hunk 内允许中文注释（如 `// overlay[ia2]: …`）
- 归档：`.archived-patches/` 存退役 patch，series 同步摘除
- 孤儿文件：142/145/147/152（磁盘存在、series 零引用，被注释明示折进别的 patch 的残留）

## 4. 测试规范

- vitest.config.ts 手写入库，与 vite.config.overlay.ts 平行（vitest.config.ts:1-5）；alias 数组必须同步、`@/custom`/`@custom` 先于兜底 `@`（:20-28）
- include: ['custom/**/*.test.ts'] 只跑 overlay 自身（:31-32）；setup custom/client/test/setup.ts；DOM 环境各文件头 `// @vitest-environment jsdom` 按需
- 实测 140 个测试分布在 15 个 custom/**/__tests__/ 目录；tests/ 目录 gitignored，tracked 测试一律放 custom/**/__tests__/
- 风格：describe/it 从 vitest 导入，中文 it 标题，工厂函数构造 fixture，vi mock；测试头注释标注设计任务/修复波来源
- 用法：npm test / npm test -- cockpit / npm test -- -t "attention"；41% 提交触及测试
- 收口门禁：npm test + clean&&inject 重放 + build:full；发布注记记录 vitest 文件数/通过数、i18n-coverage 18/18、上游 vue-tsc EXIT=0

## 5. i18n 规范

- 新 UI zh/en 全键对称、其余语言 en 回退；扩展键经 B 类 patch 注入上游 locale（packages/client/src/i18n/locales/{zh,en}.ts），无运行时 merge；custom 下无独立 locale 文件
- i18n patch 均 zh/en 成对编号相邻（074/075、090/091、236/237、252/253、254/255、271/272）
- 旧多语言 patch（044-052 de/es/fr/ja/ko/pt/ru/zh-TW）全部 FIXME-Stale 禁用，仅保 zh/en 主线
- 缺键会被上游 tests/client/i18n-coverage.test.ts 拦截（series:339-343 注记）；辅助工具 add-i18n-keys.mjs / add-matrixchat-i18n.mjs

## 6. 发布规范

- 版本号双轨：overlay 发布号 2.x 体现在 package.json version `0.7.21-overlay-2.23`；桌面产物号 = 上游版本，由 patch 042 写入 desktop package.json（产物名 SwarmStudio-0.7.21-arm64.dmg）；上游升级时 042 须手解「version 行取上游 / 品牌字段取 ours」
- RELEASE-NOTES.md 四段式注记 + sha256 回填；`chore(release):` / `docs(release):` commit + tag
- 构建物上传与否由用户指令控制（「未上传，用户指令」反复出现）

## 7. 设计文档规范

- 位置双侧并存：workspace docs/superpowers/{specs 33,plans 36,notes} 与 overlay/docs/superpowers/{specs 39,plans}，内容有分叉，近期落 overlay 侧
- 命名 YYYY-MM-DD-<slug>-design.md / YYYY-MM-DD-<slug>.md（日期前缀强制）
- spec 模板：标题→元信息行（日期·分支·状态）→## 主旨（改了什么/为什么/怎么验证）→## 决策 D1/D2…编号（含显式偏离记录，如 D5「这是…显式偏离，记录在案」）→## 验证（测试文件级清单+门禁）
- plan 模板：「For agentic workers: REQUIRED SUB-SKILL…」行 → Goal/Architecture/Tech Stack 三行 → ## Global Constraints（门禁/上游零污染/i18n/patch 编号约束）→ ### Task N（**Files:** Modify/Create/Test 三列 + 行为规格编号清单 + checkbox 步骤 + 收尾 TDD→npm test→Commit 拟定 message）；推荐 superpowers:subagent-driven-development 执行

## 8. 禁区与红线

**不可做**：改 upstream/ 任何文件（AGENTS.md:5-11）；用上游 npm run build 出发布产物（README:490）；改 B 类 patch 后不重新 inject 就重启后端（README:443）；顶层 await（es2020 target 不支持，README:303）；运行时 merge i18n 或在 custom 放 locale 文件（README:149-151）；发版复用版本号（README:570-576）；引入新依赖（plan 级约束）；custom 直接 import 上游模块（custom→upstream import 禁令，测试侧镜像 custom/upstream-compat/）；污染上游 .git。

**必须做**：从 main 切 feat/fix/refactor 分支；测试验证通过后合 main；B 类五步法；A 类 register 函数 + bootstrap 按 flag 动态 import + mount 前完成注册；patch 编号开工前查重；收口门禁 npm test + clean&&inject + build:full；新 UI 文案 zh/en 双键成对 patch；vitest alias 同步；显式偏离/用户裁决记录在案（spec 决策 + series 段注）。

## 9. 未成文实践

「不跨 worktree cherry-pick」无书面依据但存在多 worktree 并行工作流（属未成文实践）。用户级 AGENTS.md（~/.zcode/AGENTS.md）另有 worktree ≤3 上限、Conventional Commits、合并 --no-ff 等全局规则。
