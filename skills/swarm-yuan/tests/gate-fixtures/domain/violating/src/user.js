// 违例样本：密码明文存储（违反安全客观规律——密码必须哈希，不可明文）
function createUser(input) {
  const user = { name: input.name, password: "abc123456" };
  return saveUser(user);
}

module.exports = { createUser };
