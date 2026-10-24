// 合规模本：密钥全部走环境变量注入，源码无任何硬编码
const API_KEY = process.env.API_KEY;
module.exports = { API_KEY };
