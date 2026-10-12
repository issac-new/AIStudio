---
name: coding-delegate
description: 编码实施委托外部编码引擎（ACP 后端 L1 通道）——任务书标注「编码后端=delegate」时使用；委托者负责契约拆解/diff 评审/集成，引擎负责实现
---

# coding-delegate（ACP 编码后端 · L1 技能委托通道）

## 何时用
任务书含「编码后端=delegate」。此模式下你不直接手写实现代码——实现由外部编码引擎执行，你承担工程师的契约与评审职责。

## 流程（四步，缺一即未完成）
1. **契约拆解**：读概设契约段+任务书验收口径，写一段给引擎的实现指令（模块路径/接口签名/边界/测试要求/禁改清单）。
2. **委托执行**：在任务 workspace 内调用本技能自带驱动（引擎=Ycode，`zcode-acp-server` stdio 桥），全程留痕。技能目录=skill_view 返回的 `_source_path` 所在目录。引擎实跑常超 10 分钟，**超出工具层单调用 ~300s 上限（run17-lite 实锤：前台直跑在 313s 被杀、引擎进度被拦腰斩断）——必须后台脱离执行+轮询收 RESULT，禁止前台直跑**：
   ```bash
   mkdir -p materials
   nohup python3 "<技能目录>/scripts/zcode-acp-delegate.py" --cwd . --timeout 1800 @materials/delegate-instruction.txt \
     >> materials/delegate-log.txt 2>&1 &
   # 之后每 1-2 分钟轮询一次：tail -n 3 materials/delegate-log.txt
   # 末行「RESULT exit=0」=引擎收工，进 diff 评审；轮询是快命令，不会撞超时天花板
   ```
   实现指令先写入 `materials/delegate-instruction.txt` 再用 `@` 传参（免转义）。退出码语义见驱动头部注释：0=成功；2=引擎不可用；3=超时；4/5=协议错误/引擎早退。重托=改指令文件后同法再跑（日志同文件追加）。
3. **diff 评审**：`git diff` 逐文件审引擎产物——契约偏差/越界改动/缺测试即打回重托（重托日志同文件追加）。
4. **集成收口**：分支提交（含 testlog 与 materials/delegate-log.txt）、结论行照常。

## 硬约束
- 委托日志 `materials/delegate-log.txt` 必须随分支提交——它是"已走后端"的唯一指纹（末行含 `RESULT exit=`），缺失=G3 承载面记单。
- 引擎不可用（CLI 缺失/超时 2 次）→ 如实报 BLOCKED 并说明，禁止 silently 回退手写冒充委托。
- 驱动不代行人工确认：引擎弹权限请求时驱动一律 cancel（无人值守委托会话按 yolo 档自足），需要确认即视为委托失败走重托/BLOCKED。
- 禁改清单里 upstream/ 与他人任务文件对引擎同样生效（写进实现指令）。
