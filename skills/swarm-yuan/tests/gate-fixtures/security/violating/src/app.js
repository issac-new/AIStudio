// 违例样本：SQL 字符串拼接（§1 硬 fail）+ eval 动态执行（§3 硬 fail）
function findUser(req, db) {
  const userInput = req.query.name;
  const sql = "SELECT * FROM users WHERE name = '" + userInput + "'";
  return db.query(sql);
}

function runSnippet(req) {
  const code = req.query.code;
  return eval(code);
}

module.exports = { findUser, runSnippet };
