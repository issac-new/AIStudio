// compliant fixture：生产日志收敛 warn/error；软删除经 Client Extensions $extends（v7 无 $use）
const { PrismaClient } = require('@prisma/client');

const base = new PrismaClient({
  log: ['warn', 'error'],
});

const prisma = base.$extends({
  query: {
    user: {
      async delete({ model, operation, args, query }) {
        // 软删除：delete 转 update 置 deletedAt
        return base.user.update({ ...args, data: { deletedAt: new Date() } });
      },
    },
  },
});

module.exports = { prisma };
