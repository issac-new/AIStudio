# R117 运行时例行刷新轮（2026-10-17）

> 触发：用户 /goal 三目标（research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版）。口径同 R115/R116 例行轮。轮号位 R117。

## 一、移动面（9 移动 / 12 零移动）

| 运行时 | R116 基线 | 远端最新 | 判定 |
|---|---|---|---|
| claude-code | npm 2.1.301 | npm **2.1.302**（live CLI 已同版） | **移动**（1 patch 修复主导） |
| openspec | 1.14.2 | **1.14.3**（GitHub tag+npm 双通道同步） | **移动**（1 patch 薄轮） |
| claude-mem | 13.39.0 | **13.41.0**（2026-10-17 发布） | **移动**（2 minor，watch 维持） |
| ocr | 1.13.0 | **1.13.1**（2026-10-17 发布） | **移动**（薄修复批） |
| graphify | 0.9.91（GitHub）/PyPI 0.10.0 | **0.9.92**（GitHub+**PyPI 双通道同版**） | **移动**（23 社区 PR；**R116 勘误的 PyPI 通道异常解除**——graphifyy 0.10.0→0.9.92 归位） |
| dsh | dsh-v0.2.1-alpha.5 | **dsh-v0.2.1-rc.2**（tags 序列 rc.2/rc.1/alpha.5） | **移动**（**R74 预登记触发点「0.2.x rc tag」兑现**；alpha.5 36 提交实质+rc 线 13 提交） |
| codex-security | npm-v0.3.0 | **npm-v0.4.0**（tag+npm 同步） | **移动**（1 minor） |
| gstack | tag v1.87.5.0 + tip 47d639ab | tip **d258bcff**（2026-10-17） | **移动**（tip +17：v1.91.102→121 fix wave 5+field list 2） |
| pi | Pi 1.0 | **v1.3.0**（tags v1.1.0/v1.2.0/v1.3.0；npm pi-agent-core 1.3.0） | **移动**（机制源薄记：tag 面两 minor，未接线不深读，新机制原语待接线前补课） |
| codex 0.163.0 / comet 0.4.5 / GitNexus 1.6.12 / gsd-core 1.17.0 / superpowers 7.0.0 / ECC 2.2.3 / impeccable cli-v4.6.0 / pua 3.5.1 / mattpocock-skills v1.3.1 / semantica（tag v0.7.0+tip ca6c9f191 双零移动）/ ruflo 3.56.10 / better-harness（npm 0.0.0 占位、0.7.0 全 alpha 不取） | — | 均在最新（核对时点 2026-10-17） | 零移动（codegraph watch 未接线不计） |

live CLI 口径：`claude --version` 2.1.302（=npm latest，漂移已自然归零）；`codex --version` 0.162.1→**本轮升级 0.163.0**（R116 记档的滞后窗口由本轮 /goal 运行时更新指令关闭，R113 先例同构）。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| claude-code-capabilities 2.1.302 段 | 分类器模型独立可选（判定面与执行面模型分离）/云会话 resume 后成本连续（计量连续性）/credit 计费面跳过建议（宿主自发动作花费落用户付费面先停）/Read 图片>128MB 拒载（有界读取）/插件退出前排空配置写队列（关停排水第二实证） | claude-code-capabilities.md v2.1.302 节；巡检/计量类门禁的失败与成本呈现参照面 |
| codex-security-methodology v0.4.0 段 | hosted scan 执行模型（执行器/冻结检出/显式设置由宿主供给，**授权/取消/持久执行态三权归宿主**——执行权责从隐式契约升为显式接口）/token 计量不双计（失败尝试与压缩用量入总额、resumed history 只计一次——与 claude-code「resume 成本连续」互补：一防从零重计、一防恢复双计）/ranking helpers 移除带迁移指引（破坏项进 minor 须带迁移路径） | codex-security-methodology.md v0.4.0 段；G15 CLI 接线面的执行模型参照 |
| memory-persistence R117 行 | MCP 执行回执覆盖 worker 响应前失败且**为独立观察源不并入调用计数**（计量分口径：观察面之间不互相兑换，合并即虚报）/团队简报先行不整库倾倒/加入团队不切换自有 observer（共享是叠加不是替换）/包装器刻意短小复用既有工作流（组合优于重写） | memory-persistence.md R117 行；trace-log/计量双通道口径参照 |
| code-graph-tools R117 段 | 成员名 `_`/`$`/`#` 修饰符差异=不同节点（「同名≠同物」把命名修饰符纳入同一性判据，与 v0.9.90 C# 案跨语言同执法）/barrel 悬空边删除（解析态前进一步旧占位边退场——边存活跟随解析真相）/AST cache 代际与提取器版本绑定 | code-graph-tools.md R117 段；图谱消费与 id 判别参照 |
| review-methodology R117 段 | **agent-ready 错误契约**（gstack v1.91.114：每个错误为 AI 读者打分——错误的第一读者越来越是 agent，错误输出从人读散文升为可分级消费契约）/跳过的升级永不说 ok+pid 复用不持升级锁（锁的属主是身份不是号码）/`--paths` 审计范围显式+跳过路径全报（审计面与报告面同宽）/test:health 如实（靠重试撑绿=虚假健康）/夹具不邀请自身失败/pregate never silent/one Bun for install and check（校验环境与被校验环境同构） | review-methodology.md R117 段；precheck 报错面与测试卫生参照 |
| dsh-engineering-methodology R117 记档 | rc 触发点兑现全吸收：调试产物发布早拒（发布面 fail-closed）/Windows 打包默认签名（安全默认从 opt-in 翻默认）/PTC 指令组合非散文替换（组合优于改写）/未校验通知元数据保留（不吞未知字段）/终端发现按会话共享（缓存作用域=会话）/时钟钉定回归扫 Host clock distance（时间敏感测试的新维度） | dsh-engineering-methodology.md R117 记档；alpha.5→rc.2 基线对齐 |

