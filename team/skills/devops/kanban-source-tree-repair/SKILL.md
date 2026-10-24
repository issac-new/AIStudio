---
name: kanban-source-tree-repair
description: "Use when kanban transitions fail from missing modules."
tags: [kanban, dispatcher, crash, update-drift, orchestrator, hermes-source]
---

# Kanban 卡收尾被源码树故障阻塞时的修复

## 铁律一：先定类再说话

`blocked` 的 reason 文本是定性证据，按形状分三类，**禁混**：

| reason 文本形状 | 类 | 回复用户时不能说 |
|---|---|---|
| 代码组件/模块缺失、import 失败 | 源码树故障 | ❌「回复批准即可解锁」——批准不装模块 |
| 需要人工判断/授权/凭据 | 真审批门 | ❌ 谎称环境损坏 |
| parent 未 done | 依赖门 | ❌ 自行改 parent 状态 |

## 机制：惰性 import 决定了故障只在收尾暴露

调用方常在函数体内 import，被 update 刷成新版后整文件漏落盘。启动路径不碰这段代码，worker 可跑完并写产物，到写库才抛错；因此**卡 blocked 不等于任务没做**。

## 取证三步

1. 找调用点：`grep -rn "<模块名>" --include=*.py ~/.hermes/hermes-agent`
2. 判是否漏文件：`git -C ~/.hermes/hermes-agent ls-tree HEAD <pkg目录> | grep <模块名>`
3. 找 shim：`find ~/.hermes -name "<模块名>.py"`

## 修复序列

1. `read_file` 读 shim，判占位实现还是完整逻辑。
2. 完整 → 拷回源码树；占位 → 拷回但在 commit 与 comment 标注临时件，并登记补全项。
3. `git add` + commit；**先 commit 再重启 gateway**。
4. 同款 worker 冒烟：`hermes -p <assignee> --cli --accept-hooks chat -q "回复ok"` → exit 0。

## 处置顺序

先核产物：`ls -la <产物路径>`，再读 worker comment 的 `changed_files` / `artifacts`。产物齐全即任务实质完成；修复后重发 complete，不要整卡重派。

## 陷阱：pass-through shim 静默拆门

把占位 shim 写进源码树等于静默拆掉 flow-gates。还原时必须标注临时并登记补全，不能宣称环境已完整修复。
