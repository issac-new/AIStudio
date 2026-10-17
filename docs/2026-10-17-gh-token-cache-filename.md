# Spec：gh_token 缓存文件名读写统一（creds/github.token）

- 分支：`fix/gh-token-cache-filename`
- 日期：2026-10-17
- 上游：全流程推演 matrix 账号总账盘点轮（SIM_ROOT/creds/ACCOUNTS-2026-10-17.md 偏差②）

## 问题

`gh_token()`（mux/mx-lib.sh）读写文件名不一致：

- 读端：`[[ -s "$CREDS_DIR/github.token" ]]`
- 写端：`save_token github.token "$t"` ——save_token 内部拼 `.token` 后缀，落盘
  `creds/github.token.token`

结果缓存永不命中，每次调用都重新走 `git credential fill`（功能无损但缓存机制形同
虚设；且 creds 目录留下双后缀畸名文件，2026-10-17 盘点时成为误导项）。

## 修复

写端弃 `save_token` 包装，直写 `$CREDS_DIR/github.token` 并 chmod 600。读端不动。
现场 creds 文件同步迁移：`github.token.token` → `github.token`（实测 40B gho_ 前缀）。

## 验收

双路径实测（fix 分支工作态）：

1. 缓存命中：`gh_token` 输出=creds/github.token 内容（gho_QsUx… 40 字符）；
2. 回源路径：删缓存后 `gh_token` 经 git credential fill 取回同值，并直写
   `creds/github.token`（无 .token 后缀）；
3. `bash -n mux/mx-lib.sh` 语法通过。

## 决策记录

- 决策：文件名统一为 `github.token`（读端既有名），而非迁就写端改名读端为
  `github.token.token`——双后缀名是 save_token 包装的副作用，属应修的畸形态。
- 备选否决：改读端认 `.token.token`（改动同为 1 行但保留畸名，违背「单一事实源
  干净命名」）；改 save_token 支持免后缀（动公共函数影响 30+ 调用点，过度）。
- 裁定路径：用户 2026-10-17 指令「处理偏差」；盘点正本=SIM_ROOT/creds/
  ACCOUNTS-2026-10-17.md 偏差②。
