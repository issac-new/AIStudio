// 合规模本：参数化查询（无字符串拼接），无 eval / new Function，密钥走环境变量
function findUser(req, db) {
  const sql = "SELECT * FROM users WHERE name = ?";
  return db.query(sql, [req.query.name]);
}

// R106-D13 豁免形态锁：拼接只发生在 ? 绑定值实参位（SQL 字面量本身是常量）——
// GORM Where("... LIKE ?", "%"+name+"%") 同款写法，曾被子查询关键字误判注入
function searchOrders(db, name) {
  return db.query("SELECT * FROM orders WHERE title LIKE ?", ["%" + name + "%"]);
}

function loadConfig() {
  return { apiKey: process.env.API_KEY };
}

module.exports = { findUser, searchOrders, loadConfig };

// R108-D4 豁免形态锁：HTTP 动词 method:'DELETE' + 模板字面量 ${} 同行——
// 前端 REST 层标准写法（文件零 SQL），曾被 SQL 注入启发式误判 fail（rust-forge api.js 实证）
const BASE = '/api'
export async function removeUser(id) {
  return fetch(`${BASE}/users/${id}`, { method: 'DELETE' })
}
export async function promoteUser(id) {
  return fetch(`${BASE}/users/${id}`, { method: 'PUT', body: JSON.stringify({ role: 'admin' }) })
}