本轮主题观察（跨运行时）：

- **计量的口径分离与连续性**（claude-mem 失败前回执≠调用计数 + codex-security 恢复不双计 + claude-code resume 成本连续）：计量不只是「计数」，还要回答「哪个口径、哪个周期」——不同观察源不互相兑换，恢复/重试不重复计也不从零计。
- **错误的第一读者是 agent**（gstack agent-ready 错误契约 + claude-code 失败点名修复命令族 + dsh 校验错误可读化）：错误输出的消费方假设正在从人转向 agent，结构化+可分级+自带下一步成为错误契约的标配。
- **组合优于改写**（dsh PTC 指令组合非散文替换 + claude-mem 工作流包装器复用既有工作流 + impeccable 选择面带图）：包装层不改写被包装物的原文/原语，拼接与引用让升级面保持可追溯。

## 三、缺陷排查与修复（本轮实抓）

1. **新增吸收文本门禁违例 3 处**（jargon 首跑 15/2 逮出，当场改写）：裸轮次标记 2 处（code-graph-tools「R116 登记」+dsh「R74 预登记/R17 先例」→去编号改现状引用）+ 变迁叙事句 1 处（review-methodology「越来越是/升为」→改现状描述「是 agent 可分级消费的契约」）——门禁有效性连续第三轮首跑即咬（R115/R116 同型）。
2. **预算断言第三十次登记**：references 拷贝体积实测 576423B 超 7079B，成因=本轮六档吸收注记增量（9 移动运行时的方法层吸收），569344→577536 登记（+8KiB 沿决策 38 冻结现状+显式余量形态）。
3. **gstack 安装面残留符号链接击穿源码包重装**：`~/.claude/skills/gstack/connect-chrome -> open-gstack-browser`（旧版安装残留）挡住新版源码包内同名目录拷贝（cp「Not a directory」）——清残留符号链接后 self-check 全绿。
4. **ecc-src.zip（37M）上传失败→已清偿（2026-10-18 重传成功）**：v20261017-src 源码包发版中 gstack（22M）/superpowers（812K）两件当日化完成；ecc 37M 经 gh CLI 四次+curl 直传一次全部 HTTP 408（Upload body timed out due to inactivity）——同日 47M 离线包可正常上传（v2.82.0 release 实证），该件为特定大附件的持续上传失败非瞬态。**影响面**：self-check install_from_src_release 的当日 tag 缺件降级路径（回退 v20261013-src 的 ecc）已实证可用（§三.3 修复时走的即降级链）；ecc 本轮零版本移动（v2.2.3 持平），降级包内容无陈旧风险。**遗留动作**：已闭合——2026-10-18 04:00 定时重试成功（gh release upload 直传，38819028B 资产在案 v20261017-src；三件源码包齐备）。
5. **run-sweep 首跑路径踩空**（流程缺陷，非产品缺陷）：`tests/run-sweep.sh` 被误呼为 `scripts/run-sweep.sh`——sweep 在 tests/ 目录（与 jargon 同目录），脚本路径记档防复发。
4. **run-sweep 首跑路径踩空**（流程缺陷，非产品缺陷）：`tests/run-sweep.sh` 被误呼为 `scripts/run-sweep.sh`——sweep 在 tests/ 目录（与 jargon 同目录），脚本路径记档防复发。

