// 合规模本：密码只落哈希值（无明文存储），查询参数化
function createUser(input, hashPassword) {
  const user = { name: input.name, passwordHash: hashPassword(input.rawSecret) };
  return saveUser(user);
}

function findUser(db, name) {
  return db.query("SELECT * FROM users WHERE name = ?", [name]);
}

module.exports = { createUser, findUser };
