// 测试文件后缀模式（_test / .test / .spec）的假密钥——同样不应被报。
// 与 testdata/ 目录模式互补，覆盖两类测试路径约定。
const mockToken = "sk-mock1111111111111111111111";
module.exports = { mockToken };