## 四、全栈回归（典型前后端项目 task-forge，React 19 首测）

样例 task-forge（/tmp/r117-sample/task-forge，npm workspaces）：**apps/api**（Express 4.21 + node:sqlite 内建 + supertest + vitest，6 基线用例）+ **apps/web**（**React 19** 函数组件+Hooks + Vite 6 + @testing-library/react + jsdom——R114 FastAPI/R115 Java/R116 Vue3 之后的前端栈第四换，react 框架门禁首次进回归面）。基线：api 6/6 + web 2/2 + build exit 0。

**生成链全绿**：detect-frameworks 4 框架全中（**react**/vite/express/jest-vitest）→ 骨架（standard 档）→ --inject-frameworks（4 框架门禁注入 sha=2344106150）→ AI 填充（arch.conf 8 框架变量含 REACT_SRC_GLOBS+VITEST_TEST_GLOBS 双扩展名并集（.test.js+.test.jsx）+ conf 目录模型 4 变量 / codebase+release+dev-guide / framework-knowledge **45 规律全带项目源码证据**（react 15+vite 10+express 10+jest-vitest 10）/ reference-manual §4§6§9 react 路径 / recipes 3 配方 / SKILL meta+decisions 3 条）→ --verify-completeness --strict 零占位 → --mark-active active（STABILITY_WARN 6 条 advisory 如实呈现：标注稳定但无同名测试文件——契约面诚实降级非阻断）。

**Task A（feature：任务按标题关键字搜索，双端全链）**：spec（AC-4+§5.5 复用约束+决策 3 条）→ TDD 双端红（api 搜索 2 用例+web 受控搜索框 1 用例，3 failed 精确命中）→ 绿（db.js listTasks 三参四分支字面量 SQL+q 类型校验 400 / client.js q 参数 encodeURIComponent / TaskList.jsx 受控搜索表单+q 依赖 useEffect）→ api 8/8 + web 3/3 + build exit 0 → precheck --all **fail 0**（11 调用/warn 4）——**门禁三连递进执法实录**：首跑拦「SQL WHERE 子句模板字符串拼接」→ 四分支字面量改写后二跑拦「LIKE 参数模板字符串近 prepare 行」→ 构造独立成行后三跑全绿；测试语义修正 1 处（type=search 的可访问角色是 searchbox 非 textbox——testing-library 语义即用户可见面）→ merge --no-ff（2b09f04）。卫生补账：git add -A 曾卷入 node_modules（样例仓无 .gitignore）→ .gitignore 补齐+解除跟踪（481fcab，R116「只读残留」同款场景再现）。

**Task B（fix：搜索/过滤守卫诊断回路）**：注入①移除 q 非字符串校验——**测试全绿不咬**（诚实发现两连：a. 原用例 `query('q[]=x')` 键名不同从未真正触达守卫，测试探针覆盖缺口，改 `.query({q:['a','b']})` 真触达；b. 守卫与下游 `q.toLowerCase()` TypeError fail-loud 冗余——数组 q 无论守卫在否都 400，守卫的独立价值=错误语义显式化（invalid search q）而非唯一防线）→ 注入②移除 STATUSES 校验（**静默型缺陷**：非法 status 静默返回空集 200）——专测「invalid value 400」**立即咬住**（1 failed 精确命中）→ 复位 8/8。

RUNTIME-OK：api 8/8 + web 3/3 + vite build exit 0 + precheck --all fail 0；npm/live CLI 双通道实测（npm view 与 gh release 一致；live claude 2.1.302/codex 0.163.0 双归零）。

## 五、实际执行记录（2026-10-17）

①基线核对（gh api releases/tags 双通道+npm view+PyPI json+live CLI 实测）→ ②基线九行+口径注+六档方法论吸收落盘 → ③三门禁：jargon 首跑 15/2（违例 3 处当场改写）→ 复跑 17/0 / self-check 预算超标第三十次登记后 RC=0 / run-sweep 全绿（见 §三.4 路径记档）→ ④全栈回归四链（生成链/Task A/Task B/构建，React 19 首测）→ ⑤v2.82.0 发版+离线安装包+源码包当日化+双实体同步+离线清单九通道复扫⑱轮。
