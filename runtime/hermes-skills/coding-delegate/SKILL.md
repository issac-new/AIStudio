---
name: coding-delegate
description: 编码实施委托外部编码引擎（ACP 后端 L1 通道）——任务书标注「编码后端=delegate」时使用；委托者负责契约拆解/diff 评审/集成，引擎负责实现
---

# coding-delegate（ACP 编码后端 · L1 技能委托通道）

## 何时用
任务书含「编码后端=delegate」。此模式下你不直接手写实现代码——实现由外部编码引擎执行，你承担工程师的契约与评审职责。

## 流程（四步，缺一即未完成）
1. **契约拆解**：读概设契约段+任务书验收口径，写一段给引擎的实现指令（模块路径/接口签名/边界/测试要求/禁改清单）。
2. **委托执行**：在任务 workspace 内调用引擎 CLI，全程留痕：
   ```bash
   claude -p "<实现指令全文>" --allowedTools "Read,Write,Edit,Bash(npm:*),Bash(npx vitest:*)" \
     --permission-mode acceptEdits 2>&1 | tee materials/delegate-log.txt
   ```
3. **diff 评审**：`git diff` 逐文件审引擎产物——契约偏差/越界改动/缺测试即打回重托（重托也 tee 追加同一日志）。
4. **集成收口**：分支提交（含 testlog 与 materials/delegate-log.txt）、结论行照常。

## 硬约束
- 委托日志 `materials/delegate-log.txt` 必须随分支提交——它是"已走后端"的唯一指纹，缺失=G3 承载面记单。
- 引擎不可用（CLI 缺失/超时 2 次）→ 如实报 BLOCKED 并说明，禁止 silently 回退手写冒充委托。
- 禁改清单里 upstream/ 与他人任务文件对引擎同样生效（写进实现指令）。
