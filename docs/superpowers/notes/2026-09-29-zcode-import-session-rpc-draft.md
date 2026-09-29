# zcode importSession RPC 引擎补丁草稿（遗留清单 L8 / #22 写入面）

状态：**草稿——未进 zcode-patches series、未 inject 验证**（引擎补丁需完整 inject 重放链，共享树并行活跃期不做；本稿供下轮直接落地）。

## 引擎侧改动点（upstream/zcode）

1. `packages/shared/src/zcode-protocol-v4/command.ts`：V4_METHODS 增 `importSession: 'import/session'`；result schema 增 `importSessionResultSchema`（z.object({ sessionId: z.string(), rowsWritten: z.number().int() })）。
2. `packages/services/src/zcode-agent/zcodeAgentService.ts`：增方法
   ```ts
   async importSessionV4(params: { workspacePath: string; source: 'codex'|'kimi'|'claude'; sourceId: string; rows: Array<{ role: 'user'|'assistant'|'tool'; text: string; at: number }> }) {
     // 复用 claude-native 管线的写入半边：persistImportedClaudeTask/buildImportedClaudeTaskFile
     // 的归一化入口泛化（rows 已归一化，source 仅作元数据标记）。
   }
   ```
   写入实现锚点：`packages/services/src/session/claude-native/persistImportedClaudeTask.ts`（引擎内已有 claude 导入落盘管线；泛化接收归一化行）。
3. 引擎侧不做三源解析（codex/kimi 解析在 overlay session-importer——归一化行经 RPC 传入）。

## overlay 侧（已落，本批）

- REST：`GET /api/zcode-engine/import/history-preview`（解析预览：三源 JSONL→归一化行+坏行）；`POST /api/zcode-engine/import/history`（写入——**当前返回 501** 引擎 RPC 未开，前端如实报错）。
- UI：IdeImportHistory（ChatPane 工具卡区：选源+路径+预览+导入按钮）。

## 下轮落地序列

1. 按上稿改 upstream/zcode → zcode-patches 增补丁进 series → clean+inject 重放验证
2. engine-bridge 接口加 importSessionV4 声明
3. engine-controller POST /import/history 接真写入 → UI 全链走查
