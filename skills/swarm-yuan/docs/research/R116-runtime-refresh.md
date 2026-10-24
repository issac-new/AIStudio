# R116 运行时例行刷新轮（2026-10-16）

> 触发：用户 /goal 三目标（research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版）。口径同 R115 例行轮。轮号位 R116。

## 一、移动面（4 移动 / 1 薄记 / 16 零移动）

| 运行时 | R115 基线 | 远端最新 | 判定 |
|---|---|---|---|
| claude-code | npm 2.1.300 | npm **2.1.301**（live CLI 同步 2.1.301 实测） | **移动**（1 patch 修复批） |
| codex | rust-v0.162.1 | **rust-v0.163.0**（0.163 线转正，此前全 alpha 不取） | **移动**（1 minor） |
| impeccable | v4.1.1 | **cli-v4.6.0**（=skill-v4.6.0；4.1.1→4.6 跨 5 版） | **移动**（大跨度） |
| mattpocock-skills | main 49dd158 | **v1.3.1**（tag 面） | **移动**（tag 面形式化；R114 已注明 49dd158=v1.3.1+1 提交，镜像内容零移动） |
| semantica | tip 815527cc | tip ca6c9f191 | 薄记（tag 面 v0.7.0 维持零移动，tip 漂移照 R115 先例记档） |
| openspec 1.14.2 / comet 0.4.5 / GitNexus 1.6.12 / gsd-core 1.17.0 / claude-mem 13.39.0 / ocr 1.13.0 / graphify 0.9.91（GitHub tag）/ superpowers 7.0.0 / ruflo 3.56.10 / ECC 2.2.3 / codex-security 0.3.0 / pua 3.5.1 / dsh alpha.4 | — | 均在最新（核对时点） | 零移动（**勘误**：dsh 同日后出 alpha.5、graphifyy PyPI 通道 0.10.0——upstream-baseline 行内勘误补记，见 §三.4） |
| gstack | tag v1.87.5.0 + tip 47d639ab | tip 47d639ab | 零移动（tip 面） |
| gitnexus | 1.6.12 | 1.6.13-rc.112 全 rc 不取 | 零移动 |
| better-harness | 0.6.6 | npm 0.0.0（占位）/ 0.7.0 全 alpha 不取 | 零移动 |

npm/live CLI 口径：`npm view @anthropic-ai/claude-code` 2.1.301 与 GitHub release 一致；live `claude --version` 2.1.301、`codex --version` 0.162.1（0.163.0 已发未装，基线面先升版）。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| codex-methodology R116 段 | 只读面并行（并行边界划在读写侧）/权限校验先于 DNS 解析（门禁先于解析第三实证）/线程恢复还原权限态（权限态=会话态）/取消完备性（动态工具生命周期取消路径也执行） | codex-methodology.md 版本节；任务路由检索聚合与安全门禁宿主参照面 |
| claude-code-capabilities R116 薄记 | Grep/Glob 失败与零命中分离——失败≠空集，结果词表诚实化第二实证；跳步不报成功；换小上下文模型先问后花 | claude-code-capabilities.md v2.1.301 节 |
| frontend-design-methodology R116 段 | **检测面=真实可见面**（误报清剿对齐渲染态/对比度读真实背景/native 无扫描面≠通过）+选择面永远带图+实证收窄图片生成+选中项固化基准+遥测退出彻底性+用户级 hook 不进项目仓 | frontend-design-methodology.md §十三A；G13 存在性断言锚 |
| mattpocock-skills 基线行 | tag 面形式化（内容零移动，无新机制原语） | upstream-baseline.md 行内登记（R115 semantica 先例同构），不开档 |
| semantica 薄记 | tip 前移修复批无新机制原语 | upstream-baseline.md 行内登记 |

本轮主题会师（跨运行时观察）：

- **门禁/校验先于解析**（codex 权限先于 DNS + dsh R115 宿主版本三连 + swarm-yuan 既有「先查再写」族）：由解析或推断产物派生的状态不进入已放行面；判定点前移到副作用发生前。第三实证。
- **失败态与空态分离**（claude-code Grep/Glob 搜索失败报错不报无匹配 + codex-security R115 退出码三值化 + impeccable「空 web 扫描≠native 通过」）：不可判定/无扫描面不得伪装成可判定的空态/通过态。三仓同向。
- **恢复的完整性清单**（codex resume 含权限与网络批准 + claude-mem R112 子代理线程记忆时间线恢复）：会话恢复不只得恢复消息——权限态、记忆态、批准态都在清单上，缺一面=恢复面越权或降权。
- **取消是正常路径**（codex 动态工具生命周期取消时完成 + 打断传播嵌套调用链）：清理钩子对取消完备，嵌套任务不留孤儿。

