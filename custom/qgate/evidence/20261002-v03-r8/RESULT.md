# v0.3 R8 门类补齐 + ia2 守门误报根治 执行结果

日期：2026-10-02
指令：用户"继续 完成所有剩余事项"（上轮记档的两边界项收口）

## 一、内容

| 项 | 落地 |
|---|---|
| ia2-i18n 既有红根治 | `ia2.flow.sortMode` 是 localStorage 存储键非文案键——守门豁免正则只认 `KEY_*` 前缀不认 `*_KEY` 后缀（如 SORT_MODE_KEY），属误报。修豁免（`custom/client/__tests__/ia2-i18n-coverage.test.ts:50`）。主树全量 **3540 passed / 1 skipped / 0 failed**（修复前 3529/1 failed） |
| R8 门类补齐（7 门，44 门全档 7/9/17/17） | conventions（include 正则×paths×severity 扫描）/ consistency 五类型（zero-sum BigInt / append-only / reconciliation SLA 分桶 / dlq / audit-chain 内核重算哈希链）/ configuration（多环境 flatten 逐键+allowedDifferences 通配+秘密明文）/ documentation（四角色制品+版本+主题）/ symbols（import 三分类+命名成员对账+alias 映射+显式豁免）/ semantic-profile（SHACL-lite：datatype/minCount/maxCount/pattern/allowedValues/min/max+targetClass 子类路由）/ behavior invariant（when 条件 skip，全 skip→skipped 诚实）+ replayBaseline（归档基线内容哈希绑定） |
| 测试 | 139 → **152**（R8 13 例 + R5 templates 断言随 vibe-fast 5→7 门更新） |

## 二、R8 首秀即逮住的三个真缺陷（守门防复发）

1. **symbols 相对导入解析锚定**：join 相对路径不锚 workspace → 全部相对导入误判 unresolved（测试逮住）。
2. **configuration 秘密值泄漏差异报文**：undeclared-difference 把秘密键值打进 evidence（§50 纪律违背）→ 改"values differ; redacted"（测试断言值不出现）。
3. **invariant when 语义旁路**：手写 switch 绕开 evaluateAssertion 的 when-skip → 复用统一断言语义。

## 三、symbol-grounding 主树首跑发现（exercised 级）

- `.claude/worktrees/` 历史残根被扫出 2782 条 → 扫描面跳过 .claude/.wxwork 根治。
- 剩余 2844 条为**真实卫生债**：overlay 根 package.json 未声明 vitest/typescript 等实际依赖（幽灵依赖）+ `@/` vite alias 词法不识。内置门降 advisory（CONDITIONAL 诚实显示不阻断 Stop），项目可配 aliases/ignoredSpecifiers；**根 package.json 幽灵依赖声明化**记档为后续独立任务（涉装机链，不在本轮范围）。

## 四、验证

- qgate 套件 152/152；tsc 零错
- 主树全量 3540/0 failed（ia2 根治后零红）
- engineering.basic-check 主树真 PASS（exit 0 + 内核重算 junit 3540 用例）
- R0 门、四档裁剪、相邻面（上轮 18/18，本轮未动 client/server 产品码——ia2 仅测试文件）

## 五、边界（如实）

- symbols 为保守词法分析：动态 import()、re-export 深链、.vue SFC 内部脚本不解析（成员对账跳过、说明符仍核）
- consistency 一次一门类型；多类型同门多 executor 声明（与上游单门六检查的形态差异）
- replayBaseline 只在 behavior cases 模式；journey 回放未做（无真实使用方，等需求）
