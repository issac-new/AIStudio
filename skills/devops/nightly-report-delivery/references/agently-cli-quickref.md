# agently-cli 发信速查（agent mail = your-bot@example.com）

## 账户与限额

- 身份确认：`agently-cli +me` → `aliases[].email`（is_primary）+ `rate_limits`。
- 限额：日 50 封 / 时 200 次 / 分 10 次；附件单件与总计均 20MB；body ≤1MB UTF-8；单封附件 ≤50 个。
- 认证失效走 `agently-cli auth refresh`（`auth login` 是交互式，无人值守会话不可用）。

## 发信（两阶段确认）

```bash
cd <报告所在目录>   # --body-file / --attachment 只收 cwd 子树内相对路径
agently-cli message +send --to your@example.com \
  --subject "…" --body-file report.md --body-format plain
# 首调返回 data.confirmation_required=true + confirmation_token
agently-cli message +send --to your@example.com \
  --subject "…" --body-file report.md --body-format plain \
  --confirmation-token <token>
```

- 两次调用参数必须**逐字节一致**——内容一变即 `Request content modified` 拒发，token 作废重来。
- 程序化发送（python subprocess）：首阶段解析 stdout JSON 取 `confirmation_token`；若首阶段 data 无 `confirmation_required` 视为已单阶段发出；二阶段校验 stdout JSON `ok==true` 才算成功。
- `--dry-run` 只打印 API 调用不执行；`--print-output-schema` 打印返回字段。调参数前先 dry-run。
- 正文 Markdown 自动检测格式；纯文本强制 `--body-format plain`。

## 送达验证

```bash
agently-cli message +list --dir sent --limit 3
```

查 `from`=your-bot@example.com、`subject`、`has_attachments`。收件箱侧用 `--dir inbox --is-unread`。

## JSON 解析纪律（避坑）

- **CLI JSON 输出落盘再解析，不要 `agently-cli … | python3 -c`**：管道直进解释器触发安全扫描拦截；且 pipeline 的 rc 取的是末位命令，`rc=0` 不代表 CLI 成功。
- 模式：`agently-cli … > /tmp/out.json 2>&1` 后 python `json.load`；list/read 的条目数组在 `data.data[]`。

## 编程封装参考实现

- 雷达/域/[已移除] 多 prefix 分型 + PDF 附件：`life-workbench/scripts/send_report_email.py`
- evo-nightly 晨报最小实现（两阶段 + SMTP 显式回退）：`~/.hermes/evo/evo_send_email.py`