## 三、缺陷排查与修复（本轮实抓）

1. **新增吸收文本门禁违例 5 处**（run-sweep 首跑 test-r68-jargon-free 逮出，当场改写为现状描述）：禁用自造词「三值化」「会师」×2（claude-code-capabilities / codex-methodology）+ 裸轮次标记 R116/R115 ×4（两档版本节头与交叉引用）——门禁有效性的又一次无意识变异测试（连续第二轮首跑即咬，R115 同型）。
2. **预算断言第三十次登记**：references 拷贝体积实测 568043B 超 2795B，成因=本轮三档吸收注记增量（codex-methodology/claude-code-capabilities/frontend-design §十三A——4 移动运行时的方法层吸收），569344 登记（+4KiB 沿决策 38 冻结现状+显式余量形态）。
3. **基线核对时点差勘误两处**（发版后复核实抓）：dsh 同日新出 alpha.5（核对时点后发布）/ graphifyy PyPI 通道 0.10.0（GitHub tag 口径 0.9.91 持平，npm/pip 通道面超前）——upstream-baseline.md 两行内勘误补记，吸收档仍锚 alpha.4 变更面（tag 口径吸收随下轮）。
4. **swarm-yuan 宿主侧（ncwk 轮联动，非本仓缺陷）**：v0.7.36 升级轮 apply.sh pipefail 假死（grep 空匹配退出 1 × set -o pipefail）——守卫管道补 `|| true` 根治（见 ncwk overlay 升级 spec D4）。

## 四、全栈回归（典型前后端项目 task-forge）

样例 task-forge（/tmp/r116-sample/task-forge，npm workspaces）：**apps/api**（Express 4.21 + node:sqlite 内建 + supertest + vitest）+ **apps/web**（Vue 3.5 SFC script setup + Vite 6 + @vue/test-utils + jsdom）。基线：api 5/5 + web 4/4 + build exit 0。

**生成链全绿**：detect-frameworks 4 框架全中（vue/vite/express/jest-vitest）→ 骨架（standard 档）→ --inject-frameworks（4 框架门禁注入 sha=3062809090）→ AI 填充（arch.conf 17 框架变量+conf 目录模型 5 变量 / codebase+release+dev-guide / framework-knowledge 45 规律全带项目源码证据 / reference-manual §4§6§9 / recipes 3 配方 / SKILL meta+decisions 3 条）→ --verify-completeness --strict 零占位 → --mark-active active（STABILITY_WARN 5 条 advisory 如实呈现：装配/入口文件标注稳定但无同名测试——契约面诚实降级非阻断）。

**Task A（feature：任务按状态过滤，双端全链）**：spec（AC-4+§5.5 复用约束+决策 2 条）→ TDD 双端红（api 过滤用例 1 failed / web 下拉用例）→ 绿（db.listTasks(db,status)+路由 400 语义+client.list(status)+TaskList select）→ api 6/6 + web 5/5 + build exit 0 → precheck --all **fail 0**（18 ✓ / 4 warn）——**门禁三连递进执法实录**：首跑拦「master 保护分支开发+只读目录 dist 改动+spec 缺 §5.5 字面段」→ 二跑拦「只读残留（node_modules 仍跟踪）」→ 三跑拦「基线卫生（解除跟踪混特性分支）」→ 卫生归 master+feat rebase 后四跑全绿 → merge --no-ff（4980a03）。

**Task B（fix：状态守卫诊断回路）**：注入①WHERE compare-and-set 竞态守卫移除——**测试全绿不咬**（诚实发现：竞态纵深防御面需并发测试才可验，测试缺口记档）；注入②TRANSITIONS 语义守卫移除——专测立即逮住（transition guard 用例 1 failed 精确命中）→ 复位 6/6。

RUNTIME-OK：api 6/6 + web 5/5 + vite build exit 0 + precheck fail 0；npm/live CLI 双通道实测（npm view 与 gh release 一致）。

## 五、实际执行记录（2026-10-16）

①基线核对（gh api releases/tags 双通道+npm view+live CLI 实测）→ ②五行基线+头注+三档方法论吸收落盘 → ③三门禁：run-sweep 首跑 64/2（jargon 5 处违例当场改写+self-check 预算第三十次登记）→ 复跑 65/1→jargon 修后 17/0（self-check 已单跑 rc=0）→ 终态复跑全绿收口 → ④全栈回归四链（生成链/Task A/Task B/构建）→ ⑤v2.81.0 发版+离线安装包。
