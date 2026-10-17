# 2026-10-18 简报判死只认 404（getTask 瞬时故障不误判 ghost）

## 问题

ec197f54（回归轮 R7 二修）给 `IdeShell.resolveBriefingCrossBoard` 加了 getTask 前置快判：
catch 一刀切——任何失败都 `return` 交外层 `briefingMiss` 收抽屉。服务端瞬时 5xx、
网络抖动、网关重启窗口都会把**存在的任务**伪装成「任务不存在」，抽屉被收起且
逐板解析根本不启动（任务在他板时用户完全看不到简报）。

## 根因

快判路径没有区分「确认不存在」与「暂时查不到」两类失败。客户端 request 包装
（packages/client/src/api/client.ts:301）抛错带 `status` 属性
（`Object.assign(new Error('API Error 404: …'), { status })`），判别信息现成可用。

## 修复

`custom/client/ide/views/IdeShell.vue`：catch 里只认 404
（`status === 404` 或消息含 404/not found——兼容测试裸 Error('404') 形态）才判死；
其余失败落回原逐板 listTasks 流程（慢但保真，解析不到仍交空态）。

## 验证

- briefing-cross-board 新判别用例：getTask 抛 `status:500` 时任务照常命中他板、
  切板回填（旧行为下该用例红——判死即止不会调 listTasks）。
- 定向 10/10 绿（briefing 两文件，含既有 R7 快判死/判死后手动重开用例）。

## 决策记录

1. **判死口径=只认 404**（用户「继续完成所有」指令收口观察项②）。备选「全部
   失败都判死」被否：瞬时故障伪装成不存在是错误答案，宁可慢一拍走逐板保真。
2. **消息正则兜底 `\b404\b|not found`**：服务端快 404 闸与控制器 404 双路都命中；
   测试 mock 常用裸 `Error('404')`，无 status 属性，正则保证两形态都判死。
3. **不做重试退避**：外层 476 行 watch 已有「抽屉打开即重试 resolveBriefingTask」
   兜底，快判路径不叠加退避逻辑（保持函数单一职责）。
