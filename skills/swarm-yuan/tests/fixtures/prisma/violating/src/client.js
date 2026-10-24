// violating fixture：log: ['query'] 全量查询日志 → fw_prisma_query_log(warn)
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

module.exports = { prisma };
