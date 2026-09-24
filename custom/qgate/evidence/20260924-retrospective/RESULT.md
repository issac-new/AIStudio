# 2026-09-24 复盘轮实证

## 复盘结论（修复前状态，全项实测锚定）

1. **生产事故认定**：MCP tools/list 属性子 schema 内 `required:true`（布尔）违反 JSON Schema 规范 → GLM Anthropic 兼容层 1210 全量请求失败（用户 zcode 环境被破坏）。根因是 qgate MCP server 的 toolDef()；此前"消息数撞线/bigmodel 服务端故障"两次诊断均非根因。已修（8cbcfa1，含回归测试）。
2. **虚报①**：PreToolUse/UserPromptSubmit/PostToolUseFailure 三钩 import `../core/loader.js` 解析不存在 → ERR_MODULE_NOT_FOUND 运行即崩（async 静默，从未工作）；另 plugin/hooks.json 放错位置（zcode 只认 hooks/hooks.json），六事件配置从未生效。
3. **虚报②**：§49 cache.ts 孤儿模块，run.ts 零引用（commit 84ced45 宣称"挂钩 runGate"与实际不符）。
4. **虚报③**：demo-semantic-mismatch 空目录；demo-inconclusive lint 占位 exit 0 → 实测 PASS，未演示 INCONCLUSIVE。
5. overlay 全量 111 失败与 qgate 无关（0 个 qgate 文件失败；全部为注入态守门测试在半注入 upstream 树上按设计必红，属并行 zcode-engine 会话在途状态）。

## 本轮修复（全部实测）

| 项 | 修复 | 实测 |
|---|---|---|
| P0-1 三钩子 | 重写为 stdin→opt-in→审计日志模式（与 post-tool.mjs 同款，绝不 import 编译产物相对路径）；PreToolUse 附 .qgate/ 门配置改写守卫提示；PostToolUseFailure 附证据不完整提示；删错位 plugin/hooks.json；hooks/hooks.json 六事件 | 四分支实测：门配置改写注入提醒 ✓ / 审计落盘 ✓ / 无 opt-in 静默 ✓ / hooks.log 三行 ✓ |
| P0-2 缓存接线 | runGate：cacheKeyFor（门版本+executor 面+输入锚+配置+环境）→ cacheGet 命中 markCached / miss 执行后 cachePut；cacheKeyFor 签名改整门 executor 面 | qgate-cache.test.ts 3 例：同输入二跑 cached ✓ / 输入·配置变化 miss ✓ / 缓存 FAIL 语义保持 ✓ |
| P1-3 内嵌融合 | `overlay/.qgate/`（qgate.yaml vibe-fast + 项目覆盖 basic-check advisory 档 + .gitignore 运行数据）随仓走，零 init | validate-config 无诊断 ✓；plan 命中覆盖门 ✓ |
| P1-4 demo 修复 | demo-inconclusive：项目覆盖门 executor 指向不存在二进制（真 ENOENT → INCONCLUSIVE，warn 呈现 CONDITIONAL，explain 可见 spawn failed）；demo-semantic-mismatch：semantic-demo 档 + FIBO 映射 + prd.md 混用 captured/settled | inconclusive：`CONDITIONAL — lint-result:error`，explain `spawn … ENOENT` ✓；semantic：`terminology-ambiguity[docs/prd.md]` ✓ |
| P2-5 文档真话 | README（六钩子面/§49 已接线/golden 五场景实测表/内嵌说明/init 降为可选）；设计文档状态块改写（三处虚报修正 + 事故记录） | — |

## 验证

- tsc 零错；qgate 套件 **5 文件 46/46 绿**（+3 缓存守门）
- overlay 全量维持环境态（111 注入态红与本轮无关，未触碰）
