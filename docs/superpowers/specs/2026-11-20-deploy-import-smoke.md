# 部署后导入冒烟：宿主版本错配守卫

> 日期：2026-11-20
> 状态：实施中（用户指令「完成剩余残留事项」）
> 来源：2026-11-19 全量 clean+inject 把宿主 48 个更新版 patch 面文件换成旧 vendor 版，网关连续 ImportError 崩溃的实锤
> 关联：`2026-11-19-scheduling-intelligence-wiring.md`、`2026-11-20-judge-anthropic-live-enable.md`
> 读者：维护 runtime 部署、执行 `npm run inject` 的运维与开发

## 变更

### 问题

`deploy-agent-runtime.mjs` 的补丁触碰面默认「源=vendor 注入态=权威」，会备份后覆盖宿主差异。当宿主运行时比钉版 vendor 新（本轮为 0.23.2+7 vs 0.23.2）时，覆盖 48 个文件后宿主出现新旧混装：`gateway/config.py` 是新版、`shutdown_watchdog.py`/`kanban_watchers.py` 被换旧，`import gateway.run` 直接 ImportError，网关崩溃；而部署本身只报 `partial`，没有发现运行时已不可导入。

### 范围

**修改**

- `scripts/deploy-agent-runtime.mjs`：apply 完成后，若目标树同时存在 `.venv/bin/python` 与 `gateway/run.py`，执行 `python -c "import gateway.run"` 冒烟。失败则 `smokeFailed=true`，末行 `RESULT status=failed`、exit 1，并打印备份回滚提示（`*.bak.<stamp>`）。`RUNTIME_DEPLOY_SKIP_IMPORT_SMOKE=1` 可关断（测试隔离）。
- `scripts/__tests__/deploy-agent-runtime.test.ts`：新增成功/失败两例（假 `.venv/bin/python`）。

**不做**

- 不自动回滚：失败时只 fail-loud + 给备份路径，避免脚本猜测回滚范围；回滚由人按 `.bak` 决定。
- 不改补丁触碰面的默认覆盖语义（N-1 防预检死锁仍需要它）；冒烟是事后安全网，不是阻止覆盖。
- 不做版本号比较：宿主版本来源（git describe/stamp）不稳定，导入冒烟是更直接的兼容性事实。

### 验收判据

1. 目标有 venv+gateway 且导入成功：输出 `import smoke: gateway.run imports`，`status=complete`。
2. 导入失败：输出 `import smoke failed` + 回滚提示，`RESULT status=failed`，exit 1。
3. 目标不是完整安装树（无 venv/gateway）：不跑冒烟，行为不变。
4. 既有 deploy 测试 8 例保持绿；新增 2 例通过。

## 任务卡

### 完成条件

部署完成后能机械发现「宿主运行时不可导入」，不再把错配报告成功。

### 输入与来源

目标树的 `.venv/bin/python`、`gateway/run.py`；部署备份 stamp。

### 工作流边界

只加部署后检查；不改注入顺序、不改补丁内容、不改 host 文件策略。

### 工具与副作用

调用目标树 python 做一次只读 import；不执行网关、不写业务数据。失败不自动改文件。

### 结果与证据

`RESULT status=failed` + stderr 末尾 3 行 + 备份目录；成功打印 `import smoke`。

### 异常与恢复

python 缺失/超时（120s）按 failed 处理；回滚按 `*.bak.<stamp>` 整批恢复；确认宿主与 vendor 版本后重跑或走定向 manifest。

### 验收反例

导入失败仍报 complete 应失败；无 venv 的目标不应误跑冒烟；`RUNTIME_DEPLOY_SKIP_IMPORT_SMOKE=1` 应跳过。

## 决策记录

### D1 只在「像安装树」时冒烟

条件=`.venv/bin/python` 与 `gateway/run.py` 同时存在。测试临时目录/普通目标不会触发，避免误报。

### D2 失败不自动回滚

自动回滚需要判断哪些文件属于本次触碰面、哪些是宿主有意保留；猜错会扩大事故。脚本给出备份 stamp 与回滚提示，由人执行（与 2026-11-19 实际处置一致）。

### D3 允许测试关断

`RUNTIME_DEPLOY_SKIP_IMPORT_SMOKE=1` 仅用于测试隔离；生产不设。

### D4 冒烟是安全网，不是替代版本治理

宿主比 vendor 新时仍应做 vendor 升级/回灌模板；冒烟只保证错配不会静默通过。

## 验证

```sh
npx vitest run scripts/__tests__/deploy-agent-runtime.test.ts
```

结果：**10 passed**（既有 8 + 冒烟 2）。

未覆盖：真实宿主导入（本轮已在宿主手工验证并回滚）；超时路径（120s）无独立用例。

## 设计文档影响

DESIGN_SYNC: none

理由：部署脚本增加事后检查，不触及整合正本、数字总账或架构图；行为边界以本 spec 与脚本注释为单一事实源。
