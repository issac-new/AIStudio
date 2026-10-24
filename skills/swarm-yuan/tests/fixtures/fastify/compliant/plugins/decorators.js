// compliant fixture 插件：fastify-plugin 包裹打破封装，装饰器全局共享；
// 请求级装饰器默认 null（勿用对象字面量共享引用）
const fp = require('fastify-plugin');

async function decoratorPlugin (fastify, opts) {
  fastify.decorate('now', () => Date.now());
  fastify.decorateRequest('currentUser', null);

  // 认证装饰器：路由经 preHandler 调用
  fastify.decorate('authenticate', async (request, reply) => {
    if (!request.headers.authorization) {
      const err = new Error('unauthorized');
      err.statusCode = 401;
      throw err;
    }
  });
}

module.exports = fp(decoratorPlugin);
