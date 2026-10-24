# terraform fixture 说明

- violating 主触发 5 个 fail 意图：
  - fw_terraform_state_in_git —— 扫描树内出现 `*.tfstate*` 文件，或 .tf 含 `backend "local"` → fail。
  - fw_terraform_hardcoded_secret —— .tf/.tfvars 剥注释后命中密钥属性=字符串字面量，或敏感 variable 块带非空 default → fail。
  - fw_terraform_sg_open_world —— awk 跟踪 ingress 块：块内 22/3389/0 端口与 0.0.0.0/0 共现 → fail。
  - fw_terraform_s3_public —— `acl = "public-*"` 命中 → fail。
  - fw_terraform_rds_public —— `publicly_accessible = true` 命中 → fail。
- 断言登记：**5/5 主触发已断言**（2026-08-26 实跑登记，见 violating/expected-fail-ids）。
- 反模式：violating 侧复现上述 5 条 fail 门禁命中场景；compliant 侧以对应修复（配置/代码修正）消除命中。
- 门禁无沉睡：声明的 fail 门禁全部命中，无需唤醒修复。

## violating vs compliant 差异
- violating：5 条 fail 门禁命中（详见 violating/ 下文件与 expected-fail-ids）。
- compliant：消除上述 fail 命中（对照 compliant/ 下等价文件）。
- 验收：`bash swarm-yuan/tests/run-framework-fixture.sh terraform` 双态绿（violating 检出 / compliant PASS）。
