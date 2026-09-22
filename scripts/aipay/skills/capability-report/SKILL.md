---
name: capability-report
description: 收到能力/清单查询指令时，读取本机 machine-manifest.json 并如实上报本机 hermes 的 kanban、teams、teams 下 agent 及能力、主责应用清单
---

# Capability Report（能力上报）

## 触发

当 matrix 消息中包含「能力查询」「上报清单」「capability report」类指令，且发送方在
允许清单内时，执行本流程。收到其他内容不要使用本技能。

## 流程（严格按序）

1. 读取本机清单文件：`$HERMES_HOME/machine-manifest.json`
   （即本 profile 所在 hermes home 根下的 machine-manifest.json）。
2. 读取本机 kanban 当前任务摘要：调用 kanban CLI（`hermes kanban list`）或读取
   manifest 中的 kanbanEndpoint（GET，无需登录的本机回环接口可用时）。
3. 组装上报报文，格式固定为：

```
【能力上报】<owner>
机器: <machine>
角色: <roles>
团队: <team>（lead: <leader>）
agent 清单:
- <agentId>: <capabilities 逗号分隔>
主责应用(csw-*): <apps 或无>
kanban 在途: <n> 项（triage x / running y / review z / done w）
```

4. 将报文回复到查询指令所在的房间/线程。禁止编造 manifest 中不存在的
   agent 或能力；kanban 读取失败时如实写「kanban 读取失败:<原因>」。

## 纪律

- 只上报本机事实，不代其他机器回答。
- 一条查询只回复一次；同一房间 10 分钟内重复查询，回复「已上报，无变化」。
