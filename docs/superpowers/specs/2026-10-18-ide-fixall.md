# IDE 立查立改（挂账清零）— 变更说明与决策

## 背景

2026-10-18 深度重构 P0-P3 合入后遗留五项挂账，用户指令「立查立改 应修尽修」一次性清零：非 IDE 聊天页本地媒体 401、660 补丁顺序缺陷（占位压过 `resolveImageUrl`）、自检/文件/存储/错误文案无英文对照、两个 simharness 夹具在 worktree 下解析错位、main 未推 origin。

## 范围

- 补丁：`patches/660-client-markdown-defer-local-media.patch` 重生成 v2（默认开启 + 顺序修正）。
- 客户端：`ide/i18n.ts` 双语表扩展；`selfCheck.ts`/`IdeSelfCheckDialog.vue`/`IdeFilesPane.vue`/`IdeStoragePane.vue`/`IdeCommandPalette.vue`/`ideErrors.ts` 及四个错误消费面板接入 locale；`authedMedia.ts` 新增全局重写器；`registries/client/entry.mts` 安装。
- 测试：`raci-rest-guard`/`delivery-harness-contract` 夹具改可移植根解析；双语/顺序守卫补断言。

## 行为定义

1. **媒体**：Markdown 本地图片/音频/视频默认渲染 `data-local-media` 占位（`resolveImageUrl` 属性消费方仍走原解析，顺序在前）；IDE 容器重写器带 workspace root 先行，body 级全局重写器兜底非 IDE 页面，二者以 `data-media-rewritten` 互斥。URL 不含 API key，加载走 Authorization fetch + blob。
2. **文案**：自检命令/弹层/探针标签/静态明细、文件根校验、存储缓存徽标、错误分级全部 zh/en 双语，表唯一源 `ide/i18n.ts`；动态数据（计数/路径/状态码/原始错误消息）不翻译。
3. **夹具**：`resolveSimharnessRoot` 向上找 `patches/series` 标记定位 overlay 仓库根；worktree 经 `.git` 文件反解主仓根再取兄弟 `simharness`；env `MX_SIMHARNESS_ROOT` 优先。
4. **存储热读**：实测服务端+代理 3-10ms、静默页 5-31ms（首访 169ms 含预热），200ms 目标达成，此前 0.4s 为页面并发探针争用噪声，不改代码。

## 决策记录

- D-6：DetectOptions 补 `pushStalledStaleMs` 声明（48935f58 漏型致 ts-node 拒启，服务无法启动）。理由：并行合入的检测器实现已用该字段且行为正确，缺的只是类型声明；补型零行为变更。

- D-1：660 改为默认开启而非给每个聊天宿主注入 provide。理由：401 面 covering 所有聊天页，逐宿主接线会漏；全局观察器 + IDE 容器先到先改的互斥标记兼顾两种宿主。
- D-2：`resolveImageUrl` 分支保持在占位分支之前。理由：会话工作区图片依赖该回调解析成已鉴权 URL，被占位接管会错走默认根（本轮实测发现的顺序缺陷）。
- D-3：错误/自检文案表放 `ide/i18n.ts` 而不是上游 locale 补丁。理由：上游词表属 473 单一事实源管辖，运行期覆盖走本地表是既定通道；避免为 overlay 专属文案再开 locale 补丁。
- D-4：夹具修复用 `.git` 文件反解主仓而非固定相对层数。理由：worktree 嵌套深度不固定，主树/工作树双形态都要可用；层数硬编码正是本次 ENOENT 根因。
- D-5：存储热读不改代码。理由：分项实测已达标，噪声来自测量时机而非实现；为噪声加缓存层是负收益。

## 验证

- 全量 vitest：682 文件 / 4963 通过 / 0 失败（含原两个环境态夹具转绿）。
- server tsc、vue-tsc 均 0 错。
- 双语守卫：`self-check`（EN 标签+报告头）、`ide-errors`（EN 映射）、`patches-guard`（660 v2 默认开启+顺序）。
- 实机：合并后经 clean→inject（660 v2）在 main 链复验 smoke/自检/媒体。
