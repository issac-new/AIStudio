// violating fixture：
//  - $queryRawUnsafe 字符串拼接 → fw_prisma_queryraw_injection(fail)
//  - for 循环内 await prisma.* → fw_prisma_n1_loop(warn)
//  - $transaction 无 timeout → fw_prisma_transaction_timeout(warn)
//  - $use 中间件（v7 已移除）→ fw_prisma_middleware_removed(warn)
const { prisma } = require('./client');

async function searchUsers(name) {
  // SQL 注入面：字符串拼接进原始查询
  return prisma.$queryRawUnsafe('SELECT * FROM "User" WHERE name = \'' + name + '\'');
}

async function getUsersWithPosts() {
  const users = await prisma.user.findMany();
  const result = [];
  // 循环内逐用户查 posts —— 经典 N+1
  for (const u of users) {
    const posts = await prisma.post.findMany({ where: { authorId: u.id } });
    result.push({ ...u, posts });
  }
  return result;
}

async function transfer(fromId, toId, amount) {
  // 交互式事务未配 timeout/maxWait（默认 5s）
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: fromId }, data: { balance: { decrement: amount } } });
    await tx.account.update({ where: { id: toId }, data: { balance: { increment: amount } } });
  });
}

// v7 已移除的中间件 API
prisma.$use(async (params, next) => {
  console.log('query', params.model, params.action);
  return next(params);
});

module.exports = { searchUsers, getUsersWithPosts, transfer };
