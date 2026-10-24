// compliant fixture：
//  - $queryRaw tagged template（插值自动参数化，防注入）
//  - include 单查取关联（无 N+1 循环）
//  - $transaction 显式 timeout/maxWait
const { prisma } = require('./client');

async function searchUsers(name) {
  // tagged template：${name} 被参数化为绑定变量
  return prisma.$queryRaw`SELECT * FROM "User" WHERE name = ${name}`;
}

async function getUsersWithPosts() {
  // 单次查询 include 取关联，select 裁剪字段
  return prisma.user.findMany({
    include: { posts: true },
  });
}

async function transfer(fromId, toId, amount) {
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } });
    await tx.account.update({ where: { id: toId }, data: { balance: { increment: amount } } });
  }, {
    maxWait: 5000,
    timeout: 15000,
  });
}

module.exports = { searchUsers, getUsersWithPosts, transfer };
