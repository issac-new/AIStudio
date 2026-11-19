# KEV 情报：Check Point 双 9.8（2026-09-22 checkpoint）

- 标签: kev-checkpoint
- 概括: Check Point 网关伪造证书 RCE + 管理面路径穿越 root 双 9.8，附 IOC 与利用链四步
- 类型: fact
- 日期: 2026-10-04（2026-11-02 自 INDEX.md intel 节迁移至三字段格式，语义未改）

## 完整打法

（gap-20260926-001 / t_e4f24f79）

- CVE-2026-85102（CWE-295, 9.8）Check Point 网关 VPN 证书校验 RCE — SK1000117；
  09-12 起攻击波, IOC: 伪造证书 Subject CN=vpn/CN=vpn-user/CN=vpnuser (OU=users, O=global)
- CVE-2026-93616（CWE-22, 9.8）管理面 pre-auth 路径穿越→root — SK1000171；
  07-23 起零日利用 2 个月；2026-10-01 Bishop Fox 公开 TCP/19009 /cpmws/ loginNew
  伪造 READ_WRITE 会话四步利用链, 武器化门槛公开化
- 同批 KEV watchlist: CVE-2026-93952 Arista VeloCloud (10.0), CVE-2026-94127 F5 BIG-IP APM
- 文件: intel/kev_2026-09-22_checkpoint.jsonl（CVE 明细）+ kev_2026-09-22_checkpoint_index.json
 （索引+缓解+猎杀 quickref）；证据: gap_workspaces/gap-20260926-001/evidence/（CISA KEV JSON
 + FIRST EPSS 一手仲裁 + 三家第三方全文, 机械闸门 3/3 PASS）
