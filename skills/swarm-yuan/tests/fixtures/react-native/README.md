# react-native fixture 说明

- violating 主触发 2 个 fail 意图：
  - fw_react_native_webview_no_whitelist —— 剥注释后同文件命中 `<WebView` + `https?://` 且无 `originWhitelist` → fail。
  - fw_react_native_asyncstorage_secret —— `AsyncStorage.setItem(` 行首 60 字符内含敏感 key 语义（token/password/secret 等，大小写不敏感）→ ...。
- 断言登记：**2/2 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 2 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：2 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh react-native` 双态绿（violating 检出 / compliant PASS）。
