# RunTraceView 部署笔记

## 部署时间
2026-06-28 16:56（初版）
2026-06-29 08:15（AgentScope 理念吸收 + 入口修正）

## 最新改进（2026-06-29）

### 入口修正
- TopBar 新增 ⚡ Run Observatory 全局入口按钮
- Timeline 双击 run 事件改为显示详情（不再触发 RunTrace）
- 时间轴 Scrubber 组件支持 Live/Replay 双模式拖动

### AgentScope 理念吸收（4 Phase）
- Phase 1: 统一事件契约（TraceEvent 判别联合 + normalizeRunEvent）
- Phase 2: 中间件钩子链（TraceMiddleware + 6 个默认中间件，可组合注入）
- Phase 3: 状态变更追踪（STATE_UPDATED 事件 + stateChangeMiddleware）
- Phase 4: OTel 语义规范对齐（otel_formatter.py + 双格式输出）

## 部署结果

### Layer 1 (纯前端)
- ✅ Evidence Graph 组件完整
- ✅ Socket.IO 事件订阅正常
- ✅ 283 tests 全部通过

### Layer 2 (Hermes-Agent Plugin)
- ✅ 插件安装位置: `~/.hermes/plugins/run-trace/`
- ✅ 配置启用: `plugins.enabled: [run-trace, hindsight, memtensor]`
- ✅ JSONL 输出目录: `~/.hermes/traces/` (运行时自动创建)

### Layer 3 (Koa API)
- ✅ Endpoint: `GET /api/hermes/sessions/:id/trace`
- ✅ Patch 114 正确注入
- ✅ Controller 可访问: `server/src/custom/controllers/hermes/trace.ts`

### Layer 4 (Export)
- ✅ 导出按钮已集成到 modal
- ✅ JSON dossier 格式完整

## 验证命令

```bash
# 检查 plugin 文件
ls ~/.hermes/plugins/run-trace/

# 检查配置
grep -A4 "^plugins:" ~/.hermes/config.yaml

# 检查 API 路由
grep -n "traceRoutes" ../upstream/hermes-studio/packages/server/src/routes/index.ts

# 运行测试
npm run test -- custom/client/cockpit

# 构建
npm run build
```

## 使用流程

1. **重启 hermes-agent** 使 plugin 生效
2. **运行一个 task**，plugin 自动写入 JSONL
3. **打开 Cockpit** → Timeline → 双击 run 事件
4. **查看 Run Observatory** modal
5. **导出证据档案** 点击 📥 按钮

## 文件清单

### 新增文件 (overlay)
```
custom/hermes-agent-plugins/run-trace/
├── plugin.yaml          (465 bytes)
├── __init__.py          (13.9 KB)
└── README.md            (2.5 KB)

custom/server/controllers/hermes/trace.ts (9.8 KB)

custom/client/cockpit/
├── adapters/run-trace-adapter.ts  (+fetchLayer2Trace, mergeLayer2Data)
├── composables/useRunTrace.ts     (+l2Available, fetchL2Data)
├── components/
│   ├── CockpitRunTraceModal.vue   (+exportDossier, L2 badge)
│   ├── RunTraceGraph.vue
│   ├── RunTraceTimeBand.vue
│   ├── RunTraceInspector.vue
│   └── RunTraceSkillDrilldown.vue

patches/114-server-trace-api.patch (新增)
```

### Git commits
```
feat(layer2): add hermes-agent run-trace observability plugin (a0eb5ad)
feat(layer3): add Koa trace API endpoint (372c981)
feat(layer3): frontend integration for L2 trace data (6dceb9c)
feat(layer4): add evidence dossier export (21c8339)
Merge branch 'feat/run-trace-view' (da63aeb)
```

## 注意事项

1. **Plugin fail-open 设计**: 如果 `~/.hermes/traces/` 不可写，hooks 不报错
2. **L1/L2 数据合并**: 前端自动升级 evidence tier，不丢弃任何数据
3. **Patch order**: 114 在 036 之前，避免 hunk 冲突

## 后续工作

- [ ] 实际运行 hermes-agent 测试 JSONL 输出
- [ ] 端到端测试: run → JSONL → API → frontend
- [ ] 添加 memory hook (当前仅 tool/API/subagent)
- [ ] Peer trace propagation (Layer 3 L3 补齐)
