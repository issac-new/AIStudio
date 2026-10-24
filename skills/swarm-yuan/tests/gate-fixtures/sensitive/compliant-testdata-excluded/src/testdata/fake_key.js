// 测试固件（七轮复盘误报回归锁）：测试用假密钥，**不应**被报为硬编码密钥泄露。
// 真实案例：gin 项目的 context_test.go / testdata/certificate/key.pem 被 gitleaks 路径误报，
// 而内置正则路径有 test/mock 排除（gates-warn.sh:157）——同一门禁两条路径判定标准不一致。
const testAPIKey = "sk-test0000000000000000000000";
module.exports = { testAPIKey };
