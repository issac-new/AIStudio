# flask fixture 说明

- violating 主触发 3 个 fail 意图：SECRET_KEY 硬编码 / app.run(debug=True) / 连接 URI 明文凭据。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_flask_db_credentials`、`fw_flask_debug`、`fw_flask_secret_key`）。
- 2026-07-20 P1-B6 沉睡门禁唤醒：`fw_flask_secret_key` 原正则
  `(secret_key|SECRET_KEY)["'\]]*[[:space:]]*=` 中 `\]` 位于括号表达式内，
  POSIX 下反斜杠为字面量，字符类被解析为 `["'\]` + 字面 `]`，
  致 `app.secret_key = "..."` 属性赋值形式永不命中（门禁沉睡）。
  修复：`["'\]]*` → `[]"']*`（`]` 置首为字面，同 T6 spring-boot 手法）。
- 对照证据（合成样本 `app.secret_key = "hardcoded-flask-secret-key"` /
  `app.config["SECRET_KEY"] = "hardcoded"` / `app.config['SECRET_KEY'] = 'hardcoded'`）：
  修复前 BSD 与 GNU grep 均仅命中 config 下标两种形式、漏属性赋值形式；
  修复后两平台均命中全部 3 行、结果逐字节一致；
  `os.environ`/`getenv` 行仍被下游 `grep -vE` 过滤（判定语义不变，仅消除漏检）。
